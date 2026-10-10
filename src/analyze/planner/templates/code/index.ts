/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-target template catalog. Five templates -- enough for a real
 * M-bucket plan: discovery (modules + entrypoints), surface, structure,
 * aggregator.
 *
 * Per-family families are documented in design/analyze-framework-code.md;
 * this barrel registers the foundational five. Subsequent fanout
 * (integration, non-functional, tests, usage, cross-reference) lands
 * in later commits.
 */

import type { AnalyzeTaskTemplate } from '../../types.js';
import {
	ADHERENCE_CONSTRAINTS_DESCRIPTION,
	ADHERENCE_CONSTRAINT_ANY_OF,
	ADHERENCE_CONSTRAINT_PARAMS,
	ADHERENCE_REPORT_SOURCE_PROPERTIES,
	AGGREGATOR_INPUT_SCHEMA,
	AGGREGATOR_OUTPUT_SCHEMA,
	scopeRefSchemaFor,
} from '../shared-schemas.js';
import { registerTemplate } from '../registry.js';

/** A code task's `scopeRef`: only the kinds of scope the code family accepts. */
const CODE_SCOPE_REF_SCHEMA = scopeRefSchemaFor('code');

export const codeDiscoveryModules: AnalyzeTaskTemplate = {
	id:          'code.discovery.modules',
	target:      'code',
	family:      'discovery',
	kind:        'leaf',
	revision:    'r1',
	description: 'Enumerate the modules in scope: every directory of the scope that directly holds source files, each with its `directory` (an absolute path) and its `name` (the path relative to the repo).',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['scopeRef'],
		properties: {
			scopeRef: CODE_SCOPE_REF_SCHEMA,
		},
	},
	produces:    ['modules'],
	outputSchema: {
		type:     'object',
		required: ['modules'],
		properties: {
			modules: {
				type:  'array',
				items: {
					type:                 'object',
					additionalProperties: true,
					required:             ['name', 'path'],
					properties: {
						name: { type: 'string' },
						path: { type: 'string' },
					},
				},
			},
		},
	},
};

export const codeDiscoveryEntrypoints: AnalyzeTaskTemplate = {
	id:          'code.discovery.entrypoints',
	target:      'code',
	family:      'discovery',
	kind:        'leaf',
	revision:    'r1',
	description: 'Enumerate the functional entrypoints (top-level exports, CLI commands, HTTP route registrations, RPC handlers, cron jobs) in scope.',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['scopeRef'],
		properties: {
			scopeRef: CODE_SCOPE_REF_SCHEMA,
		},
	},
	produces:    ['entrypoints'],
};

export const codeSurfaceFunctional: AnalyzeTaskTemplate = {
	id:          'code.surface.functional',
	target:      'code',
	family:      'surface',
	kind:        'leaf',
	revision:    'r1',
	description: 'Extract the functional surface (APIs, exports, endpoints) of a single module.',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['module'],
		properties: {
			module: {
				type:        'string',
				minLength:   1,
				description: 'The module to describe. Write a directory of the repository: its absolute path, or its path relative to the repo (the `directory` or the `name` that code.discovery.modules returns). A directory that holds source only in its sub-directories is accepted, and its surface is everything under it. The entity id of a stored module entity is accepted too.',
			},
			depth:  { type: 'string', enum: ['shallow', 'deep'] },
		},
	},
	produces:    ['functional-surface'],
};

export const codeSubrunDeepDive: AnalyzeTaskTemplate = {
	id:          'code.subrun.deep-dive',
	target:      'code',
	family:      'subrun',
	kind:        'planner',
	revision:    'r1',
	description: 'Recursively plan a deep-dive into a sub-target (module, repo, central component). The task\'s `childIntent` param carries the classified intent for the child plan; the executor spawns a child Plan Builder invocation against it and materialises the terminal aggregator output as `report`.',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['childIntent'],
		properties: {
			childIntent: {
				type:                 'object',
				additionalProperties: false,
				required:             ['target', 'scope', 'focused', 'scopeRef', 'reasoning'],
				properties: {
					target:    { type: 'string', enum: ['code', 'data', 'infra', 'generic'] },
					scope:     { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'] },
					focused:   { type: 'boolean' },
					focus:     { type: 'string', minLength: 1 },
					scopeRef:  {
						type:                 'object',
						additionalProperties: false,
						required:             ['kind', 'value'],
						properties: {
							kind:  { type: 'string', enum: ['repo', 'module', 'file', 'symbol', 'connection', 'manifest-dir', 'workspace'] },
							value: { type: 'string', minLength: 1 },
						},
					},
					reasoning: { type: 'string', minLength: 1 },
				},
			},
		},
	},
	produces:    ['report'],
};

export const codeStructureModuleTree: AnalyzeTaskTemplate = {
	id:          'code.structure.module-tree',
	target:      'code',
	family:      'structure',
	kind:        'leaf',
	revision:    'r1',
	description: 'Walk the module-dependency graph rooted at the scope target and emit the abbreviated tree.',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['scopeRef'],
		properties: {
			scopeRef: CODE_SCOPE_REF_SCHEMA,
			maxDepth: { type: 'integer', minimum: 1, maximum: 12 },
		},
	},
	produces:    ['module-tree'],
};

export const codeAggregateReport: AnalyzeTaskTemplate = {
	id:           'code.aggregate.report',
	target:       'code',
	family:       'aggregate',
	kind:         'leaf',
	revision:     'r1',
	description:  'Terminal aggregator for code-target plans. Consumes every upstream task output + emits the final report.',
	inputSchema:  AGGREGATOR_INPUT_SCHEMA,
	outputSchema: AGGREGATOR_OUTPUT_SCHEMA,
	produces:     ['report'],
	isAggregator: true,
};

/**
 * docs/plans/docs-module.md Phase 4. Cross-cutting adherence check.
 * Given a code subject + a set of doc-derived constraints,
 * evaluate implementation adherence. Preserves BOTH doc position
 * and code position on contradictions -- reader decides.
 */
export const codeAdherenceCheck: AnalyzeTaskTemplate = {
	id:          'code.adherence.check',
	target:      'code',
	family:      'adherence',
	kind:        'leaf',
	revision:    'r2',
	description: 'Check code adherence against the constraints the documents state. `codeSubject` names the code area. Emits matches / drifts / missing-impl / contradictions, with the constraints it judged against. On contradictions, preserves BOTH doc position and code position verbatim -- no auto-adjudication. ' + ADHERENCE_CONSTRAINTS_DESCRIPTION,
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['codeSubject'],
		// One of the three ways to give constraints; plan validation requires that it is not empty.
		anyOf:                ADHERENCE_CONSTRAINT_ANY_OF,
		properties: {
			codeSubject: {
				type:        'string',
				minLength:   1,
				description: 'The code area to check (a file path, symbol name, or free-form subject like "the analyze framework classifier").',
			},
			...ADHERENCE_CONSTRAINT_PARAMS,
			maxSourceExcerpts: {
				type:    'integer',
				minimum: 1,
				maximum: 30,
			},
		},
	},
	produces:     ['adherence-report'],
	outputSchema: {
		type:                 'object',
		required:             ['codeSubject', 'matches', 'drifts', 'missingImpl', 'contradictions'],
		additionalProperties: true,
		properties: {
			codeSubject:    { type: 'string' },
			matches:        { type: 'array' },
			drifts:         { type: 'array' },
			missingImpl:    { type: 'array' },
			contradictions: { type: 'array' },
			...ADHERENCE_REPORT_SOURCE_PROPERTIES,
		},
	},
};

export const CODE_TEMPLATES: readonly AnalyzeTaskTemplate[] = [
	codeDiscoveryModules,
	codeDiscoveryEntrypoints,
	codeSurfaceFunctional,
	codeStructureModuleTree,
	codeSubrunDeepDive,
	codeAdherenceCheck,
	codeAggregateReport,
];

export function registerCodeTemplates(): void {
	for (const t of CODE_TEMPLATES) {
		registerTemplate(t);
	}
}
