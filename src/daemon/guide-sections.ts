/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_guide` (sc2) — per-workflow guidance section-addressing + the pure reader.
 *
 * The canonical steering source (prompts/steering-block.md) is partitioned into
 * per-workflow sections by marker pairs keyed by workflow name — the same
 * `<!-- insrc:… -->` idiom `steering-inject.ts` uses to delimit the injected
 * block. S003 authors each workflow's detail wrapped in the corresponding
 * marker pair; the daemon `guide.get` / `guide.list` IPC handlers read the
 * canonical asset and run the pure reader below to slice one section or list
 * the keys present. Everything here is a pure function of its string arguments
 * — no I/O — so it unit-tests over fixture text and stays wording-agnostic:
 * only the exact marker pair addresses a section, never a heading's wording.
 */

/** The `insrc_guide` request. `workflow` is optional so an omitted workflow is
 *  the structured validWorkflows path, not a wire-level rejection. */
export interface InsrcGuideInput {
	workflow?: string | undefined;
}

/** A hit: the requested workflow's full guidance section. */
export interface InsrcGuideOk {
	workflow: string;
	guidance: string;
}

/** A miss: a structured, machine-parseable error carrying the valid options. */
export interface InsrcGuideError {
	error: string;
	validWorkflows: string[];
}

/** The never-thrown result of a guide retrieval. */
export type InsrcGuideResult = InsrcGuideOk | InsrcGuideError;

/** The per-workflow section START marker for `key` (the addressing contract
 *  S003 authors against). */
export const guideMarkerStart = (key: string): string => `<!-- insrc:guide:${key}:start -->`;

/** The per-workflow section END marker for `key`. */
export const guideMarkerEnd = (key: string): string => `<!-- insrc:guide:${key}:end -->`;

// Matches an OPENING guide marker and captures the workflow key. Keys are the
// workflow names (letters, digits, dot, dash, underscore) — no spaces.
const GUIDE_START_RE = /<!--\s*insrc:guide:([A-Za-z0-9._-]+):start\s*-->/g;

/**
 * Slice the guidance section for `workflow` out of `steeringText`: the text
 * strictly between that key's own start and end markers, trimmed. Returns null
 * when the pair is absent, only half present, or inverted (end before start).
 * Inner text resembling another key's marker is returned verbatim as content —
 * addressing keys only on the requested key's exact marker pair. Pure: no I/O.
 */
export function readWorkflowGuide(steeringText: string, workflow: string): string | null {
	const start = guideMarkerStart(workflow);
	const end = guideMarkerEnd(workflow);
	const startIdx = steeringText.indexOf(start);
	if (startIdx === -1) return null;
	const bodyStart = startIdx + start.length;
	const endIdx = steeringText.indexOf(end, bodyStart);
	if (endIdx === -1) return null; // start present but no paired end after it
	return steeringText.slice(bodyStart, endIdx).trim();
}

/**
 * Enumerate the workflow keys whose COMPLETE start/end marker pair is present,
 * in document order. A key with only a start (or only an end, or an inverted
 * pair) is NOT listed. Pure: no I/O.
 */
export function listWorkflowGuides(steeringText: string): string[] {
	const keys: string[] = [];
	const seen = new Set<string>();
	GUIDE_START_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = GUIDE_START_RE.exec(steeringText)) !== null) {
		const key = match[1];
		if (key === undefined || seen.has(key)) continue;
		// Only list it when its paired end marker follows this start.
		const endIdx = steeringText.indexOf(guideMarkerEnd(key), match.index);
		if (endIdx !== -1) {
			keys.push(key);
			seen.add(key);
		}
	}
	return keys;
}

// --- daemon guide.get / guide.list handler logic (over an injected reader) ---

/**
 * Shape the `guide.get` result for `workflow`, reading the canonical steering
 * text via the injected `readSteering` seam (the daemon passes `readSteeringBlock`).
 * Never throws: a read failure, an omitted workflow, or an unknown workflow all
 * become a structured InsrcGuideError (k3, k5). The seam is a parameter so this
 * is unit-testable over fixture text + a throwing reader without a live socket.
 */
export function guideGetResult(
	readSteering: () => string,
	workflow: string | undefined,
): InsrcGuideResult {
	let text: string;
	try {
		text = readSteering();
	} catch {
		return { error: 'guidance source unavailable', validWorkflows: [] };
	}
	if (typeof workflow !== 'string' || workflow.length === 0) {
		return { error: 'workflow is required', validWorkflows: listWorkflowGuides(text) };
	}
	const guidance = readWorkflowGuide(text, workflow);
	if (guidance === null) {
		return { error: `unknown workflow: ${workflow}`, validWorkflows: listWorkflowGuides(text) };
	}
	return { workflow, guidance };
}

/**
 * Shape the `guide.list` result: the workflow keys with a complete marker pair,
 * or [] when the steering source cannot be read. Never throws.
 */
export function guideListResult(readSteering: () => string): { workflows: string[] } {
	try {
		return { workflows: listWorkflowGuides(readSteering()) };
	} catch {
		return { workflows: [] };
	}
}
