/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Default-branch resolution for the refresh (Story s2).
 *
 * Order, first that applies wins:
 *   1. the branch the remote itself names (`ls-remote --symref <remote> HEAD`), which overrides any pin;
 *   2. the branch recorded in a valid sighting for this remote;
 *   3. a branch the user supplied with --branch, accepted only after `ls-remote --heads` lists it;
 *   otherwise the refresh refuses and asks the user to name the branch.
 * A remote that cannot be reached is refused at once: the refresh needs it for the fetch anyway.
 * Nothing here writes: a refusal or a failed verification records nothing.
 */

import type { Deadline, GitAsync } from './git-async.js';
import { runGitAsync } from './git-async.js';
import { isSafeRefName } from './sighting-store.js';
import type { BranchSource, Sighting } from './sighting-store.js';

export type BranchDecision =
	| { readonly ok: true;  readonly branch: string; readonly source: BranchSource }
	| { readonly ok: false; readonly reason: string };

export interface ResolveInput {
	readonly repo:      string;
	readonly remote:    string;
	/** The valid sighting for this repo, if any (only used when it was recorded for this remote). */
	readonly sighting?: Sighting | undefined;
	/** The name from --branch. */
	readonly supplied?: string | undefined;
	readonly deadline:  Deadline;
	readonly git?:      GitAsync | undefined;
}

/** `ref: refs/heads/main\tHEAD` -> `main` (undefined when the remote names no default branch). */
export function parseSymrefHead(output: string): string | undefined {
	for (const line of output.split('\n')) {
		const m = /^ref:\s+refs\/heads\/(\S+)\s+HEAD\s*$/.exec(line.trim());
		if (m !== null && m[1] !== undefined && isSafeRefName(m[1])) return m[1];
	}
	return undefined;
}

const ASK = (remote: string): string => `run 'team refresh --branch <default-branch-name>' to name the default branch of remote '${remote}'`;

export async function resolveDefaultBranch(input: ResolveInput): Promise<BranchDecision> {
	const git = input.git ?? runGitAsync;
	const { repo, remote, deadline } = input;

	const symref = await git(repo, ['ls-remote', '--symref', remote, 'HEAD'], deadline);
	if (symref.ok) {
		const named = parseSymrefHead(symref.stdout);
		if (named !== undefined) return { ok: true, branch: named, source: 'remote' };
	}
	if (!symref.ok) return { ok: false, reason: `remote '${remote}' could not be reached (${symref.stderr}); nothing was recorded` };

	const recorded = input.sighting !== undefined && input.sighting.remote === remote ? input.sighting : undefined;
	if (recorded !== undefined) return { ok: true, branch: recorded.branch, source: recorded.branchSource };

	if (input.supplied !== undefined) {
		const name = input.supplied;
		if (!isSafeRefName(name)) return { ok: false, reason: `'${name}' is not a usable branch name` };
		const heads = await git(repo, ['ls-remote', '--heads', remote, `refs/heads/${name}`], deadline);
		if (!heads.ok) return { ok: false, reason: `branch '${name}' could not be verified on remote '${remote}' (${heads.stderr}); nothing was recorded` };
		const listed = heads.stdout.split('\n').some(l => l.trim().endsWith(`\trefs/heads/${name}`));
		if (!listed) return { ok: false, reason: `branch '${name}' does not exist on remote '${remote}'; nothing was recorded` };
		return { ok: true, branch: name, source: 'user' };
	}

	return { ok: false, reason: `remote '${remote}' names no default branch and none is recorded; ${ASK(remote)}` };
}
