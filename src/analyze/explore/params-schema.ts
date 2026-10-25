/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The params each exploration type takes, and the closed params schema the
 * decomposer's output schema is built from (ISSUE-8d39ef09, LLD-9874475f902756f6-S001).
 *
 * Codex's strict grammar cannot express an open object, so an exploration's
 * params are declared per type. Every param is optional in the schema: the
 * decomposer prompt allows empty params, and a missing required param keeps
 * failing that one exploration at its runner, as before. Every value also
 * admits null (codex must give every listed key; null means absent) and a
 * `$eN.<accessor>` placeholder string, which the executor resolves before the
 * runner sees it, so a number, boolean or array param may arrive as a string.
 *
 * Source of truth: each runner's params interface in this directory, and the
 * catalog in src/prompts/analyze/decompose.system.md.
 */

import type { ExplorationType } from './types.js';

/** The value kinds a param takes. */
export type ParamKind = 'string' | 'number' | 'boolean' | 'string[]';

export const EXPLORATION_PARAMS: Readonly<Record<ExplorationType, Readonly<Record<string, ParamKind>>>> = {
	'concept.resolve':          { query: 'string', limit: 'number', includeKinds: 'string[]' },
	'module.profile':           { path: 'string' },
	'symbol.locate':            { names: 'string[]', kinds: 'string[]', limit: 'number', matchMode: 'string' },
	'class.hierarchy':          { symbolName: 'string', entityId: 'string' },
	'import.graph':             { path: 'string', topK: 'number' },
	'test.locate':              { subject: 'string', topK: 'number' },
	'usage.example':            { symbolName: 'string', entityId: 'string', kinds: 'string[]', topK: 'number' },
	'capability.reuse-check':   { capability: 'string', limit: 'number' },
	'search.text':              { pattern: 'string', glob: 'string', caseInsensitive: 'boolean', topK: 'number', path: 'string' },
	'convention.detect':        { path: 'string' },
	'config.trace':             { key: 'string', path: 'string', topK: 'number' },
	'data-model.trace':         { entityName: 'string' },
	'doc.mention':              { subject: 'string', limit: 'number', filenameHint: 'string', kinds: 'string[]', previewChars: 'number', minScore: 'number' },
	'doc.decision.trace':       { topic: 'string', maxSources: 'number' },
	'doc.constraint.enumerate': { subject: 'string', maxSources: 'number' },
	'db.connections.list':      {},
	'db.tables.list':           { connectionId: 'string', schema: 'string', limit: 'number' },
	'db.table.describe':        { connectionId: 'string', target: 'string' },
	'manifests.locate':         { families: 'string[]', topK: 'number' },
	'freeform.probe':           { purpose: 'string', shaperId: 'string' },
};

/** A param's value schema: its kind, a placeholder string, or null. */
function valueSchema(kind: ParamKind): Record<string, unknown> {
	switch (kind) {
		case 'string':   return { type: ['string', 'null'] };
		case 'number':   return { type: ['number', 'string', 'null'] };
		case 'boolean':  return { type: ['boolean', 'string', 'null'] };
		case 'string[]': return { type: ['array', 'string', 'null'], items: { type: 'string' } };
	}
}

/** One exploration type's params: a closed object of its params, none required. */
export function explorationParamsSchema(type: ExplorationType): Record<string, unknown> {
	const params = EXPLORATION_PARAMS[type];
	return {
		type:                 'object',
		additionalProperties: false,
		properties:           Object.fromEntries(Object.entries(params).map(([name, kind]) => [name, valueSchema(kind)])),
	};
}
