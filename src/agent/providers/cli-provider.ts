/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * CliProvider -- wraps the locally-installed `claude` and `codex` CLI
 * binaries behind the `LLMProvider` interface.
 *
 * Rationale: the cleanup replaced four direct cloud REST providers
 * (Anthropic, OpenAI, Gemini, Mistral) with two local subprocess
 * invocations. Auth and quota are owned by the local CLI's OAuth
 * session; structured output is delegated to the CLI's native
 * `--json-schema` (claude) or `--output-schema` (codex) flag.
 *
 *   - claude --print --output-format json --json-schema '<inline>'
 *     envelope.structured_output is the parsed, schema-validated
 *     payload. We never have to JSON.parse the `result` text.
 *   - codex exec --output-schema <tmpfile> --json
 *     JSONL stream; the `item.completed` event's `item.text` is the
 *     JSON payload. We JSON.parse it ourselves.
 *
 * Embeddings are delegated to whatever `embedDelegate` is provided
 * (typically an Ollama provider) since neither CLI exposes embeddings.
 *
 * Capabilities reflect the actual surface:
 *   - structuredOutput: true  (both CLIs enforce a JSON Schema)
 *   - toolCalling:      false (the CLI runs tools internally; we don't
 *                              expose them to the caller via this surface)
 *   - vision:           false (deferred until a use case lands)
 *   - webSearch:        false
 *   - streaming:        false (collect-then-return; subprocess overhead
 *                              makes per-token streaming over MCP not
 *                              worth the complexity for v1)
 *   - embeddings:       depends on whether embedDelegate is wired
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
	CompletionOpts,
	LLMMessage,
	LLMProvider,
	LLMResponse,
	ProviderCapabilities,
	StructuredCompletionOpts,
	StructuredSchema,
} from '../../shared/types.js';
import { getLogger } from '../../shared/logger.js';

const log = getLogger('cli-provider');


// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export type CliKind = 'claude' | 'codex';

export interface CliProviderOpts {
	readonly kind: CliKind;
	/** Default model name passed via `--model`. Optional; the CLI's own default applies when absent. */
	readonly model?: string | undefined;
	/** Override the binary path. Production paths look up the bin on PATH. */
	readonly binPath?: string | undefined;
	/** Hard cap on per-invocation wall-clock. Default 120s. */
	readonly timeoutMs?: number | undefined;
	/** Provider that handles `embed()`. Usually an Ollama provider. */
	readonly embedDelegate?: Pick<LLMProvider, 'embed' | 'capabilities'> | undefined;
}


export class CliProvider implements LLMProvider {
	readonly supportsTools = false;

	private readonly kind: CliKind;
	private readonly defaultModel: string | undefined;
	private readonly binPath: string;
	private readonly timeoutMs: number;
	private readonly embedDelegate: Pick<LLMProvider, 'embed' | 'capabilities'> | undefined;

	readonly capabilities: ProviderCapabilities;

	constructor(opts: CliProviderOpts) {
		this.kind = opts.kind;
		this.defaultModel = opts.model;
		this.binPath = opts.binPath ?? opts.kind;
		this.timeoutMs = opts.timeoutMs ?? 120_000;
		this.embedDelegate = opts.embedDelegate;
		this.capabilities = {
			structuredOutput: true,
			toolCalling: false,
			vision: false,
			webSearch: false,
			streaming: false,
			embeddings: opts.embedDelegate !== undefined,
		};
	}


	// -- complete -------------------------------------------------------

	async complete(messages: LLMMessage[], opts?: CompletionOpts): Promise<LLMResponse> {
		const prompt = serialiseMessages(messages);
		if (this.kind === 'claude') {
			const args = ['--print', '--output-format', 'json', ...this.modelArgs(opts)];
			const { envelope } = await this.runClaude(args, prompt);
			return {
				text: envelope.result ?? '',
				stopReason: 'end_turn',
			};
		}
		const args = ['exec', '--json', ...this.modelArgs(opts)];
		const { agentText } = await this.runCodex(args, prompt);
		return {
			text: agentText ?? '',
			stopReason: 'end_turn',
		};
	}


	// -- completeStructured ---------------------------------------------

	async completeStructured<T>(
		messages: LLMMessage[],
		schema: StructuredSchema,
		opts?: StructuredCompletionOpts,
	): Promise<T> {
		const prompt = serialiseMessages(messages);
		if (this.kind === 'claude') {
			const args = [
				'--print',
				'--output-format', 'json',
				'--json-schema', JSON.stringify(schema),
				...this.modelArgs(opts),
			];
			const { envelope } = await this.runClaude(args, prompt);
			if (envelope.is_error) {
				throw new Error(`claude --print failed: ${envelope.result ?? 'no error message'}`);
			}
			if (envelope.structured_output === undefined) {
				throw new Error('claude envelope had is_error=false but no structured_output field');
			}
			return envelope.structured_output as T;
		}
		// codex
		const tmpDir = mkdtempSync(join(tmpdir(), 'codex-schema-'));
		try {
			const schemaPath = join(tmpDir, 'schema.json');
			writeFileSync(schemaPath, JSON.stringify(schema));
			const args = ['exec', '--output-schema', schemaPath, '--json', ...this.modelArgs(opts)];
			const { agentText } = await this.runCodex(args, prompt);
			if (agentText === undefined) {
				throw new Error('codex emitted no agent_message item');
			}
			try {
				return JSON.parse(agentText) as T;
			} catch (err) {
				throw new Error(`codex agent_message.text was not parseable JSON: ${(err as Error).message}. text=${agentText.slice(0, 300)}`);
			}
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	}


	// -- stream ---------------------------------------------------------

	stream(messages: LLMMessage[], opts?: CompletionOpts): AsyncIterable<string> {
		// Subprocess overhead + JSON envelope reassembly makes per-token
		// streaming impractical for v1. We collect the full response and
		// yield it as a single chunk.
		const self = this;
		async function* gen(): AsyncIterable<string> {
			const response = await self.complete(messages, opts);
			yield response.text;
		}
		return gen();
	}


	// -- embed ----------------------------------------------------------

	async embed(text: string): Promise<number[]> {
		if (this.embedDelegate === undefined) {
			throw new Error('cli-provider: embed() requires an embedDelegate (typically an Ollama provider); none was supplied at construction');
		}
		return this.embedDelegate.embed(text);
	}


	// -- internals ------------------------------------------------------

	private modelArgs(opts?: CompletionOpts | StructuredCompletionOpts): string[] {
		const model = this.defaultModel;
		if (model === undefined || model.length === 0) return [];
		// Both binaries support `--model <name>` / `-m <name>`. Use the long
		// form for parity. `opts` is reserved for future per-call model
		// overrides; currently the caller picks the model via the provider's
		// default at construction time (which the model-class router on the
		// caller side resolves before constructing the provider).
		void opts;
		return ['--model', model];
	}


	private runClaude(args: readonly string[], prompt: string): Promise<{ envelope: ClaudeEnvelope }> {
		return new Promise((resolve, reject) => {
			const r = runSubprocess(this.binPath, args, prompt, this.timeoutMs);
			r.then(out => {
				if (out.exitCode !== 0) {
					return reject(new Error(`claude exited with ${out.exitCode}. stderr=${out.stderr.slice(0, 300)} stdout=${out.stdout.slice(0, 600)}`));
				}
				let envelope: ClaudeEnvelope;
				try { envelope = JSON.parse(out.stdout) as ClaudeEnvelope; }
				catch (err) {
					return reject(new Error(`claude stdout was not parseable JSON envelope: ${(err as Error).message}. stdout=${out.stdout.slice(0, 500)}`));
				}
				log.debug({ duration_ms: envelope.duration_ms, model: Object.keys(envelope.modelUsage ?? {})[0] ?? null }, 'claude completed');
				resolve({ envelope });
			}, reject);
		});
	}


	private async runCodex(args: readonly string[], prompt: string): Promise<{ events: readonly CodexEvent[]; agentText: string | undefined }> {
		const out = await runSubprocess(this.binPath, args, prompt, this.timeoutMs);
		const events: CodexEvent[] = [];
		for (const line of out.stdout.split('\n')) {
			const trimmed = line.trim();
			if (trimmed.length === 0) continue;
			try { events.push(JSON.parse(trimmed) as CodexEvent); }
			catch { /* skip non-JSON lines (codex sometimes emits prologue) */ }
		}
		const errorEvent = events.find(e => e.type === 'error' || e.type === 'turn.failed');
		if (errorEvent !== undefined) {
			throw new Error(`codex emitted error event: ${JSON.stringify(errorEvent)}`);
		}
		if (out.exitCode !== 0) {
			throw new Error(`codex exited with ${out.exitCode}. stderr=${out.stderr.slice(0, 300)}`);
		}
		const agentMsg = events.find(e => e.type === 'item.completed' && e.item?.type === 'agent_message');
		log.debug({ exitCode: out.exitCode, eventCount: events.length, hasAgentMessage: agentMsg !== undefined }, 'codex completed');
		return { events, agentText: agentMsg?.item?.text };
	}
}


// ---------------------------------------------------------------------------
// Message serialisation
// ---------------------------------------------------------------------------

/**
 * Flatten an LLMMessage[] into a single prompt string for stdin. The CLI
 * binaries expect a plain-text prompt; the role distinction is
 * approximated by simple section headers. System prompts go first
 * separated by a blank line; user turns are concatenated next.
 */
function serialiseMessages(messages: readonly LLMMessage[]): string {
	const parts: string[] = [];
	for (const m of messages) {
		const content = typeof m.content === 'string'
			? m.content
			: m.content.map(b => 'text' in b ? b.text : '').join('');
		if (m.role === 'system') {
			parts.push(`## System\n${content}`);
		} else if (m.role === 'assistant') {
			parts.push(`## Assistant\n${content}`);
		} else {
			parts.push(content);
		}
	}
	return parts.join('\n\n');
}


// ---------------------------------------------------------------------------
// Subprocess helper
// ---------------------------------------------------------------------------

interface SubprocessResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
	readonly durationMs: number;
}

function runSubprocess(
	command: string,
	args: readonly string[],
	stdin: string,
	timeoutMs: number,
): Promise<SubprocessResult> {
	return new Promise(resolve => {
		const start = Date.now();
		const child = spawn(command, [...args], { stdio: ['pipe', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
		child.stdout.on('data', (c: Buffer) => { stdout += c.toString(); });
		child.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
		child.on('error', err => {
			clearTimeout(timer);
			resolve({ stdout, stderr: stderr + `\nspawn error: ${(err as Error).message}`, exitCode: -1, durationMs: Date.now() - start });
		});
		child.on('close', exitCode => {
			clearTimeout(timer);
			resolve({ stdout, stderr, exitCode: timedOut ? -9 : (exitCode ?? -1), durationMs: Date.now() - start });
		});
		child.stdin.end(stdin);
	});
}


// ---------------------------------------------------------------------------
// CLI envelope / event types (subset of what the binaries emit; only
// the fields we read)
// ---------------------------------------------------------------------------

interface ClaudeEnvelope {
	readonly type: string;
	readonly subtype?: string;
	readonly is_error: boolean;
	readonly result?: string;
	readonly structured_output?: unknown;
	readonly duration_ms?: number;
	readonly total_cost_usd?: number;
	readonly modelUsage?: Record<string, unknown>;
}

interface CodexEvent {
	readonly type: string;
	readonly item?: { readonly type?: string; readonly text?: string };
	readonly error?: { readonly message?: string };
	readonly message?: string;
}
