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

import { serialiseMessages } from './cli-wire.js';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
	CompletionOpts,
	LLMMessage,
	LLMProvider,
	LLMResponse,
	ProviderCapabilities,
	ReviewSessionOpts,
	StructuredCompletionOpts,
	StructuredSchema,
} from '../../shared/types.js';
import type { TierEffort } from '../../config/analyze.js';
import { getLogger } from '../../shared/logger.js';
import { runInProcessGroup } from '../../shared/process-group.js';
import type { ProcessGroupOpts } from '../../shared/process-group.js';
import type { ReviewExecutionKind, ReviewProviderBudgetProfile } from '../../shared/review-budget.js';
import { freezeReviewBudgetProfile, REVIEW_BUDGET_DEFAULTS, ReviewBudgetError } from '../../workflow/review-pipeline/budget.js';
import { preflightProviderReviewBudget, reviewWireSchemaJson, reviewPromptChars } from './review-budget.js';
import { codexStrictSchema, rootUnionKey, validateCodexReply } from './structured-output.js';
import { ModelResponseShapeError } from './model-call-error.js';
import { InvestigationQualificationError } from './investigation-session.js';

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

/** Options for {@link CliProvider.runReviewSession}; declared with the provider interface. */
export type { ReviewSessionOpts } from '../../shared/types.js';

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

/**
 * The schema as codex's `--output-schema` file must hold it. codex runs output
 * schemas in strict mode, which refuses any object without
 * `additionalProperties: false` and a complete `required` list
 * (ISSUE-e48e33ae6af03720), and refuses some keywords outright
 * (ISSUE-487ad7a67474d321). The strict form is made on a copy, because callers
 * reuse constant schemas.
 */
function codexSchemaJson(schema: StructuredSchema): string {
	return JSON.stringify(codexStrictSchema(schema));
}

/** A parsed codex reply, held to the caller's FULL schema: the copy codex was
 *  given leaves out the keywords strict mode refuses (ISSUE-487ad7a67474d321). */
function codexReply<T>(schema: StructuredSchema, parsed: unknown, what: string): T {
	const checked = validateCodexReply<T>(schema, parsed);
	if (!checked.ok) {
		throw new ModelResponseShapeError(`${what} does not satisfy the caller's schema: ${checked.errors.join('; ')}`, checked.errors);
	}
	return checked.value;
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
	/** How long a codex run may show no model output before it is treated as stalled. Default CODEX_FIRST_OUTPUT_MS. */
	readonly codexFirstOutputMs?: number | undefined;
	/** Reasoning effort for every call: claude `--effort <e>`, codex `-c model_reasoning_effort=<e>`.
	 *  Absent: the CLI's own default. */
	readonly effort?: TierEffort | undefined;
	/** The model's input limit in characters, from the model definitions
	 *  (codex states its limit; claude's size refusal decides when absent). */
	readonly inputBudgetChars?: number | undefined;
}


/**
 * How long a codex reviewer session may show no model output (no event past
 * `thread.started` / `turn.started`) before it is treated as stalled and killed
 * (ISSUE-d4b2cd1c). Other codex calls are not watched.
 * A model normally starts answering within seconds; on 2026-10-19 two runs took
 * their prompt and then stayed silent until the 10-minute limit.
 */
export const CODEX_FIRST_OUTPUT_MS = 300_000;

/** An event codex prints once the model is producing output. */
const CODEX_MODEL_EVENT = /"type":"(?:item\.|turn\.completed|turn\.failed|error)/;

/** A CLI run that produced no model output in time and was killed; retryable as a fresh run. */
export class CliStallError extends Error {
	/** The codex session (thread id) of the silent run, when it printed one. */
	readonly sessionId: string | undefined;
	constructor(cli: string, silentMs: number, sessionId: string | undefined) {
		super(`${cli} stalled: no model output in ${Math.round(silentMs / 1000)} s${sessionId !== undefined ? ` (session ${sessionId})` : ''}; the run was killed`);
		this.name = 'CliStallError';
		this.sessionId = sessionId;
	}
}

export class CliProvider implements LLMProvider {
	readonly supportsTools = false;
	/** The model's input limit in characters, as the model definitions give it
	 *  (codex states its limit); absent, the CLI's size refusal decides
	 *  (ISSUE-aef82b03). */
	readonly inputBudgetChars: number | undefined;

	private readonly kind: CliKind;
	/** The `--model` id this provider forwards to the CLI, or undefined when it
	 *  lets the CLI use its own default. Public for logging + testability. */
	readonly defaultModel: string | undefined;
	/** The reasoning effort this provider forwards to the CLI, if any. */
	readonly effort: TierEffort | undefined;
	private readonly binPath: string;
	private readonly timeoutMs: number;
	private readonly codexFirstOutputMs: number;
	private readonly embedDelegate: Pick<LLMProvider, 'embed' | 'capabilities'> | undefined;

	readonly capabilities: ProviderCapabilities;

	constructor(opts: CliProviderOpts) {
		this.kind = opts.kind;
		this.inputBudgetChars = opts.inputBudgetChars;
		this.defaultModel = opts.model;
		this.effort = opts.effort;
		this.binPath = opts.binPath ?? opts.kind;
		// 10 min default: agentic `claude`/`codex --print` calls that generate a
		// full artifact or a deep analyze bundle routinely exceed the old 120 s
		// (which SIGKILLed legit-but-slow syntheses). Callers can still tighten it.
		this.timeoutMs = opts.timeoutMs ?? 600_000;
		this.codexFirstOutputMs = opts.codexFirstOutputMs ?? CODEX_FIRST_OUTPUT_MS;
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
		if (opts?.reviewBudget) throw new ReviewBudgetError('native-budget-unqualified');
		return this.withTransientRetry('complete', async () => {
			const prompt = serialiseMessages(messages);
			if (this.kind === 'claude') {
				const args = ['--print', '--output-format', 'json', ...this.modelArgs(opts)];
				const { envelope } = await this.runClaude(args, prompt, this.execIn(opts?.cwd, undefined, opts?.signal));
				return {
					text: envelope.result ?? '',
					stopReason: 'end_turn' as const,
				};
			}
			const args = ['exec', '--json', ...this.modelArgs(opts)];
			const { agentText } = await this.runCodex(args, prompt, this.execIn(opts?.cwd, undefined, opts?.signal));
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
	private async withTransientRetry<T>(label: string, op: () => Promise<T>, maxAttempts = 3): Promise<T> {
		let lastErr: unknown;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				return await op();
			} catch (err) {
				lastErr = err;
				// A size refusal is never resent, whatever its text looks like (ISSUE-aef82b03).
				if (err instanceof ReviewBudgetError || err instanceof InputTooLargeError) throw err;
				// A cancelled call ends at once; it is never retried (Epic 8315a11f s1).
				if (err instanceof ReviewBudgetError || isAbortError(err)) throw err;
				const msg = err instanceof Error ? err.message : String(err);
				if (attempt >= maxAttempts || !isTransientCliError(transienceText(err))) throw err;
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


	getReviewBudgetProfile(executionKind: Exclude<ReviewExecutionKind, 'controller'>): ReviewProviderBudgetProfile {
		return freezeReviewBudgetProfile({
			profileVersion: 1, providerId: `cli-${this.kind}:${this.defaultModel ?? 'default'}`,
			transport: this.kind, transportVersion: 'cli-review-v1', promptDialect: 'cli-text-v1',
			schemaDialect: this.kind === 'codex' ? 'codex-strict-v1' : 'json-v1',
			qualification: 'reserved-native',
			declaredToolsJson: JSON.stringify(executionKind === 'reviewer-session' && this.kind === 'claude'
				? { tools: REVIEW_SESSION_READ_TOOLS, allowedTools: [...REVIEW_SESSION_READ_TOOLS, ...REVIEW_SESSION_ANALYZE_TOOLS] } : []),
			nativeReserveTokens: REVIEW_BUDGET_DEFAULTS.nativeReserveTokens,
			transportReserveTokens: REVIEW_BUDGET_DEFAULTS.transportReserveTokens,
			completionReserveTokens: REVIEW_BUDGET_DEFAULTS.completionReserveTokens,
			inspectionReserveTokens: executionKind === 'reviewer-session' ? REVIEW_BUDGET_DEFAULTS.inspectionReserveTokens : 0,
		});
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
		return this.withTransientRetry('completeStructured', () => this.completeStructuredOnce<T>(messages, schema, opts), opts?.reviewBudget || opts?.internalRetry === false ? 1 : 3);
	}

	private async completeStructuredOnce<T>(
		messages: LLMMessage[],
		schema: StructuredSchema,
		opts?: StructuredCompletionOpts,
	): Promise<T> {
		const prompt = serialiseMessages(messages);
		const wireSchema = opts?.reviewBudget
			? reviewWireSchemaJson(this.getReviewBudgetProfile('structured'), schema)
			: this.kind === 'codex' ? codexSchemaJson(schema) : JSON.stringify(schema);
		if (opts?.reviewBudget) {
			preflightProviderReviewBudget(opts.reviewBudget, this.getReviewBudgetProfile('structured'), reviewPromptChars(this.getReviewBudgetProfile('structured'), messages), wireSchema, opts.maxTokens);
		}
		if (this.kind === 'claude') {
			const args = [
				'--print',
				'--output-format', 'json',
				'--json-schema', wireSchema,
				...this.modelArgs(opts),
			];
			const { envelope } = await this.runClaude(args, prompt, this.execIn(opts?.cwd, opts?.timeoutMs, opts?.signal, opts?.reviewBudget !== undefined));
			if (envelope.is_error) {
				if (opts?.reviewBudget) throw reviewCliError(envelope.result ?? '', 'review-cli-failed');
				const message = `claude --print failed: ${envelope.result ?? 'no error message'}`;
				throw sizeRefusalOr(message, envelope.result ?? '', () => new Error(message));
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
			writeFileSync(schemaPath, wireSchema);
			const args = ['exec', '--output-schema', schemaPath, '--json', ...this.modelArgs(opts)];
			const exec = this.execIn(opts?.cwd, opts?.timeoutMs, opts?.signal, opts?.reviewBudget !== undefined);
			const silence = opts?.stallMs !== undefined ? { ...exec, timeoutMs: exec?.timeoutMs ?? this.timeoutMs, stallMs: opts.stallMs } : exec;
			const { agentText } = await this.runCodex(args, prompt, silence);
			if (agentText === undefined) {
				throw new Error('codex emitted no agent_message item');
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(agentText);
			} catch (err) {
				if (opts?.reviewBudget) throw new ModelResponseShapeError('review-answer-invalid', ['Return one valid JSON object matching the supplied schema.']);
				throw new Error(`codex agent_message.text was not parseable JSON: ${(err as Error).message}. text=${agentText.slice(0, 300)}`);
			}
			return codexReply<T>(schema, parsed, 'codex answer');
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
		if (opts.investigationBinding !== undefined) throw new InvestigationQualificationError('Native investigation adapter is not installed; broad review fallback is forbidden.');
		const startedAt = Date.now();
		// internalRetry false: the caller re-issues, so this call makes one attempt only.
		const maxAttempts = opts.reviewBudget || opts.internalRetry === false ? 1 : 2;
		for (let attempt = 1; ; attempt++) {
			const remainingMs = opts.deadlineMs - (Date.now() - startedAt);
			if (remainingMs <= 0) throw new ReviewSessionTimeoutError(opts.deadlineMs);
			if (opts.reviewBudget) {
				const profile = this.getReviewBudgetProfile('reviewer-session');
				preflightProviderReviewBudget(opts.reviewBudget, profile, prompt.length, reviewWireSchemaJson(profile, schema));
			}
			try {
				return await this.reviewSessionOnce<T>(prompt, schema, {
					cwd: opts.cwd, timeoutMs: remainingMs, watchStall: true, reviewScoped: opts.reviewBudget !== undefined,
					...(opts.stallMs !== undefined ? { stallMs: opts.stallMs } : {}),
					...(opts.signal !== undefined ? { signal: opts.signal } : {}),
				});
			} catch (err) {
				if (isAbortError(err)) throw err;
				const msg = err instanceof Error ? err.message : String(err);
				// A run that never started answering (or, with stallMs, went silent) is
				// retried once, as a fresh run, inside the time that remains (ISSUE-d4b2cd1c).
				if (err instanceof CliStallError) {
					const what = opts.stallMs !== undefined ? 'the CLI printed nothing new within its silence limit' : 'the CLI produced no model output';
					log.warn((opts.reviewBudget ? { provider: this.kind, attempt, errorCode: 'stall' } : { provider: this.kind, attempt, codexSession: err.sessionId, err: msg }),
						`runReviewSession: ${what}; ${attempt < maxAttempts ? 'retrying once inside the remaining time' : 'giving up'}`);
					if (attempt < maxAttempts) continue;
					throw err;
				}
				// The subprocess runner reports its own kill as exit code -9.
				if (/exited with -9\b/.test(msg)) throw new ReviewSessionTimeoutError(opts.deadlineMs);
				if (attempt >= maxAttempts || !isTransientCliError(transienceText(err))) throw err;
				log.warn(opts.reviewBudget ? { provider: this.kind, errorCode: 'transient' } : { provider: this.kind, err: msg.slice(0, 200) }, 'runReviewSession: transient CLI error; retrying once inside the remaining time');
			}
		}
	}

	private async reviewSessionOnce<T>(prompt: string, schema: StructuredSchema, exec: ExecOverride & { cwd: string; timeoutMs: number; watchStall: boolean }): Promise<T> {
		if (this.kind === 'claude') {
			const { envelope } = await this.runClaude(claudeReviewSessionArgs(schema, this.modelArgs()), prompt, exec);
			if (envelope.is_error) {
				// A size refusal is classified as completeStructured classifies it, so the
				// pipeline re-divides the call instead of resending it (Epic 8315a11f s1).
				if (exec.reviewScoped) throw reviewCliError(envelope.result ?? '', 'review-cli-failed');
				const message = `claude review session failed: ${envelope.result ?? 'no error message'}`;
				throw sizeRefusalOr(message, envelope.result ?? '', () => new Error(message));
			}
			if (envelope.structured_output === undefined) {
				throw new Error('claude review session returned no structured_output');
			}
			return envelope.structured_output as T;
		}
		const tmpDir = mkdtempSync(join(tmpdir(), 'codex-review-schema-'));
		try {
			const schemaPath = join(tmpDir, 'schema.json');
			writeFileSync(schemaPath, codexSchemaJson(schema));
			const { agentText: text } = await this.runCodex(codexReviewSessionArgs(schemaPath, exec.cwd, this.modelArgs()), prompt, exec);
			if (text === undefined) throw new Error('codex review session emitted no agent_message item');
			let parsed: unknown;
			try {
				parsed = JSON.parse(text);
			} catch (err) {
				if (exec.reviewScoped) throw new ModelResponseShapeError('review-answer-invalid', ['Return one valid JSON object matching the supplied schema.']);
				throw new Error(`codex review session answer was not parseable JSON: ${(err as Error).message}. text=${text.slice(0, 300)}`);
			}
			return codexReply<T>(schema, parsed, 'codex review session answer');
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
		// Both binaries support `--model <name>` / `-m <name>`. Use the long
		// form for parity. `opts` is reserved for future per-call model
		// overrides; currently the caller picks the model via the provider's
		// default at construction time (which the model-class router on the
		// caller side resolves before constructing the provider).
		void opts;
		const modelArgs = model === undefined || model.length === 0 ? [] : ['--model', model];
		if (this.effort === undefined) return modelArgs;
		return [...modelArgs, ...(this.kind === 'claude' ? ['--effort', this.effort] : ['-c', `model_reasoning_effort=${this.effort}`])];
	}


	/** The exec override for a one-shot call: run the CLI in `cwd` when the
	 *  caller names one, with the caller's `timeoutMs` when it names one, else
	 *  no override, so the CLI inherits the daemon's working directory and the
	 *  provider's timeout exactly as before. */
	private execIn(cwd: string | undefined, timeoutMs?: number | undefined, signal?: AbortSignal | undefined, reviewScoped = false): ExecOverride | undefined {
		if (cwd === undefined && timeoutMs === undefined && signal === undefined && !reviewScoped) return undefined;
		return { reviewScoped, ...(cwd !== undefined ? { cwd } : {}), timeoutMs: timeoutMs ?? this.timeoutMs, ...(signal !== undefined ? { signal } : {}) };
	}

	private runClaude(args: readonly string[], prompt: string, exec?: ExecOverride): Promise<{ envelope: ClaudeEnvelope }> {
		return new Promise((resolve, reject) => {
			const r = runSubprocess(this.binPath, args, prompt, exec?.timeoutMs ?? this.timeoutMs, exec?.cwd, undefined, exec?.signal);
			r.then(out => {
				if (out.exitCode !== 0) {
					return reject(cliExitError('claude', out.exitCode, out.stdout, out.stderr, undefined, exec?.reviewScoped));
				}
				let envelope: ClaudeEnvelope;
				try { envelope = JSON.parse(out.stdout) as ClaudeEnvelope; }
				catch (err) {
					if (exec?.reviewScoped) return reject(new ModelResponseShapeError('review-envelope-invalid'));
					return reject(new Error(`claude stdout was not parseable JSON envelope: ${(err as Error).message}. stdout=${out.stdout.slice(0, 500)}`));
				}
				log.debug(exec?.reviewScoped ? { duration_ms: typeof envelope.duration_ms === 'number' ? envelope.duration_ms : undefined } : { duration_ms: envelope.duration_ms, model: Object.keys(envelope.modelUsage ?? {})[0] ?? null }, 'claude completed');
				resolve({ envelope });
			}, reject);
		});
	}


	private async runCodex(args: readonly string[], prompt: string, exec?: ExecOverride): Promise<{ events: readonly CodexEvent[]; agentText: string | undefined }> {
		const stall = exec?.stallMs !== undefined
			? { ms: exec.stallMs, started: () => false, silence: true }
			: exec?.watchStall === true ? { ms: this.codexFirstOutputMs, started: (stdout: string) => CODEX_MODEL_EVENT.test(stdout) } : undefined;
		const out = await runSubprocess(this.binPath, args, prompt, exec?.timeoutMs ?? this.timeoutMs, exec?.cwd, stall, exec?.signal);
		if (out.stalled === true) {
			throw new CliStallError('codex', stall?.ms ?? this.codexFirstOutputMs, /"thread_id":"([^"]+)"/.exec(out.stdout)?.[1]);
		}
		const events: CodexEvent[] = [];
		for (const line of out.stdout.split('\n')) {
			const trimmed = line.trim();
			if (trimmed.length === 0) continue;
			try { events.push(JSON.parse(trimmed) as CodexEvent); }
			catch { /* skip non-JSON lines (codex sometimes emits prologue) */ }
		}
		const errorEvents = events.filter(e => e.type === 'error' || e.type === 'turn.failed');
		const errorEvent = errorEvents[0];
		if (errorEvent !== undefined) {
			const message = `codex emitted error event: ${JSON.stringify(errorEvent)}`;
			// Classified on every error event and the error output, not only the first
			// event: a generic first event must not hide a size refusal behind it.
			const said = [...errorEvents.map(e => JSON.stringify(e)), out.stderr].join('\n');
			if (exec?.reviewScoped) throw reviewCliError(said, 'review-cli-failed');
			throw sizeRefusalOr(message, said, () => new Error(message));
		}
		if (out.exitCode !== 0) {
			throw cliExitError('codex', out.exitCode, out.stdout, out.stderr, undefined, exec?.reviewScoped);
		}
		// A tool-using run narrates before it answers: the answer is the LAST message.
		const agentMsg = events.filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message').at(-1);
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


// ---------------------------------------------------------------------------
// Subprocess helper
// ---------------------------------------------------------------------------

interface SubprocessResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
	readonly durationMs: number;
	/** The run showed no output within its stall limit and was killed. */
	readonly stalled?: boolean | undefined;
}

/** Per-call overrides for the private `runClaude`/`runCodex` helpers — a
 *  working directory (edit sessions run inside the repo) and/or a tighter
 *  timeout. Absent fields fall back to the provider defaults. */
interface ExecOverride {
	readonly reviewScoped?: boolean | undefined;
	readonly cwd?:       string | undefined;
	readonly timeoutMs?: number | undefined;
	/** Kill a codex run that shows no model output within the first-output limit
	 *  (CliStallError). Only the reviewer session asks for it (ISSUE-d4b2cd1c). */
	readonly watchStall?: boolean | undefined;
	/** Kill a codex run that prints nothing new for this long (CliStallError).
	 *  Set by a structured call or a reviewer session that passes `stallMs` (ISSUE-562b1bb5); takes
	 *  the place of `watchStall` when both are set. */
	readonly stallMs?: number | undefined;
	/** Cancels the run in flight: its process group is killed and AbortError thrown (Epic 8315a11f s1). */
	readonly signal?: AbortSignal | undefined;
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

/** Files of a CLI's failed output older than this are removed when the next one is written. */
export const CLI_FAILURE_FILE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A CLI exited with a non-zero code. `said` is what the CLI itself reported
 * as the reason: the `result` of the claude CLI's envelope when its output is
 * one, else its error output. Whether the failure is worth retrying is
 * decided on `said`, not on the whole message: the message can hold the
 * envelope's usage figures, and a number among them is not a status code.
 */
export class CliExitError extends Error {
	readonly said: string;

	constructor(message: string, said: string) {
		super(message);
		this.name = 'CliExitError';
		this.said = said;
	}
}

/**
 * The model refused the call because its input is too large (ISSUE-aef82b03).
 * Resending the same prompt cannot succeed, so no retry layer repeats it; the
 * caller splits the work instead. `maxChars` / `actualChars` are the sizes the
 * CLI reported, when it reported them. Its message is the one the failure
 * would have carried anyway.
 */
export class InputTooLargeError extends CliExitError {
	readonly maxChars:    number | undefined;
	readonly actualChars: number | undefined;

	constructor(message: string, said: string, sizes: InputSizes) {
		super(message, said);
		this.name = 'InputTooLargeError';
		this.maxChars = sizes.maxChars;
		this.actualChars = sizes.actualChars;
	}
}

/** The sizes an input-size refusal reported. */
export interface InputSizes {
	readonly maxChars?:    number | undefined;
	readonly actualChars?: number | undefined;
}

/** A number the refusal states for `key` (codex: `"max_chars":1048576`). */
function reportedNumber(text: string, key: string): number | undefined {
	// Backslashes dropped first: inside a re-serialised codex event the quotes arrive escaped.
	const m = new RegExp(`"?${key}"?\\s*[:=]\\s*(\\d+)`).exec(text.replace(/\\/g, ''));
	return m?.[1] !== undefined ? Number(m[1]) : undefined;
}

/**
 * Whether what a CLI said is a refusal of the input for its size, and the
 * sizes it reported. codex says `input_error_code: input_too_large` with
 * max_chars / actual_chars (observed 2026-10-18); claude's result is taken to
 * say "Prompt is too long" (not yet observed: ISSUE-aef82b03 smoke).
 */
export function classifyInputTooLarge(said: string): InputSizes | undefined {
	if (/input_too_large|input exceeds the maximum length/i.test(said)) {
		const stated = /maximum length of (\d+)/i.exec(said)?.[1];
		return {
			maxChars:    reportedNumber(said, 'max_chars') ?? (stated !== undefined ? Number(stated) : undefined),
			actualChars: reportedNumber(said, 'actual_chars'),
		};
	}
	if (/prompt is too long/i.test(said)) return {};
	return undefined;
}

/** The error a cancelled call throws: named AbortError, as fetch and the Ollama client name theirs. */
function abortError(): Error {
	const err = new Error('the call was cancelled');
	err.name = 'AbortError';
	return err;
}

function isAbortError(err: unknown): boolean {
	return err instanceof Error && err.name === 'AbortError';
}

/** The error for a CLI failure: an InputTooLargeError when `said` is a size refusal, else `plain()`. */
function sizeRefusalOr(message: string, said: string, plain: () => Error): Error {
	const sizes = classifyInputTooLarge(said);
	return sizes !== undefined ? new InputTooLargeError(message, said, sizes) : plain();
}

/** The text a failure is judged transient on: what the CLI said, where that is known. */
export function transienceText(err: unknown): string {
	if (err instanceof CliExitError && err.said.length > 0) return err.said;
	return err instanceof Error ? err.message : String(err);
}

/**
 * The error for a CLI that exited with a non-zero code.
 *
 * Its message starts `<cli> exited with <code>.` (callers match on that) and
 * then says why, in the CLI's own words and in full. The claude CLI writes a
 * JSON envelope whose `result` holds the error text (the API's error, a usage
 * limit); that text is given first, so the cause is never behind the usage
 * figures that precede it in the envelope. The output itself is never cut:
 * up to CLI_OUTPUT_INLINE_CHARS it follows in the message; beyond that it is
 * written whole to a temporary file and the message names the file, keeping
 * the error output in the message as well whenever that alone fits.
 */
export function cliExitError(
	cli:      'claude' | 'codex',
	exitCode: number,
	stdout:   string,
	stderr:   string,
	dir:      string = join(tmpdir(), 'insrc-cli-failures'),
	reviewScoped = false,
): CliExitError {
	const head = `${cli} exited with ${exitCode}.`;
	let result = '';
	try {
		const r = (JSON.parse(stdout) as { result?: unknown }).result;
		if (typeof r === 'string') result = r.trim();
	} catch { /* not an envelope: the output below is all there is */ }
	const said = result.length > 0 ? result : stderr.trim();
	if (reviewScoped) return reviewCliError(`${stdout}\n${stderr}`, head);
	const lead = result.length > 0 ? ` ${result}` : '';

	const output = `stderr=${stderr} stdout=${stdout}`;
	// A size refusal (ISSUE-aef82b03) keeps the same message, as an InputTooLargeError.
	const make = (message: string): CliExitError => {
		const sizes = classifyInputTooLarge(said);
		return sizes !== undefined ? new InputTooLargeError(message, said, sizes) : new CliExitError(message, said);
	};
	if (output.length <= CLI_OUTPUT_INLINE_CHARS) return make(`${head}${lead} ${output}`);
	try {
		const path = writeCliFailureFile(dir, cli, stdout, stderr);
		// The error output stays in the message when it fits: with no envelope it is the only statement of the cause.
		const errOut = stderr.length > 0 && stderr.length <= CLI_OUTPUT_INLINE_CHARS ? ` stderr=${stderr}` : '';
		return make(`${head}${lead}${errOut} The CLI's full output (${output.length} characters, nothing cut) is in ${path}`);
	} catch (err) {
		// The file could not be written: the output goes in the message, whole.
		log.warn({ dir, err: err instanceof Error ? err.message : String(err) }, 'CLI failure output could not be written to a file; it stays in the message');
		return make(`${head}${lead} ${output}`);
	}
}

/** The message of `cliExitError`. */
export function cliFailureMessage(cli: 'claude' | 'codex', exitCode: number, stdout: string, stderr: string, dir?: string): string {
	return cliExitError(cli, exitCode, stdout, stderr, dir).message;
}

/**
 * Write one failed call's output, whole, to a file only its owner can read
 * (it may echo a prompt or repository content), and remove the files of
 * earlier failures that are older than CLI_FAILURE_FILE_MAX_AGE_MS, so a
 * long-running daemon does not keep them for ever.
 */
function writeCliFailureFile(dir: string, cli: string, stdout: string, stderr: string): string {
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const now = Date.now();
	for (const name of readdirSync(dir)) {
		if (!/^(claude|codex)-exit-.*\.txt$/.test(name)) continue;
		const old = join(dir, name);
		try { if (now - statSync(old).mtimeMs > CLI_FAILURE_FILE_MAX_AGE_MS) rmSync(old, { force: true }); }
		catch { /* another process removed it first */ }
	}
	const path = join(dir, `${cli}-exit-${randomUUID()}.txt`);
	writeFileSync(path, `--- stderr ---\n${stderr}\n--- stdout ---\n${stdout}\n`, { encoding: 'utf8', mode: 0o600 });
	return path;
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
 *  race under load): drop the cached path + re-resolve + re-spawn.
 *
 *  This relaunch stays on even under `internalRetry: false` (Epic 8315a11f s1):
 *  an ENOENT launch never started a process, so no prompt reached any model and
 *  nothing is sent twice. The caller's one attempt is the one run that starts. */
async function runSubprocess(
	command: string,
	args: readonly string[],
	stdin: string,
	timeoutMs: number,
	cwd?: string,
	stall?: ProcessGroupOpts['stall'],
	signal?: AbortSignal,
): Promise<SubprocessResult> {
	let result = await spawnOnce(resolveBin(command), args, stdin, timeoutMs, cwd, stall, signal);
	if (result.exitCode === -1 && /ENOENT/.test(result.stderr)) {
		resolvedBinCache.delete(command);
		result = await spawnOnce(resolveBin(command), args, stdin, timeoutMs, cwd, stall, signal);
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
	stall?: ProcessGroupOpts['stall'],
	signal?: AbortSignal,
): Promise<SubprocessResult> {
	const r = await runInProcessGroup(command, args, { stdin, timeoutMs, cwd, stall, ...(signal !== undefined ? { signal } : {}) });
	// A cancelled run throws at once: its group is already killed (Epic 8315a11f s1).
	if (r.aborted === true) throw abortError();
	if (r.spawnError !== undefined) {
		return { stdout: r.stdout, stderr: r.stderr + `\nspawn error: ${r.spawnError}`, exitCode: -1, durationMs: r.durationMs };
	}
	return {
		stdout: r.stdout, stderr: r.stderr, exitCode: r.timedOut || r.stalled === true ? -9 : r.exitCode, durationMs: r.durationMs,
		...(r.stalled === true ? { stalled: true } : {}),
	};
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

/** Review failures never persist CLI output or quote it into a logged error. */
function reviewCliError(said: string, message: string): CliExitError {
	const sizes = classifyInputTooLarge(said);
	return sizes !== undefined ? new InputTooLargeError('review-input-too-large', 'input_too_large', sizes)
		: new CliExitError(message, isTransientCliError(said) ? 'transient-cli-failure' : 'cli-failure');
}
