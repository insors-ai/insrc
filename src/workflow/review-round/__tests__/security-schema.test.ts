/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Ajv2020 } from 'ajv/dist/2020.js';

import { parseSecurityFindingReply, parseSecurityLocatorReply, securityFindingSchemaFor, securityLocatorSchemaFor } from '../security-schema.js';

/** codex's strict-mode copy (processSchemaForOpenAIStrict) requires EVERY
 *  property present, with an optional field modelled as nullable rather than
 *  absent -- so "minimal" for codex means every optional field explicitly
 *  null, not omitted, while claude/vibe take the canonical (partial) shape. */
function minimalFor(model: 'claude' | 'codex' | 'vibe', required: Record<string, unknown>, optionalKeys: readonly string[]): Record<string, unknown> {
	if (model !== 'codex') return required;
	return { ...required, ...Object.fromEntries(optionalKeys.map((k) => [k, null])) };
}

describe('Per-(type,model) JSON Schema transformers for SecurityFinding and SecurityLocator', () => {
	it('JSON Schema transformer output for SecurityFinding (kind discriminant + inherited Finding fields)', () => {
		for (const model of ['claude', 'codex', 'vibe'] as const) {
			const schema = securityFindingSchemaFor(model);
			assert.equal(schema['type'], 'object');
			const validate = new Ajv2020({ strict: false }).compile(schema);

			const required = { id: 'f1', category: 'security', severity: 'HIGH', kind: 'security', checkId: 'sast', evidence: [], enforcementMode: 'blocking' };
			const optionalKeys = ['violatedPolicyRef', 'fixability', 'confidence', 'overriddenBy', 'overrideReason', 'overriddenAt', 'receiptId', 'riskFamilyVerdict'];
			const minimal = minimalFor(model, required, optionalKeys);
			assert.equal(validate(minimal), true, `${model}: a minimal valid SecurityFinding must validate (errors: ${JSON.stringify(validate.errors)})`);

			assert.equal(validate({ ...minimal, kind: 'comment' }), false, `${model}: a wrong kind discriminant must be rejected`);
			const { id: _id, ...withoutId } = minimal;
			assert.equal(validate(withoutId), false, `${model}: a missing inherited Finding field (id) must be rejected`);
			assert.equal(validate({ ...minimal, category: 'not-a-real-category' }), false, `${model}: category must be restricted to the five FindingCategory values, not an arbitrary string`);
			assert.equal(validate({ ...minimal, evidence: [{ locator: { kind: 'symbol', value: 'x' } }] }), false, `${model}: an evidence item missing providerCategory must be rejected`);

			// Output-side: the model's raw reply, parsed back into the canonical model.
			const parsed = parseSecurityFindingReply(model, minimal);
			assert.equal(parsed.id, 'f1');
			assert.equal(parsed.kind, 'security');
			assert.throws(() => parseSecurityFindingReply(model, { ...minimal, kind: 'comment' }), /does not satisfy its schema/);
		}
	});

	it('JSON Schema transformer output for SecurityLocator (kind discriminant + inherited Locator/Pointer fields)', () => {
		for (const model of ['claude', 'codex', 'vibe'] as const) {
			const schema = securityLocatorSchemaFor(model);
			assert.equal(schema['type'], 'object');
			const validate = new Ajv2020({ strict: false }).compile(schema);

			const required = { kind: 'symbol', value: 'src/foo.ts#bar' };
			const optionalKeys = ['trustBoundaryId', 'taintPathStepIndex'];
			const minimal = minimalFor(model, required, optionalKeys);
			assert.equal(validate(minimal), true, `${model}: a minimal valid SecurityLocator must validate (errors: ${JSON.stringify(validate.errors)})`);
			assert.equal(validate({ ...required, trustBoundaryId: 'tb-1', taintPathStepIndex: 2 }), true, `${model}: the security-only fields must validate too`);
			const { kind: _kind, ...withoutKind } = minimal;
			assert.equal(validate(withoutKind), false, `${model}: a missing inherited Locator field (kind) must be rejected`);

			// Output-side: the model's raw reply, parsed back into the canonical model.
			const parsed = parseSecurityLocatorReply(model, minimal);
			assert.equal(parsed.kind, 'symbol');
			assert.equal(parsed.value, 'src/foo.ts#bar');
			assert.throws(() => parseSecurityLocatorReply(model, withoutKind), /does not satisfy its schema/);
		}
	});
});
