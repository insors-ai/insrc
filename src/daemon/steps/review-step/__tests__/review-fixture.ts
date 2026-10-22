/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A design artifact in the layout the review tool resolves: the json in the artifact store, the markdown under docs/epics with its marker. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const FIXTURE_HASH = 'abcd1234ef567890';

/** The artifact id a workflow's head has in these fixtures. */
export function idOfWorkflow(workflow: string): string {
	switch (workflow) {
		case 'design.epic': return `HLD-${FIXTURE_HASH}`;
		case 'define':      return `DEF-${FIXTURE_HASH}`;
		case 'issue':       return `ISSUE-${FIXTURE_HASH}`;
		case 'plan':        return `PLAN-${FIXTURE_HASH}-s1`;
		default:            return `LLD-${FIXTURE_HASH}-s1`;
	}
}

/** Write the head at `.insrc/artifacts/<id>.json` and its markdown, which begins with the marker that names the head. */
export function writeDesign(repo: string, id: string, head: { meta: Record<string, unknown>; body: unknown; citations?: unknown[] }, md: string): { mdPath: string; jsonPath: string } {
	const artifacts = join(repo, '.insrc', 'artifacts');
	mkdirSync(artifacts, { recursive: true });
	const jsonPath = join(artifacts, `${id}.json`);
	writeFileSync(jsonPath, JSON.stringify({ meta: { epicHash: FIXTURE_HASH, ...head.meta }, body: head.body, citations: head.citations ?? [] }, null, 2) + '\n');
	const kind = id.split('-')[0] ?? 'LLD';
	const dir = join(repo, 'docs', 'epics', 'review-fixture-E20260101abcd1234', id.includes('-s') ? 'S001' : '.');
	mkdirSync(dir, { recursive: true });
	const mdPath = join(dir, `${kind}.md`);
	writeFileSync(mdPath, `<!-- insrc:artifact ${id} -->\n\n${md}`);
	return { mdPath, jsonPath };
}
