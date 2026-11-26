// CLI adapters never have a supported Session backend; denial needs no local-provider proof loader.
import { assertNoSessionProvider as assertNoSessionEmbedding, assertNoSessionProvider as assertConnectionProviderAdmission } from '../../shared/connection-provider-denial.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * CliProvider -- wraps the locally-installed `claude`, `codex` and `vibe`
 * CLI binaries behind the `LLMProvider` interface.
 *
 * Rationale: the cleanup replaced four direct cloud REST providers
 * (Anthropic, OpenAI, Gemini, Mistral) with local subprocess
 * invocations. Auth and quota are owned by the local CLI's own
 * session; structured output is delegated to the CLI's native
 * `--json-schema` (claude) or `--output-schema` (codex) flag, or — for
 * vibe, which has no schema flag — requested in the prompt and checked
 * locally with ajv + retry.
 *
 *   - claude --print --output-format json --json-schema '<inline>'
 *     envelope.structured_output is the parsed, schema-validated
 *     payload. We never have to JSON.parse the `result` text.
 *   - codex exec --output-schema <tmpfile> --json
 *     JSONL stream; the `item.completed` event's `item.text` is the
 *     JSON payload. We JSON.parse it ourselves.
 *   - vibe -p --output text|json
 *     headless mode: `-p` with no text reads the prompt from stdin.
 *     `text` prints the final answer; `json` prints the session
 *     messages as a JSON array, from which we take the last
 *     assistant message. Explicit model and effort choices use the local
 *     Vibe app server and are verified before dispatch.
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
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse as parseToml } from 'smol-toml';

import type {
	CompletionOpts,
	LLMMessage,
	LLMProvider,
	LLMResponse,
	ProviderCapabilities,
	ReadOnlySessionOpts,
	StructuredCompletionOpts,
	StructuredSchema,
} from '../../shared/types.js';
import { UnqualifiedCapabilityPolicyError } from '../../shared/types.js';
import { isQualifiedForCapabilityPolicy } from './capability-qualification.js';
import type { CapabilityQualifiedProvider } from './capability-qualification.js';
import type { TierEffort } from '../../config/analyze.js';
import { getLogger } from '../../shared/logger.js';
import { runInProcessGroup } from '../../shared/process-group.js';
import type { ProcessGroupOpts } from '../../shared/process-group.js';
import { codexStrictSchema, rootUnionKey, schemaKeywordSummary, validateCodexReply, validateNativeReply } from './structured-schema.js';
import { buildRetryNote, validateAgainstSchema, withStructuredRetry } from './structured-output.js';
import { ModelResponseShapeError } from './model-call-error.js';
import { checkOllamaTarget, OllamaTargetError } from './ollama-target.js';
import { getModelRegistry } from '../../daemon/model-registry.js';
import { daemonInstallRoot } from '../../daemon/mcp-register.js';
import { createVibeAdapter, VibeTurnError, type VibeCatalogModel, type VibeTurnRequest, type VibeTurnResult } from '../../shared/vibe-adapter.js';

const log = getLogger('cli-provider');


// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export type CliKind = 'claude' | 'codex' | 'vibe';

/** Options for an agentic free-form EDITING session (`runEditSession`).
 *  Unlike `complete`/`completeStructured` — which are one-shot text/JSON
 *  turns — this spawns the CLI binary with the repo as its working
 *  directory and file-edit permissions, so `claude`/`codex` can actually
 *  modify files on disk during the turn. */
export interface EditSessionOpts {
	readonly connectionExecution?: import('../../shared/step-context.js').ConnectionExecutionContext | undefined;
	/** The repo root the CLI runs inside; its entire edit blast radius. */
	readonly cwd:        string;
	/** Per-session wall-clock cap. Defaults to the provider's `timeoutMs`. */
	readonly timeoutMs?: number | undefined;
}

/** Options for {@link CliProvider.runReadOnlySession}; declared with the provider interface. */
export type { ReadOnlySessionOpts } from '../../shared/types.js';

/** A read-only session ran past the time it was given. Never retried. */
export class ReadOnlySessionTimeoutError extends Error {
	constructor(readonly deadlineMs: number) {
		super(`read-only session passed its time limit of ${Math.round(deadlineMs / 1000)}s`);
		this.name = 'ReadOnlySessionTimeoutError';
	}
}

/** Test-only observation of the resolved capabilityPolicy on every
 *  runReadOnlySession dispatch attempt (both the outer transient-retry loop
 *  and the inner unsafe-MCP-server-exclusion retry loop), in order -- so a
 *  test can assert the value is identical across every attempt, not just
 *  infer it from a successful outcome. */
let capabilityPolicyAttemptsForTests: (string | undefined)[] | undefined;
export function _captureCapabilityPolicyAttemptsForTests(): (string | undefined)[] {
	capabilityPolicyAttemptsForTests = [];
	return capabilityPolicyAttemptsForTests;
}
export function _stopCapturingCapabilityPolicyAttemptsForTests(): void {
	capabilityPolicyAttemptsForTests = undefined;
}

/** Test-only count of calls to `isQualifiedForCapabilityPolicy` -- proves
 *  that omitting `capabilityPolicy` entirely skips the qualification check
 *  (count stays 0), rather than merely resolving it to a value that happens
 *  to always qualify. */
let qualificationCheckCallsForTests = 0;
function checkedIsQualifiedForCapabilityPolicy(provider: CapabilityQualifiedProvider, policy: 'write-sandboxed' | 'strict-read-analyze'): boolean {
	qualificationCheckCallsForTests++;
	return isQualifiedForCapabilityPolicy(provider, policy);
}
export function _qualificationCheckCallCountForTests(): number {
	return qualificationCheckCallsForTests;
}
export function _resetQualificationCheckCallCountForTests(): void {
	qualificationCheckCallsForTests = 0;
}

/** The built-in tools a read-only session may use: reading only. */
export const READ_ONLY_SESSION_READ_TOOLS: readonly string[] = ['Read', 'Grep', 'Glob'];
/** The insrc analyze tools a read-only session may call for drill-down. */
export const READ_ONLY_SESSION_ANALYZE_TOOLS: readonly string[] = ['mcp__insrc__insrc_analyze', 'mcp__insrc__insrc_analyze_step'];

/**
 * The MCP config a 'strict-read-analyze' claude session is confined to: ONLY
 * the insrc server (so the two analyze tools in READ_ONLY_SESSION_ANALYZE_TOOLS
 * stay reachable), launched the same way `mcp-register.ts`'s own `claude mcp
 * add` wiring launches it (`node <insrc-mcp.js>`), but with
 * INSRC_MCP_TOOL_ALLOWLIST set -- server.ts's own registerAndRecord disables
 * every OTHER registered tool (insrc_build_step, insrc_workflow_approve, ...)
 * when that env var is set, so the insrc server itself exposes ONLY the two
 * analyze tools in this mode. `--tools` alone only restricts claude's
 * BUILT-IN tools (confirmed against the installed CLI's own `--help`); it has
 * no effect on which MCP servers are loaded or callable, so without
 * --strict-mcp-config + this --mcp-config, every OTHER MCP server configured
 * for the user/project would still be loaded and callable by an unlisted tool
 * call, AND the insrc server's own non-analyze tools would still be reachable
 * too -- `--allowedTools` merely pre-approves specific tools without a
 * permission prompt, it does not exclude the rest.
 */
function strictMcpConfig(): { mcpServers: Record<string, { command: string; args: readonly string[]; env: Record<string, string> }> } {
	const allowlist = READ_ONLY_SESSION_ANALYZE_TOOLS.map(t => t.replace(/^mcp__insrc__/, '')).join(',');
	return { mcpServers: { insrc: { command: 'node', args: [join(daemonInstallRoot(), 'out', 'bin', 'insrc-mcp.js')], env: { INSRC_MCP_TOOL_ALLOWLIST: allowlist } } } };
}

/** Read-only sessions expose file reads and analysis tools only. `capabilityPolicy`
 *  'strict-read-analyze' additionally confines the MCP surface to ONLY the
 *  insrc server via --strict-mcp-config + --mcp-config -- --tools/--allowedTools
 *  alone close off built-ins but never exclude other configured MCP servers. */
export function claudeReadOnlySessionArgs(schema: StructuredSchema, modelArgs: readonly string[], capabilityPolicy: 'write-sandboxed' | 'strict-read-analyze' = 'write-sandboxed'): string[] {
 const base = ['--print', '--output-format', 'json', '--json-schema', JSON.stringify(schema),
  '--tools', READ_ONLY_SESSION_READ_TOOLS.join(','), '--allowedTools', [...READ_ONLY_SESSION_READ_TOOLS, ...READ_ONLY_SESSION_ANALYZE_TOOLS].join(',')];
 const mcpScope = capabilityPolicy === 'strict-read-analyze'
  ? ['--strict-mcp-config', '--mcp-config', JSON.stringify(strictMcpConfig())]
  : [];
 return [...base, ...mcpScope, ...modelArgs];
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

/** One globally-registered codex MCP server, as `codex mcp list --json` reports it. */
export interface CodexMcpServerStatus {
	readonly name: string;
	readonly enabled: boolean;
}

/** The insrc MCP server is not among codex's globally-registered servers, so
 *  a read-only session's native per-server allowlist cannot be built. */
export class CodexMcpServerNotRegisteredError extends Error {
	constructor(readonly serverName: string) {
		super(`codex: the '${serverName}' MCP server is not registered globally (run \`codex mcp list\` to check)`);
		this.name = 'CodexMcpServerNotRegisteredError';
	}
}

/** The insrc MCP server is registered but globally disabled
 *  (`enabled: false` in `codex mcp list --json`); setting its `enabled_tools`
 *  override does not re-enable it, so a session built from it would silently
 *  run with no insrc analyze tools reachable at all (see ISSUE-c85fa770c2cedefb
 *  for the live evidence). Refused up front instead. */
export class CodexMcpServerDisabledError extends Error {
	constructor(readonly serverName: string) {
		super(`codex: the '${serverName}' MCP server is registered but disabled globally; enable it (\`codex mcp enable ${serverName}\`) before a read-only session can use it`);
		this.name = 'CodexMcpServerDisabledError';
	}
}

/** A project-local .codex/config.toml between a codex read-only session's cwd
 *  and the filesystem root declares its own `mcp_servers` table that this
 *  module's discovery/allowlist mechanism cannot enumerate or exclude. The
 *  session refuses to start rather than leave that server reachable. */
export class CodexProjectMcpServersUnexcludableError extends Error {
	constructor(readonly cwd: string) {
		super(`codex: a project-local .codex/config.toml between '${cwd}' and the filesystem root declares its own mcp_servers table, which cannot be excluded from a read-only session`);
		this.name = 'CodexProjectMcpServersUnexcludableError';
	}
}

/** codex's own bootstrap rejects a partial `mcp_servers.<name>.enabled=false`
 *  override for some globally-registered servers (see ISSUE-08f9dd3412bc10f0
 *  for the servers observed), crashing before any session -- including
 *  insrc's own -- starts. readOnlySessionOnce recognizes codex's own
 *  rejection wording and throws this named error instead of letting an
 *  opaque CliExitError surface. */
export class CodexMcpServerOverrideUnsafeError extends Error {
	constructor(readonly serverName: string) {
		super(`codex: cannot safely exclude the '${serverName}' MCP server from a read-only session -- codex's own bootstrap rejects a partial override for it`);
		this.name = 'CodexMcpServerOverrideUnsafeError';
	}
}

/** codex's own bootstrap-rejection wording for an unacceptable per-server
 *  override (see ISSUE-08f9dd3412bc10f0 for the live evidence). Captures the
 *  rejected server name -- the name itself is never insrc's to know ahead of
 *  time, since it names whichever third-party server codex's own bootstrap
 *  blamed. */
const CODEX_MCP_SERVER_OVERRIDE_UNSAFE = /invalid transport\s+in `mcp_servers\.([^`]+)`/;

/** The insrc analyze tools the codex MCP server exposes, by their own remote names. */
const CODEX_INSRC_SERVER_NAME = 'insrc';
const CODEX_INSRC_TOOL_NAMES: readonly string[] = ['insrc_analyze', 'insrc_analyze_step'];

/** `codex -C cwd mcp list --json`: every globally-registered MCP server, by
 *  name and whether it is enabled. Used to build a read-only session's native
 *  per-server allowlist (codexReadOnlySessionArgs) without guessing at what
 *  else is registered. */
export async function discoverCodexMcpServers(binPath: string, cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<readonly CodexMcpServerStatus[]> {
	const out = await runSubprocess(binPath, ['-C', cwd, 'mcp', 'list', '--json'], '', timeoutMs, cwd, undefined, signal);
	if (out.exitCode !== 0) {
		throw new Error(`codex mcp list exited with ${out.exitCode}. stderr=${out.stderr} stdout=${out.stdout}`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(out.stdout);
	} catch (err) {
		throw new Error(`codex mcp list printed unparseable JSON: ${(err as Error).message}. stdout=${out.stdout.slice(0, 300)}`);
	}
	if (!Array.isArray(parsed)) {
		throw new Error(`codex mcp list did not print a JSON array. stdout=${out.stdout.slice(0, 300)}`);
	}
	return parsed.map((entry): CodexMcpServerStatus => {
		const name = (entry as Record<string, unknown>)['name'];
		if (typeof name !== 'string') throw new Error(`codex mcp list entry had no string name: ${JSON.stringify(entry)}`);
		return { name, enabled: (entry as Record<string, unknown>)['enabled'] !== false };
	});
}

/** Quote `name` as a TOML basic-string key (double-quoted, with `\` and `"`
 *  escaped). codex's own `-c key.path=value` override syntax splits its key
 *  on every `.` with no quoting support at all (confirmed live: a server
 *  literally named `review.server` turns `-c mcp_servers.review.server.enabled=false`
 *  into the nested path `mcp_servers.review.server.enabled`, silently
 *  targeting the wrong, nonexistent entry `mcp_servers.review` instead -- see
 *  ISSUE-c85fa770c2cedefb for the live evidence) --
 *  so every server name here is instead written as a quoted key inside ONE
 *  combined `mcp_servers={...}` inline-table assignment, never as a dotted
 *  `-c` path. A control character in a name is rejected rather than
 *  mis-encoded (real server names are config keys, never control text). */
function tomlQuotedKey(name: string): string {
	if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error(`codex: MCP server name '${name}' contains a control character and cannot be safely encoded`);
	return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * codex arguments for a read-only session: a read-only sandbox, never
 * `--full-auto`, plus a native per-server allowlist built from the globally-
 * registered `servers` (discoverCodexMcpServers) -- the insrc server's own
 * enabled_tools override, and one `enabled=false` override per other
 * registered server, so no MCP server but insrc is reachable. The whole
 * allowlist is ONE combined `-c mcp_servers={...}` inline-table assignment
 * (never separate per-server `-c mcp_servers.<name>.<field>=...` dotted-path
 * flags, which break on a dotted server name and which a later whole-table
 * `-c` assignment would clobber anyway -- confirmed live).
 */
export function codexReadOnlySessionArgs(schemaPath: string, cwd: string, modelArgs: readonly string[], servers: readonly CodexMcpServerStatus[]): string[] {
	const insrcServer = servers.find(server => server.name === CODEX_INSRC_SERVER_NAME);
	if (insrcServer === undefined) throw new CodexMcpServerNotRegisteredError(CODEX_INSRC_SERVER_NAME);
	if (!insrcServer.enabled) throw new CodexMcpServerDisabledError(CODEX_INSRC_SERVER_NAME);
	const entries: string[] = [
		`${tomlQuotedKey(CODEX_INSRC_SERVER_NAME)} = { enabled_tools = ${JSON.stringify(CODEX_INSRC_TOOL_NAMES)} }`,
	];
	for (const server of servers) {
		if (server.name === CODEX_INSRC_SERVER_NAME) continue;
		entries.push(`${tomlQuotedKey(server.name)} = { enabled = false }`);
	}
	const overrides = ['-c', `mcp_servers={ ${entries.join(', ')} }`];
	return ['exec', '--output-schema', schemaPath, '--json', '--sandbox', 'read-only', '-C', cwd, ...overrides, ...modelArgs];
}

/**
 * Whether `cwd` or any ancestor directory up to the filesystem root declares
 * its own non-empty `mcp_servers` table in a `.codex/config.toml`, other than
 * the ONE layer whose own config.toml path is, by exact string identity, the
 * real global config codex itself reads (`$CODEX_HOME/config.toml`, default
 * `~/.codex/config.toml`) -- that one layer is already fully handled by
 * `discoverCodexMcpServers`'s native enabled_tools/disable overrides, so it is
 * skipped WITHOUT being read. Every other layer is parsed with a real TOML
 * parser (codex's project config supports several forms -- a dotted table
 * header, a bare header with nested/dotted keys, an inline-table assignment,
 * and a top-level dotted key-value -- all of which land on the same
 * `mcp_servers` object shape once parsed). Such a server cannot be enumerated
 * or excluded by this module's discovery mechanism, so a codex read-only
 * session refuses to start rather than silently leaving it reachable.
 *
 * An exact-path comparison, not a directory-containment boundary: a
 * directory-containment rule would wrongly exclude a genuine project root
 * whenever `CODEX_HOME` is configured inside the project tree (confirmed by
 * trace against the layout `CODEX_HOME=/work/repo/codex-state`,
 * `cwd=/work/repo/src`, where the project root `/work/repo` must still be
 * checked). When `CODEX_HOME` lies entirely outside `cwd`'s ancestor chain,
 * the comparison simply never matches and every real layer is checked.
 *
 * `signal`, when given, aborts an in-flight read of one layer immediately
 * (the caller is responsible for the overall deadline -- this walk's own
 * elapsed time counts against it, same as discovery and exec already do;
 * see ISSUE-c85fa770c2cedefb for the live reproduction of the gap before
 * the caller started its clock ahead of this call).
 */
export async function walkProjectMcpConfigLayers(cwd: string, signal?: AbortSignal): Promise<boolean> {
	const globalConfigPath = join(process.env['CODEX_HOME'] ?? join(homedir(), '.codex'), 'config.toml');
	let dir = cwd;
	for (;;) {
		const candidatePath = join(dir, '.codex', 'config.toml');
		if (candidatePath !== globalConfigPath && await directoryDeclaresMcpServers(candidatePath, signal)) return true;
		const parent = dirname(dir);
		if (parent === dir) return false;
		dir = parent;
	}
}

/** Whether `configPath` exists and its parsed `mcp_servers` value is a non-empty object. */
async function directoryDeclaresMcpServers(configPath: string, signal?: AbortSignal): Promise<boolean> {
	let text: string;
	try {
		text = await readFile(configPath, { encoding: 'utf8', ...(signal !== undefined ? { signal } : {}) });
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
		throw err;
	}
	const mcpServers = (parseToml(text) as Record<string, unknown>)['mcp_servers'];
	return typeof mcpServers === 'object' && mcpServers !== null && Object.keys(mcpServers).length > 0;
}

/** Where an Ollama-hosted family's claude runs (Epic b220bb61, Story s2):
 *  the Ollama server and whether the model is an Ollama cloud model. */
export interface OllamaTarget {
	readonly host:    string;
	readonly hosting: 'cloud' | 'local';
}

export interface CliProviderOpts {
	readonly connectionExecution?: import('../../shared/step-context.js').ConnectionExecutionContext | undefined;
	readonly kind: CliKind;
	/** Default model name passed via `--model`. Optional; the CLI's own default applies when absent. */
	readonly model?: string | undefined;
	/** Override the binary path. Production paths look up the bin on PATH. */
	readonly binPath?: string | undefined;
	/** Override the local Vibe app-server executable for explicit selections. */
	readonly vibeAppServerPath?: string | undefined;
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
	/** Run claude against this Ollama server (claude kind with a model only).
	 *  Absent: the CLI runs exactly as before. */
	readonly ollama?: OllamaTarget | undefined;
	/** The pre-run check of an Ollama-targeted provider (tests pass a stub). Default checkOllamaTarget. */
	readonly ollamaCheck?: ((target: OllamaTarget, model: string) => Promise<void>) | undefined;
}


/**
 * How long a codex read-only session may show no model output (no event past
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

export const BOUNDED_CLI_ADAPTERS = { claude: 'cli-claude', codex: 'cli-codex', vibe: 'cli-vibe' } as const;
export type BoundedCliAdapterId = typeof BOUNDED_CLI_ADAPTERS[keyof typeof BOUNDED_CLI_ADAPTERS];

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
	private readonly vibeAppServerPath: string;
	private readonly timeoutMs: number;
	private readonly codexFirstOutputMs: number;
	private readonly embedDelegate: Pick<LLMProvider, 'embed' | 'capabilities'> | undefined;
	/** The Ollama server claude runs against, when this provider serves an Ollama-hosted family. */
	readonly ollama: OllamaTarget | undefined;
	private readonly ollamaCheck: (target: OllamaTarget, model: string) => Promise<void>;

	readonly capabilities: ProviderCapabilities;

	constructor(opts: CliProviderOpts) {
		assertConnectionProviderAdmission(opts.connectionExecution);
		if (opts.ollama !== undefined && (opts.kind !== 'claude' || opts.model === undefined || opts.model.length === 0)) {
			throw new Error(`cli-provider: an Ollama target needs the claude CLI and a model (kind '${opts.kind}', model '${opts.model ?? ''}')`);
		}
		this.ollama = opts.ollama;
		this.ollamaCheck = opts.ollamaCheck ?? checkOllamaTarget;
		this.kind = opts.kind;
		this.inputBudgetChars = opts.inputBudgetChars;
		this.defaultModel = opts.model;
		this.effort = opts.effort;
		this.binPath = opts.binPath ?? opts.kind;
		this.vibeAppServerPath = opts.vibeAppServerPath ?? 'vibe-app-server';
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
		assertConnectionProviderAdmission(opts?.connectionExecution);
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
			if (this.kind === 'codex') {
				const args = ['exec', '--json', ...this.modelArgs(opts)];
				const { agentText } = await this.runCodex(args, prompt, this.execIn(opts?.cwd, undefined, opts?.signal));
				return {
					text: agentText ?? '',
					stopReason: 'end_turn' as const,
				};
			}
			const result = await this.dispatchVibeTurn({ prompt, outputMode: 'text', mode: 'default', approval: undefined }, this.execIn(opts?.cwd, undefined, opts?.signal));
			return {
				text: result.text,
				stopReason: 'end_turn' as const,
			};
		}, 3, opts?.connectionExecution);
	}

	/** Builds a new-session request (model/thinking from this provider's own
	 *  configured defaults, never a silent catalog substitution -- the installed
	 *  CLI validates --model itself) and drives it through the adapter. Every
	 *  backend vibe path -- complete, completeStructuredVibe, the interactive-
	 *  tools auto-approve path, and readOnlySessionOnce -- goes through here;
	 *  there is no other vibe argv/dispatch path left in this provider. */
	private async dispatchVibeTurn(
		request: Pick<VibeTurnRequest, 'prompt' | 'outputMode' | 'mode' | 'approval'>,
		exec?: ExecOverride,
	): Promise<VibeTurnResult> {
		const adapter = createVibeAdapter({
			cwd: exec?.cwd ?? process.cwd(),
			env: exec?.env as Readonly<Record<string, string>> | undefined,
			processGroup: 'adapter-owned',
		}, { command: this.binPath });
		const turn = adapter.startTurn({
			...request,
			session: { kind: 'new', model: this.defaultModel || undefined, thinking: this.effort },
			signal: exec?.signal,
			deadlineMs: exec?.timeoutMs ?? this.timeoutMs,
		});
		return turn.result;
	}


	/** Re-issue a CLI call when it fails with a TRANSIENT upstream error —
	 *  the `claude`/`codex` binary's own connection to the model API dropped
	 *  mid-response, hit a rate limit, or got a 5xx. These are not our bug and
	 *  not fixable by changing the prompt, so a fresh subprocess usually
	 *  succeeds. Deterministic failures (bad schema, non-transient exit) are
	 *  re-thrown on the first attempt. Accuracy over cost: a long synthesize is
	 *  worth re-running rather than failing the whole workflow. */
	private async withTransientRetry<T>(label: string, op: () => Promise<T>, maxAttempts = 3, execution?: import('../../shared/step-context.js').ConnectionExecutionContext): Promise<T> {
		let lastErr: unknown;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			assertConnectionProviderAdmission(execution);
			try {
				const result = await op();
				assertConnectionProviderAdmission(execution);
				return result;
			} catch (err) {
				// The old app-server's dispatchState guard ("an uncertain write is never
				// reported as a safe retry") protected its own persistent-session,
				// interrupt/resume protocol, where a dropped connection mid-turn could
				// leave a server-side effect of unknown outcome. Every vibe path now
				// dispatches a single, stateless, one-shot CLI invocation per attempt
				// through the adapter -- there is no persistent session to leave in an
				// uncertain state, so a fresh retry is exactly as safe as it is for the
				// claude/codex clients, which never had this guard either.
				assertConnectionProviderAdmission(execution);
				lastErr = err;
				// A size refusal is never resent, whatever its text looks like (ISSUE-aef82b03).
				if (err instanceof InputTooLargeError) throw err;
				// An Ollama server that cannot serve the run is reported, not retried.
				if (err instanceof OllamaTargetError) throw err;
				// A cancelled call ends at once; it is never retried (Epic 8315a11f s1).
				if (isAbortError(err)) throw err;
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

	// -- completeStructured ---------------------------------------------

	async completeStructured<T>(
		messages: LLMMessage[],
		schema: StructuredSchema,
		opts?: StructuredCompletionOpts,
	): Promise<T> {
		assertConnectionProviderAdmission(opts?.connectionExecution);
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
		// vibe has no --json-schema flag: the schema travels in the prompt and
		// the answer is parsed + ajv-validated locally, with retry-on-mismatch.
		if (this.kind === 'vibe') {
			return this.completeStructuredVibe<T>(messages, schema, opts);
		}
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
		return this.withTransientRetry('completeStructured', () => this.completeStructuredOnce<T>(messages, schema, opts), opts?.internalRetry === false ? 1 : 3, opts?.connectionExecution);
	}

	private async completeStructuredOnce<T>(
		messages: LLMMessage[],
		schema: StructuredSchema,
		opts?: StructuredCompletionOpts,
	): Promise<T> {
		const prompt = serialiseMessages(messages);
		const wireSchema = this.kind === 'codex' ? codexSchemaJson(schema) : JSON.stringify(schema);
		if (this.kind === 'claude') {
			const args = [
				'--print',
				'--output-format', 'json',
				'--json-schema', wireSchema,
				...this.modelArgs(opts),
			];
			const { envelope } = await this.runClaude(args, prompt, this.execIn(opts?.cwd, opts?.timeoutMs, opts?.signal));
			if (envelope.is_error) {
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
			const exec = this.execIn(opts?.cwd, opts?.timeoutMs, opts?.signal);
			const silence = opts?.stallMs !== undefined ? { ...exec, timeoutMs: exec?.timeoutMs ?? this.timeoutMs, stallMs: opts.stallMs } : exec;
			let agentText: string | undefined;
			try {
				({ agentText } = await this.runCodex(args, prompt, silence));
			} catch (err) {
				// Codex names no keyword when it refuses a schema; the summary of what was sent is how the keyword is found.
				if (err instanceof Error && /invalid_json_schema|Invalid schema for response_format/.test(err.message)) {
					err.message = `${err.message} [${schemaKeywordSummary(JSON.parse(wireSchema))}]`;
				}
				throw err;
			}
			if (agentText === undefined) {
				throw new Error('codex emitted no agent_message item');
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(agentText);
			} catch (err) {
				throw new Error(`codex agent_message.text was not parseable JSON: ${(err as Error).message}. text=${agentText.slice(0, 300)}`);
			}
			return codexReply<T>(schema, parsed, 'codex answer');
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	}


	/** vibe's structured path: the schema goes in the prompt (vibe has no
	 *  --json-schema/--output-schema flag), the run prints the session messages
	 *  as a JSON array, and the last assistant message is parsed and
	 *  ajv-validated locally. `withStructuredRetry` re-issues with a feedback
	 *  note when the answer does not parse or validate; a size refusal and a
	 *  cancellation pass through untouched. */
	private completeStructuredVibe<T>(
		messages: LLMMessage[],
		schema: StructuredSchema,
		opts?: StructuredCompletionOpts,
	): Promise<T> {
		const schemaNote = outputContractNote(schema);
		return withStructuredRetry<T>(
			async (note) => {
				const prompt = serialiseMessages(messages) + schemaNote + (note !== undefined ? `\n\n${note}` : '');
				const result = await this.dispatchVibeTurn({ prompt, outputMode: 'json', mode: 'default', approval: undefined }, this.execIn(opts?.cwd, opts?.timeoutMs, opts?.signal));
				return JSON.parse(result.text) as unknown;
			},
			(raw) => validateAgainstSchema<T>(schema, raw, opts?.connectionExecution),
			opts?.internalRetry === false ? 1 : 3,
			opts?.connectionExecution,
		);
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
		assertConnectionProviderAdmission(opts.connectionExecution);
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
			if (this.kind === 'codex') {
				const args = ['exec', '--json', '--full-auto', ...this.modelArgs()];
				const { agentText } = await this.runCodex(args, prompt, exec);
				return { text: agentText ?? '', stopReason: 'end_turn' as const };
			}
			// vibe: headless run with every tool call auto-approved (the headless
			// sibling of codex --full-auto / claude --permission-mode acceptEdits).
			const result = await this.dispatchVibeTurn({ prompt, outputMode: 'text', mode: 'default', approval: 'auto' }, { cwd: opts.cwd, timeoutMs: opts.timeoutMs ?? this.timeoutMs });
			return { text: result.text, stopReason: 'end_turn' as const };
		}, 3, opts?.connectionExecution);
	}


	// -- runReadOnlySession -----------------------------------------------

	/**
	 * Run ONE read-only read-only session: the CLI starts in `opts.cwd` with
	 * tools limited to reading the repo and to the insrc analyze tools, cannot
	 * edit anything, and returns an answer checked against `schema`.
	 *
	 * The read-only sibling of {@link runEditSession}, used by build validation. Both CLIs do this in a single run —
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
	 * {@link ReadOnlySessionTimeoutError}, which is never retried.
	 */
	async runReadOnlySession<T>(prompt: string, schema: StructuredSchema, opts: ReadOnlySessionOpts): Promise<T> {
		assertConnectionProviderAdmission(opts.connectionExecution);
		// Fail closed, before anything else (including the deadline check and the
		// retry loop below): an unqualified provider never spawns a subprocess at
		// all. Omitted entirely: no qualification check runs at all -- today's exact
		// behavior for every existing caller, unchanged.
		if (opts.capabilityPolicy !== undefined && !checkedIsQualifiedForCapabilityPolicy(this.kind, opts.capabilityPolicy)) {
			throw new UnqualifiedCapabilityPolicyError(this.kind, opts.capabilityPolicy);
		}
		const capabilityPolicy = opts.capabilityPolicy ?? 'write-sandboxed';
    // Preserve the bounded caller's expired-deadline error without starting a process.
    if ((opts.mode === undefined || opts.mode === 'bounded') && Number.isFinite(opts.deadlineMs) && opts.deadlineMs <= 0) throw new ReadOnlySessionTimeoutError(opts.deadlineMs);
		const startedAt = Date.now();
		// internalRetry false: the caller re-issues, so this call makes one attempt only.
		const maxAttempts = opts.internalRetry === false ? 1 : 2;
		for (let attempt = 1; ; attempt++) {
			assertConnectionProviderAdmission(opts.connectionExecution);
			const remainingMs = opts.deadlineMs - (Date.now() - startedAt);
			if (remainingMs <= 0) throw new ReadOnlySessionTimeoutError(opts.deadlineMs);
			capabilityPolicyAttemptsForTests?.push(capabilityPolicy);
			try {
				return await this.readOnlySessionOnce<T>(prompt, schema, {
					cwd: opts.cwd, timeoutMs: remainingMs, watchStall: true, capabilityPolicy,
					...(opts.stallMs !== undefined ? { stallMs: opts.stallMs } : {}),
					...(opts.signal !== undefined ? { signal: opts.signal } : {}),
				});
			} catch (err) {
				if (err instanceof VibeTurnError && err.dispatchState !== 'not-sent') throw err;
				if (isAbortError(err)) throw err;
				const msg = err instanceof Error ? err.message : String(err);
				// A run that never started answering (or, with stallMs, went silent) is
				// retried once, as a fresh run, inside the time that remains (ISSUE-d4b2cd1c).
				if (err instanceof CliStallError) {
					const what = opts.stallMs !== undefined ? 'the CLI printed nothing new within its silence limit' : 'the CLI produced no model output';
					log.warn(({ provider: this.kind, attempt, codexSession: err.sessionId, err: msg }),
						`runReadOnlySession: ${what}; ${attempt < maxAttempts ? 'retrying once inside the remaining time' : 'giving up'}`);
					if (attempt < maxAttempts) continue;
					throw err;
				}
				if (err instanceof OllamaTargetError) throw err;
				// The subprocess runner reports its own kill as exit code -9.
				if (/exited with -9\b/.test(msg)) throw new ReadOnlySessionTimeoutError(opts.deadlineMs);
				if (attempt >= maxAttempts || !isTransientCliError(transienceText(err))) throw err;
				log.warn({ provider: this.kind, err: msg.slice(0, 200) }, 'runReadOnlySession: transient CLI error; retrying once inside the remaining time');
			}
		}
	}

 private vibeActivityCatalog(): readonly VibeCatalogModel[] {
  const registry = getModelRegistry();
  const rejected = new Set(registry.rejected('cli-vibe'));
  return registry.models('cli-vibe').filter(model => !rejected.has(model.id));
 }

	private async readOnlySessionOnce<T>(prompt: string, schema: StructuredSchema, exec: ExecOverride & { cwd: string; timeoutMs: number; watchStall: boolean; capabilityPolicy: 'write-sandboxed' | 'strict-read-analyze' }): Promise<T> {
		if (this.kind === 'vibe') {
			// Read-only: the adapter's own fail-closed state (k1) refuses this mode
			// synchronously, before any subprocess spawns, until a later Story of
			// this Epic supplies its live qualification.
			createVibeAdapter({ cwd: exec.cwd, processGroup: 'adapter-owned' }, { command: this.binPath })
				.startTurn({ prompt, outputMode: 'json', mode: 'read-only', session: { kind: 'new' } });
			throw new Error('unreachable: startTurn refuses a read-only request synchronously');
		}
		if (this.kind === 'claude') {
			const { envelope } = await this.runClaude(claudeReadOnlySessionArgs(schema, this.modelArgs(), exec.capabilityPolicy), prompt, exec);
			if (envelope.is_error) {
				const message = `claude read-only session failed: ${envelope.result ?? 'no error message'}`;
				throw sizeRefusalOr(message, envelope.result ?? '', () => new Error(message));
			}
			if (envelope.structured_output === undefined) {
				throw new Error('claude read-only session returned no structured_output');
			}
			return envelope.structured_output as T;
		}
		const discoveryStartedAt = Date.now();
		if (await walkProjectMcpConfigLayers(exec.cwd, exec.signal)) throw new CodexProjectMcpServersUnexcludableError(exec.cwd);
		const preDiscoveryRemainingMs = exec.timeoutMs - (Date.now() - discoveryStartedAt);
		if (preDiscoveryRemainingMs <= 0) throw new ReadOnlySessionTimeoutError(exec.timeoutMs);
		const tmpDir = mkdtempSync(join(tmpdir(), 'codex-readonly-schema-'));
		try {
			const schemaPath = join(tmpDir, 'schema.json');
			writeFileSync(schemaPath, codexSchemaJson(schema));
			const servers = await discoverCodexMcpServers(this.binPath, exec.cwd, preDiscoveryRemainingMs, exec.signal);
			const remainingMs = exec.timeoutMs - (Date.now() - discoveryStartedAt);
			if (remainingMs <= 0) throw new ReadOnlySessionTimeoutError(exec.timeoutMs);
			let text: string | undefined;
			let attemptServers = servers;
			let attemptTimeoutMs = remainingMs;
			// Bounded by the number of non-insrc servers plus one: in the worst case every
			// one of them is unexcludable, each attempt clears exactly one, and the final
			// attempt runs with none of them disabled at all -- never an unbounded loop.
			const maxAttempts = attemptServers.filter(s => s.name !== 'insrc').length + 1;
			for (let attempt = 1; attempt <= maxAttempts; attempt++) {
				const attemptStartedAt = Date.now();
				// The unsafe-MCP-server retry never drops or widens capabilityPolicy: every
				// attempt spreads the SAME `exec` object (capabilityPolicy was resolved once,
				// before readOnlySessionOnce was ever called) -- no attempt recomputes or
				// substitutes a different value.
				capabilityPolicyAttemptsForTests?.push(exec.capabilityPolicy);
				try {
					({ agentText: text } = await this.runCodex(codexReadOnlySessionArgs(schemaPath, exec.cwd, this.modelArgs(), attemptServers), prompt, { ...exec, timeoutMs: attemptTimeoutMs }));
					break;
				} catch (err) {
					const said = err instanceof CliExitError ? err.said : (err as Error).message;
					const match = CODEX_MCP_SERVER_OVERRIDE_UNSAFE.exec(said);
					if (match?.[1] === undefined) throw err;
					// codex's bootstrap cannot accept a partial disable override for this one
					// server; it was never excludable anyway, so retry without it rather than
					// fail the whole session outright. Repeat until every unsafe server found
					// so far is cleared, bounded above by maxAttempts.
					if (attempt === maxAttempts) throw new CodexMcpServerOverrideUnsafeError(match[1]);
					attemptServers = attemptServers.filter(s => s.name !== match[1]);
					attemptTimeoutMs -= Date.now() - attemptStartedAt;
					log.warn({ serverName: match[1], attempt, maxAttempts, remainingMs: attemptTimeoutMs },
						"readOnlySessionOnce: codex's bootstrap rejected a disable override for this server; retrying without it inside the remaining time");
					if (attemptTimeoutMs <= 0) throw new ReadOnlySessionTimeoutError(exec.timeoutMs);
				}
			}
			if (text === undefined) throw new Error('codex read-only session emitted no agent_message item');
			let parsed: unknown;
			try {
				parsed = JSON.parse(text);
			} catch (err) {
				throw new Error(`codex read-only session answer was not parseable JSON: ${(err as Error).message}. text=${text.slice(0, 300)}`);
			}
			return codexReply<T>(schema, parsed, 'codex read-only session answer');
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

	async embed(text: string, execution?: import('../../shared/step-context.js').ConnectionExecutionContext): Promise<number[]> {
		assertNoSessionEmbedding(execution);
		if (this.embedDelegate === undefined) {
			throw new Error('cli-provider: embed() requires an embedDelegate (typically an Ollama provider); none was supplied at construction');
		}
		return this.embedDelegate.embed(text, execution);
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
		// Vibe selections are applied and verified in its app-server session.
		if (this.kind === 'vibe') return [];
		const modelArgs = model === undefined || model.length === 0 ? [] : ['--model', model];
		if (this.effort === undefined) return modelArgs;
		return [...modelArgs, ...(this.kind === 'claude' ? ['--effort', this.effort] : ['-c', `model_reasoning_effort=${this.effort}`])];
	}


	/** The exec override for a one-shot call: run the CLI in `cwd` when the
	 *  caller names one, with the caller's `timeoutMs` when it names one, else
	 *  no override, so the CLI inherits the daemon's working directory and the
	 *  provider's timeout exactly as before. */
	private execIn(cwd: string | undefined, timeoutMs?: number | undefined, signal?: AbortSignal | undefined): ExecOverride | undefined {
		return { ...(cwd !== undefined ? { cwd } : {}), timeoutMs: timeoutMs ?? this.timeoutMs, ...(signal !== undefined ? { signal } : {}) };
	}

	/** A copy of `base` pointing claude at this provider's Ollama server, without
	 *  the vendor login; undefined when the provider has no Ollama target. The
	 *  daemon's own environment is never changed. */
	private withOllama(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv | undefined {
		if (this.ollama === undefined) return undefined;
		const env: NodeJS.ProcessEnv = { ...base, ANTHROPIC_BASE_URL: this.ollama.host, ANTHROPIC_AUTH_TOKEN: 'ollama', ANTHROPIC_API_KEY: '' };
		// No vendor login, and no Bedrock/Vertex mode that would send the run to another cloud.
		for (const key of ['CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) delete env[key];
		return env;
	}

	/** Before a claude run of an Ollama-targeted provider: the server answers,
	 *  has the model and (cloud model) is signed in; a failure starts no run. */
	private async checkOllama(): Promise<void> {
		if (this.ollama === undefined) return;
		try {
			await this.ollamaCheck(this.ollama, this.defaultModel!);
		} catch (err) {
			if (err instanceof OllamaTargetError) {
				log.warn({ model: err.model, host: err.host, cause: err.cause }, `claude on Ollama: pre-run check failed (${err.cause}); the run was not started`);
			}
			throw err;
		}
	}

	private async runClaude(args: readonly string[], prompt: string, exec?: ExecOverride): Promise<{ envelope: ClaudeEnvelope }> {
		await this.checkOllama();
		return new Promise((resolve, reject) => {
			const env = this.withOllama(exec?.env ?? process.env) ?? exec?.env;
			const r = runSubprocess(this.binPath, args, prompt, exec?.timeoutMs ?? this.timeoutMs, exec?.cwd, undefined, exec?.signal, env);
			r.then(out => {
				if (out.exitCode !== 0) {
					return reject(cliExitError('claude', out.exitCode, out.stdout, out.stderr, undefined));
				}
				let envelope: ClaudeEnvelope;
				try { envelope = JSON.parse(out.stdout) as ClaudeEnvelope; }
				catch (err) {
					return reject(new Error(`claude stdout was not parseable JSON envelope: ${(err as Error).message}. stdout=${out.stdout.slice(0, 500)}`));
				}
				log.debug( { duration_ms: envelope.duration_ms, model: Object.keys(envelope.modelUsage ?? {})[0] ?? null }, 'claude completed');
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
			throw sizeRefusalOr(message, said, () => new Error(message));
		}
		if (out.exitCode !== 0) {
			throw cliExitError('codex', out.exitCode, out.stdout, out.stderr, undefined);
		}
		// A tool-using run narrates before it answers: the answer is the LAST message.
		const agentMsg = events.filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message').at(-1);
		log.debug({ exitCode: out.exitCode, eventCount: events.length, hasAgentMessage: agentMsg !== undefined }, 'codex completed');
		return { events, agentText: agentMsg?.item?.text };
	}
}


// ---------------------------------------------------------------------------
// vibe headless helpers
// ---------------------------------------------------------------------------


/** The output-contract note appended to a vibe prompt when a structured
 *  answer is required (vibe has no schema flag, so the schema travels in
 *  the prompt). */
function outputContractNote(schema: StructuredSchema): string {
	return (
		'\n\n## Output contract\n'
		+ 'Return ONLY a raw JSON object that conforms to this JSON Schema. '
		+ 'No markdown fences, no prose before or after; the first character '
		+ 'must be `{` and the last `}`.\n'
		+ JSON.stringify(schema)
	);
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The last assistant message's text from a `vibe -p --output json` stdout.
 *  Tolerant of the two shapes vibe has shipped: a bare array of session
 *  messages, or an object wrapping them; message content may be a string or
 *  a list of content blocks (ACP-style {type:'text', text}). */
export function vibeLastAssistantText(stdout: string): string {
	let doc: unknown;
	try { doc = JSON.parse(stdout); }
	catch (err) { throw new Error(`vibe --output json stdout was not parseable JSON: ${(err as Error).message}. stdout=${stdout.slice(0, 300)}`); }
	const messages = Array.isArray(doc) ? doc
		: isRecord(doc) && Array.isArray(doc['messages']) ? doc['messages'] as unknown[]
		: undefined;
	if (messages === undefined) throw new Error('vibe --output json did not print a message array');
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (!isRecord(m) || m['role'] !== 'assistant') continue;
		const content = m['content'];
		const text = typeof content === 'string' ? content
			: Array.isArray(content)
				? content.filter(isRecord).filter(b => b['type'] === 'text').map(b => String(b['text'] ?? '')).join('')
				: '';
		if (text.length > 0) return text;
	}
	throw new Error('vibe --output json carried no assistant text message');
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
		readonly cwd?:       string | undefined;
	readonly timeoutMs?: number | undefined;
	/** Kill a codex run that shows no model output within the first-output limit
	 *  (CliStallError). Only the read-only session asks for it (ISSUE-d4b2cd1c). */
	readonly watchStall?: boolean | undefined;
	/** Kill a codex run that prints nothing new for this long (CliStallError).
	 *  Set by a structured call or a read-only session that passes `stallMs` (ISSUE-562b1bb5); takes
	 *  the place of `watchStall` when both are set. */
	readonly stallMs?: number | undefined;
	/** Cancels the run in flight: its process group is killed and AbortError thrown (Epic 8315a11f s1). */
	readonly signal?: AbortSignal | undefined;
	/** Full child environment (vibe: VIBE_ACTIVE_MODEL pin). When absent the
	 *  child inherits the daemon's environment. */
	readonly env?: NodeJS.ProcessEnv | undefined;
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
	if (/input_too_large|input exceeds the maximum length|input (?:is|was) too long/i.test(said)) {
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
	cli:      CliKind,
	exitCode: number,
	stdout:   string,
	stderr:   string,
	dir:      string = join(tmpdir(), 'insrc-cli-failures'),
): CliExitError {
	const head = `${cli} exited with ${exitCode}.`;
	let result = '';
	try {
		const r = (JSON.parse(stdout) as { result?: unknown }).result;
		if (typeof r === 'string') result = r.trim();
	} catch { /* not an envelope: the output below is all there is */ }
	const said = result.length > 0 ? result : stderr.trim();
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
export function cliFailureMessage(cli: CliKind, exitCode: number, stdout: string, stderr: string, dir?: string): string {
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
		if (!/^(claude|codex|vibe)-exit-.*\.txt$/.test(name)) continue;
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
async function resolveBin(command: string): Promise<string> {
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
	env?: NodeJS.ProcessEnv,
): Promise<SubprocessResult> {
	let result = await spawnOnce(await resolveBin(command), args, stdin, timeoutMs, cwd, stall, signal, env);
	if (result.exitCode === -1 && /ENOENT/.test(result.stderr)) {
		resolvedBinCache.delete(command);
		result = await spawnOnce(await resolveBin(command), args, stdin, timeoutMs, cwd, stall, signal, env);
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
	env?: NodeJS.ProcessEnv,
): Promise<SubprocessResult> {
	const r = await runInProcessGroup(command, args, { stdin, timeoutMs, cwd, stall, ...(signal !== undefined ? { signal } : {}), ...(env !== undefined ? { env } : {}) });
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
