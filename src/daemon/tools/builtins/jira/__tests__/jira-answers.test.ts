import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import type { BuildContext } from '../../gh/op-table.js';
import type { ToolResult } from '../../../types.js';
import { batchAnswer, countAnswer, jsonAnswer, markAnswer } from '../answers.js';

const fixture = (name: string): string => readFileSync(join(fileURLToPath(new URL('./fixtures/', import.meta.url)), name), 'utf8');
const ctx = (stdout: string, input: Record<string, unknown> = { op: 'x' }): BuildContext => ({ stdout, stderr: '', input, deps: { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 }, truncated: false });
const isFailure = (r: Record<string, unknown> | ToolResult): r is ToolResult => 'success' in r && r.success === false;

test('jira-answers.test.ts: the batch builder lists failed and succeeded ids and says the batch was partly applied', async () => {
  const ok = await batchAnswer()(ctx(fixture('batch-edit-success.json')));
  assert.deepEqual(ok, { ok: true, target: 'IN-1', message: 'Work item IN-1 has been successfully edited' });
  // all FAILURE at exit 0: the failed id and acli's message
  const allBad = await batchAnswer()(ctx(fixture('batch-missing-key.json')));
  assert.ok(isFailure(allBad));
  assert.equal(allBad.failure?.kind, 'rejected');
  assert.match(allBad.failure?.message ?? '', /IN-999: Issue does not exist/);
  assert.doesNotMatch(allBad.failure?.message ?? '', /partly applied/);
  assert.match(allBad.failure?.original ?? '', /FAILURE/);
  // partial: both ids and the words
  const partial = await batchAnswer()(ctx(fixture('batch-partial.json')));
  assert.ok(isFailure(partial));
  assert.match(partial.failure?.message ?? '', /failed: IN-999: /);
  assert.match(partial.failure?.message ?? '', /succeeded: IN-1/);
  assert.match(partial.failure?.message ?? '', /the batch was partly applied/);
  // a clone's target is the new key from the message, not the source id
  const clone = await batchAnswer({ clone: true })(ctx(fixture('batch-clone.json')));
  assert.equal((clone as Record<string, unknown>)['target'], 'IN-3');
  const plain = await batchAnswer()(ctx(fixture('batch-clone.json')));
  assert.equal((plain as Record<string, unknown>)['target'], 'IN-1');
  assert.ok(isFailure(await batchAnswer({ clone: true })(ctx(fixture('batch-edit-success.json')))), 'a clone message without a new key is a failure');
  // text that is not a batch
  const junk = await batchAnswer()(ctx('✓ done'));
  assert.ok(isFailure(junk));
  assert.equal(junk.failure?.original, '✓ done');
});

test('jira-answers.test.ts: the success-mark builder rejects any other exit-0 text', async () => {
  const target = (i: Record<string, unknown>): string => String(i['id']);
  const ok = await markAnswer(target)(ctx(fixture('comment-update.txt'), { op: 'update', id: '10001' }));
  assert.deepEqual(ok, { ok: true, target: '10001', message: 'Comment 10001 has been successfully updated on work item IN-1' });
  // the first line only, the mark removed, even when a second line follows
  const del = await markAnswer(target)(ctx(fixture('link-delete.txt'), { id: '10001' }));
  assert.equal((del as Record<string, unknown>)['message'], 'Link has been successfully deleted (10001)');
  // any other text is a rejected failure with acli's text in original
  for (const text of ['', 'done', '✗ Can not find a comment for the id: 99999.\n✗ Error: command execution failed\n', 'Link created']) {
    const r = await markAnswer(target)(ctx(text, { id: '1' }));
    assert.ok(isFailure(r), JSON.stringify(text));
    assert.equal(r.failure?.kind, 'rejected');
    if (text !== '') { assert.equal(r.failure?.original, text); }
  }
});

test('jira-answers.test.ts: the JSON and count builders read what acli printed or fail without guessing', async () => {
  const links = await jsonAnswer('a list of links', d => Array.isArray((d as { issueLinks?: unknown }).issueLinks) ? { links: (d as { issueLinks: unknown[] }).issueLinks } : undefined)(ctx(fixture('link-list.json')));
  assert.deepEqual(Object.keys(links), ['links']);
  assert.equal((links as { links: unknown[] }).links.length, 1);
  const bad = await jsonAnswer('a list of links', () => undefined)(ctx('{}'));
  assert.ok(isFailure(bad));
  assert.match(bad.failure?.message ?? '', /did not print a list of links/);
  assert.ok(isFailure(await jsonAnswer('x', d => ({ d }))(ctx('not json'))));
  assert.deepEqual(await countAnswer()(ctx(readFileSync(join(fileURLToPath(new URL('./fixtures/', import.meta.url)), 'count.txt'), 'utf8'))), { count: 2 });
  assert.ok(isFailure(await countAnswer()(ctx('no count here'))));
});
