/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * shared-reviewcontext-data-model Epic sc2/sc6 (staleness check / path validation), owned by s1.
 * Pure, synchronous, no I/O -- callers supply any already-read file content or hash.
 */

import { resolve, sep } from 'node:path';

import type { Pointer, StalenessResult, PathValidationResult } from './types.js';

export type PointerStalenessCheck = (pointer: Pointer, currentContentHash: string) => StalenessResult;

/** `pointer.contentHash` absent means no hash was ever recorded, so it is never stale. */
export const checkPointerStaleness: PointerStalenessCheck = (pointer, currentContentHash) => ({
	stale: pointer.contentHash !== undefined && pointer.contentHash !== currentContentHash,
	checkedAt: new Date().toISOString(),
});

export type PointerPathValidator = (pointer: Pointer, registeredRepoRoot: string) => PathValidationResult;

/** Mirrors src/db/repos.ts's own repo-path normalization: compare post-`resolve` to stay inside the root. */
export const validatePointerPath: PointerPathValidator = (pointer, registeredRepoRoot) => {
	const root = resolve(registeredRepoRoot);
	const resolved = resolve(root, pointer.path);
	if (resolved === root || resolved.startsWith(root + sep)) {
		return { ok: true, violations: [] };
	}
	return { ok: false, violations: [`'${pointer.path}' resolves to '${resolved}', outside repo root '${root}'`] };
};
