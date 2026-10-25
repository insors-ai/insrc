import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Value } from '@sinclair/typebox/value';

import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import type { ApprovalClass } from '../../../types.js';
import { ghApprovalClass, ghTimeoutMs } from '../helpers.js';
import { ghIssueManageTool, ghPrManageTool, ghProjectManageTool, ghReleaseAssetTool, ghRepoManageTool, ghRunManageTool, ghWorkflowManageTool } from '../manage.js';
import type { GhFamilyTool } from '../op-table.js';
import { installFakeGh } from './_fakegh.js';

const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };
const PROJECT_JSON = '{"url":"https://github.com/orgs/o/projects/2","number":2}';
const ISSUE_ITEM = 'assignees,author,labels,number,state,title,updatedAt,url';
const PR_ITEM = 'number,title,state,headRefName,reviewDecision,url';

/** tool, input, the gh argv the table gives, what gh prints, the class of the call and its limit in seconds */
type Row = [GhFamilyTool, Record<string, unknown>, string, string, ApprovalClass, number];

const ROWS: Row[] = [
	// gh_issue_manage
	[ghIssueManageTool, { op: 'status' }, `issue status --json ${ISSUE_ITEM}`, '{"createdBy":[],"assigned":[],"mentioned":[]}', 'none', 30],
	[ghIssueManageTool, { op: 'delete', number: 3, repo: 'o/r' }, 'issue delete 3 --yes -R o/r', '', 'destructive', 30],
	[ghIssueManageTool, { op: 'develop', number: 3, name: 'b', branchRepo: 'o/x', base: 'main', checkout: true }, 'issue develop 3 -n b --branch-repo o/x -b main -c', 'b\n', 'common', 60],
	[ghIssueManageTool, { op: 'develop-list', number: 3 }, 'issue develop 3 --list', 'br\thttps://github.com/o/r/tree/br\n', 'none', 30],
	[ghIssueManageTool, { op: 'lock', number: 3, reason: 'spam' }, 'issue lock 3 -r spam', '', 'common', 30],
	[ghIssueManageTool, { op: 'unlock', number: 3 }, 'issue unlock 3', '', 'common', 30],
	[ghIssueManageTool, { op: 'pin', number: 3 }, 'issue pin 3', '', 'common', 30],
	[ghIssueManageTool, { op: 'unpin', number: 3 }, 'issue unpin 3', '', 'common', 30],
	[ghIssueManageTool, { op: 'transfer', number: 3, destinationRepo: 'o/x' }, 'issue transfer 3 o/x', 'https://github.com/o/x/issues/1\n', 'destructive', 60],
	// gh_pr_manage
	[ghPrManageTool, { op: 'status', conflictStatus: true }, `pr status -c --json ${PR_ITEM}`, '{"currentBranch":null,"createdBy":[],"needsReview":[]}', 'none', 30],
	[ghPrManageTool, { op: 'checkout', target: '12', branch: 'b', detach: true, recurseSubmodules: true }, 'pr checkout 12 -b b --detach --recurse-submodules', '', 'common', 60],
	[ghPrManageTool, { op: 'checkout', target: '12', force: true }, 'pr checkout 12 -f', '', 'destructive', 60],
	[ghPrManageTool, { op: 'lock', number: 3, reason: 'resolved' }, 'pr lock 3 -r resolved', '', 'common', 30],
	[ghPrManageTool, { op: 'unlock', number: 3 }, 'pr unlock 3', '', 'common', 30],
	[ghPrManageTool, { op: 'reopen', target: '12', comment: 'again' }, 'pr reopen 12 -c again', '', 'common', 30],
	// gh_release_asset
	[ghReleaseAssetTool, { op: 'download', tag: 'v1', pattern: ['*.zip', '*.tgz'], dir: 'd' }, 'release download v1 -p *.zip -p *.tgz -D d', '', 'common', 300],
	[ghReleaseAssetTool, { op: 'download', archive: 'zip', clobber: true, repo: 'o/r' }, 'release download -A zip --clobber -R o/r', '', 'destructive', 300],
	[ghReleaseAssetTool, { op: 'download', tag: 'v1', output: 'out.bin', skipExisting: true }, 'release download v1 -O out.bin --skip-existing', '', 'common', 300],
	[ghReleaseAssetTool, { op: 'upload', tag: 'v1', files: ['a.zip', 'b.zip'] }, 'release upload v1 a.zip b.zip', '', 'common', 300],
	[ghReleaseAssetTool, { op: 'upload', tag: 'v1', files: ['a.zip'], clobber: true }, 'release upload v1 a.zip --clobber', '', 'destructive', 300],
	[ghReleaseAssetTool, { op: 'delete-asset', tag: 'v1', asset: 'a.zip' }, 'release delete-asset v1 a.zip --yes', '', 'destructive', 30],
	// gh_repo_manage
	[ghRepoManageTool, { op: 'archive', repository: 'o/r' }, 'repo archive o/r --yes', '', 'common', 30],
	[ghRepoManageTool, { op: 'unarchive', repository: 'o/r' }, 'repo unarchive o/r --yes', '', 'common', 30],
	[ghRepoManageTool, { op: 'edit', repository: 'o/r', description: 'd', enableIssues: false, enableWiki: true, addTopic: ['a', 'b'], removeTopic: ['c'] }, 'repo edit o/r -d d --enable-issues=false --enable-wiki --add-topic a --add-topic b --remove-topic c', '', 'common', 30],
	[ghRepoManageTool, { op: 'edit', repository: 'o/r', visibility: 'private' }, 'repo edit o/r --visibility private', '', 'destructive', 30],
	[ghRepoManageTool, { op: 'rename', newName: 'n', repo: 'o/r' }, 'repo rename n --yes -R o/r', '', 'destructive', 60],
	[ghRepoManageTool, { op: 'set-default', repository: 'o/r' }, 'repo set-default o/r', '', 'common', 30],
	[ghRepoManageTool, { op: 'set-default', view: true }, 'repo set-default -v', 'o/r\n', 'common', 30],
	[ghRepoManageTool, { op: 'set-default', unset: true }, 'repo set-default -u', '', 'common', 30],
	[ghRepoManageTool, { op: 'sync', destination: 'o/r', source: 'o/u', branch: 'main' }, 'repo sync o/r -s o/u -b main', '', 'common', 120],
	[ghRepoManageTool, { op: 'sync', destination: 'o/r', force: true }, 'repo sync o/r --force', '', 'destructive', 120],
	[ghRepoManageTool, { op: 'deploy-key-list', repo: 'o/r' }, 'repo deploy-key list --json createdAt,id,key,readOnly,title -R o/r', '[{"createdAt":"c","id":1,"key":"k","readOnly":true,"title":"t"}]', 'none', 30],
	[ghRepoManageTool, { op: 'deploy-key-add', keyFile: 'k.pub', title: 't', allowWrite: true }, 'repo deploy-key add k.pub -t t -w', '', 'common', 30],
	[ghRepoManageTool, { op: 'deploy-key-delete', keyId: '5' }, 'repo deploy-key delete 5', '', 'destructive', 30],
	// gh_run_manage and gh_workflow_manage
	[ghRunManageTool, { op: 'delete', runId: 9 }, 'run delete 9', '', 'destructive', 30],
	[ghRunManageTool, { op: 'download', runId: 9, name: ['a'], pattern: ['p'], dir: 'd' }, 'run download 9 -n a -p p -D d', '', 'common', 300],
	[ghWorkflowManageTool, { op: 'view', workflow: 'ci.yml', ref: 'main', yaml: true }, 'workflow view ci.yml -r main -y', 'name: ci\n', 'none', 30],
	[ghWorkflowManageTool, { op: 'enable', workflow: 'ci.yml' }, 'workflow enable ci.yml', '', 'common', 30],
	[ghWorkflowManageTool, { op: 'disable', workflow: 'ci.yml' }, 'workflow disable ci.yml', '', 'common', 30],
	// gh_project_manage: --format json on the ops that accept it, none on link and unlink
	[ghProjectManageTool, { op: 'copy', number: 2, title: 'T', sourceOwner: 'a', targetOwner: 'b', drafts: true }, 'project copy 2 --title T --source-owner a --target-owner b --drafts --format json', PROJECT_JSON, 'common', 60],
	[ghProjectManageTool, { op: 'create', title: 'T', owner: 'o' }, 'project create --title T --owner o --format json', PROJECT_JSON, 'common', 60],
	[ghProjectManageTool, { op: 'edit', number: 2, title: 'T' }, 'project edit 2 --title T --format json', PROJECT_JSON, 'common', 30],
	[ghProjectManageTool, { op: 'edit', number: 2, visibility: 'PUBLIC' }, 'project edit 2 --visibility PUBLIC --format json', PROJECT_JSON, 'destructive', 30],
	[ghProjectManageTool, { op: 'close', number: 2, undo: true }, 'project close 2 --undo --format json', PROJECT_JSON, 'destructive', 30],
	[ghProjectManageTool, { op: 'delete', number: 2 }, 'project delete 2 --format json', PROJECT_JSON, 'destructive', 30],
	[ghProjectManageTool, { op: 'link', number: 2, owner: 'o', targetRepo: 'o/r' }, 'project link 2 --owner o -R o/r', '', 'common', 30],
	[ghProjectManageTool, { op: 'unlink', number: 2, team: 't' }, 'project unlink 2 -T t', '', 'common', 30],
	[ghProjectManageTool, { op: 'mark-template', number: 2, undo: true }, 'project mark-template 2 --undo --format json', PROJECT_JSON, 'common', 30],
	[ghProjectManageTool, { op: 'item-create', number: 2, title: 'T', body: 'B' }, 'project item-create 2 --title T --body B --format json', '{"id":"i"}', 'common', 30],
	[ghProjectManageTool, { op: 'field-create', number: 2, name: 'S', dataType: 'SINGLE_SELECT', singleSelectOptions: ['a', 'b'] }, 'project field-create 2 --name S --data-type SINGLE_SELECT --single-select-options a --single-select-options b --format json', '{"id":"f"}', 'common', 30],
	[ghProjectManageTool, { op: 'field-delete', id: 'F' }, 'project field-delete --id F --format json', '{"id":"F"}', 'destructive', 30],
];

test('gh-family-tools.test.ts: issue, pr, release asset, repo, run, workflow and project ops build the argv the table gives and return the literal op', async () => {
	const seen = new Set<string>();
	for (const [tool, input, argv, stdout, cls, limit] of ROWS) {
		const label = `${tool.id}.${String(input['op'])} ${argv}`;
		seen.add(`${tool.id}.${String(input['op'])}`);
		// the schema takes the input, and the class and limit are the table's
		assert.ok(validateAgainstSchema(tool.inputSchema as unknown as StructuredSchema, input).ok, `${label}: the input schema accepts it`);
		assert.equal(ghApprovalClass(tool.id, input), cls, `${label}: class`);
		assert.equal(ghTimeoutMs({ toolId: tool.id, op: String(input['op']) }), limit * 1000, `${label}: limit`);

		const gh = installFakeGh('ok', stdout);
		try {
			const r = await tool.execute(input, deps);
			assert.equal(r.success, true, `${label}: ${r.output}`);
			assert.deepEqual(gh.calls(), [argv], label);
			const data = r.data as Record<string, unknown>;
			assert.equal(data['op'], input['op'], `${label}: the literal op`);
			assert.ok(Value.Check(tool.outputSchema, data), `${label}: ${JSON.stringify(data)} fits the output union`);
			if (tool === ghProjectManageTool) {
				// every project op returns {op, ok, target, message}
				assert.deepEqual(Object.keys(data).sort(), ['message', 'ok', 'op', 'target'], label);
				assert.equal(data['ok'], true);
				assert.equal(typeof data['target'], 'string');
				assert.equal(argv.includes('--format'), input['op'] !== 'link' && input['op'] !== 'unlink', `${label}: --format only where gh accepts it`);
			}
		} finally { gh.restore(); }
	}
	// every op of the seven tools is in the table
	for (const tool of [ghIssueManageTool, ghPrManageTool, ghReleaseAssetTool, ghRepoManageTool, ghRunManageTool, ghWorkflowManageTool, ghProjectManageTool]) {
		for (const op of tool.ops) { assert.ok(seen.has(`${tool.id}.${op.name}`), `${tool.id}.${op.name} is covered`); }
	}
	assert.equal(seen.size, 42, 'the seven tools have 42 ops');
});

test('gh-family-tools.test.ts: a mutation reports the URL gh printed as its target, else the input identifier, and a read reports its rows and items', async () => {
	const run = async (tool: GhFamilyTool, input: Record<string, unknown>, stdout: string) => {
		const gh = installFakeGh('ok', stdout);
		try { return (await tool.execute(input, deps)).data as Record<string, unknown>; } finally { gh.restore(); }
	};
	assert.deepEqual(await run(ghIssueManageTool, { op: 'transfer', number: 3, destinationRepo: 'o/x' }, 'https://github.com/o/x/issues/1\n'),
		{ op: 'transfer', ok: true, target: 'https://github.com/o/x/issues/1', message: 'https://github.com/o/x/issues/1' });
	assert.deepEqual(await run(ghIssueManageTool, { op: 'pin', number: 3 }, ''), { op: 'pin', ok: true, target: '#3', message: '' });
	assert.deepEqual(await run(ghProjectManageTool, { op: 'create', title: 'T' }, PROJECT_JSON), { op: 'create', ok: true, target: 'https://github.com/orgs/o/projects/2', message: PROJECT_JSON });
	assert.deepEqual(await run(ghIssueManageTool, { op: 'develop-list', number: 3 }, 'a\tu1\nb\tu2\n'), { op: 'develop-list', count: 2, rows: [['a', 'u1'], ['b', 'u2']] });
	assert.deepEqual(await run(ghRepoManageTool, { op: 'deploy-key-list' }, '[]'), { op: 'deploy-key-list', count: 0, items: [] });
	assert.deepEqual(await run(ghWorkflowManageTool, { op: 'view', workflow: 'w' }, 'text\n'), { op: 'view', text: 'text\n' });
});
