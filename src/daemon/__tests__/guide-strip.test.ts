/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for `stripGuideSections` (S003 t1) — the subtractive strip applied
 * on the steering INJECT path so the propagated block carries only the skeleton
 * while the canonical asset (read by guide.get) stays whole. Pure over fixture
 * text: it removes every complete `<!-- insrc:guide:<key>:start -->`..`:end`
 * region inclusive, collapses the resulting blank runs, and leaves a half or
 * malformed marker intact. A second suite drives the two real inject-path
 * callsites over the SHIPPED asset to prove the skeleton is guide-marker-free
 * while readSteeringBlock is unchanged.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	stripGuideSections,
	readSteeringBlock,
	refreshSteeringAcrossRepos,
	STEERING_MARKER_START,
	STEERING_MARKER_END,
} from '../steering-inject.js';
import { guideMarkerStart, guideMarkerEnd, listWorkflowGuides } from '../guide-sections.js';

const SKELETON = 'SKELETON LINE ONE\nSKELETON LINE TWO';

function section(key: string, body: string): string {
	return `${guideMarkerStart(key)}\n${body}\n${guideMarkerEnd(key)}`;
}

test('removes every complete guide section, retaining the skeleton', () => {
	const text = [SKELETON, section('define', 'DEFINE BODY'), section('plan', 'PLAN BODY')].join('\n\n');
	const out = stripGuideSections(text);
	assert.ok(out.includes('SKELETON LINE ONE'));
	assert.ok(out.includes('SKELETON LINE TWO'));
	assert.ok(!out.includes('DEFINE BODY'), 'define body should be stripped');
	assert.ok(!out.includes('PLAN BODY'), 'plan body should be stripped');
	assert.ok(!out.includes('insrc:guide:'), 'no guide marker should survive');
});

test('leaves a half-present (start-only) marker intact', () => {
	const text = `${SKELETON}\n\n${guideMarkerStart('define')}\nDANGLING BODY`;
	const out = stripGuideSections(text);
	// listWorkflowGuides only reports complete pairs, so a dangling start is not
	// a key to strip — the text passes through untouched (modulo blank collapse).
	assert.ok(out.includes('DANGLING BODY'));
	assert.ok(out.includes(guideMarkerStart('define')));
});

test('collapses the blank run left where a section was removed', () => {
	const text = `${SKELETON}\n\n${section('define', 'BODY')}\n\nTRAILER`;
	const out = stripGuideSections(text);
	assert.ok(!/\n{3,}/.test(out), 'no run of 3+ newlines should remain');
	assert.ok(out.includes('TRAILER'));
});

test('is idempotent — stripping an already-stripped skeleton is a no-op', () => {
	const text = [SKELETON, section('define', 'BODY')].join('\n\n');
	const once = stripGuideSections(text);
	const twice = stripGuideSections(once);
	assert.equal(twice, once);
});

test('is safe on text with no guide sections at all', () => {
	assert.equal(stripGuideSections(SKELETON), SKELETON);
});

test('is safe on empty-ish text', () => {
	assert.equal(stripGuideSections('   \n\n  '), '');
});

// --- inject-path integration over the SHIPPED canonical asset ---

test('the shipped asset carries guide sections; readSteeringBlock returns it whole', () => {
	const whole = readSteeringBlock();
	const keys = listWorkflowGuides(whole);
	// The shipped asset's workflow guide sections (bugfix added by the
	// surface-bugfix-workflow story — auto-derived from its marker pair).
	assert.deepEqual(
		[...keys].sort(),
		['brainstorm', 'bugfix', 'build', 'code-review', 'define', 'design.epic', 'design.story', 'plan', 'review', 'tracker', 'triage'],
	);
});

test('refreshSteeringAcrossRepos (default readBlock) stamps a guide-marker-free skeleton', async () => {
	// One marked repo file, fake fs seams, but the DEFAULT readBlock so we
	// exercise the real inject-path source (stripGuideSections(readSteeringBlock())).
	const marked = `# head\n${STEERING_MARKER_START}\nOLD BODY\n${STEERING_MARKER_END}\n# tail\n`;
	let written: string | null = null;
	await refreshSteeringAcrossRepos({
		listRepos: async () => [{ path: '/fake/repo' } as never],
		readFile: async (p: string) => (p.endsWith('CLAUDE.md') ? marked : null),
		writeFile: async (_p: string, content: string) => { written = content; },
	});
	assert.ok(written !== null, 'a marked file should have been re-stamped');
	const stamped: string = written!;
	assert.ok(!stamped.includes('insrc:guide:'), 'the stamped skeleton must carry no guide markers');
	// It still names the on-demand surfaces the controller needs.
	assert.ok(stamped.includes('insrc_schema'));
	assert.ok(stamped.includes('insrc_guide'));
	// The stamped skeleton is strictly smaller than the whole canonical asset.
	assert.ok(stripGuideSections(readSteeringBlock()).length < readSteeringBlock().length,
		'skeleton should be shorter than the whole asset');
});

test('an injected readBlock (the daemon-update path) is ALSO stripped — the skeleton contract cannot be bypassed', async () => {
	// The real update callsite (runUpdateSteeringRefresh) supplies its OWN
	// readBlock pointed at the freshly-built asset — the WHOLE block, guide
	// sections included. refreshSteeringAcrossRepos must strip it centrally, so
	// the stamped content is skeleton-only regardless of the injected source.
	const whole = `SKELETON HEAD\n\n${section('define', 'DEFINE PROCEDURE BODY')}\n\n${section('plan', 'PLAN PROCEDURE BODY')}`;
	const marked = `${STEERING_MARKER_START}\nOLD\n${STEERING_MARKER_END}`;
	let written: string | null = null;
	await refreshSteeringAcrossRepos({
		listRepos: async () => [{ path: '/fake/repo' } as never],
		readBlock: () => whole, // mimics maintenance.ts supplying the raw built asset
		readFile: async (p: string) => (p.endsWith('CLAUDE.md') ? marked : null),
		writeFile: async (_p: string, content: string) => { written = content; },
	});
	assert.ok(written !== null, 'the marked file should have been re-stamped');
	const stamped: string = written!;
	assert.ok(stamped.includes('SKELETON HEAD'), 'the skeleton must survive');
	assert.ok(!stamped.includes('insrc:guide:'), 'no guide marker may survive the update path');
	assert.ok(!stamped.includes('DEFINE PROCEDURE BODY'), 'guide bodies must be stripped on the update path');
	assert.ok(!stamped.includes('PLAN PROCEDURE BODY'));
});

test('the inject-path strip is idempotent over the shipped asset', () => {
	const once = stripGuideSections(readSteeringBlock());
	const twice = stripGuideSections(once);
	assert.equal(twice, once);
});
