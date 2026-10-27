import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCompletionEvidence } from '../../artifact-core/completion-evidence.js';
import { LifecycleService } from '../../artifact-core/lifecycle-service.js';
import { History } from '../../artifact-core/history.js';
import { durableKit } from '../../artifact-core/__tests__/durable-kit.js';
import type { DurableKit } from '../../artifact-core/__tests__/durable-kit.js';
import { alice, artifact, H } from '../../artifact-core/__tests__/store-kit.js';
import type { Actor } from '../../artifact-core/types.js';
import { artifactJsonPath } from '../../storage.js';
import { persistReview, ReviewPersistError, reviewEntryId } from '../persist-review.js';
import type { PersistReviewInput, PersistStep } from '../persist-review.js';
import { readReviewReport } from '../report-log.js';
import type { ReviewReport } from '../types.js';

const LLD = `LLD-${H}-s1`;
const REVIEWER: Actor = { id: 'insrc:controller', kind: 'agent', properties: {} };
const RECORDER: Actor = { id: 'insrc:review', kind: 'system', properties: {} };
const REPORT: ReviewReport = {
	artifact: 'design.story', stage: 'design.story', verdict: 'warn', findings: [], counts: { high: 0, med: 1, low: 0 },
	reviewedAt: '2026-10-22T00:00:00.000Z', model: 'client', reviewedBy: 'controller',
};

interface Rig {
	readonly kit:     DurableKit;
	readonly history: History;
	readonly service: LifecycleService;
	readonly input:   PersistReviewInput;
	readonly md:      string;
}

async function rig(): Promise<Rig> {
	const kit = durableKit();
	const history = new History(kit.sidecar);
	const service = new LifecycleService({ store: kit.store, evidence: ctx => createCompletionEvidence(kit.repo, { overrideReview: ctx.overrideReview }) });
	await kit.store.write(artifact(`DEF-${H}`), alice);
	await kit.store.write(artifact(LLD), alice);
	await history.appendFeedback(LLD, { id: 'fb1', text: 'a person asks', actor: alice, timestamp: '2026-10-21T00:00:00.000Z', feedback: [], kind: 'comment' } as never);
	const md = join(kit.repo, 'docs', 'LLD.md');
	mkdirSync(join(kit.repo, 'docs'), { recursive: true });
	writeFileSync(md, '# LLD\n');
	const input: PersistReviewInput = {
		artifactId: LLD, jsonPath: artifactJsonPath(kit.repo, LLD), mdPath: md, lifecycle: service, store: kit.store, history,
		report: REPORT, reviewer: REVIEWER, party: 'controller', recorder: RECORDER,
		fix: { body: { text: 'fixed' }, citations: [] }, markdown: '# LLD fixed\n',
	};
	return { kit, history, service, input, md };
}

/** What a run leaves behind, without the clocks and ids the store mints. */
async function stateOf(r: Rig): Promise<unknown> {
	const head = await r.kit.store.read(LLD);
	const log = await r.history.log(LLD);
	const review = head.lifecycle.review;
	return {
		status: head.lifecycle.status, revision: head.lifecycle.revision.number, body: head.payload.body,
		review: review === undefined ? null : { verdict: review.verdict, party: review.party, report: review.report?.fragment, revision: review.revision },
		reportEntries: log.filter(e => e.id === reviewEntryId(LLD, REPORT)).length,
		readBack: review === undefined ? null : (await readReviewReport(r.history, LLD, review))?.report.verdict,
		openFeedback: (await r.history.openFeedback(LLD)).map(f => f.id),
		md: readFileSync(r.md, 'utf8'),
	};
}

describe('persist-review', () => {
	it('persist-review.test.ts: a failure at each step names the step and a rerun repairs the state', async () => {
		// the reference: an uninterrupted run, in the stated order, with the lifecycle record before the markdown
		const ref = await rig();
		let expected: unknown;
		try {
			const order: string[] = [];
			const svc = ref.service;
			const apply = svc.apply.bind(svc);
			svc.apply = async (...a: Parameters<typeof svc.apply>) => { order.push('lifecycle'); return apply(...a); };
			const update = svc.updateContent.bind(svc);
			svc.updateContent = async (...a: Parameters<typeof svc.updateContent>) => { order.push('fix'); return update(...a); };
			const out = await persistReview(ref.input);
			assert.deepEqual(order, ['fix', 'lifecycle']);
			assert.deepEqual([out.fixStored, out.lifecycleRecorded, out.entryId], [true, true, reviewEntryId(LLD, REPORT)]);
			expected = await stateOf(ref);
			const s = expected as { review: { report: string }; openFeedback: string[]; md: string; revision: number; readBack: string };
			assert.equal(s.review.report, out.entryId, 'lifecycle.review names the entry that holds the full report');
			assert.equal(s.readBack, 'warn', 'and the report reads back from it');
			assert.deepEqual(s.openFeedback, ['fb1'], 'the auto-fix passed addresses [] so the feedback stays open');
			assert.ok(s.revision >= 2 && /## Review/.test(s.md) && s.md.startsWith('# LLD fixed'));
			// a repeat of the same review stores nothing new in the content and one report entry
			await persistReview(ref.input);
			assert.equal(((await stateOf(ref)) as { reportEntries: number }).reportEntries, 1);
		} finally { ref.kit.done(); }

		const cases: { step: PersistStep; stored: string[]; edited?: boolean; inject(r: Rig): PersistReviewInput }[] = [
			{ step: 'inspect', stored: [], inject: r => { r.service.inspect = async () => { throw new Error('boom inspect'); }; return r.input; } },
			{ step: 'inspect', stored: [], edited: true, inject: r => {
				// the head is edited behind the store: its stored hash no longer matches its content
				const path = artifactJsonPath(r.kit.repo, LLD);
				const head = JSON.parse(readFileSync(path, 'utf8'));
				head.body.text = 'edited behind the store';
				writeFileSync(path, JSON.stringify(head, null, 2) + '\n');
				return r.input;
			} },
			{ step: 'fix', stored: [], inject: r => { r.service.updateContent = async () => { throw new Error('boom fix'); }; return r.input; } },
			{ step: 'record-review', stored: ['the fix'], inject: r => {
				const append = r.history.appendLog.bind(r.history);
				r.history.appendLog = async (id, e) => { if (e.id === reviewEntryId(LLD, REPORT)) throw new Error('boom entry'); return append(id, e); };
				return r.input;
			} },
			{ step: 'record-review', stored: ['the fix', 'the review entry'], inject: r => { r.service.apply = async () => { throw new Error('boom lifecycle'); }; return r.input; } },
			{ step: 'render', stored: ['the fix', 'the review entry', 'lifecycle.review'], inject: r => ({ ...r.input, mdPath: join(r.kit.repo, 'docs') }) },
		];
		for (const c of cases) {
			const r = await rig();
			try {
				const failing = c.inject(r);
				await assert.rejects(persistReview(failing), (e: unknown) => e instanceof ReviewPersistError && e.step === c.step && new RegExp(`${c.step} step`).test(e.message)
					&& JSON.stringify(e.stored) === JSON.stringify(c.stored));
				if (c.edited === true) {
					// the head was edited behind the store: a person resolves it, here by bringing the stored hash to the content
					const path = artifactJsonPath(r.kit.repo, LLD);
					const head = JSON.parse(readFileSync(path, 'utf8'));
					head.body.text = 'one';
					writeFileSync(path, JSON.stringify(head, null, 2) + '\n');
				}
				// the rerun, with the faults gone, leaves the state of the uninterrupted run
				const again: PersistReviewInput = { ...r.input };
				Object.assign(r.service, { inspect: LifecycleService.prototype.inspect, updateContent: LifecycleService.prototype.updateContent, apply: LifecycleService.prototype.apply });
				delete (r.history as { appendLog?: unknown }).appendLog;
				await persistReview(again);
				assert.deepEqual(await stateOf(r), expected, `after a failure at ${c.step} (${c.stored.join(', ') || 'nothing stored'}) and a rerun`);
			} finally { r.kit.done(); }
		}
	});
});

it('source changes while history is awaited refuse immediately before append', async()=>{
 const r=await rig();let stale=false;
 const original=r.history.log.bind(r.history);
 r.history.log=async(...args)=>{const entries=await original(...args);stale=true;return entries;};
 try {
  await assert.rejects(persistReview({...r.input,fix:undefined,assertSource:()=>{if(stale)throw new Error('source changed during history wait');}}),error=>error instanceof ReviewPersistError && error.step==='record-review');
  assert.equal((await original(LLD)).filter(entry=>entry.id===reviewEntryId(LLD,REPORT)).length,0);
 }finally{r.kit.done();}
});
