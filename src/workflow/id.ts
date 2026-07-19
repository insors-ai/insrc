/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Hierarchical workflow id — a canonical, globally-unique, both-way id
 * DERIVED from the existing structural ids `(epicHash, createdAtISO,
 * storyId?, taskId?)`.
 *
 * This is a pure string/struct layer: it renames nothing, re-hashes
 * nothing, and never touches disk. `hash8` is simply the first 8 chars
 * of the already-computed 16-hex `epicHash` (see `workflow/hash.ts`) —
 * NOT a fresh hash.
 *
 * Two serializations, both round-trippable at every level. They share
 * one fixed-width epic segment (`E` + 8-digit date + 8-hex hash, no
 * separator between date and hash); the two forms differ only in the
 * level separator, so `toSlug(x) === toCanonical(x).replaceAll(':','-')`:
 *
 *   Canonical : E<YYYYMMDD><hash8>:S<nnn>:T<nnn>
 *   Slug      : E<YYYYMMDD><hash8>-S<nnn>-T<nnn>
 *
 *   - `<YYYYMMDD>` is the UTC date of `createdAtISO`.
 *   - `<hash8>`    is `epicHash.slice(0, 8)`.
 *   - `<nnn>`      is the ordinal from a `s<n>` / `t<n>` label, zero-
 *                  padded to at least 3 digits (an ordinal >= 1000 keeps
 *                  its full width — it is never truncated).
 *
 * Levels: Epic = `E<…>`; Story = `E<…>:S<…>`; Task = `E<…>:S<…>:T<…>`
 * (mirrored in the slug form with dashes).
 *
 * Worked example:
 *   epicHash  '185807ba9a6b35d3'
 *   createdAt '2026-07-17T07:42:28.275Z'
 *   storyId   's1'  taskId 't3'
 *     → canonical E20260717185807ba:S001:T003
 *     → slug      E20260717185807ba-S001-T003
 */

// ---------------------------------------------------------------------------
// Struct
// ---------------------------------------------------------------------------

export interface WorkflowId {
	readonly level: 'epic' | 'story' | 'task';
	/** UTC date, `YYYYMMDD`. */
	readonly date:  string;
	/** First 8 chars of the 16-hex epicHash. */
	readonly hash8: string;
	/** Story ordinal (`s1` → 1). Present at story + task levels. */
	readonly story?: number | undefined;
	/** Task ordinal (`t3` → 3). Present at task level. */
	readonly task?: number | undefined;
}

// ---------------------------------------------------------------------------
// Serialization regexes
// ---------------------------------------------------------------------------

/** Canonical form (colon-separated levels). Task only ever appears
 *  nested under a Story. The epic segment is fixed-width — `E` + 8-digit
 *  date + 8-hex hash with no separator — so `E<8><8>` parses unambiguously. */
const CANONICAL_RE = /^E(\d{8})([0-9a-f]{8})(?::S(\d+)(?::T(\d+))?)?$/;
/** Slug form (dash-separated levels; filesystem / label / URL safe). */
const SLUG_RE      = /^E(\d{8})([0-9a-f]{8})(?:-S(\d+)(?:-T(\d+))?)?$/;

// ---------------------------------------------------------------------------
// Derivation helpers (pure)
// ---------------------------------------------------------------------------

/** UTC `YYYYMMDD` for an ISO 8601 timestamp. Throws on an invalid date. */
function utcDate(createdAtISO: string): string {
	const d = new Date(createdAtISO);
	if (Number.isNaN(d.getTime())) {
		throw new Error(`workflowId: invalid createdAt ISO '${createdAtISO}'`);
	}
	const y   = String(d.getUTCFullYear()).padStart(4, '0');
	const m   = String(d.getUTCMonth() + 1).padStart(2, '0');
	const day = String(d.getUTCDate()).padStart(2, '0');
	return `${y}${m}${day}`;
}

/** First 8 chars of a >=8-char lowercase-hex epicHash. Does NOT re-hash. */
function hash8Of(epicHash: string): string {
	if (typeof epicHash !== 'string' || !/^[0-9a-f]{8,}$/.test(epicHash)) {
		throw new Error(`workflowId: epicHash must be >=8-char lowercase hex (got ${typeof epicHash === 'string' ? `'${epicHash}'` : typeof epicHash})`);
	}
	return epicHash.slice(0, 8);
}

/** Zero-pad an ordinal to at least 3 digits (full width when >= 1000). */
function padOrdinal(n: number): string {
	return String(n).padStart(3, '0');
}

// ---------------------------------------------------------------------------
// Label bridges (structural `s<n>` / `t<n>` ↔ ordinal)
// ---------------------------------------------------------------------------

export function storyIdToOrdinal(storyId: string): number {
	const m = /^s(\d+)$/.exec(storyId);
	if (m === null) throw new Error(`invalid storyId '${storyId}' (expected s<n>)`);
	return Number(m[1]);
}

export function ordinalToStoryId(ordinal: number): string {
	return `s${ordinal}`;
}

export function taskIdToOrdinal(taskId: string): number {
	const m = /^t(\d+)$/.exec(taskId);
	if (m === null) throw new Error(`invalid taskId '${taskId}' (expected t<n>)`);
	return Number(m[1]);
}

export function ordinalToTaskId(ordinal: number): string {
	return `t${ordinal}`;
}

// ---------------------------------------------------------------------------
// Minters from structural ids
// ---------------------------------------------------------------------------

export function epicWorkflowId(epicHash: string, createdAtISO: string): WorkflowId {
	return { level: 'epic', date: utcDate(createdAtISO), hash8: hash8Of(epicHash) };
}

export function storyWorkflowId(epicHash: string, createdAtISO: string, storyId: string): WorkflowId {
	return {
		level: 'story',
		date:  utcDate(createdAtISO),
		hash8: hash8Of(epicHash),
		story: storyIdToOrdinal(storyId),
	};
}

export function taskWorkflowId(epicHash: string, createdAtISO: string, storyId: string, taskId: string): WorkflowId {
	return {
		level: 'task',
		date:  utcDate(createdAtISO),
		hash8: hash8Of(epicHash),
		story: storyIdToOrdinal(storyId),
		task:  taskIdToOrdinal(taskId),
	};
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

export function toCanonical(id: WorkflowId): string {
	let s = `E${id.date}${id.hash8}`;
	if (id.story !== undefined) s += `:S${padOrdinal(id.story)}`;
	if (id.task  !== undefined) s += `:T${padOrdinal(id.task)}`;
	return s;
}

/** Slug form — the canonical with every level separator `:` → `-`. */
export function toSlug(id: WorkflowId): string {
	return toCanonical(id).replaceAll(':', '-');
}

// ---------------------------------------------------------------------------
// Parse (canonical OR slug, any level)
// ---------------------------------------------------------------------------

export function parseWorkflowId(s: string): WorkflowId | null {
	if (typeof s !== 'string') return null;
	const m = CANONICAL_RE.exec(s) ?? SLUG_RE.exec(s);
	if (m === null) return null;
	const date  = m[1]!;
	const hash8 = m[2]!;
	const storyStr = m[3];
	const taskStr  = m[4];
	if (taskStr !== undefined) {
		return { level: 'task', date, hash8, story: Number(storyStr), task: Number(taskStr) };
	}
	if (storyStr !== undefined) {
		return { level: 'story', date, hash8, story: Number(storyStr) };
	}
	return { level: 'epic', date, hash8 };
}

/** Cheap guard — a string is a (canonical or slug) workflow id. */
export function isWorkflowIdString(s: string): boolean {
	return parseWorkflowId(s) !== null;
}

// ---------------------------------------------------------------------------
// Hierarchy derivation (pure struct ops)
// ---------------------------------------------------------------------------

/** Parent in the hierarchy: task → story → epic → null. */
export function parentId(id: WorkflowId): WorkflowId | null {
	if (id.level === 'task')  return { level: 'story', date: id.date, hash8: id.hash8, story: id.story };
	if (id.level === 'story') return { level: 'epic',  date: id.date, hash8: id.hash8 };
	return null;
}

/** The Epic-level id for any id. */
export function epicOf(id: WorkflowId): WorkflowId {
	return { level: 'epic', date: id.date, hash8: id.hash8 };
}

export function isEpicId(id: WorkflowId):  boolean { return id.level === 'epic'; }
export function isStoryId(id: WorkflowId): boolean { return id.level === 'story'; }
export function isTaskId(id: WorkflowId):  boolean { return id.level === 'task'; }
