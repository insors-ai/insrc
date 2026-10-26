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
 *   - Claude: added by t3.
 *
 * Every CLI call goes through one module-level chain, so at most one CLI child
 * of any check runs daemon-wide. Nothing is written: the result waits in a
 * bounded in-memory table until models.approve / models.reject decide it.
 */

import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';

import { getLogger } from '../shared/logger.js';
import { runInProcessGroup, type ProcessGroupOpts, type ProcessGroupResult } from '../shared/process-group.js';
import type { CliFamilyId, EffortLevel, InputLimit } from './model-catalog.js';
import { getModelRegistry, type ModelRegistry } from './model-registry.js';

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

type CliKind = 'claude' | 'codex';
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

async function call(ctx: Context, args: readonly string[], stdin?: string): Promise<ProcessGroupResult> {
	const r = await serial(() => ctx.run(ctx.bin, args, { timeoutMs: ctx.timeoutMs, cwd: ctx.cwd, ...(stdin !== undefined ? { stdin } : {}) }));
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

async function checkCodex(ctx: Context, claimed: readonly EffortLevel[]): Promise<Procedure> {
	const notChecked = (why: string): EffortCheck[] => claimed.map(effort => ({ effort, verdict: 'rejected', evidence: why }));

	const version = await call(ctx, ['--version']);
	const down = unreachable(ctx, version);
	if (down !== undefined) return { cliVersion: '', runs: false, efforts: notChecked('not checked: the CLI could not be reached'), error: down };
	const cliVersion = version.exitCode === 0 ? version.stdout.trim() : '';

	const list = await call(ctx, ['debug', 'models']);
	const listDown = unreachable(ctx, list);
	if (listDown !== undefined) return { cliVersion, runs: false, efforts: notChecked('not checked: the CLI could not be reached'), error: listDown };
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
	const events = run.stdout.split('\n').flatMap(line => { const v = parseJson(line.trim()); return isRecord(v) ? [v] : []; });
	const refusal = codexRefusal(events);
	if (refusal !== undefined) return { cliVersion, runs: false, efforts, error: `the ${ctx.kind} CLI refused the model: ${refusal}` };
	if (run.exitCode !== 0 || !events.some(e => e['type'] === 'turn.completed')) return { cliVersion, runs: false, efforts, error: unreadable(ctx, run) };
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
	const kind = typeof family === 'string' && registry.families().some(f => f.id === family) ? registry.cliKind(family as CliFamilyId) : undefined;
	if (kind === undefined) return invalid('family must be a CLI family of the model definitions');
	const modelId = p['modelId'];
	if (typeof modelId !== 'string' || modelId.trim().length === 0) return invalid('modelId must be a non-empty string');
	const claimedRaw = p['claimedEfforts'];
	if (!Array.isArray(claimedRaw) || !claimedRaw.every(e => typeof e === 'string' && e.length > 0)) return invalid('claimedEfforts must be an array of non-empty strings');
	const cliFamily = family as CliFamilyId;
	if (registry.find(cliFamily, modelId) !== undefined) return invalid(`${modelId} is already a model or alias of ${cliFamily}`);
	if (kind !== 'codex') return invalid(`checks through the ${kind} CLI are not available yet`);

	const claimed = [...new Set(claimedRaw as string[])];
	const ctx: Context = {
		kind, family: cliFamily, modelId,
		bin:       deps.bins?.[kind] ?? kind,
		run:       deps.run ?? runInProcessGroup,
		timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		cwd:       deps.cwd ?? tmpdir(),
	};
	const outcome = await checkCodex(ctx, claimed);
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
