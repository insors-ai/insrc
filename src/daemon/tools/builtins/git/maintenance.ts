/**
 * git_maintenance -- housekeeping of the object database (Story s8): gc, repack, prune, prune-packed, pack-refs,
 * multi-pack-index, maintenance run, commit-graph and backfill. Destructive: gc --prune=now and prune (not a dry run) throw
 * away unreachable objects for good, and maintenance run with the reflog-expire task drops reflog entries. The scheduler
 * subcommands of git maintenance (start, stop, register, unregister) change settings outside the repository and are not offered.
 */

import { field } from '../gh/op-table.js';
import { buildGitFamilyTool } from './op-table.js';
import type { GitOpSpec, GitRun } from './op-table.js';

const flag = (on: unknown, ...words: string[]): string[] => (on === true ? words : []);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
/** stdout and stderr together: these commands report on either. */
const combined = (run: GitRun): Record<string, unknown> => ({ text: `${run.stdout}${run.stderr}`.trim() });

const op = (name: string, rest: Omit<GitOpSpec, 'name' | 'timeoutMs'> & { timeoutMs?: number }): GitOpSpec => ({ timeoutMs: 600_000, parse: combined, ...rest, name });

const TASKS = ['gc', 'commit-graph', 'prefetch', 'loose-objects', 'incremental-repack', 'pack-refs', 'reflog-expire'] as const;

export const GIT_MAINTENANCE_OPS: readonly GitOpSpec[] = [
  op('gc', {
    cls: i => (i['pruneNow'] === true ? 'destructive' : 'common'),
    fields: { aggressive: field.bool('Optimise harder.'), pruneNow: field.bool('Prune unreachable objects now instead of after the grace period.'), auto: field.bool('Only when the repository needs it.') },
    notice: 'pruneNow deletes unreachable objects immediately.',
    argv: i => ['gc', '--quiet', ...flag(i['aggressive'], '--aggressive'), ...flag(i['pruneNow'], '--prune=now'), ...flag(i['auto'], '--auto')],
  }),
  op('repack', {
    cls: 'common',
    fields: { all: field.bool('Pack everything into one pack (-a).'), deleteRedundant: field.bool('Remove packs made redundant (-d).') },
    argv: i => ['repack', '-q', ...flag(i['all'], '-a'), ...flag(i['deleteRedundant'], '-d')],
  }),
  op('prune', {
    cls: i => (i['dryRun'] === true ? 'none' : 'destructive'), mutating: true,
    fields: { dryRun: field.bool('Only report what would be removed.'), expire: field.str('Only prune objects older than this (e.g. 2.weeks.ago).') },
    notice: 'Unreachable objects are deleted and cannot be recovered.',
    argv: i => ['prune', '-v', ...flag(i['dryRun'], '-n'), ...(text(i['expire']) !== undefined ? ['--expire', text(i['expire'])!] : [])],
  }),
  op('prune-packed', {
    cls: i => (i['dryRun'] === true ? 'none' : 'common'), mutating: true,
    fields: { dryRun: field.bool('Only report what would be removed.') },
    argv: i => ['prune-packed', ...flag(i['dryRun'], '-n')],
  }),
  op('pack-refs', {
    cls: 'common',
    fields: { all: field.bool('Pack every ref, not only tags.'), noPrune: field.bool('Keep the loose ref files.') },
    argv: i => ['pack-refs', ...flag(i['all'], '--all'), ...flag(i['noPrune'], '--no-prune')],
  }),
  op('multi-pack-index', {
    cls: i => (i['action'] === 'verify' ? 'none' : 'common'), mutating: true,
    fields: { action: field.oneOf(['write', 'verify', 'expire', 'repack'], 'What to do with the multi-pack index.') }, required: ['action'],
    argv: i => ['multi-pack-index', String(i['action'])],
  }),
  op('maintenance', {
    cls: i => (list(i['tasks']).includes('reflog-expire') ? 'destructive' : 'common'),
    fields: { tasks: field.manyOf(TASKS, 'Tasks to run (default: the ones configured).') },
    notice: 'The reflog-expire task drops reflog entries.',
    argv: i => ['maintenance', 'run', ...list(i['tasks']).map(t => `--task=${t}`)],
  }),
  op('commit-graph', {
    cls: i => (i['action'] === 'verify' ? 'none' : 'common'), mutating: true,
    fields: { action: field.oneOf(['write', 'verify'], 'Write or verify the commit-graph file.'), reachable: field.bool('For write: every commit reachable from a ref.'), changedPaths: field.bool('For write: also compute Bloom filters.') },
    required: ['action'],
    check: i => (i['action'] === 'verify' && (i['reachable'] === true || i['changedPaths'] === true) ? 'verify takes no reachable or changedPaths' : undefined),
    argv: i => ['commit-graph', String(i['action']), ...flag(i['reachable'], '--reachable'), ...flag(i['changedPaths'], '--changed-paths')],
  }),
  op('backfill', {
    cls: 'common',
    fields: { minBatchSize: field.int('Minimum number of objects to request at a time.'), sparse: field.bool('Only fetch objects of the sparse-checkout paths.') },
    argv: i => ['backfill', ...(typeof i['minBatchSize'] === 'number' ? [`--min-batch-size=${i['minBatchSize']}`] : []), ...flag(i['sparse'], '--sparse')],
  }),
];

export const gitMaintenanceTool = buildGitFamilyTool({
  id: 'git_maintenance',
  description: 'Housekeeping of the object database: gc, repack, prune, prune-packed, pack-refs, multi-pack-index, maintenance run, commit-graph and backfill. gc with pruneNow, prune that is not a dry run and the reflog-expire task ask for approval every time.',
  ops: GIT_MAINTENANCE_OPS,
});
