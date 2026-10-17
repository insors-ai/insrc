/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * StarterPolicyWriter (Story s2).
 *
 * Writes a starter `.insrc/policy.json` for a team lead to review and commit.
 * It is published by hard link so an existing file (committed or not) is never
 * overwritten, and nothing is committed or pushed.
 */

import { statSync } from 'node:fs';
import { join } from 'node:path';

import { publishCreateOnly } from './create-only.js';
import { POLICY_PATH } from './git.js';
import type { PolicyFile, PolicyResult } from './types.js';

/** Signoff for definition, high-level design, low-level design and build completion; claims enforced. */
export const STARTER_POLICY: PolicyFile = {
	teamMode: true,
	signoffStages: ['DEF', 'HLD', 'LLD', 'BUILD'],
	claimsEnforced: true,
	administrators: [],
};

export function writeStarterPolicy(repo: string): PolicyResult<{ path: string }> {
	try {
		if (!statSync(repo).isDirectory()) return { ok: false, reason: `${repo} is not a directory` };
	} catch {
		return { ok: false, reason: `${repo} does not exist` };
	}

	const dest = join(repo, POLICY_PATH);
	try {
		return publishCreateOnly(dest, JSON.stringify(STARTER_POLICY, null, 2) + '\n') === 'created'
			? { ok: true, value: { path: dest } }
			: { ok: false, reason: `${POLICY_PATH} already exists; it was left untouched` };
	} catch (err) {
		return { ok: false, reason: `the starter policy could not be written: ${err instanceof Error ? err.message : String(err)}` };
	}
}
