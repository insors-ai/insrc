import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Value } from '@sinclair/typebox/value';

import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import type { ApprovalClass } from '../../../types.js';
import { ghApprovalClass, ghTimeoutMs } from '../helpers.js';
import { ghAuthTool, ghCodespaceTool, ghConfigTool, ghExtensionTool, ghOrgTool, ghRulesetTool, ghSearchTool, ghStatusTool } from '../account.js';
import { providers } from './_providers.js';
import { ghCacheTool, ghGistTool, ghGpgKeyTool, ghLabelTool, ghSecretTool, ghSshKeyTool, ghVariableTool } from '../resources.js';
import { ghIssueManageTool, ghPrManageTool, ghProjectManageTool, ghReleaseAssetTool, ghRepoManageTool, ghRunManageTool, ghWorkflowManageTool } from '../manage.js';
import type { GhFamilyTool } from '../op-table.js';
import { installFakeGh } from './_fakegh.js';
import { PROJECT_JSON, ROWS, ROWS2, ROWS3 } from './_family-rows.js';
import type { Row, Row3 } from './_family-rows.js';

const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };
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

test('gh-family-tools.test.ts: search, ruleset, org, auth, status, codespace, config and extension ops build the argv the table gives and return the literal op', async () => {
	const seen = new Set<string>();
	const mismatches: string[] = [];
	for (const [tool, input, argvPrefix, stdout, cls, limit, answer] of ROWS3) {
		const label = `${tool.id}.${String(input['op'])} ${argvPrefix}`;
		seen.add(`${tool.id}.${String(input['op'])}`);
		assert.ok(validateAgainstSchema(tool.inputSchema as unknown as StructuredSchema, input).ok, `${label}: the input schema accepts it`);
		assert.equal(ghApprovalClass(tool.id, input), cls, `${label}: class`);
		assert.equal(ghTimeoutMs({ toolId: tool.id, op: String(input['op']) }), limit * 1000, `${label}: limit`);
		const gh = installFakeGh('ok', stdout);
		try {
			const p = answer !== undefined ? providers(answer) : undefined;
			const r = await tool.execute(input, { ...deps, ...(p ? { conversion: p.conversion } : {}) });
			assert.equal(r.success, true, `${label}: ${r.output}`);
			const call = gh.calls()[0]!;
			// a long --json field list is checked in the table above; here the front of the argv is
			if (!(call === argvPrefix || call.startsWith(argvPrefix.replace(/ -R$/, '')))) { mismatches.push(`${label}\n   got ${call}`); }
			const data = r.data as Record<string, unknown>;
			assert.equal(data['op'], input['op'], `${label}: the literal op`);
			assert.ok(Value.Check(tool.outputSchema, data), `${label}: ${JSON.stringify(data)} fits the output union`);
		} finally { gh.restore(); }
	}
	assert.deepEqual(mismatches, []);
	for (const tool of [ghSearchTool, ghRulesetTool, ghOrgTool, ghAuthTool, ghStatusTool, ghCodespaceTool, ghConfigTool, ghExtensionTool]) {
		for (const op of tool.ops) {
			if (tool === ghStatusTool || (tool === ghRulesetTool && op.name === 'list')) { continue; }
			assert.ok(seen.has(`${tool.id}.${op.name}`), `${tool.id}.${op.name} is covered`);
		}
	}
});

test('gh-family-tools.test.ts: the data of config, org, codespace logs and the text conversions', async () => {
	const out = async (tool: GhFamilyTool, input: Record<string, unknown>, stdout: string, answer?: unknown) => {
		const gh = installFakeGh('ok', stdout);
		try { const p = answer !== undefined ? providers(answer) : undefined; return (await tool.execute(input, { ...deps, ...(p ? { conversion: p.conversion } : {}) })).data; } finally { gh.restore(); }
	};
	assert.deepEqual(await out(ghConfigTool, { op: 'get', key: 'editor' }, 'vim\n'), { op: 'get', key: 'editor', value: 'vim' });
	assert.deepEqual(await out(ghConfigTool, { op: 'list' }, 'git_protocol=ssh\neditor=\nbrowser=a=b\n'), { op: 'list', entries: [{ key: 'git_protocol', value: 'ssh' }, { key: 'editor', value: '' }, { key: 'browser', value: 'a=b' }] });
	assert.deepEqual(await out(ghOrgTool, { op: 'list' }, 'acme\n\nwidgets\n'), { op: 'list', count: 2, items: [{ name: 'acme' }, { name: 'widgets' }] });
	assert.deepEqual(await out(ghCodespaceTool, { op: 'logs', codespace: 'c' }, 'a log\n'), { op: 'logs', text: 'a log\n', truncated: false });
	// a log longer than the 128 KiB display cap is a success with truncated true
	const big = await out(ghCodespaceTool, { op: 'logs', codespace: 'c' }, 'x'.repeat(200 * 1024)) as { text: string; truncated: boolean };
	assert.equal(big.truncated, true);
	assert.equal(big.text.length, 128 * 1024);
	// ruleset list with no rulesets is an empty list and needs no conversion; status answers with gh's text
	assert.deepEqual(await out(ghRulesetTool, { op: 'list' }, ''), { op: 'list', count: 0, items: [] });
	assert.deepEqual(await out(ghStatusTool, { op: 'status' }, 'Assigned Issues\no/r#1\n', { repositories: ['o/r'] }), { op: 'status', text: 'Assigned Issues\no/r#1\n' });
	assert.deepEqual(await out(ghStatusTool, { op: 'status' }, 'Assigned Issues\n'), { op: 'status', text: 'Assigned Issues\n' });
});

test('gh-family-tools.test.ts: codespace create always passes --default-permissions and has no defaultPermissions field', async () => {
	const create = ghCodespaceTool.ops.find(o => o.name === 'create')!;
	assert.equal('defaultPermissions' in (create.fields ?? {}), false);
	const props = (ghCodespaceTool.inputSchema as unknown as { properties: Record<string, unknown> }).properties;
	assert.equal('defaultPermissions' in props, false);
	assert.equal(validateAgainstSchema(ghCodespaceTool.inputSchema as unknown as StructuredSchema, { op: 'create', repo: 'o/r', defaultPermissions: false }).ok, false, 'the schema has no such field');
	const gh = installFakeGh('ok', 'cs-new\n');
	try {
		for (const input of [{ op: 'create', repo: 'o/r' }, { op: 'create', repo: 'o/r', branch: 'b', status: true }]) {
			const r = await ghCodespaceTool.execute(input, deps);
			assert.equal(r.success, true, r.output);
			assert.ok(gh.calls().at(-1)!.startsWith('codespace create --default-permissions '), gh.calls().at(-1));
		}
		// a field the op does not accept, including that one, is refused before gh runs
		const before = gh.calls().length;
		const refused = await ghCodespaceTool.execute({ op: 'create', repo: 'o/r', defaultPermissions: false }, deps);
		assert.equal(refused.success, false);
		assert.match(refused.error ?? '', /does not accept the field defaultPermissions/);
		assert.equal(gh.calls().length, before);
		// durations are checked
		assert.match((await ghCodespaceTool.execute({ op: 'create', repo: 'o/r', idleTimeout: 'soon' }, deps)).error ?? '', /durations such as 10m/);
	} finally { gh.restore(); }
	// the preview content states that the permissions the codespace requests are accepted; the request reason is not this tool's to set
	const gate = await ghCodespaceTool.buildApprovalGate!({ op: 'create', repo: 'o/r' });
	assert.match(gate.content, /permissions the codespace requests in its devcontainer are accepted without a further question/);
	assert.equal(gate.title, 'gh_codespace create');
	const other = await ghCodespaceTool.buildApprovalGate!({ op: 'edit', codespace: 'cs1', displayName: 'n' });
	assert.doesNotMatch(other.content, /accepted without a further question/);
});
