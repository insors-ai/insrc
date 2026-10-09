/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared helpers for the data-target deterministic runtimes
 * (discovery-connections / discovery-objects / schema-table).
 *
 * Internal to the data/ runtime family. Data runtimes take their scope
 * from intent.scopeRef rather than task.params.scopeRef -- data
 * templates carry connection-scoped params (connectionId / table /
 * kind), not whole scope refs.
 */

import type { TemplateExecuteArgs } from '../../executor/types.js';
import { acquirePool } from '../../../daemon/db/index.js';
import { resolveTaskScope } from '../shared/task-scope.js';

/** Where a data task opens its connection pool, and the one connection it is
 *  held to when its scope is a connection. */
export interface DataScope {
	/** The directory whose connections file the pool is opened at. */
	readonly poolPath:      string;
	/** Present for a connection scope: the task works on this connection only. */
	readonly connectionId?: string | undefined;
}

/**
 * A data task's scope, from the intent (data templates carry connection-scoped
 * params, not a scope of their own), resolved by the one scope function.
 *
 * For a repo, a manifest directory and a workspace the pool is opened at the
 * scope's OWN path, whether or not that directory is a registered repo, and
 * not at the repo that contains it: a manifest directory inside a registered
 * repo keeps its own connections file. Only a connection scope uses the repo
 * that declares the connection, and the task is then held to that connection.
 */
export async function resolveDataScope(
	args:          TemplateExecuteArgs,
	templateLabel: string,
): Promise<DataScope> {
	const scope = await resolveTaskScope(args.intent.scopeRef, 'data', templateLabel);
	if (scope.kind === 'connection') {
		// resolveScope gives a connection scope the one registered repo that declares it.
		return { poolPath: scope.lookupPath, connectionId: scope.connectionId };
	}
	return { poolPath: scope.value };
}

/**
 * The connection a task works on: the one its params name, which under a
 * connection scope must be the scope's own.
 */
export function connectionWithinScope(scope: DataScope, named: string, templateLabel: string): string {
	if (scope.connectionId !== undefined && scope.connectionId !== named) {
		throw new Error(
			`${templateLabel}: the request's scope is the connection '${scope.connectionId}', ` +
				`and this task names the connection '${named}'. A task under a connection scope works on that connection only.`,
		);
	}
	return named;
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

// ---------------------------------------------------------------------------
// The connection pool
// ---------------------------------------------------------------------------

type PoolSource = typeof acquirePool;
let poolSource: PoolSource = acquirePool;

/** The repository's connection pool. Every data runtime takes it from here. */
export function acquireDataPool(repoPath: string): ReturnType<PoolSource> {
	return poolSource(repoPath);
}

/** Test seam: stand a pool in for the data runtimes; pass undefined to restore the real one. */
export function _setDataPoolSourceForTest(source: PoolSource | undefined): void {
	poolSource = source ?? acquirePool;
}
