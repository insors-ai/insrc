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

export async function searchDocRelations(params: unknown, deps: SearchGuardDeps = {}): Promise<DocumentRelations> {
	const { entityId, direction } = (params ?? {}) as { entityId?: unknown; direction?: unknown };
	if (typeof entityId !== 'string' || entityId === '') throw new Error('search.doc_relations: entityId must be a non-empty string');
	if (direction !== 'out' && direction !== 'in') throw new Error("search.doc_relations: direction must be 'out' or 'in'");
	await guardSearchRequest({ entityIds: [entityId] }, deps);
	return readDocumentRelations(entityId, direction);
}
