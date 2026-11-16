import assert from 'node:assert/strict';
import test from 'node:test';
import { codeReviewRequestParams, freshnessFromReply, groundingFromReply, unavailableFromError } from '../../shared/review-stream.js';
import { fetchCodeReviewFreshness, fetchCodeReviewGrounding } from '../daemon-stream.js';

test('code-review client helpers reject with the code-family rewrite error before reading params or connecting', async () => {
 let reads = 0;
 const fail = (): never => { reads++; throw new Error('Unavailable review touched a dependency'); };
 const params = new Proxy({}, {get:fail}) as never;
 const deps = new Proxy({}, {get:fail}) as never;
 for (let repeat = 0; repeat < 3; repeat++) {
  for (const helper of [fetchCodeReviewGrounding, fetchCodeReviewFreshness]) {
   await assert.rejects(helper(params, deps), {message:'Code review functionality is being rewritten.'});
  }
 }
 assert.equal(reads, 0);
});


test('legacy code-review adapters retain the code-family rewrite error', () => {
 for (const adapter of [codeReviewRequestParams, freshnessFromReply, groundingFromReply, unavailableFromError]) {
  assert.throws(() => adapter({} as never), {message:'Code review functionality is being rewritten.'});
 }
});
