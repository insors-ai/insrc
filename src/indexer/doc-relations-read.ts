/**
 * The read of document relationships as the daemon serves it (Epic c2ba6fa6
 * s10): the switch computed now -- the repository's recorded figures, the
 * mid-tier model that runs now and the hand-checked set as it is now -- and the
 * store's documentRelations under it.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadAnalyzeConfig, type AnalyzeConfig } from '../config/analyze.js';
import { getEntity } from '../db/entities.js';
import { documentRelations, readDocRelationQuality, switchOf, type DocRelationSwitchState, type DocumentRelations } from '../db/doc-relations.js';
import { validatedDocRelationsModel } from './doc-relations-provider.js';

/** Where a repository keeps its hand-checked set. */
export const DOC_RELATIONS_SET_FILE = join('.insrc', 'doc-relations-checked.json');

/** The sha256 of the repository's hand-checked set file, or undefined when it has none. */
export function docRelationsSetHash(repoPath: string): string | undefined {
	try {
		return createHash('sha256').update(readFileSync(join(repoPath, DOC_RELATIONS_SET_FILE))).digest('hex');
	} catch {
		return undefined;
	}
}

/** The switch for a repository now, and the model it holds for. */
export async function currentDocRelationsSwitch(
	repoPath: string,
	cfg:      AnalyzeConfig = loadAnalyzeConfig(),
): Promise<{ readonly state: DocRelationSwitchState; readonly modelId?: string | undefined }> {
	const model = validatedDocRelationsModel(cfg, repoPath);
	const modelId = model.ok ? model.model.id : undefined;
	return { state: switchOf(await readDocRelationQuality(repoPath), modelId, docRelationsSetHash(repoPath)), ...(modelId !== undefined ? { modelId } : {}) };
}

/** documentRelations under the repository's switch as it is now. */
export async function readDocumentRelations(entityId: string, direction: 'out' | 'in'): Promise<DocumentRelations> {
	const entity = await getEntity(null, entityId);
	if (entity === null) return { rows: [], generation: 0, staleProposals: 0 };
	return documentRelations(entityId, direction, await currentDocRelationsSwitch(entity.repo));
}
