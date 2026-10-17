/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * AnchorFinder (Story s2).
 *
 * The grandfathering anchor is the first commit at which the policy file
 * appeared on the default branch: the oldest add of `.insrc/policy.json` on the
 * first-parent history of the tracking ref, so a later delete and re-add never
 * moves it. A shallow repository is never trusted, because git lists the
 * shallow boundary commit as an add even though the file existed earlier.
 */

import { POLICY_PATH, runGit } from './git.js';
import type { PolicyAnchor } from './types.js';

const UNKNOWN: PolicyAnchor = { known: false, firstCommit: '', firstCommitTime: '' };

/** Parse `git log --reverse --format=%H<TAB>%cI` output: the first line is the oldest add. */
export function parseAnchorLog(output: string): PolicyAnchor {
	const first = output.split('\n').map(l => l.trim()).find(l => l.length > 0);
	if (first === undefined) return UNKNOWN;
	const [sha, time] = first.split('\t');
	if (sha === undefined || time === undefined || !/^[0-9a-f]{40,64}$/.test(sha) || time.length === 0) return UNKNOWN;
	return { known: true, firstCommit: sha, firstCommitTime: time };
}

/**
 * `budget`, when given, returns the milliseconds left in a caller's deadline; each git call
 * below takes what is left at that moment, so the two calls together never exceed it.
 */
export function findAnchor(repo: string, trackingRef: string, budget?: () => number): PolicyAnchor {
	if (budget !== undefined && budget() <= 0) return UNKNOWN; // no time left: do not start another git call
	const left = (): number | undefined => (budget === undefined ? undefined : Math.max(1, budget()));
	const shallow = runGit(repo, ['rev-parse', '--is-shallow-repository'], left());
	if (!shallow.ok || shallow.stdout.trim() !== 'false') return UNKNOWN;
	if (budget !== undefined && budget() <= 0) return UNKNOWN;
	const log = runGit(repo, ['log', '--first-parent', '--diff-filter=A', '--reverse', '--format=%H%x09%cI', trackingRef, '--', `:(top)${POLICY_PATH}`], left());
	return log.ok ? parseAnchorLog(log.stdout) : UNKNOWN;
}
