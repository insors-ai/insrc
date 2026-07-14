/**
 * Artifacts RPC handlers -- template introspection + user-override
 * seeding for the template-editing commands on the workbench side
 * (plans/artifact-tasks.md §2.3).
 *
 * Three wire entries are exposed from `daemon/index.ts`:
 *   - `artifacts.listTemplates`      -- TemplateInfo[] per kind
 *   - `artifacts.ensureUserTemplate` -- copy bundled -> user if
 *                                       missing, return user path
 *   - `artifacts.resetUserTemplate`  -- delete user override if
 *                                       present, return the path
 *                                       that was removed (or null)
 *
 * Keeps the workbench commands dependency-free from the daemon's
 * file layout -- all path knowledge stays inside this module.
 */

import { copyFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetch as undiciFetch } from 'undici';
import { getLogger } from '../shared/logger.js';
import { PATHS } from '../shared/paths.js';
import {
	ARTIFACT_KINDS,
	isArtifactKind,
	type ArtifactKind,
	type MermaidCdnMeta,
	type TemplateInfo,
} from '../shared/artifacts.js';
import {
	clearTemplateCache,
	listTemplates,
} from './artifacts/template-loader.js';
import {
	offlineBundlePath,
	OFFLINE_CACHE_DIR,
	sriMatches,
} from './artifacts/offline-bundle.js';

const log = getLogger('artifacts-rpc');

// ---------------------------------------------------------------------------
// User-override path layout (kept in sync with template-loader.ts)
// ---------------------------------------------------------------------------

const USER_TEMPLATE_DIR = join(PATHS.insrc, 'artifacts', 'templates');

function userTemplatePath(userDir: string, kind: ArtifactKind): string {
	return join(userDir, `${kind}.html`);
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (err: unknown) {
		const code = (err as NodeJS.ErrnoException | undefined)?.code;
		if (code === 'ENOENT') { return false; }
		throw err;
	}
}

// ---------------------------------------------------------------------------
// artifacts.listTemplates
// ---------------------------------------------------------------------------

export interface ListTemplatesParams {
	readonly repoRoot?: string | undefined;
}

export async function listTemplatesRpc(
	params: unknown,
): Promise<readonly TemplateInfo[]> {
	const p = (params ?? {}) as Partial<ListTemplatesParams>;
	const opts: { repoRoot?: string } = {};
	if (typeof p.repoRoot === 'string' && p.repoRoot.length > 0) {
		opts.repoRoot = p.repoRoot;
	}
	return listTemplates(opts);
}

// ---------------------------------------------------------------------------
// artifacts.ensureUserTemplate
// ---------------------------------------------------------------------------

export interface EnsureUserTemplateParams {
	readonly kind: string;
}

export interface EnsureUserTemplateResult {
	readonly kind: ArtifactKind;
	/** Absolute path to the user-override file, created if it
	 *  didn't exist. */
	readonly userPath: string;
	/** True when the file was just seeded from the bundled template;
	 *  false when it already existed. */
	readonly seeded: boolean;
}

export async function ensureUserTemplateRpc(
	params: unknown,
): Promise<EnsureUserTemplateResult> {
	return ensureUserTemplate(params, USER_TEMPLATE_DIR);
}

/**
 * Functional core of `ensureUserTemplateRpc`, exposed for tests that
 * want to redirect the user-override dir to a tmp path. Production
 * callers should use `ensureUserTemplateRpc` which plugs in
 * `USER_TEMPLATE_DIR`.
 */
export async function ensureUserTemplate(
	params: unknown,
	userDir: string,
): Promise<EnsureUserTemplateResult> {
	const p = (params ?? {}) as Partial<EnsureUserTemplateParams>;
	if (typeof p.kind !== 'string' || !isArtifactKind(p.kind)) {
		throw new Error(
			`artifacts.ensureUserTemplate: 'kind' must be one of ${ARTIFACT_KINDS.join(', ')}`,
		);
	}
	const kind: ArtifactKind = p.kind;
	const dest = userTemplatePath(userDir, kind);

	if (await fileExists(dest)) {
		return { kind, userPath: dest, seeded: false };
	}

	// Not present -- find the bundled version via the loader (so we
	// follow the same layering rules: if a repo override exists we'd
	// STILL seed from bundled, since the point of editing the user
	// override is to shadow the repo copy too). The loader returns
	// `layer: 'bundled'` with the absolute path when nothing else is
	// set; we read that path directly.
	const infos = await listTemplates();
	const info = infos.find(i => i.kind === kind && i.layer === 'bundled');
	if (info === undefined) {
		throw new Error(
			`artifacts.ensureUserTemplate: no bundled template for kind '${kind}' -- daemon install is incomplete`,
		);
	}

	const contents = await readFile(info.path, 'utf8');
	await mkdir(dirname(dest), { recursive: true });
	await copyFile(info.path, dest);
	void contents; // readFile doubles as existence check; copyFile writes
	// Ensure any cached resolution picks up the new user-layer file
	// on next read.
	clearTemplateCache();
	log.info({ kind, from: info.path, to: dest }, 'seeded user template from bundled');
	return { kind, userPath: dest, seeded: true };
}

// ---------------------------------------------------------------------------
// artifacts.resetUserTemplate
// ---------------------------------------------------------------------------

export interface ResetUserTemplateParams {
	readonly kind: string;
}

export interface ResetUserTemplateResult {
	readonly kind: ArtifactKind;
	/** Path that was deleted, or null when no override existed. */
	readonly removedPath: string | null;
}

export async function resetUserTemplateRpc(
	params: unknown,
): Promise<ResetUserTemplateResult> {
	return resetUserTemplate(params, USER_TEMPLATE_DIR);
}

// ---------------------------------------------------------------------------
// artifacts.getOfflineBundleStatus -- read-only introspection
// ---------------------------------------------------------------------------

export interface OfflineBundleStatus {
	readonly version: string;
	readonly scriptUrl: string;
	readonly cachePath: string;
	/** True when the cache file exists AND its SRI hash matches the
	 *  pinned metadata. A "present but mismatched" cache is surfaced
	 *  as `{ present: true, valid: false }` so the UI can offer a
	 *  re-download. */
	readonly present: boolean;
	readonly valid: boolean;
	readonly sizeBytes?: number;
}

export async function getOfflineBundleStatusRpc(): Promise<OfflineBundleStatus> {
	const cdn = await loadMermaidCdnMeta();
	const path = offlineBundlePath(cdn.version);
	let present = false;
	let valid = false;
	let sizeBytes: number | undefined;
	try {
		const st = await stat(path);
		present = true;
		sizeBytes = st.size;
		const text = await readFile(path, 'utf8');
		valid = sriMatches(text, cdn.integrity);
	} catch { /* keep defaults */ }

	const result: OfflineBundleStatus = {
		version: cdn.version,
		scriptUrl: cdn.scriptUrl,
		cachePath: path,
		present,
		valid,
		...(sizeBytes !== undefined ? { sizeBytes } : {}),
	};
	return result;
}

// ---------------------------------------------------------------------------
// artifacts.downloadOfflineBundle -- fetch + SRI-verify + cache
// ---------------------------------------------------------------------------

export interface DownloadOfflineBundleResult {
	readonly version: string;
	readonly cachePath: string;
	readonly sizeBytes: number;
	readonly alreadyPresent: boolean;
}

export async function downloadOfflineBundleRpc(): Promise<DownloadOfflineBundleResult> {
	const cdn = await loadMermaidCdnMeta();
	const dest = offlineBundlePath(cdn.version);

	// Fast path: already cached + valid. Return without refetching.
	try {
		const text = await readFile(dest, 'utf8');
		if (sriMatches(text, cdn.integrity)) {
			return {
				version: cdn.version,
				cachePath: dest,
				sizeBytes: Buffer.byteLength(text, 'utf8'),
				alreadyPresent: true,
			};
		}
		log.warn({ path: dest }, 'offline bundle present but SRI mismatched; re-downloading');
	} catch { /* fall through to fetch */ }

	log.info({ url: cdn.scriptUrl, dest }, 'downloading mermaid offline bundle');
	const response = await undiciFetch(cdn.scriptUrl);
	if (!response.ok) {
		throw new Error(
			`artifacts.downloadOfflineBundle: fetch failed with HTTP ${response.status} ${response.statusText}`,
		);
	}
	const body = await response.text();
	if (!sriMatches(body, cdn.integrity)) {
		throw new Error(
			`artifacts.downloadOfflineBundle: downloaded bundle failed SRI verification (pinned ${cdn.integrity}). ` +
			'Refusing to cache -- the CDN content may have been tampered with or the pinned hash is stale.',
		);
	}
	await mkdir(OFFLINE_CACHE_DIR, { recursive: true });
	await writeFile(dest, body, 'utf8');
	log.info({ dest, sizeBytes: body.length }, 'offline bundle cached');
	return {
		version: cdn.version,
		cachePath: dest,
		sizeBytes: Buffer.byteLength(body, 'utf8'),
		alreadyPresent: false,
	};
}

// ---------------------------------------------------------------------------
// artifacts.removeOfflineBundle -- delete cache
// ---------------------------------------------------------------------------

export interface RemoveOfflineBundleResult {
	readonly version: string;
	readonly removedPath: string | null;
}

export async function removeOfflineBundleRpc(): Promise<RemoveOfflineBundleResult> {
	const cdn = await loadMermaidCdnMeta();
	const path = offlineBundlePath(cdn.version);
	try {
		await stat(path);
	} catch {
		return { version: cdn.version, removedPath: null };
	}
	await unlink(path);
	log.info({ path }, 'offline bundle removed');
	return { version: cdn.version, removedPath: path };
}

// ---------------------------------------------------------------------------
// Internals -- CDN metadata loader (co-located so the RPC module
// doesn't pull template-binder's helpers into the browser)
// ---------------------------------------------------------------------------

const CDN_META_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'assets',
	'artifacts',
	'mermaid-cdn.json',
);

let cdnMetaCache: MermaidCdnMeta | undefined;

async function loadMermaidCdnMeta(): Promise<MermaidCdnMeta> {
	if (cdnMetaCache !== undefined) { return cdnMetaCache; }
	const raw = await readFile(CDN_META_PATH, 'utf8');
	const parsed = JSON.parse(raw) as Partial<MermaidCdnMeta>;
	if (
		typeof parsed.version !== 'string'
		|| typeof parsed.scriptUrl !== 'string'
		|| typeof parsed.integrity !== 'string'
		|| parsed.crossorigin !== 'anonymous'
	) {
		throw new Error(`artifacts-rpc: malformed mermaid-cdn.json at ${CDN_META_PATH}`);
	}
	cdnMetaCache = {
		version: parsed.version,
		scriptUrl: parsed.scriptUrl,
		integrity: parsed.integrity,
		crossorigin: 'anonymous',
	};
	return cdnMetaCache;
}

/** Functional core of `resetUserTemplateRpc`. See `ensureUserTemplate` above. */
export async function resetUserTemplate(
	params: unknown,
	userDir: string,
): Promise<ResetUserTemplateResult> {
	const p = (params ?? {}) as Partial<ResetUserTemplateParams>;
	if (typeof p.kind !== 'string' || !isArtifactKind(p.kind)) {
		throw new Error(
			`artifacts.resetUserTemplate: 'kind' must be one of ${ARTIFACT_KINDS.join(', ')}`,
		);
	}
	const kind: ArtifactKind = p.kind;
	const dest = userTemplatePath(userDir, kind);

	if (!(await fileExists(dest))) {
		return { kind, removedPath: null };
	}

	await unlink(dest);
	clearTemplateCache();
	log.info({ kind, path: dest }, 'user-template override removed');
	return { kind, removedPath: dest };
}
