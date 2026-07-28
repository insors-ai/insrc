/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: infra.inventory.docker
 *
 * Walk the scope for Dockerfiles + docker-compose files and surface a
 * structural inventory:
 *   - Dockerfiles (regex, not YAML): every `FROM <image> [AS <stage>]` +
 *     the `EXPOSE` ports.
 *   - Compose files (js-yaml): each service's name / image / ports.
 *
 * Deterministic; all lists sorted. Dockerfile parsing is line-regex (a
 * Dockerfile is not YAML); compose parsing swallows a per-file YAML failure
 * (log.debug + continue) and treats a non-conforming shape as zero services
 * rather than throwing.
 *
 * Output:
 *   { 'docker-inventory': {
 *       dockerfiles: Array<{ path, froms: Array<{image, stage?}>, exposedPorts: string[] }>,
 *       composeFiles: Array<{ path, services: Array<{name, image?, ports: string[]}> }>,
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

const TEMPLATE_ID = 'infra.inventory.docker';
const log = getLogger('analyze:runtimes:infra:inventory-docker');

const DOCKERFILE_RE = /^Dockerfile(\..+)?$|^[^/]*\.dockerfile$/i;
const COMPOSE_RE    = /^(docker-)?compose(\.[^/]+)?\.(yaml|yml)$/i;

const FROM_RE   = /^\s*FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i;
const EXPOSE_RE = /^\s*EXPOSE\s+(.+)$/i;

interface FromRef        { readonly image: string; readonly stage?: string | undefined; }
interface DockerfileRecord { readonly path: string; readonly froms: readonly FromRef[]; readonly exposedPorts: readonly string[]; }
interface ComposeService { readonly name: string; readonly image?: string | undefined; readonly ports: readonly string[]; }
interface ComposeRecord  { readonly path: string; readonly services: readonly ComposeService[]; }

function baseName(relPath: string): string {
	const idx = relPath.lastIndexOf('/');
	return idx < 0 ? relPath : relPath.slice(idx + 1);
}

function parseDockerfile(path: string, text: string): DockerfileRecord {
	const froms: FromRef[] = [];
	const ports: string[] = [];
	for (const line of text.split(/\r?\n/)) {
		const from = FROM_RE.exec(line);
		if (from !== null) {
			froms.push(from[2] !== undefined ? { image: from[1]!, stage: from[2] } : { image: from[1]! });
			continue;
		}
		const exp = EXPOSE_RE.exec(line);
		if (exp !== null) {
			for (const p of exp[1]!.trim().split(/\s+/)) if (p.length > 0) ports.push(p);
		}
	}
	ports.sort();
	return { path, froms, exposedPorts: ports };
}

/** Normalise a compose `ports:` entry (string, number, or long-form object)
 *  to a display string. */
function portString(entry: unknown): string | undefined {
	if (typeof entry === 'string') return entry;
	if (typeof entry === 'number') return String(entry);
	if (entry !== null && typeof entry === 'object') {
		const o = entry as Record<string, unknown>;
		const target    = o['target'];
		const published  = o['published'];
		if (published !== undefined || target !== undefined) {
			return `${published ?? ''}:${target ?? ''}`.replace(/^:|:$/g, '');
		}
	}
	return undefined;
}

function parseCompose(path: string, doc: unknown): ComposeRecord {
	const services: ComposeService[] = [];
	if (doc !== null && typeof doc === 'object' && !Array.isArray(doc)) {
		const svc = (doc as Record<string, unknown>)['services'];
		if (svc !== null && typeof svc === 'object' && !Array.isArray(svc)) {
			for (const [name, def] of Object.entries(svc as Record<string, unknown>)) {
				const d = def !== null && typeof def === 'object' ? (def as Record<string, unknown>) : {};
				const image = typeof d['image'] === 'string' ? (d['image'] as string) : undefined;
				const ports: string[] = [];
				if (Array.isArray(d['ports'])) {
					for (const p of d['ports'] as unknown[]) {
						const s = portString(p);
						if (s !== undefined) ports.push(s);
					}
				}
				ports.sort();
				services.push(image !== undefined ? { name, image, ports } : { name, ports });
			}
		}
	}
	services.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	return { path, services };
}

export const infraInventoryDockerRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const scopeRef = readScopeRef(args, TEMPLATE_ID);
		const repoPath = resolveRepoPath(scopeRef, TEMPLATE_ID);

		const { files: walked, truncated } = await walkFiles(repoPath);

		const dockerfiles: DockerfileRecord[] = [];
		const composeFiles: ComposeRecord[]   = [];

		for (const f of walked) {
			const base = baseName(f.relPath);
			if (DOCKERFILE_RE.test(base)) {
				try {
					dockerfiles.push(parseDockerfile(f.relPath, await readFile(f.absPath, 'utf8')));
				} catch (err) {
					log.debug({ file: f.relPath, err: (err as Error).message }, 'inventory.docker: Dockerfile read failed -- skipping');
				}
			} else if (COMPOSE_RE.test(base)) {
				try {
					composeFiles.push(parseCompose(f.relPath, load(await readFile(f.absPath, 'utf8'))));
				} catch (err) {
					log.debug({ file: f.relPath, err: (err as Error).message }, 'inventory.docker: compose parse failed -- skipping');
				}
			}
		}

		dockerfiles.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
		composeFiles.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

		const inventory = { dockerfiles, composeFiles, truncated };
		log.info(
			{ runId: args.runId, taskId: args.task.taskId, repoPath, dockerfiles: dockerfiles.length, composeFiles: composeFiles.length, truncated },
			'infra.inventory.docker: enumerated',
		);
		return { outputs: new Map<string, unknown>([['docker-inventory', inventory]]) };
	},
};
