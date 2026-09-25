/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for `runBootSteeringRefresh` (S001) — the best-effort daemon-BOOT wrapper
 * over refreshSteeringAcrossRepos that re-stamps the insrc:steering skeleton into
 * every registered repo on any live update (every update path ends in a boot).
 *
 * Unit suite: drive the wrapper over injected listRepos/readBlock/readFile/writeFile
 * seams (the guide-strip.test.ts pattern) to prove re-stamp / REPLACE-ONLY opt-out
 * / idempotency / best-effort-never-throws / empty-registry. Integration suite: a
 * source-scan that src/daemon/index.ts wires the hook after the config reconcile,
 * guarded — booting the real daemon headlessly is too heavy (same rationale as the
 * maintenance SOURCE-contract test).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	runBootSteeringRefresh,
	stripGuideSections,
	renderMarkedSection,
	STEERING_MARKER_START,
	STEERING_MARKER_END,
} from '../steering-inject.js';
import { guideMarkerStart, guideMarkerEnd } from '../guide-sections.js';

// A whole canonical asset: a skeleton head + one guide section (so the strip is
// observable) — mimics what the daemon's readSteeringBlock returns.
const WHOLE_ASSET = [
	'SKELETON HEAD LINE',
	'',
	`${guideMarkerStart('define')}`,
	'DEFINE PROCEDURE BODY',
	`${guideMarkerEnd('define')}`,
].join('\n');

const SKELETON = stripGuideSections(WHOLE_ASSET); // "SKELETON HEAD LINE"

/** A one-repo registry seam. */
const oneRepo = async () => [{ path: '/fake/repo' } as never];

test('runBootSteeringRefresh re-stamps a MARKED repo file to the stripped skeleton', async () => {
	const stale = `# head\n${renderMarkedSection('OLD STEERING BODY')}\n# tail\n`;
	const writes = new Map<string, string>();
	const report = await runBootSteeringRefresh({
		listRepos: oneRepo,
		readBlock: () => WHOLE_ASSET,
		readFile: async (p: string) => (p.endsWith('CLAUDE.md') ? stale : null),
		writeFile: async (p: string, content: string) => { writes.set(p, content); },
	});
	assert.ok(report !== undefined, 'a successful refresh returns the report');
	const claude = [...writes.entries()].find(([p]) => p.endsWith('CLAUDE.md'));
	assert.ok(claude, 'CLAUDE.md should have been re-stamped');
	const [, content] = claude!;
	assert.ok(content.includes(SKELETON), 'the stripped skeleton is stamped');
	assert.ok(!content.includes('insrc:guide:'), 'no guide marker survives');
	assert.ok(!content.includes('OLD STEERING BODY'), 'the stale body is replaced');
	assert.ok(report!.some(o => o.action === 'replaced'), 'report records a replaced file');
});

test('runBootSteeringRefresh leaves an UNMARKED / absent file untouched (REPLACE-ONLY opt-out)', async () => {
	const writes: string[] = [];
	const report = await runBootSteeringRefresh({
		listRepos: oneRepo,
		readBlock: () => WHOLE_ASSET,
		// CLAUDE.md is unmarked (a hand-authored doc), AGENTS.md is absent.
		readFile: async (p: string) => (p.endsWith('CLAUDE.md') ? '# hand-authored, no markers\n' : null),
		writeFile: async (p: string) => { writes.push(p); },
	});
	assert.ok(report !== undefined);
	assert.equal(writes.length, 0, 'no file is written when none carry markers');
	assert.ok(report!.every(o => o.action === 'skipped'), 'every file is skipped (opt-out)');
});

test('runBootSteeringRefresh is idempotent — an already-current marked file reports unchanged, no write', async () => {
	const current = `# head\n${renderMarkedSection(SKELETON)}\n# tail\n`;
	const writes: string[] = [];
	const report = await runBootSteeringRefresh({
		listRepos: oneRepo,
		readBlock: () => WHOLE_ASSET,
		readFile: async (p: string) => (p.endsWith('CLAUDE.md') ? current : null),
		writeFile: async (p: string) => { writes.push(p); },
	});
	assert.ok(report !== undefined);
	assert.equal(writes.length, 0, 'a current block is not rewritten');
	const claude = report!.find(o => o.file.endsWith('CLAUDE.md'));
	assert.equal(claude?.action, 'unchanged');
});

test('runBootSteeringRefresh swallows a readBlock throw (missing/empty asset) and returns undefined', async () => {
	const report = await runBootSteeringRefresh({
		listRepos: oneRepo,
		readBlock: () => { throw new Error('steering asset missing'); },
		readFile: async () => null,
		writeFile: async () => { throw new Error('should never write'); },
	});
	assert.equal(report, undefined, 'a readBlock throw is swallowed to undefined');
});

test('runBootSteeringRefresh swallows a listRepos rejection and returns undefined (never throws)', async () => {
	const report = await runBootSteeringRefresh({
		listRepos: async () => { throw new Error('registry unavailable'); },
		readBlock: () => WHOLE_ASSET,
		readFile: async () => null,
		writeFile: async () => { /* unused */ },
	});
	assert.equal(report, undefined, 'a listRepos rejection is swallowed to undefined');
});

test('runBootSteeringRefresh over an empty registry returns an empty report, no writes', async () => {
	const writes: string[] = [];
	const report = await runBootSteeringRefresh({
		listRepos: async () => [],
		readBlock: () => WHOLE_ASSET,
		readFile: async () => null,
		writeFile: async (p: string) => { writes.push(p); },
	});
	assert.deepEqual(report, [], 'empty registry -> empty report');
	assert.equal(writes.length, 0);
});

// --- integration: source-scan that the boot hook is wired in index.ts ---

test('src/daemon/index.ts imports and calls runBootSteeringRefresh AFTER the reconcile, guarded', () => {
	const indexPath = join(fileURLToPath(new URL('../', import.meta.url)), 'index.ts');
	const src = readFileSync(indexPath, 'utf8');

	// (1) imported from steering-inject
	assert.match(src, /import\s*\{[^}]*runBootSteeringRefresh[^}]*\}\s*from\s*'\.\/steering-inject\.js'/,
		'index.ts imports runBootSteeringRefresh from ./steering-inject.js');

	// (2) called, AFTER the config reconcile (the reconcileConfigFile call site)
	const reconcileIdx = src.indexOf('reconcileConfigFile(');
	const initDbIdx = src.indexOf('initDb(');
	const callIdx = src.indexOf('runBootSteeringRefresh(');
	assert.ok(reconcileIdx !== -1, 'the config reconcile call is present');
	assert.ok(initDbIdx !== -1, 'initDb is called');
	assert.ok(callIdx !== -1, 'runBootSteeringRefresh is called');
	assert.ok(callIdx > reconcileIdx, 'the boot steering refresh runs AFTER the config reconcile');
	// The real precondition is an open DB registry, so it MUST also run after initDb
	// (guards against a regression that moves the call before the registry is ready).
	assert.ok(callIdx > initDbIdx, 'the boot steering refresh runs AFTER initDb (registry available)');

	// (3) guarded best-effort: fired via `void` on the never-throwing wrapper so a
	//     fault cannot abort boot (STEERING_MARKER_* are re-exported for fixtures too).
	assert.match(src, /void\s+runBootSteeringRefresh\(\)/,
		'the call is fire-and-forget (void) so it never blocks or aborts boot');
});

// Guard: the marker constants the wrapper/tests lean on are exported.
test('STEERING markers are exported for fixtures', () => {
	assert.equal(STEERING_MARKER_START, '<!-- insrc:steering:start -->');
	assert.equal(STEERING_MARKER_END, '<!-- insrc:steering:end -->');
	assert.match(guideMarkerStart('x'), /insrc:guide:x:start/);
	assert.match(guideMarkerEnd('x'), /insrc:guide:x:end/);
});
