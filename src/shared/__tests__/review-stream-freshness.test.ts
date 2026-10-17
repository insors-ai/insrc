/**
 * ISSUE-1102dc71 S001/t4 — the codeReview.freshness reply, as both clients
 * (the in-process daemon client and the MCP socket stream) read it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { freshnessFromReply } from '../review-stream.js';

test('freshnessFromReply keeps inFlight and pendingCodeIndexJobs from a current reply and maps an older reply to inFlight=isProcessing, pendingCodeIndexJobs=0', () => {
	// A current daemon: the new fields survive unchanged, including queued-only work.
	assert.deepEqual(
		freshnessFromReply({ isProcessing: true, inFlight: false, pendingCodeIndexJobs: 3, staleFiles: ['src/a.ts'] }),
		{ ok: true, isProcessing: true, inFlight: false, pendingCodeIndexJobs: 3, staleFiles: ['src/a.ts'] },
	);
	assert.deepEqual(
		freshnessFromReply({ isProcessing: true, inFlight: true, pendingCodeIndexJobs: 0, staleFiles: [] }),
		{ ok: true, isProcessing: true, inFlight: true, pendingCodeIndexJobs: 0, staleFiles: [] },
	);
	// An older daemon: no new fields.
	assert.deepEqual(freshnessFromReply({ isProcessing: true, staleFiles: [] }), { ok: true, isProcessing: true, inFlight: true, pendingCodeIndexJobs: 0, staleFiles: [] });
	assert.deepEqual(freshnessFromReply({ isProcessing: false }), { ok: true, isProcessing: false, inFlight: false, pendingCodeIndexJobs: 0, staleFiles: [] });
	// Errors are unchanged.
	assert.deepEqual(freshnessFromReply({ error: 'nope' }), { ok: false, reason: 'nope' });
});
