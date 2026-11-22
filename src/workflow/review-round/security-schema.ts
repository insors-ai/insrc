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
import { codexStrictSchema, validateCodexReply, validateNativeReply } from '../../agent/providers/structured-schema.js';
import { ModelResponseShapeError } from '../../agent/providers/model-call-error.js';
import type { SecurityFinding } from './security-finding.js';
import type { SecurityLocator } from './security-locator.js';

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

/** The canonical SecurityEvidence schema (evidence-provider.ts): providerCategory
 *  required, an optional nested SecurityLocator. */
const securityEvidenceSchema: StructuredSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['providerCategory'],
	properties: {
		providerCategory: { type: 'string' },
		locator:          securityLocatorSchema,
	},
};

/** The five fixed FindingCategory values (finding.ts) -- the same constraint
 *  as the inherited base Finding. */
const FINDING_CATEGORIES = ['correctness', 'functional-completeness', 'security', 'quality', 'maintainability'];

/** The canonical SecurityFinding schema: the `kind` discriminant, every
 *  inherited Finding field (id, category, severity), and SecurityFinding's
 *  own fields. */
export const securityFindingSchema: StructuredSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['id', 'category', 'severity', 'kind', 'checkId', 'evidence', 'enforcementMode'],
	properties: {
		id:                { type: 'string' },
		category:          { type: 'string', enum: FINDING_CATEGORIES },
		severity:          { type: 'string' },
		kind:              { const: 'security' },
		checkId:           { type: 'string' },
		violatedPolicyRef: { type: 'string' },
		evidence:          { type: 'array', items: securityEvidenceSchema },
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

/**
 * Output-side: `raw`'s parsed JSON reply, held to the canonical schema and
 * cast to `T` once it passes -- the same dispatch cli-provider.ts already
 * uses for every structured-output reply (`codexReply`/the vibe and claude
 * branches): codex's reply goes through `validateCodexReply` (its own
 * transport-only optional-null unwrapping); claude and vibe go through
 * `validateNativeReply`. Throws `ModelResponseShapeError` on a mismatch, the
 * same error every other structured-output call site throws.
 */
function parseReply<T>(schema: StructuredSchema, model: CliKind, raw: unknown, what: string): T {
	const checked = model === 'codex' ? validateCodexReply<T>(schema, raw) : validateNativeReply<T>(schema, raw);
	if (!checked.ok) {
		throw new ModelResponseShapeError(`${what} does not satisfy its schema: ${checked.errors.join('; ')}`, checked.errors);
	}
	return checked.value;
}

export function parseSecurityFindingReply(model: CliKind, raw: unknown): SecurityFinding {
	return parseReply<SecurityFinding>(securityFindingSchema, model, raw, 'SecurityFinding reply');
}

export function parseSecurityLocatorReply(model: CliKind, raw: unknown): SecurityLocator {
	return parseReply<SecurityLocator>(securityLocatorSchema, model, raw, 'SecurityLocator reply');
}
