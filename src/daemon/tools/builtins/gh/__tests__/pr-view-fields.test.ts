/**
 * gh_pr_view jsonFields (Story s10): extra gh JSON fields on top of the default ones.
 * Run: npx tsx --test-force-exit src/daemon/tools/builtins/gh/__tests__/pr-view-fields.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { Value } from '@sinclair/typebox/value';

import { cleanup } from '../../../__tests__/_proc.js';
import { ghPrViewTool } from '../pr.js';
import { GhPrRowSchema } from '../schemas.js';
import { installFakeGh } from './_fakegh.js';
import type { FakeGh } from './_fakegh.js';

const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0, conversion: undefined };
const PR = { number: 3, title: 't', state: 'MERGED', headRefName: 'b', url: 'https://x/pull/3' };
const DEFAULT_FIELDS = 'number,title,state,isDraft,author,assignees,reviewRequests,labels,baseRefName,headRefName,url,createdAt,updatedAt,additions,deletions,changedFiles,body,mergeable,mergeStateStatus';

let fake: FakeGh | undefined;
afterEach(() => { fake?.restore(); if (fake) cleanup(fake.dir); fake = undefined; });

test('pr-view-fields.test.ts: gh_pr_view with jsonFields returns mergedAt, reviewDecision and reviews; the default result is unchanged; a field outside the allowlist is rejected', async () => {
	// with jsonFields: the extra fields are asked for after the defaults and returned
	const full = { ...PR, mergedAt: '2026-10-27T10:00:00Z', reviewDecision: 'CHANGES_REQUESTED', reviews: [{ author: { login: 'r' }, state: 'CHANGES_REQUESTED', submittedAt: '2026-10-27T09:00:00Z' }] };
	fake = installFakeGh('default', undefined, { json: JSON.stringify(full) });
	const r = await ghPrViewTool.execute({ number: 3, jsonFields: ['mergedAt', 'reviewDecision', 'reviews'] }, deps);
	assert.equal(r.success, true, r.output);
	const data = r.data as typeof full;
	assert.equal(data.mergedAt, full.mergedAt);
	assert.equal(data.reviewDecision, 'CHANGES_REQUESTED');
	assert.equal(data.reviews[0]?.state, 'CHANGES_REQUESTED');
	assert.ok(Value.Check(GhPrRowSchema, data), 'the result matches the output schema');
	assert.deepEqual(fake.calls(), [`pr view 3 --json ${DEFAULT_FIELDS},mergedAt,reviewDecision,reviews`]);
	fake.restore(); cleanup(fake.dir);

	// without jsonFields: the same argument as before and the same result
	fake = installFakeGh('default', undefined, { json: JSON.stringify(PR) });
	const plain = await ghPrViewTool.execute({ number: 3 }, deps);
	assert.equal(plain.success, true, plain.output);
	assert.deepEqual(fake.calls(), [`pr view 3 --json ${DEFAULT_FIELDS}`]);
	assert.deepEqual(plain.data, PR);
	assert.equal('mergedAt' in (plain.data as object), false);

	// a field already in the defaults is not asked for twice
	fake.restore(); cleanup(fake.dir);
	fake = installFakeGh('default', undefined, { json: JSON.stringify(PR) });
	await ghPrViewTool.execute({ number: 3, jsonFields: ['state', 'url'] }, deps);
	assert.deepEqual(fake.calls(), [`pr view 3 --json ${DEFAULT_FIELDS}`]);

	// outside the allowlist: refused by the input schema and by execute, and gh is never run
	assert.equal(Value.Check(ghPrViewTool.inputSchema, { number: 3, jsonFields: ['mergedAt'] }), true);
	assert.equal(Value.Check(ghPrViewTool.inputSchema, { number: 3, jsonFields: ['body'] }), false);
	assert.equal(Value.Check(ghPrViewTool.inputSchema, { number: 3, jsonFields: ['mergedAt,body'] }), false);
	fake.restore(); cleanup(fake.dir);
	fake = installFakeGh('default', undefined, { json: JSON.stringify(PR) });
	const bad = await ghPrViewTool.execute({ number: 3, jsonFields: ['body'] }, deps);
	assert.equal(bad.success, false);
	assert.match(bad.output, /jsonFields not allowed: body/);
	assert.deepEqual(fake.calls(), []);
});
