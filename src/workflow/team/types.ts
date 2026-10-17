/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Team policy types (Story s2, HLD contract sc2).
 *
 * `PolicyReader` and `PolicyResult` keep the HLD envelope exactly;
 * `TeamPolicy.source` gains the additive `anchorKnown` (AMD-315d510cb28100e2-4).
 */

export type SignoffStage = 'DEF' | 'HLD' | 'LLD' | 'BUILD';

export const SIGNOFF_STAGES: readonly SignoffStage[] = ['DEF', 'HLD', 'LLD', 'BUILD'];

export type PolicyResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

/** The authored content of `.insrc/policy.json` on the remote default branch. */
export interface PolicyFile {
	readonly teamMode:        boolean;
	readonly signoffStages:   readonly SignoffStage[];
	readonly claimsEnforced:  boolean;
	readonly administrators:  readonly string[];
}

/** The grandfathering anchor: the first commit at which the policy file appeared. */
export interface PolicyAnchor {
	readonly known:           boolean;
	/** Empty string when `known` is false. */
	readonly firstCommit:     string;
	/** ISO committer time; empty string when `known` is false. */
	readonly firstCommitTime: string;
}

export interface TeamPolicy extends PolicyFile {
	readonly claimUnits: {
		readonly epic:  readonly ['DEF', 'HLD'];
		readonly story: readonly ['LLD', 'PLAN'];
		readonly task:  readonly ['BUILD'];
	};
	readonly forceTaskIssues: true;
	readonly source: {
		readonly ref:             string;
		readonly fetchedAt:       string;
		readonly firstCommit:     string;
		readonly firstCommitTime: string;
		readonly anchorKnown:     boolean;
	};
}

export type PolicyReader = (repo: string) => PolicyResult<TeamPolicy | 'none'>;

/** What a successful refresh found on the default branch. */
export type PolicyRefreshOutcome =
	| { readonly kind: 'fetched'; readonly branch: string; readonly sha: string; readonly warnings: readonly string[] }
	| { readonly kind: 'absent';  readonly branch: string; readonly warnings: readonly string[] }
	| { readonly kind: 'invalid'; readonly branch: string; readonly reason: string; readonly warnings: readonly string[] };
