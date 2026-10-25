import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { JIRA_COVERAGE } from '../coverage.js';
import { ALL_TOOLS } from './_all-ops.js';

const have = spawnSync('acli', ['--version'], { encoding: 'utf8', timeout: 20_000 }).status === 0;

const run = promisify(execFile);
const cache = new Map<string, Promise<string>>();
/** The help text of a command; each is fetched once, and the many calls run side by side (these are help reads, not model calls). */
function help(path: readonly string[]): Promise<string> {
  const key = path.join(' ');
  let p = cache.get(key);
  if (p === undefined) { p = run('acli', [...path, '--help'], { timeout: 20_000 }).then(r => r.stdout, () => ''); cache.set(key, p); }
  return p;
}
/** The subcommands listed under 'Available Commands:' of a help text. */
function subcommands(text: string): string[] {
  const block = /Available Commands:\n([\s\S]*?)\n\n/.exec(text)?.[1] ?? '';
  return block.split('\n').map(l => /^\s+(\S+)/.exec(l)?.[1]).filter((n): n is string => n !== undefined && n !== 'help' && n !== 'completion');
}
async function leaves(path: string[]): Promise<string[]> {
  const sub = subcommands(await help(path));
  return sub.length === 0 ? [path.slice(1).join(' ')] : (await Promise.all(sub.map(n => leaves([...path, n])))).flat();
}

test('jira-parser.test.ts: the commands and flags of the real acli match the coverage table, including the project flags (skipped when acli is absent)', { skip: have ? false : 'acli is not installed' }, async () => {
  // every leaf command of the installed acli jira is a row of the table, and every row is a leaf command
  const found = (await leaves(['jira'])).sort();
  assert.ok(found.length > 40, 'the walk found the commands');
  assert.deepEqual(found, JIRA_COVERAGE.map(r => r.command).sort());

  // every flag an op writes exists in the help of its command
  for (const tool of ALL_TOOLS) {
    for (const op of tool.ops) {
      const text = await help(['jira', ...op.command]);
      const flags = new Set<string>();
      for (const a of op.args) {
        if ('flag' in a) { flags.add(a.flag); }
        else if ('lit' in a) { for (const t of a.lit) { if (t.startsWith('--')) { flags.add(t.split('=')[0] as string); } } }
      }
      assert.ok(text.includes('Flags:'), `${tool.id}.${op.name}: help of ${op.command.join(' ')}`);
      for (const f of flags) { assert.match(text, new RegExp(`(^|\\s)${f}(\\s|$)`, 'm'), `${tool.id}.${op.name} writes ${f}`); }
    }
  }

  // the project flags the LLD names, and the forms the amendment leaves out, are real flags
  const create = await help(['jira', 'project', 'create']);
  for (const f of ['--from-project', '--key', '--name', '--description', '--url', '--lead-email', '--from-json', '--generate-json']) { assert.ok(create.includes(f), `project create has ${f}`); }
  assert.match(await help(['jira', 'project', 'update']), /--project-key/);
  for (const c of ['archive', 'restore', 'delete']) {
    const text = await help(['jira', 'project', c]);
    assert.ok(text.includes('--key'), `project ${c} has --key`);
    assert.ok(!text.includes('--yes'), `project ${c} has no --yes`);
  }
  // the changing work item commands have --yes; comment update and the watcher and attachment deletes have none
  for (const c of [['edit'], ['transition'], ['assign'], ['clone'], ['archive'], ['unarchive'], ['delete'], ['link', 'create'], ['link', 'delete']]) { assert.ok((await help(['jira', 'workitem', ...c])).includes('--yes'), `workitem ${c.join(' ')} has --yes`); }
  for (const c of [['comment', 'update'], ['comment', 'delete'], ['watcher', 'remove'], ['attachment', 'delete']]) { assert.ok(!(await help(['jira', 'workitem', ...c])).includes('--yes'), `workitem ${c.join(' ')} has no --yes`); }
  // no transition id: the transition command takes a status name
  const transition = await help(['jira', 'workitem', 'transition']);
  assert.match(transition, /--status/);
  assert.doesNotMatch(transition, /--transition|--id\b/);
});
