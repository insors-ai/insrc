import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ArtifactNotFoundError } from '../types.js';
import type { Reference } from '../types.js';
import { H, alice, artifact, kit } from './store-kit.js';
import { service, stubEvidence } from './lifecycle-kit.js';

const BUILD = `BUILD-${H}-s1`;
const ref: Reference = { entityId: `PLAN-${H}-s1`, type: 'PLAN', relation: 'derived-from' };
const payload = (text: string) => ({ body: { text }, citations: [] });

describe('lifecycle-update-outcome', () => {
	it('updateContent with an outcome and references logs them with the new revision, an update without behaves as before, and an identical rewrite logs nothing', async () => {
		const k = kit();
		try {
			await k.store.write(artifact(`DEF-${H}`), alice);
			const svc = service(k, stubEvidence([]));

			// The first round is created through the store (and logged), not written behind it.
			await assert.rejects(svc.updateContent(BUILD, alice, payload('round 1')), ArtifactNotFoundError);
			await svc.updateContent(BUILD, alice, payload('round 1'), { create: true, outcome: { result: 'passed', summary: 'round 1' } });
			let log = (await k.store.readWithHistory(BUILD)).changeLog;
			assert.deepEqual(log.map(e => e.operation), ['create']);
			assert.equal(log[0]?.outcome?.summary, 'round 1');
			const first = log[0]?.revision?.number;

			// A replacement with an outcome and references: both ride on the entry, with the new revision; the first stays readable.
			await svc.updateContent(BUILD, alice, payload('round 2'), { outcome: { result: 'failed', summary: 'round 2', data: { failed: 1 } }, references: [ref] });
			log = (await k.store.readWithHistory(BUILD)).changeLog;
			assert.deepEqual(log.map(e => e.operation), ['create', 'update']);
			const second = log[1];
			assert.deepEqual(second?.outcome, { result: 'failed', summary: 'round 2', data: { failed: 1 } });
			assert.deepEqual(second?.references, [ref]);
			assert.equal(second?.revision?.number, (first ?? 0) + 1);
			assert.equal(log[0]?.outcome?.summary, 'round 1');

			// Without an outcome the entry has none, as before.
			await svc.updateContent(BUILD, alice, payload('round 3'));
			log = (await k.store.readWithHistory(BUILD)).changeLog;
			assert.equal(log.length, 3);
			assert.equal(log[2]?.outcome, undefined);
			assert.equal(log[2]?.references, undefined);

			// An identical rewrite logs nothing and moves no revision, outcome or not.
			const revision = (await k.store.read(BUILD)).lifecycle.revision.number;
			await svc.updateContent(BUILD, alice, payload('round 3'), { outcome: { result: 'passed', summary: 'again' } });
			assert.equal((await k.store.readWithHistory(BUILD)).changeLog.length, 3);
			assert.equal((await k.store.read(BUILD)).lifecycle.revision.number, revision);
		} finally { k.done(); }
	});
});
