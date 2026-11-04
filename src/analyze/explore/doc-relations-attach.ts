/**
 * The related links of doc.mention hits, attached at read (Epic c2ba6fa6 s10).
 *
 * doc.mention is cacheable, and a cached output is served without its runner;
 * a paused analyze step restores earlier outputs from its continuation. Neither
 * may carry document relationships as they were: a measurement may have
 * switched proposals off, a proposal may have been published or its endpoint
 * removed since. So the runner never writes them (the cache holds none) and
 * this one function computes them from the store every time an output is
 * obtained -- fresh, from any cache hit, or restored -- replacing whatever an
 * output carried.
 */

import { relative } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { captureAnalysisDiagnostics } from '../connection-access.js';
import type { RelationEvidence } from '../../shared/types.js';
import { getEntity } from '../../db/entities.js';
import { readDocumentRelations } from '../../indexer/doc-relations-read.js';
import { DOCUMENT_LINK_NOUN, evidenceOrigin } from './usage-example.js';
import type { DocMentionHit, DocMentionOutput, DocMentionRelated, ExplorationOutput } from './types.js';

const log = getLogger('analyze:explore:doc-relations');

export async function attachDocRelations(output: ExplorationOutput): Promise<ExplorationOutput> {
	if (output.type !== 'doc.mention') return output;
	const { relatedOrigin: _o, relatedStale: _s, relatedUnreadable: _u, ...base } = output as DocMentionOutput;
	void _o; void _s; void _u;
	const evidence: RelationEvidence[] = [];
	let stale = 0;
	let oldest: number | undefined;
	let current = 0;
	const hits: DocMentionHit[] = [];
	const unreadable: string[] = [];
	for (const { related: _r, ...hit } of base.hits) {
		void _r;
		let related: DocMentionRelated[] = [];
		try {
			const read = await readDocumentRelations(hit.entityId, 'out');
			current = Math.max(current, read.generation);
			stale += read.staleProposals;
			for (const row of read.rows) {
				const target = await getEntity(null, row.to);
				if (target === null) continue;
				evidence.push(row.evidence);
				if (row.evidence === 'model' && row.computedAtGeneration !== undefined && row.computedAtGeneration < read.generation) {
					oldest = oldest === undefined ? row.computedAtGeneration : Math.min(oldest, row.computedAtGeneration);
				}
				related.push({
					entityId: row.to,
					file:     relative(target.repo, target.file),
					evidence: row.evidence,
					...(row.computedAtGeneration !== undefined ? { computedAtGeneration: row.computedAtGeneration } : {}),
				});
			}
		} catch (err) {
			// Not swallowed: the output says the related links of this hit could not be read, and why.
			unreadable.push(`${hit.file}: ${(err as Error).message}`);
			captureAnalysisDiagnostics(log).emit('warn', () => [{ entityId: hit.entityId, err: (err as Error).message }, 'doc.mention: related links could not be read; the hit is returned without them']);
			related = [];
		}
		hits.push(related.length > 0 ? { ...hit, related } : hit);
	}
	return {
		...base,
		hits,
		...(evidence.length > 0 ? { relatedOrigin: evidenceOrigin(evidence, DOCUMENT_LINK_NOUN).note } : {}),
		...(unreadable.length > 0 ? { relatedUnreadable: `The related document links of ${unreadable.length} hit${unreadable.length === 1 ? '' : 's'} could not be read: ${unreadable.join('; ')}` } : {}),
		...(stale > 0 ? { relatedStale: `${stale} model-proposed link${stale === 1 ? ' was' : 's were'} computed from an older index (generation ${oldest}; the index is now at generation ${current})` } : {}),
	};
}
