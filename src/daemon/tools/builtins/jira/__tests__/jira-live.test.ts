/**
 * Live tests against the signed-in Jira site through the real acli. Gated: INSRC_LIVE_TESTS=1, and
 *   INSRC_JIRA_SCRATCH_PROJECT  a project in which work items may be created and deleted (the work item test),
 *   and for the project probe also
 *   INSRC_JIRA_PROBE_SOURCE     a company-managed project to create the scratch project from (read only),
 *   INSRC_JIRA_PROBE_KEY        the key of the scratch project the probe creates and deletes,
 *   INSRC_JIRA_PROBE_LEAD       the lead's email.
 * A test skips with its reason when its variables are not set.
 */

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import type { ToolResult } from '../../../types.js';
import type { GhFamilyTool } from '../../gh/op-table.js';
import { jiraAuthTool } from '../auth.js';
import { jiraCommentTool } from '../comment.js';
import { jiraLinkTool } from '../link.js';
import { jiraProjectTool } from '../project.js';
import { jiraWorkitemTool } from '../workitem.js';
import { deps } from './_sample.js';

const env = (k: string): string | undefined => { const v = process.env[k]; return v === undefined || v === '' ? undefined : v; };
const live = env('INSRC_LIVE_TESTS') === '1';
const scratch = env('INSRC_JIRA_SCRATCH_PROJECT');
const probe = { source: env('INSRC_JIRA_PROBE_SOURCE'), key: env('INSRC_JIRA_PROBE_KEY'), lead: env('INSRC_JIRA_PROBE_LEAD') };
const skipReads = live ? false : 'INSRC_LIVE_TESTS=1 is not set';
const skipItems = !live ? 'INSRC_LIVE_TESTS=1 is not set' : scratch === undefined ? 'INSRC_JIRA_SCRATCH_PROJECT is not set' : false;
const skipProbe = !live ? 'INSRC_LIVE_TESTS=1 is not set'
  : probe.source === undefined || probe.key === undefined || probe.lead === undefined ? 'INSRC_JIRA_PROBE_SOURCE, INSRC_JIRA_PROBE_KEY and INSRC_JIRA_PROBE_LEAD are not all set' : false;

const call = async (tool: GhFamilyTool, input: Record<string, unknown>): Promise<ToolResult> => tool.execute(input, deps());
const fits = (tool: GhFamilyTool, data: unknown): boolean => validateAgainstSchema(tool.outputSchema as unknown as StructuredSchema, data).ok;
/** A call that must succeed and fit its declared shape; the data. */
async function ok(tool: GhFamilyTool, input: Record<string, unknown>): Promise<Record<string, any>> {
  const r = await call(tool, input);
  assert.equal(r.success, true, `${tool.id} ${String(input['op'])}: ${r.failure?.message ?? r.error ?? ''}`);
  assert.ok(fits(tool, r.data), `${tool.id} ${String(input['op'])} fits its declared shape`);
  return r.data as Record<string, any>;
}

test('jira-live.test.ts: read ops view, search, count, list, types, status and visibility return their declared shape', { skip: skipReads }, async () => {
  const status = await ok(jiraAuthTool, { op: 'status' });
  assert.equal(status['signedIn'], true);
  const projects = await ok(jiraProjectTool, { op: 'list', limit: 5 });
  assert.ok(projects['count'] >= 1);
  const key = projects['projects'][0].key as string;
  assert.equal((await ok(jiraProjectTool, { op: 'view', key }))['project'].key, key);
  await ok(jiraProjectTool, { op: 'list', recent: true });
  // a project key can be a JQL word (IN): the caller quotes it
  assert.equal(typeof (await ok(jiraWorkitemTool, { op: 'count', jql: `project = "${key}"` }))['count'], 'number');
  const search = await ok(jiraWorkitemTool, { op: 'search', jql: `project = "${key}" ORDER BY created DESC`, limit: 3 });
  assert.ok(Array.isArray(search['items']));
  assert.ok((await ok(jiraLinkTool, { op: 'types' }))['types'].length >= 1);
  const groups = await ok(jiraCommentTool, { op: 'visibility', group: true });
  assert.ok(groups['groups'].length >= 1);
  assert.ok((await ok(jiraCommentTool, { op: 'visibility', role: true, project: key }))['roles'].length >= 1);
  // the reads that need a work item run on the first work item found in any project; failing that, on a temporary one in the scratch project
  let itemKey: string | undefined;
  for (const p of projects['projects'] as { key: string }[]) {
    const found = await ok(jiraWorkitemTool, { op: 'search', jql: `project = "${p.key}"`, limit: 1 });
    itemKey = (found['items'] as { key: string }[])[0]?.key;
    if (itemKey !== undefined) { break; }
  }
  let temp: string | undefined;
  try {
    if (itemKey === undefined && scratch !== undefined) { temp = (await ok(jiraWorkitemTool, { op: 'create', project: scratch, type: 'Task', summary: 'insrc live read test (safe to delete)' }))['target']; itemKey = temp; }
    if (itemKey === undefined) { assert.fail('no work item to read: the site has none and INSRC_JIRA_SCRATCH_PROJECT is not set'); }
    assert.equal((await ok(jiraWorkitemTool, { op: 'view', key: itemKey }))['item'].key, itemKey);
    await ok(jiraWorkitemTool, { op: 'attachment-list', key: itemKey });
    await ok(jiraWorkitemTool, { op: 'watcher-list', key: itemKey });
    await ok(jiraCommentTool, { op: 'list', key: itemKey, limit: 5 });
    await ok(jiraLinkTool, { op: 'list', key: itemKey });
  } finally {
    if (temp !== undefined) { await call(jiraWorkitemTool, { op: 'delete', keys: [temp] }); }
  }
  // a missing work item is a rejected failure with Jira's text
  const missing = await call(jiraWorkitemTool, { op: 'view', key: 'ZZNOPE-999999' });
  assert.equal(missing.success, false);
  assert.equal(missing.failure?.kind, 'rejected');
});

test('jira-live.test.ts: one work item create then delete in a scratch project with cleanup of any clone', { skip: skipItems }, async () => {
  const created: string[] = [];
  try {
    const a = await ok(jiraWorkitemTool, { op: 'create', project: scratch, type: 'Task', summary: 'insrc live test A (safe to delete)', description: 'created by jira-live.test.ts' });
    created.push(a['target']);
    const b = await ok(jiraWorkitemTool, { op: 'create', project: scratch, type: 'Task', summary: 'insrc live test B (safe to delete)' });
    created.push(b['target']);
    const [ka, kb] = [a['target'] as string, b['target'] as string];
    assert.match(ka, /^[A-Z][A-Z0-9_]*-\d+$/);
    await ok(jiraWorkitemTool, { op: 'edit', keys: [ka], summary: 'insrc live test A edited' });
    await ok(jiraWorkitemTool, { op: 'assign', keys: [ka], assignee: '@me' });
    await ok(jiraWorkitemTool, { op: 'transition', keys: [ka], status: 'In Progress' });
    const comment = await ok(jiraCommentTool, { op: 'create', keys: [ka], body: 'live test comment' });
    assert.equal(comment['ok'], true);
    const listed = await ok(jiraCommentTool, { op: 'list', key: ka });
    const id = String(listed['comments'][0].id);
    await ok(jiraCommentTool, { op: 'update', key: ka, id, body: 'live test comment edited' });
    await ok(jiraCommentTool, { op: 'delete', key: ka, id });
    await ok(jiraLinkTool, { op: 'create', out: ka, in: kb, type: 'Relates' });
    const links = await ok(jiraLinkTool, { op: 'list', key: ka });
    assert.ok(links['links'].length >= 1);
    await ok(jiraLinkTool, { op: 'delete', id: String(links['links'][0].id) });
    const clone = await ok(jiraWorkitemTool, { op: 'clone', keys: [ka], toProject: scratch });
    created.push(clone['target']);
    assert.notEqual(clone['target'], ka, 'the clone has its own key');
    await ok(jiraWorkitemTool, { op: 'archive', keys: [kb] });
    await ok(jiraWorkitemTool, { op: 'unarchive', keys: [kb] });
  } finally {
    // cleanup of everything made, the clone included; a project that does not allow deletes leaves them (see the failure text)
    if (created.length > 0) {
      const r = await call(jiraWorkitemTool, { op: 'delete', keys: created });
      assert.equal(r.success, true, `cleanup of ${created.join(', ')}: ${r.failure?.message ?? ''}`);
    }
  }
});

/** The text a project command printed, for the fixture. */
async function textOf(input: Record<string, unknown>): Promise<{ r: ToolResult; text: string }> {
  const r = await call(jiraProjectTool, input);
  return { r, text: r.success ? String((r.data as { message?: string }).message ?? '') : `${r.failure?.kind}: ${r.failure?.message}${r.failure?.original ? `\n${r.failure.original}` : ''}` };
}

test('jira-live.test.ts: the disposable-project probe records the real success text of each project mutation', { skip: skipProbe }, async () => {
  // the recordings are the fixtures the reader tests (jira-project-auth.test.ts) read; the site name is replaced so the repository does not carry it
  const dir = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
  mkdirSync(dir, { recursive: true });
  const record = (name: string, text: string): void => writeFileSync(join(dir, `project-${name}.txt`), `${text.trim().replace(/https:\/\/[^/\s]+/g, 'https://example.atlassian.net')}\n`);
  const key = probe.key as string;
  let made = false;
  let created = false;
  let archived = false;
  try {
    const create = await textOf({ op: 'create', fromProject: probe.source, key, name: `insrc probe ${key}`, leadEmail: probe.lead });
    made = true; // whatever create answered, the cleanup below tries to remove the project (a create that worked but was not read must not leave one)
    created = create.r.success;
    // a refusal is recorded beside the fixtures, never over the success text the reader tests read
    record(create.r.success ? 'create' : 'create-refused', create.text);
    // a refusal (a site or plan that does not allow it) is recorded and the later steps are not run
    assert.equal(create.r.success, true, `project create was refused; the text is recorded: ${create.text}`);
    for (const input of [{ op: 'update', projectKey: key, description: 'insrc probe' }, { op: 'archive', key }, { op: 'restore', key }]) {
      const step = await textOf(input);
      record(String(input.op), step.text);
      archived = input.op === 'archive' ? true : input.op === 'restore' ? false : archived;
      assert.equal(step.r.success, true, `${String(input.op)}: ${step.text}`);
    }
  } finally {
    if (made) {
      // an archived project cannot be deleted ('You cannot edit the configuration of this project'): restore it first
      if (archived) { await call(jiraProjectTool, { op: 'restore', key }); }
      const del = await textOf({ op: 'delete', key });
      // a delete of a project that was never made fails and says nothing about the readers: only a made project is recorded and asserted
      if (created) {
        record('delete', del.text);
        assert.equal(del.r.success, true, `delete of the scratch project ${key}: ${del.text}`);
      }
    }
  }
});
