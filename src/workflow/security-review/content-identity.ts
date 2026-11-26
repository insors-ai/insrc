/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * computeContentIdentity (sc1/sc2 shared), Epic add-dedicated-security-reviews.
 *
 * ONE shared, simple digest over exactly a round's own targets.entries: a
 * deterministic hash of the repo's HEAD commit sha plus every named file's
 * actual, current raw bytes. Not manager-aware -- s2 (dependency-advisory
 * collection) and s3 (code-vulnerability pass) both call this SAME function
 * over the SAME targets, so a single identity covers both passes.
 */

import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import type { GitRevParseData } from '../../daemon/tools/builtins/git/schemas.js';
import { executeTool } from '../../daemon/tools/executor.js';
import type { ToolDeps } from '../../daemon/tools/types.js';
import { listRepos } from '../../db/repos.js';
import { currentStepContext } from '../../shared/step-context.js';
import type { ReviewTargets } from '../artifact-core/types.js';

/** executeTool's assertExplicitConnectionExecution rejects a call made under a bound
 *  connection-execution context (e.g. a review driven from inside an analyze/workflow
 *  step) unless that EXACT trusted carrier is passed through explicitly -- omitting it
 *  is only safe for a genuinely unbound caller. Reading the ambient one from the step
 *  context (undefined outside any step call) and threading it through keeps both cases
 *  working with the same deps shape. */
function makeToolDeps(repoPath: string): ToolDeps {
	return { sessionId: 'security-review-identity', repoPath, send: () => undefined, requestId: 0, caller: 'workflow', connectionExecution: currentStepContext()?.connectionExecution };
}

/** The repo-registration check, overridable for unit tests (so a test does not
 *  need a real, running daemon graph store to register a fixture repo in).
 *  No argument resets to the real listRepos(null). */
let isRepoRegistered: (repoPath: string) => Promise<boolean> = async repoPath => (await listRepos(null)).some(r => r.path === repoPath);
export function _setContentIdentityDepsForTests(fn?: (repoPath: string) => Promise<boolean>): void {
	isRepoRegistered = fn ?? (async repoPath => (await listRepos(null)).some(r => r.path === repoPath));
}

/** The SAME registration check computeContentIdentity enforces below, exported
 *  for any other caller that must authorize a repoPath against the real
 *  registry before doing anything with it (e.g. handleSecurityReviewStep's
 *  own admission check) -- one registry lookup, never a second drifting copy.
 *  Governed by the SAME test seam above. */
export async function checkRepoRegistered(repoPath: string): Promise<boolean> {
	return isRepoRegistered(repoPath);
}

/**
 * A deterministic digest over the repo's HEAD commit sha plus a sha256 of
 * every file named in targets.entries' actual, current raw bytes. Pure
 * function of repoPath's current git HEAD and targets.entries' current file
 * bytes -- never delegates to git_hash_object or relies on git status, which
 * can miss a tracked file marked assume-unchanged.
 */
/**
 * The REAL (realpath-resolved) containment check, as opposed to a purely
 * lexical `resolve`/`relative` test: a symlinked path component, or the
 * target itself being a symlink, can point outside repoPath without a
 * lexical check ever seeing '..'. Exported so any caller that does I/O on a
 * target BEFORE reaching this module's own computeContentIdentity (e.g.
 * handle-security-review-step.ts's freshness stat) can run the SAME
 * canonical check first, rather than only catching the escape here, after
 * that earlier I/O already touched the resolved path.
 */
export async function assertTargetsCanonicallyContained(repoPath: string, targets: ReviewTargets): Promise<void> {
	const realRepoPath = await realpath(repoPath);
	for (const entry of targets.entries) {
		const resolved = resolve(repoPath, entry.path);
		const realResolved = await realpath(resolved);
		const realRel = relative(realRepoPath, realResolved);
		if (realRel === '..' || realRel.startsWith(`..${sep}`)) {
			throw new Error(`targets.entries path '${entry.path}' resolves outside repoPath`);
		}
	}
}

export async function computeContentIdentity(repoPath: string, targets: ReviewTargets): Promise<string> {
	if (!(await isRepoRegistered(repoPath))) {
		throw new Error(`computeContentIdentity: '${repoPath}' is not a registered repo`);
	}

	const head = await executeTool('git_rev_parse', { cwd: repoPath, rev: 'HEAD' }, makeToolDeps(repoPath));
	const headSha = head.success ? (head.data as GitRevParseData | undefined)?.values[0] : undefined;
	if (headSha === undefined) {
		throw new Error(`computeContentIdentity: '${repoPath}' is a registered repo, but its HEAD cannot be resolved: ${head.error ?? head.output}`);
	}

	for (const entry of targets.entries) {
		const resolved = resolve(repoPath, entry.path);
		const rel = relative(repoPath, resolved);
		if (rel === '..' || rel.startsWith(`..${sep}`)) {
			throw new Error(`computeContentIdentity: targets.entries path '${entry.path}' resolves outside repoPath`);
		}
	}
	try {
		await assertTargetsCanonicallyContained(repoPath, targets);
	} catch (err) {
		throw new Error(`computeContentIdentity: ${(err as Error).message}`);
	}

	// Each piece is framed as `<path>\0<fixed-length sha256 of its bytes>` before
	// joining the outer hash. A path can never contain a NUL byte on any
	// supported filesystem, so the `\0` boundary is unambiguous; hashing each
	// file's digest (always exactly 32 bytes) rather than its raw, variable-length
	// bytes directly rules out two different (path, bytes) sequences concatenating
	// to the identical byte stream -- which raw concatenation alone would not.
	const hash = createHash('sha256');
	hash.update(`${headSha}\0`);
	for (const entry of targets.entries) {
		const resolved = resolve(repoPath, entry.path);
		const bytes = await readFile(resolved);
		const fileDigest = createHash('sha256').update(bytes).digest();
		hash.update(`${entry.path}\0`);
		hash.update(fileDigest);
	}
	return hash.digest('hex');
}
