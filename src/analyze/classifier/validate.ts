/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cross-field validation for a `ClassifiedIntent`:
 *
 *   1. scopeRef.kind must be compatible with target (a `connection`
 *      scope on a `code` target is a contradiction).
 *   2. scopeRef.value must resolve (filesystem path exists for
 *      filesystem-y kinds; connection id is registered for
 *      `kind=connection`).
 *
 * The Ajv schema (schema.ts) handles structural shape; this module
 * handles the semantic checks that depend on the workspace state.
 *
 * Used by the classifier driver: a failed validation triggers a
 * single corrective retry with the failure reason appended to the
 * LLM's next-turn prompt. After two failures, the classifier
 * abort with the typed error code.
 *
 * See: design/analyze-framework.md "Flow / 2. Classify"
 */

import { existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

import type {
	AnalyzeScopeRef,
	AnalyzeTarget,
	ClassifiedIntent,
} from '../../shared/analyze-types.js';

/**
 * Per-target allowed scopeRef.kind values. The classifier picks a
 * target + a scopeRef; if the kind doesn't match the target, the
 * intent is incoherent. Generic target accepts every kind --
 * "analyze this repo / workspace / connection" can flow through
 * the generic-shaper regardless of what the user pointed at.
 *
 * code  -> repo | module | file | symbol | workspace
 * data  -> connection | workspace
 * infra -> manifest-dir | workspace
 * generic -> any
 */
const TARGET_TO_KINDS: Readonly<Record<AnalyzeTarget, ReadonlyArray<AnalyzeScopeRef['kind']>>> = Object.freeze({
	code:    ['repo', 'module', 'file', 'symbol', 'workspace'],
	data:    ['connection', 'workspace'],
	infra:   ['manifest-dir', 'workspace'],
	docs:    ['repo', 'module', 'file', 'workspace'],
	generic: ['repo', 'module', 'file', 'symbol', 'connection', 'manifest-dir', 'workspace'],
});

/** Filesystem-y kinds whose `value` must point at an existing path. */
const FILESYSTEM_KINDS: ReadonlySet<AnalyzeScopeRef['kind']> = new Set([
	'repo',
	'module',
	'file',
	'symbol',
	'manifest-dir',
	'workspace',
]);

export interface ValidationFailure {
	readonly code:    string;
	readonly message: string;
}

/**
 * Run every semantic check against the candidate intent. Returns
 * the first failure (so the corrective retry has a single reason
 * to address) or `null` when everything passes.
 *
 * The `connectionExists` callback is injected so this module
 * doesn't import the data-driver registry directly -- the
 * classifier driver passes a closure over `db_list_connections`-style
 * state.
 */
export async function validateIntentSemantics(
	intent: ClassifiedIntent,
	connectionExists?: (id: string) => Promise<boolean>,
): Promise<ValidationFailure | null> {
	const kindMismatch = checkKindTargetMatch(intent.target, intent.scopeRef.kind);
	if (kindMismatch !== null) return kindMismatch;

	const resolution = await checkScopeRefResolves(intent.scopeRef, connectionExists);
	if (resolution !== null) return resolution;

	return null;
}

/** Exported for the schema's per-target dispatch logic + tests. */
export function isKindCompatibleWithTarget(
	target: AnalyzeTarget,
	kind:   AnalyzeScopeRef['kind'],
): boolean {
	const allowed = TARGET_TO_KINDS[target];
	return allowed.includes(kind);
}

function checkKindTargetMatch(
	target: AnalyzeTarget,
	kind:   AnalyzeScopeRef['kind'],
): ValidationFailure | null {
	if (isKindCompatibleWithTarget(target, kind)) return null;
	const allowed = TARGET_TO_KINDS[target];
	return {
		code:    'scope-ref-kind-target-mismatch',
		message:
			`scopeRef.kind='${kind}' is incompatible with target='${target}'. ` +
			`Allowed kinds for this target: ${allowed.join(', ')}.`,
	};
}

async function checkScopeRefResolves(
	scopeRef: AnalyzeScopeRef,
	connectionExists?: (id: string) => Promise<boolean>,
): Promise<ValidationFailure | null> {
	if (scopeRef.kind === 'connection') {
		if (connectionExists === undefined) {
			// The classifier didn't supply a connection registry; we
			// cannot verify and treat the connection as unverifiable
			// (NOT failing -- production code wires the callback).
			return null;
		}
		const found = await connectionExists(scopeRef.value);
		if (!found) {
			return {
				code:    'scope-ref-unresolved',
				message: `Connection '${scopeRef.value}' is not registered.`,
			};
		}
		return null;
	}

	if (!FILESYSTEM_KINDS.has(scopeRef.kind)) {
		// Future-proofing: unknown kinds pass through.
		return null;
	}

	const path = scopeRef.value;
	if (!existsSync(path)) {
		return {
			code:    'scope-ref-unresolved',
			message: `Path '${path}' does not exist on disk.`,
		};
	}

	const stat = statSync(path);

	// Per-kind path-shape rules:
	switch (scopeRef.kind) {
		case 'file': {
			if (!stat.isFile()) {
				return {
					code:    'scope-ref-unresolved',
					message: `kind='file' expects a regular file; '${path}' is not a file.`,
				};
			}
			break;
		}
		case 'symbol': {
			// Symbol values typically encode "<file>:<symbol>" or
			// similar. We loosely require the containing dir to exist
			// (in case the value is "file:symbol" we don't fully parse).
			const parent = dirname(path);
			if (!existsSync(parent)) {
				return {
					code:    'scope-ref-unresolved',
					message: `kind='symbol' value '${path}' resolves to a parent directory that doesn't exist.`,
				};
			}
			break;
		}
		case 'repo':
		case 'module':
		case 'manifest-dir':
		case 'workspace': {
			if (!stat.isDirectory()) {
				return {
					code:    'scope-ref-unresolved',
					message:
						`kind='${scopeRef.kind}' expects a directory; '${path}' is not a directory.`,
				};
			}
			break;
		}
	}

	return null;
}
