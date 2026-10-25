import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { EXCLUDED_BY_AMENDMENT, JIRA_UNSUPPORTED } from '../coverage.js';
import { ALL_TOOLS } from './_all-ops.js';

test('jira-docs.test.ts: docs/plans/tool-registry.md lists the five tools, their classes and the excluded and unsupported lists', () => {
  const doc = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..', '..', '..', 'docs', 'plans', 'tool-registry.md'), 'utf8');
  const start = doc.indexOf('## Jira tools (s6');
  assert.ok(start >= 0, 'the Jira tools section exists');
  const rest = doc.slice(start + 5);
  const section = rest.slice(0, rest.search(/\n## /) >= 0 ? rest.search(/\n## /) : undefined);
  // every tool and, for each class, exactly the ops the code gives that class
  for (const tool of ALL_TOOLS) {
    for (const cls of ['none', 'common', 'destructive'] as const) {
      const ops = tool.ops.filter(o => o.cls === cls).map(o => o.name);
      if (ops.length === 0) { continue; }
      const row = section.split('\n').find(l => l.startsWith(`| \`${tool.id}\``) && l.trimEnd().endsWith(`| ${cls} |`) && ops.every(o => l.includes(o)));
      assert.ok(row, `${tool.id}: ${cls} ops ${ops.join(', ')}`);
      const listed = (row.split('|')[2] ?? '').split(',').map(x => x.trim()).filter(Boolean).sort();
      assert.deepEqual(listed, [...ops].sort(), `${tool.id} ${cls}`);
    }
  }
  // the excluded and the unsupported lists
  for (const item of ['create-bulk', '--from-json', '--generate-json', 'auth login', 'auth logout', 'auth switch', 'board', 'sprint', 'dashboard', 'field', 'filter']) { assert.ok(section.includes(item), `excluded: ${item}`); }
  assert.ok(EXCLUDED_BY_AMENDMENT.length >= 10);
  assert.match(section, /Unsupported/);
  assert.ok(JIRA_UNSUPPORTED.length === 2 && /transition id/.test(section) && /list of the transitions/.test(section));
  // the recorded project mutation text is mentioned (recorded by the probe)
  assert.match(section, /Project mutation text/);
});
