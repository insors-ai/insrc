/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The refusal every daemon entry point that reads or writes artifacts gives an unconverted repository (s9). The message names the
 * conversion and the `repo.convert` method, which is the one entry point this guard is not applied to.
 */

import { existsSync, statSync } from 'node:fs';

import { RepoSchemaGate } from '../workflow/artifact-core/repo-schema.js';

/** The schema version every artifact-reading entry point needs. */
export const REQUIRED_REPO_SCHEMA = 2;

let override: ((repo: string | undefined) => string | undefined) | undefined;

/** For tests: replace the check (a test that builds its repositories as bare temporary directories treats them as converted). Call with no argument to restore it. */
export function _setRepoSchemaGuardForTests(fn?: (repo: string | undefined) => string | undefined): void { override = fn; }

/**
 * Why a call on `repo` must be refused, or undefined when it may go on. A call that names no repository, or one that is not a
 * directory, is left to the entry point's own error. An unreadable marker is a refusal too.
 */
export function repoSchemaRefusal(repo: string | undefined): string | undefined {
	if (override !== undefined) return override(repo);
	if (repo === undefined || repo.length === 0 || !existsSync(repo) || !statSync(repo).isDirectory()) return undefined;
	try {
		const gate = RepoSchemaGate.require(repo, REQUIRED_REPO_SCHEMA);
		return gate.ok ? undefined : `${gate.message} (call repo.convert for ${repo}: a preview first, then mode 'apply')`;
	} catch (err) {
		return `the schema marker of ${repo} is not valid: ${(err as Error).message}`;
	}
}

/**
 * {@link repoSchemaRefusal} for the `repo` field of a step input, falling back to `fallback` (the caller's INSRC_REPO). A later phase
 * of a run carries only the `state` token of the run, which belongs to the repository the run started on and which the start already
 * checked: with no `repo` of its own it is not checked against the fallback, which may be another repository.
 */
export function repoSchemaRefusalOfInput(input: unknown, fallback: string | undefined = process.env['INSRC_REPO']): string | undefined {
	const { repo, state } = (input ?? {}) as { repo?: unknown; state?: unknown };
	if (typeof repo === 'string' && repo.length > 0) return repoSchemaRefusal(repo);
	if (typeof state === 'string' && state.length > 0) return undefined;
	return repoSchemaRefusal(fallback);
}
