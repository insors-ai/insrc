/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One tracker issue per stage unit (sc3): the Epic on the Define, a Story on its
 * LLD, a build Task on the plan. This is the team-mode owner of "does this unit
 * have an issue"; the approve-time pushes in `tracker-auto.ts` keep their own
 * (legacy) path for a repo without a team policy.
 *
 *   resolveUnitIssueLocal   the record, then the older refs; no tracker call
 *   ensureUnitIssueDetailed local resolve -> lookup by the per-unit label ->
 *                           labels -> create -> link -> record at once
 *   ensureUnitIssue         the HLD's EnsureIssue (unit, port) -> PortResult<IssueRef>
 *
 * A failed lookup is a failure, never "not found". A failure before the create
 * call means nothing was created; a failed create call is unconfirmed (the issue
 * may have been committed), and the next call finds it by its per-unit label.
 */

import { readFileSync } from 'node:fs';

import { getLogger } from '../../shared/logger.js';
import { readDefineArtifact } from '../gates.js';
import type { DefineArtifact } from '../artifacts/define.js';
import type { PlanArtifact } from '../artifacts/plan.js';
import { GithubConfigError, resolveGithubConfig, type ResolvedGithubConfig } from '../config/github.js';
import { epicWorkflowId, safeCanonical, storyWorkflowId, taskWorkflowId } from '../id.js';
import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId, planArtifactId, readRevision } from '../storage.js';
import { epicMembershipLabel, renderEpicBody, renderStoryBody, renderTaskBody } from './conventions.js';
import type { IssueRef, PortFailureKind, PortResult, TrackerPort } from './port.js';
import { patchTrackerMeta, readTrackerMeta, type TrackerMeta, type UnitIssue, type UnitRef } from './refs.js';

const log = getLogger('workflow:unit-issue');

/** GitHub allows at most 50 characters in a label. */
const MAX_LABEL_LEN = 50;

// ---------------------------------------------------------------------------
// Result types (module-local: the sc1 failure branch has no phase)
// ---------------------------------------------------------------------------

export type DuplicateCheck = 'clean' | 'adopted-other' | 'not-run';

export interface EnsuredIssue {
	readonly issue:          IssueRef;
	/** True only when this call created the issue. */
	readonly created:        boolean;
	readonly duplicateCheck: DuplicateCheck;
}

export type EnsureResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly reason: string; readonly kind: PortFailureKind; readonly phase: 'before-create' | 'create' };

export interface EnsureIssueDeps {
	/** Reads the repo's github config (default: resolveGithubConfig). */
	readonly readConfig?: ((repoPath: string) => ResolvedGithubConfig) | undefined;
	readonly now?: (       () => string) | undefined;
}

const before = (reason: string, kind: PortFailureKind = 'rejected'): EnsureResult<never> => ({ ok: false, reason, kind, phase: 'before-create' });

// ---------------------------------------------------------------------------
// Labels and record keys
// ---------------------------------------------------------------------------

const ID_RE = /^[A-Za-z0-9_-]+$/;

function lc(unit: UnitRef): { story: string | undefined; task: string | undefined } {
	return { story: unit.storyId?.toLowerCase(), task: unit.taskId?.toLowerCase() };
}

/**
 * `insrc:unit:<epicHash>[:<storyId>[:<taskId>]]`, ids lower-cased, at most 50
 * characters. Pure: the same unit always gets the same label, so a lookup after
 * a crash or a re-draft finds the issue. Throws when an id is malformed or the
 * label would be too long.
 */
export function unitLabel(unit: UnitRef): string {
	const { story, task } = lc(unit);
	const parts = ['insrc', 'unit', unit.epicHash.toLowerCase()];
	if (unit.unit !== 'epic') {
		if (story === undefined) throw new Error(`unit label: a ${unit.unit} unit needs a storyId`);
		parts.push(story);
	}
	if (unit.unit === 'task') {
		if (task === undefined) throw new Error('unit label: a task unit needs a taskId');
		parts.push(task);
	}
	for (const p of parts.slice(2)) if (!ID_RE.test(p)) throw new Error(`unit label: '${p}' is not a valid id (letters, digits, hyphen and underscore only)`);
	const label = parts.join(':');
	if (label.length > MAX_LABEL_LEN) throw new Error(`unit label '${label}' is ${label.length} characters, over the ${MAX_LABEL_LEN}-character limit`);
	return label;
}

/** The record key under `meta.tracker.units`: 'epic', 'story:<id>' or 'task:<story>/<task>'. */
export function unitKey(unit: UnitRef): string {
	const { story, task } = lc(unit);
	if (unit.unit === 'epic') return 'epic';
	if (unit.unit === 'story') return `story:${story ?? ''}`;
	return `task:${story ?? ''}/${task ?? ''}`;
}

function unitId(unit: UnitRef): string {
	return unit.unit === 'epic' ? unit.epicHash : unit.unit === 'story' ? (unit.storyId ?? '') : (unit.taskId ?? '');
}

// ---------------------------------------------------------------------------
// Where each unit's record lives
// ---------------------------------------------------------------------------

const defineJson = (u: UnitRef): string => artifactJsonPath(u.repoPath, defineArtifactId(u.epicHash));
const hldJson    = (u: UnitRef): string => artifactJsonPath(u.repoPath, hldArtifactId(u.epicHash));
const lldJson    = (u: UnitRef): string => artifactJsonPath(u.repoPath, lldArtifactId(u.epicHash, u.storyId ?? ''));
const planJson   = (u: UnitRef): string => artifactJsonPath(u.repoPath, planArtifactId(u.epicHash, u.storyId ?? ''));

/** The artifact that carries the unit's own record. */
function ownJson(unit: UnitRef): string {
	return unit.unit === 'epic' ? defineJson(unit) : unit.unit === 'story' ? lldJson(unit) : planJson(unit);
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function revisionOfFile(path: string): number {
	try { return readRevision(JSON.parse(readFileSync(path, 'utf8'))); } catch { return 0; }
}

function mapEntry(map: Readonly<Record<string, string>> | undefined, id: string | undefined): string | undefined {
	if (map === undefined || id === undefined) return undefined;
	return map[id] ?? map[id.toLowerCase()] ?? Object.entries(map).find(([k]) => k.toLowerCase() === id.toLowerCase())?.[1];
}

/** Record the unit's issue on its own artifact (units + the older ref) and on the siblings that read it. */
function recordUnit(unit: UnitRef, issue: IssueRef, now: string, pendingLink?: UnitIssue['pendingLink']): boolean {
	let ok = true;
	const own = ownJson(unit);
	const prior = readTrackerMeta(own)?.units?.[unitKey(unit)];
	// The same issue again (a sibling ref repaired): keep the record's revision and extras marks.
	const record: UnitIssue = prior !== undefined && prior.issue === issue
		? prior
		: { unit: unit.unit, unitId: unitId(unit), issue, createdAtRevision: revisionOfFile(own), ...(pendingLink !== undefined ? { pendingLink } : {}) };
	const units = { [unitKey(unit)]: record };
	const patches: Array<[string, Partial<TrackerMeta>]> = [];
	if (unit.unit === 'epic') {
		patches.push([defineJson(unit), { epicRef: issue, units, pushedAt: now }]);
		patches.push([hldJson(unit), { epicRef: issue }]);
	} else if (unit.unit === 'story') {
		patches.push([lldJson(unit), { storyRef: issue, units, pushedAt: now }]);
		const prior = readTrackerMeta(defineJson(unit))?.storyRefs ?? {};
		patches.push([defineJson(unit), { storyRefs: { ...prior, [unit.storyId ?? '']: issue } }]);
	} else {
		const prior = readTrackerMeta(own)?.taskRefs ?? {};
		patches.push([own, { taskRefs: { ...prior, [unit.taskId ?? '']: issue }, units, pushedAt: now }]);
	}
	for (const [path, patch] of patches) {
		if (!fileHas(path)) { log.debug({ path }, 'unit-issue: no artifact to record on'); continue; }
		try { patchTrackerMeta(path, patch); }
		catch (err) { ok = false; log.warn({ path, err: (err as Error).message }, 'unit-issue: could not record the unit issue (its label finds it next time)'); }
	}
	return ok;
}

// ---------------------------------------------------------------------------
// Local resolution
// ---------------------------------------------------------------------------

/**
 * The unit's issue if any local record or older ref names it, else null. Makes
 * no tracker call and never throws. Order: the units record, then the older refs
 * (Epic: Define epicRef, HLD epicRef; Story: the LLD's own storyRef, then the
 * Define's storyRefs entry; Task: the plan's taskRefs entry). A hit writes the
 * missing record and sibling refs locally.
 */
export function resolveUnitIssueLocal(unit: UnitRef, now: () => string = () => new Date().toISOString()): IssueRef | null {
	let hit: string | undefined;
	try {
		const key = unitKey(unit);
		const own = readTrackerMeta(ownJson(unit));
		const recorded = own?.units?.[key]?.issue;
		if (nonEmpty(recorded)) hit = recorded;
		else if (unit.unit === 'epic') {
			hit = [own?.epicRef, readTrackerMeta(hldJson(unit))?.epicRef].find(nonEmpty);
		} else if (unit.unit === 'story') {
			hit = [own?.storyRef, mapEntry(readTrackerMeta(defineJson(unit))?.storyRefs, unit.storyId)].find(nonEmpty);
		} else {
			hit = mapEntry(own?.taskRefs, unit.taskId);
		}
		if (hit === undefined) return null;
		reconcile(unit, hit, now());
		return hit;
	} catch (err) {
		log.warn({ unit: unitKey(unit), err: (err as Error).message }, 'unit-issue: local resolution failed');
		return hit ?? null;
	}
}

/** Write whatever of the record and sibling refs is missing; never changes a ref that is present. */
function reconcile(unit: UnitRef, issue: IssueRef, now: string): void {
	const key = unitKey(unit);
	const own = readTrackerMeta(ownJson(unit));
	const siblings: boolean =
		unit.unit === 'epic'  ? nonEmpty(readTrackerMeta(defineJson(unit))?.epicRef) && (!fileHas(hldJson(unit)) || nonEmpty(readTrackerMeta(hldJson(unit))?.epicRef)) :
		unit.unit === 'story' ? nonEmpty(own?.storyRef) && nonEmpty(mapEntry(readTrackerMeta(defineJson(unit))?.storyRefs, unit.storyId)) :
		nonEmpty(mapEntry(own?.taskRefs, unit.taskId));
	if (own?.units?.[key] !== undefined && siblings) return;
	recordUnit(unit, issue, now);
}

function fileHas(path: string): boolean {
	try { readFileSync(path, 'utf8'); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

function firstSentence(s: string): string {
	const m = /^(.+?[.!?])\s/.exec(s);
	return m !== null ? m[1]! : s.split('\n')[0]!.slice(0, 120);
}

type GithubCfg = Extract<ResolvedGithubConfig, { type: 'github' }>;

/**
 * The unit's single issue, found or created, in team mode. Order: the local
 * record and older refs (no tracker call); a lookup by the epic membership label
 * and the per-unit label (for the Epic, then the old two-label search); and only
 * when everything misses, the labels, the create call and the link to the
 * parent. The created ref is recorded at once.
 */
export function ensureUnitIssueDetailed(unit: UnitRef, port: TrackerPort, deps: EnsureIssueDeps = {}): EnsureResult<EnsuredIssue> {
	const now = deps.now ?? (() => new Date().toISOString());
	const local = resolveUnitIssueLocal(unit, now);
	if (local !== null) {
		retryPendingLink(unit, port, local);
		return { ok: true, value: { issue: local, created: false, duplicateCheck: 'clean' } };
	}

	let label: string;
	try { label = unitLabel(unit); }
	catch (err) { return before((err as Error).message); }

	let cfg: ResolvedGithubConfig;
	try { cfg = (deps.readConfig ?? resolveGithubConfig)(unit.repoPath); }
	catch (err) {
		return before(err instanceof GithubConfigError ? err.message : `cannot read the tracker configuration: ${(err as Error).message}`);
	}
	if (cfg.type === 'none') return before(`tracker disabled via config (source: ${cfg.source})`);

	// A Story's issue is recorded on its LLD: without that file nothing could be recorded, so create nothing.
	if (unit.unit === 'story' && !fileHas(lldJson(unit))) return before(`the LLD of Story '${unit.storyId ?? ''}' does not exist yet; draft it before its issue`);

	// What the issue is about, read from the unit's own artifact.
	let define: DefineArtifact;
	try { define = readDefineArtifact(unit.repoPath, unit.epicHash); }
	catch (err) { return before(`cannot read the Define: ${(err as Error).message}`); }
	const epicSlug = define.meta.epicSlug ?? unit.epicHash;
	const membership = epicMembershipLabel(epicSlug);
	const repo = { owner: cfg.owner, repo: cfg.repo };

	// The parent issue must already exist (a Story under its Epic, a Task under its
	// Story): it is found, never created here, so a failure below really means that
	// nothing was created by this call. The caller ensures the parent first.
	let parentRef: IssueRef | undefined;
	if (unit.unit !== 'epic') {
		const parentUnit: UnitRef = unit.unit === 'story'
			? { unit: 'epic', repoPath: unit.repoPath, epicHash: unit.epicHash }
			: { unit: 'story', repoPath: unit.repoPath, epicHash: unit.epicHash, ...(unit.storyId !== undefined ? { storyId: unit.storyId } : {}) };
		parentRef = resolveUnitIssueLocal(parentUnit, now) ?? undefined;
		if (parentRef === undefined) {
			let parentLabel: string;
			try { parentLabel = unitLabel(parentUnit); } catch (err) { return before((err as Error).message); }
			const parentFound = port.findIssue([membership, parentLabel]);
			if (!parentFound.ok) return before(`cannot look up the ${parentUnit.unit} issue for ${unitKey(unit)}: ${parentFound.reason}`, parentFound.kind);
			if (parentFound.value === null) return before(`the ${parentUnit.unit} issue does not exist yet; ensure it before the ${unit.unit}'s`);
			parentRef = parentFound.value;
			recordUnit(parentUnit, parentRef, now());
		}
	}

	// Lookup by the per-unit label (a failed lookup is a failure, never "not found").
	const found = port.findIssue([membership, label]);
	if (!found.ok) return before(`cannot look up the issue for ${unitKey(unit)}: ${found.reason}`, found.kind);
	let adopted: string | undefined = found.value ?? undefined;
	if (adopted === undefined && unit.unit === 'epic') {
		const old = port.findIssue([cfg.epicLabel, membership]);
		if (!old.ok) return before(`cannot look up the issue for ${unitKey(unit)}: ${old.reason}`, old.kind);
		adopted = old.value ?? undefined;
	}
	if (adopted !== undefined) {
		recordUnit(unit, adopted, now());
		// An issue found by its label (its create timed out) was never linked under its parent: do it now.
		// Whether or not every sibling record was written: the unit's own record is what a later ensure resolves from.
		if (parentRef !== undefined) linkAdopted(unit, port, parentRef, adopted);
		return { ok: true, value: { issue: adopted, created: false, duplicateCheck: 'clean' } };
	}

	// Labels: an issue created without its unit label could not be found again.
	const kindLabel = unit.unit === 'epic' ? cfg.epicLabel : unit.unit === 'story' ? cfg.storyLabel : cfg.taskLabel;
	for (const l of [kindLabel, membership, label]) {
		if (!port.issueOps.ensureLabel(l)) return before(`the label '${l}' could not be created`);
	}

	let spec: ReturnType<typeof buildSpec>;
	try { spec = buildSpec(unit, cfg, define, epicSlug, membership, label, kindLabel, parentRef, repo); }
	catch (err) { return before(`cannot build the issue for ${unitKey(unit)}: ${(err as Error).message}`); }
	if ('error' in spec) return before(spec.error);

	const created = port.issueOps.create(spec.value);
	if (!created.ok) {
		return { ok: false, reason: created.reason, kind: created.kind, phase: 'create' };
	}
	const issue = created.value.ref;
	let pendingLink: UnitIssue['pendingLink'];
	if (parentRef !== undefined) {
		const link = port.issueOps.linkSubIssue(parentRef, created.value.id);
		if (!link.ok) {
			log.warn({ unit: unitKey(unit), parent: parentRef, reason: link.reason }, 'unit-issue: could not link the issue under its parent (retried next time)');
			pendingLink = { parent: parentRef, childId: created.value.id };
		}
	}
	const recorded = recordUnit(unit, issue, now(), pendingLink);
	// Without the record, adopting another issue could leave a local ref on a closed duplicate: keep this one.
	return { ok: true, value: recorded ? tieBreak(unit, port, label, issue, now) : { issue, created: true, duplicateCheck: 'not-run' } };
}

/** True when the unit's record is on disk and nothing is left to retry (a pending link). */
export function isUnitSettled(unit: UnitRef): boolean {
	try {
		const record = readTrackerMeta(ownJson(unit))?.units?.[unitKey(unit)];
		return record !== undefined && record.pendingLink === undefined;
	} catch { return false; }
}

/** The tracker's id of an issue; a tracker without the lookup counts as a failed lookup, never a crash. */
function lookUpIssueId(port: TrackerPort, ref: IssueRef): PortResult<number> {
	if (typeof port.issueOps.resolveIssueId !== 'function') return { ok: false, reason: 'this tracker cannot look up an issue id', kind: 'rejected' };
	return port.issueOps.resolveIssueId(ref);
}

/** Store the unit's pending link on its own record (the record keeps its revision and extras marks). */
function savePendingLink(unit: UnitRef, pendingLink: NonNullable<UnitIssue['pendingLink']>): void {
	try {
		const path = ownJson(unit);
		const record = readTrackerMeta(path)?.units?.[unitKey(unit)];
		if (record === undefined) { log.warn({ unit: unitKey(unit) }, 'unit-issue: no record to keep the pending link on'); return; }
		patchTrackerMeta(path, { units: { [unitKey(unit)]: { ...record, pendingLink } } });
	} catch (err) { log.warn({ unit: unitKey(unit), err: (err as Error).message }, 'unit-issue: could not record the pending link'); }
}

/** Link an issue adopted by its label under its parent; any failure leaves a pending link for the next ensure and never fails the ensure. */
function linkAdopted(unit: UnitRef, port: TrackerPort, parent: IssueRef, child: IssueRef): void {
	const id = lookUpIssueId(port, child);
	if (!id.ok) {
		log.warn({ unit: unitKey(unit), child, kind: id.kind, reason: id.reason }, 'unit-issue: could not look up the adopted issue id (the link is retried next time)');
		savePendingLink(unit, { parent, child });
		return;
	}
	const link = port.issueOps.linkSubIssue(parent, id.value);
	if (!link.ok) {
		log.warn({ unit: unitKey(unit), parent, child, kind: link.kind, reason: link.reason }, 'unit-issue: could not link the adopted issue under its parent (retried next time)');
		savePendingLink(unit, { parent, childId: id.value });
	}
}

/** A link under the parent that failed earlier is retried; on success the record is cleared of it. A record that knows only the child ref looks its id up first. */
function retryPendingLink(unit: UnitRef, port: TrackerPort, issue: IssueRef): void {
	try {
		const path = ownJson(unit);
		const record = readTrackerMeta(path)?.units?.[unitKey(unit)];
		const pending = record?.pendingLink;
		if (record === undefined || pending === undefined) return;
		let childId = pending.childId;
		if (childId === undefined) {
			if (pending.child === undefined) { log.warn({ unit: unitKey(unit), issue }, 'unit-issue: the pending link names neither a child id nor a child ref'); return; }
			const id = lookUpIssueId(port, pending.child);
			if (!id.ok) { log.warn({ unit: unitKey(unit), issue, kind: id.kind, reason: id.reason }, 'unit-issue: the pending link\'s child id could not be looked up again'); return; }
			childId = id.value;
		}
		const link = port.issueOps.linkSubIssue(pending.parent, childId);
		if (!link.ok) {
			log.warn({ unit: unitKey(unit), issue, reason: link.reason }, 'unit-issue: the pending link under the parent failed again');
			// keep the id just found, so the next try does not look it up again
			if (pending.childId === undefined) savePendingLink(unit, { parent: pending.parent, childId });
			return;
		}
		const { pendingLink: _done, ...settled } = record;
		patchTrackerMeta(path, { units: { [unitKey(unit)]: settled } });
	} catch (err) { log.warn({ unit: unitKey(unit), err: (err as Error).message }, 'unit-issue: could not retry the pending link'); }
}

const issueNumber = (ref: IssueRef): number => Number(/#(\d+)$/.exec(ref)?.[1] ?? Number.MAX_SAFE_INTEGER);

/**
 * Step 5, after the created issue is recorded: when two daemons both created, keep
 * the lowest-numbered issue, record it in place of this call's own, and comment on
 * and close the own one as a duplicate. A failed
 * listing, keeps the created issue (`not-run`); the issue is already recorded.
 */
function tieBreak(unit: UnitRef, port: TrackerPort, label: string, own: IssueRef, now: () => string): EnsuredIssue {
	const kept: EnsuredIssue = { issue: own, created: true, duplicateCheck: 'not-run' };
	const list = port.findIssues([label]);
	if (!list.ok) {
		log.warn({ unit: unitKey(unit), reason: list.reason }, 'unit-issue: the duplicate check could not list the unit label (the created issue is kept)');
		return kept;
	}
	const lowest = [...list.value].sort((a, b) => issueNumber(a) - issueNumber(b))[0];
	if (lowest === undefined || lowest === own || issueNumber(lowest) > issueNumber(own)) return { ...kept, duplicateCheck: 'clean' };

	log.warn({ unit: unitKey(unit), own, lowest }, 'unit-issue: another daemon created this unit issue first; adopting the lowest and closing this call\'s own');
	if (!recordUnit(unit, lowest, now())) return kept;
	const said = port.issueOps.comment(own, `Duplicate of ${lowest}: the same unit (${label}) was created twice at once; ${lowest} is the one kept.`);
	if (!said.ok) log.warn({ own, reason: said.reason }, 'unit-issue: could not comment on the duplicate');
	const closed = port.issueOps.close(own);
	if (!closed.ok) log.warn({ own, reason: closed.reason }, 'unit-issue: could not close the duplicate (it is adopted away from regardless)');
	return { issue: lowest, created: false, duplicateCheck: 'adopted-other' };
}

function buildSpec(
	unit: UnitRef, cfg: GithubCfg, define: DefineArtifact, epicSlug: string, membership: string, label: string,
	kindLabel: string, parentRef: IssueRef | undefined, repo: { owner: string; repo: string },
): { value: Parameters<TrackerPort['issueOps']['create']>[0] } | { error: string } {
	const labels = [kindLabel, membership, label];
	const createdAt = define.meta.createdAt;
	if (unit.unit === 'epic') {
		const wid = safeCanonical(() => epicWorkflowId(unit.epicHash, createdAt));
		const problem = firstSentence(define.body.problem);
		return { value: { title: wid !== undefined ? `${wid} — ${problem}` : `Epic: ${problem}`, body: renderEpicBody(define, epicSlug, repo, wid), labels, issueType: cfg.epicIssueType } };
	}
	const storyId = unit.storyId ?? '';
	const story = define.body.stories.find(s => s.id === storyId || s.id.toLowerCase() === storyId.toLowerCase());
	if (story === undefined) return { error: `Story '${storyId}' is not in the Define body` };
	if (unit.unit === 'story') {
		const wid = safeCanonical(() => storyWorkflowId(unit.epicHash, createdAt, story.id));
		return { value: { title: wid !== undefined ? `${wid} — ${story.title}` : `${story.id}: ${story.title}`, body: renderStoryBody(parentRef ?? '', story, epicSlug, unit.epicHash, createdAt, repo, wid), labels, issueType: cfg.storyIssueType } };
	}
	let plan: PlanArtifact;
	try { plan = JSON.parse(readFileSync(planJson(unit), 'utf8')) as PlanArtifact; }
	catch (err) { return { error: `cannot read the plan: ${(err as Error).message}` }; }
	const taskId = unit.taskId ?? '';
	const task = (plan.body?.tasks ?? []).find(t => t.id === taskId || t.id.toLowerCase() === taskId.toLowerCase());
	if (task === undefined) return { error: `Task '${taskId}' is not in the plan of Story '${storyId}'` };
	const wid = safeCanonical(() => taskWorkflowId(unit.epicHash, createdAt, story.id, task.id));
	return { value: { title: wid !== undefined ? `${wid} — ${task.title}` : `${story.id}/${task.id}: ${task.title}`, body: renderTaskBody(parentRef ?? '', story.id, task, epicSlug, unit.epicHash, createdAt, repo, wid), labels, issueType: cfg.taskIssueType } };
}

/**
 * The HLD's EnsureIssue: the unit's single issue, found or created. A failure
 * carries the sc1 kind and reason; the creation phase stays inside this module.
 */
export function ensureUnitIssue(unit: UnitRef, port: TrackerPort): PortResult<IssueRef> {
	const r = ensureUnitIssueDetailed(unit, port);
	return r.ok ? { ok: true, value: r.value.issue } : { ok: false, reason: r.reason, kind: r.kind };
}

// ---------------------------------------------------------------------------
// Approve-time extras (team mode)
// ---------------------------------------------------------------------------

export type ExtraName = 'milestone' | 'taskList' | 'designComment' | 'reviewComment' | 'planComment';

export interface ExtraStep {
	readonly name: ExtraName;
	readonly run:  () => PortResult<void>;
}

/** A partial result is a normal outcome, not an exception. */
export interface ExtrasOutcome {
	readonly done:    string[];
	readonly skipped: string[];
	readonly failed:  Array<{ name: string; reason: string }>;
}

export interface ExtrasDeps {
	readonly now?: ( () => string) | undefined;
	/** Writes the step's mark (default: onto the unit's record through patchTrackerMeta). */
	readonly mark?: ((unit: UnitRef, name: ExtraName, at: string) => void) | undefined;
}

function markExtra(unit: UnitRef, name: ExtraName, at: string): void {
	const path = ownJson(unit);
	const key = unitKey(unit);
	const record = readTrackerMeta(path)?.units?.[key];
	if (record === undefined) throw new Error(`no unit record for ${key} to mark`);
	patchTrackerMeta(path, { units: { [key]: { ...record, extrasDone: { ...(record.extrasDone ?? {}), [name]: at } } } });
}

/**
 * Run each approve-time extra on its own. A step already marked in the unit's
 * `extrasDone` is skipped; a step that succeeds is marked before the next runs; a
 * step that fails is left unmarked and reported. Nothing goes through
 * `bestEffort`, so a failure is seen. The one residual repeat: the mark write
 * fails after a successful post, so the next run posts that step again.
 */
export function runUnitExtras(unit: UnitRef, steps: readonly ExtraStep[], deps: ExtrasDeps = {}): ExtrasOutcome {
	const now = deps.now ?? (() => new Date().toISOString());
	const mark = deps.mark ?? markExtra;
	const marks = readTrackerMeta(ownJson(unit))?.units?.[unitKey(unit)]?.extrasDone ?? {};
	const out: ExtrasOutcome = { done: [], skipped: [], failed: [] };
	for (const step of steps) {
		if (marks[step.name] !== undefined) { out.skipped.push(step.name); continue; }
		const r = step.run();
		if (!r.ok) {
			log.warn({ unit: unitKey(unit), step: step.name, reason: r.reason }, 'unit-issue: approve-time extra failed (left unmarked; the next approve retries it)');
			out.failed.push({ name: step.name, reason: r.reason });
			continue;
		}
		try { mark(unit, step.name, now()); }
		catch (err) {
			// Posted, but unmarked: reported as failed so the author sees it, and the next run posts it again (the stated residual).
			log.warn({ unit: unitKey(unit), step: step.name, err: (err as Error).message }, 'unit-issue: extra posted but its mark was not written (the next approve may post it again)');
			out.failed.push({ name: step.name, reason: `posted, but its completion mark was not written (${(err as Error).message}); the next approve may post it again` });
			continue;
		}
		out.done.push(step.name);
	}
	return out;
}
