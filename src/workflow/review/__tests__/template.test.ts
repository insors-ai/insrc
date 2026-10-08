/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The design-review templates: which one applies, its settings, its prompt and
 * the validation of a reviewer's answer.
 * (LLD-f2f08ccf89f8ab25-S001, tests T1, T2, T3 and T15.)
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { CONFIG_CATALOG } from '../../../config/config-catalog.js';
import { artifactJsonPath } from '../../storage.js';
import {
	buildTemplateReviewPrompt, DEFAULT_DESIGN_REVIEW_SETTINGS, HARD_REVIEW_DEADLINE_MS, isDesignStage,
	readDesignReviewSettings, resolveDesignReview, reviewDeadlineMs, reviewTemplateFor, validateTemplateAnswer,
} from '../template.js';
import type { RawTemplateAnswer, ReviewTemplate } from '../template.js';

const MIN = 60_000;

function withTmp<T>(fn: (dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-template-'));
	try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

function writeConfig(dir: string, designReview: unknown): string {
	const p = join(dir, 'config.json');
	writeFileSync(p, JSON.stringify({ designReview }));
	return p;
}

function putArtifact(repo: string, id: string): void {
	const p = artifactJsonPath(repo, id);
	mkdirSync(dirname(p), { recursive: true });
	writeFileSync(p, '{}');
}

/** A complete, valid answer to `template`: one holding premise per item. */
function validAnswer(template: ReviewTemplate): { items: { item: string; notApplicable?: string; premises: Record<string, unknown>[] }[] } {
	return {
		items: template.items.map(it => ({
			item: it.id,
			premises: [{ premise: `claim under ${it.id}`, outcome: 'holds', evidence: 'read src/x.ts lines 1-40', action: '' }],
		})),
	};
}

// --- T1 ----------------------------------------------------------------------

test('T1 each template has an id, a threshold and its check items', () => {
	const issue = reviewTemplateFor('issue', DEFAULT_DESIGN_REVIEW_SETTINGS);
	const spec  = reviewTemplateFor('spec', DEFAULT_DESIGN_REVIEW_SETTINGS);
	assert.equal(issue.id, 'design-issue');
	assert.equal(spec.id, 'design-spec');
	assert.equal(issue.items.length, 5);
	assert.equal(spec.items.length, 8);
	assert.equal(issue.maxPremises, 8);
	assert.equal(spec.maxPremises, 16);
	assert.ok(issue.maxPremises < spec.maxPremises, 'a fix is checked against fewer premises than a feature');
	for (const t of [issue, spec]) {
		const ids = t.items.map(i => i.id);
		assert.equal(new Set(ids).size, ids.length, 'item ids are unique within a template');
		for (const it of t.items) assert.ok(it.dimension.length > 0 && it.check.length > 0);
	}
	assert.ok(spec.items.some(i => i.id === 'boundaries') && !issue.items.some(i => i.id === 'boundaries'));
	assert.ok(issue.items.some(i => i.id === 'fix-targets-defect'));
});

test('T1 only an HLD or an LLD is a design stage', () => {
	assert.equal(isDesignStage('design.epic'), true);
	assert.equal(isDesignStage('design.story'), true);
	for (const s of ['define', 'issue', 'plan', 'brainstorm', 'build', 'unknown', '']) assert.equal(isDesignStage(s), false, s);
});

// --- T2 ----------------------------------------------------------------------

test('T2 intent and complexity come from the artifact store', () => withTmp((repo) => {
	const s = DEFAULT_DESIGN_REVIEW_SETTINGS;
	// Nothing for the hash: a standalone feature design.
	let plan = resolveDesignReview(repo, 'aaaa', s);
	assert.deepEqual([plan.intent, plan.complexity, plan.template.id, plan.deadlineMs], ['spec', 'feature', 'design-spec', 18 * MIN]);

	// A DEF: a design under an Epic.
	putArtifact(repo, 'DEF-bbbb');
	plan = resolveDesignReview(repo, 'bbbb', s);
	assert.deepEqual([plan.intent, plan.complexity, plan.template.id, plan.deadlineMs], ['spec', 'epic', 'design-spec', 24 * MIN]);

	// An ISSUE: a design that answers a fix.
	putArtifact(repo, 'ISSUE-cccc');
	plan = resolveDesignReview(repo, 'cccc', s);
	assert.deepEqual([plan.intent, plan.complexity, plan.template.id, plan.deadlineMs], ['issue', 'issue', 'design-issue', 12 * MIN]);

	// Both: the ISSUE is consulted first.
	putArtifact(repo, 'DEF-cccc');
	assert.equal(resolveDesignReview(repo, 'cccc', s).intent, 'issue');

	// Another epic's ISSUE does not leak; no hash at all is a standalone feature.
	assert.equal(resolveDesignReview(repo, 'dddd', s).intent, 'spec');
	assert.equal(resolveDesignReview(repo, undefined, s).complexity, 'feature');
	assert.equal(resolveDesignReview(repo, '', s).complexity, 'feature');
}));

// --- T15 ---------------------------------------------------------------------

test('T15 with no setting present the defaults are used', () => withTmp((dir) => {
	const expected = { premises: { issue: 8, spec: 16 }, timeLimitMs: { issue: 12 * MIN, feature: 18 * MIN, epic: 24 * MIN } };
	assert.deepEqual(readDesignReviewSettings(join(dir, 'absent.json')), expected);
	assert.deepEqual(readDesignReviewSettings(writeConfig(dir, undefined)), expected);
	writeFileSync(join(dir, 'broken.json'), '{ not json');
	assert.deepEqual(readDesignReviewSettings(join(dir, 'broken.json')), expected);
	assert.equal(reviewDeadlineMs('issue', expected), 12 * MIN);
	assert.equal(reviewDeadlineMs('feature', expected), 18 * MIN);
	assert.equal(reviewDeadlineMs('epic', expected), 24 * MIN);
}));

test('T15 a changed setting changes the threshold or the limit used', () => withTmp((dir) => {
	const s = readDesignReviewSettings(writeConfig(dir, { premises: { issue: 5 }, timeLimitMs: { epic: 9 * MIN } }));
	assert.equal(reviewTemplateFor('issue', s).maxPremises, 5);
	assert.equal(reviewTemplateFor('spec', s).maxPremises, 16, 'an unset value keeps its default');
	assert.equal(reviewDeadlineMs('epic', s), 9 * MIN);
	assert.equal(reviewDeadlineMs('issue', s), 12 * MIN);
}));

test('T15 a value that is not a positive whole number falls back to its default', () => withTmp((dir) => {
	const s = readDesignReviewSettings(writeConfig(dir, {
		premises: { issue: 0, spec: -3 }, timeLimitMs: { issue: 'soon', feature: 1.5, epic: null },
	}));
	assert.deepEqual(s, DEFAULT_DESIGN_REVIEW_SETTINGS);
}));

test('T15 a limit above 30 minutes is reduced to 30; the hard cap cannot be raised', () => withTmp((dir) => {
	assert.equal(HARD_REVIEW_DEADLINE_MS, 30 * MIN);
	const s = readDesignReviewSettings(writeConfig(dir, { timeLimitMs: { issue: 90 * MIN, feature: 30 * MIN + 1, epic: 30 * MIN } }));
	assert.equal(reviewDeadlineMs('issue', s), 30 * MIN);
	assert.equal(reviewDeadlineMs('feature', s), 30 * MIN);
	assert.equal(reviewDeadlineMs('epic', s), 30 * MIN);
}));

test('T15 the settings are declared in the config catalog with the same defaults', () => {
	const byPath = new Map(CONFIG_CATALOG.map(o => [o.path, o] as const));
	const d = DEFAULT_DESIGN_REVIEW_SETTINGS;
	const expected: Record<string, number> = {
		'designReview.premises.issue': d.premises.issue,
		'designReview.premises.spec': d.premises.spec,
		'designReview.timeLimitMs.issue': d.timeLimitMs.issue,
		'designReview.timeLimitMs.feature': d.timeLimitMs.feature,
		'designReview.timeLimitMs.epic': d.timeLimitMs.epic,
	};
	for (const [path, value] of Object.entries(expected)) {
		const opt = byPath.get(path);
		assert.ok(opt !== undefined, `${path} is declared`);
		assert.equal(opt.type, 'number');
		assert.equal(opt.default, value, path);
	}
});

// --- prompt ------------------------------------------------------------------

test('the prompt gives instructions, then the checklist, then the design last', () => {
	const t = reviewTemplateFor('spec', DEFAULT_DESIGN_REVIEW_SETTINGS);
	const p = buildTemplateReviewPrompt(t, '# THE DESIGN BODY', 'design.story');
	assert.ok(p.system.includes('insrc analyze'), 'the reviewer is told to use insrc analyze for drill-down');
	assert.ok(p.system.includes('insrc_analyze_step'));
	assert.ok(p.system.includes('at most 16 premises'));
	assert.ok(p.system.includes('Never report `does-not-hold` because you did not look'));
	for (const it of t.items) assert.ok(p.user.includes(`\`${it.id}\``), `the checklist names ${it.id}`);
	const checklistAt = p.user.indexOf('--- CHECKLIST');
	const designAt = p.user.indexOf('--- DESIGN');
	assert.ok(checklistAt !== -1 && designAt > checklistAt);
	assert.ok(p.user.endsWith('# THE DESIGN BODY'), 'the design is the tail of the prompt');
	const issue = buildTemplateReviewPrompt(reviewTemplateFor('issue', DEFAULT_DESIGN_REVIEW_SETTINGS), 'x', 'design.story');
	assert.ok(issue.system.includes('at most 8 premises') && issue.user.includes('`fix-targets-defect`'));
});

// --- T3 ----------------------------------------------------------------------

const SPEC = reviewTemplateFor('spec', DEFAULT_DESIGN_REVIEW_SETTINGS);

function errorsOf(answer: RawTemplateAnswer | undefined, template: ReviewTemplate = SPEC): readonly string[] {
	const r = validateTemplateAnswer(template, answer);
	return r.ok ? [] : r.errors;
}

test('T3 a complete answer is accepted and becomes findings', () => {
	const a = validAnswer(SPEC);
	a.items[0]!.premises.push({ premise: 'second claim', outcome: 'does-not-hold', severity: 'HIGH', evidence: 'line 12 says otherwise', action: 'fix the anchor', files: ['src/a.ts'] });
	a.items[1]!.premises = [{ premise: 'third claim', outcome: 'could-not-verify', evidence: 'tried insrc analyze; the daemon was down', action: 'retry' }];
	const r = validateTemplateAnswer(SPEC, a);
	assert.ok(r.ok);
	assert.equal(r.findings.length, 9);
	const wrong = r.findings.find(f => f.outcome === 'does-not-hold')!;
	assert.deepEqual([wrong.claimId, wrong.item, wrong.ref, wrong.severity, wrong.fixability], ['coverage-of-intent.2', 'coverage-of-intent', 'coverage-of-intent', 'HIGH', 'manual']);
	assert.ok(wrong.evidence.includes('src/a.ts'), 'the file the finding rests on is kept in the evidence');
	const unsure = r.findings.find(f => f.outcome === 'could-not-verify')!;
	assert.equal(unsure.severity, 'LOW');
	assert.equal(r.findings.filter(f => f.outcome === 'holds').every(f => f.severity === 'LOW'), true);
});

test('T3 `not applicable` with a reason counts as answered and is not a finding', () => {
	const a = validAnswer(SPEC);
	const b = a.items.find(i => i.item === 'boundaries')!;
	b.premises = [];
	b.notApplicable = 'a standalone Story has no adjacent boundary';
	const r = validateTemplateAnswer(SPEC, a);
	assert.ok(r.ok);
	assert.equal(r.findings.length, 7);
	assert.ok(!r.findings.some(f => f.item === 'boundaries'));
});

test('T3 an unanswered item is rejected', () => {
	const a = validAnswer(SPEC);
	a.items = a.items.filter(i => i.item !== 'tests');
	assert.deepEqual(errorsOf(a), ['check item `tests` is not answered']);
});

test('T3 an item with neither a premise nor a reason is rejected', () => {
	const a = validAnswer(SPEC);
	a.items[2]!.premises = [];
	assert.deepEqual(errorsOf(a), ['check item `new-versus-reuse` has no premise and no `notApplicable` reason']);
	a.items[2]!.notApplicable = '   ';
	assert.equal(errorsOf(a).length, 1, 'a blank reason is no reason');
});

test('T3 more premises than the threshold is rejected; exactly the threshold is accepted', () => {
	const fill = (n: number) => {
		const a = validAnswer(SPEC);
		for (let i = SPEC.items.length; i < n; i++) a.items[0]!.premises.push({ premise: `extra ${i}`, outcome: 'holds', evidence: 'checked', action: '' });
		return a;
	};
	assert.deepEqual(errorsOf(fill(16)), []);
	assert.deepEqual(errorsOf(fill(17)), ['17 premises were examined; template `design-spec` allows at most 16']);
	const tight = { ...SPEC, maxPremises: 8 };
	assert.deepEqual(errorsOf(validAnswer(SPEC), tight), []);
	assert.equal(errorsOf(fill(9), tight).length, 1);
});

test('T3 an invalid outcome is rejected', () => {
	const a = validAnswer(SPEC);
	a.items[0]!.premises[0]!['outcome'] = 'probably-fine';
	assert.deepEqual(errorsOf(a), ['check item `coverage-of-intent`, premise 1: outcome `probably-fine` is not one of holds, does-not-hold, could-not-verify']);
	delete a.items[0]!.premises[0]!['outcome'];
	assert.equal(errorsOf(a).length, 1);
});

test('T3 a premise that does not hold must name the file it rests on', () => {
	const a = validAnswer(SPEC);
	a.items[0]!.premises[0] = { premise: 'p', outcome: 'does-not-hold', evidence: 'it is wrong', action: 'fix' };
	assert.deepEqual(errorsOf(a), ['check item `coverage-of-intent`, premise 1: a premise that does not hold must name the file it rests on']);
	a.items[0]!.premises[0]!['files'] = ['', '  '];
	assert.equal(errorsOf(a).length, 1, 'blank file names do not count');
	a.items[0]!.premises[0]!['files'] = ['src/a.ts'];
	assert.deepEqual(errorsOf(a), []);
});

test('T3 an unverified premise must say what was tried', () => {
	const a = validAnswer(SPEC);
	a.items[0]!.premises[0] = { premise: 'p', outcome: 'could-not-verify', evidence: ' ', action: '' };
	assert.deepEqual(errorsOf(a), ['check item `coverage-of-intent`, premise 1: an unverified premise must say what was tried and what was missing']);
});

test('T3 an unknown or repeated item, and a missing items array, are rejected', () => {
	const a = validAnswer(SPEC);
	a.items.push({ item: 'made-up', premises: [{ premise: 'p', outcome: 'holds', evidence: 'e', action: '' }] });
	assert.deepEqual(errorsOf(a), ['`made-up` is not a check item of template `design-spec`']);
	const b = validAnswer(SPEC);
	b.items.push({ ...b.items[0]! });
	assert.deepEqual(errorsOf(b), ['check item `coverage-of-intent` is answered more than once']);
	assert.deepEqual(errorsOf(undefined), ['the answer has no `items` array']);
	assert.deepEqual(errorsOf({ items: 'nope' }), ['the answer has no `items` array']);
	// An ISSUE-template id is not a SPEC-template item.
	const c = validAnswer(SPEC);
	c.items[0]!.item = 'fix-targets-defect';
	assert.equal(errorsOf(c).length, 2, 'the unknown id, and the item it displaced is unanswered');
});

test('T3 every error in an answer is reported, not just the first', () => {
	const a = validAnswer(SPEC);
	a.items[0]!.premises[0]!['outcome'] = 'nope';
	a.items[1]!.premises = [];
	a.items = a.items.filter(i => i.item !== 'tests');
	assert.equal(errorsOf(a).length, 3);
});
