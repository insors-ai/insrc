/**
 * The old paths stay (Story s10): runGit, runGitAsync, runGh, commitAndPushArtifacts, the wrappers, createGitRunner and _setTrackerExecForTests
 * are still exported, and the forbidden-spawn scan is still in report mode. Story s9 deletes them and switches the scan to failing mode.
 * Run: npx tsx --test-force-exit src/workflow/tracker/__tests__/old-paths-unchanged.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as github from '../github.js';
import { runGit } from '../../team/git.js';
import { runGitAsync } from '../../team/git-async.js';
import { createGitRunner } from '../../../design/corpus/sources/git-reader.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

test('old-paths-unchanged.test.ts: the old paths are still exported unchanged and the scan stays in report mode', () => {
	for (const [name, fn] of Object.entries({ runGit, runGitAsync, createGitRunner })) assert.equal(typeof fn, 'function', `${name} is gone`);
	for (const name of ['runGh', 'commitAndPushArtifacts', '_setTrackerExecForTests', 'parseGithubRemoteUrl', 'GhCommandError',
		'ghAuthOk', 'ghCreateLabel', 'ghCreateIssue', 'ghCreateIssueTyped', 'ghLinkSubIssue', 'ghGetIssueId', 'ghGetIssueBody', 'ghEditIssueBody', 'ghComment',
		'ghListIssueComments', 'ghPostCommentReturningId', 'ghCloseIssue', 'ghGetIssueState', 'ghFindIssueByLabels', 'ghFindIssueByLabelsStrict',
		'ghListIssuesByLabelsStrict', 'ghListIssuesByTitleTokenStrict', 'ghEnsureMilestone', 'ghAttachMilestone', 'ghTokenScopes', 'ghListOrgIssueTypes',
		'ghCreateOrgIssueType', 'ghCreateProject', 'ghFindProjectByTitle', 'ghAddProjectSingleSelectField', 'ghListRepoIssueUrls', 'ghAddProjectItem',
		'ghCurrentLogin', 'queryTasks', 'listMyOpenTasks', 'gitOriginOwnerRepo']) {
		assert.ok(name in github, `${name} is no longer exported from github.ts`);
	}

	// the scan: the build runs it without --fail, and on this tree it prints its sites and exits 0
	const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: { build: string } };
	assert.match(pkg.scripts.build, /node scripts\/forbidden-spawn-scan\.mjs(?! --fail)(?= &&)/);
	assert.ok(!/forbidden-spawn-scan\.mjs --fail/.test(pkg.scripts.build));
	const out = execFileSync('node', [join(ROOT, 'scripts', 'forbidden-spawn-scan.mjs')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	assert.equal(typeof out, 'string');
});
