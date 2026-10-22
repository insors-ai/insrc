/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TEST HELPER — a repository whose Epic has a head. An amendment is a head of the Epic's work item, so it takes the Epic's anchor
 * from the Define; a repository with no Define cannot hold one.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const EPIC_CREATED = '2026-07-01T00:00:00.000Z';

/** Give `repo` a Define head for `epicHash`. */
export function seedEpicHead(repo: string, epicHash: string): void {
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	writeFileSync(join(repo, '.insrc', 'artifacts', `DEF-${epicHash}.json`), JSON.stringify({
		meta: { workflow: 'define', epicHash, createdAt: EPIC_CREATED, epicCreatedAt: EPIC_CREATED }, body: {}, citations: [],
	}));
}

/** A fresh temporary repository holding the Define heads of `epicHashes`. */
export function mkAmendmentRepo(...epicHashes: readonly string[]): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-amend-'));
	for (const h of epicHashes) seedEpicHead(repo, h);
	return repo;
}
