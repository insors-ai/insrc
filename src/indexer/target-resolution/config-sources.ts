/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc2 (E20260806914cbf5e:S002) — at-rest config-source parsers + the
 * precedence-merge that produces a `ConfigSourceMap`.
 *
 * All sourcing is STATIC and AT-REST (k6): every parser takes the config
 * source's text and extracts `{key, value, layer}` pairs. Nothing is executed
 * — the k8s layer reads MANIFEST FILES, never `kubectl`. Text is read from the
 * file by PATH (config entity bodies are truncated to 8KB, so we re-read the
 * file's full text at rest, up to MAX_SIZE).
 */

import { basename } from 'node:path';
import { load, loadAll } from 'js-yaml';

import { getLogger } from '../../shared/logger.js';
import type { ConfigSourceLayer } from '../../shared/types.js';
import type { ConfigEntry, ConfigSourceMap } from './types.js';

const log = getLogger('sc2-config-sources');

/** Max source size read at rest — mirrors the indexer's MAX_SIZE (256KB). */
export const MAX_SOURCE_SIZE = 256 * 1024;

/** Total precedence rank; a higher rank wins a key clash. */
const LAYER_RANK: Record<ConfigSourceLayer, number> = {
	k8s: 4,
	docker: 3,
	envFile: 2,
	localConfig: 1,
};

// ---------------------------------------------------------------------------
// Per-source parsers — each returns ConfigEntry[] tagged with its layer.
// All are best-effort: a malformed line / unparseable document is skipped,
// never thrown, so one bad entry never sinks the whole source.
// ---------------------------------------------------------------------------

/** Strip a matching pair of single or double quotes wrapping a value. */
function unquote(v: string): string {
	const t = v.trim();
	if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
		return t.slice(1, -1);
	}
	return t;
}

/** `.env` key=value reader (envFile). Skips blanks, `#` comments, and any line
 *  without an `=`; strips an optional leading `export ` and wrapping quotes. */
export function parseEnvFile(text: string): ConfigEntry[] {
	const out: ConfigEntry[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line === '' || line.startsWith('#')) continue;
		const body = line.startsWith('export ') ? line.slice('export '.length) : line;
		const eq = body.indexOf('=');
		if (eq <= 0) continue; // malformed / no key — skip
		const key = body.slice(0, eq).trim();
		if (key === '') continue;
		out.push({ key, value: unquote(body.slice(eq + 1)), layer: 'envFile' });
	}
	return out;
}

/** Dockerfile `ENV` reader (docker). Handles both `ENV KEY=VALUE [KEY2=V2 …]`
 *  and the legacy `ENV KEY VALUE` (rest-of-line) forms. */
export function parseDockerfile(text: string): ConfigEntry[] {
	const out: ConfigEntry[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!/^ENV\s+/i.test(line)) continue;
		const rest = line.replace(/^ENV\s+/i, '');
		if (rest.includes('=')) {
			// `ENV KEY=VALUE KEY2=VALUE2` — split on whitespace between pairs.
			for (const tok of rest.split(/\s+/)) {
				const eq = tok.indexOf('=');
				if (eq <= 0) continue;
				out.push({ key: tok.slice(0, eq).trim(), value: unquote(tok.slice(eq + 1)), layer: 'docker' });
			}
		} else {
			// Legacy `ENV KEY the rest is the value`.
			const sp = rest.indexOf(' ');
			if (sp <= 0) continue;
			out.push({ key: rest.slice(0, sp).trim(), value: unquote(rest.slice(sp + 1)), layer: 'docker' });
		}
	}
	return out;
}

/** docker-compose reader (docker). Collects `services.*.environment` (map or
 *  `KEY=VALUE` list form). `env_file` references are not followed here — those
 *  files, when present, are parsed on their own as envFile sources. */
export function parseComposeYaml(text: string): ConfigEntry[] {
	const out: ConfigEntry[] = [];
	let doc: unknown;
	try {
		doc = load(text);
	} catch (err) {
		log.debug({ err: err instanceof Error ? err.message : String(err) }, 'compose: unparseable YAML, skipped');
		return out;
	}
	const services = (doc as { services?: Record<string, unknown> } | null)?.services;
	if (services === undefined || services === null || typeof services !== 'object') return out;
	for (const svc of Object.values(services)) {
		const env = (svc as { environment?: unknown } | null)?.environment;
		if (Array.isArray(env)) {
			for (const item of env) {
				if (typeof item !== 'string') continue;
				const eq = item.indexOf('=');
				if (eq <= 0) continue;
				out.push({ key: item.slice(0, eq).trim(), value: unquote(item.slice(eq + 1)), layer: 'docker' });
			}
		} else if (env !== null && typeof env === 'object') {
			for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
				if (key === '' || value === null || value === undefined) continue;
				out.push({ key, value: String(value), layer: 'docker' });
			}
		}
	}
	return out;
}

/** k8s manifest reader (k8s). Multi-document via loadAll. Collects container
 *  `env: [{name,value}]` and top-level ConfigMap/Secret `data` / `stringData`
 *  maps. Never invokes kubectl — this reads the manifest FILE text at rest. */
export function parseK8sManifest(text: string): ConfigEntry[] {
	const out: ConfigEntry[] = [];
	let docs: unknown[] = [];
	try {
		docs = loadAll(text) as unknown[];
	} catch (err) {
		log.debug({ err: err instanceof Error ? err.message : String(err) }, 'k8s: unparseable YAML, skipped');
		return out;
	}
	for (const doc of docs) {
		if (doc === null || typeof doc !== 'object') continue;
		const d = doc as Record<string, unknown>;
		// ConfigMap / Secret data maps.
		for (const field of ['data', 'stringData'] as const) {
			const data = d[field];
			if (data !== null && data !== undefined && typeof data === 'object' && !Array.isArray(data)) {
				for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
					if (key === '' || value === null || value === undefined) continue;
					out.push({ key, value: String(value), layer: 'k8s' });
				}
			}
		}
		// Pod/Deployment container env lists (spec.template.spec.containers[].env[]).
		for (const container of collectContainers(d)) {
			const env = (container as { env?: unknown }).env;
			if (!Array.isArray(env)) continue;
			for (const e of env) {
				if (e === null || typeof e !== 'object') continue;
				const { name, value } = e as { name?: unknown; value?: unknown };
				if (typeof name !== 'string' || name === '' || value === null || value === undefined) continue;
				out.push({ key: name, value: String(value), layer: 'k8s' });
			}
		}
	}
	return out;
}

/** Walk a k8s doc to its container list wherever it nests (Pod, Deployment,
 *  StatefulSet, DaemonSet, Job, CronJob). Best-effort structural descent. */
function collectContainers(doc: Record<string, unknown>): unknown[] {
	const out: unknown[] = [];
	const specs: unknown[] = [];
	const top = doc.spec;
	if (top !== null && typeof top === 'object') {
		specs.push(top);
		// workload controllers nest a pod template at spec.template.spec
		const tmpl = (top as { template?: { spec?: unknown } }).template?.spec;
		if (tmpl !== null && tmpl !== undefined && typeof tmpl === 'object') specs.push(tmpl);
		// CronJob nests at spec.jobTemplate.spec.template.spec
		const cron = (top as { jobTemplate?: { spec?: { template?: { spec?: unknown } } } }).jobTemplate?.spec?.template?.spec;
		if (cron !== null && cron !== undefined && typeof cron === 'object') specs.push(cron);
	}
	for (const spec of specs) {
		for (const field of ['containers', 'initContainers'] as const) {
			const list = (spec as Record<string, unknown>)[field];
			if (Array.isArray(list)) out.push(...list);
		}
	}
	return out;
}

/** In-repo config default reader (localConfig). Accepts flat JSON objects
 *  (`{"KEY":"value"}`) and generic `key=value` / `key: value` property lines —
 *  the lowest-precedence default layer. */
export function parseLocalConfig(text: string): ConfigEntry[] {
	const trimmed = text.trimStart();
	if (trimmed.startsWith('{')) {
		try {
			const obj = JSON.parse(text) as unknown;
			if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
				const out: ConfigEntry[] = [];
				for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
					if (key === '' || value === null || value === undefined || typeof value === 'object') continue;
					out.push({ key, value: String(value), layer: 'localConfig' });
				}
				return out;
			}
		} catch {
			// fall through to line-based parse
		}
	}
	const out: ConfigEntry[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line === '' || line.startsWith('#') || line.startsWith(';')) continue;
		const m = /^([A-Za-z0-9_.-]+)\s*[:=]\s*(.*)$/.exec(line);
		if (m === null) continue;
		out.push({ key: m[1]!, value: unquote(m[2]!), layer: 'localConfig' });
	}
	return out;
}

// ---------------------------------------------------------------------------
// Dispatch + merge
// ---------------------------------------------------------------------------

/** Classify a config source by filename → its parser + layer. Returns null for
 *  files that are not one of the four sc2 source types. */
export function parserForFile(filePath: string): ((text: string) => ConfigEntry[]) | null {
	const name = basename(filePath).toLowerCase();
	if (name === '.env' || name.startsWith('.env.') || name.endsWith('.env')) return parseEnvFile;
	if (name === 'dockerfile' || name.endsWith('.dockerfile') || name.startsWith('dockerfile.')) return parseDockerfile;
	if (/^(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(name)) return parseComposeYaml;
	if (name.endsWith('.yaml') || name.endsWith('.yml')) return parseK8sManifest;
	if (name.endsWith('.json') || name.endsWith('.properties') || name.endsWith('.toml') || name.endsWith('.conf') || name.endsWith('.ini')) {
		return parseLocalConfig;
	}
	return null;
}

/**
 * Fold parsed entries into a single {@link ConfigSourceMap} with the total
 * precedence `k8s > docker > envFile > localConfig`: on a key clash the entry
 * whose layer has the higher rank wins. Pure over its input entries.
 */
export function mergeConfigEntries(entries: readonly ConfigEntry[]): ConfigSourceMap {
	const map: ConfigSourceMap = new Map();
	for (const e of entries) {
		const cur = map.get(e.key);
		if (cur === undefined || LAYER_RANK[e.layer] > LAYER_RANK[cur.layer]) {
			map.set(e.key, { value: e.value, layer: e.layer });
		}
	}
	return map;
}

/** A config source to parse: its path (for classification) + its at-rest text. */
export interface ConfigFileText {
	readonly path: string;
	readonly text: string;
}

/**
 * Build the merged {@link ConfigSourceMap} for a set of at-rest config sources.
 * Each source's already-read text is classified by filename and parsed
 * best-effort; the entries are folded with the fixed precedence. Pure over its
 * inputs — the fs read happens in the adapter (resolver.ts), not here — so this
 * is directly unit-testable with in-memory `{path, text}` fixtures.
 */
export function buildConfigSourceMap(files: readonly ConfigFileText[]): ConfigSourceMap {
	const entries: ConfigEntry[] = [];
	for (const f of files) {
		const parser = parserForFile(f.path);
		if (parser === null) continue;
		try {
			entries.push(...parser(f.text));
		} catch (err) {
			// Defensive: a parser should never throw, but if it does, skip the
			// source rather than sink the whole map (best-effort, k5 recall).
			log.debug({ path: f.path, err: err instanceof Error ? err.message : String(err) }, 'config source parse failed, skipped');
		}
	}
	return mergeConfigEntries(entries);
}
