/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pins which functions still use the legacy `out()` / `silent()` exec path (no
 * timeout, no classification) after the tracker port migration. A migrated
 * wrapper that slips back onto the legacy path, or a new legacy user, fails here.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/legacy-exec.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Every function that still calls out() or silent(), by design (s1 LLD): */
const RETAINED: Readonly<Record<string, string>> = {
	commitAndPushArtifacts:       'git commit/push of artifacts (not a tracker call)',
	gitOriginOwnerRepo:           'git remote read (not a tracker call)',
	ghAuthOk:                     'stays exported; the lenient gate calls it',
	ghCreateIssue:                'untyped create, no production caller',
	ghGetIssueState:              'status read in sync.ts; deferred to the status-sync story',
	ghFindIssueByLabels:          'legacy lookup, no production caller since the port (the adapter has the strict one)',
	ghTokenScopes:                'rest of setup.ts',
	ghListOrgIssueTypes:          'rest of setup.ts',
	ghCreateOrgIssueType:         'rest of setup.ts',
	ghCreateProject:              'rest of setup.ts',
	ghFindProjectByTitle:         'rest of setup.ts',
	ghAddProjectSingleSelectField: 'rest of setup.ts',
	ghListRepoIssueUrls:          'rest of setup.ts',
	ghAddProjectItem:             'rest of setup.ts',
	queryTasks:                   'graphql task search, kept as is',
};

function sourceFiles(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) {
			if (name !== '__tests__' && name !== 'node_modules') sourceFiles(p, out);
		} else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
	}
	return out;
}

/** function name -> file, for each function whose body calls out( or silent( (the runner definitions excluded). */
function legacyExecUsers(): Map<string, string> {
	const users = new Map<string, string>();
	for (const file of sourceFiles('src')) {
		let current = '<top level>';
		for (const line of readFileSync(file, 'utf8').split('\n')) {
			const decl = /^(?:export )?(?:async )?function (\w+)/.exec(line);
			if (decl !== null) current = decl[1]!;
			const trimmed = line.trim();
			if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
			if (/^function (out|silent)\b/.test(line)) continue;
			if (/(?<![\w.])(out|silent)\(\s*'(gh|git)'/.test(line)) users.set(current, file);
		}
	}
	return users;
}

test('only the expected functions still use the legacy exec path', () => {
	const users = legacyExecUsers();
	assert.deepEqual([...users.keys()].sort(), Object.keys(RETAINED).sort());
	for (const file of users.values()) assert.equal(file, 'src/workflow/tracker/github.ts');
});
