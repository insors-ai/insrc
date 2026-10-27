import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ThreadServices } from '../../../threads/main-services.js';
import { LocalStepStateStore } from '../../../threads/step-state.js';
import { Router } from '../../../threads/router.js';
import { Supervisor } from '../../../threads/supervisor.js';
import { directDispatch } from '../../../server.js';
import type { MethodClass } from '../../../threads/channel.js';
import type { IpcStreamMessage } from '../../../../shared/types.js';
import { writeDesign, idOfWorkflow } from './review-fixture.js';
import { CONTROLLER_DECLARATION } from './terminal-client.js';
import { reviewTemplateFor } from '../../../../workflow/review/template.js';

async function until(check: () => boolean) { for (let n = 0; n < 1000; n++) { if (check()) return; await delay(10); } throw new Error('worker test timed out'); }
test('two real design-review workers cannot persist the same terminal call twice', { timeout: 30000 }, async () => {
	const repo = mkdtempSync(join(tmpdir(), 'review-controller-workers-'));
	const fx = writeDesign(repo, idOfWorkflow('design.story'), { meta: { workflow: 'design.story', authoredBy: 'daemon' }, body: { summary: 'Review this design.' } }, '# Complete design');
	const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: '' }), new LocalStepStateStore());
	let selected: MethodClass = 'admin', seq = 0;
	const router = new Router({ classOf: () => selected, registry: services.registry, routed: new Set(['admin', 'indexing']), local: directDispatch({}) });
	const supervisor = new Supervisor({ services, router, shutdown: () => { throw new Error('unexpected shutdown'); } });
	const send = (args: unknown) => {
		const frames: IpcStreamMessage[] = [];
		router.forward({ kind: 'request', requestId: `design-worker-${++seq}`, method: 'step.call', params: { tool: 'insrc_review_step', args, context: { cwd: repo } }, stream: true, trustedContext: { connectionIdentity: `design-${seq}`, daemonEpoch: 'test' } }, e => {
			if (e.kind === 'frame') frames.push(e.frame as IpcStreamMessage);
		}); return frames;
	};
	const done = async (frames: IpcStreamMessage[]) => { await until(() => frames.some(f => f.stream === 'done')); return JSON.parse((frames.at(-1)!.data as { content: { text: string }[] }).content[0]!.text); };
	try {
		let held = false;
		const first = await supervisor.start({ name: 'design-review-a', cls: 'admin', script: '__tests__/helpers/review-controller-worker', started: item => item.worker.on('message', m => { if (m?.event === 'inspect-held') held = true; }) });
		await supervisor.start({ name: 'design-review-b', cls: 'indexing', script: '__tests__/helpers/review-controller-worker' });
		const start = await done(send({ phase: 'start', artifact: fx.mdPath, repo, reviewBudget: CONTROLLER_DECLARATION }));
		assert.equal(start.next, 'emit_findings', JSON.stringify(start));
		const answer = { items: reviewTemplateFor('spec').items.map(item => ({ item: item.id, premises: [{ premise: 'checked', outcome: 'holds', evidence: 'inspected', action: '' }] })) };
		const input = { phase: 'findings', state: start.state, reviewBudget: CONTROLLER_DECLARATION, reply: { version: 1, generation: start.call.generation, callId: start.call.callId, answer } };
		const active = send({ ...input, holdInspect: true }); await until(() => held);
		selected = 'indexing';
		const duplicate = await done(send(input)); assert.match(JSON.stringify(duplicate), /review-state-busy/);
		first.worker.postMessage({ release: true }); assert.equal((await done(active)).next, 'done');
		const head = readFileSync(fx.jsonPath, 'utf8');
		assert.equal((await done(send(input))).next, 'already_completed'); assert.equal(readFileSync(fx.jsonPath, 'utf8'), head);
	} finally { supervisor.stop(); await supervisor.terminateAll(); rmSync(repo, { recursive: true, force: true }); }
});
