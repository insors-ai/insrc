/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the tracker port types, the capability check and the strict
 * target resolver.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/port.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { missingCapabilities, type Capability, type CreatedIssue, type IssueOps, type IssueRef, type PortResult, type TrackerPort } from '../port.js';
import { resolveStrictTrackerTarget } from '../../config/github.js';

const set = (...c: Capability[]): ReadonlySet<Capability> => new Set(c);

function withConfig<T>(content: string | object, fn: (configPath: string, dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-strict-'));
	try {
		const p = join(dir, 'github.json');
		writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
		return fn(p, dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function refusal(r: PortResult<unknown>): string {
	assert.equal(r.ok, false);
	if (r.ok) throw new Error('unreachable');
	assert.equal(r.kind, 'rejected');
	return r.reason;
}

test('missingCapabilities names every capability the tracker does not declare', () => {
	assert.deepEqual(missingCapabilities(set('claim', 'issue-create'), set('claim', 'issue-create')), []);
	assert.deepEqual(missingCapabilities(set('claim', 'issue-create'), set('claim', 'signoff-request', 'completion')), ['signoff-request', 'completion']);
	assert.deepEqual(missingCapabilities(set(), set('claim', 'issue-create', 'signoff-request', 'completion')), ['claim', 'issue-create', 'signoff-request', 'completion']);
	assert.deepEqual(missingCapabilities(set('claim'), set()), []);
});

test('strict resolver refuses malformed or unsupported configuration', () => {
	const repo = '/r';
	assert.match(refusal(resolveStrictTrackerTarget(repo, '/does/not/exist.json')), /does not exist/);
	assert.match(refusal(withConfig('{ not json', p => resolveStrictTrackerTarget(repo, p))), /not valid JSON/);
	assert.match(refusal(withConfig('[]', p => resolveStrictTrackerTarget(repo, p))), /JSON object/);
	assert.match(refusal(withConfig('"x"', p => resolveStrictTrackerTarget(repo, p))), /JSON object/);
	assert.match(refusal(withConfig({ repos: { [repo]: 'github' } }, p => resolveStrictTrackerTarget(repo, p))), /must be a JSON object/);
	assert.match(refusal(withConfig({ repos: { [repo]: { type: 'gitlab', owner: 'a', repo: 'b' } } }, p => resolveStrictTrackerTarget(repo, p))), /unsupported tracker type 'gitlab'/);
	assert.match(refusal(withConfig({ repos: { [repo]: { type: 'none' } } }, p => resolveStrictTrackerTarget(repo, p))), /type none/);
	assert.match(refusal(withConfig({ repos: { [repo]: { owner: 'bad owner', repo: 'b' } } }, p => resolveStrictTrackerTarget(repo, p))), /invalid GitHub owner/);
	assert.match(refusal(withConfig({ repos: { [repo]: { owner: 'a', repo: 'b/c' } } }, p => resolveStrictTrackerTarget(repo, p))), /invalid GitHub repo/);
	assert.match(refusal(withConfig({ repos: { [repo]: { owner: 5, repo: 'b' } } }, p => resolveStrictTrackerTarget(repo, p))), /invalid GitHub owner/);
	assert.match(refusal(withConfig({ default: { type: 'none' } }, p => resolveStrictTrackerTarget(repo, p))), /type none/);
	assert.match(refusal(withConfig({}, p => resolveStrictTrackerTarget(repo, p))), /no tracker is configured/);
	// type github with no target and no origin remote
	const noRemote = mkdtempSync(join(tmpdir(), 'insrc-noremote-'));
	try {
		execFileSync('git', ['init'], { cwd: noRemote, stdio: 'ignore' });
		assert.match(refusal(withConfig({ repos: { [noRemote]: { type: 'github' } } }, p => resolveStrictTrackerTarget(noRemote, p))), /origin remote/);
	} finally {
		rmSync(noRemote, { recursive: true, force: true });
	}
});

test('strict resolver accepts an own entry without a type and falls back to the origin remote for type github', () => {
	const own = withConfig({ repos: { '/r': { owner: 'acme', repo: 'demo.app' } } }, p => resolveStrictTrackerTarget('/r', p));
	assert.deepEqual(own, { ok: true, value: { owner: 'acme', repo: 'demo.app' } });

	const repo = mkdtempSync(join(tmpdir(), 'insrc-origin-'));
	try {
		execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
		execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/from-remote.git'], { cwd: repo, stdio: 'ignore' });
		const viaOwn = withConfig({ repos: { [repo]: { type: 'github' } } }, p => resolveStrictTrackerTarget(repo, p));
		assert.deepEqual(viaOwn, { ok: true, value: { owner: 'acme', repo: 'from-remote' } });
		const viaDefault = withConfig({ default: { type: 'github' } }, p => resolveStrictTrackerTarget(repo, p));
		assert.deepEqual(viaDefault, { ok: true, value: { owner: 'acme', repo: 'from-remote' } });
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("strict resolver never takes a target from the default entry's owner and repo", () => {
	// A default with owner/repo but no type enables nothing.
	assert.match(refusal(withConfig({ default: { owner: 'global', repo: 'dump' } }, p => resolveStrictTrackerTarget('/r', p))), /no tracker is configured/);
	// A github default supplies enablement only: the target is the origin remote, never its owner/repo.
	const repo = mkdtempSync(join(tmpdir(), 'insrc-default-'));
	try {
		execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
		execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:real/own.git'], { cwd: repo, stdio: 'ignore' });
		const r = withConfig({ default: { type: 'github', owner: 'global', repo: 'dump' } }, p => resolveStrictTrackerTarget(repo, p));
		assert.deepEqual(r, { ok: true, value: { owner: 'real', repo: 'own' } });
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('TrackerPort type exposes issueOps with the AMD-8 signatures', () => {
	// Compile-time pin: this only typechecks if the signatures match AMD-8.
	const ref: IssueRef = 'o/r#1';
	const created: CreatedIssue = { ref, id: 1, typed: true };
	const ok = <T>(value: T): PortResult<T> => ({ ok: true, value });
	const ops: IssueOps = {
		create: spec => { const labels: readonly string[] = spec.labels; void labels; return ok(created); },
		linkSubIssue: (parent: IssueRef, childId: number) => { void parent; void childId; return ok(undefined); },
		close: () => ok(undefined),
		comment: (_i, body: string) => { void body; return ok(undefined); },
		readBody: () => ok(''),
		writeBody: (_i, body: string) => { void body; return ok(undefined); },
		ensureLabel: (name: string): boolean => name.length > 0,
		ensureMilestone: (title: string): void => { void title; },
		attachMilestone: (_i, title: string) => { void title; return ok(undefined); },
	};
	const port: Pick<TrackerPort, 'issueOps'> = { issueOps: ops };
	const r = port.issueOps.linkSubIssue(ref, 42);
	assert.equal(r.ok, true);
	assert.equal(port.issueOps.ensureLabel('x'), true);
	assert.equal(port.issueOps.create({ title: 't', body: 'b', labels: ['a'] }).ok, true);
});
