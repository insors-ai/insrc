/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Team service (Story s2) — the two command-bar commands behind
 * `team init [path]` and `team refresh [path] [--branch <name>]`.
 * Each returns one result line and throws a plain Error on failure, which
 * the command bar renders as a cross-prefixed line.
 */

import { refreshPolicy } from '../../workflow/team/policy-refresh.js';
import { writeStarterPolicy } from '../../workflow/team/starter-policy.js';
import { toAbsPath } from './repo.js';

export async function teamInit(repoPath: string): Promise<string> {
	const written = writeStarterPolicy(toAbsPath(repoPath));
	if (!written.ok) throw new Error(written.reason);
	return `✓ wrote ${written.value.path} — review it, then commit it and merge it to the default branch`;
}

export async function teamRefresh(repoPath: string, branch?: string): Promise<string> {
	const refreshed = await refreshPolicy(toAbsPath(repoPath), { branch });
	if (!refreshed.ok) throw new Error(refreshed.reason);
	const out = refreshed.value;
	const warn = out.warnings.length > 0 ? `  ⚠ ${out.warnings.join('; ')}` : '';
	switch (out.kind) {
		case 'fetched': return `✓ fetched ${out.branch} @ ${out.sha.slice(0, 7)} — team policy applied${warn}`;
		case 'absent':  return `• no policy file on ${out.branch} — this repository is treated as solo${warn}`;
		case 'invalid': return `⚠ the policy file on ${out.branch} is invalid and team actions will be refused until it is fixed: ${out.reason}${warn}`;
	}
}
