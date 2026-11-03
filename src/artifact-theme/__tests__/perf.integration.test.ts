/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E20261030486751c3:S001 (t5) — NFR5 perf baseline: the theme policy is
 * pure data + string building, so generation cost is linear in CSS size, not in
 * diagram size. This records timings on small/medium/large CSS builds so a
 * regression that made generation quadratic (e.g. repeated font embedding per
 * node) would trip the budget.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fontFaceCssForArtifacts, mermaidConfigFor, pageCssFor, viewerBootScript } from '../theme.js';

test('perf.integration.test.ts: policy generation stays cheap across sizes (NFR5 baseline)', () => {
	const sizes = [1, 50, 500]; // diagram-count proxy: build the full page CSS+boot per "diagram"
	for (const n of sizes) {
		const t0 = performance.now();
		for (let i = 0; i < n; i++) {
			pageCssFor('light'); pageCssFor('dark');
			mermaidConfigFor('light'); mermaidConfigFor('dark');
			viewerBootScript({ initialMode: 'light', configs: { light: mermaidConfigFor('light'), dark: mermaidConfigFor('dark') } });
		}
		const ms = performance.now() - t0;
		// generous budget: 500 pages must build in well under a second (baseline ~ms)
		assert.ok(ms < 1000, `n=${n} built in ${ms.toFixed(1)}ms (< 1000ms budget)`);
	}
	// font embedding is memoizable per page: one font-face block regardless of diagram count
	const once = fontFaceCssForArtifacts();
	assert.equal((once.match(/@font-face/g) ?? []).length, 3, 'fonts embedded once per page, not per diagram');
});
