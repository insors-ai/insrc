/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLD-d9f85b3c S001/t2 — the companion page's pan/zoom runtime asset.
 *
 * The page inlines src/assets/artifacts/companion/panzoom.js verbatim and opens
 * offline, so the script must reference nothing outside itself. These tests read
 * the asset as shipped and run it against a minimal stand-in DOM to pin its entry
 * points and the fit / zoom arithmetic.
 *
 * Run:
 *   npx tsx --test src/workflow/artifacts/companion/__tests__/panzoom.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const ASSET = join(dirname(fileURLToPath(import.meta.url)), '../../../../assets/artifacts/companion/panzoom.js');
const SOURCE = readFileSync(ASSET, 'utf8');

/** A stand-in element: the handful of DOM members panzoom.js touches. */
interface FakeEl {
	id: string;
	style: Record<string, string>;
	textContent: string;
	clientWidth: number; clientHeight: number;
	scrollWidth: number; scrollHeight: number;
	listeners: Record<string, ((ev: unknown) => void)[]>;
	classList: { add(c: string): void; remove(c: string): void };
	addEventListener(type: string, fn: (ev: unknown) => void): void;
	getBoundingClientRect(): { left: number; top: number };
	setPointerCapture(): void;
	fire(type: string, ev?: unknown): void;
}

function el(id: string, size: Partial<Pick<FakeEl, 'clientWidth' | 'clientHeight' | 'scrollWidth' | 'scrollHeight'>> = {}): FakeEl {
	const e: FakeEl = {
		id, style: {}, textContent: '',
		clientWidth: 0, clientHeight: 0, scrollWidth: 0, scrollHeight: 0, ...size,
		listeners: {},
		classList: { add: () => {}, remove: () => {} },
		addEventListener(type, fn) { (e.listeners[type] ??= []).push(fn); },
		getBoundingClientRect: () => ({ left: 0, top: 0 }),
		setPointerCapture: () => {},
		fire(type, ev = {}) { for (const fn of e.listeners[type] ?? []) fn(ev); },
	};
	return e;
}

/** Runs the asset in a fresh context with the given elements; returns its window. */
function load(elements: readonly FakeEl[]): { insrcPanZoom: { init(o: Record<string, unknown>): { fit(): void; reset(): void } } } {
	const byId = new Map(elements.map(e => [e.id, e]));
	const window: Record<string, unknown> = {};
	runInNewContext(SOURCE, {
		window,
		document: { getElementById: (id: string) => byId.get(id) ?? null },
		setTimeout: (fn: () => void) => fn(),
	});
	return window as never;
}

// ---------------------------------------------------------------------------
// unit: panzoom asset: no http(s)/import references; exposes init + fit entry points
// ---------------------------------------------------------------------------

test('d9f85b3c t2 — the panzoom asset references nothing outside itself', () => {
	assert.doesNotMatch(SOURCE, /https?:\/\//, 'no network URL');
	assert.doesNotMatch(SOURCE, /^\s*import[\s{*'"]/m, 'no static import');
	assert.doesNotMatch(SOURCE, /\bimport\s*\(/, 'no dynamic import');
	assert.doesNotMatch(SOURCE, /\brequire\s*\(/, 'no require');
	assert.doesNotMatch(SOURCE, /<\/script/i, 'safe to inline inside a <script> element');
});

test('d9f85b3c t2 — the asset exposes window.insrcPanZoom.init, which returns fit() and reset()', () => {
	const w = load([el('vp'), el('stage')]);
	assert.equal(typeof w.insrcPanZoom.init, 'function');
	const pz = w.insrcPanZoom.init({ viewport: 'vp', stage: 'stage' });
	assert.equal(typeof pz.fit, 'function');
	assert.equal(typeof pz.reset, 'function');
});

test('d9f85b3c t2 — fit-on-load centres the stage at the scale that fits the viewport, and labels it', () => {
	const vp = el('vp', { clientWidth: 1000, clientHeight: 500 });
	const stage = el('stage', { scrollWidth: 2000, scrollHeight: 500 });
	const label = el('zl');
	load([vp, stage, label]).insrcPanZoom.init({ viewport: 'vp', stage: 'stage', zoomLabel: 'zl', fitOnLoad: true });
	// min(1000/2000, 500/500) * 0.92 = 0.46; centred: x = (1000 - 920) / 2, y = (500 - 230) / 2.
	assert.equal(stage.style['transform'], 'translate(40px,135px) scale(0.46)');
	assert.equal(label.textContent, '46%');
});

test('d9f85b3c t2 — the toolbar zooms about the centre and 1:1 resets; missing controls are skipped', () => {
	const vp = el('vp', { clientWidth: 400, clientHeight: 400 });
	const stage = el('stage', { scrollWidth: 100, scrollHeight: 100 });
	const zin = el('zin'); const z100 = el('z100'); const label = el('zl');
	load([vp, stage, zin, z100, label]).insrcPanZoom.init({
		viewport: 'vp', stage: 'stage', zoomLabel: 'zl', zoomIn: 'zin', zoomOut: 'zout-absent', reset: 'z100',
	});
	zin.fire('click');
	assert.equal(label.textContent, '125%');
	assert.equal(stage.style['transform'], 'translate(-50px,-50px) scale(1.25)', 'the centre (200, 200) stays put');
	z100.fire('click');
	assert.equal(stage.style['transform'], 'translate(20px,20px) scale(1)');
});

test('d9f85b3c t2 — a missing viewport or stage yields a no-op handle instead of throwing', () => {
	const pz = load([]).insrcPanZoom.init({ viewport: 'vp', stage: 'stage' });
	assert.doesNotThrow(() => { pz.fit(); pz.reset(); });
});

test('d9f85b3c t2 — only the primary button drags: a right- or middle-click leaves the view where it is', () => {
	const vp = el('vp', { clientWidth: 400, clientHeight: 400 });
	const stage = el('stage', { scrollWidth: 100, scrollHeight: 100 });
	load([vp, stage]).insrcPanZoom.init({ viewport: 'vp', stage: 'stage' });
	const before = stage.style['transform'];
	vp.fire('pointerdown', { button: 2, clientX: 0, clientY: 0, pointerId: 1 });
	vp.fire('pointermove', { clientX: 50, clientY: 50 });
	assert.equal(stage.style['transform'], before, 'a right-click starts no drag');
	vp.fire('pointerdown', { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
	vp.fire('pointermove', { clientX: 50, clientY: 50 });
	assert.equal(stage.style['transform'], 'translate(50px,50px) scale(1)', 'the primary button drags');
});
