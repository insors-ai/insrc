/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Per-(type,model) JSON Schema transformers for SecurityFinding and
 * SecurityLocator (LLD s1 t5, standalone Story add-securityfinding-
 * capability-family-delegates-framing).
 *
 * The canonical model (plain TS interfaces, real structural inheritance) is
 * designed for humans; the JSON Schema actually presented to a given LLM for
 * structured output is tuned per (type, target model) pair, extending the
 * exact pattern cli-provider.ts already uses for every structured-output
 * call: `codexStrictSchema` (structured-schema.ts) strips the keywords
 * codex's `--output-schema` strict mode refuses; `claude` and `vibe` take
 * the canonical schema unchanged (`this.kind === 'codex' ? codexSchemaJson(schema)
 * : JSON.stringify(schema)`, cli-provider.ts). No new transformation logic is
 * invented here -- these functions only apply that existing transformer to
 * the two new canonical schemas below.
 */

import type { StructuredSchema } from '../../shared/types.js';
import type { CliKind } from '../../agent/providers/cli-provider.js';
import { codexStrictSchema } from '../../agent/providers/structured-schema.js';

/** The canonical SecurityFinding schema: the `kind` discriminant, every
 *  inherited Finding field (id, category, severity), and SecurityFinding's
 *  own fields. */
export const securityFindingSchema: StructuredSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['id', 'category', 'severity', 'kind', 'checkId', 'evidence', 'enforcementMode'],
	properties: {
		id:                { type: 'string' },
		category:          { type: 'string' },
		severity:          { type: 'string' },
		kind:              { const: 'security' },
		checkId:           { type: 'string' },
		violatedPolicyRef: { type: 'string' },
		evidence:          { type: 'array', items: { type: 'object', additionalProperties: true } },
		fixability:        { type: 'string' },
		confidence:        { type: 'string', enum: ['high', 'medium', 'low'] },
		enforcementMode:   { type: 'string', enum: ['advisory', 'warning', 'blocking'] },
		overriddenBy:      { type: 'string' },
		overrideReason:    { type: 'string' },
		overriddenAt:      { type: 'string' },
		receiptId:         { type: 'string' },
		riskFamilyVerdict: { type: 'string', enum: ['applicable', 'not-applicable', 'uncertain'] },
	},
};

/** The canonical SecurityLocator schema: the `kind` discriminant and `value`
 *  inherited from Locator, plus SecurityLocator's own fields. */
export const securityLocatorSchema: StructuredSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['kind', 'value'],
	properties: {
		kind:               { type: 'string' },
		value:              { type: 'string' },
		trustBoundaryId:    { type: 'string' },
		taintPathStepIndex: { type: 'integer' },
	},
};

/** `schema` tuned for `model`: codex's strict-mode copy for `codex`, the
 *  canonical schema unchanged for every other CliKind -- the same branch
 *  cli-provider.ts already uses for every structured-output call. */
function schemaFor(schema: StructuredSchema, model: CliKind): StructuredSchema {
	return model === 'codex' ? codexStrictSchema(schema) : schema;
}

export function securityFindingSchemaFor(model: CliKind): StructuredSchema {
	return schemaFor(securityFindingSchema, model);
}

export function securityLocatorSchemaFor(model: CliKind): StructuredSchema {
	return schemaFor(securityLocatorSchema, model);
}
