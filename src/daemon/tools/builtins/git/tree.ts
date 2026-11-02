/**
 * git_tree -- worktree and index operations (Story s8): checkout-index, clean, restore, mv, sparse-checkout, submodule,
 * rerere, merge-file, bisect and replay. An op is destructive when it can discard uncommitted work or a recorded
 * state: clean (not a dry run), restore of the working tree, checkout-index --force, mv --force, submodule deinit and
 * submodule update --force, merge-file writing its result into the first file, replay updating refs. Every other change
 * is common and a read is none.
 */

import { Type } from '@sinclair/typebox';
import { field } from '../gh/op-table.js';
import type { FieldSpec } from '../gh/op-table.js';
import { buildGitFamilyTool, trimmedText } from './op-table.js';
import type { GitOpSpec } from './op-table.js';
import { SAFE_PATH, SAFE_REV } from './safe-args.js';

const rev = (description: string): FieldSpec => ({ ...field.str(description), pattern: SAFE_REV });
const path = (description: string): FieldSpec => ({ ...field.str(description), pattern: SAFE_PATH });
const flag = (on: unknown, ...words: string[]): string[] => (on === true ? words : []);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const pathspec = (paths: unknown): string[] => (list(paths).length > 0 ? ['--', ...list(paths)] : []);

const op = (name: string, rest: Omit<GitOpSpec, 'name' | 'timeoutMs'> & { timeoutMs?: number }): GitOpSpec => ({ timeoutMs: 60_000, ...rest, name });

/** merge-file's exit code is the number of conflicts (at most 127); 128 and above is a failure. */
const MERGE_FILE_CODES: readonly number[] = Array.from({ length: 128 }, (_, n) => n);

export const GIT_TREE_OPS: readonly GitOpSpec[] = [
  op('checkout-index', {
    cls: i => (i['force'] === true ? 'destructive' : 'common'), parse: trimmedText,
    fields: { paths: field.strs('Index files to write into the working tree.'), all: field.bool('Write every file of the index.'), force: field.bool('Overwrite files that already exist.') },
    oneOf: [['paths', 'all']], paths: ['paths'], notice: 'force overwrites files in the working tree.',
    argv: i => ['checkout-index', '-q', ...flag(i['force'], '-f'), ...flag(i['all'], '-a'), ...pathspec(i['paths'])],
  }),
  op('clean', {
    cls: i => (i['dryRun'] === true ? 'none' : 'destructive'), mutating: true, parse: trimmedText,
    fields: { dryRun: field.bool('Only list what would be removed.'), directories: field.bool('Also remove untracked directories.'), ignored: field.bool('Also remove ignored files.'), paths: field.strs('Limit to these paths.') },
    paths: ['paths'], notice: 'Untracked files are deleted and cannot be recovered.',
    argv: i => ['clean', i['dryRun'] === true ? '-n' : '-f', ...flag(i['directories'], '-d'), ...flag(i['ignored'], '-x'), ...pathspec(i['paths'])],
  }),
  op('restore', {
    cls: i => (i['staged'] === true && i['worktree'] !== true ? 'common' : 'destructive'), parse: trimmedText,
    fields: { paths: field.strs('The files to restore.'), source: rev('Restore from this tree-ish (default: the index, or HEAD with staged).'), staged: field.bool('Restore the index.'), worktree: field.bool('Restore the working tree.') },
    required: ['paths'], refs: ['source'], paths: ['paths'], notice: 'Restoring the working tree discards its changes to those files.',
    argv: i => ['restore', ...(text(i['source']) !== undefined ? ['--source', text(i['source'])!] : []), ...flag(i['staged'], '--staged'), ...flag(i['worktree'], '--worktree'), ...pathspec(i['paths'])],
  }),
  op('mv', {
    cls: i => (i['force'] === true ? 'destructive' : 'common'), parse: trimmedText,
    fields: { from: path('The file, directory or symlink to move.'), to: path('Where to move it.'), force: field.bool('Overwrite the destination.') },
    required: ['from', 'to'], paths: ['from', 'to'], notice: 'force overwrites the destination.',
    argv: i => ['mv', ...flag(i['force'], '-f'), '--', String(i['from']), String(i['to'])],
  }),
  op('sparse-checkout', {
    cls: i => (i['action'] === 'list' ? 'none' : 'common'), mutating: true, parse: trimmedText,
    fields: { action: field.oneOf(['list', 'set', 'add', 'reapply', 'disable'], 'What to do.'), patterns: field.strs('Directories (cone) or patterns.'), cone: field.bool('Cone mode (true) or pattern mode (false); default: the repository setting.') },
    required: ['action'], paths: ['patterns'],
    check: i => ((i['action'] === 'set' || i['action'] === 'add') ? (i['patterns'] === undefined ? `${String(i['action'])} needs patterns` : undefined) : i['patterns'] !== undefined ? `${String(i['action'])} takes no patterns` : undefined),
    argv: i => ['sparse-checkout', String(i['action']), ...(i['action'] === 'set' || i['action'] === 'add' ? [...(i['cone'] === true ? ['--cone'] : i['cone'] === false ? ['--no-cone'] : []), '--', ...list(i['patterns'])] : [])],
  }),
  op('submodule', {
    cls: i => (i['action'] === 'status' ? 'none' : i['action'] === 'deinit' || (i['action'] === 'update' && i['force'] === true) ? 'destructive' : 'common'), mutating: true, parse: trimmedText, timeoutMs: 300_000,
    fields: {
      action: field.oneOf(['status', 'init', 'update', 'deinit', 'sync', 'add'], 'What to do.'), paths: field.strs('Submodule paths (for add: the path to put it at).'),
      url: field.str('For add: the repository to add.'), force: field.bool('For update: throw away local changes; for deinit: also remove a modified submodule.'),
      recursive: field.bool('Include nested submodules.'), all: field.bool('For deinit: every submodule.'),
    },
    required: ['action'], paths: ['paths'], notice: 'deinit and update with force discard the submodule working tree.',
    check: i => (i['action'] === 'add' ? (i['url'] === undefined ? 'add needs url' : undefined) : i['url'] !== undefined ? `${String(i['action'])} takes no url` : i['action'] === 'deinit' && i['all'] !== true && i['paths'] === undefined ? 'deinit needs paths or all' : undefined),
    argv: i => ['submodule', String(i['action']), ...(i['action'] === 'add' ? [...flag(i['force'], '-f'), '--', String(i['url']), ...list(i['paths'])]
      : [...flag(i['force'] && (i['action'] === 'update' || i['action'] === 'deinit'), '--force'), ...flag(i['recursive'], '--recursive'), ...flag(i['all'], '--all'), ...pathspec(i['paths'])])],
  }),
  op('rerere', {
    cls: i => (['status', 'diff', 'remaining'].includes(String(i['action'])) ? 'none' : 'common'), mutating: true, parse: trimmedText,
    fields: { action: field.oneOf(['status', 'diff', 'remaining', 'forget', 'clear', 'gc'], 'What to do.'), paths: field.strs('For forget: the files whose recorded resolution to forget.') },
    required: ['action'], paths: ['paths'],
    check: i => (i['action'] === 'forget' ? (i['paths'] === undefined ? 'forget needs paths' : undefined) : i['paths'] !== undefined ? `${String(i['action'])} takes no paths` : undefined),
    argv: i => ['rerere', String(i['action']), ...(i['action'] === 'forget' ? pathspec(i['paths']) : [])],
  }),
  op('merge-file', {
    cls: i => (i['stdout'] === true ? 'none' : 'destructive'), mutating: true, okCodes: MERGE_FILE_CODES,
    fields: { current: path('Our version; the result is written here unless stdout is set.'), base: path('The common ancestor.'), other: path('Their version.'), stdout: field.bool('Print the result instead of writing it into the current file.') },
    required: ['current', 'base', 'other'], refs: ['current', 'base', 'other'], notice: 'Without stdout the merged result replaces the current file.',
    argv: i => ['merge-file', ...flag(i['stdout'], '-p'), String(i['current']), String(i['base']), String(i['other'])],
    answer: { conflicts: Type.Number(), text: Type.String() }, parse: run => ({ conflicts: run.code, text: run.stdout }),
  }),
  op('bisect', {
    cls: i => (i['action'] === 'log' ? 'none' : 'common'), mutating: true, parse: trimmedText, timeoutMs: 120_000,
    fields: {
      action: field.oneOf(['start', 'bad', 'good', 'skip', 'reset', 'log'], 'What to do.'), bad: rev('For start: a bad commit.'), good: field.strs('For start: known good commits.'),
      rev: rev('For bad, good and skip: the commit (default: the current one).'),
    },
    required: ['action'], refs: ['bad', 'good', 'rev'],
    check: i => (i['action'] === 'start' ? (i['good'] !== undefined && i['bad'] === undefined ? 'good needs bad' : i['rev'] !== undefined ? 'start takes no rev' : undefined)
      : i['bad'] !== undefined || i['good'] !== undefined ? `${String(i['action'])} takes no bad or good` : i['rev'] !== undefined && !['bad', 'good', 'skip'].includes(String(i['action'])) ? `${String(i['action'])} takes no rev` : undefined),
    notice: 'bisect checks out other commits.',
    argv: i => ['bisect', String(i['action']), ...(i['action'] === 'start' ? [...(text(i['bad']) !== undefined ? [text(i['bad'])!] : []), ...list(i['good'])] : text(i['rev']) !== undefined ? [text(i['rev'])!] : [])],
  }),
  op('replay', {
    cls: i => (i['refAction'] === 'update' ? 'destructive' : 'none'), mutating: true, parse: trimmedText,
    fields: { onto: rev('Replay onto this commit.'), advance: rev('Advance this branch instead.'), range: rev('The commits to replay, as <base>..<branch>.'), refAction: field.oneOf(['print', 'update'], 'print the ref updates (default) or make them.') },
    required: ['range'], oneOf: [['onto', 'advance']], refs: ['onto', 'advance', 'range'], notice: 'update moves the branches that point into the range.',
    argv: i => ['replay', ...(text(i['onto']) !== undefined ? ['--onto', text(i['onto'])!] : ['--advance', String(i['advance'])]), `--ref-action=${i['refAction'] === 'update' ? 'update' : 'print'}`, String(i['range'])],
  }),
];

export const gitTreeTool = buildGitFamilyTool({
  id: 'git_tree',
  description: 'Working tree and index operations: checkout-index, clean, restore, mv, sparse-checkout, submodule, rerere, merge-file, bisect and replay. clean, restore of the working tree, forced overwrites, submodule deinit, merge-file in place and replay with update ask for approval every time.',
  ops: GIT_TREE_OPS,
});
