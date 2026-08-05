/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 — the DEF Stories schema constrains a Story's local-constraint `id` to the
 * `lc` namespace (^lc\d+$), OFF the citation `c` namespace, so a local-constraint
 * id echoed into a downstream LLD body reads as `[[lcN]]` (ignored by the
 * synthesizer's c-only citation guard, exactly like `[[kN]]`) rather than being
 * hard-failed as a dangling citation. The `source` field stays `^c\d+$` (it
 * references a real DEF citation).
 *
 * Run: npx tsx --test src/workflow/runners/define/__tests__/local-constraint-namespace.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { storiesComposeSchema } from '../schemas.js';
import { validateAgainstSchema } from '../../../../agent/providers/structured-output.js';

/** A minimal, otherwise-valid stories-compose output whose single Story carries
 *  one local constraint — the `id`/`source` are the knobs each test toggles. */
function storiesWith(localConstraintId: string, source = 'c1'): unknown {
	return {
		stories: [{
			id: 's1',
			title: 't',
			userValue: 'v',
			acceptanceCriteria: [{ id: 'ac1', given: 'g', when: 'w', then: 't', operationalizes: [] }],
			localConstraints: [{ id: localConstraintId, text: 'must not X', type: 'convention', source }],
		}],
		citations: [],
	};
}

// ac1 — the lc namespace is accepted.
test('S001: a local constraint with an lc-namespaced id (lc1) validates against storiesComposeSchema', () => {
	const res = validateAgainstSchema(storiesComposeSchema, storiesWith('lc1'));
	assert.equal(res.ok, true, res.ok ? '' : res.errors.join('; '));
});

// ac1 — the old c namespace is now REJECTED for a local-constraint id.
test('S001: a local constraint with a c-namespaced id (c1) is REJECTED (the collision namespace is no longer allowed)', () => {
	const res = validateAgainstSchema(storiesComposeSchema, storiesWith('c1'));
	assert.equal(res.ok, false, 'a c-namespaced local-constraint id must fail the tightened pattern');
	assert.ok(!res.ok && res.errors.some(e => /id/.test(e)), `errors should mention the id pattern: ${!res.ok ? res.errors.join('; ') : ''}`);
});

// ac1 — a bare k-shaped id is also rejected (only lc is accepted).
test('S001: a k-shaped local-constraint id (k1) is REJECTED — only the lc namespace is accepted', () => {
	const res = validateAgainstSchema(storiesComposeSchema, storiesWith('k1'));
	assert.equal(res.ok, false);
});

// ac1 — source STAYS in the citation namespace: an lc-id with a c-source is valid,
// and a source outside ^c\d+$ is rejected.
test('S001: source stays a c-citation reference — lc id + c source validates; a non-c source is rejected', () => {
	assert.equal(validateAgainstSchema(storiesComposeSchema, storiesWith('lc1', 'c7')).ok, true);
	const bad = validateAgainstSchema(storiesComposeSchema, storiesWith('lc1', 'lc7'));
	assert.equal(bad.ok, false, 'source must remain in the ^c\\d+$ citation namespace');
});
