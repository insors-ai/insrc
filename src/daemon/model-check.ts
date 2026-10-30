/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unknown-model check — the sc4 contract (Epic ce99b72065d03b1b, Story s4).
 *
 * models.check runs a Claude or Codex model the definitions do not list through
 * the family's own installed CLI (never a provider web API) and reports, for each
 * effort level the user claims, a verdict with the CLI's evidence:
 *   - Codex: `codex debug models` is the authority for a model's levels (a run
 *     at an unlisted level still succeeds, so a run proves nothing about it);
 *     one `codex exec` run decides whether the model runs.
 *   - Claude: no CLI output shows whether a model supports a level, so a level
 *     `claude --help` lists is only 'recognised-unconfirmed' (the user's approval
 *     admits it); one `claude --print` run decides whether the model runs, and
 *     its modelUsage gives the input limit.
 *
 * Every CLI call goes through one module-level chain, so at most one CLI child
 * of any check runs daemon-wide. Nothing is written: the result waits in a
 * bounded in-memory table until models.approve / models.reject decide it.
 *
 * A decision appends an ApprovedProfile to the approved-model store (the only
 * writer of PATHS.approvedModels): the whole document is written to
 * `<store>.tmp` and renamed over the store, and the decision is acknowledged
 * only after the rename. A store that is not a { version: 1, profiles[] }
 * document is never overwritten. The registry reads the store per thread, so
 * a decision applies at the next daemon restart.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';

import { getLogger } from '../shared/logger.js';
import { PATHS } from '../shared/paths.js';
import { runInProcessGroup, type ProcessGroupOpts, type ProcessGroupResult } from '../shared/process-group.js';
import type { CliFamilyId, EffortLevel, InputLimit } from './model-catalog.js';
import { getModelRegistry, profileProblem, type ApprovedProfile, type ModelRegistry } from './model-registry.js';

const log = getLogger('daemon:model-check');

export type EffortVerdict = 'accepted' | 'rejected' | 'recognised-unconfirmed';

export interface EffortCheck {
	readonly effort:   EffortLevel;
	readonly verdict:  EffortVerdict;
	readonly evidence: string;
}

export interface ModelCheckResult {
	readonly checkId:     string;
	readonly family:      CliFamilyId;
	readonly modelId:     string;
	readonly runs:        boolean;
	readonly inputLimit?: InputLimit | undefined;
	readonly efforts:     readonly EffortCheck[];
	/** The CLI could not be reached, refused the model, or gave unreadable output. */
	readonly error?:      string | undefined;
}

export type DecisionResult =
	| { readonly ok: true; readonly restartRequired: true }
	| { readonly ok: false; readonly reason: 'unknown-check' | 'model-did-not-run' | 'invalid-efforts' | 'write-failed'; readonly detail: string };

export interface InvalidParams { readonly error: string; readonly recoverable: false }

type CliKind = 'claude' | 'codex' | 'vibe';
type Run = (command: string, args: readonly string[], opts: ProcessGroupOpts) => Promise<ProcessGroupResult>;

/** Test seams; production uses the defaults. */
export interface ModelCheckDeps {
	readonly run?:       Run | undefined;
	/** Binary per CLI kind (default: the kind's name on PATH). */
	readonly bins?:      Partial<Record<CliKind, string>> | undefined;
	/** Per-call limit (default 120 s). */
	readonly timeoutMs?: number | undefined;
	/** Working directory of every call (default: the OS temp directory). */
	readonly cwd?:       string | undefined;
	readonly registry?:  ModelRegistry | undefined;
	/** The approved-model store (default: PATHS.approvedModels). */
	readonly storePath?: string | undefined;
	/** Replaces the store with the written temp file (default: renameSync). */
	readonly rename?:    ((from: string, to: string) => void) | undefined;
}

/** The fixed prompt a check's run sends on stdin. */
export const PROBE_PROMPT = 'Reply with the single word OK.';

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_PENDING = 32;

// ── one CLI call at a time, daemon-wide ─────────────────────────────────────

let chain: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
	const next = chain.then(fn);
	chain = next.catch(() => undefined);
	return next;
}

// ── pending checks ──────────────────────────────────────────────────────────

interface PendingCheck { readonly result: ModelCheckResult; readonly cliVersion: string }

const pending = new Map<string, PendingCheck>();

function remember(result: ModelCheckResult, cliVersion: string): void {
	pending.set(result.checkId, { result, cliVersion });
	while (pending.size > MAX_PENDING) {
		const oldest = pending.keys().next().value;
		if (oldest === undefined) break;
		pending.delete(oldest);
	}
}

/** Drop every pending check. Tests only. */
export function _resetModelChecksForTests(): void { pending.clear(); }

// ── calls and their classification ──────────────────────────────────────────

interface Context {
	readonly kind:      CliKind;
	readonly bin:       string;
	readonly run:       Run;
	readonly timeoutMs: number;
	readonly cwd:       string;
	readonly family:    CliFamilyId;
	readonly modelId:   string;
}

async function call(ctx: Context, args: readonly string[], stdin?: string, env?: NodeJS.ProcessEnv): Promise<ProcessGroupResult> {
	const r = await serial(() => ctx.run(ctx.bin, args, { timeoutMs: ctx.timeoutMs, cwd: ctx.cwd, ...(stdin !== undefined ? { stdin } : {}), ...(env !== undefined ? { env } : {}) }));
	log.info({ family: ctx.family, modelId: ctx.modelId, cli: ctx.kind, args, exitCode: r.exitCode, timedOut: r.timedOut, spawnError: r.spawnError, durationMs: r.durationMs }, 'model check: CLI call');
	return r;
}

/** Why the CLI could not be reached, or undefined when the call ran. */
function unreachable(ctx: Context, r: ProcessGroupResult): string | undefined {
	if (r.spawnError !== undefined) return `the ${ctx.kind} CLI could not be reached: ${r.spawnError}`;
	if (r.timedOut) return `the ${ctx.kind} CLI could not be reached: timed out after ${Math.round(ctx.timeoutMs / 1000)} s`;
	return undefined;
}

function unreadable(ctx: Context, r: ProcessGroupResult): string {
	const out = (r.stdout.trim().length > 0 ? r.stdout : r.stderr).trim().slice(0, 500);
	return `the ${ctx.kind} CLI gave unreadable output: exit ${r.exitCode}: ${out}`;
}

function parseJson(text: string): unknown {
	try { return JSON.parse(text); } catch { return undefined; }
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ── the Codex procedure ─────────────────────────────────────────────────────

interface Procedure {
	readonly cliVersion: string;
	readonly runs:       boolean;
	readonly efforts:    readonly EffortCheck[];
	readonly inputLimit?: InputLimit | undefined;
	readonly error?:     string | undefined;
}

/** The supported levels `codex debug models` lists for the model; undefined when the list is unreadable, null when it lacks the model. */
function codexLevels(r: ProcessGroupResult, modelId: string): string[] | null | undefined {
	if (r.exitCode !== 0) return undefined;
	const doc = parseJson(r.stdout);
	if (!isRecord(doc) || !Array.isArray(doc['models'])) return undefined;
	const entry = (doc['models'] as unknown[]).find(m => isRecord(m) && m['slug'] === modelId);
	if (!isRecord(entry)) return null;
	const levels = entry['supported_reasoning_levels'];
	if (!Array.isArray(levels)) return [];
	return levels.flatMap(l => (isRecord(l) && typeof l['effort'] === 'string' ? [l['effort']] : []));
}

/** The message of a refusal event in a `codex exec --json` stream, or undefined. */
function codexRefusal(events: readonly Record<string, unknown>[]): string | undefined {
	const e = events.find(x => x['type'] === 'error' || x['type'] === 'turn.failed');
	if (e === undefined) return undefined;
	const nested = isRecord(e['error']) ? e['error']['message'] : undefined;
	const message = typeof e['message'] === 'string' ? e['message'] : typeof nested === 'string' ? nested : JSON.stringify(e);
	return message;
}

/** The steps every procedure starts with: `--version`, then the call that
 *  discovers the effort levels. Either one failing to reach the CLI ends the
 *  check with every claimed level not checked. */
async function preflight(ctx: Context, claimed: readonly EffortLevel[], discoveryArgs: readonly string[]):
	Promise<{ readonly cliVersion: string; readonly discovery: ProcessGroupResult } | { readonly failed: Procedure }> {
	const notChecked = (cliVersion: string, error: string): { readonly failed: Procedure } => ({
		failed: { cliVersion, runs: false, efforts: claimed.map(effort => ({ effort, verdict: 'rejected', evidence: 'not checked: the CLI could not be reached' })), error },
	});
	const version = await call(ctx, ['--version']);
	const down = unreachable(ctx, version);
	if (down !== undefined) return notChecked('', down);
	const cliVersion = version.exitCode === 0 ? version.stdout.trim() : '';
	const discovery = await call(ctx, discoveryArgs);
	const discoveryDown = unreachable(ctx, discovery);
	return discoveryDown !== undefined ? notChecked(cliVersion, discoveryDown) : { cliVersion, discovery };
}

async function checkCodex(ctx: Context, claimed: readonly EffortLevel[]): Promise<Procedure> {
	const pre = await preflight(ctx, claimed, ['debug', 'models']);
	if ('failed' in pre) return pre.failed;
	const { cliVersion, discovery: list } = pre;
	const levels = codexLevels(list, ctx.modelId);
	const efforts: EffortCheck[] = claimed.map(effort => {
		if (levels === undefined) return { effort, verdict: 'rejected', evidence: "the CLI's model list could not be read" };
		if (levels === null) return { effort, verdict: 'rejected', evidence: `the CLI's model list does not include ${ctx.modelId}` };
		const listed = `\`codex debug models\` lists ${ctx.modelId} with levels: ${levels.length > 0 ? levels.join(', ') : '(none)'}`;
		return levels.includes(effort) ? { effort, verdict: 'accepted', evidence: listed } : { effort, verdict: 'rejected', evidence: listed };
	});

	const run = await call(ctx, ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only', '-C', ctx.cwd, '-m', ctx.modelId], PROBE_PROMPT);
	const runDown = unreachable(ctx, run);
	if (runDown !== undefined) return { cliVersion, runs: false, efforts, error: runDown };
	// codex exec --json writes only JSON event lines to stdout (its notices go to
	// stderr), so a line that is not a JSON object makes the run unreadable.
	const lines = run.stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0);
	const events = lines.flatMap(line => { const v = parseJson(line); return isRecord(v) ? [v] : []; });
	const refusal = codexRefusal(events);
	if (refusal !== undefined) return { cliVersion, runs: false, efforts, error: `the ${ctx.kind} CLI refused the model: ${refusal}` };
	if (run.exitCode !== 0 || events.length !== lines.length || !events.some(e => e['type'] === 'turn.completed')) return { cliVersion, runs: false, efforts, error: unreadable(ctx, run) };
	return { cliVersion, runs: true, efforts };
}

// ── the Claude procedure ────────────────────────────────────────────────────

/** The --effort values `claude --help` lists, or undefined when they cannot be read.
 *  The parenthesised list may wrap onto the description's next line, but not
 *  past the start of the next option. */
function claudeEffortNames(r: ProcessGroupResult): string[] | undefined {
	if (r.exitCode !== 0) return undefined;
	const m = /--effort\b([^(]*)\(([^)]*)\)/.exec(r.stdout);
	if (m === null || /\n\s*-/.test(m[1] ?? '')) return undefined;
	const names = (m[2] ?? '').split(',').map(x => x.trim()).filter(x => x.length > 0);
	return names.length > 0 ? names : undefined;
}

/** The JSON envelopes of a `claude --print --output-format json` run: the whole
 *  stdout, else every line that is a JSON object (a notice line may precede the
 *  envelope). More than one envelope is ambiguous output. */
function claudeEnvelopes(stdout: string): Record<string, unknown>[] {
	const whole = parseJson(stdout.trim());
	if (isRecord(whole)) return [whole];
	return stdout.split('\n').flatMap(line => { const v = parseJson(line.trim()); return isRecord(v) ? [v] : []; });
}

/** The input limit from modelUsage, and the model the CLI says it ran: entries
 *  are keyed by the canonical id, which can differ from the requested alias. One
 *  entry is used whatever its key; with several, only the one keyed by the
 *  requested id. */
function claudeUsage(ctx: Context, envelope: Record<string, unknown>): { readonly inputLimit?: InputLimit | undefined; readonly ranAs?: string | undefined } {
	const usage = envelope['modelUsage'];
	// Every key counts toward "one entry": a stray non-object entry makes the output ambiguous too.
	const entries = isRecord(usage) ? Object.entries(usage) : [];
	const chosen = entries.length === 1 ? entries[0] : entries.find(([k]) => k === ctx.modelId);
	const max = chosen !== undefined && isRecord(chosen[1]) ? chosen[1]['contextWindow'] : undefined;
	const ranAs = chosen?.[0];
	if (typeof max === 'number' && Number.isInteger(max) && max > 0) return { inputLimit: { unit: 'tokens', max }, ranAs };
	log.warn({ family: ctx.family, modelId: ctx.modelId, usageKeys: entries.map(([k]) => k) }, 'model check: no input limit in the CLI output');
	return { ranAs };
}

async function checkClaude(ctx: Context, claimed: readonly EffortLevel[]): Promise<Procedure> {
	const pre = await preflight(ctx, claimed, ['--help']);
	if ('failed' in pre) return pre.failed;
	const { cliVersion, discovery: help } = pre;
	const names = claudeEffortNames(help);
	const efforts: EffortCheck[] = claimed.map(effort => {
		if (names === undefined) return { effort, verdict: 'rejected', evidence: "the CLI's --effort values could not be read" };
		const listed = `\`claude --help\` lists --effort values: ${names.join(', ')}`;
		return names.includes(effort)
			? { effort, verdict: 'recognised-unconfirmed', evidence: `${listed}; no Claude CLI output shows whether ${ctx.modelId} supports ${effort}, so only your approval admits it` }
			: { effort, verdict: 'rejected', evidence: `${listed}; ${effort} is not one of them` };
	});

	const run = await call(ctx, ['--print', '--output-format', 'json', '--model', ctx.modelId], PROBE_PROMPT);
	const runDown = unreachable(ctx, run);
	if (runDown !== undefined) return { cliVersion, runs: false, efforts, error: runDown };
	const envelopes = claudeEnvelopes(run.stdout);
	const refusal = envelopes.find(e => e['is_error'] === true);
	if (refusal !== undefined) {
		const result = refusal['result'];
		const message = typeof result === 'string' && result.length > 0 ? result : `api error ${String(refusal['api_error_status'] ?? refusal['subtype'] ?? 'unknown')}`;
		return { cliVersion, runs: false, efforts, error: `the ${ctx.kind} CLI refused the model: ${message}` };
	}
	const envelope = envelopes.length === 1 ? envelopes[0] : undefined;
	const result = envelope?.['result'];
	if (envelope === undefined || run.exitCode !== 0 || envelope['is_error'] !== false || envelope['subtype'] !== 'success' || typeof result !== 'string' || result.length === 0) {
		return { cliVersion, runs: false, efforts, error: unreadable(ctx, run) };
	}
	const { inputLimit, ranAs } = claudeUsage(ctx, envelope);
	// Say which model the CLI actually ran when it is not the requested id (an alias).
	const reported = ranAs !== undefined && ranAs !== ctx.modelId
		? efforts.map(e => ({ ...e, evidence: `${e.evidence}; the CLI ran ${ctx.modelId} as ${ranAs}` }))
		: efforts;
	return { cliVersion, runs: true, efforts: reported, ...(inputLimit !== undefined ? { inputLimit } : {}) };
}

// ── the Vibe procedure ──────────────────────────────────────────────────────

/** vibe exposes no CLI surface listing a model's thinking levels (they live in
 *  the user's config.toml [[models]] entries), so every claimed level is
 *  'recognised-unconfirmed' — the user's approval admits it, exactly as with
 *  claude. One headless probe decides whether the model runs; the model is
 *  pinned through VIBE_ACTIVE_MODEL because vibe has no --model flag. */
async function checkVibe(ctx: Context, claimed: readonly EffortLevel[]): Promise<Procedure> {
	const notChecked = (cliVersion: string, error: string): Procedure => ({
		cliVersion, runs: false,
		efforts: claimed.map(effort => ({ effort, verdict: 'rejected', evidence: 'not checked: the CLI could not be reached' })),
		error,
	});
	const version = await call(ctx, ['--version']);
	const down = unreachable(ctx, version);
	if (down !== undefined) return notChecked('', down);
	const cliVersion = version.exitCode === 0 ? version.stdout.trim() : '';
	const efforts: EffortCheck[] = claimed.map(effort => ({
		effort,
		verdict: 'recognised-unconfirmed',
		evidence: `the vibe CLI lists no thinking levels for ${ctx.modelId} (they are set per model in config.toml); only your approval admits '${effort}'`,
	}));
	const run = await call(ctx, ['-p', '--output', 'text'], PROBE_PROMPT, { ...process.env, VIBE_ACTIVE_MODEL: ctx.modelId });
	const runDown = unreachable(ctx, run);
	if (runDown !== undefined) return { cliVersion, runs: false, efforts, error: runDown };
	if (run.exitCode !== 0 || run.stdout.trim().length === 0) return { cliVersion, runs: false, efforts, error: unreadable(ctx, run) };
	return { cliVersion, runs: true, efforts };
}

// ── models.check ────────────────────────────────────────────────────────────

function invalid(what: string): InvalidParams {
	return { error: `invalid-params: ${what}`, recoverable: false };
}

/** models.check: check `modelId` through its family's CLI. Writes nothing. */
export async function checkModel(params: unknown, deps: ModelCheckDeps = {}): Promise<ModelCheckResult | InvalidParams> {
	const registry = deps.registry ?? getModelRegistry();
	const p = isRecord(params) ? params : {};
	const family = p['family'];
	// Only a vendor CLI family is open to unlisted ids; an Ollama-hosted family runs only what it declares.
	const known = typeof family === 'string' && registry.families().some(f => f.id === family);
	const kind = known && registry.host(family as CliFamilyId) === undefined ? registry.cliKind(family as CliFamilyId) : undefined;
	if (kind === undefined) return invalid('family must be a vendor CLI family of the model definitions');
	const modelId = p['modelId'];
	if (typeof modelId !== 'string' || modelId.trim().length === 0) return invalid('modelId must be a non-empty string');
	const claimedRaw = p['claimedEfforts'];
	if (!Array.isArray(claimedRaw) || !claimedRaw.every(e => typeof e === 'string' && e.length > 0)) return invalid('claimedEfforts must be an array of non-empty strings');
	const cliFamily = family as CliFamilyId;
	if (registry.find(cliFamily, modelId) !== undefined) return invalid(`${modelId} is already a model or alias of ${cliFamily}`);

	const claimed = [...new Set(claimedRaw as string[])];
	const ctx: Context = {
		kind, family: cliFamily, modelId,
		bin:       deps.bins?.[kind] ?? kind,
		run:       deps.run ?? runInProcessGroup,
		timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		cwd:       deps.cwd ?? tmpdir(),
	};
	const outcome = kind === 'codex' ? await checkCodex(ctx, claimed)
		: kind === 'vibe' ? await checkVibe(ctx, claimed)
		: await checkClaude(ctx, claimed);
	const result: ModelCheckResult = {
		checkId: randomUUID(), family: cliFamily, modelId, runs: outcome.runs,
		...(outcome.inputLimit !== undefined ? { inputLimit: outcome.inputLimit } : {}),
		efforts: outcome.efforts,
		...(outcome.error !== undefined ? { error: outcome.error } : {}),
	};
	remember(result, outcome.cliVersion);
	log.info({ checkId: result.checkId, family: cliFamily, modelId, runs: result.runs, efforts: result.efforts.map(e => `${e.effort}:${e.verdict}`), error: result.error }, 'model check: verdict');
	return result;
}

// ── models.approve / models.reject ──────────────────────────────────────────

/** Append `profile` to the store at `path`, atomically; the reason it failed, or undefined. */
function appendProfile(path: string, profile: ApprovedProfile, rename: (from: string, to: string) => void): string | undefined {
	let doc: Record<string, unknown> = { version: 1, profiles: [] };
	let raw: string | undefined;
	try {
		raw = readFileSync(path, 'utf8');
	} catch (err) {
		const e = err as NodeJS.ErrnoException;
		if (e.code !== 'ENOENT') return `the approved-model store could not be read: ${e.message}`;
	}
	if (raw !== undefined) {
		const parsed = parseJson(raw);
		if (!isRecord(parsed) || !Array.isArray(parsed['profiles'])) return 'the approved-model store is not a { version, profiles[] } document';
		if (parsed['version'] !== 1) return `the approved-model store has unsupported version ${JSON.stringify(parsed['version'] ?? null)}`;
		doc = parsed;
	}
	const problem = profileProblem(profile);
	if (problem !== undefined) return `the decision is not a valid profile: ${problem}`;
	const next = { ...doc, profiles: [...(doc['profiles'] as unknown[]), profile] };
	const tmp = `${path}.tmp`;
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
		rename(tmp, path);
	} catch (err) {
		try { rmSync(tmp, { force: true }); } catch { /* nothing to remove */ }
		return `the approved-model store could not be written: ${(err as Error).message}`;
	}
	return undefined;
}

function pendingCheck(params: unknown): { readonly id: string; readonly check: PendingCheck } | DecisionResult {
	const id = isRecord(params) ? params['checkId'] : undefined;
	const check = typeof id === 'string' ? pending.get(id) : undefined;
	if (typeof id !== 'string' || check === undefined) {
		return { ok: false, reason: 'unknown-check', detail: `no pending check ${typeof id === 'string' ? id : '(missing checkId)'}; run models.check again` };
	}
	return { id, check };
}

function decide(id: string, check: PendingCheck, profile: ApprovedProfile, deps: ModelCheckDeps): DecisionResult {
	const failed = appendProfile(deps.storePath ?? PATHS.approvedModels, profile, deps.rename ?? renameSync);
	if (failed !== undefined) {
		log.warn({ checkId: id, family: profile.family, modelId: profile.modelId, status: profile.status, reason: failed }, 'model check: decision not recorded');
		return { ok: false, reason: 'write-failed', detail: failed };
	}
	pending.delete(id);
	log.info({ checkId: id, family: profile.family, modelId: profile.modelId, status: profile.status, efforts: profile.efforts, cliVersion: check.cliVersion }, 'model check: decision recorded (applies after a daemon restart)');
	return { ok: true, restartRequired: true };
}

/** models.approve: record the user's approval of a checked model with the levels they allow. */
export async function approveCheck(params: unknown, deps: ModelCheckDeps = {}): Promise<DecisionResult> {
	const found = pendingCheck(params);
	if ('ok' in found) return found;
	const { id, check } = found;
	const { result } = check;
	if (!result.runs) return { ok: false, reason: 'model-did-not-run', detail: result.error ?? `${result.modelId} did not run in its check` };
	const requested = isRecord(params) ? params['efforts'] : undefined;
	if (!Array.isArray(requested) || !requested.every(e => typeof e === 'string')) {
		return { ok: false, reason: 'invalid-efforts', detail: 'efforts must be an array of effort names' };
	}
	const efforts = [...new Set(requested as string[])];
	const refused = efforts.flatMap(effort => {
		const verdict = result.efforts.find(e => e.effort === effort);
		if (verdict === undefined) return [`${effort} was not claimed in check ${id}`];
		return verdict.verdict === 'rejected' ? [`${effort} was rejected: ${verdict.evidence}`] : [];
	});
	if (refused.length > 0) return { ok: false, reason: 'invalid-efforts', detail: refused.join('; ') };
	return decide(id, check, {
		family: result.family, modelId: result.modelId, status: 'approved', efforts,
		...(result.inputLimit !== undefined ? { inputLimit: result.inputLimit } : {}),
		decidedAt: new Date().toISOString(), cliVersion: check.cliVersion,
	}, deps);
}

/** models.reject: record that the user rejected a checked model. */
export async function rejectCheck(params: unknown, deps: ModelCheckDeps = {}): Promise<DecisionResult> {
	const found = pendingCheck(params);
	if ('ok' in found) return found;
	const { id, check } = found;
	return decide(id, check, {
		family: check.result.family, modelId: check.result.modelId, status: 'rejected', efforts: [],
		decidedAt: new Date().toISOString(), cliVersion: check.cliVersion,
	}, deps);
}
