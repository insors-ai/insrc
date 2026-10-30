/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * NFR1 — measured contrast of the actual theme pairs. Recomputes WCAG relative
 * luminance ratios from BRAND/SURFACES and fails if any load-bearing pair drops
 * below its target (text >= 4.5:1, connectors/boundaries >= 3:1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRAND, CONTRAST_PAIRS, SURFACES, type ThemeMode } from '../theme.js';

function lum(hex: string): number {
	const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
		.map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
	return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

function ratio(fg: string, bg: string): number {
	const a = lum(fg);
	const b = lum(bg);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('contrast.test.ts: brand tokens are the six exact hex values', () => {
	assert.deepEqual({ ...BRAND }, {
		phthalo: '#102D1A', wintergreen: '#4B9988', iguana: '#6AB489',
		seaGreen: '#92CD87', crayola: '#C2E484', pear: '#D1E736',
	});
});

test('contrast.test.ts: every CONTRAST_PAIR meets its target ratio in both modes (NFR1)', () => {
	for (const mode of ['light', 'dark'] as ThemeMode[]) {
		for (const p of CONTRAST_PAIRS[mode]) {
			const r = ratio(p.fg, p.bg);
			assert.ok(
				r >= p.minRatio,
				`${mode} ${p.role}: ${p.fg} on ${p.bg} = ${r.toFixed(2)}:1 < ${p.minRatio}:1`,
			);
		}
	}
});

test('contrast.test.ts: ER relationship-label pair holds in dark mode specifically (R3/R12 regression)', () => {
	// pale Crayola label boxes must not inherit white dark-mode text
	const r = ratio(BRAND.phthalo, BRAND.crayola);
	assert.ok(r >= 4.5, `phthalo on crayola = ${r.toFixed(2)}:1 >= 4.5:1`);
	// dark canvas text pair
	const rd = ratio(SURFACES.dark.text, SURFACES.dark.bg);
	assert.ok(rd >= 4.5, `dark text on phthalo = ${rd.toFixed(2)}:1`);
	// dark connector pair >= 3:1
	const rc = ratio(SURFACES.dark.border, SURFACES.dark.bg);
	assert.ok(rc >= 3, `dark connector on phthalo = ${rc.toFixed(2)}:1 >= 3:1`);
});
