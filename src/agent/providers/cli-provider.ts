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

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
import { runInProcessGroup } from '../../shared/process-group.js';
import { rootUnionKey } from './structured-output.js';

const log = getLogger('cli-provider');


// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export type CliKind = 'claude' | 'codex';

/** Options for an agentic free-form EDITING session (`runEditSession`).
 *  Unlike `complete`/`completeStructured` — which are one-shot text/JSON
 *  turns — this spawns the CLI binary with the repo as its working
 *  directory and file-edit permissions, so `claude`/`codex` can actually
 *  modify files on disk during the turn. */
export interface EditSessionOpts {
	/** The repo root the CLI runs inside; its entire edit blast radius. */
	readonly cwd:        string;
	/** Per-session wall-clock cap. Defaults to the provider's `timeoutMs`. */
	readonly timeoutMs?: number | undefined;
}

/** Options for {@link CliProvider.runReviewSession}. */
export interface ReviewSessionOpts {
	/** The repo root the CLI runs inside. */
	readonly cwd:        string;
	/** Time allowed for the whole call, its one possible retry included. */
	readonly deadlineMs: number;
}

/** A reviewer session ran past the time it was given. Never retried. */
export class ReviewSessionTimeoutError extends Error {
	constructor(readonly deadlineMs: number) {
		super(`review session passed its time limit of ${Math.round(deadlineMs / 1000)}s`);
		this.name = 'ReviewSessionTimeoutError';
	}
}

/** The built-in tools a reviewer session may use: reading only. */
export const REVIEW_SESSION_READ_TOOLS: readonly string[] = ['Read', 'Grep', 'Glob'];
/** The insrc analyze tools a reviewer session may call for drill-down. */
export const REVIEW_SESSION_ANALYZE_TOOLS: readonly string[] = ['mcp__insrc__insrc_analyze', 'mcp__insrc__insrc_analyze_step'];

/** claude arguments for a reviewer session. `--tools` restricts the built-in
 *  tools to reading, so nothing that can write or run a command exists in the
 *  session at all; no `--permission-mode` is passed. */
export function claudeReviewSessionArgs(schema: StructuredSchema, modelArgs: readonly string[]): string[] {
	return [
		'--print',
		'--output-format', 'json',
		'--json-schema', JSON.stringify(schema),
		'--tools', REVIEW_SESSION_READ_TOOLS.join(','),
		'--allowedTools', [...REVIEW_SESSION_READ_TOOLS, ...REVIEW_SESSION_ANALYZE_TOOLS].join(','),
		...modelArgs,
	];
}

/** codex arguments for a reviewer session: a read-only sandbox, never `--full-auto`. */
export function codexReviewSessionArgs(schemaPath: string, cwd: string, modelArgs: readonly string[]): string[] {
	return ['exec', '--output-schema', schemaPath, '--json', '--sandbox', 'read-only', '-C', cwd, ...modelArgs];
}

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
	/** The `--model` id this provider forwards to the CLI, or undefined when it
	 *  lets the CLI use its own default. Public for logging + testability. */
	readonly defaultModel: string | undefined;
	private readonly binPath: string;
	private readonly timeoutMs: number;
	private readonly embedDelegate: Pick<LLMProvider, 'embed' | 'capabilities'> | undefined;

	readonly capabilities: ProviderCapabilities;

	constructor(opts: CliProviderOpts) {
		this.kind = opts.kind;
		this.defaultModel = opts.model;
		this.binPath = opts.binPath ?? opts.kind;
		// 10 min default: agentic `claude`/`codex --print` calls that generate a
		// full artifact or a deep analyze bundle routinely exceed the old 120 s
		// (which SIGKILLed legit-but-slow syntheses). Callers can still tighten it.
		this.timeoutMs = opts.timeoutMs ?? 600_000;
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
		return this.withTransientRetry('complete', async () => {
			const prompt = serialiseMessages(messages);
			if (this.kind === 'claude') {
				const args = ['--print', '--output-format', 'json', ...this.modelArgs(opts)];
				const { envelope } = await this.runClaude(args, prompt, this.execIn(opts?.cwd));
				return {
					text: envelope.result ?? '',
					stopReason: 'end_turn' as const,
				};
			}
			const args = ['exec', '--json', ...this.modelArgs(opts)];
			const { agentText } = await this.runCodex(args, prompt, this.execIn(opts?.cwd));
			return {
				text: agentText ?? '',
				stopReason: 'end_turn' as const,
			};
		});
	}


	/** Re-issue a CLI call when it fails with a TRANSIENT upstream error —
	 *  the `claude`/`codex` binary's own connection to the model API dropped
	 *  mid-response, hit a rate limit, or got a 5xx. These are not our bug and
	 *  not fixable by changing the prompt, so a fresh subprocess usually
	 *  succeeds. Deterministic failures (bad schema, non-transient exit) are
	 *  re-thrown on the first attempt. Accuracy over cost: a long synthesize is
	 *  worth re-running rather than failing the whole workflow. */
	private async withTransientRetry<T>(label: string, op: () => Promise<T>): Promise<T> {
		const maxAttempts = 3;
		let lastErr: unknown;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				return await op();
			} catch (err) {
				lastErr = err;
				const msg = err instanceof Error ? err.message : String(err);
				if (attempt >= maxAttempts || !isTransientCliError(msg)) throw err;
				const backoffMs = 2000 * attempt;
				log.warn(
					{ provider: this.kind, attempt, maxAttempts, backoffMs, err: msg.slice(0, 200) },
					`${label}: transient CLI error; retrying after backoff`,
				);
				await delay(backoffMs);
			}
		}
		throw lastErr;
	}


	// -- completeStructured ---------------------------------------------

	async completeStructured<T>(
		messages: LLMMessage[],
		schema: StructuredSchema,
		opts?: StructuredCompletionOpts,
	): Promise<T> {
		// Pre-flight the schema root BEFORE the retry wrapper is entered.
		//
		// The placement is load-bearing, not stylistic. `withTransientRetry`
		// decides retryability by STRING MATCH on the message via
		// `isTransientCliError`, so a deterministic rejection raised INSIDE the
		// wrapper would be re-spawned three times the moment its wording
		// happened to brush that pattern. Throwing outside the wrapper makes
		// non-retryability structural rather than contingent on error prose.
		// (The message is also written to avoid that vocabulary, as a second
		// defence that survives a future relocation.)
		const unionKey = rootUnionKey(schema);
		if (unionKey !== undefined) {
			throw new Error(
				`structured-output: the schema ROOT carries '${unionKey}'. Both `
				+ `'claude --json-schema' and 'codex --output-schema' refuse a `
				+ `oneOf/anyOf/allOf at the top level, whether or not a root `
				+ `'type' is present. This is about what a CLI provider will `
				+ `ACCEPT, not about the schema being well-formed — `
				+ `validateAgainstSchema still accepts it locally, which is why `
				+ `the same schema can validate here and be refused upstream. `
				+ `Wrap the union under one object property at the call site: `
				+ `{ type: 'object', properties: { <field>: <the union> }, `
				+ `required: ['<field>'] }. A union BELOW the root is fine.`,
			);
		}
		return this.withTransientRetry('completeStructured', () => this.completeStructuredOnce<T>(messages, schema, opts));
	}

	private async completeStructuredOnce<T>(
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
			const { envelope } = await this.runClaude(args, prompt, this.execIn(opts?.cwd));
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
			const { agentText } = await this.runCodex(args, prompt, this.execIn(opts?.cwd));
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


	// -- runEditSession -------------------------------------------------

	/**
	 * Run ONE agentic free-form editing session: spawn the `claude`/`codex`
	 * binary with `opts.cwd` as its working directory and file-edit
	 * permissions, feed `prompt` on stdin, and return the session's
	 * free-form summary text as an `LLMResponse`.
	 *
	 * This is the surface the build stage's `TaskImplementerAdapter` (sc5)
	 * drives — the design's k8/k9 UNPROVEN finding resolved: the existing
	 * `complete()`/`completeStructured()` are one-shot `--print` text/JSON
	 * turns that DO NOT grant the CLI file-edit permission, so a new
	 * capability was required. It stays within CLAUDE.md's sanctioned cloud
	 * path — the local CLI binary is spawned exactly like every other call
	 * (`runSubprocess`), auth/quota stay with the CLI's OAuth session, and
	 * NO direct REST client is introduced.
	 *
	 * Permission flags are best-effort per CLI version:
	 *   - claude: `--permission-mode acceptEdits` (auto-accept file edits).
	 *   - codex:  `--full-auto` (workspace-write sandbox, no approvals).
	 * The daemon runs the tests + tree diff ITSELF (the verifier), so the
	 * session's edits are advisory input to that diff, never the advance
	 * decision.
	 */
	async runEditSession(prompt: string, opts: EditSessionOpts): Promise<LLMResponse> {
		return this.withTransientRetry('runEditSession', async () => {
			const exec = { cwd: opts.cwd, timeoutMs: opts.timeoutMs ?? this.timeoutMs };
			if (this.kind === 'claude') {
				const args = ['--print', '--output-format', 'json', '--permission-mode', 'acceptEdits', ...this.modelArgs()];
				const { envelope } = await this.runClaude(args, prompt, exec);
				if (envelope.is_error) {
					throw new Error(`claude edit session failed: ${envelope.result ?? 'no error message'}`);
				}
				return { text: envelope.result ?? '', stopReason: 'end_turn' as const };
			}
			const args = ['exec', '--json', '--full-auto', ...this.modelArgs()];
			const { agentText } = await this.runCodex(args, prompt, exec);
			return { text: agentText ?? '', stopReason: 'end_turn' as const };
		});
	}


	// -- runReviewSession -----------------------------------------------

	/**
	 * Run ONE read-only reviewer session: the CLI starts in `opts.cwd` with
	 * tools limited to reading the repo and to the insrc analyze tools, cannot
	 * edit anything, and returns an answer checked against `schema`.
	 *
	 * The read-only sibling of {@link runEditSession}, used by the design-review
	 * template (LLD-f2f08ccf89f8ab25-S001). Both CLIs do this in a single run —
	 * probed live on 2026-10-05:
	 *   - claude: `--tools Read,Grep,Glob` leaves no built-in tool that can write,
	 *     `--allowedTools` admits the two insrc analyze tools, and `--json-schema`
	 *     still yields `structured_output` after tool use.
	 *   - codex:  `--sandbox read-only` refuses writes, its registered insrc MCP
	 *     server is callable, and `--output-schema` shapes the final message.
	 *
	 * `opts.deadlineMs` is the time allowed for THIS call, retry included. Unlike
	 * every other call on this provider it is NOT wrapped in the three-attempt
	 * transient retry: a transient CLI error is retried at most once, and only
	 * with the time that remains. Passing the deadline throws
	 * {@link ReviewSessionTimeoutError}, which is never retried.
	 */
	async runReviewSession<T>(prompt: string, schema: StructuredSchema, opts: ReviewSessionOpts): Promise<T> {
		const startedAt = Date.now();
		for (let attempt = 1; ; attempt++) {
			const remainingMs = opts.deadlineMs - (Date.now() - startedAt);
			if (remainingMs <= 0) throw new ReviewSessionTimeoutError(opts.deadlineMs);
			try {
				return await this.reviewSessionOnce<T>(prompt, schema, { cwd: opts.cwd, timeoutMs: remainingMs });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				// The subprocess runner reports its own kill as exit code -9.
				if (/exited with -9\b/.test(msg)) throw new ReviewSessionTimeoutError(opts.deadlineMs);
				if (attempt >= 2 || !isTransientCliError(msg)) throw err;
				log.warn({ provider: this.kind, err: msg.slice(0, 200) }, 'runReviewSession: transient CLI error; retrying once inside the remaining time');
			}
		}
	}

	private async reviewSessionOnce<T>(prompt: string, schema: StructuredSchema, exec: { cwd: string; timeoutMs: number }): Promise<T> {
		if (this.kind === 'claude') {
			const { envelope } = await this.runClaude(claudeReviewSessionArgs(schema, this.modelArgs()), prompt, exec);
			if (envelope.is_error) {
				throw new Error(`claude review session failed: ${envelope.result ?? 'no error message'}`);
			}
			if (envelope.structured_output === undefined) {
				throw new Error('claude review session returned no structured_output');
			}
			return envelope.structured_output as T;
		}
		const tmpDir = mkdtempSync(join(tmpdir(), 'codex-review-schema-'));
		try {
			const schemaPath = join(tmpDir, 'schema.json');
			writeFileSync(schemaPath, JSON.stringify(schema));
			const { events } = await this.runCodex(codexReviewSessionArgs(schemaPath, exec.cwd, this.modelArgs()), prompt, exec);
			// A tool-using run narrates before it answers: the answer is the LAST message.
			const messages = events.filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message');
			const text = messages[messages.length - 1]?.item?.text;
			if (text === undefined) throw new Error('codex review session emitted no agent_message item');
			try {
				return JSON.parse(text) as T;
			} catch (err) {
				throw new Error(`codex review session answer was not parseable JSON: ${(err as Error).message}. text=${text.slice(0, 300)}`);
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


	/** The exec override for a one-shot call: run the CLI in `cwd` when the
	 *  caller names one, else no override, so the CLI inherits the daemon's
	 *  working directory exactly as before. */
	private execIn(cwd: string | undefined): ExecOverride | undefined {
		return cwd !== undefined ? { cwd, timeoutMs: this.timeoutMs } : undefined;
	}

	private runClaude(args: readonly string[], prompt: string, exec?: ExecOverride): Promise<{ envelope: ClaudeEnvelope }> {
		return new Promise((resolve, reject) => {
			const r = runSubprocess(this.binPath, args, prompt, exec?.timeoutMs ?? this.timeoutMs, exec?.cwd);
			r.then(out => {
				if (out.exitCode !== 0) {
					return reject(new Error(cliFailureMessage('claude', out.exitCode, out.stdout, out.stderr)));
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


	private async runCodex(args: readonly string[], prompt: string, exec?: ExecOverride): Promise<{ events: readonly CodexEvent[]; agentText: string | undefined }> {
		const out = await runSubprocess(this.binPath, args, prompt, exec?.timeoutMs ?? this.timeoutMs, exec?.cwd);
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
			throw new Error(cliFailureMessage('codex', out.exitCode, out.stdout, out.stderr));
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

/** Per-call overrides for the private `runClaude`/`runCodex` helpers — a
 *  working directory (edit sessions run inside the repo) and/or a tighter
 *  timeout. Absent fields fall back to the provider defaults. */
interface ExecOverride {
	readonly cwd?:       string | undefined;
	readonly timeoutMs?: number | undefined;
}

/** Await `ms` milliseconds. */
function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/** True when a CLI failure message looks like a TRANSIENT upstream error from
 *  the model API — a dropped connection, rate limit, overload, or 5xx — as
 *  opposed to a deterministic failure (bad args, unparseable schema). These
 *  are worth re-issuing on a fresh subprocess. The claude CLI surfaces the
 *  upstream text inside its envelope (`API Error: Connection closed
 *  mid-response`), which is echoed into our thrown message, so matching the
 *  string is sufficient. */
export function isTransientCliError(message: string): boolean {
	// The API's refusal of the request itself (a schema it rejects, a bad
	// argument, no permission) is the same on every attempt.
	if (/api error:\s*4(?!08|29)\d\d\b/i.test(message)) return false;
	return /connection closed mid-response|api error|overloaded|rate.?limit|too many requests|internal server error|service unavailable|timeout|\b(429|500|502|503|504|529)\b/i.test(message);
}

/** Above this length a CLI's output is not put in a message: it is written whole to a file the message names. */
export const CLI_OUTPUT_INLINE_CHARS = 2_000;

/**
 * The message for a CLI that exited with a non-zero code.
 *
 * It starts `<cli> exited with <code>.` (callers match on that) and then says
 * why, in the CLI's own words and in full. The claude CLI writes a JSON
 * envelope whose `result` holds the error text (the API's error, a usage
 * limit); that text is given first, so the cause is never behind the usage
 * figures that precede it in the envelope. The output itself is never cut:
 * up to CLI_OUTPUT_INLINE_CHARS it follows in the message; beyond that it is
 * written whole to a temporary file and the message names the file.
 */
export function cliFailureMessage(
	cli:      'claude' | 'codex',
	exitCode: number,
	stdout:   string,
	stderr:   string,
	dir:      string = join(tmpdir(), 'insrc-cli-failures'),
): string {
	const head = `${cli} exited with ${exitCode}.`;
	let said = '';
	try {
		const result = (JSON.parse(stdout) as { result?: unknown }).result;
		if (typeof result === 'string' && result.trim().length > 0) said = ` ${result.trim()}`;
	} catch { /* not an envelope: the output below is all there is */ }

	const output = `stderr=${stderr} stdout=${stdout}`;
	if (output.length <= CLI_OUTPUT_INLINE_CHARS) return `${head}${said} ${output}`;
	try {
		mkdirSync(dir, { recursive: true });
		const path = join(dir, `${cli}-exit-${randomUUID()}.txt`);
		writeFileSync(path, `--- stderr ---\n${stderr}\n--- stdout ---\n${stdout}\n`, 'utf8');
		return `${head}${said} The CLI's full output (${output.length} characters, nothing cut) is in ${path}`;
	} catch (err) {
		// The file could not be written: the output goes in the message, whole.
		log.warn({ dir, err: err instanceof Error ? err.message : String(err) }, 'CLI failure output could not be written to a file; it stays in the message');
		return `${head}${said} ${output}`;
	}
}

/** Resolve a bare CLI name (`claude`/`codex`) to its absolute path ONCE,
 *  memoized. Spawning the absolute path avoids per-spawn PATH resolution,
 *  which on macOS `posix_spawnp` can spuriously fail with ENOENT under many
 *  rapid spawns (a full workflow run fires 8+ CLI calls). Falls back to the
 *  bare name (PATH lookup at spawn) when `which` can't resolve it. */
const resolvedBinCache = new Map<string, string>();
function resolveBin(command: string): string {
	if (command.includes('/')) return command;                 // already an explicit path
	const cached = resolvedBinCache.get(command);
	if (cached !== undefined) return cached;
	let resolved = command;
	try {
		const out = execFileSync('which', [command], { encoding: 'utf8' }).trim().split('\n')[0];
		if (out !== undefined && out.length > 0) resolved = out;
	} catch { /* not on PATH via `which`; fall back to the bare name */ }
	resolvedBinCache.set(command, resolved);
	return resolved;
}

/** Run the CLI, retrying ONCE on a spurious spawn ENOENT (macOS posix_spawn
 *  race under load): drop the cached path + re-resolve + re-spawn. */
async function runSubprocess(
	command: string,
	args: readonly string[],
	stdin: string,
	timeoutMs: number,
	cwd?: string,
): Promise<SubprocessResult> {
	let result = await spawnOnce(resolveBin(command), args, stdin, timeoutMs, cwd);
	if (result.exitCode === -1 && /ENOENT/.test(result.stderr)) {
		resolvedBinCache.delete(command);
		result = await spawnOnce(resolveBin(command), args, stdin, timeoutMs, cwd);
	}
	return result;
}

/** One CLI run through the shared process-group runner: a timeout kills the
 *  whole group and reports exit code -9, and anything the CLI leaves running
 *  is killed when it exits (ISSUE-f1bf0fb3). */
async function spawnOnce(
	command: string,
	args: readonly string[],
	stdin: string,
	timeoutMs: number,
	cwd?: string,
): Promise<SubprocessResult> {
	const r = await runInProcessGroup(command, args, { stdin, timeoutMs, cwd });
	if (r.spawnError !== undefined) {
		return { stdout: r.stdout, stderr: r.stderr + `\nspawn error: ${r.spawnError}`, exitCode: -1, durationMs: r.durationMs };
	}
	return { stdout: r.stdout, stderr: r.stderr, exitCode: r.timedOut ? -9 : r.exitCode, durationMs: r.durationMs };
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
