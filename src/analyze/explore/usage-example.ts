import { captureAnalysisDiagnostics } from '../connection-access.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * usage.example exploration runner.
 *
 * docs/plans/exploration-based-context-build.md Phase 3. Given a symbol
 * (by name OR entityId), enumerate the callers that invoke it. The
 * synthesizer uses this to cite real code sites in adherence /
 * capability / how-does-it-work bundles.
 *
 * Backing: `findCallers` (1-hop CALLS predecessors) from db/search.
 * Deterministic + repo-closure-scoped. No LLM.
 */

import { getDb } from '../../db/client.js';
import { findCallers } from '../../db/search.js';
import { findEntitiesByName, getEntity } from '../../db/entities.js';
import { getLogger } from '../../shared/logger.js';
import type { Entity, EntityKind, RelationEvidence } from '../../shared/types.js';

import type {
	Exploration,
	EvidenceOrigin,
	ExplorationRunnerContext,
	UsageExampleHit,
	UsageExampleOutput,
} from './types.js';
import { graphCompleteness, reachedLimit } from './completeness-facts.js';

const log = getLogger('analyze:explore:usage-example');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_TOP_K = 12;
const MAX_TOP_K     = 40;

const DEFAULT_TARGET_KINDS: readonly EntityKind[] = [
	'function', 'method', 'class',
];

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface UsageExampleParams {
	/** Either symbolName OR entityId is required. When both are
	 *  supplied, entityId wins. */
	readonly symbolName?: string;
	readonly entityId?:   string;
	readonly kinds?:      readonly EntityKind[];
	readonly topK?:       number;
}

function parseParams(exp: Exploration): UsageExampleParams {
	const p = exp.params as Record<string, unknown>;
	const symbolName = typeof p['symbolName'] === 'string'
		? (p['symbolName'] as string).trim()
		: undefined;
	const entityId = typeof p['entityId'] === 'string'
		? (p['entityId'] as string).trim()
		: undefined;
	if ((symbolName === undefined || symbolName.length === 0)
	 && (entityId   === undefined || entityId.length   === 0)) {
		throw new Error(
			'usage.example: one of params.symbolName or params.entityId is required',
		);
	}
	const kindsRaw = p['kinds'];
	const kinds = Array.isArray(kindsRaw)
		? kindsRaw.filter(k => typeof k === 'string') as EntityKind[]
		: undefined;
	const topK = typeof p['topK'] === 'number' && p['topK']! > 0
		? Math.min(MAX_TOP_K, Math.floor(p['topK'] as number))
		: DEFAULT_TOP_K;
	return {
		...(symbolName !== undefined && symbolName.length > 0 ? { symbolName } : {}),
		...(entityId   !== undefined && entityId.length   > 0 ? { entityId }   : {}),
		...(kinds      !== undefined && kinds.length > 0     ? { kinds }      : {}),
		topK,
	};
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runUsageExample(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<UsageExampleOutput> {
	const params = parseParams(exp);
	const db = await getDb();

	// (1) Resolve the target entity. If entityId is given, use it
	// verbatim. Otherwise resolve symbolName via findEntitiesByName;
	// if that returns multiple candidates, pick the top hit but log
	// the ambiguity so the synthesizer knows.
	const targetKinds = params.kinds ?? DEFAULT_TARGET_KINDS;
	let target: Entity | undefined;
	let ambiguousCandidates = 0;
	if (params.entityId !== undefined) {
		const row = await getEntity(db, params.entityId);
		if (row !== null) target = row;
	} else {
		const rows = (
			await findEntitiesByName(
				db,
				[params.symbolName!],
				{ repo: ctx.repoPath, kinds: targetKinds },
			)
		)
			// Drop stale entities under gitignored paths so the compiled
			// twin doesn't hijack the usage-example resolution.
			.filter(r => ctx.ignoreFilter.isIncluded(r.file));
		ambiguousCandidates = rows.length;
		if (rows.length > 0) {
			// Prefer the non-artefact / non-test-path candidate.
			const preferred = rows.find(r => r.artifact !== true
				&& !/(^|\/)(tests?|__tests__|test|spec|specs)\//i.test(r.file));
			target = preferred ?? rows[0]!;
		}
	}

	if (target === undefined) {
		captureAnalysisDiagnostics(log, ctx.connectionExecution).emit('info', () => [{
				runId:      ctx.runId,
				symbolName: params.symbolName,
				entityId:   params.entityId,
				ambiguous:  ambiguousCandidates,
		}, 'usage.example: target not resolved; returning empty output']);
		return {
			type:         'usage.example',
			// Nothing in the graph carries this name or id: an empty result, and a complete one.
			completeness: graphCompleteness({ returned: 0, repoCompleteness: ctx.repoCompleteness }),
			subject:      params.symbolName ?? params.entityId ?? '',
			callers:      [],
			origin:       evidenceOrigin([]),
		};
	}

	// (2) 1-hop callers via CALLS predecessors.
	const callers = await findCallers(db, target.id);

	// (3) Cap deterministically -- rank by file+line so results are
	// reproducible across runs (same input, same output).
	callers.sort((a, b) => {
		if (a.file !== b.file) return a.file.localeCompare(b.file);
		return a.startLine - b.startLine;
	});
	const topK = params.topK ?? DEFAULT_TOP_K;
	const capped = callers.slice(0, topK);

	const hits: UsageExampleHit[] = capped.map(e => ({
		entityId:  e.id,
		name:      e.name,
		kind:      e.kind,
		file:      e.file,
		startLine: e.startLine,
		endLine:   e.endLine,
		...(e.signature !== undefined && e.signature.length > 0 ? { signature: e.signature } : {}),
		evidence:  e.evidence,
	}));

	captureAnalysisDiagnostics(log, ctx.connectionExecution).emit('info', () => [{
			runId:         ctx.runId,
			subject:       params.symbolName ?? params.entityId,
			targetId:      target.id,
			totalCallers:  callers.length,
			returned:      hits.length,
			ambiguous:     ambiguousCandidates,
	}, 'usage.example: complete']);

	return {
		type:            'usage.example',
		completeness: graphCompleteness({
			repoCompleteness: ctx.repoCompleteness,
			returned: hits.length,
			found:    callers.length,
			limited:  callers.length > topK ? [reachedLimit('callers', topK, 'overall', callers.length)] : [],
			// Several entities carry the name and the callers of only one were read.
			skipped:  ambiguousCandidates > 1
				? [{
					what:   `${ambiguousCandidates - 1} other ${ambiguousCandidates - 1 === 1 ? 'entity' : 'entities'} named ${params.symbolName ?? target.name}`,
					reason: `the name is ambiguous and only the callers of ${target.file}:${target.startLine} were read`,
				}]
				: [],
		}),
		subject:         params.symbolName ?? target.name,
		targetEntityId:  target.id,
		callers:         hits,
		origin:          evidenceOrigin(hits.map(h => h.evidence)),
	};
}

const CALLER_NOUN = { one: 'listed caller', many: 'listed callers', none: 'No callers are listed.' } as const;

/** The noun a document's related links are worded with (Epic c2ba6fa6 s10). */
export const DOCUMENT_LINK_NOUN = { one: 'related document link', many: 'related document links' } as const;

/**
 * How the listed callers' relationships were established, counted and said in
 * one sentence an answer can quote (Epic c2ba6fa6 s7, ac4): which rest on
 * inferred or chosen relationships, and that ones stored before evidence was
 * recorded are of unknown origin -- never presented as read from the source.
 */
export function evidenceOrigin(
	evidence: readonly RelationEvidence[],
	/** What the relationships are called (s10): the listed callers by default, so existing sentences are unchanged. */
	noun: { readonly one: string; readonly many: string; readonly none?: string | undefined } = CALLER_NOUN,
): EvidenceOrigin {
	const counts: Partial<Record<RelationEvidence, number>> = {};
	for (const e of evidence) counts[e] = (counts[e] ?? 0) + 1;
	const n = evidence.length;
	if (n === 0) return { counts, note: noun.none ?? `No ${noun.many} are listed.` };
	const of = (k: RelationEvidence): number => counts[k] ?? 0;
	const callers = (c: number): string => `${c} of ${n} ${n === 1 ? noun.one : noun.many}`;
	if (of('unknown') === n) {
		return { counts, note: `The origin of ${n === 1 ? `the ${noun.one}` : `all ${n} ${noun.many}`} is unknown: ${n === 1 ? 'its relationship was' : 'their relationships were'} stored before the index recorded how relationships are established, so none is known to be read from the source.` };
	}
	const parts: string[] = [];
	if (of('extracted') > 0) parts.push(`${callers(of('extracted'))} read directly from the source`);
	if (of('inferred') > 0) parts.push(`${callers(of('inferred'))} inferred by resolution across files`);
	if (of('chosen') > 0) parts.push(`${callers(of('chosen'))} chosen among several candidates`);
	if (of('model') > 0) parts.push(`${callers(of('model'))} proposed by a model`);
	if (of('unknown') > 0) parts.push(`${callers(of('unknown'))} of unknown origin (stored before evidence was recorded)`);
	return { counts, note: `${parts.join('; ')}.` };
}
