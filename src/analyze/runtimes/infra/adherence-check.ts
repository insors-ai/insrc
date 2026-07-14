/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: infra.adherence.check
 *
 * plans/docs-module.md Phase 4. Infra-side adherence check. Thin
 * wrapper around the shared adherence runner. Hydrates excerpts
 * from indexed IaC config entities (Kubernetes YAML, Dockerfile,
 * Terraform, docker-compose, GitHub Actions, Helm, Ansible).
 */

import { getDb } from '../../../db/client.js';
import { listEntitiesByKinds } from '../../../db/entities.js';
import type { Entity } from '../../../shared/types.js';

import { runAdherenceCheck, type AdherenceExcerpt } from '../shared/adherence.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';

const TEMPLATE_ID = 'infra.adherence.check';
export const INFRA_ADHERENCE_CHECK_PROMPT_PATH = 'prompts/analyze/code.adherence-check.system.md';
// Reuses the code adherence prompt with subjectLabel='Infra' set at
// call time by the shared runner.

/** Path markers for infra content. */
const INFRA_FILE_MARKERS: readonly RegExp[] = [
	/\.tf$/i,
	/\.hcl$/i,
	/\.yaml$/i,
	/\.yml$/i,
	/Dockerfile(\.[a-z]+)?$/,
	/docker-compose(\.[a-z]+)?\.ya?ml$/i,
	/\.helmfile\.ya?ml$/i,
	/Chart\.ya?ml$/i,
	/values\.ya?ml$/i,
	/\.github\/workflows?\//,
	/\.gitlab-ci\.ya?ml$/i,
	/\/ansible\//i,
	/\/k8s\//i,
	/\/kubernetes\//i,
	/\/manifests?\//i,
];

function isInfraFile(file: string): boolean {
	for (const rx of INFRA_FILE_MARKERS) {
		if (rx.test(file)) return true;
	}
	return false;
}

async function hydrateInfraExcerpts(
	infraSubject: string,
	repoPath:     string,
	cap:          number,
): Promise<readonly AdherenceExcerpt[]> {
	const db = await getDb();
	const out: AdherenceExcerpt[] = [];
	const q = infraSubject.toLowerCase();

	// Infra content lands as `config` and `document` artifact entities
	// via the artifact parser. Filter by isInfraFile + body match.
	const artefacts = await listEntitiesByKinds(
		db, ['document', 'section', 'config'], { repo: repoPath },
	);
	for (const e of artefacts) {
		if (!isInfraFile(e.file)) continue;
		const body = (e.body ?? '').toLowerCase();
		if (body.length === 0) continue;
		if (body.includes(q) || e.file.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)) {
			out.push(entityToExcerpt(e));
			if (out.length >= cap) return out;
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

export const infraAdherenceCheckRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const result = await runAdherenceCheck({
			executeArgs:      args,
			subjectKey:       'infraSubject',
			subjectLabel:     'Infra',
			templateId:       TEMPLATE_ID,
			promptRelPath:    INFRA_ADHERENCE_CHECK_PROMPT_PATH,
			hydrateExcerpts:  hydrateInfraExcerpts,
		});

		return {
			outputs: new Map<string, unknown>([['adherence-report', {
				infraSubject:   result.subject,
				matches:        result.matches,
				drifts:         result.drifts,
				missingImpl:    result.missingImpl,
				contradictions: result.contradictions,
				diagnostics:    result.diagnostics,
			}]]),
		};
	},
};
