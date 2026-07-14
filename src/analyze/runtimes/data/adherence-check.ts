/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: data.adherence.check
 *
 * plans/docs-module.md Phase 4. Data-side adherence check. Thin
 * wrapper around the shared adherence runner. Hydrates excerpts
 * from indexed data-adjacent config + SQL files
 * (`schema.sql`, `migrations/*.sql`, `*.dbml`, `*.prisma`,
 * `*.orm.ts`, etc.) that mention the subject.
 *
 * V1 hydration is index-driven: we scan LMDB doc/config/section
 * entities filtered by extension + basename patterns. Later
 * versions may add live-connection introspection.
 */

import { getDb } from '../../../db/client.js';
import { listEntitiesByKinds, listEntitiesForRepo } from '../../../db/entities.js';
import type { Entity } from '../../../shared/types.js';

import { runAdherenceCheck, type AdherenceExcerpt } from '../shared/adherence.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';

const TEMPLATE_ID = 'data.adherence.check';
export const DATA_ADHERENCE_CHECK_PROMPT_PATH = 'prompts/analyze/code.adherence-check.system.md';
// Reuses the code adherence prompt -- it's target-agnostic; the shared
// runner writes "Data" / "Data subject:" into the prompt at call time.

/** File-level markers for data-adjacent content. */
const DATA_FILE_MARKERS: readonly RegExp[] = [
	/\.sql$/i,
	/\.dbml$/i,
	/\.prisma$/i,
	/schema\.[a-z]+$/i,
	/\/migrations?\//i,
	/orm[.-]/i,
	/[.-](model|models|schema|schemas)\.[a-z]+$/i,
	/[.-](repository|repositories)\.[a-z]+$/i,
];

function isDataFile(file: string): boolean {
	for (const rx of DATA_FILE_MARKERS) {
		if (rx.test(file)) return true;
	}
	return false;
}

async function hydrateDataExcerpts(
	dataSubject: string,
	repoPath:    string,
	cap:         number,
): Promise<readonly AdherenceExcerpt[]> {
	const db = await getDb();
	const out: AdherenceExcerpt[] = [];
	const q = dataSubject.toLowerCase();

	// Strategy 1: SQL / .prisma / .dbml / config entities matching subject.
	const artefacts = await listEntitiesByKinds(
		db, ['document', 'section', 'config'], { repo: repoPath },
	);
	for (const e of artefacts) {
		if (!isDataFile(e.file)) continue;
		const body = (e.body ?? '').toLowerCase();
		if (body.length === 0) continue;
		if (body.includes(q) || e.file.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)) {
			out.push(entityToExcerpt(e));
			if (out.length >= cap) return out;
		}
	}

	// Strategy 2: code entities in data-adjacent files. Same subject
	// grep but restricted to isDataFile-matching entities.
	const codeEntities = await listEntitiesForRepo(db, repoPath);
	for (const e of codeEntities) {
		if (e.artifact === true) continue;
		if (!isDataFile(e.file)) continue;
		const body = (e.body ?? '').toLowerCase();
		if (body.length === 0) continue;
		if (body.includes(q)) {
			out.push(entityToExcerpt(e));
			if (out.length >= cap) break;
		}
	}
	return out;
}

function entityToExcerpt(e: Entity): AdherenceExcerpt {
	return {
		entityId:  e.id,
		file:      e.file,
		kind:      e.kind,
		name:      e.name,
		body:      (e.body ?? '').slice(0, 1_200),
		lineStart: e.startLine,
		lineEnd:   e.endLine,
	};
}

export const dataAdherenceCheckRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const result = await runAdherenceCheck({
			executeArgs:      args,
			subjectKey:       'dataSubject',
			subjectLabel:     'Data',
			templateId:       TEMPLATE_ID,
			promptRelPath:    DATA_ADHERENCE_CHECK_PROMPT_PATH,
			hydrateExcerpts:  hydrateDataExcerpts,
		});

		return {
			outputs: new Map<string, unknown>([['adherence-report', {
				dataSubject:    result.subject,
				matches:        result.matches,
				drifts:         result.drifts,
				missingImpl:    result.missingImpl,
				contradictions: result.contradictions,
				diagnostics:    result.diagnostics,
			}]]),
		};
	},
};
