/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared helpers across the code-target deterministic runtimes
 * (discovery-modules / discovery-entrypoints / surface-functional /
 * structure-module-tree).
 *
 * Underscore-prefixed = internal to the code/ runtime family. If
 * data/infra later need the same helpers, promote to
 * analyze/runtimes/shared/.
 */

import type { Entity } from '../../../shared/types.js';
import type { TemplateExecuteArgs } from '../../executor/types.js';

// ---------------------------------------------------------------------------
// scopeRef reading + repo path resolution
// ---------------------------------------------------------------------------

export interface ScopeRef {
	readonly kind:  string;
	readonly value: string;
}

/**
 * Read task.params.scopeRef and return its shape. Throws with an
 * explicit INV-5 message when missing/malformed -- the planner
 * validator should have caught these before the executor invokes
 * the runtime, so this is defense-in-depth.
 */
export function readScopeRef(args: TemplateExecuteArgs, templateLabel: string): ScopeRef {
	const raw = (args.task.params as Record<string, unknown>)['scopeRef'];
	if (raw === null || typeof raw !== 'object') {
		throw new Error(
			`${templateLabel}: task.params.scopeRef missing (taskId=${args.task.taskId}). ` +
				'INV-5 should have rejected this plan -- check the planner validator.',
		);
	}
	const obj   = raw as Record<string, unknown>;
	const kind  = obj['kind'];
	const value = obj['value'];
	if (typeof kind !== 'string' || typeof value !== 'string') {
		throw new Error(
			`${templateLabel}: task.params.scopeRef has wrong shape (taskId=${args.task.taskId})`,
		);
	}
	return { kind, value };
}

/**
 * Map a ScopeRef to a repo path the graph layer can address. Only
 * the kinds the deterministic code runtimes can currently support
 * are accepted; future kinds add cases here as the surface grows.
 */
export function resolveRepoPath(scopeRef: ScopeRef, templateLabel: string): string {
	switch (scopeRef.kind) {
		case 'repo':
		case 'manifest-dir':
			return scopeRef.value;
		default:
			throw new Error(
				`${templateLabel}: scopeRef.kind='${scopeRef.kind}' not supported yet. ` +
					'Supported in this revision: repo, manifest-dir.',
			);
	}
}

// ---------------------------------------------------------------------------
// Sorting helpers -- runtimes never leak iteration order across runs
// ---------------------------------------------------------------------------

/** Compare entities by (file, startLine, name) for deterministic output. */
export function compareEntitiesByLocation(a: Entity, b: Entity): number {
	if (a.file !== b.file)           return a.file < b.file ? -1 : 1;
	if (a.startLine !== b.startLine) return a.startLine - b.startLine;
	return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * dirname-style helper that doesn't depend on path.dirname() so it
 * matches the storage layer's "file path comparison is just string
 * comparison" assumption -- forward slashes only; absolute paths
 * required.
 */
export function modulePrefixOf(moduleFile: string): string {
	const idx = moduleFile.lastIndexOf('/');
	if (idx <= 0) return moduleFile;  // no separator OR root-level
	return moduleFile.slice(0, idx + 1);  // include trailing slash
}
