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
import { ArtifactIds, InvalidArtifactKeyError, type ArtifactKey } from '../artifact-ids.js';
import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId, planArtifactId, readRevision } from '../storage.js';
import { epicMembershipLabel, renderEpicBody, renderStoryBody, renderTaskBody } from './conventions.js';
import type { IssueRef, PortFailureKind, PortResult, TrackerComment, TrackerPort } from './port.js';
import { bindArtifact, readBinding, recordPosted, setPendingLink, TRACKER_ISSUE_TYPE } from './binding.js';
import type { PostedKind } from './binding.js';
import { unitArtifactId } from './attach.js';
import { taskHeadIdOf } from '../tasks/lookup.js';
import type { Reference } from '../artifact-core/types.js';
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

/** A Task unit is named by its plan row id; once the Task has its own artifact, its label and keys use the Task artifact's number. */
function taskHeadOf(unit: UnitRef): string | undefined {
	if (unit.unit !== 'task' || unit.storyId === undefined || unit.taskId === undefined) return undefined;
	return taskHeadIdOf(unit.repoPath, unit.epicHash, unit.storyId, unit.taskId);
}

function lc(unit: UnitRef): { story: string | undefined; task: string | undefined } {
	const head = taskHeadOf(unit);
	return { story: unit.storyId?.toLowerCase(), task: head !== undefined ? ArtifactIds.parse(head)?.task ?? unit.taskId?.toLowerCase() : unit.taskId?.toLowerCase() };
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

const issueRefOf = (ref: string): Reference => ({ entityId: ref, type: TRACKER_ISSUE_TYPE, relation: 'tracked-by' });

/**
 * Where a unit's issue record lives (s6, s7). An Epic's is the binding on its Define and a Story's the binding on its LLD; a Task's
 * is the binding on its Task artifact. A Task with no artifact (its Story was planned before Tasks were artifacts) keeps its
 * record under meta.tracker.units on the Plan until s9 gives it one. Every read and write of a record goes through here.
 */
function bindingHome(unit: UnitRef): { readonly repoPath: string; readonly artifactId: string } | undefined {
	const artifactId = unit.unit === 'task' ? taskHeadOf(unit) : unitArtifactId(unit);
	return artifactId === undefined ? undefined : { repoPath: unit.repoPath, artifactId };
}

/** The unit's recorded issue and its pending link, in the shape the retry reads (refs as `owner/repo#N`). */
function readRecord(unit: UnitRef): { readonly issue: IssueRef; readonly pendingLink?: UnitIssue['pendingLink'] } | undefined {
	const home = bindingHome(unit);
	if (home === undefined) {
		const record = readTrackerMeta(ownJson(unit))?.units?.[unitKey(unit)];
		return record === undefined || !nonEmpty(record.issue) ? undefined : { issue: record.issue, ...(record.pendingLink !== undefined ? { pendingLink: record.pendingLink } : {}) };
	}
	const binding = readBinding(home.repoPath, home.artifactId);
	if (binding === undefined) return undefined;
	const p = binding.pendingLink;
	return {
		issue: binding.reference.entityId,
		...(p !== undefined ? { pendingLink: { parent: p.parent.entityId, ...(p.childId !== undefined ? { childId: p.childId } : {}), ...(p.child !== undefined ? { child: p.child.entityId } : {}) } } : {}),
	};
}

/** Keep (or with undefined clear) the unit's pending link on its record. False when it could not be written. */
function writePendingLink(unit: UnitRef, link: UnitIssue['pendingLink']): boolean {
	const home = bindingHome(unit);
	if (home !== undefined) {
		return setPendingLink(home.repoPath, home.artifactId, link === undefined ? undefined
			: { parent: issueRefOf(link.parent), ...(link.childId !== undefined ? { childId: link.childId } : {}), ...(link.child !== undefined ? { child: issueRefOf(link.child) } : {}) });
	}
	const path = ownJson(unit);
	const record = readTrackerMeta(path)?.units?.[unitKey(unit)];
	if (record === undefined) return false;
	if (link === undefined) { const { pendingLink: _done, ...settled } = record; patchTrackerMeta(path, { units: { [unitKey(unit)]: settled } }); return true; }
	patchTrackerMeta(path, { units: { [unitKey(unit)]: { ...record, pendingLink: link } } });
	return true;
}

/** The sibling refs the renderers and the chain report read (epicRef, storyRef, storyRefs, taskRefs, pushedAt): written alongside the record until s9. */
function recordSiblings(unit: UnitRef, issue: IssueRef, now: string): boolean {
	let ok = true;
	const patches: Array<[string, Partial<TrackerMeta>]> = [];
	if (unit.unit === 'epic') {
		patches.push([defineJson(unit), { epicRef: issue, pushedAt: now }]);
		patches.push([hldJson(unit), { epicRef: issue }]);
	} else if (unit.unit === 'story') {
		patches.push([lldJson(unit), { storyRef: issue, pushedAt: now }]);
		const prior = readTrackerMeta(defineJson(unit))?.storyRefs ?? {};
		patches.push([defineJson(unit), { storyRefs: { ...prior, [unit.storyId ?? '']: issue } }]);
	}
	for (const [path, patch] of patches) {
		if (!fileHas(path)) { log.debug({ path }, 'unit-issue: no artifact to record on'); continue; }
		try { patchTrackerMeta(path, patch); }
		catch (err) { ok = false; log.warn({ path, err: (err as Error).message }, 'unit-issue: could not record the unit issue (its label finds it next time)'); }
	}
	return ok;
}

/** Record the unit's issue on its own artifact (the binding, or for a Task the Plan's units record) and on the siblings that read it. */
function recordUnit(unit: UnitRef, issue: IssueRef, now: string, pendingLink?: UnitIssue['pendingLink']): boolean {
	const home = bindingHome(unit);
	if (home === undefined) {
		// a Task with no artifact: the Plan's record and taskRefs, as before s6
		const own = ownJson(unit);
		const prior = readTrackerMeta(own)?.units?.[unitKey(unit)];
		const record: UnitIssue = prior !== undefined && prior.issue === issue
			? prior
			: { unit: unit.unit, unitId: unitId(unit), issue, createdAtRevision: revisionOfFile(own), ...(pendingLink !== undefined ? { pendingLink } : {}) };
		const taskRefs = readTrackerMeta(own)?.taskRefs ?? {};
		if (!fileHas(own)) { log.debug({ path: own }, 'unit-issue: no artifact to record on'); return true; }
		try { patchTrackerMeta(own, { taskRefs: { ...taskRefs, [unit.taskId ?? '']: issue }, units: { [unitKey(unit)]: record }, pushedAt: now }); return true; }
		catch (err) { log.warn({ path: own, err: (err as Error).message }, 'unit-issue: could not record the unit issue (its label finds it next time)'); return false; }
	}
	if (!fileHas(artifactJsonPath(home.repoPath, home.artifactId))) { log.debug({ artifactId: home.artifactId }, 'unit-issue: no artifact to bind'); return recordSiblings(unit, issue, now); }
	const bound = bindArtifact(home.repoPath, home.artifactId, issue);
	if (!bound.ok) { log.warn({ unit: unitKey(unit), why: bound.kind, reason: bound.reason }, 'unit-issue: could not bind the unit issue (its label finds it next time)'); return false; }
	let ok = true;
	if (pendingLink !== undefined && !writePendingLink(unit, pendingLink)) ok = false;
	return recordSiblings(unit, issue, now) && ok;
}

// ---------------------------------------------------------------------------
// Local resolution
// ---------------------------------------------------------------------------

/**
 * The unit's issue if any local record or older ref names it, else null. Makes
 * no tracker call and never throws. Order: the record (the binding of an Epic's
 * Define or a Story's LLD, the Plan's units record for a Task), then the older
 * refs (Epic: Define epicRef, HLD epicRef; Story: the LLD's own storyRef, then
 * the Define's storyRefs entry; Task: the plan's taskRefs entry). A unit with no
 * binding is bound once from an older ref (a one-way rebind); a hit also writes
 * the missing sibling refs locally.
 */
export function resolveUnitIssueLocal(unit: UnitRef, now: () => string = () => new Date().toISOString()): IssueRef | null {
	let hit: string | undefined;
	try {
		const recorded = readRecord(unit)?.issue;
		const own = readTrackerMeta(ownJson(unit));
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
	const own = readTrackerMeta(ownJson(unit));
	const siblings: boolean =
		unit.unit === 'epic'  ? nonEmpty(readTrackerMeta(defineJson(unit))?.epicRef) && (!fileHas(hldJson(unit)) || nonEmpty(readTrackerMeta(hldJson(unit))?.epicRef)) :
		unit.unit === 'story' ? nonEmpty(own?.storyRef) && nonEmpty(mapEntry(readTrackerMeta(defineJson(unit))?.storyRefs, unit.storyId)) :
		// a Task with an artifact has its record on the binding alone; one without keeps the plan's taskRefs entry
		bindingHome(unit) !== undefined || nonEmpty(mapEntry(own?.taskRefs, unit.taskId));
	if (readRecord(unit) !== undefined && siblings) return;
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
	// The head that holds the unit's binding has to be readable: a malformed binding makes every store read of it fail, and an
	// issue that could not be recorded must not be created. Checked before any lookup or create.
	const home = bindingHome(unit);
	if (home !== undefined) {
		try { readBinding(home.repoPath, home.artifactId); }
		catch (err) { return before(`the head of ${home.artifactId} cannot be read, so the unit's issue could not be recorded: ${(err as Error).message}`); }
	}
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
	const found = findSingleIssue(port, [membership, label]);
	if (!found.ok) return before(`cannot look up the issue for ${unitKey(unit)}: ${found.reason}`, found.kind);
	let adopted: string | undefined = found.value ?? undefined;
	if (adopted === undefined && unit.unit === 'epic') {
		const old = findSingleIssue(port, [cfg.epicLabel, membership]);
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

	// The guard: the issue may exist without our record or label (an older one, or another daemon's). Found by its
	// title's artifact id, it is adopted; several, or a failed lookup, create nothing.
	const titled = findExistingUnitIssue(port, membership, label, spec.token);
	if (!titled.ok) return before(titled.reason, titled.kind);
	if (titled.issue !== null) {
		recordUnit(unit, titled.issue, now());
		if (parentRef !== undefined) linkAdopted(unit, port, parentRef, titled.issue);
		return { ok: true, value: { issue: titled.issue, created: false, duplicateCheck: 'clean' } };
	}

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
	// The duplicate check comes first, so the unit is recorded once, with the issue that is kept.
	const decided = decideKept(unit, port, label, issue);
	const kept = decided.issue === issue;
	const recorded = recordUnit(unit, decided.issue, now(), kept ? pendingLink : undefined);
	if (!kept && recorded) closeDuplicate(port, label, issue, decided.issue);
	// Without the record, adopting another issue could leave a local ref on a closed duplicate: keep this one.
	if (!recorded) return { ok: true, value: { issue, created: true, duplicateCheck: 'not-run' } };
	return { ok: true, value: { issue: decided.issue, created: kept, duplicateCheck: decided.check } };
}

/** True when the unit's record is on disk and nothing is left to retry (a pending link). */
export function isUnitSettled(unit: UnitRef): boolean {
	try {
		const record = readRecord(unit);
		return record !== undefined && record.pendingLink === undefined;
	} catch { return false; }
}

/** The tracker's id of an issue; a tracker without the lookup counts as a failed lookup, never a crash. */
function lookUpIssueId(port: TrackerPort, ref: IssueRef): PortResult<number> {
	if (typeof port.issueOps.resolveIssueId !== 'function') return { ok: false, reason: 'this tracker cannot look up an issue id', kind: 'rejected' };
	return port.issueOps.resolveIssueId(ref);
}

/** Store the unit's pending link on its own record (the record keeps its revision and marks). */
function savePendingLink(unit: UnitRef, pendingLink: NonNullable<UnitIssue['pendingLink']>): void {
	try {
		if (readRecord(unit) === undefined) { log.warn({ unit: unitKey(unit) }, 'unit-issue: no record to keep the pending link on'); return; }
		if (!writePendingLink(unit, pendingLink)) log.warn({ unit: unitKey(unit) }, 'unit-issue: could not record the pending link');
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
		const pending = readRecord(unit)?.pendingLink;
		if (pending === undefined) return;
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
		if (!writePendingLink(unit, undefined)) log.warn({ unit: unitKey(unit), issue }, 'unit-issue: the pending link was made but its clearing was not written (it is retried; linking twice is harmless)');
	} catch (err) { log.warn({ unit: unitKey(unit), err: (err as Error).message }, 'unit-issue: could not retry the pending link'); }
}

const issueNumber = (ref: IssueRef): number => Number(/#(\d+)$/.exec(ref)?.[1] ?? Number.MAX_SAFE_INTEGER);

/**
 * Step 5, before the created issue is recorded: when two daemons both created, the lowest-numbered issue of the unit label is the
 * unit's. It is recorded once (the binding refuses a second issue), and this call's own issue is commented on and closed as a
 * duplicate when it is not the lowest. A failed listing keeps the created issue (`not-run`).
 */
function decideKept(unit: UnitRef, port: TrackerPort, label: string, own: IssueRef): { readonly issue: IssueRef; readonly check: DuplicateCheck } {
	const list = port.findIssues([label]);
	if (!list.ok) {
		log.warn({ unit: unitKey(unit), reason: list.reason }, 'unit-issue: the duplicate check could not list the unit label (the created issue is kept)');
		return { issue: own, check: 'not-run' };
	}
	const lowest = [...list.value].sort((a, b) => issueNumber(a) - issueNumber(b))[0];
	if (lowest === undefined || lowest === own || issueNumber(lowest) > issueNumber(own)) return { issue: own, check: 'clean' };
	log.warn({ unit: unitKey(unit), own, lowest }, 'unit-issue: another daemon created this unit issue first; adopting the lowest and closing this call\'s own');
	return { issue: lowest, check: 'adopted-other' };
}

/** Comment on and close this call's own issue as a duplicate of `kept`. */
function closeDuplicate(port: TrackerPort, label: string, own: IssueRef, kept: IssueRef): void {
	const said = port.issueOps.comment(own, `Duplicate of ${kept}: the same unit (${label}) was created twice at once; ${kept} is the one kept.`);
	if (!said.ok) log.warn({ own, reason: said.reason }, 'unit-issue: could not comment on the duplicate');
	const closed = port.issueOps.close(own);
	if (!closed.ok) log.warn({ own, reason: closed.reason }, 'unit-issue: could not close the duplicate (it is adopted away from regardless)');
}

/**
 * The guard in front of every issue create: an issue for the unit that already exists is found, never
 * made twice. By the unit label first (with the epic membership label), then by the artifact id the
 * title starts with. One match is the issue; none means create; several matches, or a lookup that
 * failed, mean the caller must create nothing.
 */
/** The one issue carrying every label, none, or a failure: findIssue answers the first match only, so a second is looked for. */
export function findSingleIssue(port: TrackerPort, labels: string[]): PortResult<IssueRef | null> {
	const first = port.findIssue(labels);
	if (!first.ok || first.value === null || typeof port.findIssues !== 'function') return first;
	const all = port.findIssues(labels);
	if (!all.ok) return all;
	if (all.value.length > 1) return { ok: false, reason: `${all.value.length} issues carry the labels ${labels.join(', ')} (${all.value.join(', ')}); keep one, close the others and retry`, kind: 'rejected' };
	return first;
}

export function findExistingUnitIssue(
	port: TrackerPort, membership: string, label: string, token: string,
): { readonly ok: true; readonly issue: IssueRef | null } | { readonly ok: false; readonly reason: string; readonly kind: 'missing-tool' | 'missing-signin' | 'unreachable' | 'rejected' } {
	// Every issue carrying the label, so a unit that already has several is refused rather than bound to the first.
	const labelled = typeof port.findIssues === 'function'
		? port.findIssues([membership, label])
		: (() => { const one = port.findIssue([membership, label]); return one.ok ? { ok: true as const, value: one.value === null ? [] : [one.value] } : one; })();
	if (!labelled.ok) return { ok: false, reason: `cannot look up the issue by its label '${label}': ${labelled.reason}`, kind: labelled.kind };
	if (labelled.value.length > 1) {
		return { ok: false, reason: `${labelled.value.length} issues carry the label '${label}' (${labelled.value.join(', ')}); keep one, close the others and retry`, kind: 'rejected' };
	}
	if (labelled.value[0] !== undefined) return { ok: true, issue: labelled.value[0] };
	if (typeof port.findIssuesByTitleToken !== 'function') return { ok: false, reason: `this tracker cannot look an issue up by its title ${token}`, kind: 'rejected' };
	const byTitle = port.findIssuesByTitleToken(token);
	if (!byTitle.ok) return { ok: false, reason: `cannot look up the issue titled ${token}: ${byTitle.reason}`, kind: byTitle.kind };
	if (byTitle.value.length > 1) {
		return { ok: false, reason: `${byTitle.value.length} issues are titled ${token} (${byTitle.value.join(', ')}); keep one, close the others and retry`, kind: 'rejected' };
	}
	return { ok: true, issue: byTitle.value[0] ?? null };
}

function buildSpec(
	unit: UnitRef, cfg: GithubCfg, define: DefineArtifact, epicSlug: string, membership: string, label: string,
	kindLabel: string, parentRef: IssueRef | undefined, repo: { owner: string; repo: string },
): { value: Parameters<TrackerPort['issueOps']['create']>[0]; token: string } | { error: string } {
	const labels = [kindLabel, membership, label];
	const createdAt = define.meta.createdAt;
	// The title and the body marker both start with the artifact id, so the issue maps back to its artifact
	// from GitHub alone and the duplicate guard can find it by its title.
	const idOf = (key: ArtifactKey): { readonly id: string } | { readonly error: string } => {
		try { return { id: ArtifactIds.make(key) }; }
		catch (e) { return { error: `no artifact id for the ${key.kind} issue: ${e instanceof InvalidArtifactKeyError ? e.message : String(e)}` }; }
	};
	if (unit.unit === 'epic') {
		const made = idOf({ kind: 'EPIC', epicHash: unit.epicHash });
		if ('error' in made) return made;
		const problem = firstSentence(define.body.problem);
		return { token: made.id, value: { title: `${made.id} \u2014 ${problem}`, body: renderEpicBody(define, epicSlug, repo, made.id), labels, issueType: cfg.epicIssueType } };
	}
	const storyId = unit.storyId ?? '';
	const story = define.body.stories.find(s => s.id === storyId || s.id.toLowerCase() === storyId.toLowerCase());
	if (story === undefined) return { error: `Story '${storyId}' is not in the Define body` };
	if (unit.unit === 'story') {
		const made = idOf({ kind: 'STORY', epicHash: unit.epicHash, story: story.id });
		if ('error' in made) return made;
		return { token: made.id, value: { title: `${made.id} \u2014 ${story.title}`, body: renderStoryBody(parentRef ?? '', story, epicSlug, unit.epicHash, createdAt, repo, made.id), labels, issueType: cfg.storyIssueType } };
	}
	let plan: PlanArtifact;
	try { plan = JSON.parse(readFileSync(planJson(unit), 'utf8')) as PlanArtifact; }
	catch (err) { return { error: `cannot read the plan: ${(err as Error).message}` }; }
	const taskId = unit.taskId ?? '';
	const task = (plan.body?.tasks ?? []).find(t => t.id === taskId || t.id.toLowerCase() === taskId.toLowerCase());
	if (task === undefined) return { error: `Task '${taskId}' is not in the plan of Story '${storyId}'` };
	// the Task artifact's own id when it has one (its number can differ from the plan row's after a re-plan)
	const headId = taskHeadOf(unit);
	const made = headId !== undefined ? { id: headId } : idOf({ kind: 'TASK', epicHash: unit.epicHash, story: story.id, task: task.id });
	if ('error' in made) return made;
	return { token: made.id, value: { title: `${made.id} \u2014 ${task.title}`, body: renderTaskBody(parentRef ?? '', story.id, task, epicSlug, unit.epicHash, createdAt, repo, made.id), labels, issueType: cfg.taskIssueType } };
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
	/**
	 * A comment step names the marker its body carries ({@link postMarker}). Before an unrecorded comment step runs, the issue's
	 * comments are read and one holding the marker is recorded as already posted instead of posting again. The milestone and the
	 * task list are idempotent on the tracker already and carry none.
	 */
	readonly marker?: string | undefined;
}

/** A partial result is a normal outcome, not an exception. */
export interface ExtrasOutcome {
	readonly done:       string[];
	readonly skipped:    string[];
	/** Comment steps found already on the issue (by their marker) and recorded without posting again. */
	readonly reconciled: string[];
	readonly failed:     Array<{ name: string; reason: string }>;
}

export interface ExtrasDeps {
	readonly now?: ( () => string) | undefined;
	/** Writes the step's mark (default: into the unit's binding); `externalId` is the id of a reconciled comment. */
	readonly mark?: ((unit: UnitRef, name: ExtraName, at: string, externalId?: string) => void) | undefined;
	/** Reads the issue's comments, for the steps that carry a marker; called at most once per run. */
	readonly comments?: (() => PortResult<TrackerComment[]>) | undefined;
}

const POSTED_KIND: Readonly<Record<ExtraName, PostedKind>> = { milestone: 'milestone', taskList: 'task-list', designComment: 'design', reviewComment: 'review', planComment: 'plan' };

/** The stable marker a comment of kind `name` carries on the unit's issue: '<!-- insrc:post:<artifactId>:<kind> -->'. */
export function postMarker(unit: UnitRef, name: ExtraName): string {
	return `<!-- insrc:post:${bindingHome(unit)?.artifactId ?? unitKey(unit)}:${POSTED_KIND[name]} -->`;
}

/** The extras already posted for the unit, each with the time it was recorded: the binding's posted list. A Task with no artifact has none. */
function marksOf(unit: UnitRef): { readonly [K in ExtraName]?: string | undefined } {
	const home = bindingHome(unit);
	if (home === undefined) return {};
	const out: { [K in ExtraName]?: string | undefined } = {};
	for (const p of readBinding(home.repoPath, home.artifactId)?.posted ?? []) {
		const name = (Object.keys(POSTED_KIND) as ExtraName[]).find(n => POSTED_KIND[n] === p.kind);
		if (name !== undefined) out[name] = p.at;
	}
	return out;
}

function markExtra(unit: UnitRef, name: ExtraName, at: string, externalId?: string): void {
	const home = bindingHome(unit);
	if (home === undefined) throw new Error(`a ${unit.unit} unit has no binding to record a post on yet`);
	if (!recordPosted(home.repoPath, home.artifactId, POSTED_KIND[name], externalId, () => at)) throw new Error(`no binding on ${home.artifactId} to mark`);
}

/**
 * Run each approve-time extra on its own. A kind already in the unit's binding (`posted`) is skipped; a comment step that is not
 * recorded is first looked for on the issue by its marker (one read of the comments shared by the unit's steps), and one found
 * there is recorded without posting again; a step that succeeds is recorded before the next runs; a step that fails is left
 * unrecorded and reported. A comment list that cannot be read fails the step and posts nothing: an uncertain post is never
 * retried blind. A post whose record fails is reported, and the next run reconciles it by its marker instead of repeating it.
 */
export function runUnitExtras(unit: UnitRef, steps: readonly ExtraStep[], deps: ExtrasDeps = {}): ExtrasOutcome {
	const now = deps.now ?? (() => new Date().toISOString());
	const mark = deps.mark ?? markExtra;
	const marks = marksOf(unit);
	const out: ExtrasOutcome = { done: [], skipped: [], reconciled: [], failed: [] };
	let comments: PortResult<TrackerComment[]> | undefined;
	const commentsOnce = (): PortResult<TrackerComment[]> => {
		comments ??= deps.comments !== undefined ? deps.comments() : { ok: false, kind: 'rejected', reason: 'no way to read the issue\'s comments' };
		return comments;
	};
	for (const step of steps) {
		if (marks[step.name] !== undefined) { out.skipped.push(step.name); continue; }
		if (step.marker !== undefined) {
			const listed = commentsOnce();
			if (!listed.ok) {
				log.warn({ unit: unitKey(unit), step: step.name, reason: listed.reason }, 'unit-issue: the issue\'s comments could not be read (the post is not made; the next approve retries it)');
				out.failed.push({ name: step.name, reason: `cannot tell whether it was already posted: the comments could not be read (${listed.kind}): ${listed.reason}` });
				continue;
			}
			const found = listed.value.find(c => c.text.includes(step.marker as string));
			if (found !== undefined) {
				try { mark(unit, step.name, now(), found.externalId); out.reconciled.push(step.name); }
				catch (err) { out.failed.push({ name: step.name, reason: `already posted (comment ${found.externalId}), but its record was not written (${(err as Error).message}); the next approve records it` }); }
				continue;
			}
		}
		const r = step.run();
		if (!r.ok) {
			log.warn({ unit: unitKey(unit), step: step.name, reason: r.reason }, 'unit-issue: approve-time extra failed (left unrecorded; the next approve retries it)');
			out.failed.push({ name: step.name, reason: r.reason });
			continue;
		}
		try { mark(unit, step.name, now()); }
		catch (err) {
			// Posted, but unrecorded: reported as failed so the author sees it; the next run finds the post by its marker and does not repeat it.
			log.warn({ unit: unitKey(unit), step: step.name, err: (err as Error).message }, 'unit-issue: extra posted but its record was not written (the next approve reconciles it)');
			out.failed.push({ name: step.name, reason: `posted, but its record was not written (${(err as Error).message}); the next approve finds the post and records it` });
			continue;
		}
		out.done.push(step.name);
	}
	return out;
}
