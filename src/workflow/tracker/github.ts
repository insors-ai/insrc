/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * What the tracker modules share about GitHub: the classified `gh` failure, the remote-URL
 * parser and the result shapes. Every `git` and `gh` command goes through the tool registry
 * (registry-table.ts); nothing in this module runs a process.
 */

export type GhFailureKind = 'missing-tool' | 'missing-signin' | 'unreachable' | 'rejected';

/** A failed `gh` command, classified. `reason` names the missing tool or
 *  sign-in (or carries gh's own message); it is also the Error message. */
export class GhCommandError extends Error {
	readonly kind:   GhFailureKind;
	readonly reason: string;
	constructor(kind: GhFailureKind, reason: string) {
		super(reason);
		this.name   = 'GhCommandError';
		this.kind   = kind;
		this.reason = reason;
	}
}


export interface CommitArtifactsResult {
	readonly committed: boolean;
	readonly pushed:    boolean;
	readonly reason?:   string;   // why nothing was committed / pushed
}


/** Pure parser (SSH + HTTPS). Strips a trailing `.git` rather than
 *  banning dots, so dotted repo names (`owner/react.dev`) parse. */
export function parseGithubRemoteUrl(url: string): { readonly owner: string; readonly repo: string } | null {
	const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url.trim());
	if (m === null) return null;
	return { owner: m[1]!, repo: m[2]! };
}

export interface CreatedIssue {
	readonly ref:   string;    // owner/repo#N
	readonly id:    number;    // REST database id (needed for sub-issue linking)
	readonly typed: boolean;   // whether the native issue type was applied
}

/** Read-side projection of a GitHub issue into a tracker task. */
export interface TrackerTask {
	readonly number:    number;
	readonly title:     string;
	readonly state:     'open' | 'closed';
	readonly author:    string;
	readonly assignees: readonly string[];
	readonly labels:    readonly string[];
	readonly milestone?: string;
	readonly epic?:     string;   // from an `epic:<slug>` label, prefix stripped
	readonly story?:    string;   // from a `story:<id>` label, prefix stripped
	readonly url:       string;
}

/** The four supported query filters, all optional. */
export interface TaskQueryFilters {
	readonly owner?: string;                        // GitHub assignee login
	readonly state?: 'open' | 'closed' | 'all';     // default 'open'
	readonly epic?:  string;                         // epic slug or full `epic:` label
	readonly story?: string;                         // story id or full `story:` label
}

/** Cursor-based page request over GitHub results. */
export interface PageRequest {
	readonly cursor?: string;   // opaque endCursor from a prior page
	readonly size?:   number;   // defaults to DEFAULT_PAGE_SIZE
}

/** First-class paginated return — carries `hasNextPage`/`endCursor` so a flat
 *  array can never silently truncate the result set. */
export interface TaskPage {
	readonly tasks:    readonly TrackerTask[];
	readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor?: string };
	readonly total?:   number;
}
