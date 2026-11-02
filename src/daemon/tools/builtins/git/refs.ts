/**
 * git_refs -- the reference store (Story s8): refs verify, refs migrate and refs optimize. migrate changes the storage
 * format of the refs (files or reftable) without losing any; with dryRun it only checks that it could.
 */

import { field } from '../gh/op-table.js';
import { buildGitFamilyTool } from './op-table.js';
import type { GitOpSpec, GitRun } from './op-table.js';

const flag = (on: unknown, ...words: string[]): string[] => (on === true ? words : []);
const combined = (run: GitRun): Record<string, unknown> => ({ text: `${run.stdout}${run.stderr}`.trim() });

export const GIT_REFS_OPS: readonly GitOpSpec[] = [
  {
    name: 'verify', cls: 'none', timeoutMs: 120_000, parse: combined,
    fields: { strict: field.bool('Enable stricter checks.'), verbose: field.bool('Report each check.') },
    argv: i => ['refs', 'verify', ...flag(i['strict'], '--strict'), ...flag(i['verbose'], '--verbose')],
  },
  {
    name: 'migrate', cls: i => (i['dryRun'] === true ? 'none' : 'common'), mutating: true, timeoutMs: 300_000, parse: combined,
    fields: { refFormat: field.oneOf(['files', 'reftable'], 'The format to migrate to.'), dryRun: field.bool('Only check that the migration would work.'), noReflog: field.bool('Do not migrate the reflogs.') },
    required: ['refFormat'],
    argv: i => ['refs', 'migrate', `--ref-format=${String(i['refFormat'])}`, ...flag(i['dryRun'], '--dry-run'), ...flag(i['noReflog'], '--no-reflog')],
  },
  {
    name: 'optimize', cls: 'common', timeoutMs: 300_000, parse: combined,
    fields: { all: field.bool('Pack every ref, not only tags.'), noPrune: field.bool('Keep the loose ref files.') },
    argv: i => ['refs', 'optimize', ...flag(i['all'], '--all'), ...flag(i['noPrune'], '--no-prune')],
  },
];

export const gitRefsTool = buildGitFamilyTool({
  id: 'git_refs',
  description: 'The reference store: refs verify (checks it), refs migrate (files or reftable) and refs optimize (packs refs). Listing refs is git_for_each_ref.',
  ops: GIT_REFS_OPS,
});
