/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: code.adherence.check
 *
 * plans/docs-module.md Phase 4. Thin wrapper around the shared
 * adherence runner. This module owns the code-specific excerpt
 * hydration: file-path -> findEntitiesByFile, symbol-like ->
 * findEntitiesByName, fallback -> partial body search over the
 * repo's non-artefact entities.
 */

import { getDb } from '../../../db/client.js';
import {
	findEntitiesByFile,
	findEntitiesByName,
	listEntitiesForRepo,
} from '../../../db/entities.js';
import type { Entity } from '../../../shared/types.js';

import { runAdherenceCheck, type AdherenceExcerpt } from '../shared/adherence.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';

const TEMPLATE_ID = 'code.adherence.check';
export const CODE_ADHERENCE_CHECK_PROMPT_PATH = 'prompts/analyze/code.adherence-check.system.md';

const CODE_SUFFIXES = ['.ts', '.tsx', '.py', '.go', '.java', '.scala', '.rs', '.js', '.mjs', '.cjs'];

async function hydrateCodeExcerpts(
	codeSubject: string,
	repoPath:    string,
	cap:         number,
): Promise<readonly AdherenceExcerpt[]> {
	const db = await getDb();
	const out: AdherenceExcerpt[] = [];
	const subject = codeSubject.trim();

	// Strategy 1: exact file-path match.
	if (subject.includes('/') || CODE_SUFFIXES.some(sfx => subject.endsWith(sfx))) {
		const abs = subject.startsWith('/') ? subject : `${repoPath}/${subject}`;
		const byFile = await findEntitiesByFile(db, abs);
		for (const e of byFile) {
			if (e.artifact === true) continue;
			out.push(entityToExcerpt(e));
			if (out.length >= cap) return out;
		}
		if (out.length > 0) return out;
	}

	// Strategy 2: single-token subject -> name lookup.
	const bare = subject.split(/[^A-Za-z0-9_]+/).find(t => t.length >= 2);
	if (bare !== undefined) {
		const byName = await findEntitiesByName(db, [bare], { repo: repoPath });
		for (const e of byName) {
			if (e.artifact === true) continue;
			if (e.repo !== repoPath) continue;
			out.push(entityToExcerpt(e));
			if (out.length >= cap) return out;
		}
		if (out.length > 0) return out;
	}

	// Strategy 3: partial-body grep over the repo's non-artefact entities.
	const q = subject.toLowerCase();
	const inRepo = await listEntitiesForRepo(db, repoPath);
	for (const e of inRepo) {
		if (e.artifact === true) continue;
		if (e.kind === 'file')   continue;
		const body = (e.body ?? '').toLowerCase();
		if (body.length === 0)   continue;
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

export const codeAdherenceCheckRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const result = await runAdherenceCheck({
			executeArgs:      args,
			subjectKey:       'codeSubject',
			subjectLabel:     'Code',
			templateId:       TEMPLATE_ID,
			promptRelPath:    CODE_ADHERENCE_CHECK_PROMPT_PATH,
			hydrateExcerpts:  hydrateCodeExcerpts,
		});

		return {
			outputs: new Map<string, unknown>([['adherence-report', {
				codeSubject:    result.subject,
				matches:        result.matches,
				drifts:         result.drifts,
				missingImpl:    result.missingImpl,
				contradictions: result.contradictions,
				diagnostics:    result.diagnostics,
			}]]),
		};
	},
};
