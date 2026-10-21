/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The acceptance smoke of Epic 8315a11f Story s3 (plan task t9): Epic c2ba6fa6
 * Story s1's code review, refused for size before the review pipeline, runs on
 * the INSTALLED daemon through its code-review RPC, completes, and records a
 * verdict. The smoke record beside S003 holds the run date, the installed daemon
 * commit, the verdict and counts, and per dimension the chunk plan and the calls
 * per stage, read from the 'review pipeline: plan' lines the daemon logs for the
 * run (the RPC returns only the record). Anything else fails the smoke, with the
 * outcome and whatever plan was logged written to the record.
 *
 * Gated: INSRC_LIVE_TESTS=1, a running installed daemon updated to the s3 build.
 * Real model calls through the daemon's configured review provider.
 *
 * Run: INSRC_LIVE_TESTS=1 npx tsx --test src/workflow/review-pipeline/__tests__/smoke-c2ba6fa6-s1.live.test.ts
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, openSync, readSync, closeSync, statSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';

import { PATHS } from '../../../shared/paths.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
const REPO = process.cwd();
const EPIC = 'c2ba6fa62a148ed1';
const STORY = 's1';
/** The s3 commit that completed t8: the installed build must contain it. */
const T8 = '72cb9d62';
const RECORD = join(REPO, 'docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S003/smoke-c2ba6fa6-s1.json');
const SOCKET = join(PATHS.insrc, 'daemon.sock');

/** One request over the daemon socket; streaming requests collect frames until done or error. */
function rpc(method: string, params: unknown, stream: boolean, onFrame?: (m: Record<string, unknown>) => void): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const sock = connect(SOCKET);
		let buf = '';
		sock.on('connect', () => sock.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params, ...(stream ? { stream: true } : {}) }) + '\n'));
		sock.on('data', d => {
			buf += d;
			for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
				const line = buf.slice(0, i); buf = buf.slice(i + 1);
				let m: Record<string, unknown>;
				try { m = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
				onFrame?.(m);
				if (!stream || m['stream'] === 'done' || m['stream'] === 'error' || m['error'] !== undefined) { sock.end(); resolve(m); return; }
			}
		});
		sock.on('error', reject);
	});
}

/** The daemon log from `offset` on, colours stripped. */
function logSince(offset: number): string {
	const file = PATHS.daemonLog;
	const size = statSync(file).size;
	if (size <= offset) return '';
	const fd = openSync(file, 'r');
	try {
		const buf = Buffer.alloc(size - offset);
		readSync(fd, buf, 0, buf.length, offset);
		return buf.toString('utf8').replace(/\u001b\[[0-9;]*m/g, '');
	} finally { closeSync(fd); }
}

interface PlanLine { phase: 'prepared' | 'finished'; epicHash: string; storyId: string; dimension: string; reviewId: string; single: boolean; limitChars: number; chunks: { id: string; atoms: number; chars: number }[]; pipelineCalls?: Record<string, number> | null }

/** The run's plan lines for this Story, by dimension. */
function plansFrom(log: string): Record<string, { prepared?: PlanLine; finished?: PlanLine }> {
	const out: Record<string, { prepared?: PlanLine; finished?: PlanLine }> = {};
	for (const m of log.matchAll(/review pipeline: plan (\{.*\})\s*$/gm)) {
		const p = JSON.parse(m[1]!) as PlanLine;
		if (p.epicHash !== EPIC || p.storyId !== STORY) continue;
		(out[p.dimension] ??= {})[p.phase] = p;
	}
	return out;
}

test("Epic c2ba6fa6 Story s1's code review completes on the installed daemon, records a verdict, and writes the chunk plan and calls per stage to the smoke record", { skip: !GATE ? 'INSRC_LIVE_TESTS is not 1' : !existsSync(SOCKET) ? 'no daemon socket' : false, timeout: 8 * 60 * 60_000 }, async () => {
	// The installed daemon runs a build that contains t1-t8.
	const status = await rpc('daemon.status', {}, false);
	const installedCommit = (status['result'] as { installedCommit?: string } | undefined)?.installedCommit ?? '';
	assert.ok(installedCommit.length > 0, 'the daemon reports its installed commit');
	execFileSync('git', ['merge-base', '--is-ancestor', T8, installedCommit], { cwd: REPO });

	const runDate = new Date().toISOString();
	const offset = existsSync(PATHS.daemonLog) ? statSync(PATHS.daemonLog).size : 0;
	const progress: string[] = [];
	const end = await rpc('codeReview.run', { epicHash: EPIC, storyId: STORY, repo: REPO }, true, m => {
		if (m['stream'] === 'progress') progress.push(String((m['data'] as { stageLabel?: string } | undefined)?.stageLabel ?? ''));
	});
	const plans = plansFrom(logSince(offset));
	const done = end['stream'] === 'done';
	const artifact = done ? (end['data'] as { runId: string; artifact: { body: { verdict: string; counts: Record<string, number>; dimensions: { dimension: string; findings: unknown[]; pipelineCalls?: Record<string, number> }[] } } }) : undefined;
	const dimensions = Object.fromEntries((artifact?.artifact.body.dimensions ?? []).map(d => [d.dimension, {
		findings: d.findings.length,
		pipelineCalls: d.pipelineCalls ?? null,
		plan: plans[d.dimension]?.finished ?? plans[d.dimension]?.prepared ?? null,
	}]));
	// Dimensions that logged a plan but have no result (a failed run) are recorded too.
	for (const [dim, p] of Object.entries(plans)) dimensions[dim] ??= { findings: 0, pipelineCalls: null, plan: p.finished ?? p.prepared ?? null };
	const record = {
		epic: EPIC, story: STORY, runDate, daemonCommit: installedCommit,
		outcome: done ? 'completed' : 'failed',
		...(done ? { runId: artifact!.runId, verdict: artifact!.artifact.body.verdict, counts: artifact!.artifact.body.counts } : { error: (end['data'] as { error?: string } | undefined)?.error ?? JSON.stringify(end).slice(0, 2_000) }),
		dimensions: Object.fromEntries(Object.entries(dimensions).map(([dim, d]) => [dim, {
			findings: d.findings,
			single: d.plan?.single ?? null,
			limitChars: d.plan?.limitChars ?? null,
			chunkCount: d.plan?.chunks.length ?? null,
			charsPerChunk: d.plan?.chunks.map(c => c.chars) ?? null,
			atomsPerChunk: d.plan?.chunks.map(c => c.atoms) ?? null,
			callsPerStage: d.pipelineCalls ?? d.plan?.pipelineCalls ?? null,
		}])),
		progressFrames: progress.length,
	};
	writeFileSync(RECORD, JSON.stringify(record, null, 2) + '\n');

	assert.ok(done, `the review completed: ${JSON.stringify(record).slice(0, 1_500)}`);
	assert.ok(['pass', 'warn', 'block'].includes(record.verdict!), `a verdict was recorded: ${record.verdict}`);
	// Every model dimension that ran left its plan; a divided one its calls per stage.
	for (const dim of ['adherence', 'conventions', 'coverage', 'quality']) {
		const d = record.dimensions[dim];
		assert.ok(d !== undefined && d.chunkCount !== null && d.single !== null, `${dim}: its plan is recorded`);
		if (d.single === false) assert.ok(d.callsPerStage !== null, `${dim}: divided, with calls per stage`);
	}
	assert.ok(Object.values(record.dimensions).some(d => d.single === false), 'the review that was refused for size is divided now');
});
