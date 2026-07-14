/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * manifests.locate exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 5. Locate infra-
 * artefact manifests already indexed under the active repo:
 * Kubernetes / Helm / Terraform / Docker / CI. Deterministic;
 * walks the entity graph and classifies each artefact by path +
 * basename heuristics.
 *
 * No LLM. No filesystem read beyond what the indexer already did.
 * When the repo carries no manifests we return an empty output with
 * a `notFoundNote` -- the synthesizer renders an honest "no infra
 * manifests indexed" bundle.
 */

import { basename, extname } from 'node:path';

import { getDb } from '../../db/client.js';
import { listEntitiesForRepo } from '../../db/entities.js';
import { getLogger } from '../../shared/logger.js';
import type { Entity } from '../../shared/types.js';

import type {
	Exploration,
	ExplorationRunnerContext,
	ManifestFamily,
	ManifestHit,
	ManifestsLocateOutput,
} from './types.js';

const log = getLogger('analyze:explore:manifests-locate');

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface ManifestsLocateParams {
	/** Optional family filter. When omitted, every recognised family
	 *  is surfaced. */
	readonly families?: readonly ManifestFamily[];
	readonly topK?:     number;
}

const DEFAULT_TOP_K = 200;
const MAX_TOP_K     = 1_000;

function parseParams(exp: Exploration): ManifestsLocateParams {
	const p = exp.params as Record<string, unknown>;
	const familiesRaw = p['families'];
	const families = Array.isArray(familiesRaw)
		? familiesRaw.filter(f =>
			f === 'kubernetes' || f === 'helm' || f === 'terraform'
			|| f === 'docker' || f === 'ci' || f === 'other',
		) as ManifestFamily[]
		: undefined;
	const topK = typeof p['topK'] === 'number' && p['topK']! > 0
		? Math.min(MAX_TOP_K, Math.floor(p['topK'] as number))
		: DEFAULT_TOP_K;
	return {
		...(families !== undefined && families.length > 0 ? { families } : {}),
		topK,
	};
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runManifestsLocate(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<ManifestsLocateOutput> {
	const params = parseParams(exp);
	const db = await getDb();

	const all = await listEntitiesForRepo(db, ctx.repoPath);

	const familyFilter = params.families !== undefined
		? new Set(params.families)
		: null;

	const seen = new Set<string>();
	const hits: ManifestHit[] = [];
	const familyCounts: Record<ManifestFamily, number> = {
		kubernetes: 0, helm: 0, terraform: 0, docker: 0, ci: 0, other: 0,
	};

	for (const e of all) {
		if (e.artifact !== true) continue;
		if (!isManifestCandidate(e)) continue;
		// Drop stale entities under gitignored paths so a docker-
		// compose.yml copied into out/ doesn't double-count.
		if (!ctx.ignoreFilter.isIncluded(e.file)) continue;
		if (seen.has(e.file)) continue;
		seen.add(e.file);

		const family = classifyFamily(e.file);
		if (familyFilter !== null && !familyFilter.has(family)) continue;

		familyCounts[family] += 1;

		hits.push({
			file:   e.file,
			family,
			...(inferResourceKind(e.file, family) !== undefined
				? { resourceKind: inferResourceKind(e.file, family)! }
				: {}),
			name:     basename(e.file),
			entityId: e.id,
		});
		if (hits.length >= (params.topK ?? DEFAULT_TOP_K)) break;
	}

	log.info(
		{
			runId:  ctx.runId,
			total:  hits.length,
			families: familyCounts,
		},
		'manifests.locate: complete',
	);

	return {
		type:      'manifests.locate',
		hits,
		families:  familyCounts,
		notFoundNote: hits.length === 0
			? `No infra manifests indexed under "${ctx.repoPath}"${
				familyFilter !== null ? ` matching families [${Array.from(familyFilter).join(', ')}]` : ''
			}.`
			: '',
	};
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * True when the entity looks like a candidate manifest -- YAML,
 * JSON, TOML, HCL/TF, or a Dockerfile / docker-compose file.
 */
function isManifestCandidate(e: Entity): boolean {
	const ext = extname(e.file).toLowerCase();
	const bn  = basename(e.file);
	if (bn.startsWith('Dockerfile')) return true;
	if (bn === 'docker-compose.yml' || bn === 'docker-compose.yaml') return true;
	if (ext === '.tf' || ext === '.tfvars' || ext === '.hcl') return true;
	if (ext === '.yaml' || ext === '.yml') return true;
	if (ext === '.json' && (isK8sPath(e.file) || isHelmPath(e.file))) return true;
	return false;
}

export function classifyFamily(file: string): ManifestFamily {
	const bn = basename(file);
	const ext = extname(file).toLowerCase();
	if (bn.startsWith('Dockerfile')) return 'docker';
	if (bn === 'docker-compose.yml' || bn === 'docker-compose.yaml') return 'docker';
	if (ext === '.tf' || ext === '.tfvars' || ext === '.hcl') return 'terraform';
	if (isCIPath(file)) return 'ci';
	if (isHelmPath(file)) return 'helm';
	if (isK8sPath(file)) return 'kubernetes';
	return 'other';
}

export function isK8sPath(file: string): boolean {
	return /(^|\/)(k8s|kubernetes|manifests|deploy|deployments)\//i.test(file);
}

export function isHelmPath(file: string): boolean {
	if (basename(file) === 'Chart.yaml') return true;
	if (basename(file) === 'values.yaml') return true;
	return /(^|\/)helm\//i.test(file) || /(^|\/)charts?\//i.test(file);
}

export function isCIPath(file: string): boolean {
	if (/(^|\/)\.github\/workflows\//.test(file)) return true;
	if (basename(file) === '.gitlab-ci.yml') return true;
	if (basename(file) === '.gitlab-ci.yaml') return true;
	if (basename(file) === 'Jenkinsfile') return true;
	if (basename(file) === 'azure-pipelines.yml') return true;
	if (basename(file) === 'bitbucket-pipelines.yml') return true;
	if (basename(file) === '.circleci' || file.includes('/.circleci/')) return true;
	if (/(^|\/)\.buildkite\//.test(file)) return true;
	return false;
}

/**
 * Infer the Kubernetes `kind:` field from the filename convention
 * without opening the file. Best-effort: many manifests name the
 * kind in the basename (e.g. `nginx-deployment.yaml`,
 * `redis-service.yaml`); files that don't fit the pattern get
 * undefined + the synthesizer renders them without a resourceKind
 * annotation.
 */
export function inferResourceKind(file: string, family: ManifestFamily): string | undefined {
	if (family !== 'kubernetes' && family !== 'helm') return undefined;
	const stem = basename(file, extname(file)).toLowerCase();
	const candidates = [
		'deployment', 'statefulset', 'daemonset', 'replicaset', 'pod',
		'service', 'ingress', 'configmap', 'secret',
		'serviceaccount', 'role', 'rolebinding', 'clusterrole', 'clusterrolebinding',
		'namespace', 'networkpolicy', 'poddisruptionbudget',
		'horizontalpodautoscaler', 'cronjob', 'job',
	];
	for (const k of candidates) {
		if (stem.endsWith(k) || stem.startsWith(k) || stem.includes(`-${k}`)) {
			return capitalise(k);
		}
	}
	return undefined;
}

function capitalise(s: string): string {
	return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
