/**
 * git_reflog -- the reflog (Story s8): show, list, exists, expire, delete and write. expire and delete discard entries,
 * so they are destructive unless they are a dry run.
 */

import { Type } from '@sinclair/typebox';
import { field } from '../gh/op-table.js';
import type { FieldSpec } from '../gh/op-table.js';
import { buildGitFamilyTool, LINES_ANSWER, linesParse } from './op-table.js';
import type { GitOpSpec, GitRun } from './op-table.js';
import { SAFE_REV } from './safe-args.js';

const rev = (description: string): FieldSpec => ({ ...field.str(description), pattern: SAFE_REV });
const flag = (on: unknown, ...words: string[]): string[] => (on === true ? words : []);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const combined = (run: GitRun): Record<string, unknown> => ({ text: `${run.stdout}${run.stderr}`.trim() });

export const GIT_REFLOG_OPS: readonly GitOpSpec[] = [
  {
    name: 'show', cls: 'none', timeoutMs: 30_000, answer: LINES_ANSWER, parse: linesParse,
    fields: { ref: rev('The ref whose reflog to show (default HEAD).'), limit: field.int('Show at most this many entries.') }, refs: ['ref'],
    argv: i => ['reflog', 'show', '--no-color', ...(typeof i['limit'] === 'number' ? ['-n', String(i['limit'])] : []), text(i['ref']) ?? 'HEAD'],
  },
  { name: 'list', cls: 'none', timeoutMs: 30_000, answer: LINES_ANSWER, parse: linesParse, argv: () => ['reflog', 'list'] },
  {
    name: 'exists', cls: 'none', timeoutMs: 30_000, okCodes: [0, 1], answer: { exists: Type.Boolean() }, parse: run => ({ exists: run.code === 0 }),
    fields: { ref: rev('The ref to look for.') }, required: ['ref'], refs: ['ref'],
    argv: i => ['reflog', 'exists', String(i['ref'])],
  },
  {
    name: 'expire', cls: i => (i['dryRun'] === true ? 'none' : 'destructive'), mutating: true, timeoutMs: 120_000, parse: combined,
    fields: {
      expire: field.str('Drop entries older than this ("now" drops all, "never" none, or e.g. 90.days.ago).'), expireUnreachable: field.str('The same for entries that are not reachable from the ref.'),
      all: field.bool('Every ref.'), refs: field.strs('The refs to expire.'), dryRun: field.bool('Only report what would be dropped.'),
    },
    oneOf: [['all', 'refs']], refs: ['refs'], notice: 'Reflog entries are dropped and cannot be recovered.',
    argv: i => ['reflog', 'expire', '--verbose', ...(text(i['expire']) !== undefined ? [`--expire=${text(i['expire'])}`] : []), ...(text(i['expireUnreachable']) !== undefined ? [`--expire-unreachable=${text(i['expireUnreachable'])}`] : []),
      ...flag(i['dryRun'], '--dry-run'), ...flag(i['all'], '--all'), ...list(i['refs'])],
  },
  {
    name: 'delete', cls: i => (i['dryRun'] === true ? 'none' : 'destructive'), mutating: true, timeoutMs: 30_000, parse: combined,
    fields: { entries: field.strs('Entries as <ref>@{<n>}.'), dryRun: field.bool('Only report what would be deleted.'), rewrite: field.bool('Rewrite the next entry to follow the deleted one.') },
    required: ['entries'], refs: ['entries'], notice: 'Reflog entries are deleted and cannot be recovered.',
    argv: i => ['reflog', 'delete', '--verbose', ...flag(i['dryRun'], '--dry-run'), ...flag(i['rewrite'], '--rewrite'), ...list(i['entries'])],
  },
  {
    name: 'write', cls: 'common', timeoutMs: 30_000, parse: combined,
    fields: { ref: rev('The ref.'), oldOid: rev('Its old value.'), newOid: rev('Its new value.'), message: field.str('The reflog message.') },
    required: ['ref', 'oldOid', 'newOid', 'message'], refs: ['ref', 'oldOid', 'newOid'],
    argv: i => ['reflog', 'write', String(i['ref']), String(i['oldOid']), String(i['newOid']), String(i['message'])],
  },
];

export const gitReflogTool = buildGitFamilyTool({
  id: 'git_reflog',
  description: 'The reflog: show, list, exists, expire, delete and write. expire and delete that are not a dry run ask for approval every time.',
  ops: GIT_REFLOG_OPS,
});
