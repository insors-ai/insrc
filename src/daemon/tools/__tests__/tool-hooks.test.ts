/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * s1 / sc1: the tool hook registry and the executor's hook stage.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HookFailure, ToolResult } from '../types.js';

test('tool-hooks.test.ts: HookFailure report shape', () => {
	const failure: HookFailure = { hookId: 'refresh', message: 'boom' };
	const result: ToolResult = { output: 'ok', format: 'text', success: true, hookFailures: [failure] };
	assert.deepEqual(Object.keys(failure).sort(), ['hookId', 'message']);
	assert.equal(result.success, true);
	assert.deepEqual(result.hookFailures, [{ hookId: 'refresh', message: 'boom' }]);
	const plain: ToolResult = { output: 'ok', format: 'text', success: true };
	assert.equal('hookFailures' in plain, false, 'absent unless a rule failed');
});
