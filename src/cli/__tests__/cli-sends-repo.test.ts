/**
 * Story 64703b708590bd68/s1, task t3: the terminal client tells the daemon the repo and the absolute path of every file-modifying call.
 * Run: npx tsx --test-force-exit src/cli/__tests__/cli-sends-repo.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { approve, resolveFinding, sync, trackerSetup } from '../services/workflow.js';

const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function recordingDaemon(): { path: string; server: Server; seen: Array<{ method: string; params: Record<string, unknown> }>; close: () => Promise<void> } {
	const path = join(tmpdir(), `insrc-cli-${process.pid}-${Math.random().toString(36).slice(2, 8)}.sock`);
	const seen: Array<{ method: string; params: Record<string, unknown> }> = [];
	const server = createServer((socket: Socket) => {
		let buffer = '';
		socket.on('data', chunk => {
			buffer += chunk.toString();
			const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.trim()) continue;
				const req = JSON.parse(line) as { id: number; method: string; params: Record<string, unknown> };
				seen.push({ method: req.method, params: req.params });
				// the pipeline reply with an approval and no follow-on; the other methods answer an empty object
				socket.write(JSON.stringify({ id: req.id, result: req.method === 'workflow.approvePipeline' ? { approval: { approved: [], skipped: [] }, entries: [] } : { status: 'skipped', reason: 'test' } }) + '\n');
			}
		});
		socket.on('error', () => { /* client vanished */ });
	});
	return { path, server, seen, close: () => new Promise<void>(res => { server.close(() => { try { rmSync(path); } catch { /* ignore */ } res(); }); }) };
}
const listen = (server: Server, path: string): Promise<void> => new Promise(res => server.listen(path, () => res()));

test("cli-sends-repo.test.ts: the terminal client's approve, tracker sync and attach calls send repo", async () => {
	const repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-cli-repo-'))); dirs.push(repo);
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	writeFileSync(join(repo, '.insrc', 'artifacts', 'LLD-a-s1.json'), '{}');
	const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-cli-cwd-'))); dirs.push(elsewhere);
	const daemon = recordingDaemon();
	await listen(daemon.server, daemon.path);
	const connect = (): Socket => createConnection(daemon.path);
	const saved = process.cwd();
	try {
		// a relative path typed in the repo's own folder is made absolute here, and the repo that holds it is named
		process.chdir(repo);
		await approve('.insrc/artifacts/LLD-a-s1.json', true, undefined, connect).catch(() => undefined);
		await resolveFinding('.insrc/artifacts/LLD-a-s1.json', 'f1', 'accept', undefined, connect).catch(() => undefined);
		process.chdir(elsewhere);
		// the tracker calls take a repoPath; a relative one is made absolute against this process, never the daemon
		await sync('../' + repo.split('/').pop()!, 'deadbeefdeadbeef', connect).catch(() => undefined);
		await trackerSetup(repo, {}, { connect }).catch(() => undefined);
	} finally { process.chdir(saved); await daemon.close(); }

	const by = (m: string) => daemon.seen.find(s => s.method === m)!.params;
	assert.equal(by('workflow.approvePipeline')['repo'], repo);
	assert.equal(by('workflow.approvePipeline')['artifactPath'], join(repo, '.insrc', 'artifacts', 'LLD-a-s1.json'));
	assert.equal(by('workflow.resolveFinding')['repoPath'], repo);
	assert.equal(by('workflow.resolveFinding')['artifactPath'], join(repo, '.insrc', 'artifacts', 'LLD-a-s1.json'));
	assert.equal(by('tracker.sync')['repoPath'], repo, 'a relative repoPath is absolute when it leaves this process');
	assert.equal(by('tracker.setup')['repoPath'], repo);
	// an artifact that no repository holds is refused here, before any call
	await assert.rejects(approve(join(elsewhere, 'nowhere.json'), true, undefined, connect), /no repository holds/);
});
