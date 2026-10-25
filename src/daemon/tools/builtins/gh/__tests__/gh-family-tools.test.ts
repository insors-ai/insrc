import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Value } from '@sinclair/typebox/value';

import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import type { ApprovalClass } from '../../../types.js';
import { ghApprovalClass, ghTimeoutMs } from '../helpers.js';
import { ghCacheTool, ghGistTool, ghGpgKeyTool, ghLabelTool, ghSecretTool, ghSshKeyTool, ghVariableTool } from '../resources.js';
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

const GIST_LIST = 'abc123\tmy notes\t2 files\tsecret\t2026-01-02T00:00:00Z\n';
const SSH_ROWS = 'laptop\tssh-ed25519 AAAA\t2026-01-01T00:00:00Z\t123\tauthentication\n';

const ROWS2: Row[] = [
	// gh_label
	[ghLabelTool, { op: 'list', search: 'bug', sort: 'name', order: 'desc', limit: 5 }, 'label list -S bug --sort name --order desc -L 5 --json color,createdAt,description,id,isDefault,name,updatedAt,url', '[]', 'none', 30],
	[ghLabelTool, { op: 'create', name: 'bug', color: 'ff0000', description: 'd' }, 'label create bug -c ff0000 -d d', '', 'common', 30],
	[ghLabelTool, { op: 'create', name: 'bug', force: true }, 'label create bug -f', '', 'destructive', 30],
	[ghLabelTool, { op: 'edit', name: 'bug', color: '00ff00' }, 'label edit bug -c 00ff00', '', 'common', 30],
	[ghLabelTool, { op: 'edit', name: 'bug', newName: 'defect' }, 'label edit bug -n defect', '', 'destructive', 30],
	[ghLabelTool, { op: 'clone', sourceRepository: 'o/src' }, 'label clone o/src', '', 'common', 30],
	[ghLabelTool, { op: 'clone', sourceRepository: 'o/src', force: true }, 'label clone o/src -f', '', 'destructive', 30],
	[ghLabelTool, { op: 'delete', name: 'bug' }, 'label delete bug --yes', '', 'destructive', 30],
	// gh_gist
	[ghGistTool, { op: 'list', secret: true, limit: 3 }, 'gist list -L 3 --secret', GIST_LIST, 'none', 30],
	[ghGistTool, { op: 'view', id: 'abc', filename: 'a.txt', raw: true }, 'gist view abc -f a.txt -r', 'text\n', 'none', 30],
	[ghGistTool, { op: 'view', id: 'abc', listFiles: true }, 'gist view abc --files', 'a.txt\n', 'none', 30],
	[ghGistTool, { op: 'create', files: ['a.txt', 'b.txt'], description: 'd', public: true }, 'gist create a.txt b.txt -d d -p', 'https://gist.github.com/abc\n', 'common', 60],
	[ghGistTool, { op: 'create', content: 'hello', filename: 'h.txt' }, 'gist create - -f h.txt', 'https://gist.github.com/abc\n', 'common', 60],
	[ghGistTool, { op: 'edit', id: 'abc', add: 'new.txt', remove: 'old.txt', desc: 'd' }, 'gist edit abc -a new.txt -r old.txt -d d', '', 'common', 60],
	[ghGistTool, { op: 'rename', id: 'abc', oldFilename: 'a.txt', newFilename: 'b.txt' }, 'gist rename abc a.txt b.txt', '', 'destructive', 60],
	[ghGistTool, { op: 'clone', gist: 'abc', directory: 'dir' }, 'gist clone abc dir', '', 'common', 60],
	[ghGistTool, { op: 'delete', id: 'abc' }, 'gist delete abc', '', 'destructive', 30],
	// gh_secret and gh_variable: the value is not in argv
	[ghSecretTool, { op: 'list', app: 'actions', org: 'acme' }, 'secret list -a actions -o acme --json name,numSelectedRepos,selectedReposURL,updatedAt,visibility', '[]', 'none', 30],
	[ghSecretTool, { op: 'set', name: 'TOKEN', secretValue: 's3cret', app: 'dependabot', repo: 'o/r' }, 'secret set TOKEN -a dependabot -R o/r', '', 'common', 30],
	[ghSecretTool, { op: 'set', name: 'TOKEN', secretValue: 's3cret', org: 'acme', repos: ['a', 'b'], visibility: 'selected' }, 'secret set TOKEN -o acme -r a,b -v selected', '', 'destructive', 30],
	[ghSecretTool, { op: 'set', envFile: '.env' }, 'secret set -f .env', '', 'common', 30],
	[ghSecretTool, { op: 'delete', name: 'TOKEN', user: true }, 'secret delete TOKEN -u', '', 'destructive', 30],
	[ghVariableTool, { op: 'list', env: 'prod' }, 'variable list -e prod --json name,numSelectedRepos,selectedReposURL,updatedAt,value,visibility', '[]', 'none', 30],
	[ghVariableTool, { op: 'set', name: 'REGION', value: 'eu-1', env: 'prod' }, 'variable set REGION -e prod', '', 'common', 30],
	[ghVariableTool, { op: 'set', name: 'REGION', value: 'eu-1', org: 'acme', visibility: 'all' }, 'variable set REGION -o acme -v all', '', 'destructive', 30],
	[ghVariableTool, { op: 'set', envFile: 'vars.env' }, 'variable set -f vars.env', '', 'common', 30],
	[ghVariableTool, { op: 'delete', name: 'REGION', org: 'acme' }, 'variable delete REGION -o acme', '', 'destructive', 30],
	// gh_cache
	[ghCacheTool, { op: 'list', key: 'npm-', ref: 'refs/heads/main', sort: 'size_in_bytes', order: 'asc', limit: 2 }, 'cache list -k npm- -r refs/heads/main -S size_in_bytes -O asc -L 2 --json createdAt,id,key,lastAccessedAt,ref,sizeInBytes,version', '[]', 'none', 30],
	[ghCacheTool, { op: 'delete', id: 12 }, 'cache delete 12', '', 'destructive', 30],
	[ghCacheTool, { op: 'delete', key: 'npm-abc' }, 'cache delete npm-abc', '', 'destructive', 30],
	[ghCacheTool, { op: 'delete', all: true }, 'cache delete --all', '', 'destructive', 30],
	// gh_ssh_key and gh_gpg_key
	[ghSshKeyTool, { op: 'list' }, 'ssh-key list', SSH_ROWS, 'none', 30],
	[ghSshKeyTool, { op: 'add', keyFile: 'id.pub', title: 'laptop', type: 'signing' }, 'ssh-key add id.pub -t laptop --type signing', '', 'common', 30],
	[ghSshKeyTool, { op: 'add', key: 'ssh-ed25519 AAAA laptop' }, 'ssh-key add', '', 'common', 30],
	[ghSshKeyTool, { op: 'delete', id: '7' }, 'ssh-key delete 7 --yes', '', 'destructive', 30],
	[ghGpgKeyTool, { op: 'list' }, 'gpg-key list', 'AB12\tuser@example.com\t2026-01-01\n', 'none', 30],
	[ghGpgKeyTool, { op: 'add', keyFile: 'k.asc', title: 't' }, 'gpg-key add k.asc -t t', '', 'common', 30],
	[ghGpgKeyTool, { op: 'add', key: '-----BEGIN PGP PUBLIC KEY BLOCK-----' }, 'gpg-key add', '', 'common', 30],
	[ghGpgKeyTool, { op: 'delete', keyId: 'AB12' }, 'gpg-key delete AB12 --yes', '', 'destructive', 30],
];

test('gh-family-tools.test.ts: label, gist, secret, variable, cache, ssh-key and gpg-key ops build the argv the table gives and return the literal op', async () => {
	const seen = new Set<string>();
	for (const [tool, input, argv, stdout, cls, limit] of ROWS2) {
		const label = `${tool.id}.${String(input['op'])} ${argv}`;
		seen.add(`${tool.id}.${String(input['op'])}`);
		assert.ok(validateAgainstSchema(tool.inputSchema as unknown as StructuredSchema, input).ok, `${label}: the input schema accepts it`);
		assert.equal(ghApprovalClass(tool.id, input), cls, `${label}: class`);
		assert.equal(ghTimeoutMs({ toolId: tool.id, op: String(input['op']) }), limit * 1000, `${label}: limit`);
		const gh = installFakeGh('stdin', stdout);
		try {
			const r = await tool.execute(input, deps);
			assert.equal(r.success, true, `${label}: ${r.output}`);
			assert.deepEqual(gh.calls(), [argv], label);
			const data = r.data as Record<string, unknown>;
			assert.equal(data['op'], input['op'], `${label}: the literal op`);
			assert.ok(Value.Check(tool.outputSchema, data), `${label}: ${JSON.stringify(data)} fits the output union`);
		} finally { gh.restore(); }
	}
	for (const tool of [ghLabelTool, ghGistTool, ghSecretTool, ghVariableTool, ghCacheTool, ghSshKeyTool, ghGpgKeyTool]) {
		for (const op of tool.ops) { assert.ok(seen.has(`${tool.id}.${op.name}`), `${tool.id}.${op.name} is covered`); }
	}
});

test('gh-family-tools.test.ts: secret and variable set deliver the value on standard input or through envFile and never in argv', async () => {
	const cases: Array<[typeof ghSecretTool, Record<string, unknown>, string]> = [
		[ghSecretTool, { op: 'set', name: 'TOKEN', secretValue: 'hunter2-s3cret' }, 'hunter2-s3cret'],
		[ghSecretTool, { op: 'set', name: 'TOKEN', secretValue: 'multi\nline "quoted" value', org: 'acme' }, 'multi\nline "quoted" value'],
		[ghVariableTool, { op: 'set', name: 'REGION', value: 'eu-west-1' }, 'eu-west-1'],
	];
	for (const [tool, input, value] of cases) {
		const gh = installFakeGh('stdin');
		try {
			const r = await tool.execute(input, deps);
			assert.equal(r.success, true, r.output);
			assert.equal(gh.stdin(), value, 'the value arrived on standard input');
			for (const call of gh.calls()) { assert.ok(!call.includes(value.split('\n')[0]!), `argv holds no value: ${call}`); }
			assert.ok(!r.output.includes(value), 'the result does not echo the value');
		} finally { gh.restore(); }
	}
	// through envFile: a path in argv, nothing on standard input
	for (const [tool, input] of [[ghSecretTool, { op: 'set', envFile: 'secrets.env' }], [ghVariableTool, { op: 'set', envFile: 'vars.env' }]] as const) {
		const gh = installFakeGh('stdin');
		try {
			const r = await tool.execute(input, deps);
			assert.equal(r.success, true, r.output);
			assert.equal(gh.stdin(), '', 'no value on standard input');
			assert.match(gh.calls()[0]!, /set -f (secrets|vars)\.env$/);
		} finally { gh.restore(); }
	}
	// a failure that repeats the value on stderr does not carry it in the error text
	for (const [tool, input, value] of [[ghSecretTool, { op: 'set', name: 'T', secretValue: 'hunter2-s3cret' }, 'hunter2-s3cret'], [ghVariableTool, { op: 'set', name: 'V', value: 'eu-west-1' }, 'eu-west-1']] as const) {
		const gh = installFakeGh('echoin');
		try {
			const r = await tool.execute(input, deps);
			assert.equal(r.success, false);
			assert.ok(!JSON.stringify(r).includes(value), `no part of the failed result holds the value: ${JSON.stringify(r)}`);
			assert.match(r.error ?? '', /\[redacted\]/);
		} finally { gh.restore(); }
	}
});
