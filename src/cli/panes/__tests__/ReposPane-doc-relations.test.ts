/**
 * Epic c2ba6fa6, Story s10, t10 -- the CLI Repos pane row shows the
 * model-proposed document links on a line of their own: the switch, the
 * figures when measured, and why new documents are not examined when the
 * provider is unavailable; nothing without the field.
 *
 * Run: npx tsx --test src/cli/panes/__tests__/ReposPane-doc-relations.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { render } from 'ink-testing-library';

import { RepoRow } from '../ReposPane.js';
import type { DocRelationsStatus, RegisteredRepo } from '../../../shared/types.js';

const repo = (docRelations?: DocRelationsStatus): RegisteredRepo =>
	({ path: '/work/repo', name: 'repo', addedAt: '2026-11-04T00:00:00.000Z', status: 'ready', lastIndexed: '2026-11-04T00:00:00.000Z', ...(docRelations !== undefined ? { docRelations } : {}) });
const frameOf = (r: RegisteredRepo): string => {
	const { lastFrame, unmount } = render(createElement(RepoRow, { repo: r, selected: false }));
	const frame = lastFrame() ?? '';
	unmount();
	return frame;
};
const figures = { checked: 110, precision: 0.97, recall: 0.64, extractedRecovery: 1, modelId: 'm1', measuredAt: '2026-11-04T00:00:00.000Z' };

test('s10 t10: CLI ReposPane renders docRelations states', () => {
	const on = frameOf(repo({ switch: 'on', figures, extraction: { state: 'unavailable', reason: 'signed out', examined: 0, failed: 0, updatedAt: 'x' } }));
	assert.match(on.split('\n')[1] ?? '', /^\s+document links: on \(P 0\.97 \/ R 0\.64 on 110 links\); new documents not examined: signed out$/, on);
	const notMeasured = frameOf(repo({ switch: 'not-measured' }));
	assert.match(notMeasured.split('\n')[1] ?? '', /^\s+document links: not measured$/, notMeasured);
	const unavailable = frameOf(repo({ switch: 'not-measured', extraction: { state: 'unavailable', reason: 'mid tier not a CLI', examined: 0, failed: 0, updatedAt: 'x' } }));
	assert.match(unavailable, /document links: not measured; not extracted: mid tier not a CLI/);
	const off = frameOf(repo({ switch: 'off', figures: { ...figures, recall: 0.4 } }));
	assert.match(off, /document links: off \(P 0\.97 \/ R 0\.40 on 110 links\)/);
	assert.doesNotMatch(frameOf(repo()), /document links/, 'nothing without the field');
});
