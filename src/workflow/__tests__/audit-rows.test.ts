/**
 * s9/t1: section 5 of the migration record audits every replacement row against the tool input schemas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const record = readFileSync(join(root, 'docs', 'plans', 'tool-registry-migration-record.md'), 'utf8');
const section = record.slice(record.indexOf('## 5. The s9 audit'));
const [auditPart = '', gapPart = ''] = section.split('### The final gap list');

const rows = auditPart.split('\n').filter(l => l.startsWith('| `src/')).map(l => l.split('|').slice(1, -1).map(c => c.trim()));
const gapIds = gapPart.split('\n').filter(l => /^\| g\d+ /.test(l)).map(l => l.split('|')[1]!.trim());

/** The seventeen files of the Story's replacement table. */
const FILES = [
  'src/analyze/context/repo-ignore-filter.ts', 'src/workflow/artifacts/companion/header.ts', 'src/workflow/convert/plan.ts',
  'src/workflow/gates.ts', 'src/workflow/runners/build/range-base.ts', 'src/workflow/runners/build/standalone-record.ts',
  'src/workflow/runners/build/story-commits.ts', 'src/workflow/runners/build/changed-files.ts', 'src/daemon/steps/build-step/validation-checks.ts',
  'src/design/corpus/sources/git-reader.ts', 'src/understanding/identity.ts', 'src/workflow/team/policy-reader.ts',
  'src/workflow/team/anchor-finder.ts', 'src/workflow/team/sighting-store.ts', 'src/workflow/team/policy-refresh.ts',
  'src/workflow/team/signoff.ts', 'src/workflow/team/handoff.ts', 'src/workflow/team/branch-resolution.ts',
];

test('audit-rows.test.ts: every replacement row names its tool and op and says covered or names the missing input', () => {
  assert.ok(rows.length >= FILES.length, 'the audit has a row per site');
  for (const [site = '', tool = '', status = '', note = ''] of rows) {
    assert.match(tool, /`(git|gh)_[a-z_]+`/, `${site}: names a tool`);
    assert.ok(['covered', 'derived', 'gap'].includes(status), `${site}: status is covered, derived or gap, got ${status}`);
    if (status === 'gap') {
      const id = /^(g\d+)\b/.exec(note)?.[1];
      assert.ok(id !== undefined && gapIds.includes(id), `${site}: a gap names an id of the final gap list`);
    }
    if (status === 'derived') { assert.ok(note.length > 0, `${site}: a derived row gives the reason`); }
  }
  for (const file of FILES) { assert.ok(rows.some(r => r[0]!.includes(file)), `${file} has a row`); }
  assert.deepEqual(gapIds, ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10', 'g11', 'g12']);
  for (const id of gapIds.filter(g => g !== 'g11' && g !== 'g12')) { assert.ok(rows.some(r => r[2] === 'gap' && r[3]!.startsWith(`${id}:`)), `${id} is used by a row`); }   // g11 was found later, in t10
});
