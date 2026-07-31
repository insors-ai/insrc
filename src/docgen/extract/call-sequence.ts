/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — call-sequence extractor (Epic 870ed3dd, Story s3).
 *
 * Traces control flow OUTWARD from a chosen entry-point symbol over the indexed
 * CALLS graph and emits an ordered call sequence. The graph stores calls as
 * function/method→function/method `CALLS` edges, so this extractor resolves the
 * entry point, then runs a BOUNDED depth-limited DFS with an on-path visited set
 * that guarantees termination on cycles/recursion (ac2) and stops at a fixed
 * `maxDepth` (ac3). Emits a DERIVED-ONLY DocumentIR (k8); every frame + call is
 * a real graph entity + a real CALLS edge (k11), so nothing is invented.
 *
 * Depth-truncation is a DERIVED in-IR marker on an `ok` document (ac3 wants the
 * partial sequence shown WITH the truncation stated) — s3 deliberately does NOT
 * use the sc4 terminal `truncated` variant, which would drop the partial doc.
 * Cycle-repetition is a `calls` step marked so the renderer shows it as such
 * (ac2) rather than expanding without bound.
 *
 * Determinism: the walk is a deterministic function of the graph at the pinned
 * revision (frames in first-visit order, steps in visitation order), so the same
 * code re-extracts to a byte-identical IR (ac2's determinism sibling from s2).
 */

import { basename } from 'node:path';

import type { DocumentIR, IrNode, IrEdge } from '../types.js';
import { ok, emptyScope, notFound, sourceNotReady } from '../outcome.js';
import type { DocGenOutcome, DocTypeRegistration } from '../types.js';

export const CALL_SEQUENCE_DOCTYPE = 'call-sequence';

/** Default traversal depth when the caller supplies none. Bounds the DFS so it
 *  always terminates and keeps the rendered sequence legible. */
export const DEFAULT_MAX_DEPTH = 12;

/** A resolved participant in the call sequence: a function/method entity reduced
 *  to what the extractor + renderer need (name + indexed location for ac1). */
export interface CallFrameRef {
	readonly entityId:  string;
	readonly name:      string;
	readonly file:      string; // absolute path
	readonly startLine: number;
}

/** One ordered call step. `repeat` is true when `to` was already on the current
 *  DFS path (a cycle/recursion), so it is kept but NOT re-expanded (ac2). */
export interface CallStep {
	readonly from:   string; // CallFrameRef.entityId
	readonly to:     string; // CallFrameRef.entityId
	readonly repeat: boolean;
}

/** The completed bounded-DFS result the pure builder consumes. */
export interface CallWalk {
	readonly entry:             CallFrameRef;
	readonly frames:            readonly CallFrameRef[];  // first-visit order
	readonly steps:             readonly CallStep[];      // visitation order
	readonly truncatedFrameIds: readonly string[];        // frames cut at maxDepth (ac3)
	readonly depthUsed:         number;
}

/** The scope: a repo root + an entry-point symbol name + optional depth cap. */
export interface CallSequenceScope {
	readonly repoRoot: string;
	readonly symbol:   string;
	readonly maxDepth: number;
}

/** The graph reads this extractor needs (injected → testable core). Traversal,
 *  cycle detection and depth-capping live in makeExtract, NOT the reader. */
export interface CallGraphReader {
	revision(repoRoot: string): Promise<string | undefined>;
	/** Resolve the entry-point symbol to a function/method frame; undefined when
	 *  no such symbol is indexed (drives ac4 not-found). */
	resolveEntryPoint(scope: CallSequenceScope): Promise<CallFrameRef | undefined>;
	/** 1-hop CALLS successors of a frame, in recorded edge order, each resolved
	 *  to its indexed name + location. Dangling/unresolved targets are dropped. */
	calleesOf(entityId: string): Promise<readonly CallFrameRef[]>;
}

/** Label a frame with its indexed name + location: `name (file:line)` (ac1). */
function frameLabel(f: CallFrameRef): string {
	return `${f.name} (${basename(f.file)}:${f.startLine})`;
}

/**
 * Pure core: turn a completed CallWalk into a derived-only DocumentIR. One
 * 'call-frame' node per distinct visited frame (entityId-cited), one 'calls'
 * edge per ordered step (cycle-repeat steps carry a ':repeat' id suffix so the
 * renderer marks them), and one 'truncation' marker node per truncated frame
 * (citing the frame it attaches to) stating depthUsed. narrated.sections=[] (k8).
 */
export function buildCallSequenceIR(
	walk:             CallWalk,
	revision:         string,
	scopeDescription: string,
): DocumentIR {
	const frameNodes: IrNode[] = walk.frames.map(f => ({
		id:       f.entityId,
		label:    frameLabel(f),
		kind:     'call-frame',
		citation: { entityId: f.entityId },
	}));

	const edges: IrEdge[] = walk.steps.map((s, i) => ({
		id:       `call:${i}:${s.from}->${s.to}${s.repeat ? ':repeat' : ''}`,
		from:     s.from,
		to:       s.to,
		kind:     'calls',
		citation: { entityId: s.to },
	}));

	const truncationNodes: IrNode[] = walk.truncatedFrameIds.map(fid => ({
		id:       `trunc:${fid}`,
		label:    `truncated at depth ${walk.depthUsed}`,
		kind:     'truncation',
		citation: { entityId: fid },
	}));

	return {
		docType:             CALL_SEQUENCE_DOCTYPE,
		scopeDescription,
		derived:             { nodes: [...frameNodes, ...truncationNodes], edges },
		narrated:            { sections: [] },
		generatedAtRevision: revision,
	};
}

function parseScope(input: Record<string, unknown>): CallSequenceScope | undefined {
	const repoRoot = input['repo'];
	const symbol = input['symbol'];
	if (typeof repoRoot !== 'string' || repoRoot.length === 0) return undefined;
	if (typeof symbol !== 'string' || symbol.length === 0) return undefined;
	const rawDepth = input['maxDepth'];
	const maxDepth = typeof rawDepth === 'number' && Number.isFinite(rawDepth) && rawDepth > 0
		? Math.floor(rawDepth)
		: DEFAULT_MAX_DEPTH;
	return { repoRoot, symbol, maxDepth };
}

export const CALL_SEQUENCE_INPUT_SCHEMA: Record<string, unknown> = {
	type: 'object',
	additionalProperties: false,
	required: ['repo', 'symbol'],
	properties: {
		repo:     { type: 'string', description: 'Absolute repo root path (registered + indexed)' },
		symbol:   { type: 'string', description: 'Entry-point function/method name to trace outward from' },
		maxDepth: { type: 'integer', minimum: 1, description: `Traversal depth cap (default ${DEFAULT_MAX_DEPTH})` },
	},
};

/**
 * The bounded depth-limited DFS. Walks CALLS from the entry frame to `maxDepth`
 * with an on-path visited set: a callee already on the current path is recorded
 * as a repeat step and NOT re-expanded (cycle termination, ac2); a frame whose
 * callees sit beyond the cap is recorded as truncated (ac3). Frames are captured
 * in first-visit order.
 */
async function walkCallSequence(
	entry:    CallFrameRef,
	maxDepth: number,
	reader:   CallGraphReader,
): Promise<CallWalk> {
	const frames = new Map<string, CallFrameRef>();
	const steps: CallStep[] = [];
	const truncated = new Set<string>();
	const onPath = new Set<string>();

	frames.set(entry.entityId, entry);

	async function visit(frame: CallFrameRef, depth: number): Promise<void> {
		onPath.add(frame.entityId);
		const callees = await reader.calleesOf(frame.entityId);
		if (depth >= maxDepth) {
			if (callees.length > 0) truncated.add(frame.entityId);
		} else {
			for (const callee of callees) {
				if (!frames.has(callee.entityId)) frames.set(callee.entityId, callee);
				const repeat = onPath.has(callee.entityId);
				steps.push({ from: frame.entityId, to: callee.entityId, repeat });
				if (!repeat) await visit(callee, depth + 1);
			}
		}
		onPath.delete(frame.entityId);
	}

	await visit(entry, 0);

	return {
		entry,
		frames:            [...frames.values()],
		steps,
		truncatedFrameIds: [...truncated],
		depthUsed:         maxDepth,
	};
}

export function makeExtract(reader: CallGraphReader) {
	return async function extract(input: Record<string, unknown>): Promise<DocGenOutcome<DocumentIR>> {
		const scope = parseScope(input);
		if (scope === undefined) return emptyScope('call-sequence: no repo/symbol in scope input');

		const revision = await reader.revision(scope.repoRoot);
		if (revision === undefined) {
			return sourceNotReady(`repo '${scope.repoRoot}' is not finished indexing; no pinned revision to read`);
		}

		const entry = await reader.resolveEntryPoint(scope);
		if (entry === undefined) return notFound(scope.symbol);

		const walk = await walkCallSequence(entry, scope.maxDepth, reader);
		const desc = `call sequence from ${scope.symbol} (depth ${scope.maxDepth})`;
		return ok(buildCallSequenceIR(walk, revision, desc));
	};
}

export function callSequenceRegistration(reader: CallGraphReader): DocTypeRegistration {
	return {
		docType:    CALL_SEQUENCE_DOCTYPE,
		capability: {
			id:      CALL_SEQUENCE_DOCTYPE,
			summary: 'Call-sequence diagram: the ordered sequence of calls traced outward from a chosen entry-point function/method over the code graph\'s CALLS edges, with cycle/recursion and depth-truncation shown in the document.',
		},
		extractorInputSchema: CALL_SEQUENCE_INPUT_SCHEMA,
		extract: makeExtract(reader),
	};
}
