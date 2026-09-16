/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Work-item artifact path scheme (sc2 — S002).
 *
 * The single authority mapping a work item's identity + human slug to WHERE its
 * markdown artifacts live, and enumerating that tree. Every `*ArtifactPaths`
 * writer (md side) and every docs-md finder routes through this module, so the
 * write side and the read side share one layout definition and can never
 * disagree.
 *
 * The layout is work-item-first and nested:
 *
 *   docs/epics/<slug>-E<YYYYMMDD><hash8>/        — epic-parented work
 *     SPEC.md DEF.md HLD.md                      — item-root artifacts (singletons)
 *     S001/  LLD.md PLAN.md BUILD.md CR.md EXT.md — per-story artifacts
 *     S002/  ...
 *   docs/standalone/<slug>-E<YYYYMMDD><hash8>/    — triage-routed features (same shape)
 *
 * The folder is keyed by the work item's canonical identity (`epicSegment` +
 * story ordinal, from sc1's {@link deriveWorkItemIdentity}); the human slug is
 * only a readable LABEL and never determines identity. The filename is the bare
 * `<KIND>.md`.
 *
 * SCOPE: this owns ONLY the markdown (`docs/`) side. The companion canonical
 * JSON stays hash-flat under `.insrc/artifacts/<ID>.json` and is untouched — the
 * `{ json }` half of every `*ArtifactPaths` helper, and every scanner that reads
 * that store, is out of scope.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { deriveWorkItemIdentity, type WorkItemIdentity } from './id.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The eight artifact kinds that live in the docs tree. Each maps to a bare
 *  `<KIND>.md` filename. */
export type ArtifactKind = 'SPEC' | 'DEF' | 'HLD' | 'LLD' | 'PLAN' | 'BUILD' | 'CR' | 'EXT';

/** Whether a work item is epic-parented or a triage-routed standalone feature —
 *  selects the `docs/epics` vs `docs/standalone` top-level split. */
export type WorkItemKind = 'epic' | 'standalone';

/** One work-item folder located under the docs tree. */
export interface WorkItemLocation {
	readonly kind:      WorkItemKind;
	/** Repo-relative folder path, e.g. `docs/epics/<slug>-E<date><hash8>`. */
	readonly root:      string;
	/** `S<nnn>` when the location narrows to a story subfolder; absent for a
	 *  whole work-item folder (as returned by {@link listWorkItems}). */
	readonly storySeg?: string | undefined;
}

// ---------------------------------------------------------------------------
// Kind placement
// ---------------------------------------------------------------------------

/** The artifact kinds that live in a per-story `S<nnn>/` subfolder. The
 *  complement — `SPEC`/`DEF`/`HLD` — are work-item singletons at the item root. */
const STORY_SCOPED: ReadonlySet<ArtifactKind> = new Set<ArtifactKind>(['LLD', 'PLAN', 'BUILD', 'CR', 'EXT']);

/** Whether `kind` is placed under a story subfolder (vs the item root). */
export function isStoryScopedKind(kind: ArtifactKind): boolean {
	return STORY_SCOPED.has(kind);
}

// ---------------------------------------------------------------------------
// Filename-safe segment (homed here so `storage.ts` can import it without a
// storage↔path-scheme import cycle)
// ---------------------------------------------------------------------------

/** Filename-safe segment. Slugs from `deriveSlug` are already `[a-z0-9-]`; this
 *  only guards the hash fallback and any stray caller input against path
 *  separators / odd characters. */
export function fileSeg(s: string): string {
	const cleaned = s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
	return cleaned.length > 0 ? cleaned : 'artifact';
}

// ---------------------------------------------------------------------------
// Resolve one artifact's md path (pure construction — no disk read)
// ---------------------------------------------------------------------------

/** `S<nnn>` for a 1-based story ordinal (>= 1000 keeps full width). */
function storyFolder(ordinal: number): string {
	return `S${String(ordinal).padStart(3, '0')}`;
}

/** The top-level docs directory for a work-item kind. */
function topSegment(workItemKind: WorkItemKind): string {
	return workItemKind === 'epic' ? 'epics' : 'standalone';
}

/** Absolute path to a work item's folder: `<repo>/docs/<epics|standalone>/<slug>-<epicSegment>`. */
function workItemRoot(repoPath: string, identity: WorkItemIdentity, workItemKind: WorkItemKind, slug: string): string {
	return join(repoPath, 'docs', topSegment(workItemKind), `${fileSeg(slug)}-${identity.epicSegment}`);
}

/**
 * Absolute markdown path for one artifact, built purely from its identity — no
 * filesystem read. Story-scoped kinds (LLD/PLAN/BUILD/CR/EXT) sit under a
 * `S<nnn>/` subfolder; item-root kinds (SPEC/DEF/HLD) sit at the work-item root.
 * The filename is the bare `<KIND>.md`; identity never comes from the filename.
 *
 * The companion JSON path is deliberately NOT produced here — the hash-flat
 * `.insrc/artifacts` store is out of scope and unchanged.
 *
 * @throws when `kind` is story-scoped but `identity.story` is undefined (an
 *   epic-level identity cannot locate a story artifact).
 */
export function resolveArtifactMdPath(
	repoPath:     string,
	identity:     WorkItemIdentity,
	kind:         ArtifactKind,
	workItemKind: WorkItemKind,
	slug:         string,
): string {
	const storyScoped = STORY_SCOPED.has(kind);
	if (storyScoped && identity.story === undefined) {
		throw new Error(
			`resolveArtifactMdPath: story-scoped artifact '${kind}' requires a story identity, ` +
			`but identity.story is undefined (an epic-level identity cannot locate a story artifact)`,
		);
	}
	const root = workItemRoot(repoPath, identity, workItemKind, slug);
	const storySeg = storyScoped ? storyFolder(identity.story as number) : '';
	// `join` collapses the empty story segment for item-root artifacts.
	return join(root, storySeg, `${kind}.md`);
}

// ---------------------------------------------------------------------------
// Enumerate the tree (replaces the flat readdir + filename-prefix scans)
// ---------------------------------------------------------------------------

/** Whether a repo-relative or absolute path names an existing directory. */
function isDir(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/**
 * Every work-item folder under `docs/epics/` and `docs/standalone/`, one entry
 * each (kind + repo-relative root; `storySeg` omitted at this level). Replaces
 * the readdir-over-`DOCS_ARTIFACT_DIRS` sweeps. A missing top-level dir yields no
 * entries (never throws); order is deterministic (sorted).
 */
export function listWorkItems(repoPath: string): readonly WorkItemLocation[] {
	const out: WorkItemLocation[] = [];
	for (const kind of ['epic', 'standalone'] as const) {
		const top  = topSegment(kind);
		const base = join(repoPath, 'docs', top);
		if (!existsSync(base)) continue;
		for (const name of readdirSync(base).sort()) {
			const abs = join(base, name);
			if (!isDir(abs)) continue;
			out.push({ kind, root: join('docs', top, name) });
		}
	}
	return out;
}

/**
 * Every artifact `.md` path within one work item — item-root SPEC/DEF/HLD plus
 * each `S<nnn>/` story artifact — as absolute paths. Replaces the
 * `basename.startsWith('BUILD-')`-style prefix scans. Bounded walk of the one
 * folder; deterministic (sorted) order; a missing folder yields no paths.
 */
export function listArtifactMdPaths(repoPath: string, location: WorkItemLocation): readonly string[] {
	const out: string[] = [];
	const root = join(repoPath, location.root);
	if (!existsSync(root)) return out;
	for (const name of readdirSync(root).sort()) {
		const abs = join(root, name);
		if (isDir(abs)) {
			// A story subfolder (`S<nnn>/`) — collect its `.md` artifacts.
			for (const inner of readdirSync(abs).sort()) {
				if (inner.endsWith('.md') && !isDir(join(abs, inner))) out.push(join(abs, inner));
			}
		} else if (name.endsWith('.md')) {
			out.push(abs);
		}
	}
	return out;
}

// Re-export the sc1 identity constructor so consumers can derive an identity +
// resolve a path from one import surface.
export { deriveWorkItemIdentity };
export type { WorkItemIdentity };
