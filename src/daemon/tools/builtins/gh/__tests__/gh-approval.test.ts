import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ghApprovalClass, registerGhApproval } from '../helpers.js';

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
