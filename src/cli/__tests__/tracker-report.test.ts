/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the pure tracker-report presentation helpers.
 *
 * Run: npx tsx --test src/cli/__tests__/tracker-report.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { trackerStatusGlyph, trackerReportSummary } from '../panes/tracker-report.js';
import type { TrackerSetupReport, TrackerSetupStatus, TrackerSetupStep } from '../../workflow/tracker/setup.js';

function step(status: TrackerSetupStatus, over: Partial<TrackerSetupStep> = {}): TrackerSetupStep {
	return { key: `k-${status}`, title: `title ${status}`, status, detail: `detail ${status}`, ...over };
}

test('trackerStatusGlyph maps each of the 5 statuses to a glyph + colour', () => {
	assert.deepEqual(trackerStatusGlyph('done'),    { glyph: '✓', color: 'green' });
	assert.deepEqual(trackerStatusGlyph('already'), { glyph: '✓', color: 'green' });
	assert.deepEqual(trackerStatusGlyph('manual'),  { glyph: '!', color: 'yellow' });
	assert.deepEqual(trackerStatusGlyph('skipped'), { glyph: '∘', color: 'gray' });
	assert.deepEqual(trackerStatusGlyph('failed'),  { glyph: '✗', color: 'red' });
});

test('trackerStatusGlyph never returns a blank glyph for any valid status', () => {
	for (const s of ['done', 'already', 'manual', 'skipped', 'failed'] as const) {
		const { glyph, color } = trackerStatusGlyph(s);
		assert.ok(glyph.length > 0, `glyph for ${s}`);
		assert.ok(color.length > 0, `color for ${s}`);
	}
});

test("trackerReportSummary says 'all set' when nothing is manual and nothing failed", () => {
	const report: TrackerSetupReport = { steps: [step('done'), step('already'), step('skipped')], manualRemaining: 0 };
	assert.match(trackerReportSummary(report), /all set/);
});

test('trackerReportSummary names the manual count when manualRemaining > 0', () => {
	const report: TrackerSetupReport = { steps: [step('manual'), step('manual'), step('done')], manualRemaining: 2 };
	const s = trackerReportSummary(report);
	assert.match(s, /2 steps need manual action/);
	assert.doesNotMatch(s, /all set/);
});

test('trackerReportSummary singularises one manual step', () => {
	const report: TrackerSetupReport = { steps: [step('manual')], manualRemaining: 1 };
	assert.match(trackerReportSummary(report), /1 step need manual action/);
});

test("trackerReportSummary flags failures even when manualRemaining is 0 (not 'all set')", () => {
	const report: TrackerSetupReport = { steps: [step('done'), step('failed')], manualRemaining: 0 };
	const s = trackerReportSummary(report);
	assert.match(s, /1 failed/);
	assert.doesNotMatch(s, /all set/);
});
