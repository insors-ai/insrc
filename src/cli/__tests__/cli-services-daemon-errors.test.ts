/**
 * The terminal's approve against a daemon that is not there, that is older than the client, or that goes away mid-call (Story s10): a clear
 * error, no local fallback, and no publication. A socket closed during the follow-ons leaves the approval recorded; the daemon finishes the pipeline.
 * Run: npx tsx --test-force-exit src/cli/__tests__/cli-services-daemon-errors.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { join } from 'node:path';

import { IpcServer, directDispatch } from '../../daemon/server.js';
import { approve } from '../services/workflow.js';

const dir = mkdtempSync('/tmp/insrc-daemon-errors-');
after(() => rmSync(dir, { recursive: true, force: true }));

async function serve(handlers: Record<string, (p: unknown) => Promise<unknown>>, name: string) {
	const ipc = new IpcServer(directDispatch(handlers));
	const path = join(dir, `${name}.sock`);
	const server = createServer((s: Socket) => { (ipc as unknown as { handleConnection(s: Socket): void }).handleConnection(s); });
	await new Promise<void>(r => server.listen(path, () => r()));
	return { connect: () => createConnection(path), close: () => new Promise<void>(r => server.close(() => r())) };
}

test('cli-services-daemon-errors.test.ts: an older daemon (method-not-found) and a daemon that is not running give a clear error with no local fallback; a socket closed during the follow-ons leaves the approval recorded and the daemon finishes the pipeline', async () => {
	// not running
	await assert.rejects(approve('/r/LLD.md', true, undefined, () => createConnection(join(dir, 'absent.sock'))), /daemon is not running/);

	// an older daemon: workflow.approve exists, workflow.approvePipeline does not
	const approveCalls: unknown[] = [];
	const old = await serve({ 'workflow.approve': async (p) => { approveCalls.push(p); return { approved: [], skipped: [], codeReview: [] }; } }, 'old');
	try {
		await assert.rejects(approve('/r/LLD.md', true, undefined, old.connect), /the daemon does not support workflow\.approvePipeline .*nothing was run or changed/);
		assert.deepEqual(approveCalls, [], 'the old method was not used in its place');
	} finally { await old.close(); }

	// the daemon goes away mid-call: the client says so, and says the daemon carries on
	let received = 0;
	const dying = createServer((s: Socket) => { s.on('error', () => undefined); s.once('data', () => { received += 1; s.destroy(); }); });
	const dyingPath = join(dir, 'dying.sock');
	await new Promise<void>(r => dying.listen(dyingPath, () => r()));
	try {
		await assert.rejects(approve('/r/LLD.md', true, undefined, () => createConnection(dyingPath)), /closed the connection before replying \(closed\); the daemon carries on with workflow\.approvePipeline by itself/);
		assert.equal(received, 1, 'the request reached the daemon: the approval is its to finish');
	} finally { await new Promise<void>(r => dying.close(() => r())); }

	// a refusal (a review block) is the error of the call, as the thrown error was
	const refusing = await serve({ 'workflow.approvePipeline': async () => ({ error: 'Review blocks approval (1 HIGH · 0 MED unresolved).' }) }, 'refusing');
	try {
		await assert.rejects(approve('/r/LLD.md', true, undefined, refusing.connect), /Review blocks approval/);
	} finally { await refusing.close(); }

	// a refusal keeps the name the terminal prints it by, though it crossed the socket as text
	const named = await serve({
		'workflow.approvePipeline': async (p) => (p as { artifactPath: string }).artifactPath.includes('held')
			? { error: 'task t2: held by bob', refusal: { kind: 'team-refused', text: 'task t2: held by bob' } }
			: { error: 'Review blocks approval', refusal: { kind: 'review-blocked', text: '1 HIGH · 0 MED unresolved' } },
	}, 'named');
	try {
		await assert.rejects(approve('/r/held.md', true, undefined, named.connect), (e: unknown) => e instanceof Error && e.name === 'TeamGateRefusedError' && (e as { reason?: string }).reason === 'task t2: held by bob');
		await assert.rejects(approve('/r/blocked.md', true, undefined, named.connect), (e: unknown) => e instanceof Error && e.name === 'ReviewBlockedError' && (e as { summary?: string }).summary === '1 HIGH · 0 MED unresolved');
	} finally { await named.close(); }
});
