/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s1/t13 — the CLI Repos pane row shows completeness beside the
 * unchanged status: 'incomplete' with the number of causes and the first one
 * for an incomplete repository, nothing extra for a complete one, and the
 * status alone when the field is absent (unknown: a daemon before the change).
 * Rendered with ink-testing-library (createElement, no JSX, so the .test.ts
 * glob picks it up).
 *
 * Run: npx tsx --test src/cli/panes/__tests__/ReposPane-completeness.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { render } from 'ink-testing-library';

import { RepoRow } from '../ReposPane.js';
import type { RegisteredRepo, RepoCompleteness } from '../../../shared/types.js';

const completeness = (complete: boolean, reasons: string[]): RepoCompleteness => ({
	complete, reasons,
	counts: { pending: { 'awaiting-target': complete ? 0 : 2, 'ambiguous': 0, 'no-candidate': 4, 'external-endpoint': 0 }, unwritable: 0, unembedded: 0, uncommittedFiles: 0 },
	uncommittedFiles: [], generation: 3,
});

const repo = (extra: Partial<RegisteredRepo>): RegisteredRepo =>
	({ path: '/work/repo', name: 'repo', addedAt: '2026-10-18T00:00:00.000Z', status: 'ready', lastIndexed: '2026-10-18T00:00:00.000Z', ...extra });

const frameOf = (r: RegisteredRepo): string => {
	const { lastFrame, unmount } = render(createElement(RepoRow, { repo: r, selected: false }));
	const frame = lastFrame() ?? '';
	unmount();
	return frame;
};

test('an incomplete repository shows incomplete beside its unchanged status, with the number of causes and the first cause on the line below', () => {
	const frame = frameOf(repo({ completeness: completeness(false, [
		'2 relationships point at files an ignore rule excludes',
		'1 file could not be indexed',
	]) }));
	const [row, detail] = frame.split('\n');
	assert.match(row ?? '', /ready\s+incomplete \/work\/repo/, frame);
	assert.match(detail ?? '', /^\s+2 causes: 2 relationships point at files an ignore rule excludes$/, frame);
});

test('a complete repository shows its status and nothing extra', () => {
	const frame = frameOf(repo({ completeness: completeness(true, []) }));
	assert.doesNotMatch(frame, /incomplete|cause/, frame);
	assert.equal(frame.split('\n').length, 1, 'one line');
	assert.match(frame, /ready\s+\/work\/repo/, frame);
});

test('a repository with no completeness field (unknown) shows the status alone', () => {
	const frame = frameOf(repo({ status: 'indexing' }));
	assert.doesNotMatch(frame, /incomplete|complete/, frame);
	assert.match(frame, /indexing\s+\/work\/repo/, frame);
});
