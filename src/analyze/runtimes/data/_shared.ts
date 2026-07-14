/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared helpers for the data-target deterministic runtimes
 * (discovery-connections / discovery-objects / schema-table).
 *
 * Internal to the data/ runtime family. Differs from the code
 * helpers because data runtimes derive the repoPath from
 * intent.scopeRef rather than task.params.scopeRef -- data
 * templates carry connection-scoped params (connectionId / table /
 * kind), not whole scope refs.
 */

import type { TemplateExecuteArgs } from '../../executor/types.js';

/**
 * Pull the active workspace path off args.intent.scopeRef. Data
 * runtimes need a repoPath to address the per-repo driver pool;
 * the planner is expected to scope data plans at the workspace /
 * repo / manifest-dir level.
 */
export function resolveRepoPathFromIntent(
	args:          TemplateExecuteArgs,
	templateLabel: string,
): string {
	const sr = args.intent.scopeRef;
	switch (sr.kind) {
		case 'workspace':
		case 'repo':
		case 'manifest-dir':
			return sr.value;
		default:
			throw new Error(
				`${templateLabel}: intent.scopeRef.kind='${sr.kind}' not supported. ` +
					'Data runtimes require workspace, repo, or manifest-dir scope.',
			);
	}
}

/**
 * Read a required string field from task.params; throws with an
 * INV-5 defense-in-depth message when missing.
 */
export function requireStringParam(
	args:          TemplateExecuteArgs,
	key:           string,
	templateLabel: string,
): string {
	const v = (args.task.params as Record<string, unknown>)[key];
	if (typeof v !== 'string' || v.length === 0) {
		throw new Error(
			`${templateLabel}: task.params.${key} missing or not a non-empty string (taskId=${args.task.taskId}). ` +
				'INV-5 should have rejected this plan -- check the planner validator.',
		);
	}
	return v;
}

/**
 * Read an optional string field from task.params; returns undefined
 * when missing. Throws when present but not a non-empty string.
 */
export function optionalStringParam(
	args:          TemplateExecuteArgs,
	key:           string,
	templateLabel: string,
): string | undefined {
	const v = (args.task.params as Record<string, unknown>)[key];
	if (v === undefined) return undefined;
	if (typeof v !== 'string' || v.length === 0) {
		throw new Error(
			`${templateLabel}: task.params.${key} present but not a non-empty string (taskId=${args.task.taskId})`,
		);
	}
	return v;
}
