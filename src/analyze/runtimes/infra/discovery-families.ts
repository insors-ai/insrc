/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: infra.discovery.families
 *
 * Detect every IaC family present in scope by walking the
 * filesystem under scopeRef.value and classifying files by
 * name + extension (with a tiny content peek for ambiguous
 * cases like generic .yaml).
 *
 * Families detected in this revision (high-signal heuristics):
 *   - terraform       : *.tf or *.tfvars
 *   - kubernetes      : *.yaml/*.yml containing both `apiVersion:`
 *                       and `kind:` at column 0
 *   - helm            : Chart.yaml at any depth
 *   - github-actions  : files under .github/workflows/
 *   - gitlab-ci       : .gitlab-ci.yml (at repo root or any depth)
 *   - docker-compose  : docker-compose.y*ml or compose.y*ml
 *   - dockerfile      : Dockerfile or *.dockerfile (bonus -- not
 *                       in the template's hint list but practically
 *                       useful)
 *
 * Output:
 *   { families: Array<{ name, fileCount, sampleFiles }> }
 *
 * Sorted by family name. Truncates per-family sample list at 8
 * entries (full list available via inventory runtimes).
 *
 * Deterministic.
 */

import { readFile } from 'node:fs/promises';

import { getLogger } from '../../../shared/logger.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import {
	readScopeRef,
	resolveRepoPath,
	fileWalkCompleteness,
	unreadableFile,
	walkFiles,
	type WalkedFile,
} from './_shared.js';
import type { SkippedItem } from '../../completeness.js';

const TEMPLATE_ID = 'infra.discovery.families';
const log = getLogger('analyze:runtimes:infra:discovery-families');

const SAMPLE_CAP_PER_FAMILY = 8;

interface FamilyRecord {
	readonly name:        string;
	readonly fileCount:   number;
	readonly sampleFiles: readonly string[];
}

export const infraDiscoveryFamiliesRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const scopeRef = readScopeRef(args, TEMPLATE_ID);
		const repoPath = resolveRepoPath(scopeRef, TEMPLATE_ID);

		const { files, truncated, unreadable } = await walkFiles(repoPath);
		const skipped: SkippedItem[] = [...unreadable];
		if (truncated) {
			log.warn(
				{ runId: args.runId, taskId: args.task.taskId, repoPath },
				'discovery.families: file walk truncated -- inventory may be partial',
			);
		}

		const buckets = new Map<string, string[]>();
		const push = (family: string, relPath: string): void => {
			let arr = buckets.get(family);
			if (arr === undefined) { arr = []; buckets.set(family, arr); }
			arr.push(relPath);
		};

		for (const f of files) {
			for (const fam of await classifyFile(f, skipped)) {
				push(fam, f.relPath);
			}
		}

		let mostFilesInAFamily = 0;
		for (const paths of buckets.values()) mostFilesInAFamily = Math.max(mostFilesInAFamily, paths.length);
		const families: FamilyRecord[] = Array.from(buckets.entries())
			.map(([name, paths]): FamilyRecord => ({
				name,
				fileCount: paths.length,
				sampleFiles: paths.slice(0, SAMPLE_CAP_PER_FAMILY),
			}))
			.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

		log.info(
			{
				runId:           args.runId,
				taskId:          args.task.taskId,
				repoPath,
				fileCount:       files.length,
				familyCount:     families.length,
				families:        families.map(f => f.name),
			},
			'infra.discovery.families: classified',
		);

		return {
			outputs: new Map<string, unknown>([['families', families]]),
			completeness: fileWalkCompleteness(families.length, truncated, {
				skipped,
				// Each family names a sample of its files; fileCount holds the full number.
				limited: mostFilesInAFamily > SAMPLE_CAP_PER_FAMILY
					? [{
						what: 'sample files per family', limit: SAMPLE_CAP_PER_FAMILY, scope: 'per-group',
						reason: `a family has ${mostFilesInAFamily} files and ${SAMPLE_CAP_PER_FAMILY} are named for each; fileCount holds the full number`,
					}]
					: [],
			}),
		};
	},
};

// ---------------------------------------------------------------------------
// Per-file classification. A file may belong to multiple families
// (e.g. a Dockerfile that ALSO matches docker-compose by accident
// won't -- but generic yaml can be helm + kubernetes if it lives in
// a Chart's templates/ dir AND has apiVersion+kind). Multi-family
// tagging is intentional; downstream inventory runtimes do their
// own filtering.
// ---------------------------------------------------------------------------

const TF_EXT_RE       = /\.(tf|tfvars)$/;
const YAML_EXT_RE     = /\.(yaml|yml)$/;
const DOCKERFILE_RE   = /^Dockerfile(\..+)?$|^[^/]*\.dockerfile$/i;
const COMPOSE_RE      = /^(docker-)?compose(\.[^/]+)?\.(yaml|yml)$/i;
const GITLAB_CI_RE    = /^(?:.*\/)?\.gitlab-ci\.yml$/;
const HELM_CHART_RE   = /(^|\/)Chart\.yaml$/;

// Light file-content peek for k8s detection. Reading the first
// 4 KiB is enough to catch the leading apiVersion/kind directives;
// avoids slurping multi-MB manifests just to check the header.
const PEEK_BYTES = 4096;
const APIVERSION_RE = /^\s*apiVersion\s*:/m;
const KIND_RE       = /^\s*kind\s*:/m;

async function classifyFile(f: WalkedFile, skipped: SkippedItem[] = []): Promise<readonly string[]> {
	const out: string[] = [];
	const rel = f.relPath;
	const base = baseName(rel);

	// Terraform
	if (TF_EXT_RE.test(rel)) out.push('terraform');

	// Dockerfile
	if (DOCKERFILE_RE.test(base)) out.push('dockerfile');

	// Helm Chart (must come BEFORE generic yaml -> kubernetes peek;
	// a Chart.yaml is helm by definition).
	if (HELM_CHART_RE.test(rel)) out.push('helm');

	// docker-compose
	if (COMPOSE_RE.test(base)) out.push('docker-compose');

	// GitHub Actions
	if (rel.includes('.github/workflows/') && YAML_EXT_RE.test(rel)) out.push('github-actions');

	// GitLab CI
	if (GITLAB_CI_RE.test(rel)) out.push('gitlab-ci');

	// Kubernetes -- needs a content peek (apiVersion + kind directives).
	// Skip files we've already classified as helm Chart.yaml (helm
	// chart metadata isn't a k8s resource).
	if (YAML_EXT_RE.test(rel) && !HELM_CHART_RE.test(rel)) {
		const isK8s = await peekIsKubernetes(f.absPath);
		if (isK8s === true) out.push('kubernetes');
		// Expected: a YAML file that cannot be read. Whether it is a manifest is not known.
		else if (isK8s !== false) skipped.push(unreadableFile(f.relPath, isK8s));
	}

	return out;
}

function baseName(relPath: string): string {
	const idx = relPath.lastIndexOf('/');
	return idx < 0 ? relPath : relPath.slice(idx + 1);
}

/** True or false when the file was read; the error when it could not be. */
async function peekIsKubernetes(absPath: string): Promise<boolean | Error> {
	try {
		const handle = await readFile(absPath, { encoding: 'utf8' });
		const peek = handle.slice(0, PEEK_BYTES);
		return APIVERSION_RE.test(peek) && KIND_RE.test(peek);
	} catch (err) {
		return err instanceof Error ? err : new Error(String(err));
	}
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

export const _classifyFileForTest = classifyFile;
export const _baseNameForTest     = baseName;
