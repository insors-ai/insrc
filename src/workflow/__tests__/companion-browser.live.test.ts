/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LLD-d9f85b3c S001 — smoke: the companion pages finalize writes actually draw
 * in a browser.
 *
 * Finalizes a standalone LLD carrying all four definitions, then loads each
 * written page in headless Chrome and reads back the DOM: the visual is drawn
 * (a Mermaid SVG, or the UX card), the pan/zoom fitted it on load, and the page
 * logged no uncaught error.
 *
 * Gated like the repo's other live checks: it needs a browser, so it runs only
 * with INSRC_LIVE_TESTS=1 and a Chrome binary on PATH (google-chrome, chromium
 * or chromium-browser), and skips cleanly otherwise.
 *
 *   INSRC_LIVE_TESTS=1 npx tsx --test src/workflow/__tests__/companion-browser.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { finalizeArtifact } from '../orchestrator.js';
import type { WorkflowIntent } from '../types.js';
import type { LldArtifact } from '../artifacts/lld.js';

function chromeBinary(): string | undefined {
	for (const bin of ['google-chrome', 'chromium', 'chromium-browser']) {
		if (spawnSync(bin, ['--version'], { stdio: 'ignore' }).status === 0) return bin;
	}
	return undefined;
}

const CHROME = process.env['INSRC_LIVE_TESTS'] === '1' ? chromeBinary() : undefined;

/** Load a page headless and return its rendered DOM and the browser's log. */
function loadInChrome(bin: string, file: string): { dom: string; log: string } {
	const r = spawnSync(bin, [
		'--headless=new', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=8000',
		'--enable-logging=stderr', '--v=0', '--dump-dom', `file://${file}`,
	], { encoding: 'utf8', timeout: 60_000, maxBuffer: 64 * 1024 * 1024 });
	return { dom: r.stdout ?? '', log: r.stderr ?? '' };
}

const body = {
	summary: { prose: 'Customers place orders through one screen.' },
	hldContextSlice: { frameworkSummary: 'standalone', ownedContracts: [], consumedContracts: [], boundary: { storyId: 'S001', owns: [], depends: [], internal: 'Order intake' }, adjacentBoundaries: [], rolloutPhase: 'standalone', nonFunctional: {} },
	contractDetails: { surfaceLevel: 'internal', api: [] },
	dataModelChanges: [], interactionWithShared: [],
	errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
	testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
	alternativesConsidered: [{ id: 'a1', name: 'n', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }],
	chosenAlternative: 'a1', openQuestions: [],
	erDefinition: { narrative: 'Orders belong to customers.', classes: {
		Customer: { description: 'A buyer.', attributes: { id: { range: 'string', identifier: true } } },
		'Order "x"': { attributes: { id: { range: 'string', identifier: true }, customer: { range: 'Customer', required: true } } },
	} },
	uxDefinition: { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'Orders' }, { type: 'Input.Text', id: 'q', label: 'Search' }, { type: 'ActionSet', actions: [{ type: 'Action.Submit', title: 'Go' }] }] },
	sequenceDefinition: { participants: [{ id: 'ui', label: 'UI' }, { id: 'api', label: 'API' }], messages: [{ from: 'ui', to: 'api', label: 'list; #1' }, { from: 'api', to: 'ui', label: 'orders', kind: 'return' }] },
	componentDependencyDefinition: { components: [{ id: 'ui', label: 'UI <b>', path: 'src/ui/app.ts' }, { id: 'api', label: 'API' }], dependencies: [{ from: 'ui', to: 'api', label: 'HTTP' }] },
};

if (CHROME === undefined) {
	test('companion-browser.live: skipped (set INSRC_LIVE_TESTS=1 with Chrome installed)', { skip: true }, () => {});
} else {
	test('companion-browser.live: every finalized companion page draws, fits on load and logs no error', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'companion-browser-'));
		try {
			const intent = {
				workflow: 'design.story', focus: 'orders', repoPath: repo, repoIndexedAt: null,
				params: { standalone: true, epicHash: 'b7c3d1e2f3a4b5c6', storyId: 'S001', sizeClass: 'feature', storyTitle: 'Order intake screen' },
			} as unknown as WorkflowIntent;
			const result = await finalizeArtifact(intent, {}, 'wf-browser', 5, { body, citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] }, 'client');
			assert.equal(result.ok, true);
			if (!result.ok) return;
			const refs = (result.finalized.artifact as LldArtifact).body.companions ?? [];
			assert.equal(refs.length, 4);
			for (const ref of refs) {
				const name = ref.relPath.split('/').pop()!;
				const { dom, log } = loadInChrome(CHROME, join(repo, ref.relPath));
				const stage = dom.slice(dom.indexOf('<div class="stage"'), dom.indexOf('<section class="blk desc">'));
				const drawn = name === 'ux-mock.html' ? stage.includes('class="ux-card"') : stage.includes('<svg');
				assert.ok(drawn, `${name}: the visual is drawn`);
				assert.ok(!stage.replace(/<script>[\s\S]*?<\/script>/g, '').includes('Diagram could not be drawn'), `${name}: Mermaid did not fail`);
				assert.match(dom, /id="stage" style="[^"]*transform: translate\([^)]*\) scale\([^)]*\)/, `${name}: fitted on load`);
				assert.doesNotMatch(log, /Uncaught/i, `${name}: no uncaught error`);
			}
		} finally { rmSync(repo, { recursive: true, force: true }); }
	});
}
