/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The review stream's failure type lives in src/shared/review-stream.ts
 * (Epic c2ba6fa6, Story s11, t1) and the MCP socket client re-exports it, so
 * an error thrown by either client is recognised by the same class.
 *
 * Run: npx tsx --test src/shared/__tests__/review-stream.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ReviewStreamError } from '../review-stream.js';
import * as daemonStream from '../../mcp/daemon-stream.js';

test('review stream module: ReviewStreamError from src/shared/review-stream.ts is the same class daemon-stream.ts exports, and the routing tests pass unchanged', () => {
	assert.equal(daemonStream.ReviewStreamError, ReviewStreamError, 'one class, re-exported');
	const e = new daemonStream.ReviewStreamError('daemon-error', 'boom', 'diff-unavailable');
	assert.ok(e instanceof ReviewStreamError);
	assert.equal(e.name, 'ReviewStreamError');
	assert.equal(e.failure, 'daemon-error');
	assert.equal(e.reason, 'diff-unavailable');
	assert.equal(e.message, 'boom');
});
