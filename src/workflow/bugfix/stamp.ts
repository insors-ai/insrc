/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S004 — locate the fix's parent (sc3) and stamp it onto the approved
 * IssueArtifact's meta. A targeted META patch: it writes `meta.parentRef` and
 * never touches the issue body, so `renderIssueMarkdown` stays the single
 * source of truth for the chain record AND the GitHub issue body (k4).
 */

import { existsSync, readFileSync } from 'node:fs';

import type { IssueArtifact } from '../artifacts/issue.js';
import type { ParentLocation } from '../locate/index.js';
import { artifactJsonPath, issueArtifactId, writeAtomic } from '../storage.js';
import type { WorkItemRef } from '../types.js';
import type { StampDeps } from './types.js';

/**
 * Run the parent-locator against the approved issue's defect text and patch its
 * `meta.parentRef` with the result. Returns the sc3 decision.
 *
 * @throws issue-not-found — `deps.readIssue` returns null.
 * @throws not-approved — the issue has no `meta.approvedAt`.
 * A `deps.locateParent` rejection (infra failure) propagates WITHOUT writing —
 * a guessed/partial parentRef is never stamped.
 */
export async function locateAndStampParent(
	input: { repoPath: string; issueHash: string },
	deps: StampDeps,
): Promise<ParentLocation> {
	const issue = deps.readIssue(input.repoPath, input.issueHash);
	if (issue === null) {
		throw new Error(`locateAndStampParent: issue-not-found for issueHash '${input.issueHash}'`);
	}
	const approvedAt = issue.meta.approvedAt;
	if (typeof approvedAt !== 'string' || approvedAt.length === 0) {
		throw new Error(`locateAndStampParent: not-approved — issue '${input.issueHash}' has no meta.approvedAt`);
	}

	// The defect text grounds the locate. touchedPaths are empty at issue-approval
	// (the fix is not yet built), so sc3 degrades to its semantic/prompt/standalone
	// tiers per its own contract.
	const defectDescription = [
		issue.body.title,
		issue.body.reproduction,
		issue.body.rootCause,
		issue.body.fixIntent,
	].join('\n\n');

	const location = await deps.locateParent({ touchedPaths: [], defectDescription });
	deps.writeParentRef(input.repoPath, input.issueHash, location.parentRef);
	return location;
}

/**
 * Default fs-backed `StampDeps` — `readIssue`/`writeParentRef` round-trip the
 * canonical ISSUE-<hash>.json through the existing storage helpers (a
 * single-field meta patch via `writeAtomic`, never a re-finalize). The caller
 * supplies `locate`, the pre-bound sc3 entry point (wired with its own DB-bound
 * deps daemon-side), keeping this module free of DB imports (rule 1).
 */
export function defaultStampDeps(
	locate: StampDeps['locateParent'],
): StampDeps {
	return {
		readIssue(repoPath, issueHash) {
			const json = artifactJsonPath(repoPath, issueArtifactId(issueHash));
			if (!existsSync(json)) return null;
			try {
				return JSON.parse(readFileSync(json, 'utf8')) as IssueArtifact;
			} catch {
				return null;
			}
		},
		locateParent: locate,
		writeParentRef(repoPath, issueHash, ref: WorkItemRef | null) {
			const json = artifactJsonPath(repoPath, issueArtifactId(issueHash));
			const artifact = JSON.parse(readFileSync(json, 'utf8')) as IssueArtifact;
			// Meta-only patch: replace parentRef, leave body + citations byte-identical (k4).
			const patched: IssueArtifact = {
				...artifact,
				meta: { ...artifact.meta, parentRef: ref },
			};
			writeAtomic(json, `${JSON.stringify(patched, null, 2)}\n`);
		},
	};
}
