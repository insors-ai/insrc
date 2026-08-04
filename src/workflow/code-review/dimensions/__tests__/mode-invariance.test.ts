/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review S001 (Fix D) — the conventions + quality dimensions are
 * CONTRACT-INDEPENDENT: they read neither `approvedLld` nor `approvedPlan`, so
 * their prompts must be BYTE-IDENTICAL across all three review modes
 * (A: both contracts, B: LLD only, C: neither). This locks in the invariant so
 * a future edit that accidentally makes them contract-sensitive fails here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConventionsPrompt } from '../conventions.js';
import { buildQualityPrompt } from '../quality.js';
import type { CodeReviewSubject, CodeReviewGrounding } from '../../types.js';

const base = (over: Partial<CodeReviewSubject>): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: 'e', storyId: 's', changedFiles: ['src/a.ts'],
	approvedLld:  { body: { framework: 'x' } } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: { body: { tasks: [] } }     as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord: null,
	...over,
});

const modeA = base({});
const modeB = base({ approvedPlan: null });
const modeC = base({ approvedLld: null, approvedPlan: null });

const grounding: CodeReviewGrounding = {
	symbols: [{
		entityId: 'e0', file: 'src/a.ts', kind: 'function', name: 'fn0',
		signature: 'fn0(): void', callers: [], callees: [], testsReaching: [],
	}],
};

const flat = (msgs: { role: string; content: unknown }[]): string =>
	msgs.map(m => `${m.role}\n${String(m.content)}`).join('\n----\n');

test('buildConventionsPrompt is byte-identical across the three review modes (contract-independent)', () => {
	const a = flat(buildConventionsPrompt(modeA, grounding, undefined));
	const b = flat(buildConventionsPrompt(modeB, grounding, undefined));
	const c = flat(buildConventionsPrompt(modeC, grounding, undefined));
	assert.equal(b, a, 'mode B == mode A');
	assert.equal(c, a, 'mode C == mode A');
});

test('buildQualityPrompt is byte-identical across the three review modes (contract-independent)', () => {
	const a = flat(buildQualityPrompt(modeA, grounding, undefined));
	const b = flat(buildQualityPrompt(modeB, grounding, undefined));
	const c = flat(buildQualityPrompt(modeC, grounding, undefined));
	assert.equal(b, a, 'mode B == mode A');
	assert.equal(c, a, 'mode C == mode A');
});
