/**
 * The site list of the tracker move (Story s10): the 31 wrapper rows of the replacement table equal the gh exports of github.ts, every row
 * has a registry test, no production file outside github.ts still calls a wrapper, and the migration record lists every row, site and daemon method.
 * Run: npx tsx --test-force-exit src/workflow/tracker/__tests__/site-list.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as github from '../github.js';
import { createRegistryTable, workflowToolDeps } from '../registry-table.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..', '..');
const ROOT = join(SRC, '..');
const read = (p: string): string => readFileSync(p, 'utf8');
const RECORD = read(join(ROOT, 'docs', 'plans', 'tool-registry-migration-record.md'));

const WRAPPERS = [
	'ghAuthOk', 'ghCreateLabel', 'ghCreateIssue', 'ghCreateIssueTyped', 'ghLinkSubIssue', 'ghGetIssueId', 'ghGetIssueBody', 'ghEditIssueBody',
	'ghComment', 'ghListIssueComments', 'ghPostCommentReturningId', 'ghCloseIssue', 'ghGetIssueState', 'ghFindIssueByLabels',
	'ghFindIssueByLabelsStrict', 'ghListIssuesByLabelsStrict', 'ghListIssuesByTitleTokenStrict', 'ghEnsureMilestone', 'ghAttachMilestone',
	'ghTokenScopes', 'ghListOrgIssueTypes', 'ghCreateOrgIssueType', 'ghCreateProject', 'ghFindProjectByTitle', 'ghAddProjectSingleSelectField',
	'ghListRepoIssueUrls', 'ghAddProjectItem', 'ghCurrentLogin', 'queryTasks', 'listMyOpenTasks', 'gitOriginOwnerRepo',
];
const ADAPTER_ROWS = ['readAssignees', 'readAssignee', 'setAssignee', 'addAssignee', 'openPullRequestOf', 'openSignoffRequest', 'readSignoffState', 'readSignoffRequest', 'gitIsTracked', 'gitHasChanges', 'gitLastCommitOf'];
const DAEMON_METHODS = ['workflow.approvePipeline', 'tracker.sync', 'tracker.setup', 'workflow.reviewArtifact', 'workflow.resolveFinding', 'team.refresh', 'team.claim', 'team.release'];

/** Every non-test source file under a directory. */
function sources(dir: string): string[] {
	const out: string[] = [];
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, e.name);
		if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') out.push(...sources(full)); }
		else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(full);
	}
	return out;
}

test('site-list.test.ts: the 31 gh wrapper names in the table equal the github.ts gh exports; every site has a table row and a registry test; the migration record lists the rows', () => {
	// the wrappers github.ts exports are exactly the 31 names
	const exported = Object.entries(github).filter(([n, v]) => typeof v === 'function' && /^(gh[A-Z]|queryTasks$|listMyOpenTasks$|gitOriginOwnerRepo$)/.test(n)).map(([n]) => n).sort();
	assert.equal(WRAPPERS.length, 31);
	assert.deepEqual(exported, [...WRAPPERS].sort());

	// the table has a row for each of them and for each adapter row, and no other row
	const rows = Object.keys(createRegistryTable(workflowToolDeps('/tmp'))).sort();
	assert.deepEqual(rows, [...WRAPPERS, ...ADAPTER_ROWS].sort());

	// every row is run by a test in this folder (the registry-backed tests run through a stand-in gh or git)
	const tests = readdirSync(HERE).filter(f => /\.test\.ts$/.test(f) && f !== 'site-list.test.ts').map(f => read(join(HERE, f))).join('\n');
	for (const row of [...WRAPPERS, ...ADAPTER_ROWS]) assert.ok(new RegExp(`\\b${row}\\b`).test(tests), `no test in src/workflow/tracker/__tests__ runs the row ${row}`);

	// the migration record lists every row, every moved daemon method and the named exemption
	for (const row of [...WRAPPERS, ...ADAPTER_ROWS]) assert.ok(RECORD.includes(`\`${row}\``), `the migration record has no row for ${row}`);
	const handlers = read(join(SRC, 'daemon', 'handler-runtime.ts'));
	for (const method of DAEMON_METHODS) {
		assert.ok(RECORD.includes(`\`${method}\``), `the migration record has no row for ${method}`);
		assert.ok(handlers.includes(`'${method}'`), `${method} is not registered in the handler runtime`);
	}
	assert.ok(RECORD.includes('maintenance.ts'));
});

test('site-list.test.ts: every site named in the migration record exists, and no production file outside github.ts calls a wrapper', () => {
	for (const m of RECORD.matchAll(/`(src\/[A-Za-z0-9_./-]+\.ts)`/g)) assert.ok(existsSync(join(ROOT, m[1]!)), `${m[1]} named in the record does not exist`);

	// the search for the wrappers' callers: a runtime import of a wrapper from github.ts outside the table and the old module itself
	const offenders: string[] = [];
	for (const file of sources(SRC)) {
		const rel = relative(SRC, file);
		if (rel === join('workflow', 'tracker', 'github.ts')) continue;
		for (const m of read(file).matchAll(/^import\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']*(?:tracker\/github|\.\/github))\.js';/gms)) {
			if (m[1] !== undefined) continue;
			if (!/(^|\/)tracker\/github$|^\.\/github$/.test(m[3]!) || (rel.startsWith(join('workflow', 'config') + '/') && m[3] === './github')) continue;
			const names = m[2]!.split(',').map(s => s.trim().replace(/^type\s+/, '')).filter(Boolean);
			const wrappers = names.filter(n => WRAPPERS.includes(n) || ['runGh', 'commitAndPushArtifacts', '_setTrackerExecForTests'].includes(n));
			if (wrappers.length > 0) offenders.push(`${rel}: ${wrappers.join(', ')}`);
		}
	}
	assert.deepEqual(offenders, [], 'a production file still calls an old wrapper');
});
