/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Infra-target template catalog: family discovery, per-family inventory
 * (kubernetes / terraform / helm / docker / ci), adherence check, aggregator.
 * Mirrors the foundational set from design/analyze-framework-infrastructure.md
 * "Discovery family" + "Inventory family". Ansible / Pulumi / CloudFormation
 * inventory templates land in subsequent commits.
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

/** An infra task's `scopeRef`: only the kinds of scope the infra family accepts. */
const INFRA_SCOPE_REF_SCHEMA = scopeRefSchemaFor('infra');

export const infraDiscoveryFamilies: AnalyzeTaskTemplate = {
	id:          'infra.discovery.families',
	target:      'infra',
	family:      'discovery',
	kind:        'leaf',
	revision:    'r1',
	description: 'Detect every IaC family present in scope (terraform, kubernetes, helm, github-actions, gitlab-ci, docker-compose, dockerfile).',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['scopeRef'],
		properties: {
			scopeRef: INFRA_SCOPE_REF_SCHEMA,
		},
	},
	produces:    ['families'],
};

export const infraInventoryKubernetes: AnalyzeTaskTemplate = {
	id:          'infra.inventory.kubernetes',
	target:      'infra',
	family:      'inventory',
	kind:        'leaf',
	revision:    'r1',
	description: 'Enumerate Kubernetes manifests in scope + their resource kinds, namespaces, labels.',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['scopeRef'],
		properties: {
			scopeRef: INFRA_SCOPE_REF_SCHEMA,
		},
	},
	produces:    ['k8s-inventory'],
};

export const infraInventoryTerraform: AnalyzeTaskTemplate = {
	id:          'infra.inventory.terraform',
	target:      'infra',
	family:      'inventory',
	kind:        'leaf',
	revision:    'r1',
	description: 'Enumerate Terraform configurations in scope + their resources, providers, modules, variables.',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['scopeRef'],
		properties: {
			scopeRef: INFRA_SCOPE_REF_SCHEMA,
		},
	},
	produces:    ['tf-inventory'],
};

export const infraInventoryHelm: AnalyzeTaskTemplate = {
	id:          'infra.inventory.helm',
	target:      'infra',
	family:      'inventory',
	kind:        'leaf',
	revision:    'r1',
	description: 'Enumerate Helm charts in scope + their metadata (name/version/appVersion/type/dependencies), template file count, and values.yaml top-level keys.',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['scopeRef'],
		properties: {
			scopeRef: INFRA_SCOPE_REF_SCHEMA,
		},
	},
	produces:    ['helm-inventory'],
};

export const infraInventoryDocker: AnalyzeTaskTemplate = {
	id:          'infra.inventory.docker',
	target:      'infra',
	family:      'inventory',
	kind:        'leaf',
	revision:    'r1',
	description: 'Enumerate Dockerfiles (FROM images/stages, EXPOSE ports) and docker-compose files (services, images, ports) in scope.',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['scopeRef'],
		properties: {
			scopeRef: INFRA_SCOPE_REF_SCHEMA,
		},
	},
	produces:    ['docker-inventory'],
};

export const infraInventoryCi: AnalyzeTaskTemplate = {
	id:          'infra.inventory.ci',
	target:      'infra',
	family:      'inventory',
	kind:        'leaf',
	revision:    'r1',
	description: 'Enumerate CI pipelines in scope: GitHub Actions workflows (triggers, jobs, step uses) and .gitlab-ci.yml (stages, jobs).',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['scopeRef'],
		properties: {
			scopeRef: INFRA_SCOPE_REF_SCHEMA,
		},
	},
	produces:    ['ci-inventory'],
};

export const infraAggregateReport: AnalyzeTaskTemplate = {
	id:           'infra.aggregate.report',
	target:       'infra',
	family:       'aggregate',
	kind:         'leaf',
	revision:     'r1',
	description:  'Terminal aggregator for infra-target plans. Consumes every upstream task output + emits the final report.',
	inputSchema:  AGGREGATOR_INPUT_SCHEMA,
	outputSchema: AGGREGATOR_OUTPUT_SCHEMA,
	produces:     ['report'],
	isAggregator: true,
};

/** docs/plans/docs-module.md Phase 4. Infra-side adherence check. */
export const infraAdherenceCheck: AnalyzeTaskTemplate = {
	id:          'infra.adherence.check',
	target:      'infra',
	family:      'adherence',
	kind:        'leaf',
	revision:    'r2',
	description: 'Check infra manifest adherence against the constraints the documents state. `infraSubject` names a manifest / family / environment. Preserves BOTH doc and infra positions on contradictions -- reader decides. ' + ADHERENCE_CONSTRAINTS_DESCRIPTION,
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['infraSubject'],
		// One of the three ways to give constraints; plan validation requires that it is not empty.
		anyOf:                ADHERENCE_CONSTRAINT_ANY_OF,
		properties: {
			infraSubject:      { type: 'string', minLength: 1 },
			...ADHERENCE_CONSTRAINT_PARAMS,
			maxSourceExcerpts: { type: 'integer', minimum: 1, maximum: 30 },
		},
	},
	produces:     ['adherence-report'],
	outputSchema: {
		type:                 'object',
		required:             ['infraSubject', 'matches', 'drifts', 'missingImpl', 'contradictions'],
		additionalProperties: true,
		properties: {
			infraSubject:   { type: 'string' },
			matches:        { type: 'array' },
			drifts:         { type: 'array' },
			missingImpl:    { type: 'array' },
			contradictions: { type: 'array' },
			...ADHERENCE_REPORT_SOURCE_PROPERTIES,
		},
	},
};

export const INFRA_TEMPLATES: readonly AnalyzeTaskTemplate[] = [
	infraDiscoveryFamilies,
	infraInventoryKubernetes,
	infraInventoryTerraform,
	infraInventoryHelm,
	infraInventoryDocker,
	infraInventoryCi,
	infraAdherenceCheck,
	infraAggregateReport,
];

export function registerInfraTemplates(): void {
	for (const t of INFRA_TEMPLATES) {
		registerTemplate(t);
	}
}
