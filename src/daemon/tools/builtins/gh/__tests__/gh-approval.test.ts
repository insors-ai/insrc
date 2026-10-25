import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { resolveApprovalClass } from '../../../approval-policy.js';
import { ARGUMENT_DISPLAY_MAX, REDACTED, buildApprovalRequest } from '../../../approval-policy.js';
import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import { _resetRegistryForTests, registerTool } from '../../../registry.js';
import type { ApprovalGate } from '../../../types.js';
import { ghCodespaceTool } from '../account.js';
import { ghApprovalClass, registerGhApproval } from '../helpers.js';
import { ghIssueManageTool } from '../manage.js';
import { ghGpgKeyTool, ghSecretTool, ghSshKeyTool } from '../resources.js';
import { installFakeGh } from './_fakegh.js';
import { ghReleaseEditTool } from '../release.js';
import { ghRepoCloneTool } from '../repo.js';

test('gh-approval.test.ts: every rename, close, merge, delete, transfer, logout, visibility, force, clobber and non-empty extraArgs is destructive and an unknown op is destructive', () => {
	registerGhApproval({
		'gh_probe.edit': 'common', 'gh_probe.list': 'none', 'gh_probe.close': 'destructive', 'gh_probe.delete': 'destructive',
		'gh_probe.transfer': 'destructive', 'gh_probe.logout': 'destructive', 'gh_probe.rename': 'destructive',
	});
	for (const op of ['close', 'delete', 'transfer', 'logout', 'rename']) {
		assert.equal(ghApprovalClass('gh_probe', { op }), 'destructive', op);
	}
	assert.equal(ghApprovalClass('gh_probe', { op: 'edit' }), 'common');
	assert.equal(ghApprovalClass('gh_probe', { op: 'edit', newName: 'x' }), 'destructive');
	assert.equal(ghApprovalClass('gh_probe', { op: 'edit', visibility: 'public' }), 'destructive');
	assert.equal(ghApprovalClass('gh_probe', { op: 'edit', force: true }), 'destructive');
	assert.equal(ghApprovalClass('gh_probe', { op: 'edit', clobber: true }), 'destructive');
	assert.equal(ghApprovalClass('gh_probe', { op: 'edit', force: false, newName: '', extraArgs: [] }), 'common');
	// a read keeps its class even when it carries a filter named like a destructive input
	assert.equal(ghApprovalClass('gh_probe', { op: 'list', visibility: 'public' }), 'none');
	// an op nobody classed asks
	assert.equal(ghApprovalClass('gh_probe', { op: 'zap' }), 'destructive');
	assert.equal(ghApprovalClass('gh_never_heard_of', {}), 'destructive');
	// the existing tools
	assert.equal(ghApprovalClass('gh_release_edit', { tag: 'v1', newTag: 'v2' }), 'destructive');
	assert.equal(ghApprovalClass('gh_release_edit', { tag: 'v1', title: 't' }), 'common');
	assert.equal(ghApprovalClass('gh_repo_clone', { repo: 'a/b', extraArgs: ['--upload-pack=x'] }), 'destructive');
	assert.equal(ghApprovalClass('gh_repo_clone', { repo: 'a/b' }), 'common');
	for (const id of ['gh_issue_close', 'gh_pr_close', 'gh_pr_merge', 'gh_release_delete', 'gh_repo_delete', 'gh:project:item-delete']) {
		assert.equal(ghApprovalClass(id, {}), 'destructive', id);
	}
	assert.equal(ghApprovalClass('gh_pr_list', {}), 'none');
	// an op no row names asks, even on a tool that has a class of its own
	assert.equal(ghApprovalClass('gh_pr_list', { op: 'unknown' }), 'destructive');
	assert.equal(ghApprovalClass('gh_pr_create', {}), 'common');
});

test('gh-approval.test.ts: gh_release_edit with newTag and gh_repo_clone with extraArgs are destructive and common without them', () => {
	// the classes the registered tools resolve, not only the table
	assert.equal(resolveApprovalClass(ghReleaseEditTool, { tag: 'v1', newTag: 'v2' }), 'destructive');
	assert.equal(resolveApprovalClass(ghReleaseEditTool, { tag: 'v1', title: 't' }), 'common');
	assert.equal(resolveApprovalClass(ghRepoCloneTool, { repo: 'a/b', extraArgs: ['--upload-pack=x'] }), 'destructive');
	assert.equal(resolveApprovalClass(ghRepoCloneTool, { repo: 'a/b', extraArgs: [] }), 'common');
	assert.equal(resolveApprovalClass(ghRepoCloneTool, { repo: 'a/b' }), 'common');
});

afterEach(() => { _setApprovalGateForTests(undefined); _resetRegistryForTests(); });

const request = (tool: Parameters<typeof buildApprovalRequest>[0]['tool'], input: Record<string, unknown>) =>
	buildApprovalRequest({ tool, cls: 'common', input, deps: { repoPath: '/tmp' } });

test('gh-approval.test.ts: secretValue masked, key text up to 2000 characters shown whole, a longer key shown as its first 2000 characters and the length, keyFile shows only the path, codespace create preview states the permissions are accepted, a declined destructive call does not run gh', async () => {
	// secretValue is masked in the request (and the preview never carries it)
	const secret = await request(ghSecretTool, { op: 'set', name: 'TOKEN', secretValue: 'hunter2-s3cret' });
	assert.equal((secret.arguments as Record<string, unknown>)['secretValue'], REDACTED);
	assert.ok(!JSON.stringify(secret).includes('hunter2-s3cret'), 'the value is nowhere in the request');
	assert.equal((secret.arguments as Record<string, unknown>)['name'], 'TOKEN');

	// public-key text is not masked: up to the display limit it is shown whole
	const whole = 'ssh-ed25519 ' + 'A'.repeat(ARGUMENT_DISPLAY_MAX - 'ssh-ed25519 '.length);
	assert.equal(whole.length, ARGUMENT_DISPLAY_MAX);
	for (const tool of [ghSshKeyTool, ghGpgKeyTool]) {
		const r = await request(tool, { op: 'add', key: whole });
		assert.equal((r.arguments as Record<string, unknown>)['key'], whole, `${tool.id}: key text of exactly 2000 characters is shown whole`);
		// a longer key shows exactly its first 2000 characters and the length
		const longKey = whole + 'B'.repeat(1234);
		const l = await request(tool, { op: 'add', key: longKey });
		assert.equal((l.arguments as Record<string, unknown>)['key'], `${longKey.slice(0, ARGUMENT_DISPLAY_MAX)}... [${longKey.length} characters in total]`);
	}
	// keyFile shows only the path
	const file = await request(ghSshKeyTool, { op: 'add', keyFile: '/home/u/.ssh/id_ed25519.pub', title: 'laptop' });
	assert.equal((file.arguments as Record<string, unknown>)['keyFile'], '/home/u/.ssh/id_ed25519.pub');
	assert.equal('key' in file.arguments, false);

	// the codespace create preview states the permissions are accepted; the reason stays the one approval-policy builds
	const create = await buildApprovalRequest({ tool: ghCodespaceTool, cls: 'common', input: { op: 'create', repo: 'o/r' }, deps: { repoPath: '/tmp' } });
	assert.match(create.preview.content, /permissions the codespace requests in its devcontainer are accepted without a further question/);
	assert.equal(create.reason, 'gh_codespace needs approval');

	// a declined destructive call does not run gh
	_resetRegistryForTests();
	registerTool(ghIssueManageTool);
	const asked: string[] = [];
	const gate: ApprovalGate = { async ask(r) { asked.push(`${r.toolId}:${r.approvalClass}`); return 'declined'; } };
	_setApprovalGateForTests(() => gate);
	const gh = installFakeGh('ok', '');
	try {
		const r = await executeTool('gh_issue_manage', { op: 'delete', number: 3 }, { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0, approvalMode: 'auto' });
		assert.equal(r.success, false);
		assert.equal(r.failure?.kind, 'denied');
		assert.deepEqual(asked, ['gh_issue_manage:destructive'], 'a destructive call asks even in auto mode');
		assert.deepEqual(gh.calls(), [], 'gh was not run');
	} finally { gh.restore(); }
});
