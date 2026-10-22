/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The GitHub adapter's signoff request (Story s7, contract tests): the capability, the pull request that is the request, and
 * the state read from it. A fake gh through the exec seam: no gh, no network.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/github-signoff.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createGithubTracker, loadTracker } from '../github-adapter.js';
import { _setTrackerExecForTests } from '../github.js';
import type { Capability, PortResult, SignoffRequestSpec } from '../port.js';

afterEach(() => { _setTrackerExecForTests(); delete process.env['INSRC_GITHUB_CONFIG']; });

const set = (...c: Capability[]): ReadonlySet<Capability> => new Set(c);

const SPEC: SignoffRequestSpec = {
	title: 'Signoff: LLD s7', body: 'Please review the LLD.',
	unit: { unit: 'story', repoPath: '/r', epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's7' },
	artifacts: [{ artifactId: 'LLD-a3f4b8c9d1e2f3a4-s7', revision: 3, path: 'docs/epics/e/S007/LLD.md' }],
	branch: 'insrc/signoff/s7', issue: 'acme/demo#40',
};

function execError(props: Record<string, unknown>): Error {
	return Object.assign(new Error('Command failed'), props);
}

/** A fake gh that answers by the command it is given. */
function fakeGh(answer: (args: readonly string[]) => string): string[][] {
	const calls: string[][] = [];
	_setTrackerExecForTests((_cmd, args) => { calls.push([...args]); return answer(args); });
	return calls;
}

const failureOf = <T>(r: PortResult<T>): { kind: string; reason: string } => {
	assert.equal(r.ok, false);
	if (r.ok) throw new Error('unreachable');
	return r;
};

test('loadTracker accepts signoff-request once declared; openSignoffRequest opens a pull request from the branch, links it from the unit issue and returns its ref and url; readSignoffState maps review decision and merge state to open, changes-requested and completed; failure kinds map to PortResult kinds', () => {
	// the capability: declared, and loadTracker accepts a need for it (and still refuses one the adapter lacks)
	const dir = mkdtempSync(join(tmpdir(), 'insrc-signoff-'));
	try {
		const config = join(dir, 'github.json');
		writeFileSync(config, JSON.stringify({ repos: { '/r': { owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_GITHUB_CONFIG'] = config;
		const calls = fakeGh(() => 'octo');
		const loaded = loadTracker('/r', set('claim', 'signoff-request'));
		assert.equal(loaded.ok, true, 'signoff-request is accepted');
		assert.deepEqual(calls[0], ['api', 'user', '-q', '.login']);
		const refused = loadTracker('/r', set('completion'));
		assert.equal(refused.ok, false, 'a capability the adapter does not declare is still refused');
		assert.match(failureOf(refused).reason, /completion/);
	} finally { rmSync(dir, { recursive: true, force: true }); }

	const tracker = createGithubTracker('acme', 'demo');
	assert.ok(tracker.capabilities.has('signoff-request'));

	// openSignoffRequest: a pull request from the branch, then one comment on the issue that links it
	const calls = fakeGh(args => {
		if (args[0] === 'pr' && args[1] === 'create') return 'Creating pull request for insrc/signoff/s7 into main in acme/demo\n\nhttps://github.com/acme/demo/pull/12\n';
		if (args[0] === 'api') return '987654';
		return '';
	});
	const opened = tracker.openSignoffRequest(SPEC);
	assert.deepEqual(opened, { ok: true, value: { ref: 'acme/demo#12', url: 'https://github.com/acme/demo/pull/12' } });
	assert.deepEqual(calls[0], ['pr', 'list', '--repo', 'acme/demo', '--head', 'insrc/signoff/s7', '--state', 'open', '--json', 'url'], 'an open pull request from the branch is looked for first');
	assert.deepEqual(calls[1], ['pr', 'create', '--repo', 'acme/demo', '--head', 'insrc/signoff/s7', '--title', 'Signoff: LLD s7', '--body', 'Please review the LLD.']);
	assert.equal(calls[2]?.[0], 'api');
	assert.match(calls[2]?.join(' ') ?? '', /repos\/acme\/demo\/issues\/40\/comments/);
	assert.match(calls[2]?.join(' ') ?? '', /Signoff requested: https:\/\/github.com\/acme\/demo\/pull\/12/);
	assert.match(calls[2]?.join(' ') ?? '', /insrc:signoff-request:acme\/demo#12/);

	// a repeat after a failed recording: the branch already has an open pull request, so it is reused and no second one is created
	const repeat = fakeGh(args => {
		if (args[1] === 'list') return JSON.stringify([{ url: 'https://github.com/acme/demo/pull/12' }]);
		if (args[1] === 'create') throw execError({ stderr: 'a pull request for branch already exists' });
		return '987654';
	});
	assert.deepEqual(tracker.openSignoffRequest(SPEC), { ok: true, value: { ref: 'acme/demo#12', url: 'https://github.com/acme/demo/pull/12' } });
	assert.equal(repeat.some(c => c[1] === 'create'), false, 'no second pull request is created');

	// a link comment that fails leaves the request standing: it is returned, never opened twice
	fakeGh(args => {
		if (args[0] === 'pr') return args[1] === 'list' ? '[]' : 'https://github.com/acme/demo/pull/13';
		throw execError({ stderr: 'HTTP 403: Resource not accessible' });
	});
	assert.deepEqual(tracker.openSignoffRequest(SPEC), { ok: true, value: { ref: 'acme/demo#13', url: 'https://github.com/acme/demo/pull/13' } });

	// a request needs a branch and a well-formed issue, and gh must print the pull request url
	let ran = 0;
	fakeGh(() => { ran += 1; return ''; });
	assert.match(failureOf(tracker.openSignoffRequest({ ...SPEC, branch: ' ' })).reason, /needs the branch/);
	assert.match(failureOf(tracker.openSignoffRequest({ ...SPEC, issue: 'not-a-ref' })).reason, /malformed issue reference/);
	assert.equal(ran, 0, 'no gh command runs for a malformed request');
	fakeGh(() => 'done');
	assert.match(failureOf(tracker.openSignoffRequest(SPEC)).reason, /did not print the pull request url/);

	// readSignoffState: merged is completed; closed without a merge or changes requested is changes-requested; anything else is open
	const state = (json: object): PortResult<'open' | 'changes-requested' | 'completed'> => {
		const seen = fakeGh(() => JSON.stringify(json));
		const r = tracker.readSignoffState({ ref: 'acme/demo#12' });
		assert.deepEqual(seen[0], ['pr', 'view', '12', '--repo', 'acme/demo', '--json', 'state,mergedAt,reviewDecision']);
		return r;
	};
	assert.deepEqual(state({ state: 'MERGED', mergedAt: '2026-10-22T10:00:00Z', reviewDecision: 'APPROVED' }), { ok: true, value: 'completed' });
	assert.deepEqual(state({ state: 'OPEN', mergedAt: null, reviewDecision: 'CHANGES_REQUESTED' }), { ok: true, value: 'changes-requested' });
	assert.deepEqual(state({ state: 'CLOSED', mergedAt: null, reviewDecision: '' }), { ok: true, value: 'changes-requested' });
	assert.deepEqual(state({ state: 'OPEN', mergedAt: null, reviewDecision: 'APPROVED' }), { ok: true, value: 'open' }, 'approved but not merged is still open');
	assert.deepEqual(state({ state: 'OPEN', mergedAt: null, reviewDecision: 'REVIEW_REQUIRED' }), { ok: true, value: 'open' });
	assert.deepEqual(state({ state: 'OPEN', mergedAt: null, reviewDecision: null }), { ok: true, value: 'open' });

	// a malformed ref and unreadable output are rejected without or after one command
	assert.match(failureOf(tracker.readSignoffState({ ref: 'nope' })).reason, /malformed signoff request reference/);
	fakeGh(() => 'not json');
	assert.match(failureOf(tracker.readSignoffState({ ref: 'acme/demo#12' })).reason, /unexpected pull request JSON/);

	// failure kinds map to the port's kinds, for both methods
	const kinds: Array<[Error, string]> = [
		[execError({ code: 'ENOENT' }), 'missing-tool'],
		[execError({ stderr: 'gh auth login required' }), 'missing-signin'],
		[execError({ code: 'ETIMEDOUT' }), 'unreachable'],
		[execError({ stderr: 'HTTP 422: Validation Failed' }), 'rejected'],
	];
	for (const [err, kind] of kinds) {
		_setTrackerExecForTests(() => { throw err; });
		assert.equal(failureOf(tracker.openSignoffRequest(SPEC)).kind, kind, `open: ${kind}`);
		assert.equal(failureOf(tracker.readSignoffState({ ref: 'acme/demo#12' })).kind, kind, `read: ${kind}`);
	}
});
