/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: infra.inventory.ci
 *
 * Walk the scope for CI pipeline definitions and surface a structural
 * inventory (js-yaml):
 *   - GitHub Actions: every `.github/workflows/*.yml` -> name, normalised
 *     triggers (`on` as string | array | map -> sorted trigger names), job
 *     ids, and each job's step `uses` actions.
 *   - GitLab CI: `.gitlab-ci.yml` -> `stages` + the job-id keys (reserved
 *     top-level keys excluded).
 *
 * Deterministic; all lists sorted. A per-file YAML parse failure is swallowed
 * (log.debug + continue); a non-conforming shape yields empty sub-lists.
 *
 * Output:
 *   { 'ci-inventory': {
 *       githubWorkflows: Array<{ path, name?, triggers: string[], jobs: Array<{id, stepUses: string[]}> }>,
 *       gitlabCi: Array<{ path, stages: string[], jobs: string[] }>,
 *       truncated: boolean
 *     } }
 */

import { readFile } from 'node:fs/promises';

import { load } from 'js-yaml';

import { getLogger } from '../../../shared/logger.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import {
	readScopeRef,
	resolveRepoPath,
	walkFiles,
} from './_shared.js';

const TEMPLATE_ID = 'infra.inventory.ci';
const log = getLogger('analyze:runtimes:infra:inventory-ci');

const YAML_EXT_RE  = /\.(yaml|yml)$/;
const GITLAB_CI_RE = /^(?:.*\/)?\.gitlab-ci\.yml$/;

/** Top-level `.gitlab-ci.yml` keys that are pipeline config, not jobs. */
const GITLAB_RESERVED = new Set([
	'stages', 'variables', 'default', 'include', 'workflow',
	'image', 'services', 'before_script', 'after_script', 'cache',
]);

interface GhaJob            { readonly id: string; readonly stepUses: readonly string[]; }
interface GhaWorkflowRecord { readonly path: string; readonly name?: string | undefined; readonly triggers: readonly string[]; readonly jobs: readonly GhaJob[]; }
interface GitlabCiRecord    { readonly path: string; readonly stages: readonly string[]; readonly jobs: readonly string[]; }

const asObject = (v: unknown): Record<string, unknown> | undefined =>
	(v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** `on` may be a bare string, an array of trigger names, or a map keyed by
 *  trigger name. Normalise any of those to a sorted string[] of names. */
function normalizeTriggers(on: unknown): string[] {
	let names: string[];
	if (typeof on === 'string') names = [on];
	else if (Array.isArray(on)) names = on.filter((x): x is string => typeof x === 'string');
	else { const o = asObject(on); names = o !== undefined ? Object.keys(o) : []; }
	return [...new Set(names)].sort();
}

function parseGhaWorkflow(path: string, doc: unknown): GhaWorkflowRecord {
	const root = asObject(doc);
	if (root === undefined) return { path, triggers: [], jobs: [] };

	const triggers = normalizeTriggers(root['on']);
	const jobs: GhaJob[] = [];
	const jobsObj = asObject(root['jobs']);
	if (jobsObj !== undefined) {
		for (const [id, def] of Object.entries(jobsObj)) {
			const uses: string[] = [];
			const jobDef = asObject(def);
			const steps = jobDef !== undefined ? jobDef['steps'] : undefined;
			if (Array.isArray(steps)) {
				for (const step of steps) {
					const s = asObject(step);
					if (s !== undefined && typeof s['uses'] === 'string') uses.push(s['uses'] as string);
				}
			}
			jobs.push({ id, stepUses: [...new Set(uses)].sort() });
		}
	}
	jobs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

	const name = typeof root['name'] === 'string' ? (root['name'] as string) : undefined;
	return name !== undefined ? { path, name, triggers, jobs } : { path, triggers, jobs };
}

function parseGitlabCi(path: string, doc: unknown): GitlabCiRecord {
	const root = asObject(doc);
	if (root === undefined) return { path, stages: [], jobs: [] };

	const stages = Array.isArray(root['stages'])
		? (root['stages'] as unknown[]).filter((x): x is string => typeof x === 'string')
		: [];

	const jobs = Object.keys(root)
		.filter(k => !GITLAB_RESERVED.has(k) && !k.startsWith('.'))
		.sort();

	return { path, stages, jobs };
}

export const infraInventoryCiRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const scopeRef = readScopeRef(args, TEMPLATE_ID);
		const repoPath = resolveRepoPath(scopeRef, TEMPLATE_ID);

		const { files: walked, truncated } = await walkFiles(repoPath);

		const githubWorkflows: GhaWorkflowRecord[] = [];
		const gitlabCi: GitlabCiRecord[]           = [];

		for (const f of walked) {
			const isGha    = f.relPath.includes('.github/workflows/') && YAML_EXT_RE.test(f.relPath);
			const isGitlab = GITLAB_CI_RE.test(f.relPath);
			if (!isGha && !isGitlab) continue;

			let doc: unknown;
			try {
				doc = load(await readFile(f.absPath, 'utf8'));
			} catch (err) {
				log.debug({ file: f.relPath, err: (err as Error).message }, 'inventory.ci: YAML parse failed -- skipping');
				continue;
			}

			if (isGha)    githubWorkflows.push(parseGhaWorkflow(f.relPath, doc));
			else          gitlabCi.push(parseGitlabCi(f.relPath, doc));
		}

		githubWorkflows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
		gitlabCi.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

		const inventory = { githubWorkflows, gitlabCi, truncated };
		log.info(
			{ runId: args.runId, taskId: args.task.taskId, repoPath, githubWorkflows: githubWorkflows.length, gitlabCi: gitlabCi.length, truncated },
			'infra.inventory.ci: enumerated',
		);
		return { outputs: new Map<string, unknown>([['ci-inventory', inventory]]) };
	},
};
