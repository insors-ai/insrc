/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * refreshTrackerStatus and syncTracker over a fake tracker port (Story s9): the fields they write, the capability check, a failed
 * read, the Deadline and the denial.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/refresh.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { artifactJsonPath, defineArtifactId } from '../../storage.js';
import { createDeadline } from '../../team/sighting-store.js';
import { refreshTrackerStatus, syncTracker } from '../sync.js';
import { ToolDenied } from '../tool-denied.js';
import type { Capability, PortResult, TrackerPort } from '../port.js';
import { seedBoundUnits } from '../../__tests__/helpers/task-heads.js';
import { installExecStandIn } from '../../__tests__/helpers/exec-stand-in.js';

const A = 'a3f4b8c9d1e2f3a4';
const B = 'b4a5c6d7e8f90123';
const CREATED = '2026-07-17T07:42:28.275Z';

const define = (repo: string, hash: string) => ({
	meta: { workflow: 'define', runId: 'd1', repoPath: repo, epicHash: hash, epicSlug: `epic-${hash.slice(0, 4)}`, createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1, tracker: { adapter: 'github', labelsCreated: ['insrc:epic'], lastSyncedAt: '2026-10-18T00:00:00.000Z' } },
	body: { flavor: 'enhancement', problem: 'p', nonGoals: [], assumptions: [], constraints: [], stories: [{ id: 's1', title: 'one', userValue: 'v', acceptanceCriteria: [] }], openQuestions: [] },
	citations: [],
});

/** A repo with the given Epics, each with its Define, its Epic issue `o/r#<n>` and a Story issue `o/r#<n+1>`. */
function seedRepo(hashes: readonly string[]): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-refresh-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	hashes.forEach((h, i) => {
		writeFileSync(artifactJsonPath(repo, defineArtifactId(h)), JSON.stringify(define(repo, h), null, 2));
		seedBoundUnits(repo, h, `o/r#${10 * (i + 1)}`, { s1: `o/r#${10 * (i + 1) + 1}` }, CREATED);
	});
	return repo;
}

const metaOf = (repo: string, hash: string): { tracker: Record<string, unknown>; [k: string]: unknown } =>
	(JSON.parse(readFileSync(artifactJsonPath(repo, defineArtifactId(hash)), 'utf8')) as { meta: { tracker: Record<string, unknown> } }).meta;

/** A port that answers each issue with its fixed state and labels after `delayMs`; the rest of the port is never used by a refresh. */
function fakePort(opts: { kind?: string; caps?: readonly Capability[]; delayMs?: number; read?: (issue: string) => PortResult<{ state: string; labels: string[] }>; who?: () => Promise<PortResult<string>> } = {}): TrackerPort {
	const read = opts.read ?? ((issue: string) => ({ ok: true, value: issue.endsWith('1') ? { state: 'open', labels: ['status:in-progress'] } : { state: 'open', labels: ['status:planned'] } } as PortResult<{ state: string; labels: string[] }>));
	const withRead = (opts.caps ?? ['status-read']).includes('status-read');
	return {
		kind: opts.kind ?? 'github',
		capabilities: new Set<Capability>(opts.caps ?? ['status-read']),
		whoAmI: opts.who ?? (async () => ({ ok: true, value: 'me' })),
		...(withRead ? { readIssueStatus: async (issue: string) => { if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs)); return read(issue); } } : {}),
	} as unknown as TrackerPort;
}

test('refreshTrackerStatus writes epicStatus, storyStatus and lastSyncedAt only', async () => {
	const repo = seedRepo([A]);
	try {
		const before = metaOf(repo, A);
		const report = await refreshTrackerStatus(repo, { epicHash: A, port: fakePort() });
		assert.equal(report.results.length, 1);
		const result = report.results[0]?.result;
		assert.equal(result?.status, 'synced');
		assert.deepEqual(report.warnings, []);
		const after = metaOf(repo, A);
		const { tracker: bt, ...beforeRest } = before;
		const { tracker: at, ...afterRest } = after;
		assert.deepEqual(afterRest, beforeRest, 'nothing but meta.tracker changes');
		assert.deepEqual(Object.keys(at).sort(), ['adapter', 'epicStatus', 'labelsCreated', 'lastSyncedAt', 'storyStatus']);
		assert.deepEqual(at['labelsCreated'], bt['labelsCreated']);
		assert.notEqual(at['lastSyncedAt'], bt['lastSyncedAt']);
		assert.deepEqual(Object.keys(at['storyStatus'] as object), ['s1']);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a port without status-read fails naming the capability and a read that fails is a failed result', async () => {
	const repo = seedRepo([A]);
	try {
		const none = await syncTracker(repo, A, undefined, { port: fakePort({ caps: ['claim'] }) });
		assert.equal(none.status, 'failed');
		assert.match(none.status === 'failed' ? none.reason : '', /status-read/);

		const bad = await syncTracker(repo, A, undefined, { port: fakePort({ read: () => ({ ok: false, kind: 'unreachable', reason: 'dial tcp: i/o timeout' }) }) });
		assert.deepEqual(bad, { status: 'failed', reason: 'dial tcp: i/o timeout' });
		assert.equal(metaOf(repo, A).tracker['epicStatus'], undefined, 'a failed read writes nothing');

		// an Epic with no bound issue is skipped, and the refresh of all Epics leaves it out
		const bare = mkdtempSync(join(tmpdir(), 'insrc-refresh-bare-'));
		try {
			mkdirSync(join(bare, '.insrc', 'artifacts'), { recursive: true });
			writeFileSync(artifactJsonPath(bare, defineArtifactId(A)), JSON.stringify(define(bare, A)));
			const named = await refreshTrackerStatus(bare, { epicHash: A, port: fakePort() });
			assert.equal(named.results[0]?.result.status, 'skipped');
			assert.deepEqual((await refreshTrackerStatus(bare, { port: fakePort() })).results, []);
		} finally { rmSync(bare, { recursive: true, force: true }); }
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a slow port hits the budget with an injected Deadline and the unread Epics and Stories are skipped with time limit reached', async () => {
	const repo = seedRepo([A, B]);
	const deadline = createDeadline(100);
	try {
		const report = await refreshTrackerStatus(repo, { deadline, port: fakePort({ delayMs: 200 }) });
		assert.equal(report.results.length, 2);
		for (const e of report.results) assert.deepEqual(e.result, { status: 'skipped', reason: 'time limit reached' }, e.epicHash);
		assert.equal(report.warnings.length, 2);
		assert.equal(metaOf(repo, A).tracker['epicStatus'], undefined, 'a refresh the budget stopped writes nothing');
	} finally { deadline.dispose(); rmSync(repo, { recursive: true, force: true }); }
});

test('a ToolDenied is rethrown and a non-GitHub fake port gets the same fields', async () => {
	const repo = seedRepo([A]);
	try {
		const denied = new ToolDenied('gh_tracker', 'declined', {});
		await assert.rejects(() => refreshTrackerStatus(repo, { epicHash: A, port: fakePort({ read: () => { throw denied; } }) }), (e: unknown) => e === denied);
		await assert.rejects(() => refreshTrackerStatus(repo, { epicHash: A, port: fakePort({ who: async () => { throw denied; } }) }), (e: unknown) => e === denied);

		const jira = await refreshTrackerStatus(repo, { epicHash: A, port: fakePort({ kind: 'jira' }) });
		assert.equal(jira.results[0]?.result.status, 'synced');
		const tracker = metaOf(repo, A).tracker;
		assert.deepEqual(Object.keys(tracker).sort(), ['adapter', 'epicStatus', 'labelsCreated', 'lastSyncedAt', 'storyStatus']);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('the default GitHub path hands the Deadline signal to gh, so a call that never answers is cancelled and the sync is skipped', async () => {
	const repo = seedRepo([A]);
	const cfg = join(repo, 'github.json');
	const prior = process.env['INSRC_GITHUB_CONFIG'];
	const deadline = createDeadline(400);
	try {
		writeFileSync(cfg, JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'o', repo: 'r' } } }));
		process.env['INSRC_GITHUB_CONFIG'] = cfg;
		installExecStandIn((_cmd, args) => (args[0] === 'api' && args[1] === 'user' ? JSON.stringify({ login: 'me' }) : new Promise<string>(() => undefined)));
		const started = Date.now();
		const result = await syncTracker(repo, A, undefined, { deadline });
		assert.deepEqual(result, { status: 'skipped', reason: 'time limit reached' });
		assert.ok(Date.now() - started < 5_000, 'returned long before the registry limit of the call');
	} finally {
		deadline.dispose(); installExecStandIn();
		if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior;
		rmSync(repo, { recursive: true, force: true });
	}
});

test('a repo whose tracker setting is none has nothing to refresh: no result, no warning and no tracker call', async () => {
	const repo = seedRepo([A]);
	const cfg = join(repo, 'github.json');
	const prior = process.env['INSRC_GITHUB_CONFIG'];
	try {
		writeFileSync(cfg, JSON.stringify({ repos: { [repo]: { type: 'none' } } }));
		process.env['INSRC_GITHUB_CONFIG'] = cfg;
		let calls = 0;
		installExecStandIn(() => { calls += 1; return ''; });
		const all = await refreshTrackerStatus(repo);
		assert.deepEqual(all, { results: [], warnings: [] });
		assert.equal(calls, 0);
		// asked for by name, the Epic's own result says why
		const named = await refreshTrackerStatus(repo, { epicHash: A });
		assert.equal(named.results[0]?.result.status, 'skipped');
	} finally {
		installExecStandIn();
		if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior;
		rmSync(repo, { recursive: true, force: true });
	}
});
