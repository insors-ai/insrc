/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The size-to-method table and the trigger of a division
 * (LLD-b9d5c5c40df5a574-s3, task t3). Pure: no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HANDLING_TABLE, decideHandling, methodForSize } from '../handling.js';
import type { AdmissionTarget } from '../handling.js';

// The checked-in local configuration: a 32,768-token window, 20,480 single-pass output tokens.
const LOCAL: AdmissionTarget = { kind: 'local', windowTokens: 32_768, singlePassOutputTokens: 20_480 };

test('XS and S single pass, M, L and XL partitioned, undetermined is XL, trigger size/fit/both and no trigger for single pass', () => {
	assert.deepEqual({ ...HANDLING_TABLE }, { XS: 'single-pass', S: 'single-pass', M: 'partitioned', L: 'partitioned', XL: 'partitioned' });
	assert.equal(methodForSize('XS'), 'single-pass');
	assert.equal(methodForSize('S'), 'single-pass');
	for (const size of ['M', 'L', 'XL'] as const) assert.equal(methodForSize(size), 'partitioned', size);
	assert.equal(methodForSize(undefined), 'partitioned');

	const small = 'x'.repeat(100);
	const huge = 'x'.repeat(10_241);

	// A small size that fits: a single pass with no trigger.
	const single = decideHandling({ size: 'S', target: LOCAL, input: small });
	assert.equal(single.method, 'single-pass');
	assert.equal('trigger' in single, false);

	// The table alone divides.
	assert.equal(decideHandling({ size: 'M', target: LOCAL, input: small }).trigger, 'size');
	assert.equal(decideHandling({ size: undefined, target: LOCAL, input: small }).trigger, 'size');

	// The admission rule alone divides a small size.
	const fit = decideHandling({ size: 'XS', target: LOCAL, input: huge });
	assert.equal(fit.method, 'partitioned');
	assert.equal(fit.trigger, 'fit');

	// Both.
	assert.equal(decideHandling({ size: 'XL', target: LOCAL, input: huge }).trigger, 'both');

	// The budget it records is in the limit's own unit.
	assert.deepEqual(fit.budget, { unit: 'bytes', limit: 10_240, source: 'context-window', basis: 'bytes-bound', inputSize: 10_241 });
});
