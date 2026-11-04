/**
 * search.doc_relations (Epic c2ba6fa6 s10): the document relationships
 * touching an entity, in one direction, with each row's evidence -- 'model'
 * marks a proposal, shown only while the repository's switch is on. Refused,
 * like every search request, about a repository being indexed or whose index
 * did not finish (guardSearchRequest).
 */

import { guardSearchRequest, type SearchGuardDeps } from './search-guard.js';
import { readDocumentRelations } from '../indexer/doc-relations-read.js';
import type { DocumentRelations } from '../db/doc-relations.js';
import type { IndexJob } from '../shared/types.js';
import { lookupRepoId, UnregisteredRepoError } from '../db/repos.js';
import { checkDocRelationsSet } from '../indexer/doc-relations-measure.js';

export async function searchDocRelations(params: unknown, deps: SearchGuardDeps = {}): Promise<DocumentRelations> {
	const { entityId, direction } = (params ?? {}) as { entityId?: unknown; direction?: unknown };
	if (typeof entityId !== 'string' || entityId === '') throw new Error('search.doc_relations: entityId must be a non-empty string');
	if (direction !== 'out' && direction !== 'in') throw new Error("search.doc_relations: direction must be 'out' or 'in'");
	await guardSearchRequest({ entityIds: [entityId] }, deps);
	return readDocumentRelations(entityId, direction);
}

/**
 * docRelations.measure (Epic c2ba6fa6 s10): validate the repository's
 * hand-checked set (DocRelationsSetInvalid names what it lacks) and queue a
 * doc-relations-measure job on the summary lane; the figures appear in
 * repo.stats when it finishes. The job's model calls run one at a time on that
 * lane, never beside the pass.
 */
export async function measureDocRelations(
	params: unknown,
	deps:   { readonly enqueue: (job: IndexJob) => void },
): Promise<{ queued: true; setHash: string; checked: number }> {
	const { repoPath } = (params ?? {}) as { repoPath?: unknown };
	if (typeof repoPath !== 'string' || repoPath === '') throw new Error('docRelations.measure: repoPath must be a non-empty string');
	if (await lookupRepoId(repoPath) === undefined) throw new UnregisteredRepoError(repoPath);
	const { setHash, checked } = await checkDocRelationsSet(repoPath);
	deps.enqueue({ kind: 'doc-relations-measure', repoPath, setHash });
	return { queued: true, setHash, checked };
}
