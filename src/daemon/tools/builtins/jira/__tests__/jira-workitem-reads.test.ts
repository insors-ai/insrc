import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import type { ToolResult } from '../../../types.js';
import { WORKITEM_READ_OPS, jiraWorkitemTool } from '../workitem.js';
import { installFakeAcli } from './_fakeacli.js';
import { deps } from './_sample.js';

const fixture = (name: string): string => readFileSync(join(fileURLToPath(new URL('./fixtures/', import.meta.url)), name), 'utf8');

/** Run one op against a fake acli that prints `stdout`; the result and the argv acli saw. */
async function run(input: Record<string, unknown>, stdout: string): Promise<{ r: ToolResult; calls: string[] }> {
  const fake = installFakeAcli('ok', { stdout });
  try { const r = await jiraWorkitemTool.execute(input, deps()); return { r, calls: fake.calls() }; } finally { fake.restore(); }
}
const outputOk = (data: unknown): boolean => validateAgainstSchema(jiraWorkitemTool.outputSchema as unknown as StructuredSchema, data).ok;

test('jira-workitem-reads.test.ts: each read op returns its declared shape and its argv matches acli', async () => {
  assert.deepEqual(WORKITEM_READ_OPS.map(o => [o.name, o.cls]), [['view', 'none'], ['search', 'none'], ['count', 'none'], ['attachment-list', 'none'], ['watcher-list', 'none']]);
  assert.deepEqual(WORKITEM_READ_OPS.map(o => o.limitS), [30, 60, 60, 30, 30]);

  const view = await run({ op: 'view', key: 'IN-1', fields: ['key', 'summary'] }, fixture('view.json'));
  assert.deepEqual(view.calls, ['jira workitem view IN-1 --fields=key,summary --json']);
  assert.equal(view.r.success, true);
  const item = (view.r.data as { item: Record<string, unknown> }).item;
  assert.equal(item['key'], 'IN-1');
  assert.equal(item['id'], '10036');
  assert.ok(!('changelog' in item), 'null properties are dropped');
  assert.ok(outputOk(view.r.data));

  const search = await run({ op: 'search', jql: 'project = "IN" ORDER BY created DESC', limit: 5, fields: ['key', 'summary'] }, fixture('search.json'));
  assert.deepEqual(search.calls, ['jira workitem search --jql=project = "IN" ORDER BY created DESC --limit 5 --fields=key,summary --json']);
  const s = search.r.data as { count: number; items: { key: string }[] };
  assert.equal(s.count, 2);
  assert.deepEqual(s.items.map(i => i.key), ['IN-2', 'IN-1']);
  assert.ok(outputOk(search.r.data));
  // an empty search prints [] and is an empty answer, not a failure
  const none = await run({ op: 'search', jql: 'project = "IN" AND key = "IN-99"' }, '[]');
  assert.deepEqual(none.r.data, { op: 'search', count: 0, items: [] });

  const count = await run({ op: 'count', jql: 'project = "IN"' }, fixture('count.txt'));
  assert.deepEqual(count.calls, ['jira workitem search --jql=project = "IN" --count']);
  assert.deepEqual(count.r.data, { op: 'count', count: 2 });

  const attachments = await run({ op: 'attachment-list', key: 'IN-1' }, fixture('attachment-list.json'));
  assert.deepEqual(attachments.calls, ['jira workitem attachment list --key IN-1 --json']);
  assert.deepEqual(attachments.r.data, { op: 'attachment-list', count: 0, attachments: [] });

  const watchers = await run({ op: 'watcher-list', key: 'IN-1' }, fixture('watcher-list.json'));
  assert.deepEqual(watchers.calls, ['jira workitem list-watchers --key IN-1 --json']);
  const w = watchers.r.data as { count: number; watchers: unknown[] };
  assert.equal(w.count, 1);
  assert.equal(w.watchers.length, 1);
  assert.ok(outputOk(watchers.r.data));

  // text that is not what the op expects is a rejected failure, never a guessed answer
  for (const [input, text] of [[{ op: 'view', key: 'IN-1' }, 'oops'], [{ op: 'search', jql: 'x' }, '{}'], [{ op: 'count', jql: 'x' }, '3 items'], [{ op: 'attachment-list', key: 'IN-1' }, '[]'], [{ op: 'watcher-list', key: 'IN-1' }, '{}']] as const) {
    const bad = await run({ ...input }, text);
    assert.equal(bad.r.success, false, input.op);
    assert.equal(bad.r.failure?.kind, 'rejected', input.op);
    assert.equal(bad.r.failure?.original, text);
  }
});

test('jira-workitem-reads.test.ts: search and count take exactly one of jql and filter and search is limited', async () => {
  for (const op of ['search', 'count']) {
    for (const input of [{ op, jql: 'a', filter: '1' }, { op }]) {
      const { r, calls } = await run(input, '[]');
      assert.equal(r.failure?.kind, 'rejected', JSON.stringify(input));
      assert.match(r.failure?.message ?? '', /exactly one of jql, filter/);
      assert.deepEqual(calls, []);
    }
  }
  const byFilter = await run({ op: 'search', filter: '10001' }, '[]');
  assert.deepEqual(byFilter.calls, ['jira workitem search --filter=10001 --limit 50 --json']);
  // a finite --limit (50 by default) and never --paginate
  const dflt = await run({ op: 'search', jql: 'project = "IN"' }, '[]');
  assert.deepEqual(dflt.calls, ['jira workitem search --jql=project = "IN" --limit 50 --json']);
  for (const c of [...dflt.calls, ...byFilter.calls]) { assert.ok(!c.includes('--paginate')); }
  // the schema bounds the limit to 1..500
  const schema = jiraWorkitemTool.inputSchema as unknown as StructuredSchema;
  const okIn = (i: Record<string, unknown>): boolean => validateAgainstSchema(schema, i).ok;
  assert.equal(okIn({ op: 'search', jql: 'x', limit: 500 }), true);
  assert.equal(okIn({ op: 'search', jql: 'x', limit: 501 }), false);
  assert.equal(okIn({ op: 'search', jql: 'x', limit: 0 }), false);
  assert.equal(okIn({ op: 'search', jql: 'x', paginate: true }), false);
});
