/**
 * The terminal's approve, sync, tracker setup, review, finding resolution and team services (Story s10) call only `rpc` with the named daemon
 * methods and parameters, and their modules import no child_process, tracker or git code.
 * Run: npx tsx --test-force-exit src/cli/__tests__/cli-services-no-spawn.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { IpcServer, directDispatch } from '../../daemon/server.js';
import { approve, reviewArtifact, resolveFinding, sync, trackerSetup } from '../services/workflow.js';
import { teamClaim, teamRefresh, teamRelease } from '../services/team.js';

const dir = mkdtempSync('/tmp/insrc-nospawn-');
after(() => rmSync(dir, { recursive: true, force: true }));
/** A real repository folder: the client names the repo that holds an artifact, so the path must be under one. */
const REPO = join(dir, 'repo');
mkdirSync(join(REPO, '.insrc', 'artifacts'), { recursive: true });
const LLD = join(REPO, 'docs', 'LLD.md');

/** A daemon that records each call (method and params) and answers `answers[method]`. */
async function recordingDaemon(answers: Record<string, unknown>): Promise<{ connect: () => Socket; calls: Array<{ method: string; params: unknown }>; close: () => Promise<void> }> {
	const calls: Array<{ method: string; params: unknown }> = [];
	const handlers: Record<string, (p: unknown) => Promise<unknown>> = {};
	for (const [method, answer] of Object.entries(answers)) handlers[method] = async (p) => { calls.push({ method, params: p }); return answer; };
	const ipc = new IpcServer(directDispatch(handlers));
	const path = join(dir, `${Math.random().toString(36).slice(2)}.sock`);
	const server = createServer((s: Socket) => { (ipc as unknown as { handleConnection(s: Socket): void }).handleConnection(s); });
	await new Promise<void>(r => server.listen(path, () => r()));
	return { connect: () => createConnection(path), calls, close: () => new Promise<void>(r => server.close(() => r())) };
}

const APPROVAL = { workflow: 'design.story', path: '/repo/.insrc/artifacts/LLD-x.json', approvedAt: '2026-10-28T00:00:00.000Z' };

test('cli-services-no-spawn.test.ts: approve, sync, trackerSetup and the team services call only rpc with the named daemon methods and parameters and import no child_process or tracker or git code', async () => {
	const d = await recordingDaemon({
		'workflow.approvePipeline': { approval: APPROVAL, followOn: [], codeReview: [] },
		'tracker.sync': { status: 'skipped', reason: 'Epic not pushed yet' },
		'tracker.setup': { steps: [], manualRemaining: 0 },
		'team.refresh': '✓ fetched main @ abc1234 — team policy applied',
		'team.claim': '✓ claimed story h/s1', 'team.release': '✓ released story h/s1',
		'workflow.reviewArtifact': { report: { verdict: 'pass' }, applied: [], pendingUser: [] },
		'workflow.resolveFinding': { findingId: 'f1', status: 'resolved', effectiveVerdict: 'pass', remainingBlocking: 0 },
	});
	try {
		const unit = { unit: 'story' as const, epicHash: '0123456789abcdef', storyId: 's1' };
		await approve(LLD, false, 'because', d.connect);
		await approve(LLD, true, undefined, d.connect);
		await sync(REPO, '0123456789abcdef', d.connect);
		await trackerSetup(REPO, { includeProject: true }, { connect: d.connect });
		await teamRefresh(REPO, 'main', d.connect);
		await teamClaim(REPO, unit, d.connect);
		await teamRelease(REPO, unit, d.connect);
		await reviewArtifact(REPO, LLD, d.connect);
		await resolveFinding(LLD, 'f1', 'accept', 'fine', d.connect);
		assert.deepEqual(d.calls, [
			{ method: 'workflow.approvePipeline', params: { repo: REPO, artifactPath: LLD, withTracker: false, overrideReview: 'because' } },
			{ method: 'workflow.approvePipeline', params: { repo: REPO, artifactPath: LLD, withTracker: true } },
			{ method: 'tracker.sync', params: { repoPath: REPO, epicHash: '0123456789abcdef' } },
			{ method: 'tracker.setup', params: { repoPath: REPO, opts: { includeProject: true } } },
			{ method: 'team.refresh', params: { repoPath: REPO, branch: 'main' } },
			{ method: 'team.claim', params: { repoPath: REPO, unit } },
			{ method: 'team.release', params: { repoPath: REPO, unit } },
			{ method: 'workflow.reviewArtifact', params: { repoPath: REPO, artifactPath: LLD } },
			{ method: 'workflow.resolveFinding', params: { repoPath: REPO, artifactPath: LLD, findingId: 'f1', action: 'accept', note: 'fine' } },
		]);
	} finally { await d.close(); }

	// the service modules import no child_process, and no tracker, git or pipeline code except as types
	const root = fileURLToPath(new URL('../services/', import.meta.url));
	for (const file of ['workflow.ts', 'team.ts']) {
		const imports = [...readFileSync(join(root, file), 'utf8').matchAll(/^import (type )?[^;]*?from '([^']+)';/gms)].map(m => ({ typeOnly: m[1] !== undefined, from: m[2]! }));
		assert.ok(!imports.some(i => /child_process/.test(i.from)), `${file} imports child_process`);
		const code = imports.filter(i => !i.typeOnly && /(workflow\/tracker\/|tracker-auto|commit-and-push|daemon\/(approve-pipeline|tasks-sync)|team\/gate|team\/policy-refresh|config\/github)/.test(i.from));
		assert.deepEqual(code, [], `${file} imports tracker, git or pipeline code`);
	}
});
