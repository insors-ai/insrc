/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `finalizeArtifact` stamps the author party it is given, and writes what it
 * always wrote when given none.
 * (LLD-1716f77ba9ba017b-S001, test T2; plan task t2.)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { finalizeArtifact } from '../orchestrator.js';
import type { WorkflowIntent } from '../types.js';

const INTENT: WorkflowIntent = { workflow: 'stub', focus: 'demo stub run', repoPath: '/tmp/insrc-author-stamp', repoIndexedAt: null, params: {} };
const STEPS = { s1: { echoed: 'alpha' } };
const EMIT = {
	body: { title: 'Demo', summary: 'A demo summary grounded in a step [[c1]].', bulletList: ['first point [[c1]]'] },
	citations: [{ id: 'c1', kind: 'step-output', ref: 's1' }],
};

interface Stored { meta: Record<string, unknown>; body: unknown; citations: unknown }

async function finalize(authoredBy?: 'controller' | 'daemon') {
	const r = authoredBy === undefined
		? await finalizeArtifact(INTENT, STEPS, 'wf-author', 5, EMIT)
		: await finalizeArtifact(INTENT, STEPS, 'wf-author', 5, EMIT, undefined, undefined, authoredBy);
	assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.failure));
	return r.finalized;
}

/** The meta without the two values that differ between any two runs. */
function stable(meta: Record<string, unknown>): Record<string, unknown> {
	const { createdAt: _c, authoredBy: _a, ...rest } = meta;
	return rest;
}

test('T2 given no author, finalizeArtifact writes no author field', async () => {
	const f = await finalize();
	const meta = (f.artifact as Stored).meta;
	assert.ok(!('authoredBy' in meta));
	assert.ok(!f.renderedJson.includes('authoredBy'));
	assert.equal(f.renderedJson, JSON.stringify(f.artifact, null, 2) + '\n');
});

for (const party of ['controller', 'daemon'] as const) {
	test(`T2 given ${party}, finalizeArtifact stamps it in the artifact and in the json it renders`, async () => {
		const f = await finalize(party);
		assert.equal((f.artifact as Stored).meta['authoredBy'], party);
		const stored = JSON.parse(f.renderedJson) as Stored;
		assert.equal(stored.meta['authoredBy'], party, 'the json that is written to disk carries it');
		assert.equal(f.renderedJson, JSON.stringify(f.artifact, null, 2) + '\n', 'artifact and json do not disagree');
	});
}

test('T2 the author is the ONLY difference the argument makes', async () => {
	const plain = await finalize();
	const stamped = await finalize('daemon');
	assert.equal(stamped.renderedMd, plain.renderedMd, 'the document is the same');
	assert.equal(stamped.workflow, plain.workflow);
	const a = plain.artifact as Stored, b = stamped.artifact as Stored;
	assert.deepEqual(stable(b.meta), stable(a.meta));
	assert.deepEqual(b.body, a.body);
	assert.deepEqual(b.citations, a.citations);
});

test('T2 a finalize that fails is returned as it is, with no author added', async () => {
	const bad = { body: EMIT.body, citations: 'not-an-array' };
	const r = await finalizeArtifact(INTENT, STEPS, 'wf-author', 5, bad, undefined, undefined, 'daemon');
	assert.equal(r.ok, false);
	assert.ok(!JSON.stringify(r).includes('authoredBy'));
});
