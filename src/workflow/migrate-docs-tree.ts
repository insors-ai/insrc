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
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

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
	readonly kind:     ArtifactKind;
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
 *  Returns null for non-docs ids (e.g. `AMD-*` amendments) or a malformed id. */
function parseArtifactId(id: string): { kind: ArtifactKind; hash: string; storyId: string | undefined } | null {
	const m = /^(SPEC|DEF|HLD|LLD|PLAN|BUILD|CR|EXT)-([0-9a-f]{16})(?:-(.+))?$/.exec(id);
	if (m === null) return null;
	const kind    = m[1] as ArtifactKind;
	const hash    = m[2]!;
	const storyId = m[3];
	// Story-scoped kinds require a storyId; item-root kinds must NOT carry one.
	const storyScoped = kind === 'LLD' || kind === 'PLAN' || kind === 'BUILD' || kind === 'CR' || kind === 'EXT';
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
	readonly flatPath: string | undefined;
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

	const flatIndex = indexFlatMd(repoPath);

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

		// Slug label: from a slug-carrying member's meta, else parsed from a
		// slug-named flat filename.
		let slug = members.map(m => m.epicSlug).find((s): s is string => typeof s === 'string' && s.length > 0);
		if (slug === undefined) {
			for (const m of members) {
				if (m.flatPath === undefined) continue;
				const fromFile = slugFromFlatFilename(m.kind, m.storyId, m.flatPath);
				if (fromFile !== undefined) { slug = fromFile; break; }
			}
		}

		if (anchor === undefined || slug === undefined) {
			const reason = anchor === undefined ? 'no anchor createdAt (no DEF/LLD/member createdAt)' : 'no slug source (no member epicSlug, no slug-named filename)';
			for (const m of members) unmappable.push({ artifactId: m.id, reason: `${reason} for work item ${hash}` });
			continue;
		}

		for (const m of members) {
			let identity: WorkItemIdentity;
			let to: string;
			try {
				identity = deriveWorkItemIdentity(m.hash, anchor, m.storyId);
				to = resolveArtifactMdPath(repoPath, identity, m.kind, workItemKind, slug);
			} catch (err) {
				unmappable.push({ artifactId: m.id, reason: `cannot resolve destination: ${err instanceof Error ? err.message : String(err)}` });
				continue;
			}

			if (m.flatPath === undefined) {
				// Not in a flat dir. Either already nested (idempotent skip) or its md is gone.
				if (existsSync(to)) continue;   // already at its destination — skip
				unmappable.push({ artifactId: m.id, reason: `md file not found in a flat docs dir and not at its nested destination ${relative(repoPath, to)}` });
				continue;
			}
			if (m.flatPath === to) continue;   // already placed (defensive; flat != nested in practice)

			const prior = toSeen.get(to);
			if (prior !== undefined) {
				unmappable.push({ artifactId: m.id, reason: `destination collision with ${prior} at ${relative(repoPath, to)}` });
				continue;
			}
			toSeen.set(to, m.id);
			moves.push({ from: m.flatPath, to, kind: m.kind, identity, groupHash: hash });
		}
	}

	// 3. Cross-document link rewrites: scan each moved md for a repo-relative
	//    reference to another moved artifact's OLD flat path.
	const flatToNestedRel = new Map<string, string>();
	for (const mv of moves) flatToNestedRel.set(relative(repoPath, mv.from), relative(repoPath, mv.to));
	for (const mv of moves) {
		let content: string;
		try { content = readFileSync(mv.from, 'utf8'); } catch { continue; }
		for (const [flatRel, nestedRel] of flatToNestedRel) {
			if (flatRel !== relative(repoPath, mv.from) && content.includes(flatRel)) {
				linkRewrites.push({ file: mv.from, from: flatRel, to: nestedRel });
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
		for (const mv of plan.moves) {
			mkdirSync(dirname(mv.to), { recursive: true });
			git(repoPath, 'mv', mv.from, mv.to);
		}
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
