/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_review_step` on a DESIGN document: `start` hands the controller the
 * review template, and `findings` validates the answer with the same rules as
 * the reviewer session and records the review on the lifecycle. Every other artifact keeps
 * start → claims → verdicts.
 * (LLD-f2f08ccf89f8ab25-S001, test T13.)
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { DEFAULT_DESIGN_REVIEW_SETTINGS, reviewTemplateFor, validateTemplateAnswer } from '../../../../workflow/review/template.js';
import type { ReviewTemplate } from '../../../../workflow/review/template.js';
import { handleInsrcSchema } from '../../../../mcp/schema/handler.js';
import type { InsrcSchemaOk } from '../../../../mcp/schema/schema.js';
import { buildInsrcMcpServerWithRegistry } from '../../../../mcp/server.js';
import { readReviewRecordOf } from '../../../../workflow/review/report-file.js';
import { handleReviewStep } from '../handler.js';
import { FIXTURE_HASH, idOfWorkflow, writeDesign } from './review-fixture.js';
import { _clearReviewStateStoreForTests } from '../state-store.js';

const SPEC = reviewTemplateFor('spec', DEFAULT_DESIGN_REVIEW_SETTINGS);
const ISSUE = reviewTemplateFor('issue', DEFAULT_DESIGN_REVIEW_SETTINGS);
const DESIGN_MD = '# LLD\n\nThe design body.\n';

function fixture(opts: { workflow?: string; issue?: boolean; priorReview?: boolean } = {}) {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-review-findings-'));
	if (opts.issue === true) { mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true }); writeFileSync(join(repo, '.insrc', 'artifacts', `ISSUE-${FIXTURE_HASH}.json`), '{}'); }
	const workflow = opts.workflow ?? 'design.story';
	const { mdPath, jsonPath } = writeDesign(
		repo, idOfWorkflow(workflow),
		{ meta: { workflow, storyId: 's1', authoredBy: 'daemon' }, body: { note: 'untouched' } },
		opts.priorReview === true ? `${DESIGN_MD}\n<!-- insrc:review -->\n\n## Review\n\nOLD REVIEW TEXT\n` : DESIGN_MD,
	);
	return { repo, mdPath, jsonPath, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

function parse(env: { content: { text: string }[] }): Record<string, unknown> {
	return JSON.parse(env.content[0]!.text) as Record<string, unknown>;
}

function answer(template: ReviewTemplate, extra: Record<string, Record<string, unknown>> = {}): { items: Record<string, unknown>[] } {
	return {
		items: template.items.map(it => ({
			item: it.id,
			premises: [extra[it.id] ?? { premise: `claim under ${it.id}`, outcome: 'holds', evidence: 'read the function body', action: '' }],
		})),
	};
}

async function start(fx: ReturnType<typeof fixture>): Promise<Record<string, unknown>> {
	return parse(await handleReviewStep({ phase: 'start', artifact: fx.mdPath, repo: fx.repo }));
}

test('T13 start on a design returns the review template with next emit_findings', async () => {
	_clearReviewStateStoreForTests();
	const fx = fixture({ priorReview: true });
	try {
		const out = await start(fx);
		assert.equal(out['next'], 'emit_findings');
		assert.equal(out['stage'], 'design.story');
		assert.equal(out['template'], 'design-spec');
		const prompt = out['prompt'] as { system: string; user: string };
		assert.ok(prompt.system.includes('insrc analyze'));
		assert.ok(prompt.user.includes('checklist `design-spec`') && prompt.user.includes('`boundaries`'));
		assert.ok(prompt.user.includes('The design body.'));
		assert.ok(!prompt.user.includes('OLD REVIEW TEXT'), 'an earlier review is not shown to the reviewer');
		const schema = out['schema'] as { required?: string[] };
		assert.deepEqual(schema.required, ['items']);
		assert.ok(typeof out['state'] === 'string' && (out['state'] as string).length > 0);
		assert.ok((out['guidance'] as string).includes('phase="findings"'));
	} finally { fx.cleanup(); }
});

test('T13 a design that answers an ISSUE gets the ISSUE template; an HLD is a design too', async () => {
	_clearReviewStateStoreForTests();
	const issue = fixture({ issue: true });
	const hld = fixture({ workflow: 'design.epic' });
	try {
		const a = await start(issue);
		assert.equal(a['template'], 'design-issue');
		assert.ok((a['prompt'] as { user: string }).user.includes('`fix-targets-defect`'));
		assert.equal((await start(hld))['next'], 'emit_findings');
	} finally { issue.cleanup(); hld.cleanup(); }
});

test('T13 the findings phase records the review and does not edit the design', async () => {
	_clearReviewStateStoreForTests();
	const fx = fixture({ priorReview: true });
	try {
		const state = (await start(fx))['state'] as string;
		const out = parse(await handleReviewStep({
			phase: 'findings', state,
			findings: answer(SPEC, {
				'change-sites': { premise: 'the phase list is complete', outcome: 'does-not-hold', severity: 'HIGH', evidence: 'server.ts also lists it', action: 'add it', files: ['src/mcp/server.ts'] },
				'error-paths':  { premise: 'both CLIs can do it', outcome: 'could-not-verify', evidence: 'no live run was possible', action: 'probe' },
			}),
		}));
		assert.equal(out['next'], 'done');
		assert.equal(out['verdict'], 'block');
		assert.deepEqual(out['counts'], { high: 1, med: 0, low: 7, unverified: 1 });
		assert.equal(out['applied'], 0);
		assert.equal(out['pending'], 2, 'the wrong premise and the unverified one; not the six that hold');
		assert.ok((out['report'] as string).includes('#### Does not hold (blocks approval)'));

		const stored = JSON.parse(readFileSync(fx.jsonPath, 'utf8'));
		// the review is the lifecycle's; its report is the review entry of the artifact's log
		const report = readReviewRecordOf(fx.jsonPath)!.report;
		assert.equal(report.model, 'client');
		// T4 (LLD-1716f77ba9ba017b-S001): the findings phase is the controller's review.
		assert.equal(report.reviewedBy, 'controller');
		assert.equal(stored.meta.lifecycle.review.party, 'controller');
		assert.equal(report.template, 'design-spec');
		assert.equal(report.findings.length, 8);
		assert.equal(stored.meta.review, undefined, 'the head carries no review stamp');
		assert.deepEqual(stored.body, { note: 'untouched' });
		const md = readFileSync(fx.mdPath, 'utf8');
		assert.ok(md.includes(DESIGN_MD.trimEnd()));
		assert.ok(md.includes('#### Could not verify (does not block)'));
		assert.ok(!md.includes('OLD REVIEW TEXT'), 'the earlier review section is replaced, not stacked');
		assert.equal(md.split('<!-- insrc:review -->').length, 2);

		// The run is finished: its state token is released.
		const again = parse(await handleReviewStep({ phase: 'findings', state, findings: answer(SPEC) }));
		assert.equal(again['next'], 'error');
	} finally { fx.cleanup(); }
});

test('T13 an answer the session path rejects is rejected by the findings phase with the same errors, and nothing is recorded', async () => {
	_clearReviewStateStoreForTests();
	const fx = fixture();
	try {
		const state = (await start(fx))['state'] as string;
		const bad = answer(SPEC, { 'change-sites': { premise: 'p', outcome: 'does-not-hold', evidence: 'wrong', action: 'fix' } });
		bad.items = bad.items.filter(i => i['item'] !== 'tests');
		const sessionPath = validateTemplateAnswer(SPEC, bad);
		assert.ok(!sessionPath.ok && sessionPath.errors.length === 2);

		const beforeJson = readFileSync(fx.jsonPath, 'utf8');
		const beforeMd = readFileSync(fx.mdPath, 'utf8');
		const out = parse(await handleReviewStep({ phase: 'findings', state, findings: bad }));
		assert.equal(out['next'], 'error');
		const err = out['error'] as { code: string; message: string; retryable: boolean };
		assert.equal(err.code, 'invalid-findings');
		assert.equal(err.retryable, true);
		for (const e of sessionPath.errors) assert.ok(err.message.includes(e), `the same error is reported: ${e}`);
		assert.equal(readFileSync(fx.jsonPath, 'utf8'), beforeJson);
		assert.equal(readFileSync(fx.mdPath, 'utf8'), beforeMd);

		// The state is kept, so the corrected answer goes through on the same token.
		const fixed = parse(await handleReviewStep({ phase: 'findings', state, findings: answer(SPEC) }));
		assert.equal(fixed['next'], 'done');
		assert.equal(fixed['verdict'], 'pass');
	} finally { fx.cleanup(); }
});

test('T13 the two paths do not cross: no claims on a design run, no findings on a non-design run', async () => {
	_clearReviewStateStoreForTests();
	const design = fixture();
	const plan = fixture({ workflow: 'plan' });
	try {
		const ds = (await start(design))['state'] as string;
		const claims = parse(await handleReviewStep({ phase: 'claims', state: ds, claims: { claims: [] } }));
		assert.equal(claims['next'], 'error');
		assert.match((claims['error'] as { message: string }).message, /call phase='findings'/);

		const ps = (await start(plan))['state'] as string;
		const findings = parse(await handleReviewStep({ phase: 'findings', state: ps, findings: answer(SPEC) }));
		assert.equal(findings['next'], 'error');
		assert.match((findings['error'] as { message: string }).message, /not a design document/);
		assert.equal(JSON.parse(readFileSync(plan.jsonPath, 'utf8')).meta.review, undefined);
	} finally { design.cleanup(); plan.cleanup(); }
});

test('T13 on a DEF, an ISSUE and a PLAN start still returns the extract prompt', async () => {
	_clearReviewStateStoreForTests();
	for (const workflow of ['define', 'issue', 'plan']) {
		const fx = fixture({ workflow, issue: true });
		try {
			const out = await start(fx);
			assert.equal(out['next'], 'emit_claims', workflow);
			assert.equal(out['template'], undefined);
			assert.ok((out['prompt'] as { system: string }).system.includes('LOAD-BEARING PREMISES'));
		} finally { fx.cleanup(); }
	}
});

test('T4 the findings phase records the controller on an HLD too', async () => {
	_clearReviewStateStoreForTests();
	const fx = fixture({ workflow: 'design.epic' });
	try {
		const state = (await start(fx))['state'] as string;
		const out = parse(await handleReviewStep({ phase: 'findings', state, findings: answer(SPEC) }));
		assert.equal(out['next'], 'done');
		const review = readReviewRecordOf(fx.jsonPath)!.report;
		assert.equal(review.stage, 'design.epic');
		assert.equal(review.reviewedBy, 'controller');
	} finally { fx.cleanup(); }
});

test('T13 the registered tool accepts phase `findings` and its phase list names it', () => {
	const { schemaRegistry } = buildInsrcMcpServerWithRegistry();
	const record = schemaRegistry.get('insrc_review_step');
	assert.ok(record !== undefined);
	assert.deepEqual(record.phases, ['start', 'claims', 'verdicts', 'findings']);
	const r = handleInsrcSchema({ tool: 'insrc_review_step', phase: 'findings' }, schemaRegistry);
	assert.ok(!('error' in r), JSON.stringify(r));
	const schema = (r as InsrcSchemaOk).schema as { properties?: Record<string, { enum?: string[] }> };
	assert.ok(schema.properties?.['phase']?.enum?.includes('findings'), 'the input validation admits the phase');
	assert.ok(schema.properties?.['findings'] !== undefined, 'the findings argument is declared');
	// An unknown phase is still refused.
	assert.ok('error' in handleInsrcSchema({ tool: 'insrc_review_step', phase: 'nope' }, schemaRegistry));
});

test('T13 the ISSUE template is validated against its own items', async () => {
	_clearReviewStateStoreForTests();
	const fx = fixture({ issue: true });
	try {
		const state = (await start(fx))['state'] as string;
		// A SPEC-shaped answer does not fit the ISSUE checklist.
		const wrong = parse(await handleReviewStep({ phase: 'findings', state, findings: answer(SPEC) }));
		assert.equal(wrong['next'], 'error');
		const ok = parse(await handleReviewStep({ phase: 'findings', state, findings: answer(ISSUE) }));
		assert.equal(ok['next'], 'done');
		assert.equal(readReviewRecordOf(fx.jsonPath)!.report.template, 'design-issue');
	} finally { fx.cleanup(); }
});

test('review-step-findings.test.ts: the findings phase binds the review to the lifecycle through persistReview', async () => {
	_clearReviewStateStoreForTests();
	for (const workflow of ['design.story', 'design.epic']) {
		const fx = fixture({ workflow });
		try {
			const state = (await start(fx))['state'] as string;
			const out = parse(await handleReviewStep({ phase: 'findings', state, findings: answer(SPEC, { 'change-sites': { premise: 'p', outcome: 'does-not-hold', severity: 'MED', evidence: 'e', action: 'a', files: ['src/mcp/server.ts'] } }) }));
			assert.equal(out['next'], 'done', `${workflow}: ${JSON.stringify(out['error'])}`);

			// the lifecycle review is bound to the revision the head is at, names the party and holds the verdict and counts of the report
			const head = JSON.parse(readFileSync(fx.jsonPath, 'utf8')) as { meta: { lifecycle: { status: string; revision: { number: number }; review: { revision: number; party: string; verdict: string; counts: Record<string, number>; report: { entityId: string; type: string; relation: string; fragment: string } } } } };
			const review = head.meta.lifecycle.review;
			assert.equal(review.revision, head.meta.lifecycle.revision.number, `${workflow}: bound to the revision`);
			assert.equal(review.party, 'controller');
			assert.equal(review.verdict, 'block', 'a MED that does not hold blocks');
			assert.deepEqual([review.counts['high'], review.counts['med']], [0, 1]);
			assert.equal(head.meta.lifecycle.status, 'draft', 'a review leaves the head a draft');

			// and the Reference names the log entry that holds the full report
			const id = idOfWorkflow(workflow);
			assert.deepEqual([review.report.entityId, review.report.type, review.report.relation], [id, 'change-log-entry', 'reviews']);
			const record = readReviewRecordOf(fx.jsonPath);
			assert.equal(record?.report.findings.length, 8);
			const log = readFileSync(join(fx.repo, '.insrc', 'artifacts', `${id}.log.jsonl`), 'utf8');
			assert.ok(log.includes(review.report.fragment), 'the review entry is in the log file');
		} finally { fx.cleanup(); }
	}
});
