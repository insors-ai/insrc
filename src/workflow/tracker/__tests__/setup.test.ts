/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the tracker-setup engine — driven entirely against a
 * fake `gh`/`git` via `_setTrackerExecForTests`, with the github config
 * redirected off the real `~/.insrc/github.json` through
 * `INSRC_GITHUB_CONFIG`.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/setup.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _setTrackerExecForTests } from '../github.js';
import { runTrackerSetup } from '../setup.js';

const REPO = '/fake/repo/path';
const SCOPE_REFRESH = 'gh auth refresh -h github.com -s admin:org,project,read:project';

// ---------------------------------------------------------------------------
// A configurable fake `gh` + `git`, keyed on the joined argv.
// ---------------------------------------------------------------------------

interface FakeOpts {
	readonly authOk?:        boolean;    // default true
	readonly scopes?:        readonly string[];  // default all present
	readonly scopesFail?:    boolean;    // `gh api -i /user` throws
	readonly existingTypes?: readonly string[];  // GraphQL issueTypes nodes
}

function fakeGh(o: FakeOpts = {}) {
	const authOk = o.authOk ?? true;
	const scopes = o.scopes ?? ['repo', 'admin:org', 'project'];
	const existingTypes = o.existingTypes ?? ['Epic', 'Story'];
	const calls: string[][] = [];
	const fn = ((cmd: string, args: readonly string[]) => {
		calls.push([cmd, ...args]);
		const a = args.join(' ');
		if (cmd === 'git') {
			if (a.includes('remote get-url origin')) return 'git@github.com:acme/demo.git';
			return '';
		}
		// cmd === 'gh'
		if (a === 'auth status') { if (!authOk) throw new Error('gh not authenticated'); return ''; }
		if (a === 'api -i /user') {
			if (o.scopesFail === true) throw new Error('api failed');
			return `HTTP/2.0 200 OK\r\nX-Oauth-Scopes: ${scopes.join(', ')}\r\nContent-Type: application/json\r\n\r\n{"login":"acme"}`;
		}
		if (a.startsWith('api graphql')) {
			return JSON.stringify({ data: { organization: { issueTypes: { nodes: existingTypes.map(name => ({ name })) } } } });
		}
		if (a.startsWith('label create')) return '';
		if (a.includes('/orgs/acme/issue-types')) return '';
		if (a.startsWith('project create')) return JSON.stringify({ number: 7, url: 'https://github.com/orgs/acme/projects/7' });
		if (a.startsWith('project field-create')) return '';
		if (a.startsWith('issue list')) return 'https://github.com/acme/demo/issues/1\nhttps://github.com/acme/demo/issues/2';
		if (a.startsWith('project item-add')) return '';
		return '';
	}) as unknown as Parameters<typeof _setTrackerExecForTests>[0];
	return { fn, calls };
}

/** Fresh temp dir + INSRC_GITHUB_CONFIG pointing at a github.json inside it. */
function withCfg(seed?: unknown): { cfgPath: string; dir: string } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-setup-'));
	const cfgPath = join(dir, 'github.json');
	if (seed !== undefined) writeFileSync(cfgPath, JSON.stringify(seed, null, 2));
	process.env['INSRC_GITHUB_CONFIG'] = cfgPath;
	return { cfgPath, dir };
}

function cleanup(dir: string): void {
	delete process.env['INSRC_GITHUB_CONFIG'];
	_setTrackerExecForTests();
	rmSync(dir, { recursive: true, force: true });
}

const stepFor = (report: { steps: readonly { key: string }[] }, key: string) =>
	report.steps.find(s => s.key === key);

// ---------------------------------------------------------------------------
// (a) all-green path — no manual steps
// ---------------------------------------------------------------------------

test('all-green: auth ok, scopes present, config exists, labels/types already, project skipped → manualRemaining 0', () => {
	const { dir } = withCfg({ repos: { [REPO]: { type: 'github', owner: 'acme', repo: 'demo', pushTasks: true, commitArtifacts: true } } });
	_setTrackerExecForTests(fakeGh().fn);
	try {
		const report = runTrackerSetup(REPO);   // includeProject defaults false
		for (const s of report.steps) {
			assert.ok(s.status === 'done' || s.status === 'already' || s.status === 'skipped',
				`step ${s.key} should be done/already/skipped, got ${s.status}`);
		}
		assert.equal(report.manualRemaining, 0);
		assert.equal(stepFor(report, 'gh-auth')?.status, 'already');
		assert.equal(stepFor(report, 'oauth-scopes')?.status, 'already');
		assert.equal(stepFor(report, 'config')?.status, 'already');
		assert.equal(stepFor(report, 'labels')?.status, 'done');
		assert.equal(stepFor(report, 'issue-types')?.status, 'already');
		assert.equal(stepFor(report, 'project')?.status, 'skipped');
		// views step is NOT emitted when no project is in scope
		assert.equal(stepFor(report, 'project-views'), undefined);
	} finally { cleanup(dir); }
});

// ---------------------------------------------------------------------------
// (b) missing-scope path — issue-types + project become manual
// ---------------------------------------------------------------------------

test('missing scopes: issue-types + project are manual carrying the refresh command', () => {
	const { dir } = withCfg({ repos: { [REPO]: { type: 'github', owner: 'acme', repo: 'demo', pushTasks: true, commitArtifacts: true } } });
	_setTrackerExecForTests(fakeGh({ scopes: ['repo'] }).fn);   // no admin:org, no project
	try {
		const report = runTrackerSetup(REPO, { includeProject: true });

		const types = stepFor(report, 'issue-types');
		assert.equal(types?.status, 'manual');
		assert.equal(types?.action, SCOPE_REFRESH);

		const project = stepFor(report, 'project');
		assert.equal(project?.status, 'manual');
		assert.equal(project?.action, SCOPE_REFRESH);

		// the scopes step itself flags the gap
		assert.equal(stepFor(report, 'oauth-scopes')?.status, 'manual');
		assert.equal(stepFor(report, 'oauth-scopes')?.action, SCOPE_REFRESH);

		// oauth-scopes + issue-types + project + views
		assert.equal(report.manualRemaining, 4);
	} finally { cleanup(dir); }
});

// ---------------------------------------------------------------------------
// (c) missing config — the step writes it
// ---------------------------------------------------------------------------

test('missing config: the config step writes github.json and reports done', () => {
	const { cfgPath, dir } = withCfg();   // no seed → file absent
	_setTrackerExecForTests(fakeGh().fn);
	try {
		assert.equal(existsSync(cfgPath), false);
		const report = runTrackerSetup(REPO);
		const cfg = stepFor(report, 'config');
		assert.equal(cfg?.status, 'done');
		assert.equal(existsSync(cfgPath), true);
		const written = JSON.parse(readFileSync(cfgPath, 'utf8')) as { repos?: Record<string, { type?: string; owner?: string; repo?: string; pushTasks?: boolean; commitArtifacts?: boolean }> };
		const entry = written.repos?.[REPO];
		assert.deepEqual(entry, { type: 'github', owner: 'acme', repo: 'demo', pushTasks: true, commitArtifacts: true });
	} finally { cleanup(dir); }
});

// ---------------------------------------------------------------------------
// (d) views step is always manual (when a project is in scope)
// ---------------------------------------------------------------------------

test('project views step is always manual with the UI click-list', () => {
	const { dir } = withCfg({ repos: { [REPO]: { type: 'github', owner: 'acme', repo: 'demo', pushTasks: true, commitArtifacts: true } } });
	_setTrackerExecForTests(fakeGh().fn);   // all scopes present
	try {
		const report = runTrackerSetup(REPO, { includeProject: true });
		const views = stepFor(report, 'project-views');
		assert.equal(views?.status, 'manual');
		assert.match(views?.detail ?? '', /type:Epic/);
		assert.match(views?.detail ?? '', /Show sub-issues/);
		// even with every scope present + the board created, views cannot be automated
		assert.equal(stepFor(report, 'project')?.status, 'done');
	} finally { cleanup(dir); }
});
