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
import { documentRelations, readDocRelationQuality, readDocRelationRowsInTxn, switchOf, type DocRelationSwitchState, type DocumentRelations } from '../db/doc-relations.js';
import { getGraphStore } from '../db/graph/store.js';
import { lookupRepoIdInTxn } from '../db/repos.js';
import { readIndexState } from '../db/index-state.js';
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

/** Test seam: a switch that replaces the computed one (the computed one needs this machine's model config). */
let switchOverride: ((repoPath: string) => { readonly state: DocRelationSwitchState; readonly modelId?: string | undefined }) | undefined;
export function _overrideDocRelationsSwitchForTest(fn: typeof switchOverride): void { switchOverride = fn; }

/** The switch for a repository now, and the model it holds for. */
export async function currentDocRelationsSwitch(
	repoPath: string,
	cfg:      AnalyzeConfig = loadAnalyzeConfig(),
): Promise<{ readonly state: DocRelationSwitchState; readonly modelId?: string | undefined }> {
	if (switchOverride !== undefined) return switchOverride(repoPath);
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

/**
 * The revision of everything a document-relationship read depends on beyond
 * the graph rows (Epic c2ba6fa6 s10): the repository's IndexState generation
 * (every file commit advances it), its quality row, its proposal rows, the
 * validated mid-tier model and the hand-checked set. A cached context bundle
 * stamped with another revision is rebuilt.
 */
export async function docRelationsRevision(repoPath: string, cfg: AnalyzeConfig = loadAnalyzeConfig()): Promise<string> {
	const s = await getGraphStore();
	const repoId = lookupRepoIdInTxn(s, repoPath);
	const rows = repoId === undefined ? [] : [...readDocRelationRowsInTxn(s, repoId)].map(([file, r]) => [file, r.contentHash, r.modelId, r.computedAtGeneration, r.proposals.length]);
	const model = validatedDocRelationsModel(cfg, repoPath);
	return createHash('sha256').update(JSON.stringify({
		generation: (await readIndexState(repoPath))?.generation ?? null,
		quality:    (await readDocRelationQuality(repoPath)) ?? null,
		rows,
		model:      model.ok ? model.model.id : null,
		set:        docRelationsSetHash(repoPath) ?? null,
	})).digest('hex');
}
