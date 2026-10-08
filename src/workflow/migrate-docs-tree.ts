/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-time migration: relocate the existing FLAT docs artifacts into the nested,
 * work-item-first tree (sc2). Story S003 of the docs-artifact-tree Epic.
 *
 * The FLAT layout (retired by S002 for NEW writes) put each artifact md in a
 * per-type folder keyed by slug (DEF/HLD/LLD/PLAN/SPEC/EXT) or hash (BUILD/CR):
 *   docs/{defines,designs,plans,builds,specs,reviews}/<TYPE>-<slug|hash>[-story].md
 * The NEW layout groups every artifact of a work item under one identity-keyed
 * folder (docs/{epics|standalone}/<slug>-E<date><hash8>/[S<nnn>/]<KIND>.md).
 *
 * This module is a THROWAWAY tool that CONSUMES sc1 (deriveWorkItemIdentity) +
 * sc2 (resolveArtifactMdPath / listWorkItems / listArtifactMdPaths). It never
 * touches the hash-flat `.insrc/artifacts` JSON store — only md files move.
 *
 *   planMigration(repoPath)  — PURE: compute the { moves, linkRewrites, unmappable }
 *                              plan. No disk writes, no git. Safe as a dry-run.
 *   applyMigration(repoPath, plan) — the thin executor: git mv (history), link
 *                              rewrite, post-move validation, per-epic commits.
 *
 * The authoritative artifact SET is the JSON store (hand-written non-artifact
 * docs never appear there, so they are excluded by construction). Each artifact's
 * current flat md is LOCATED via its insrc:artifact marker (slug-named kinds) or
 * its hash-named filename (markerless BUILD/CR). One WorkItemIdentity is derived
 * per work item — anchor createdAt = the DEF's (or the standalone item's own) —
 * so every member lands in ONE folder (the S002 folder-anchor model).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import { getLogger } from '../shared/logger.js';
import { deriveWorkItemIdentity, type WorkItemIdentity } from './id.js';
import {
	listArtifactMdPaths,
	listWorkItems,
	resolveArtifactMdPath,
	type ArtifactKind,
	type WorkItemKind,
} from './path-scheme.js';
import { ARTIFACT_ID_MARKER_RE, ARTIFACTS_DIR } from './storage.js';

const log = getLogger('workflow:migrate-docs-tree');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrationMove {
	/** Absolute source (flat) md path. */
	readonly from:     string;
	/** Absolute destination (nested) md path. */
	readonly to:       string;
	/** The artifact kind, or `'COMPANION'` for a non-md sibling (er-model.html,
	 *  ux-mock.html, a diagram, a screenshot) that travels with its artifact. A
	 *  companion is not an artifact in its own right — it has no id and no entry in
	 *  the store — but it DOES occupy a folder, so it has to move or the folder it
	 *  sits in survives the convergence. */
	readonly kind:     ArtifactKind | 'COMPANION';
	/** Inherited verbatim from the artifact move whose folder this companion shares,
	 *  so a companion is chunked and committed with its own work item. */
	readonly identity: WorkItemIdentity;
	/** Group key (epicHash / specHash) — the per-epic chunk key. */
	readonly groupHash: string;
}

export interface LinkRewrite {
	/** Absolute md file whose content carries the link. */
	readonly file: string;
	/** Repo-relative flat path referenced. */
	readonly from: string;
	/** Repo-relative nested path it becomes. */
	readonly to:   string;
}

export interface Unmappable {
	readonly artifactId: string;
	readonly reason:     string;
}

export interface MigrationPlan {
	readonly moves:        readonly MigrationMove[];
	readonly linkRewrites: readonly LinkRewrite[];
	readonly unmappable:   readonly Unmappable[];
}

// ---------------------------------------------------------------------------
// Legacy flat layout (the inverse of the retired *ArtifactPaths naming)
// ---------------------------------------------------------------------------

/** The six flat per-type docs dirs the artifacts used to live in (retired by
 *  S002). Encoded here because the migration is the only remaining reader of the
 *  legacy layout. STUB is excluded (it never joined the artifact scheme). */
const FLAT_DIRS = ['docs/defines', 'docs/designs', 'docs/plans', 'docs/builds', 'docs/specs', 'docs/reviews'] as const;

/** Parse a canonical artifact id (`<KIND>-<hash>[-<storyId>]`) into its parts.
 *  Returns null for non-docs ids (e.g. `AMD-*` amendments) or a malformed id.
 *
 *  ISSUE is an item-root kind and MUST be listed: an ISSUE *is* the work item's
 *  definition head (the bugfix-route counterpart of DEF), so dropping it here
 *  excluded it from its own group — leaving its folder permanently unconvergeable
 *  and contributing the second folder this module exists to eliminate. */
function parseArtifactId(id: string): { kind: ArtifactKind; hash: string; storyId: string | undefined } | null {
	const m = /^(SPEC|DEF|HLD|LLD|PLAN|BUILD|CR|EXT|ISSUE|TESTS)-([0-9a-f]{16})(?:-(.+))?$/.exec(id);
	if (m === null) return null;
	const kind    = m[1] as ArtifactKind;
	const hash    = m[2]!;
	const storyId = m[3];
	// Story-scoped kinds require a storyId; item-root kinds must NOT carry one.
	// TESTS (a Story's test record) is listed so that a nested TESTS.md converges
	// with its Story: left out, it would stay behind in a forked folder, apart
	// from its BUILD.md, and keep that folder alive.
	const storyScoped = kind === 'LLD' || kind === 'PLAN' || kind === 'BUILD' || kind === 'CR' || kind === 'EXT' || kind === 'TESTS';
	if (storyScoped && (storyId === undefined || storyId.length === 0)) return null;
	if (!storyScoped && storyId !== undefined) return null;
	return { kind, hash, storyId };
}

/** Read the `<ID>` from a rendered md's insrc:artifact marker (first 4 KB). */
function readMarker(mdPath: string): string | undefined {
	try {
		const m = ARTIFACT_ID_MARKER_RE.exec(readFileSync(mdPath, 'utf8').slice(0, 4096));
		return m?.[1];
	} catch {
		return undefined;
	}
}

/** Build the id → current flat md path index by scanning the flat dirs: a
 *  marker-bearing md maps by its marker, a markerless `BUILD-*`/`CR-*` md maps by
 *  its filename id. A file with neither is a non-artifact and is left out. */
/** Index every md already NESTED under a work-item folder, by artifact id.
 *
 *  S001/t6. The flat index alone cannot see a misplaced nested artifact, and a
 *  misplaced nested artifact is precisely what a forked folder contains: the file
 *  is in the right SHAPE (`<slug>-<segment>/[S<nnn>/]<KIND>.md`) but under the
 *  wrong label or the wrong top-level. Indexing these lets the existing
 *  group-resolution logic — which already settles on ONE anchor and ONE slug per
 *  work item — emit the convergence moves it could not previously express. */
function indexNestedMd(repoPath: string): NestedIndex {
	const byId = new Map<string, string>();
	const byShape = new Map<string, string>();
	for (const location of listWorkItems(repoPath)) {
		for (const abs of listArtifactMdPaths(repoPath, location)) {
			const marker = readMarker(abs);
			if (marker !== undefined) {
				if (!byId.has(marker)) byId.set(marker, abs);
				continue;
			}
			// Markerless nested md. Rendered BUILD/CR ledgers carry no insrc:artifact
			// marker, and a nested filename is the bare `<KIND>.md`, so neither the
			// file nor its name yields an artifact id. The enclosing PATH does carry
			// identity — but only hash8, not the full 16-hex hash — so index by the
			// (kind, hash8, story-ordinal) SHAPE and let the artifact loop, which
			// knows the full hash, look itself up. Slug and top-level are excluded
			// from the key on purpose: those are exactly the parts that drift.
			const shape = nestedShapeKey(repoPath, abs);
			if (shape !== undefined && !byShape.has(shape)) byShape.set(shape, abs);
		}
	}
	return { byId, byShape };
}

interface NestedIndex {
	/** marker artifact id → absolute md path. */
	readonly byId:    Map<string, string>;
	/** `<KIND>|<hash8>|<storyOrdinal>` → absolute md path (markerless BUILD/CR). */
	readonly byShape: Map<string, string>;
}

/** The story ordinal for a storyId, via the canonical parse (`s1` and `S001`
 *  both → 1). The date argument only feeds `epicSegment`, which is unused here,
 *  so a fixed epoch keeps this a pure ordinal lookup rather than a second,
 *  drifting copy of the normalisation. */
function storyOrdinalOf(storyId: string | undefined): number | undefined {
	if (storyId === undefined) return undefined;
	try {
		return deriveWorkItemIdentity('0'.repeat(16), '1970-01-01T00:00:00.000Z', storyId).story;
	} catch {
		return undefined;
	}
}

/** Build the shape key for a markerless nested md, or undefined when the path is
 *  not a recognisable `<slug>-E<date><hash8>/S<nnn>/<BUILD|CR>.md`. */
function nestedShapeKey(repoPath: string, abs: string): string | undefined {
	const rel   = relative(repoPath, abs).split(sep);
	const file  = rel[rel.length - 1] ?? '';
	const kind  = file.endsWith('.md') ? file.slice(0, -3) : '';
	if (kind !== 'BUILD' && kind !== 'CR') return undefined;   // only these render markerless
	const storySeg = rel[rel.length - 2];
	const itemSeg  = rel[rel.length - 3];
	if (storySeg === undefined || itemSeg === undefined) return undefined;
	const story = storyOrdinalOf(storySeg);
	if (story === undefined) return undefined;
	const hash8 = /-E\d{8}([0-9a-f]{8})$/.exec(itemSeg)?.[1];
	if (hash8 === undefined) return undefined;
	return `${kind}|${hash8}|${story}`;
}

/** The shape key for an artifact whose full identity is known. */
function artifactShapeKey(kind: ArtifactKind, hash: string, storyId: string | undefined): string | undefined {
	if (kind !== 'BUILD' && kind !== 'CR') return undefined;
	const story = storyOrdinalOf(storyId);
	if (story === undefined) return undefined;
	return `${kind}|${hash.slice(0, 8)}|${story}`;
}

/** Every md in the docs tree — nested work-item folders plus the legacy flat
 *  dirs. Used by the link-rewrite scan, which must see files that are NOT moving
 *  as well as those that are. */
function allDocsMdPaths(repoPath: string): string[] {
	const out: string[] = [];
	for (const location of listWorkItems(repoPath)) out.push(...listArtifactMdPaths(repoPath, location));
	for (const dir of FLAT_DIRS) {
		const abs = join(repoPath, dir);
		if (!existsSync(abs)) continue;
		for (const name of readdirSync(abs)) if (name.endsWith('.md')) out.push(join(abs, name));
	}
	return out;
}

function indexFlatMd(repoPath: string): Map<string, string> {
	const index = new Map<string, string>();
	for (const dir of FLAT_DIRS) {
		const abs = join(repoPath, dir);
		if (!existsSync(abs)) continue;
		for (const name of readdirSync(abs)) {
			if (!name.endsWith('.md')) continue;
			const full = join(abs, name);
			const marker = readMarker(full);
			if (marker !== undefined) {
				index.set(marker, full);
				continue;
			}
			// Markerless: only BUILD/CR ledgers, whose filename IS the hash id.
			const base = name.slice(0, -3);
			if (/^(BUILD|CR)-[0-9a-f]{16}-.+$/.test(base)) index.set(base, full);
		}
	}
	return index;
}

// ---------------------------------------------------------------------------
// planMigration — pure
// ---------------------------------------------------------------------------

interface Artifact {
	readonly id:       string;
	readonly kind:     ArtifactKind;
	readonly hash:     string;
	readonly storyId:  string | undefined;
	readonly createdAt: string | undefined;
	/** The stamped work-item anchor (S002); when present it is THE folder key the
	 *  live writer uses, so the migration prefers it over a reconstructed anchor. */
	readonly epicCreatedAt: string | undefined;
	readonly epicSlug: string | undefined;
	readonly standalone: boolean;
	/** Set only when the md sits in a legacy FLAT dir. Kept separate from
	 *  {@link Artifact.mdPath} because the slug can be parsed out of a flat
	 *  FILENAME, which a nested `<KIND>.md` never carries. */
	readonly flatPath: string | undefined;
	/** The md's CURRENT location, flat or nested, or undefined when no md exists.
	 *  S001/t6: previously only flat paths were indexed, so a NESTED md sitting at
	 *  the wrong nested path was reported unmappable instead of being moved —
	 *  which is exactly the already-forked-folder case. */
	readonly mdPath: string | undefined;
}

/** Read the (small) subset of companion-JSON meta the migration needs. */
function readMeta(jsonPath: string): { createdAt?: string; epicCreatedAt?: string; epicSlug?: string; standalone?: boolean } {
	try {
		const parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: { createdAt?: unknown; epicCreatedAt?: unknown; epicSlug?: unknown; standalone?: unknown } };
		const meta = parsed.meta ?? {};
		return {
			...(typeof meta.createdAt     === 'string' ? { createdAt:     meta.createdAt }     : {}),
			...(typeof meta.epicCreatedAt === 'string' ? { epicCreatedAt: meta.epicCreatedAt } : {}),
			...(typeof meta.epicSlug      === 'string' ? { epicSlug:      meta.epicSlug }      : {}),
			...(meta.standalone === true ? { standalone: true } : {}),
		};
	} catch {
		return {};
	}
}

/** Parse the human slug out of a slug-named flat filename (`DEF-<slug>.md`,
 *  `LLD-<slug>-<storyId>.md`). Hash-named BUILD/CR yield no usable slug. */
function slugFromFlatFilename(kind: ArtifactKind, storyId: string | undefined, flatPath: string): string | undefined {
	if (kind === 'BUILD' || kind === 'CR') return undefined;   // hash-named
	const base = flatPath.slice(flatPath.lastIndexOf('/') + 1, -3);   // strip dir + .md
	let body = base.slice(base.indexOf('-') + 1);                     // strip `<KIND>-`
	if (storyId !== undefined && body.endsWith(`-${storyId}`)) body = body.slice(0, -(storyId.length + 1));
	return body.length > 0 ? body : undefined;
}

/**
 * Compute the migration plan PURELY — no disk writes, no git. Enumerates the
 * artifact set from `.insrc/artifacts/*.json`, groups by work item, derives one
 * identity + slug + anchor createdAt per group, and resolves each member's nested
 * destination via {@link resolveArtifactMdPath}. See the module header.
 */
export function planMigration(repoPath: string): MigrationPlan {
	const artifactsDir = join(repoPath, ARTIFACTS_DIR);
	const moves:        MigrationMove[] = [];
	const linkRewrites: LinkRewrite[]   = [];
	const unmappable:   Unmappable[]    = [];
	if (!existsSync(artifactsDir)) return { moves, linkRewrites, unmappable };

	const flatIndex   = indexFlatMd(repoPath);
	const nestedIndex = indexNestedMd(repoPath);
	const nestedShape = (kind: ArtifactKind, hash: string, storyId: string | undefined): string | undefined => {
		const key = artifactShapeKey(kind, hash, storyId);
		return key === undefined ? undefined : nestedIndex.byShape.get(key);
	};

	// 1. Enumerate the authoritative artifact set from the JSON store.
	const artifacts: Artifact[] = [];
	for (const name of readdirSync(artifactsDir).sort()) {
		if (!name.endsWith('.json')) continue;
		const id = name.slice(0, -5);
		const parsed = parseArtifactId(id);
		if (parsed === null) continue;   // AMD-* / non-docs / malformed → not a relocatable artifact
		const meta = readMeta(join(artifactsDir, id + '.json'));
		artifacts.push({
			id,
			kind: parsed.kind,
			hash: parsed.hash,
			storyId: parsed.storyId,
			createdAt: meta.createdAt,
			epicCreatedAt: meta.epicCreatedAt,
			epicSlug: meta.epicSlug,
			standalone: meta.standalone === true || parsed.kind === 'SPEC',
			flatPath: flatIndex.get(id),
			mdPath:   flatIndex.get(id)
				?? nestedIndex.byId.get(id)
				?? nestedShape(parsed.kind, parsed.hash, parsed.storyId),
		});
	}

	// 2. Group by work item (hash) and resolve one identity per group.
	const groups = new Map<string, Artifact[]>();
	for (const a of artifacts) {
		const g = groups.get(a.hash);
		if (g === undefined) groups.set(a.hash, [a]);
		else g.push(a);
	}

	const toSeen = new Map<string, string>();   // dest → first artifactId (collision detection)
	/** identity segment → the work-item folder that segment converges to. Lets an
	 *  ORPHANED companion be placed when its own artifact's md is not moving. */
	const segmentRoots = new Map<string, { readonly root: string; readonly identity: WorkItemIdentity; readonly groupHash: string }>();

	for (const [hash, members] of [...groups.entries()].sort()) {
		const workItemKind: WorkItemKind = members.some(m => m.standalone) ? 'standalone' : 'epic';

		// Anchor createdAt: prefer the STAMPED epicCreatedAt (S002) — that IS the
		// folder key the live writer uses, so migrated + future-written members
		// coincide. Fall back to the DEF's createdAt (its own anchor; what the stamp
		// would have been), else a standalone item's own (the LLD's, or the earliest
		// member). Shared by every member so the group stays in one folder.
		const def = members.find(m => m.kind === 'DEF');
		const lld = members.find(m => m.kind === 'LLD');
		const stamped = def?.epicCreatedAt ?? members.map(m => m.epicCreatedAt).find((c): c is string => typeof c === 'string');
		const anchor = stamped
			?? def?.createdAt
			?? lld?.createdAt
			?? members.map(m => m.createdAt).filter((c): c is string => typeof c === 'string').sort()[0];

		// Slug label: prefer the DEFINITION HEAD's slug (DEF, else ISSUE), then any
		// slug-carrying member, then a slug-named flat filename. The head ordering is
		// explicit rather than incidental: members arrive in sorted-id order, where
		// `BUILD-` precedes `DEF-`/`ISSUE-`, so a downstream record that carries its
		// own re-derived slug would otherwise outvote the head and name the folder
		// after a later stage. This mirrors readEpicDefinitionCore's DEF-then-ISSUE
		// precedence (t1), so the migration and the live writer agree on the label.
		const slugOf = (m: Artifact | undefined): string | undefined =>
			typeof m?.epicSlug === 'string' && m.epicSlug.length > 0 ? m.epicSlug : undefined;
		const issue = members.find(m => m.kind === 'ISSUE');
		let slug = slugOf(def)
			?? slugOf(issue)
			?? members.map(m => m.epicSlug).find((s): s is string => typeof s === 'string' && s.length > 0);
		if (slug === undefined) {
			for (const m of members) {
				if (m.flatPath === undefined) continue;
				const fromFile = slugFromFlatFilename(m.kind, m.storyId, m.flatPath);
				if (fromFile !== undefined) { slug = fromFile; break; }
			}
		}

		// A work item with NO slug source anywhere falls back to its HASH as the
		// label. This is not a guess and not a new convention: every writer in the
		// path scheme composes with `epicSlug ?? epicHash`, so the hash is already
		// the documented label for an unlabelled work item, and such a folder is
		// exactly what the live writer produces today.
		//
		// Treating it as unmappable instead was a real divergence from the writer,
		// and an all-or-nothing one: applyMigration refuses the WHOLE plan while any
		// entry is unmappable, so two ledger-only work items with no definition head
		// blocked convergence for every other work item in the repo.
		const label = slug ?? hash;
		if (anchor === undefined) {
			for (const m of members) {
				unmappable.push({ artifactId: m.id, reason: `no anchor createdAt (no DEF/LLD/member createdAt) for work item ${hash}` });
			}
			continue;
		}

		// The group's resolved work-item FOLDER, recorded so an orphaned companion
		// can be placed even when no md of its own is moving (see step 2c).
		try {
			const groupIdentity = deriveWorkItemIdentity(hash, anchor);
			segmentRoots.set(groupIdentity.epicSegment, {
				root: dirname(resolveArtifactMdPath(repoPath, groupIdentity, 'DEF', workItemKind, label)),
				identity: groupIdentity,
				groupHash: hash,
			});
		} catch { /* an unresolvable group simply contributes no companion target */ }

		for (const m of members) {
			let identity: WorkItemIdentity;
			let to: string;
			try {
				identity = deriveWorkItemIdentity(m.hash, anchor, m.storyId);
				to = resolveArtifactMdPath(repoPath, identity, m.kind, workItemKind, label);
			} catch (err) {
				unmappable.push({ artifactId: m.id, reason: `cannot resolve destination: ${err instanceof Error ? err.message : String(err)}` });
				continue;
			}

			if (m.mdPath === undefined) {
				// No md anywhere — neither flat nor nested. Either already at its
				// destination (idempotent skip) or the file is simply gone.
				if (existsSync(to)) continue;
				unmappable.push({ artifactId: m.id, reason: `md file not found in a flat or nested docs dir and not at its destination ${relative(repoPath, to)}` });
				continue;
			}
			if (m.mdPath === to) continue;   // already correctly placed

			const prior = toSeen.get(to);
			if (prior !== undefined) {
				unmappable.push({ artifactId: m.id, reason: `destination collision with ${prior} at ${relative(repoPath, to)}` });
				continue;
			}
			// The destination already holds a DIFFERENT file. In practice this is one
			// artifact rendered twice, at two paths, by writers that disagreed about
			// the label — so both copies are "its" md and neither is a stray.
			//
			// Skip rather than refuse, and skip rather than move. Refusing would be
			// all-or-nothing and would block convergence for every unrelated work item
			// (the condition this plan already had to stop doing once). Moving would
			// make `git mv` fail hard mid-run — which is what happened on this repo,
			// aborting a 57-move apply and rolling the whole thing back. Choosing a
			// winner would DESTROY one render, and that is a human's call, not a
			// migration's. So both copies stay, the folder does not converge, and the
			// condition is logged loudly enough to act on.
			if (existsSync(to)) {
				log.warn(
					{ artifactId: m.id, keeping: relative(repoPath, to), alsoAt: relative(repoPath, m.mdPath) },
					'migrate-docs-tree: duplicate render — the destination already holds a different file for this artifact; ' +
					'leaving BOTH in place (this folder will not converge until one is removed by hand)',
				);
				continue;
			}
			toSeen.set(to, m.id);
			moves.push({ from: m.mdPath, to, kind: m.kind, identity, groupHash: hash });
		}
	}

	// 2b. COMPANION files travel with their artifact.
	//
	//     A companion (er-model.html, ux-mock.html, a sequence diagram, a mock
	//     screenshot) is placed by resolveCompanionPath as a SIBLING of its
	//     artifact's md, inside the same `S<nnn>/` folder. The migration indexed
	//     only `.md`, so companions were left behind — and a single orphaned
	//     er-model.html is enough to keep a whole work-item folder alive, which
	//     defeats convergence just as effectively as a stranded document.
	//
	//     Ownership is taken from the FOLDER rather than guessed per file: a story
	//     folder belongs to one work item, so when every md leaving it goes to the
	//     same destination folder, its non-md siblings go there too. If a folder's
	//     md files disagree on their destination the companions are left alone —
	//     ambiguous ownership is not something to resolve by guessing.
	const dirMoves = new Map<string, { readonly toDirs: Set<string>; readonly owner: MigrationMove }>();
	for (const mv of moves) {
		const from = dirname(mv.from);
		const seen = dirMoves.get(from);
		if (seen === undefined) dirMoves.set(from, { toDirs: new Set([dirname(mv.to)]), owner: mv });
		else seen.toDirs.add(dirname(mv.to));
	}
	const companionMoves: MigrationMove[] = [];
	for (const [fromDir, { toDirs, owner }] of dirMoves) {
		if (toDirs.size !== 1) continue;                       // ambiguous owner — leave it
		const toDir = [...toDirs][0]!;
		if (toDir === fromDir) continue;
		let names: string[];
		try { names = readdirSync(fromDir); } catch { continue; }
		for (const name of names) {
			if (name.endsWith('.md')) continue;                 // md is already handled
			const abs = join(fromDir, name);
			try { if (statSync(abs).isDirectory()) continue; } catch { continue; }
			if (existsSync(join(toDir, name))) continue;        // already there — never overwrite
			companionMoves.push({
				from: abs, to: join(toDir, name), kind: 'COMPANION',
				identity: owner.identity, groupHash: owner.groupHash,
			});
		}
	}

	// 2c. ORPHANED companions — a story folder left holding only non-md files.
	//
	//     After a first convergence pass the artifact md has already moved, so there
	//     is no sibling move left to inherit a destination from, and the companion
	//     sits alone keeping its old folder alive. Two such folders existed on this
	//     repo. The destination comes from the work item's own resolved folder for
	//     that identity segment, so it is the same answer the md itself got.
	for (const [top] of [['docs/epics'], ['docs/standalone']] as const) {
		const topAbs = join(repoPath, top);
		if (!existsSync(topAbs)) continue;
		for (const itemName of readdirSync(topAbs)) {
			const segment = /-((?:E\d{8}[0-9a-f]{8}))$/.exec(itemName)?.[1];
			if (segment === undefined) continue;
			const target = segmentRoots.get(segment);
			if (target === undefined) continue;
			const itemAbs = join(topAbs, itemName);
			let storyNames: string[];
			try { storyNames = readdirSync(itemAbs); } catch { continue; }
			for (const storySeg of storyNames) {
				const storyAbs = join(itemAbs, storySeg);
				try { if (!statSync(storyAbs).isDirectory()) continue; } catch { continue; }
				let files: string[];
				try { files = readdirSync(storyAbs); } catch { continue; }
				if (files.some(f => f.endsWith('.md'))) continue;       // not orphaned
				const destStory = join(target.root, storySeg);
				if (destStory === storyAbs) continue;                   // already home
				for (const name of files) {
					const abs = join(storyAbs, name);
					try { if (statSync(abs).isDirectory()) continue; } catch { continue; }
					if (existsSync(join(destStory, name))) continue;    // never overwrite
					companionMoves.push({
						from: abs, to: join(destStory, name), kind: 'COMPANION',
						identity: target.identity, groupHash: target.groupHash,
					});
				}
			}
		}
	}

	moves.push(...companionMoves);

	// 3. Cross-document link rewrites: find every md that REFERENCES a moved
	//    artifact's old path, and record the rewrite.
	//
	//    This used to scan only the files that were THEMSELVES moving, which left a
	//    hole that convergence walks straight into: when a work item's folders are
	//    merged, the artifact already sitting in the destination folder does NOT
	//    move, and it is typically the ISSUE — the one document most likely to link
	//    to its own Story's LLD and PLAN. Its links pointed at paths that no longer
	//    existed, and nothing rewrote them. So the scan now covers every md in the
	//    docs tree, moving or not.
	const movedRel = new Map<string, string>();
	for (const mv of moves) movedRel.set(relative(repoPath, mv.from), relative(repoPath, mv.to));
	if (movedRel.size > 0) {
		for (const abs of allDocsMdPaths(repoPath)) {
			const selfRel = relative(repoPath, abs);
			let content: string;
			try { content = readFileSync(abs, 'utf8'); } catch { continue; }
			for (const [fromRel, toRel] of movedRel) {
				// A file never rewrites a reference to its own old path: the move
				// itself relocates it, and `applyMigration` reads it at its
				// destination.
				if (fromRel === selfRel) continue;
				if (content.includes(fromRel)) linkRewrites.push({ file: abs, from: fromRel, to: toRel });
			}
		}
	}

	return { moves, linkRewrites, unmappable };
}

// ---------------------------------------------------------------------------
// applyMigration — thin git executor
// ---------------------------------------------------------------------------

function git(repoPath: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' });
}

/** Every intra-artifact md link in the nested tree must resolve to a real file
 *  (ac3/k4). Walks the tree via sc2 and checks each `](…​.md)` docs link. */
function validatePostMoveLinks(repoPath: string): void {
	const linkRe = /\]\(([^)]+\.md)\)/g;
	for (const loc of listWorkItems(repoPath)) {
		for (const md of listArtifactMdPaths(repoPath, loc)) {
			let content: string;
			try { content = readFileSync(md, 'utf8'); } catch { continue; }
			let m: RegExpExecArray | null;
			while ((m = linkRe.exec(content)) !== null) {
				const target = m[1]!;
				if (!target.includes('docs/')) continue;   // only intra-repo docs links
				const resolved = target.startsWith('docs/') ? join(repoPath, target) : join(dirname(md), target);
				if (!existsSync(resolved)) {
					throw new Error(`migrate-docs-tree: post-move link does not resolve: '${target}' in ${relative(repoPath, md)}`);
				}
			}
		}
	}
}

/**
 * Apply the plan: git mv each move (history preserved), rewrite links, run the
 * post-move validation, then commit per-epic chunks. Refuses a plan with a
 * non-empty `unmappable[]` (fail-loud) and rolls the whole run back (leaving no
 * partial mix) on any git-mv or validation failure BEFORE committing.
 */
/** Remove each given directory if empty, then walk UPWARD removing newly-empty
 *  parents. Stops at the two docs top-levels, which are never removed even when
 *  empty, and never escapes the repo. Best-effort: a non-empty or unreadable
 *  directory is simply left alone. */
function pruneEmptyDirsUpward(repoPath: string, dirs: ReadonlySet<string>): void {
	const stopAt = new Set([join(repoPath, 'docs', 'epics'), join(repoPath, 'docs', 'standalone'), join(repoPath, 'docs'), repoPath]);
	for (const start of dirs) {
		let dir = start;
		while (!stopAt.has(dir) && dir.startsWith(repoPath) && existsSync(dir)) {
			let entries: readonly string[];
			try { entries = readdirSync(dir); } catch { break; }
			if (entries.length > 0) break;
			try { rmdirSync(dir); } catch { break; }
			dir = dirname(dir);
		}
	}
}

export function applyMigration(repoPath: string, plan: MigrationPlan): void {
	if (plan.unmappable.length > 0) {
		const lines = plan.unmappable.map(u => `  - ${u.artifactId}: ${u.reason}`).join('\n');
		throw new Error(`migrate-docs-tree: refusing to apply — ${plan.unmappable.length} unmappable artifact(s):\n${lines}`);
	}
	if (plan.moves.length === 0) {
		log.info('migrate-docs-tree: nothing to migrate (already nested)');
		return;
	}
	// Require a clean working tree so a rollback (git reset --hard) can't discard
	// unrelated work.
	if (git(repoPath, 'status', '--porcelain').trim().length > 0) {
		throw new Error('migrate-docs-tree: refusing to apply — the git working tree is not clean; commit or stash first');
	}
	// Pin the pre-run commit so a failure mid-way through the per-epic chunk
	// commits rolls the WHOLE run back (not just to the last committed chunk).
	const startSha = git(repoPath, 'rev-parse', 'HEAD').trim();

	try {
		const vacated = new Set<string>();
		for (const mv of plan.moves) {
			mkdirSync(dirname(mv.to), { recursive: true });
			git(repoPath, 'mv', mv.from, mv.to);
			vacated.add(dirname(mv.from));
		}
		// S001/t6 — prune the directories the moves emptied.
		//
		// `git mv` relocates FILES and leaves the vacated directory behind. For the
		// original flat-to-nested migration that was harmless: the flat dirs were
		// shared and stayed populated. For folder CONVERGENCE it defeats the point —
		// a work item would still show four folders in the docs tree, three of them
		// empty, which is precisely the confusion the Story exists to remove. git
		// does not track empty directories, so this is a filesystem concern only and
		// cannot lose content.
		pruneEmptyDirsUpward(repoPath, vacated);
		for (const lr of plan.linkRewrites) {
			const abs = plan.moves.find(m => m.from === lr.file)?.to ?? lr.file;
			const content = readFileSync(abs, 'utf8');
			writeFileSync(abs, content.split(lr.from).join(lr.to), 'utf8');
			git(repoPath, 'add', abs);
		}
		validatePostMoveLinks(repoPath);

		// Commit per-epic chunks (reviewable), all staged already by git mv/add.
		const byGroup = new Map<string, MigrationMove[]>();
		for (const mv of plan.moves) {
			const g = byGroup.get(mv.groupHash);
			if (g === undefined) byGroup.set(mv.groupHash, [mv]); else g.push(mv);
		}
		for (const [groupHash, mvs] of byGroup) {
			const paths = [...new Set(mvs.flatMap(m => [m.from, m.to]))];
			git(repoPath, 'commit', '-m', `chore(docs): migrate ${groupHash} artifacts to the nested work-item tree (S003)`, '--', ...paths);
		}
		log.info({ moves: plan.moves.length, chunks: byGroup.size }, 'migrate-docs-tree: applied');
	} catch (err) {
		// Roll back the WHOLE run to the pinned pre-run commit — including any
		// per-epic chunk commits that already landed — so no partial mix survives (lc1).
		try { git(repoPath, 'reset', '--hard', startSha); git(repoPath, 'clean', '-fd', 'docs'); } catch { /* best-effort */ }
		throw err;
	}
}
