/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Read-only tool surface tests.
 *
 * Three layers of safety here, each catching a different class of bug:
 *
 *   1. Snapshot test on READ_ONLY_TOOL_IDS -- pins the exact list of
 *      tool ids exposed to the shaper LLM. Adding or removing an
 *      entry breaks this test, forcing human review. New mutating
 *      tools added to the registry are NOT auto-exposed (because
 *      this list is the allowlist; not-in-list means not visible).
 *
 *   2. Known-mutating exclusions -- explicit assertions that a
 *      handful of high-risk tool ids (file_write, shell_exec,
 *      git_push, file_delete, ...) are absent. Catches the case
 *      where someone accidentally pastes a mutating id into the
 *      allowlist.
 *
 *   3. Registry-cross-check (via getReadOnlyTools) -- every allowlist
 *      entry must have a registered tool. Catches registry drift
 *      where a builtin gets renamed without updating the allowlist.
 *      Runs after registerBuiltinTools() seeds the registry.
 *
 * Pure unit tests -- the registry is populated locally for the
 * registry-cross-check test; no daemon boot, no LLM, no I/O.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/context/__tests__/tool-surface.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import {
	_resetRegistryForTests,
	listTools,
} from '../../../daemon/tools/registry.js';
import {
	getReadOnlyTools,
	isReadOnlyShaperTool,
	READ_ONLY_TOOL_IDS,
	ReadOnlyToolRegistryMismatch,
} from '../tool-surface.js';

// ---------------------------------------------------------------------------
// Snapshot: READ_ONLY_TOOL_IDS
// ---------------------------------------------------------------------------

/**
 * If you intentionally change the shaper's exposed tool surface,
 * update this snapshot to match -- the change should be reviewed
 * (every entry is something the shaper LLM can call). If you got
 * here unintentionally, you added or removed a tool somewhere it
 * doesn't belong; revisit the allowlist in tool-surface.ts.
 */
const EXPECTED_READ_ONLY_TOOL_IDS: readonly string[] = [
	'graph_entity',
	'graph_query',
	'graph_search',

	'db_list_connections',

	'db_sql_aggregate',
	'db_sql_anti_join',
	'db_sql_correlation_matrix',
	'db_sql_describe',
	'db_sql_dickey_fuller',
	'db_sql_distinct',
	'db_sql_explain',
	'db_sql_functional_dependency',
	'db_sql_histogram',
	'db_sql_list_indexes',
	'db_sql_list_tables',
	'db_sql_outliers',
	'db_sql_sample',
	'db_sql_temporal_gap_stats',
	'db_sql_temporal_trend',

	'db_file_aggregate',
	'db_file_correlation_matrix',
	'db_file_describe',
	'db_file_distinct',
	'db_file_histogram',
	'db_file_list_files',
	'db_file_outliers',
	'db_file_sample',
	'db_file_sample_shape',
	'db_file_temporal_trend',

	'db_kv_describe_namespace',
	'db_kv_get',
	'db_kv_list_namespaces',
	'db_kv_sample_shape',
	'db_kv_scan',

	'file_read',
	'file_stat',

	'search_glob',
	'search_grep',
	'search_list-dir',
	'search_recent',

	'code_class_fields',
	'code_class_locate',
	'code_class_references',
	'code_migration_walk',
	'code_orm_scan',

	'data_lineage',
	'data_schema-drift',

	'git_blame',
	'git_diff',
	'git_log',
	'git_show',
	'git_status',

	// docs -- Phase 7 docs-module tool surface
	'docs_family_list',
	'docs_project_context',
	'docs_retrieve',
	'docs_summary_get',
];

test('READ_ONLY_TOOL_IDS matches the expected snapshot', () => {
	assert.deepEqual([...READ_ONLY_TOOL_IDS], EXPECTED_READ_ONLY_TOOL_IDS);
});

test('READ_ONLY_TOOL_IDS has no duplicate entries', () => {
	const set = new Set(READ_ONLY_TOOL_IDS);
	assert.equal(set.size, READ_ONLY_TOOL_IDS.length);
});

// ---------------------------------------------------------------------------
// Known-mutating exclusions
// ---------------------------------------------------------------------------

const MUST_NOT_BE_EXPOSED: readonly string[] = [
	// fs mutation
	'file_write',
	'file_edit',
	'file_delete',
	'file_copy',
	'file_move',
	'file_mkdir',
	'file_multi-edit',
	// shell mutation surface
	'shell_exec',
	'shell_exec-detached',
	'shell_exec-pipeline',
	'shell_cwd',
	// ssh
	'ssh_exec',
	'ssh:exec-detached',
	'ssh:port-forward',
	'scp:upload',
	'scp:download',
	// git mutation
	'git_amend',
	'git_commit',
	'git_push',
	'git_pull',
	'git_fetch',
	'git_merge',
	'git_rebase',
	'git_reset',
	'git_revert',
	'git_checkout',
	'git_stage',
	'git_stash',
	'git_worktree',
	'git:cherry-pick',
	'git_branch',
	'git_tag',
	'git_remote',
	// gh -- entire family excluded from shaper scope
	'gh_pr_create',
	'gh_pr_merge',
	'gh_pr_close',
	'gh_pr_view',
	'gh_issue_create',
	'gh_issue_close',
	'gh_run_cancel',
	// cloud -- entire family
	'cloud_aws_ec2_terminate',
	'cloud_aws_s3_rm',
	'cloud_aws_lambda_invoke',
	'cloud_gcp_storage_rm',
	'cloud_az_vm_delete',
	// k8s
	'k8s_apply',
	'k8s_delete',
	'k8s_exec',
	'k8s_logs',
	// pkg
	'pkg_install',
	'pkg_add',
	'pkg_remove',
	// notify
	'notify_slack',
	'notify_email',
	// test
	'test_run',
	'test_coverage',
	'test_watch',
	// http / web
	'http_request',
	'http_download',
	'http_upload',
	'web_fetch',
	'web_search',
];

for (const id of MUST_NOT_BE_EXPOSED) {
	test(`${id} must NOT be in the shaper's read-only surface`, () => {
		assert.equal(
			isReadOnlyShaperTool(id),
			false,
			`${id} appears in READ_ONLY_TOOL_IDS -- this is a mutating / out-of-scope tool`,
		);
	});
}

// ---------------------------------------------------------------------------
// isReadOnlyShaperTool predicate
// ---------------------------------------------------------------------------

test('isReadOnlyShaperTool returns true for every allowlist entry', () => {
	for (const id of READ_ONLY_TOOL_IDS) {
		assert.equal(isReadOnlyShaperTool(id), true, `${id} should be a read-only shaper tool`);
	}
});

test('isReadOnlyShaperTool returns false for unknown tool ids', () => {
	assert.equal(isReadOnlyShaperTool('this_tool_does_not_exist'), false);
	assert.equal(isReadOnlyShaperTool(''), false);
});

// ---------------------------------------------------------------------------
// Registry cross-check -- every allowlist entry maps to a registered tool
// ---------------------------------------------------------------------------

test('getReadOnlyTools throws ReadOnlyToolRegistryMismatch when registry is empty', () => {
	_resetRegistryForTests();
	assert.throws(() => getReadOnlyTools(), ReadOnlyToolRegistryMismatch);
});

test('getReadOnlyTools returns N ToolDefinitions after registerBuiltinTools()', () => {
	_resetRegistryForTests();
	registerBuiltinTools();
	const tools = getReadOnlyTools();
	assert.equal(tools.length, READ_ONLY_TOOL_IDS.length);
});

test('getReadOnlyTools result preserves allowlist order', () => {
	_resetRegistryForTests();
	registerBuiltinTools();
	const tools = getReadOnlyTools();
	for (let i = 0; i < tools.length; i++) {
		assert.equal(tools[i]!.name, READ_ONLY_TOOL_IDS[i]);
	}
});

test('each returned ToolDefinition has a non-empty description + inputSchema', () => {
	_resetRegistryForTests();
	registerBuiltinTools();
	const tools = getReadOnlyTools();
	for (const t of tools) {
		assert.ok(typeof t.description === 'string' && t.description.length > 0,
			`${t.name} has empty description`);
		assert.ok(typeof t.inputSchema === 'object' && t.inputSchema !== null,
			`${t.name} has non-object inputSchema`);
	}
});

test('every registered mutation tool from the must-not-be-exposed list is absent from the result', () => {
	_resetRegistryForTests();
	registerBuiltinTools();
	const tools = getReadOnlyTools();
	const exposedNames = new Set(tools.map(t => t.name));
	const registered = new Set(listTools().map(t => t.id));

	for (const id of MUST_NOT_BE_EXPOSED) {
		if (!registered.has(id)) {
			// Not registered in this build -- skip silently; the snapshot
			// + isReadOnlyShaperTool tests cover the allowlist regardless.
			continue;
		}
		assert.equal(exposedNames.has(id), false,
			`mutating tool ${id} is exposed in getReadOnlyTools() output`);
	}
});

test('ReadOnlyToolRegistryMismatch reports the missing ids in its message', () => {
	_resetRegistryForTests();
	try {
		getReadOnlyTools();
		assert.fail('expected throw');
	} catch (err) {
		assert.ok(err instanceof ReadOnlyToolRegistryMismatch);
		// Empty registry -> every allowlist entry is missing; sample-check a few.
		assert.match(err.message, /graph_entity/);
		assert.match(err.message, /db_sql_describe/);
		assert.match(err.message, /file_read/);
	}
});
