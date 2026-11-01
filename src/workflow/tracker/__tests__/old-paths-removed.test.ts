/**
 * The old paths are gone (Story s9): runGit, runGitAsync, runGh, commitAndPushArtifacts, the github.ts wrappers, createGitRunner,
 * runGitBinary and _setTrackerExecForTests are not exported and their files are deleted.
 * Run: npx tsx --test-force-exit src/workflow/tracker/__tests__/old-paths-removed.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as github from '../github.js';
import * as registryTable from '../registry-table.js';
import * as gitReader from '../../../design/corpus/sources/git-reader.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const WRAPPERS = [
	'runGh', 'commitAndPushArtifacts', '_setTrackerExecForTests', 'ghAuthOk', 'ghCreateLabel', 'ghCreateIssue', 'ghCreateIssueTyped', 'ghLinkSubIssue',
	'ghGetIssueId', 'ghGetIssueBody', 'ghEditIssueBody', 'ghComment', 'ghListIssueComments', 'ghPostCommentReturningId', 'ghCloseIssue', 'ghGetIssueState',
	'ghFindIssueByLabels', 'ghFindIssueByLabelsStrict', 'ghListIssuesByLabelsStrict', 'ghListIssuesByTitleTokenStrict', 'ghEnsureMilestone',
	'ghAttachMilestone', 'ghTokenScopes', 'ghListOrgIssueTypes', 'ghCreateOrgIssueType', 'ghCreateProject', 'ghFindProjectByTitle',
	'ghAddProjectSingleSelectField', 'ghListRepoIssueUrls', 'ghAddProjectItem', 'ghCurrentLogin', 'queryTasks', 'listMyOpenTasks', 'gitOriginOwnerRepo',
];

test('old-paths-removed.test.ts: runGit, runGitAsync, runGh, commitAndPushArtifacts, the github.ts wrappers, createGitRunner, runGitBinary and _setTrackerExecForTests are not exported and the files are gone', () => {
	for (const name of WRAPPERS) assert.ok(!(name in github), `${name} is still exported from github.ts`);
	for (const name of ['createGitRunner', 'runGitBinary', 'gitEnvironment', 'GIT_READ_ARGS']) assert.ok(!(name in gitReader), `${name} is still exported from git-reader.ts`);
	assert.ok(!('_setRegistryTableFactoryForTests' in registryTable), 'the table factory seam is still exported');
	// what github.ts keeps: the classified failure and the parser
	assert.equal(typeof github.GhCommandError, 'function');
	assert.equal(typeof github.parseGithubRemoteUrl, 'function');
	for (const file of ['workflow/team/git.ts', 'workflow/team/git-async.ts', 'workflow/tracker/__tests__/_legacy-table.ts', 'workflow/tracker/__tests__/legacy-exec.test.ts', 'workflow/tracker/__tests__/old-paths-unchanged.test.ts']) {
		assert.ok(!existsSync(join(SRC, file)), `${file} still exists`);
	}
});
