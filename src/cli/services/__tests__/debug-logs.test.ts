/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Log tailer service unit tests (Story s5, t2). Exercise tailLogWith against an
 * injected fs seam (listSegments/readLines/watch + a manual event trigger) and
 * the pure matchesFilter predicate + logCategories + the makeServices binding —
 * NO real fs.watch, disk, or wall-clock.
 *
 * Run: npx tsx --test src/cli/services/__tests__/debug-logs.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tailLogWith, matchesFilter, logCategories } from '../debug.js';
import type { TailDeps } from '../debug.js';
import * as debugImpl from '../debug.js';
import { makeServices } from '../index.js';
import type { LogLine } from '../debug-types.js';

/** A fake fs seam: a mutable file map (path -> lines) + a manual watch trigger. */
function fakeSeam(files: Record<string, string[]>, stemFiles: Record<string, string[]>): {
	deps: TailDeps;
	fire: () => void;
	set: (path: string, lines: string[]) => void;
	setSegments: (stem: string, paths: string[]) => void;
	watchCount: () => number;
	unwatched: () => boolean;
} {
	let cb: (() => void) | null = null;
	let watchCount = 0;
	let unwatched = false;
	const segs: Record<string, string[]> = { ...stemFiles };
	const content: Record<string, string[]> = { ...files };
	const deps: TailDeps = {
		logDir: '/logs',
		listSegments: (_dir, stem) => segs[stem] ?? [],
		readLines: file => {
			const c = content[file];
			if (c === undefined) throw new Error('ENOENT');
			return c;
		},
		watch: (_dir, onEvent) => { cb = onEvent; watchCount++; return () => { unwatched = true; cb = null; }; },
		maxLines: 3,
	};
	return {
		deps,
		fire: () => cb?.(),
		set: (path, lines) => { content[path] = lines; },
		setSegments: (stem, paths) => { segs[stem] = paths; },
		watchCount: () => watchCount,
		unwatched: () => unwatched,
	};
}

const J = (name: string, level: number, msg: string): string => JSON.stringify({ time: 1, level, name, msg });

// --- tailLogWith -------------------------------------------------------------

test('tailLogWith: resolves the active segment (highest-N) and emits its last-N lines on start', () => {
	const f = fakeSeam(
		{ '/logs/daemon.1.log': ['a', 'b'], '/logs/daemon.2.log': ['c', 'd', 'e', 'f'] },
		{ daemon: ['/logs/daemon.1.log', '/logs/daemon.2.log'] },
	);
	const emits: LogLine[][] = [];
	const dispose = tailLogWith('daemon', ls => emits.push([...ls]), f.deps);
	// active = daemon.2.log; maxLines=3 -> last 3 lines d,e,f
	assert.deepEqual(emits[0]!.map(l => l.raw), ['d', 'e', 'f']);
	dispose();
});

test("tailLogWith: a watch 'change' event emits the newly-appended lines (live follow)", () => {
	const f = fakeSeam({ '/logs/daemon.1.log': ['a'] }, { daemon: ['/logs/daemon.1.log'] });
	const emits: LogLine[][] = [];
	const dispose = tailLogWith('daemon', ls => emits.push([...ls]), f.deps);
	assert.deepEqual(emits[0]!.map(l => l.raw), ['a']);
	f.set('/logs/daemon.1.log', ['a', 'b', 'c']); // appended b,c
	f.fire();
	assert.deepEqual(emits[1]!.map(l => l.raw), ['b', 'c']); // only the new lines
	dispose();
});

test('tailLogWith: a newer higher-N segment appearing re-resolves+follows it (rotation follow, lc2)', () => {
	const f = fakeSeam({ '/logs/daemon.1.log': ['a', 'b'] }, { daemon: ['/logs/daemon.1.log'] });
	const emits: LogLine[][] = [];
	const dispose = tailLogWith('daemon', ls => emits.push([...ls]), f.deps);
	// rotation: a new daemon.2.log appears with fresh lines
	f.set('/logs/daemon.2.log', ['x', 'y']);
	f.setSegments('daemon', ['/logs/daemon.1.log', '/logs/daemon.2.log']);
	f.fire();
	assert.deepEqual(emits[emits.length - 1]!.map(l => l.raw), ['x', 'y']); // followed to the new segment
	dispose();
});

test('tailLogWith: non-JSON line -> raw-only; valid pino JSON -> time/level/module/msg', () => {
	const f = fakeSeam({ '/logs/agent.1.log': [J('router', 30, 'hello'), 'not json'] }, { agent: ['/logs/agent.1.log'] });
	const emits: LogLine[][] = [];
	const dispose = tailLogWith('agent', ls => emits.push([...ls]), f.deps);
	const lines = emits[0]!;
	assert.deepEqual(lines[0], { raw: J('router', 30, 'hello'), time: 1, level: 30, module: 'router', msg: 'hello' });
	assert.deepEqual(lines[1], { raw: 'not json' });
	dispose();
});

test('tailLogWith: empty/missing dir or no segment emits [] and never throws (k4)', () => {
	const f = fakeSeam({}, { daemon: [] });
	const emits: LogLine[][] = [];
	const dispose = tailLogWith('daemon', ls => emits.push([...ls]), f.deps);
	assert.deepEqual(emits, [[]]); // one empty initial emit, no throw
	dispose();
});

test('tailLogWith: a readLines throw is swallowed and the subscription survives', () => {
	// segment listed but its content is missing -> readLines throws.
	const f = fakeSeam({}, { daemon: ['/logs/daemon.1.log'] });
	const emits: LogLine[][] = [];
	const dispose = tailLogWith('daemon', ls => emits.push([...ls]), f.deps);
	assert.deepEqual(emits, []); // read threw on initial -> no emit, no crash
	f.set('/logs/daemon.1.log', ['now', 'readable']);
	f.fire(); // subscription survived; now it reads
	assert.deepEqual(emits[emits.length - 1]!.map(l => l.raw), ['now', 'readable']);
	dispose();
});

test('tailLogWith: dispose() removes the watcher and suppresses any post-dispose emit (idempotent)', () => {
	const f = fakeSeam({ '/logs/daemon.1.log': ['a'] }, { daemon: ['/logs/daemon.1.log'] });
	const emits: LogLine[][] = [];
	const dispose = tailLogWith('daemon', ls => emits.push([...ls]), f.deps);
	const before = emits.length;
	dispose();
	dispose(); // idempotent — no throw
	assert.equal(f.unwatched(), true);
	f.set('/logs/daemon.1.log', ['a', 'b']);
	f.fire(); // a stale event
	assert.equal(emits.length, before); // suppressed
});

// --- matchesFilter -----------------------------------------------------------

const line = (over: Partial<LogLine>): LogLine => ({ raw: over.raw ?? 'raw', ...over });

test('matchesFilter: minLevel keeps level>=; a non-JSON (no level) line is dropped under an active minLevel', () => {
	assert.equal(matchesFilter(line({ level: 50 }), { minLevel: 40 }), true);
	assert.equal(matchesFilter(line({ level: 30 }), { minLevel: 40 }), false);
	assert.equal(matchesFilter(line({ raw: 'plain' }), { minLevel: 40 }), false); // no level -> dropped
});

test('matchesFilter: module ci-match on module; text ci-substring over raw', () => {
	assert.equal(matchesFilter(line({ module: 'Router' }), { module: 'rout' }), true);
	assert.equal(matchesFilter(line({ module: 'db' }), { module: 'rout' }), false);
	assert.equal(matchesFilter(line({ raw: 'Hello WORLD' }), { text: 'world' }), true);
	assert.equal(matchesFilter(line({ raw: 'nope' }), { text: 'world' }), false);
});

test('matchesFilter: unset fields impose no constraint; level+module+text are ANDed', () => {
	assert.equal(matchesFilter(line({ level: 50, module: 'router', raw: 'boom' }), {}), true);
	assert.equal(matchesFilter(line({ level: 50, module: 'router', raw: 'boom' }), { minLevel: 40, module: 'router', text: 'boom' }), true);
	assert.equal(matchesFilter(line({ level: 50, module: 'router', raw: 'boom' }), { minLevel: 40, module: 'router', text: 'nope' }), false);
});

test('matchesFilter: free-text still matches a non-JSON line via raw (level/module cannot)', () => {
	assert.equal(matchesFilter(line({ raw: 'a plain error line' }), { text: 'error' }), true);
});

// --- logCategories + binding -------------------------------------------------

test('logCategories() returns exactly [daemon, agent] and opens no stream', () => {
	const cats = logCategories();
	assert.deepEqual(cats.map(c => c.id), ['daemon', 'agent']);
	assert.deepEqual(cats.map(c => c.stem), ['daemon', 'agent']);
});

test('makeServices().debug exposes logCategories + tailLog bound to the real impls', () => {
	const { debug } = makeServices();
	assert.equal(debug.logCategories, debugImpl.logCategories);
	assert.equal(debug.tailLog, debugImpl.tailLog);
});
