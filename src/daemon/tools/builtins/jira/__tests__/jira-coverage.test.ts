import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { EXCLUDED_BY_AMENDMENT, JIRA_COVERAGE, JIRA_UNSUPPORTED } from '../coverage.js';
import { ALL_TOOLS } from './_all-ops.js';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..', '..', '..');

/**
 * Written independently of JIRA_COVERAGE: every acli command on work items, comments, links, attachments, watchers and
 * projects (plus the sign-in status), minus the amended exclusions, and the tool and op that must serve it.
 */
const REQUIRED_OPS: readonly (readonly [command: string, tool: string, op: string])[] = [
  ['workitem view', 'jira_workitem', 'view'], ['workitem search', 'jira_workitem', 'search'], ['workitem search', 'jira_workitem', 'count'],
  ['workitem create', 'jira_workitem', 'create'], ['workitem edit', 'jira_workitem', 'edit'], ['workitem transition', 'jira_workitem', 'transition'],
  ['workitem assign', 'jira_workitem', 'assign'], ['workitem clone', 'jira_workitem', 'clone'], ['workitem archive', 'jira_workitem', 'archive'],
  ['workitem unarchive', 'jira_workitem', 'unarchive'], ['workitem delete', 'jira_workitem', 'delete'],
  ['workitem attachment list', 'jira_workitem', 'attachment-list'], ['workitem attachment delete', 'jira_workitem', 'attachment-delete'],
  ['workitem list-watchers', 'jira_workitem', 'watcher-list'], ['workitem watcher remove', 'jira_workitem', 'watcher-remove'],
  ['workitem comment list', 'jira_comment', 'list'], ['workitem comment create', 'jira_comment', 'create'], ['workitem comment update', 'jira_comment', 'update'],
  ['workitem comment delete', 'jira_comment', 'delete'], ['workitem comment visibility', 'jira_comment', 'visibility'],
  ['workitem link list', 'jira_link', 'list'], ['workitem link type', 'jira_link', 'types'], ['workitem link create', 'jira_link', 'create'], ['workitem link delete', 'jira_link', 'delete'],
  ['project list', 'jira_project', 'list'], ['project view', 'jira_project', 'view'], ['project create', 'jira_project', 'create'], ['project update', 'jira_project', 'update'],
  ['project archive', 'jira_project', 'archive'], ['project restore', 'jira_project', 'restore'], ['project delete', 'jira_project', 'delete'],
  ['auth status', 'jira_auth', 'status'],
];

/** The items of the first column of the table in the section 's6 scope amendment to ac1' (each backticked word group). */
function amendmentItems(): string[] {
  const doc = readFileSync(join(REPO, 'docs', 'plans', 'tool-registry.md'), 'utf8');
  const start = doc.indexOf('## s6 scope amendment to ac1');
  assert.ok(start >= 0, 'the amendment section exists');
  const rest = doc.slice(start + 10);
  const section = rest.slice(0, rest.search(/\n## /) >= 0 ? rest.search(/\n## /) : undefined);
  const rows = section.split('\n').filter(l => l.startsWith('| `'));
  return rows.flatMap(l => [...(l.split('|')[1] ?? '').matchAll(/`([^`]+)`/g)].map(m => m[1] as string));
}

test('jira-coverage.test.ts: every acli command is covered or in the amended exclusion list, checked against REQUIRED_OPS, and the exclusion list equals the amendment table', () => {
  // the registered ops are exactly the required ones
  const registered = ALL_TOOLS.flatMap(t => t.ops.map(o => `${t.id}.${o.name}`)).sort();
  assert.equal(registered.length, 32);
  assert.deepEqual(registered, REQUIRED_OPS.map(([, t, o]) => `${t}.${o}`).sort());
  // each required command has a covered row naming a tool and op that serve it
  const covered = JIRA_COVERAGE.filter(r => r.owner === 'covered');
  for (const [command, tool, op] of REQUIRED_OPS) {
    const row = covered.find(r => r.command === command && r.toolIds?.includes(tool) === true);
    assert.ok(row, `${command} is covered by ${tool}`);
    // 'count' runs the search command with --count and is named in the search row
    assert.ok(row.op === op || (op === 'count' && row.op === 'search'), `${command}: ${tool}.${op}`);
  }
  // every covered row is a required command (and 'watcher list' is the deprecated alias of list-watchers)
  const required = new Set(REQUIRED_OPS.map(([c]) => c));
  for (const r of covered) { assert.ok(required.has(r.command) || r.command === 'workitem watcher list', r.command); }
  assert.equal(covered.length, 32);
  // rows are unique, and every excluded row names a reason and a domain the amendment lists
  assert.equal(new Set(JIRA_COVERAGE.map(r => r.command)).size, JIRA_COVERAGE.length);
  const excluded = JIRA_COVERAGE.filter(r => r.owner === 'excluded');
  assert.equal(excluded.length, 32);
  const isListed = (cmd: string): boolean => EXCLUDED_BY_AMENDMENT.some(e => cmd === e || cmd.startsWith(`${e} `));
  for (const r of excluded) { assert.ok(r.reason && isListed(r.command), `${r.command} is an amended exclusion`); }
  assert.ok(covered.every(r => !isListed(r.command)), 'no covered command is on the exclusion list');
  // the exclusion list equals the table of the amendment section
  assert.deepEqual([...EXCLUDED_BY_AMENDMENT].sort(), amendmentItems().sort());
});

test('jira-coverage.test.ts: JIRA_UNSUPPORTED names a transition by id and the list of transitions and neither is a registered op', () => {
  const names = JIRA_UNSUPPORTED.map(u => u.operation.toLowerCase());
  assert.ok(names.some(n => /transition .*by .*id/.test(n)), 'a transition by id');
  assert.ok(names.some(n => /list .*transitions/.test(n)), 'a list of the transitions a work item can take');
  assert.ok(JIRA_UNSUPPORTED.every(u => u.reason.length > 0));
  // neither is an op or an input of one: transitions go by status name
  for (const t of ALL_TOOLS) {
    for (const o of t.ops) {
      assert.ok(!/transition/.test(o.name) || o.name === 'transition', `${t.id}.${o.name} (the only transition op goes by status name)`);
      assert.ok(!Object.keys(o.fields ?? {}).some(f => /transition(Id)?$/i.test(f)), `${t.id}.${o.name} has no transition id field`);
    }
  }
  const transition = ALL_TOOLS.flatMap(t => t.ops).find(o => o.name === 'transition');
  assert.deepEqual(Object.keys(transition?.fields ?? {}).sort(), ['keys', 'status']);
});

test('jira-coverage.test.ts: classes are 6 destructive, 12 none, 14 common, 32 in all', () => {
  const ops = ALL_TOOLS.flatMap(t => t.ops.map(o => ({ id: `${t.id}.${o.name}`, cls: o.cls })));
  const by = (c: string): string[] => ops.filter(o => o.cls === c).map(o => o.id).sort();
  assert.equal(ops.length, 32);
  assert.deepEqual(by('destructive'), ['jira_comment.delete', 'jira_link.delete', 'jira_project.archive', 'jira_project.delete', 'jira_workitem.attachment-delete', 'jira_workitem.delete']);
  assert.equal(by('none').length, 12);
  assert.equal(by('common').length, 14);
  assert.deepEqual(ALL_TOOLS.map(t => [t.id, t.ops.length]), [['jira_workitem', 15], ['jira_comment', 5], ['jira_link', 4], ['jira_project', 7], ['jira_auth', 1]]);
});
