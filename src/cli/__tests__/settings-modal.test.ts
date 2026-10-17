/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E20261016315d510c:S003 / t7 — terminal Services members and the repo
 * tracker-settings modal. The modal is rendered through the real App with the
 * real makeServices() facade whose daemon-facing members are replaced by fakes.
 *
 * Run: npx tsx --test src/cli/__tests__/settings-modal.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { render } from 'ink-testing-library';

import { App } from '../app.js';
import { makeServices } from '../services/index.js';
import type { Services } from '../services/index.js';
import { buildSettingsRows } from '../../config/repo-settings-rows.js';
import { REPO_TRACKER_FIELDS } from '../../config/repo-fields.js';
import { buildSettingsCatalog } from '../../config/settings-catalog.js';
import type { RepoSettingsPayload, SettingsResult } from '../../daemon/repo-settings.js';
import type { DaemonStatus } from '../../shared/types.js';

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 40));
const REPO = '/work/repoA';

const PAYLOAD: RepoSettingsPayload = {
	repo: REPO,
	values: { type: 'github', owner: 'acme', repo: 'widgets', ghHost: 'ghe.example.com' },
	resolved: { type: 'github', owner: 'acme', repo: 'widgets', source: 'per-repo-config' },
	signin: { state: 'signed-in', login: 'octocat' },
	policy: {
		ok: true, mode: 'team',
		values: {
			teamMode: true, signoffStages: ['DEF', 'HLD'], claimsEnforced: true, administrators: ['ada'],
			claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true,
		},
		source: { ref: 'origin/main', fetchedAt: '2026-10-17T00:00:00.000Z' },
	},
};

function status(): DaemonStatus {
	return { uptime: 1, repos: [{ path: REPO, name: 'repoA', addedAt: '', status: 'ready' }], queueDepth: 0, embeddingsPending: 0, installedCommit: '' };
}

interface Fixture {
	readonly svc: Services;
	readonly sets: Array<{ repo: string; key: string; value: string | boolean | null }>;
	next: SettingsResult | null;
}

function fixture(initial: SettingsResult = { ok: true, payload: PAYLOAD }): Fixture {
	const svc = makeServices();
	const f: Fixture = { svc, sets: [], next: null };
	svc.daemon.isRunning = () => true;
	svc.daemon.getStatus = async () => status();
	svc.config.catalog = async () => buildSettingsCatalog({});
	svc.config.repoSettings = async () => initial;
	svc.config.setRepoSetting = async (repo, key, value) => {
		f.sets.push({ repo, key, value });
		return f.next ?? { ok: true, payload: { ...PAYLOAD, values: { ...PAYLOAD.values, ...(value === null ? {} : { [key]: value }) } } };
	};
	return f;
}

async function openModal(f: Fixture) {
	const r = render(createElement(App, { services: f.svc, pollMs: 0 }));
	await settle();
	r.stdin.write('2'); await settle();   // → Repos pane
	r.stdin.write('s'); await settle();   // → settings modal for the selected repo
	return r;
}

const HERE = fileURLToPath(new URL('.', import.meta.url));
const CONFIG_MEMBERS = /catalog|repoSettings|setRepoSetting|Services\['config'\]/;

/**
 * Type-checks `files` with the project's compiler options and returns the diagnostic lines. The project tsconfig
 * excludes __tests__, so the test fixtures are not covered by the normal typecheck; this runs tsc over them
 * explicitly.
 */
function typecheck(files: readonly string[]): string[] {
	const cfg = `${HERE}tsconfig.fixtures.${process.pid}.json`;
	writeFileSync(cfg, JSON.stringify({
		extends: '../../../tsconfig.json',
		compilerOptions: { noEmit: true, rootDir: '../../..', declaration: false, declarationMap: false, sourceMap: false },
		include: [], exclude: [], files,
	}));
	try {
		execFileSync('npx', ['tsc', '-p', cfg], { cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
		return [];
	} catch (e) {
		const out = (e as { stdout?: string }).stdout ?? '';
		return out.split('\n').filter(l => /error TS\d+/.test(l));
	} finally { rmSync(cfg, { force: true }); }
}

test('makeServices exposes catalog, repoSettings and setRepoSetting and the fixtures satisfy Services', { timeout: 120_000 }, () => {
	const svc = makeServices();
	for (const member of ['catalog', 'repoSettings', 'setRepoSetting'] as const) {
		assert.equal(typeof svc.config[member], 'function', `config.${member}`);
	}
	assert.equal(typeof svc.config.show, 'function');
	assert.equal(typeof svc.config.write, 'function');
	assert.equal(typeof svc.config.reload, 'function');

	// The members are backed by the daemon methods (a source check; calling them would need a daemon).
	const source = readFileSync(new URL('../services/config.ts', import.meta.url), 'utf8');
	assert.match(source, /rpc<SettingsCatalogPayload>\('config\.catalog'\)/);
	assert.match(source, /rpc<SettingsResult>\('repo\.settings\.get', \{ repo \}\)/);
	assert.match(source, /rpc<SettingsResult>\('repo\.settings\.set', \{ repo, key, value \}\)/);

	// One tsc run over the two literal fixtures (command, tui) and a probe that lacks the members. The fixtures
	// must type-check against the whole Services interface with no diagnostic at all (services and team-service
	// build their Services from makeServices, covered above); the probe proves the check flags a missing member.
	const probeName = `zz-config-probe.${process.pid}.ts`;
	const probe = `${HERE}${probeName}`;
	writeFileSync(probe, "import type { Services } from '../services/index.js';\nexport const config: Services['config'] = { show: async () => ({}), write: async () => ({ ok: true }), reload: async () => ({ ok: true }) };\n");
	let diagnostics: string[];
	try { diagnostics = typecheck(['./command.test.ts', './tui.test.ts', `./${probeName}`]); } finally { rmSync(probe, { force: true }); }
	assert.deepEqual(diagnostics.filter(d => !d.startsWith(probeName)), [], 'a fixture does not satisfy Services');
	const flagged = diagnostics.filter(d => d.startsWith(probeName) && CONFIG_MEMBERS.test(d));
	assert.ok(flagged.length > 0, 'a fixture missing the three members is reported');
	assert.match(flagged.join('\n'), /catalog, repoSettings, setRepoSetting/);
});

test('the modal lists payload rows, edits local rows only and shows an error message', async () => {
	// The model: same labels, kinds and notes as the daemon's repoFields, values from the payload.
	const rows = buildSettingsRows(REPO_TRACKER_FIELDS, PAYLOAD);
	assert.deepEqual(rows.map(r => r.key), REPO_TRACKER_FIELDS.map(r => r.key));
	assert.deepEqual(rows.map(r => r.label), REPO_TRACKER_FIELDS.map(r => r.label));
	assert.deepEqual(rows.filter(r => r.editable).map(r => r.key), ['type', 'owner', 'repo', 'ghPath', 'ghHost', 'branchPattern']);
	const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
	assert.equal(byKey['ghHost']?.value, 'ghe.example.com');
	assert.equal(byKey['ghPath']?.value, '(not set)');
	assert.equal(byKey['signin']?.value, 'signed in as octocat');
	assert.equal(byKey['target']?.value, 'acme/widgets (per-repo-config)');
	assert.equal(byKey['signoffStages']?.value, 'DEF, HLD');
	assert.equal(byKey['claimUnits']?.value, 'epic: DEF, HLD · story: LLD, PLAN · task: BUILD');
	assert.equal(byKey['branchPattern']?.note, 'saved; not used yet');

	const f = fixture();
	const { lastFrame, stdin, unmount } = await openModal(f);
	try {
		// Rows come from the payload with the daemon's labels.
		let frame = lastFrame() ?? '';
		for (const label of ['Tracker', 'Owner', 'Repository', 'GitHub host', 'Branch pattern', 'Sign-in', 'Resolved target', 'Team mode', 'Signoff stages']) {
			assert.match(frame, new RegExp(label), `row ${label}`);
		}
		assert.match(frame, /ghe\.example\.com/);
		assert.match(frame, /signed in as octocat/);
		assert.match(frame, /acme\/widgets \(per-repo-config\)/);
		assert.match(frame, /DEF, HLD/);
		assert.match(frame, /saved; not used yet/);
		assert.match(frame, /\(read-only\)/);

		// A read-only row is not editable: enter shows a note and calls nothing.
		for (let i = 0; i < 6; i++) { stdin.write('\u001B[B'); await settle(); }   // down to "Sign-in"
		stdin.write('\r'); await settle();
		frame = lastFrame() ?? '';
		assert.match(frame, /Sign-in is read-only/);
		assert.equal(f.sets.length, 0);
		for (let i = 0; i < 3; i++) { stdin.write('\u001B[B'); await settle(); }   // on into the policy rows
		stdin.write('\r'); await settle();
		assert.match(lastFrame() ?? '', /is read-only/);
		assert.equal(f.sets.length, 0);

		// Back up to ghHost (row 4), edit it.
		for (let i = 0; i < 5; i++) { stdin.write('\u001B[A'); await settle(); }
		stdin.write('\r'); await settle();
		assert.match(lastFrame() ?? '', /GitHub host \(empty clears\):/);
		stdin.write('.eu'); await settle();                   // the prompt starts from the stored value
		stdin.write('\r'); await settle();
		assert.deepEqual(f.sets, [{ repo: REPO, key: 'ghHost', value: 'ghe.example.com.eu' }]);
		frame = lastFrame() ?? '';
		assert.match(frame, /ghe\.example\.com\.eu/);
		assert.match(frame, /saved GitHub host/);

		// A refusal from the daemon is shown as its message and the rows stay.
		f.next = { ok: false, error: { code: 'invalid-value', message: 'branchPattern must not start with a slash' } };
		stdin.write('\r'); await settle();                    // edit ghHost again
		stdin.write('\r'); await settle();                    // submit unchanged
		frame = lastFrame() ?? '';
		assert.match(frame, /✗ branchPattern must not start with a slash/);
		assert.match(frame, /Owner/);

		// Esc closes back to the repo list.
		stdin.write('\u001B'); await settle();
		assert.doesNotMatch(lastFrame() ?? '', /tracker settings/);
		assert.match(lastFrame() ?? '', /\/work\/repoA/);
	} finally { unmount(); }

	// An ok:false result on open shows the message and no rows.
	const refused = fixture({ ok: false, error: { code: 'github-json-unreadable', message: '/home/u/.insrc/github.json: is not valid JSON' } });
	const r = await openModal(refused);
	try {
		const frame = r.lastFrame() ?? '';
		assert.match(frame, /✗ \/home\/u\/\.insrc\/github\.json: is not valid JSON/);
		assert.doesNotMatch(frame, /GitHub host/);
	} finally { r.unmount(); }

	// A transport failure (daemon down) is shown the same way.
	const down = fixture();
	down.svc.config.repoSettings = async () => { throw new Error('daemon is not running — start it with: insrc daemon start'); };
	const d = await openModal(down);
	try { assert.match(d.lastFrame() ?? '', /✗ daemon is not running/); } finally { d.unmount(); }
});
