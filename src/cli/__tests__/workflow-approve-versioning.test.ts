/**
 * Against the existing handler (which accepts workflow.approve and ignores withTracker) the terminal's approve uses only
 * workflow.approvePipeline (Story s10); a daemon without it gives method-not-found and no publication happens.
 * Run: npx tsx --test-force-exit src/cli/__tests__/workflow-approve-versioning.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { join } from 'node:path';

import { IpcServer, directDispatch } from '../../daemon/server.js';
import { approve } from '../services/workflow.js';

const dir = mkdtempSync('/tmp/insrc-approve-versioning-');
after(() => rmSync(dir, { recursive: true, force: true }));

test('workflow-approve-versioning.test.ts: against the existing handler (which accepts workflow.approve and ignores withTracker) the client uses only workflow.approvePipeline; a daemon without it gives the method-not-found error and no publication happens', async () => {
	const seen: string[] = [];
	const handlers = {
		// the older daemon: it approves and publishes by its own follow-on, whatever withTracker says
		'workflow.approve': async () => { seen.push('workflow.approve'); return { approved: [], skipped: [], codeReview: [], followOn: [{ kind: 'tracker-push', ok: true }] }; },
	};
	const ipc = new IpcServer(directDispatch(handlers));
	const path = join(dir, 'd.sock');
	const server = createServer((s: Socket) => { (ipc as unknown as { handleConnection(s: Socket): void }).handleConnection(s); });
	await new Promise<void>(r => server.listen(path, () => r()));
	try {
		for (const withTracker of [true, false]) {
			await assert.rejects(approve('/r/LLD.md', withTracker, undefined, () => createConnection(path)), /does not support workflow\.approvePipeline/);
		}
		assert.deepEqual(seen, [], 'workflow.approve was never called: nothing was published or approved by the older method');
	} finally { await new Promise<void>(r => server.close(() => r())); }
});
