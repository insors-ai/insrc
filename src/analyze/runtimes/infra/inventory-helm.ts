/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: infra.inventory.helm
 *
 * Walk the scope for `Chart.yaml` files and, for each chart, surface a
 * structural inventory: the chart metadata (name / version / appVersion /
 * type / dependencies), a count of the chart's `templates/*.yaml` files, and
 * the top-level keys of the adjacent `values.yaml`. Chart bodies (the rendered
 * k8s resources) are NOT parsed here -- that's inventory-kubernetes's job.
 *
 * YAML via js-yaml `load` (single-doc), mirroring inventory-kubernetes.ts. A
 * per-file parse/read failure is swallowed (log.debug + continue) so one bad
 * chart never fails the run.
 *
 * Output:
 *   { 'helm-inventory': {
 *       charts: Array<{ path, name?, version?, appVersion?, type?,
 *                       dependencies: Array<{name, version?, repository?}>,
 *                       templateFileCount, valuesKeys: string[] }>,
 *       truncated: boolean
 *     } }
 *
 * Deterministic. All lists sorted.
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
	type WalkedFile,
} from './_shared.js';

const TEMPLATE_ID = 'infra.inventory.helm';
const log = getLogger('analyze:runtimes:infra:inventory-helm');

const YAML_EXT_RE   = /\.(yaml|yml)$/;
const HELM_CHART_RE = /(^|\/)Chart\.yaml$/;

interface HelmDependency {
	readonly name:        string;
	readonly version?:    string | undefined;
	readonly repository?: string | undefined;
}

interface HelmChartRecord {
	readonly path:              string;
	readonly name?:             string | undefined;
	readonly version?:          string | undefined;
	readonly appVersion?:       string | undefined;
	readonly type?:             string | undefined;
	readonly dependencies:      readonly HelmDependency[];
	readonly templateFileCount: number;
	readonly valuesKeys:        readonly string[];
}

/** Directory portion of a `/`-separated relPath (`''` for a root-level file). */
function dirOf(relPath: string): string {
	const idx = relPath.lastIndexOf('/');
	return idx < 0 ? '' : relPath.slice(0, idx);
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

function extractDependencies(doc: Record<string, unknown>): HelmDependency[] {
	const raw = doc['dependencies'];
	if (!Array.isArray(raw)) return [];
	const out: HelmDependency[] = [];
	for (const d of raw) {
		if (d === null || typeof d !== 'object') continue;
		const dep = d as Record<string, unknown>;
		const name = str(dep['name']);
		if (name === undefined) continue;
		out.push({ name, version: str(dep['version']), repository: str(dep['repository']) });
	}
	out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	return out;
}

export const infraInventoryHelmRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const scopeRef = readScopeRef(args, TEMPLATE_ID);
		const repoPath = resolveRepoPath(scopeRef, TEMPLATE_ID);

		const { files: walked, truncated } = await walkFiles(repoPath);
		const byPath = new Map<string, WalkedFile>(walked.map(f => [f.relPath, f]));

		const chartFiles = walked.filter(f => HELM_CHART_RE.test(f.relPath));
		const charts: HelmChartRecord[] = [];

		for (const f of chartFiles) {
			let doc: unknown;
			try {
				doc = load(await readFile(f.absPath, 'utf8'));
			} catch (err) {
				log.debug({ file: f.relPath, err: (err as Error).message }, 'inventory.helm: Chart.yaml parse failed -- skipping');
				continue;
			}
			const meta = doc !== null && typeof doc === 'object' ? (doc as Record<string, unknown>) : {};

			const chartDir      = dirOf(f.relPath);
			const templatesPref = chartDir === '' ? 'templates/' : `${chartDir}/templates/`;
			const templateFileCount = walked.filter(w =>
				w.relPath.startsWith(templatesPref) && YAML_EXT_RE.test(w.relPath),
			).length;

			const valuesKeys = await readTopLevelKeys(byPath, chartDir);

			charts.push({
				path:              f.relPath,
				name:              str(meta['name']),
				version:           str(meta['version']),
				appVersion:        str(meta['appVersion']),
				type:              str(meta['type']),
				dependencies:      extractDependencies(meta),
				templateFileCount,
				valuesKeys,
			});
		}

		charts.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

		const inventory = { charts, truncated };
		log.info(
			{ runId: args.runId, taskId: args.task.taskId, repoPath, chartCount: charts.length, truncated },
			'infra.inventory.helm: enumerated',
		);
		return { outputs: new Map<string, unknown>([['helm-inventory', inventory]]) };
	},
};

/** Top-level keys of the chart's adjacent `values.yaml` (or `.yml`), sorted;
 *  `[]` when absent or unparseable. */
async function readTopLevelKeys(byPath: Map<string, WalkedFile>, chartDir: string): Promise<string[]> {
	const prefix = chartDir === '' ? '' : `${chartDir}/`;
	const values = byPath.get(`${prefix}values.yaml`) ?? byPath.get(`${prefix}values.yml`);
	if (values === undefined) return [];
	try {
		const doc = load(await readFile(values.absPath, 'utf8'));
		if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return [];
		return Object.keys(doc as Record<string, unknown>).sort();
	} catch {
		return [];
	}
}
