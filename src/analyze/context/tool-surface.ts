/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Read-only tool surface for the LLM-driven Context Builder shaper.
 *
 * The shaper hands this set into the Ollama tool-loop so the LLM can
 * traverse the graph, describe databases, sample data, glob files,
 * walk manifests, and inspect git history -- all without the ability
 * to mutate workspace state.
 *
 * The surface is an EXPLICIT ALLOWLIST -- not an automated heuristic
 * over the tool registry. Reasoning:
 *
 *   - The Tool.destructive flag is not reliably set across the ~110
 *     built-ins (a sweep on cleanup did not enforce it). Filtering on
 *     it would silently leak the wrong tools.
 *   - The Tool.access field carries the read/write semantic but is
 *     typed `unknown` for the same reason (preserved across cleanup;
 *     widened so the surviving builtins keep their declarations).
 *     Not reliable for runtime filtering.
 *   - Allowlist failure mode is "missing tool fails the test or build"
 *     -- safe. Heuristic failure mode is "new mutating tool silently
 *     gets exposed to the shaper LLM" -- unsafe.
 *
 * The allowlist is pinned by a snapshot unit test
 * (`tool-surface.test.ts`). Adding or removing an entry forces the
 * test to be updated, which forces a human review. New mutating
 * tools added to the registry are NOT auto-exposed.
 *
 * See: design/analyze-context-builder.md "Tool surface"
 *      plans/analyze-context-builder.md Phase 2
 */

import { listTools } from '../../daemon/tools/registry.js';
import type { Tool } from '../../daemon/tools/types.js';
import type { ToolDefinition } from '../../shared/types.js';

/**
 * Canonical IDs of every tool the shaper is allowed to call. Grouped
 * by family for readability; ordering inside a family is alphabetical.
 *
 * Any tool not on this list is hidden from the shaper -- including
 * read-only tools that exist but aren't needed for context building
 * (e.g. `gh_pr_view` is read-only but doesn't belong in shaper scope).
 *
 * Exclusions and their rationales:
 *   - shell.* / ssh.* -- arbitrary command execution surface
 *   - file_write / file_edit / file_delete / file_copy / file_move /
 *     file_mkdir / file_multi-edit -- workspace mutation
 *   - git mutating ops (amend, commit, push, pull, fetch, merge,
 *     rebase, reset, revert, checkout, stage, stash, worktree,
 *     cherry-pick, branch, tag, remote) -- workspace mutation;
 *     branch/tag/remote excluded conservatively (subcommands can
 *     mutate)
 *   - gh.* -- GitHub mutation surface; even read-only gh ops don't
 *     belong in shaper scope
 *   - cloud.* -- cloud SDK surface; shaper's relevance window is the
 *     local workspace
 *   - k8s.* / pkg.* / notify.* -- mutating side-effect surfaces
 *   - test_run / test_coverage / test_watch -- test invocation
 *     mutates state, can hang
 *   - http_request / http_download / http_upload / http_websocket /
 *     web_fetch / web_search -- network surface; not part of the
 *     shaper's local-relevance contract
 */
export const READ_ONLY_TOOL_IDS: readonly string[] = Object.freeze([
	// graph -- code knowledge graph traversal + search
	'graph_entity',
	'graph_query',
	'graph_search',

	// db -- connection list (read)
	'db_list_connections',

	// db_sql -- read-only SQL surface
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

	// db_file -- DuckDB-backed file-driver (CSV / Parquet / etc)
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

	// db_kv -- key/value store introspection
	'db_kv_describe_namespace',
	'db_kv_get',
	'db_kv_list_namespaces',
	'db_kv_sample_shape',
	'db_kv_scan',

	// file -- read-only fs surface
	'file_read',
	'file_stat',

	// search -- read-only filesystem search
	'search_glob',
	'search_grep',
	'search_list-dir',
	'search_recent',

	// code -- read-only structural analyzers over indexed code
	'code_class_fields',
	'code_class_locate',
	'code_class_references',
	'code_migration_walk',
	'code_orm_scan',

	// data -- read-only lineage + schema drift
	'data_lineage',
	'data_schema-drift',

	// git -- read-only history + diff
	'git_blame',
	'git_diff',
	'git_log',
	'git_show',
	'git_status',

	// docs -- pre-baked doc summaries + hybrid retrieval
	// (plans/docs-module.md Phase 7). Available to every shaper --
	// the docs shaper leans on these heavily; code / data / infra
	// shapers use them when they want to sample design-doc
	// grounding for artefacts.
	'docs_family_list',
	'docs_project_context',
	'docs_retrieve',
	'docs_summary_get',
]);

const READ_ONLY_SET = new Set<string>(READ_ONLY_TOOL_IDS);

export class ReadOnlyToolRegistryMismatch extends Error {
	constructor(missing: readonly string[]) {
		const list = missing.join(', ');
		super(
			`Read-only tool surface references unregistered tool(s): ${list}. ` +
				'Either the tool was renamed, removed, or the registry was not ' +
				'populated before getReadOnlyTools() was called.',
		);
		this.name = 'ReadOnlyToolRegistryMismatch';
	}
}

/**
 * Return the read-only tool surface as a list of LLM-facing
 * ToolDefinition records, ordered the same as READ_ONLY_TOOL_IDS.
 *
 * Throws ReadOnlyToolRegistryMismatch if any allowlist entry has no
 * corresponding registration -- catches both registry drift (a
 * builtin renamed without updating this allowlist) and test setup
 * bugs (the registry wasn't populated before the call).
 *
 * Pure projection -- callers may freely cache the result. The list
 * is rebuilt on every call (cheap; ~50 entries).
 */
export function getReadOnlyTools(): ToolDefinition[] {
	const registered = new Map<string, Tool>();
	for (const tool of listTools()) {
		registered.set(tool.id, tool);
	}

	const missing: string[] = [];
	const out: ToolDefinition[] = [];

	for (const id of READ_ONLY_TOOL_IDS) {
		const tool = registered.get(id);
		if (tool === undefined) {
			missing.push(id);
			continue;
		}
		out.push({
			name:        tool.id,
			description: tool.description,
			inputSchema: tool.inputSchema,
		});
	}

	if (missing.length > 0) {
		throw new ReadOnlyToolRegistryMismatch(missing);
	}

	return out;
}

/**
 * Predicate -- is `toolId` part of the shaper's read-only surface?
 *
 * Useful for tests and for any caller that wants to know whether a
 * given tool will be visible to the shaper LLM without enumerating
 * the full list.
 */
export function isReadOnlyShaperTool(toolId: string): boolean {
	return READ_ONLY_SET.has(toolId);
}
