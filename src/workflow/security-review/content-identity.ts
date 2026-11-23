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

import { runShell } from '../../daemon/tools/shell-helper.js';
import type { ReviewTargets } from '../artifact-core/types.js';

/**
 * A deterministic digest over the repo's HEAD commit sha plus a sha256 of
 * every file named in targets.entries' actual, current raw bytes. Pure
 * function of repoPath's current git HEAD and targets.entries' current file
 * bytes -- never delegates to git_hash_object or relies on git status, which
 * can miss a tracked file marked assume-unchanged.
 */
export async function computeContentIdentity(repoPath: string, targets: ReviewTargets): Promise<string> {
	const head = await runShell(['git', 'rev-parse', 'HEAD'], { cwd: repoPath });
	if (head.spawnError || head.code !== 0) {
		throw new Error(`computeContentIdentity: '${repoPath}' is not a registered git repository, or its HEAD cannot be resolved: ${head.stderr.trim()}`);
	}

	const realRepoPath = await realpath(repoPath);

	const hash = createHash('sha256');
	hash.update(head.stdout.trim());
	for (const entry of targets.entries) {
		const resolved = resolve(repoPath, entry.path);
		const rel = relative(repoPath, resolved);
		if (rel === '..' || rel.startsWith(`..${sep}`)) {
			throw new Error(`computeContentIdentity: targets.entries path '${entry.path}' resolves outside repoPath`);
		}
		// A symlinked component (or the target itself a symlink) can point outside
		// repoPath without the lexical check above ever seeing '..'; realpath resolves
		// every symlink so the final location is checked against repoPath for real.
		const realResolved = await realpath(resolved);
		const realRel = relative(realRepoPath, realResolved);
		if (realRel === '..' || realRel.startsWith(`..${sep}`)) {
			throw new Error(`computeContentIdentity: targets.entries path '${entry.path}' resolves outside repoPath`);
		}
		const bytes = await readFile(resolved);
		hash.update(entry.path);
		hash.update(bytes);
	}
	return hash.digest('hex');
}
