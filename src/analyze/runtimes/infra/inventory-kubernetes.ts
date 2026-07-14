/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: infra.inventory.kubernetes
 *
 * Walk the scope for `*.yaml`/`*.yml` files and parse each as a
 * multi-document YAML stream. For every document that looks like
 * a Kubernetes resource (has `apiVersion` and `kind`), emit a
 * structured record with kind, name, namespace, labels.
 *
 * Output:
 *   { 'k8s-inventory': {
 *       files:     Array<{ path, resourceCount, kinds }>,
 *       resources: Array<{ file, apiVersion, kind, name, namespace?, labels? }>,
 *       truncated: boolean
 *     } }
 *
 * Files that fail YAML parsing are skipped + logged. The
 * runtime never throws on individual file errors -- the goal is
 * "best-effort inventory of what's there," not strict validation.
 *
 * Deterministic. Output sorted by (file, kind, name).
 */

import { readFile } from 'node:fs/promises';
import { loadAll } from 'js-yaml';

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

const TEMPLATE_ID = 'infra.inventory.kubernetes';
const log = getLogger('analyze:runtimes:infra:inventory-kubernetes');

const YAML_EXT_RE   = /\.(yaml|yml)$/;
const HELM_CHART_RE = /(^|\/)Chart\.yaml$/;

interface K8sResource {
	readonly file:        string;
	readonly apiVersion:  string;
	readonly kind:        string;
	readonly name:        string;
	readonly namespace?:  string;
	readonly labels?:     Readonly<Record<string, string>>;
}

interface K8sFileSummary {
	readonly path:          string;
	readonly resourceCount: number;
	readonly kinds:         readonly string[];
}

export const infraInventoryKubernetesRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const scopeRef = readScopeRef(args, TEMPLATE_ID);
		const repoPath = resolveRepoPath(scopeRef, TEMPLATE_ID);

		const { files: walked, truncated } = await walkFiles(repoPath);

		const yamlFiles = walked.filter(f =>
			YAML_EXT_RE.test(f.relPath) && !HELM_CHART_RE.test(f.relPath),
		);

		const resources: K8sResource[] = [];
		const filesSeen = new Map<string, { count: number; kinds: Set<string> }>();

		for (const f of yamlFiles) {
			let docs: unknown[];
			try {
				const text = await readFile(f.absPath, 'utf8');
				docs = loadAll(text);
			} catch (err) {
				log.debug(
					{ file: f.relPath, err: (err as Error).message },
					'inventory.kubernetes: YAML parse failed -- skipping',
				);
				continue;
			}

			for (const doc of docs) {
				if (doc === null || typeof doc !== 'object') continue;
				const r = extractResource(f.relPath, doc as Record<string, unknown>);
				if (r === null) continue;
				resources.push(r);

				let entry = filesSeen.get(f.relPath);
				if (entry === undefined) {
					entry = { count: 0, kinds: new Set() };
					filesSeen.set(f.relPath, entry);
				}
				entry.count++;
				entry.kinds.add(r.kind);
			}
		}

		resources.sort((a, b) => {
			if (a.file !== b.file) return a.file < b.file ? -1 : 1;
			if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
			return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
		});

		const filesSummary: K8sFileSummary[] = Array.from(filesSeen.entries())
			.map(([path, e]): K8sFileSummary => ({
				path,
				resourceCount: e.count,
				kinds: Array.from(e.kinds).sort(),
			}))
			.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

		const inventory = {
			files:     filesSummary,
			resources,
			truncated,
		};

		log.info(
			{
				runId:         args.runId,
				taskId:        args.task.taskId,
				repoPath,
				yamlScanned:   yamlFiles.length,
				resourceCount: resources.length,
				fileCount:     filesSummary.length,
				truncated,
			},
			'infra.inventory.kubernetes: enumerated',
		);

		return {
			outputs: new Map<string, unknown>([['k8s-inventory', inventory]]),
		};
	},
};

// ---------------------------------------------------------------------------
// extractResource: pluck the inventory-relevant fields from a parsed
// YAML document. Returns null for non-k8s documents (no kind/apiVersion).
// ---------------------------------------------------------------------------

function extractResource(filePath: string, doc: Record<string, unknown>): K8sResource | null {
	const apiVersion = doc['apiVersion'];
	const kind       = doc['kind'];
	if (typeof apiVersion !== 'string' || typeof kind !== 'string') return null;

	const meta = doc['metadata'];
	const metaObj = (meta !== null && typeof meta === 'object')
		? (meta as Record<string, unknown>)
		: {};

	const name      = typeof metaObj['name']      === 'string' ? metaObj['name']      as string : '';
	const namespace = typeof metaObj['namespace'] === 'string' ? metaObj['namespace'] as string : undefined;

	let labels: Record<string, string> | undefined = undefined;
	const rawLabels = metaObj['labels'];
	if (rawLabels !== null && typeof rawLabels === 'object' && !Array.isArray(rawLabels)) {
		labels = {};
		for (const [k, v] of Object.entries(rawLabels as Record<string, unknown>)) {
			if (typeof v === 'string') labels[k] = v;
			else                       labels[k] = String(v);
		}
	}

	if (name.length === 0) {
		// Some manifests (e.g. ClusterRoleBinding patches, list documents
		// wrapped in `kind: List`) have no metadata.name. Drop them from
		// the inventory rather than emitting blank-name records.
		return null;
	}

	return {
		file:       filePath,
		apiVersion,
		kind,
		name,
		...(namespace !== undefined ? { namespace } : {}),
		...(labels    !== undefined ? { labels    } : {}),
	};
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

export const _extractResourceForTest = extractResource;
