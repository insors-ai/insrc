/**
 * Template loader for artifact tasks.
 *
 * Resolves the HTML template for a given ArtifactKind through three
 * override layers (plans/artifact-tasks.md §1.4):
 *
 *   1. <repo>/.insrc/artifacts/templates/<kind>.html  -- per-repo
 *   2. ~/.insrc/artifacts/templates/<kind>.html       -- per-user
 *   3. bundled default in src/insrc/assets/artifacts/templates/  -- always present
 *
 * First match wins. Resolved templates are cached with an mtime check
 * so hot edits in the user / repo override files are picked up without
 * a daemon restart.
 *
 * Every template is run through a light lint at load time that rejects
 * inline event handlers, <script> elements, and javascript: URLs
 * outside the trusted `@@RENDERER_SCRIPT@@` slot. The trusted
 * `_renderer.html` snippet (loaded separately by the binder in
 * standalone mode) is the only script source allowed into the rendered
 * output.
 */

import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLogger } from '../../shared/logger.js';
import { PATHS } from '../../shared/paths.js';
import {
	ARTIFACT_KINDS,
	type ArtifactKind,
	type TemplateInfo,
	type TemplateLayer,
} from '../../shared/artifacts.js';

const log = getLogger('artifact-templates');

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

/**
 * Bundled-template directory. Resolved relative to this module's own
 * location so the same code works under tsx (src tree) and under the
 * compiled daemon (out tree) -- the relative path from
 * `agent/tasks/artifacts/` to `assets/artifacts/templates/` is the
 * same in both cases.
 */
const BUNDLED_TEMPLATE_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	'../../../assets/artifacts/templates',
);

/** Shared standalone-mode script snippet, read once and cached. */
const RENDERER_SNIPPET_PATH = join(BUNDLED_TEMPLATE_DIR, '_renderer.html');

const USER_TEMPLATE_DIR = join(PATHS.insrc, 'artifacts', 'templates');

function repoTemplateDir(repoRoot: string): string {
	return join(repoRoot, '.insrc', 'artifacts', 'templates');
}

function templateFilename(kind: ArtifactKind): string {
	return `${kind}.html`;
}

// ---------------------------------------------------------------------------
// Resolved template record
// ---------------------------------------------------------------------------

export interface LoadedTemplate {
	readonly kind: ArtifactKind;
	readonly layer: TemplateLayer;
	readonly path: string;
	readonly text: string;
}

interface CacheEntry {
	readonly layer: TemplateLayer;
	readonly path: string;
	readonly text: string;
	readonly mtimeMs: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(kind: ArtifactKind, repoRoot: string | undefined): string {
	return `${kind}::${repoRoot ?? ''}`;
}

// ---------------------------------------------------------------------------
// Lint -- rejects scripts / event handlers / javascript: URLs in user
// and repo templates. Bundled defaults are trusted but still linted as
// a belt-and-suspenders regression guard.
// ---------------------------------------------------------------------------

const SCRIPT_RE = /<script\b/i;
const EVENT_HANDLER_RE = /\son[a-z]+\s*=/i;
const JAVASCRIPT_URL_RE = /\bjavascript\s*:/i;

export interface TemplateLintIssue {
	readonly kind: 'script' | 'event-handler' | 'javascript-url';
	readonly match: string;
}

/**
 * Run lint against a raw template. The `@@RENDERER_SCRIPT@@` slot is
 * the only place where a <script> is allowed to appear in the bound
 * output; the template source itself (what ships on disk) must not
 * contain one directly. Slot substitution happens downstream in the
 * binder, not here -- so the raw text is what we lint.
 */
export function lintTemplate(text: string): readonly TemplateLintIssue[] {
	const issues: TemplateLintIssue[] = [];
	const scriptMatch = SCRIPT_RE.exec(text);
	if (scriptMatch) {
		issues.push({ kind: 'script', match: scriptMatch[0] });
	}
	const handlerMatch = EVENT_HANDLER_RE.exec(text);
	if (handlerMatch) {
		issues.push({ kind: 'event-handler', match: handlerMatch[0].trim() });
	}
	const jsUrlMatch = JAVASCRIPT_URL_RE.exec(text);
	if (jsUrlMatch) {
		issues.push({ kind: 'javascript-url', match: jsUrlMatch[0] });
	}
	return issues;
}

// ---------------------------------------------------------------------------
// Resolve + read
// ---------------------------------------------------------------------------

async function tryRead(
	path: string,
	layer: TemplateLayer,
): Promise<{ text: string; mtimeMs: number; layer: TemplateLayer; path: string } | null> {
	try {
		const [text, st] = await Promise.all([
			readFile(path, 'utf8'),
			stat(path),
		]);
		return { text, mtimeMs: st.mtimeMs, layer, path };
	} catch (err: unknown) {
		const code = (err as NodeJS.ErrnoException | undefined)?.code;
		if (code === 'ENOENT') { return null; }
		throw err;
	}
}

/**
 * Resolve a template through the three override layers. Throws if the
 * chosen template fails lint; caller is expected to fall back to the
 * bundled layer (already the final fallback -- a failed user template
 * degrades to bundled with a one-shot warning).
 */
export async function loadTemplate(
	kind: ArtifactKind,
	opts: { readonly repoRoot?: string | undefined } = {},
): Promise<LoadedTemplate> {
	const key = cacheKey(kind, opts.repoRoot);
	const filename = templateFilename(kind);
	const candidates: { path: string; layer: TemplateLayer }[] = [];
	if (opts.repoRoot !== undefined) {
		candidates.push({ path: join(repoTemplateDir(opts.repoRoot), filename), layer: 'repo' });
	}
	candidates.push({ path: join(USER_TEMPLATE_DIR, filename), layer: 'user' });
	candidates.push({ path: join(BUNDLED_TEMPLATE_DIR, filename), layer: 'bundled' });

	for (const cand of candidates) {
		const read = await tryRead(cand.path, cand.layer);
		if (read === null) { continue; }

		const cached = cache.get(key);
		if (cached && cached.path === read.path && cached.mtimeMs === read.mtimeMs) {
			return { kind, layer: cached.layer, path: cached.path, text: cached.text };
		}

		const issues = lintTemplate(read.text);
		if (issues.length > 0) {
			log.warn({ kind, path: read.path, layer: read.layer, issues }, 'template lint rejected');
			// Do NOT cache the rejected template. Continue to the next layer
			// so the user gets a visible degrade-to-bundled rather than a
			// silent no-render.
			continue;
		}

		const entry: CacheEntry = {
			layer: read.layer,
			path: read.path,
			text: read.text,
			mtimeMs: read.mtimeMs,
		};
		cache.set(key, entry);
		return { kind, layer: entry.layer, path: entry.path, text: entry.text };
	}

	throw new Error(
		`artifact-templates: no template found for kind '${kind}' (tried ${candidates.map(c => c.path).join(', ')})`,
	);
}

// ---------------------------------------------------------------------------
// Renderer snippet (trusted; loaded once, not linted)
// ---------------------------------------------------------------------------

let rendererSnippetCache: string | undefined;

/**
 * Return the trusted renderer snippet (`_renderer.html`). The binder
 * calls this when rendering in standalone mode and substitutes the
 * result into `@@RENDERER_SCRIPT@@`. Cached for the daemon's lifetime.
 */
export async function loadRendererSnippet(): Promise<string> {
	if (rendererSnippetCache !== undefined) { return rendererSnippetCache; }
	const text = await readFile(RENDERER_SNIPPET_PATH, 'utf8');
	rendererSnippetCache = text;
	return text;
}

// ---------------------------------------------------------------------------
// Introspection -- used by artifact.list_templates (phase 2) + the
// user-facing `insrc.listArtifactTemplates` command.
// ---------------------------------------------------------------------------

/**
 * Resolve every known kind and report its chosen layer. Does not throw
 * on per-kind load failures -- layers that fail lint fall through to
 * the bundled default and the report carries that choice. When every
 * layer fails, the kind is omitted from the result.
 */
export async function listTemplates(
	opts: { readonly repoRoot?: string | undefined } = {},
): Promise<readonly TemplateInfo[]> {
	const out: TemplateInfo[] = [];
	for (const kind of ARTIFACT_KINDS) {
		try {
			const loaded = await loadTemplate(kind, opts);
			out.push({ kind, layer: loaded.layer, path: loaded.path });
		} catch (err) {
			log.warn({ kind, err }, 'listTemplates: kind failed to resolve');
		}
	}
	return out;
}

/**
 * Clear the loader cache. Exposed for tests and for a future
 * `insrc.resetArtifactTemplate` command path that wants to force a
 * reload after mutating an override file.
 */
export function clearTemplateCache(): void {
	cache.clear();
	rendererSnippetCache = undefined;
}
