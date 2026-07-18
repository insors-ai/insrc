/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * BuildArtifact — the `build` workflow (5th in the chain). OWNS sc7.
 *
 * One artifact per Story: the approved Story plan (a PlanArtifact of
 * ordered Tasks) in → each Task implemented into code out. Renders to
 * `docs/builds/BUILD-<epic-slug>-<story-id>.md`; canonical JSON at
 * `.insrc/artifacts/BUILD-<epic-hash>-<story-id>.json`.
 *
 * Mirrors `artifacts/plan.ts` in shape, reusing the parent module's
 * `hash.ts` / `slug.ts` / `storage.ts` writers rather than adding new
 * persistence machinery.
 *
 * s5 (winning alt a1) — a SINGLE, FLAT, OWNED type. The run-level scalars
 * (`runState` / `halt?` / `filesTouched` / `summary`) live DIRECTLY on the
 * record, not nested under a `body` or a `progress` sub-object, matching the
 * HLD interfaceSketch verbatim (no sc7 amendment). `taskOutcomes[]` (sc4) is
 * carried verbatim as the per-Task detail; `upstream` (the PlanArtifact
 * citation, sc3) is embedded, immutable once written.
 *
 * GROW-IN-PLACE durability: the identical flat shape is persisted at every
 * Task boundary (a `runState:'running'` checkpoint) and SEALED (hash-json +
 * slug-md) at finalize, so a complete, halted, OR daemon-restart-mid-run all
 * leave a readable ChainReport-style record. The projection + guards + seal
 * live in `runners/build/finalize.ts`; this module owns the type family,
 * the `filesTouched` projection, the shape guard, and the renderer.
 *
 * The envelope `meta` (approval / storage identity) and `citations` footer
 * are the standard artifact-envelope fields every sibling carries — the flat
 * sc7 semantic fields sit alongside them, they do not nest under a body.
 */

import { renderCitationBlock } from '../synthesizer.js';
import { artifactIdMarker, buildArtifactId } from '../storage.js';
import type { ArtifactMetaBase, Citation } from '../types.js';
import type {
	BuildHaltInfo,
	BuildRunState,
	BuildTaskOutcome,
	BuildTaskReached,
} from '../runners/build/schemas.js';

// sc4 `BuildTaskOutcome` is owned by Story s3 and defined in
// `runners/build/schemas.ts` as a status-discriminated union
// (`BuildTaskReached | BuildTaskUnreached | BuildTaskInFlight`) so the
// daemon-produced invariant (`filesTouched`/`testVerdict` are never
// self-reported) is enforced at the type level. The artifact re-exports the
// run-level vocabulary — a single source of truth.
export type { BuildTaskOutcome } from '../runners/build/schemas.js';
export type { BuildHaltInfo, BuildRunState } from '../runners/build/schemas.js';

// ---------------------------------------------------------------------------
// sc7 — BUILD_ARTIFACT_KIND + BuildArtifactUpstream + BuildArtifact
// ---------------------------------------------------------------------------

/** The literal artifact-kind discriminator for the build stage's record,
 *  mirroring the per-kind constants plan/define/design artifacts carry. This
 *  is the tag `gates.ts` + the reviewer approval path key the new kind on.
 *  An ADDITIONAL kind — it never changes the discriminant of any existing
 *  kind. */
export const BUILD_ARTIFACT_KIND = 'build' as const;

/** The embedded PlanArtifact citation block (ac3): the traceable link from
 *  the finalized record back to the approved plan it was built from.
 *  Populated ONLY from a `BuildAdmissionAccepted` (sc3) verdict — never from
 *  the implementer subprocess's self-report — and immutable once written. */
export interface BuildArtifactUpstream {
	readonly planArtifactId:   string;   // id of the approved PlanArtifact this run derived from (sc3)
	readonly planArtifactHash: string;   // canonical hash — pins the exact approved revision (sc3)
	readonly storyId:          string;   // the Story whose approved plan was implemented (sc3)
	readonly epicId:           string;   // the parent Epic id — completes the up-the-chain citation trail
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export interface BuildMeta extends ArtifactMetaBase {
	readonly epicHash:  string;
	readonly epicSlug:  string;
	readonly storyId:   string;
	readonly planRunId: string;                       // the PlanArtifact this build implemented
}

/** sc7 — the persistent, citable, approvable FLAT record the run finalizes
 *  into. The single owned type (a1): run-level scalars sit directly on the
 *  record, `taskOutcomes[]` (sc4) is the per-Task detail, `upstream` (sc3) is
 *  the embedded citation, and `halt` is present iff `runState==='halted'`
 *  (the only field that varies between complete and halted runs). */
export interface BuildArtifact {
	readonly kind:         typeof BUILD_ARTIFACT_KIND;
	readonly meta:         BuildMeta;
	readonly upstream:     BuildArtifactUpstream;
	readonly runState:     BuildRunState;                // re-projected ONCE at finalize from the terminal sc6 frame
	readonly taskOutcomes: readonly BuildTaskOutcome[];  // verbatim from sc4 — one per PlanTask a reviewer reads (ac2)
	readonly halt?:        BuildHaltInfo | undefined;    // present iff runState==='halted'
	readonly filesTouched: readonly string[];            // dedup union across all Tasks — what landed on the tree
	readonly summary:      string;                       // one-line human summary for the slug-md header
	readonly citations:    readonly Citation[];
}

export const BUILD_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// filesTouched projection (sc7 durability view)
// ---------------------------------------------------------------------------

/** The deduplicated set-union of `filesTouched` across every REACHED Task
 *  outcome (completed or failed — both carry the daemon's own working-tree
 *  diff), listing each path exactly once. Unreached (blocked / not-reached)
 *  and in-flight rows carry no diff, so they contribute nothing. This is the
 *  durability view: the true set of files that landed on the tree. */
export function projectFilesTouched(outcomes: readonly BuildTaskOutcome[]): readonly string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const o of outcomes) {
		if (!isReached(o)) continue;
		for (const f of o.filesTouched) {
			if (!seen.has(f)) { seen.add(f); out.push(f); }
		}
	}
	return out;
}

function isReached(o: BuildTaskOutcome): o is BuildTaskReached {
	return 'testVerdict' in o;
}

// ---------------------------------------------------------------------------
// Renderer — the s5-private slug-md, the SOLE place the citation is formatted
// ---------------------------------------------------------------------------

export function renderBuildMarkdown(artifact: BuildArtifact): string {
	const { meta, upstream, runState, taskOutcomes, halt, filesTouched, summary, citations } = artifact;
	const lines: string[] = [];
	lines.push(artifactIdMarker(buildArtifactId(meta.epicHash, meta.storyId)));
	lines.push('');
	lines.push(`# Build: ${meta.storyId}`);
	lines.push('');
	lines.push(`**Epic:** \`${meta.epicSlug}\``);
	lines.push(`**Plan run:** \`${meta.planRunId}\``);
	lines.push(`**Run state:** \`${runState}\``);
	lines.push('');

	// Upstream PlanArtifact citation block (ac3) — the up-the-chain trace
	// pinning the exact approved plan revision this run implemented.
	lines.push('## Upstream');
	lines.push('');
	lines.push(`- **Plan artifact:** \`${upstream.planArtifactId}\``);
	lines.push(`- **Plan hash:** \`${upstream.planArtifactHash}\``);
	lines.push(`- **Story:** \`${upstream.storyId}\``);
	lines.push(`- **Epic:** \`${upstream.epicId}\``);
	lines.push('');

	lines.push('## Summary');
	lines.push('');
	lines.push(summary);
	lines.push('');

	// One entry per Task in the plan order they were carried in (ac2).
	lines.push('## Task outcomes');
	lines.push('');
	if (taskOutcomes.length > 0) {
		lines.push('| Task | Status | Attempts | Tests | Files |');
		lines.push('| :--- | :--- | :--- | :--- | :--- |');
		for (const o of taskOutcomes) {
			// Narrow on the discriminant before reading the reached-arm fields.
			const reached  = isReached(o);
			const attempts = reached ? String((o as BuildTaskReached).attempts) : '—';
			const files    = reached ? String((o as BuildTaskReached).filesTouched.length) : '—';
			const tests    = reached
				? escapePipes((o as BuildTaskReached).testVerdict.summary)
				: (o.note !== undefined ? escapePipes(o.note) : '—');
			lines.push(`| \`${o.taskId}\` | ${o.status} | ${attempts} | ${tests} | ${files} |`);
		}
	} else {
		lines.push('_No Tasks were implemented in this run._');
	}
	lines.push('');

	if (halt !== undefined) {
		lines.push('## Halt');
		lines.push('');
		lines.push(`Run halted on Task \`${halt.failedTaskId}\` — ${escapeInline(halt.failedTaskTitle)}.`);
		lines.push('');
		lines.push(`**Reason:** ${escapeInline(halt.reason)}`);
		if (halt.blockedTaskIds.length > 0) {
			lines.push('');
			lines.push(`**Blocked:** ${halt.blockedTaskIds.map(id => `\`${id}\``).join(', ')}`);
		}
		lines.push('');
	}

	lines.push('## Files touched');
	lines.push('');
	if (filesTouched.length > 0) {
		for (const f of filesTouched) lines.push(`- \`${f}\``);
	} else {
		lines.push('_No files landed on the tree._');
	}

	// Shared citation footer (same envelope every artifact renderer uses).
	return lines.join('\n') + renderCitationBlock(citations);
}

function escapePipes(s: string): string { return s.replace(/\|/g, '\\|'); }
function escapeInline(s: string): string { return s.replace(/\n+/g, ' ').trim(); }

// ---------------------------------------------------------------------------
// Runtime type guards
// ---------------------------------------------------------------------------

const RUN_STATES: ReadonlySet<string> = new Set<BuildRunState>(['running', 'halted', 'complete']);

/** Guard the flat BuildArtifact shape, enforcing the load-bearing
 *  halt-present-iff-`runState==='halted'` invariant: a `halt` block on a
 *  complete/running record, or a `'halted'` record with no `BuildHaltInfo`,
 *  is rejected. Complete and halted runs both finalize into the SAME
 *  well-formed flat shape, differing only in this one field. */
export function isBuildArtifact(v: unknown): v is BuildArtifact {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	if (r['kind'] !== BUILD_ARTIFACT_KIND) return false;
	if (typeof r['meta'] !== 'object' || r['meta'] === null) return false;
	if (typeof r['upstream'] !== 'object' || r['upstream'] === null) return false;
	if (typeof r['runState'] !== 'string' || !RUN_STATES.has(r['runState'])) return false;
	if (!Array.isArray(r['taskOutcomes'])) return false;
	if (!Array.isArray(r['filesTouched'])) return false;
	if (typeof r['summary'] !== 'string') return false;
	// halt-present-iff-halted invariant.
	const halted  = r['runState'] === 'halted';
	const hasHalt = r['halt'] !== undefined && r['halt'] !== null;
	if (halted !== hasHalt) return false;
	return true;
}

export function isCitationArray(v: unknown): v is Citation[] {
	if (!Array.isArray(v)) return false;
	for (const c of v) {
		if (typeof c !== 'object' || c === null) return false;
		const r = c as Record<string, unknown>;
		if (typeof r['id'] !== 'string' || typeof r['kind'] !== 'string' || typeof r['ref'] !== 'string') return false;
	}
	return true;
}
