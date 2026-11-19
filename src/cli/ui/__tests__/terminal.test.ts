/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clearTerminal } from '../terminal.js';

test('clearTerminal clears the visible screen and homes the cursor', () => {
	const chunks: string[] = [];
	clearTerminal({ write: chunk => chunks.push(chunk) });
	assert.deepEqual(chunks, ['\u001B[2J\u001B[H']);
});
