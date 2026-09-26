/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The production MOUNT for the bugfix orchestration seam.
 *
 * `advanceBugfixAfterIssue` / `completeBugfixTracker` (advance.ts) are the
 * exported orchestration entrypoints; until now they had no production caller.
 * This module is the single place that runs them AFTER an artifact is approved:
 * the daemon `workflow.approve` handler calls `advanceApprovedBugfixes` with the
 * just-approved artifact set and attaches the returned `FollowOnOutcome[]` to the
 * approval result. approveWorkflowTarget itself stays synchronous (its many
 * callers + sync tests are untouched); the async seam runs here, one level up, in
 * the already-async daemon handler (the LLD's a1→a2 amendment).
 *
 * Rule 1 (no DB in the controller/workflow layer): the DB-bound parent inference
 * is injected as `inferCandidates` — the daemon binds it to its own graph handle
 * (the same wiring the `locate.inferParents` IPC uses); this module only composes
 * the pure `locateParent` policy + the fs-backed stamp/tracker deps.
 *
 * Scope note (build→issue linkage): a bugfix BUILD artifact's meta does NOT carry
 * `issueHash` today, so the completion-close half only fires when a completed
 * BUILD carries one — a correct no-op otherwise. The GH-issue create leg is NOT
 * injected here (no `AdvanceTrackerDeps`), so a plain advance stamps + routes with
 * no GitHub side effect and there is nothing to close (create/close symmetry).
 * Wiring the tracker create leg + the build→issue linkage is a tracked follow-up.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { InferParentsRequest, InferredCandidates } from '../locate/types.js';
import { locateParent } from '../locate/index.js';
import { resolveWorkflowRef } from '../tracker/resolve.js';
import type { FollowOnOutcome } from '../gates.js';
import { advanceBugfixAfterIssue, completeBugfixTracker } from './advance.js';
import { defaultStampDeps } from './stamp.js';
import { defaultTrackerCloseDeps, type TrackerCloseDeps } from './tracker.js';
import type { StampDeps } from './types.js';

/** The thresholds the tiered locator clears a graph / semantic candidate at.
 *  Mirrors the value the locate tests exercise; a graph match needs ≥2 signals,
 *  a semantic match ≥0.75 cosine — below which the locate defers to standalone. */
const LOCATE_THRESHOLDS = { graph: 2, semantic: 0.75 } as const;

/** Minimal meta the mount reads off an approved artifact JSON to decide whether a
 *  bugfix seam applies. Everything is optional — a non-bugfix artifact simply
 *  matches nothing and produces no follow-on. */
interface ApprovedMetaLite {
	readonly workflow?:  string;
	readonly issueHash?: string;
}

/** Injected collaborators. `inferCandidates` is the only REQUIRED one (the daemon
 *  supplies its DB-bound binding). The rest default to the production fs/CLI-backed
 *  implementations and exist as seams so the mount is unit-testable without a DB,
 *  GitHub, or a real repo. */
export interface AdvanceApprovedDeps {
	readonly inferCandidates: (req: InferParentsRequest) => Promise<InferredCandidates>;
	/** Override the advance seam (tests inject a spy). */
	readonly advance?:  typeof advanceBugfixAfterIssue;
	/** Override the completion-close seam (tests inject a spy). */
	readonly complete?: typeof completeBugfixTracker;
	/** Override the fs-backed stamp deps (tests avoid disk). */
	readonly stampDeps?: StampDeps;
	/** Override the fs/CLI-backed tracker-close deps (tests avoid GitHub). */
	readonly closeDeps?: TrackerCloseDeps;
	/** Override how an approved artifact's meta is read (tests avoid disk). */
	readonly readMeta?: (jsonPath: string) => ApprovedMetaLite | null;
	/** Gate flag threaded to the seam; when `false` the seam no-ops. Defaults on. */
	readonly bugfixCategory?: boolean;
}

/** Read `{ workflow, issueHash }` off an approved artifact JSON. Returns null when
 *  the file is missing / unparseable / has no meta — the seam then never runs for
 *  it (a non-bugfix / malformed artifact is simply skipped). */
function readApprovedMeta(jsonPath: string): ApprovedMetaLite | null {
	try {
		if (!existsSync(jsonPath)) return null;
		const meta = (JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: ApprovedMetaLite }).meta;
		return typeof meta === 'object' && meta !== null ? meta : null;
	} catch {
		return null;
	}
}

/**
 * Run the bugfix follow-on seam for every just-approved artifact and return one
 * `FollowOnOutcome` per artifact the seam acted on (an empty array when none was a
 * bugfix artifact). Each seam call is wrapped: a throw becomes an `ok:false`
 * outcome + note and NEVER propagates, so a seam failure can never undo an
 * approval that already stamped `approvedAt`.
 *
 * - An approved **issue** artifact (`meta.workflow === 'issue'` + `meta.issueHash`)
 *   → `advanceBugfixAfterIssue` (locate + stamp parent, admit, route next stage).
 * - A completed **BUILD** artifact carrying `meta.issueHash`
 *   → `completeBugfixTracker` (close the GH issue). A no-op today for lack of the
 *     build→issue linkage; mounted at the right point for when it lands.
 */
export async function advanceApprovedBugfixes(
	approved: readonly { readonly path: string }[],
	opts: { readonly repoPath: string } & AdvanceApprovedDeps,
): Promise<FollowOnOutcome[]> {
	const { repoPath } = opts;
	const runAdvance  = opts.advance  ?? advanceBugfixAfterIssue;
	const runComplete = opts.complete ?? completeBugfixTracker;
	const seamOpts = opts.bugfixCategory !== undefined ? { bugfixCategory: opts.bugfixCategory } : undefined;

	const stampDeps: StampDeps = opts.stampDeps ?? defaultStampDeps(
		(input) => locateParent(
			{ touchedPaths: input.touchedPaths, defectDescription: input.defectDescription },
			{
				repoPath,
				resolveRef:      resolveWorkflowRef,
				inferCandidates: opts.inferCandidates,
				promptForRef:    async () => null,   // non-interactive daemon run — defer to standalone
				thresholds:      LOCATE_THRESHOLDS,
			},
		),
	);
	const closeDeps: TrackerCloseDeps = opts.closeDeps ?? defaultTrackerCloseDeps();

	const out: FollowOnOutcome[] = [];
	const readMeta = opts.readMeta ?? readApprovedMeta;

	for (const { path } of approved) {
		const meta = readMeta(path);
		if (meta === null) continue;

		// --- post-issue advance -------------------------------------------------
		if (meta.workflow === 'issue' && typeof meta.issueHash === 'string' && meta.issueHash.length > 0) {
			try {
				const res = await runAdvance(
					{ repoPath, issueHash: meta.issueHash, repo: repoPath },
					stampDeps,
					seamOpts,
				);
				out.push({
					kind: 'bugfix-advance',
					artifactPath: path,
					ok: true,
					...(res.skipped !== undefined ? { note: res.skipped } : {}),
				});
			} catch (err) {
				out.push({ kind: 'bugfix-advance', artifactPath: path, ok: false, note: errMessage(err) });
			}
			continue;
		}

		// --- completion-path tracker close --------------------------------------
		// Guarded on the BUILD- id + an issueHash on the completed artifact's meta.
		// The build→issue linkage is not in the data model yet, so this is a correct
		// no-op today; mounted here so it fires the moment a BUILD carries issueHash.
		if (basename(path).startsWith('BUILD-') && typeof meta.issueHash === 'string' && meta.issueHash.length > 0) {
			try {
				const res = await runComplete({ repoPath, issueHash: meta.issueHash }, closeDeps, seamOpts);
				out.push({
					kind: 'bugfix-complete',
					artifactPath: path,
					ok: true,
					...(res.reason !== undefined ? { note: res.reason } : {}),
				});
			} catch (err) {
				out.push({ kind: 'bugfix-complete', artifactPath: path, ok: false, note: errMessage(err) });
			}
		}
	}

	return out;
}

function errMessage(v: unknown): string {
	return v instanceof Error ? v.message : String(v);
}
