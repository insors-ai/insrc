/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { SecurityLocator } from '../security-locator.js';
import type { Pointer } from '../../artifact-core/types.js';

describe('SecurityLocator', () => {
	it('SecurityLocator structural extension of Locator/Pointer (trust-boundary id + taint-path step index fields)', () => {
		const locator: SecurityLocator = {
			kind: 'symbol',
			value: 'src/foo.ts#bar',
			trustBoundaryId: 'tb-1',
			taintPathStepIndex: 2,
		};
		assert.equal(locator.kind, 'symbol');
		assert.equal(locator.value, 'src/foo.ts#bar');
		assert.equal(locator.trustBoundaryId, 'tb-1');
		assert.equal(locator.taintPathStepIndex, 2);

		const bare: SecurityLocator = { kind: 'lineRange', value: '10-20' };
		assert.equal(bare.trustBoundaryId, undefined);
		assert.equal(bare.taintPathStepIndex, undefined);

		// A SecurityLocator is assignable to Pointer.section with no change to Pointer's own type.
		const pointer: Pointer = { path: 'src/foo.ts', section: locator };
		assert.equal(pointer.section, locator);
	});
});
