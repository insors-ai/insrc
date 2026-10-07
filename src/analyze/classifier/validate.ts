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
 * This table is the ONE statement of which kind goes with which
 * kind of source. Each row lists every kind that has a meaning for
 * that source -- it matches what the source's plan tasks accept:
 *
 * code  -> repo | module | file | symbol | manifest-dir | workspace
 * data  -> connection | repo | manifest-dir | workspace
 * infra -> repo | manifest-dir | workspace
 * docs  -> repo | module | file | workspace
 * generic -> any
 *
 * The classifier's prompt (prompts/analyze/classify.system.md) states
 * the same rows; a test holds the two equal.
 */
export const TARGET_TO_KINDS: Readonly<Record<AnalyzeTarget, ReadonlyArray<AnalyzeScopeRef['kind']>>> = Object.freeze({
	code:    ['repo', 'module', 'file', 'symbol', 'manifest-dir', 'workspace'],
	data:    ['connection', 'repo', 'manifest-dir', 'workspace'],
	infra:   ['repo', 'manifest-dir', 'workspace'],
	docs:    ['repo', 'module', 'file', 'workspace'],
	generic: ['repo', 'module', 'file', 'symbol', 'connection', 'manifest-dir', 'workspace'],
});

/** Separates the file path from the entity name in a symbol scope's
 *  value: `<absolute file path>#<entity name>`, split at the LAST one. */
const SYMBOL_SEPARATOR = '#';

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

	// A symbol's value is not itself a path: it is a file path, the
	// separator, and an entity name. Split it BEFORE any test against
	// the file system and test the file part. Whether the name matches
	// a stored entity is decided when the scope is resolved, not here.
	if (scopeRef.kind === 'symbol') {
		return checkSymbolValue(scopeRef.value);
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

function checkSymbolValue(value: string): ValidationFailure | null {
	const at = value.lastIndexOf(SYMBOL_SEPARATOR);
	const filePart = at === -1 ? '' : value.slice(0, at);
	const namePart = at === -1 ? '' : value.slice(at + 1);
	if (filePart.length === 0 || namePart.length === 0) {
		return {
			code:    'scope-ref-unresolved',
			message:
				`kind='symbol' expects '<absolute file path>${SYMBOL_SEPARATOR}<entity name>'; got '${value}'.`,
		};
	}
	if (!existsSync(filePart)) {
		return {
			code:    'scope-ref-unresolved',
			message: `kind='symbol': file '${filePart}' does not exist on disk.`,
		};
	}
	if (!statSync(filePart).isFile()) {
		return {
			code:    'scope-ref-unresolved',
			message: `kind='symbol' expects a regular file before '${SYMBOL_SEPARATOR}'; '${filePart}' is not a file.`,
		};
	}
	return null;
}
