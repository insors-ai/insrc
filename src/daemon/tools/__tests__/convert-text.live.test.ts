/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s2/t8: convertText against a real cheap model on captured CLI output.
 * Gated on INSRC_LIVE_TESTS=1 (skips cleanly when unset). The corpus is real output of git and
 * gh, captured under fixtures/convert-text/.
 * Run: INSRC_LIVE_TESTS=1 npx tsx --test src/daemon/tools/__tests__/convert-text.live.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from '@sinclair/typebox';

import { loadAnalyzeConfig } from '../../../config/analyze.js';
import { convertText } from '../convert-text.js';
import { createConversionProviders } from '../conversion-providers.js';
import type { ToolDeps } from '../types.js';

const LIVE = process.env['INSRC_LIVE_TESTS'] === '1';
const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'convert-text');
const read = (name: string): string => readFileSync(join(FIX, name), 'utf8');

const deps = (): ToolDeps => ({
	sessionId: 'live', repoPath: process.cwd(), send: () => {}, requestId: 1,
	conversion: createConversionProviders(loadAnalyzeConfig(), process.cwd()),
});

const ShowStat = Type.Object({ hash: Type.String(), subject: Type.String(), files: Type.Array(Type.String()) }, { additionalProperties: false });
const GhVersion = Type.Object({ version: Type.String() }, { additionalProperties: false });

test('convert-text.live.test.ts: convertText on captured gh and git text-only outputs returns values whose key values are in the text', { skip: !LIVE, timeout: 600_000 }, async () => {
	const show = await convertText({ toolId: 'git_show', rawText: read('git-show-stat.txt'), schema: ShowStat, keyValues: v => [v.hash, ...v.files] }, deps());
	assert.equal(show.ok, true, JSON.stringify(show));
	if (show.ok) {
		assert.ok(show.value.hash.startsWith('81655c2e'));
		assert.ok(show.value.files.some(f => f.endsWith('failure-mapping.ts')));
	}
	const gh = await convertText({ toolId: 'gh_version', rawText: read('gh-version.txt'), schema: GhVersion, keyValues: v => [v.version] }, deps());
	assert.equal(gh.ok, true, JSON.stringify(gh));
	if (gh.ok) assert.match(gh.value.version, /2\.46\.0/);
});

test('convert-text.live.test.ts: a deliberately altered output fails the cross-check', { skip: !LIVE, timeout: 600_000 }, async () => {
	// The schema demands a field the text does not contain: whatever the model answers, the value cannot be in the text.
	const Needs = Type.Object({ ticket: Type.String({ pattern: '^ZZ-[0-9]+$' }) }, { additionalProperties: false });
	const r = await convertText({ toolId: 'git_log', rawText: read('git-log-oneline.txt'), schema: Needs, keyValues: v => [v.ticket] }, deps());
	assert.equal(r.ok, false);
});
