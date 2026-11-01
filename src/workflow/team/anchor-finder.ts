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
 *
 * The git reads go through the tool registry (Story s9): a denied call is thrown as ToolDenied; any other
 * failure leaves the anchor unknown, as before.
 */

import { LOCAL_GIT_TIMEOUT_MS, orFallback, pathHistory, revParseValues } from '../git-calls.js';
import { POLICY_PATH } from './git.js';
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
export async function findAnchor(repo: string, trackingRef: string, budget?: () => number, signal?: AbortSignal): Promise<PolicyAnchor> {
	if (budget !== undefined && budget() <= 0) return UNKNOWN; // no time left: do not start another git call
	const left = (): number => (budget === undefined ? LOCAL_GIT_TIMEOUT_MS : Math.max(1, budget()));
	const shallow = await orFallback(revParseValues(repo, { isShallow: true }, { timeoutMs: left(), signal }), undefined);
	if (shallow === undefined || shallow[0] !== 'false') return UNKNOWN;
	if (budget !== undefined && budget() <= 0) return UNKNOWN;
	const added = await orFallback(pathHistory(repo, { rev: trackingRef, path: POLICY_PATH, diffFilter: 'A', firstParent: true, reverse: true }, { timeoutMs: left(), signal }), undefined);
	const first = added?.[0];
	return first === undefined ? UNKNOWN : { known: true, firstCommit: first.sha, firstCommitTime: first.committerTime };
}
