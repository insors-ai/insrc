/**
 * git_objects -- writing objects, the index and notes by hand (Story s8): commit-tree, mktree, mktag, write-tree,
 * read-tree, update-index, replace, notes, fast-import, unpack-objects, index-pack and pack-objects. An op is destructive
 * when it can discard something: read-tree --reset or -u (the index and the working tree), replace delete or --force,
 * notes remove, prune and add --force (a note nothing else keeps). Any other change is common; pack-objects only reads.
 */

import { Type } from '@sinclair/typebox';
import { field } from '../gh/op-table.js';
import type { FieldSpec } from '../gh/op-table.js';
import { buildGitFamilyTool, trimmedText } from './op-table.js';
import type { GitOpSpec, GitRun } from './op-table.js';
import { SAFE_REF, SAFE_REV } from './safe-args.js';

const rev = (description: string): FieldSpec => ({ ...field.str(description), pattern: SAFE_REV });
const flag = (on: unknown, ...words: string[]): string[] => (on === true ? words : []);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

const SHA_ANSWER = { sha: Type.String() };
const shaParse = (run: GitRun): Record<string, unknown> | undefined => {
  const sha = run.stdout.trim();
  return /^[0-9a-f]{40,64}$/.test(sha) ? { sha } : undefined;
};

const write = (name: string, rest: Omit<GitOpSpec, 'name' | 'timeoutMs'> & { timeoutMs?: number }): GitOpSpec =>
  ({ timeoutMs: 60_000, ...rest, name });

export const GIT_OBJECTS_OPS: readonly GitOpSpec[] = [
  write('commit-tree', {
    cls: 'common', answer: SHA_ANSWER, parse: shaParse,
    fields: { tree: rev('The tree to commit.'), parents: field.strs('Parent commits.'), message: field.str('The commit message.') },
    required: ['tree', 'message'], refs: ['tree', 'parents'],
    argv: i => ['commit-tree', String(i['tree']), ...list(i['parents']).flatMap(p => ['-p', p]), '-m', String(i['message'])],
  }),
  write('mktree', {
    cls: 'common', answer: SHA_ANSWER, parse: shaParse, stdin: 'entries', required: ['entries'],
    fields: { entries: field.str('Tree entries in git ls-tree format, one per line.', true) },
    argv: () => ['mktree'],
  }),
  write('mktag', {
    cls: 'common', answer: SHA_ANSWER, parse: shaParse, stdin: 'tag', required: ['tag'],
    fields: { tag: field.str('The tag object: object, type, tag and tagger lines, a blank line and the message.') },
    argv: () => ['mktag'],
  }),
  write('write-tree', {
    cls: 'common', answer: SHA_ANSWER, parse: shaParse,
    fields: { missingOk: field.bool('Allow objects the index names to be missing.') },
    argv: i => ['write-tree', ...flag(i['missingOk'], '--missing-ok')],
  }),
  write('read-tree', {
    cls: i => (i['reset'] === true || i['update'] === true ? 'destructive' : 'common'), parse: trimmedText,
    fields: { rev: rev('The tree-ish to read into the index.'), reset: field.bool('Throw away the index and the working tree changes (--reset).'), merge: field.bool('Merge into the index (-m).'), update: field.bool('Also update the working tree (-u).') },
    required: ['rev'], refs: ['rev'],
    check: i => (i['update'] === true && i['merge'] !== true && i['reset'] !== true ? 'update needs merge or reset' : i['merge'] === true && i['reset'] === true ? 'merge and reset cannot be combined' : undefined),
    notice: 'reset and update replace the index and the working tree.',
    argv: i => ['read-tree', ...flag(i['reset'], '--reset'), ...flag(i['merge'], '-m'), ...flag(i['update'], '-u'), String(i['rev'])],
  }),
  write('update-index', {
    cls: 'common', parse: trimmedText, stdin: 'indexInfo',
    fields: {
      paths: field.strs('Files to add, remove or refresh.'), add: field.bool('Add files the index does not know.'), remove: field.bool('Remove files that are gone from the working tree.'),
      refresh: field.bool('Refresh the stat information of the index.'), cacheinfo: field.str('"<mode>,<sha>,<path>" to put in the index.'),
      indexInfo: field.str('Lines "<mode> <sha> <stage>\\t<path>" to put in the index.', true),
    },
    check: i => (['paths', 'cacheinfo', 'indexInfo', 'refresh'].some(k => i[k] !== undefined && i[k] !== false) ? undefined : 'update-index needs paths, cacheinfo, indexInfo or refresh'),
    paths: ['paths'],
    argv: i => ['update-index', ...flag(i['add'], '--add'), ...flag(i['remove'], '--remove'), ...flag(i['refresh'], '--refresh'),
      ...(text(i['cacheinfo']) !== undefined ? ['--cacheinfo', text(i['cacheinfo'])!] : []), ...(typeof i['indexInfo'] === 'string' ? ['--index-info'] : []),
      ...(list(i['paths']).length > 0 ? ['--', ...list(i['paths'])] : [])],
  }),
  write('replace', {
    cls: i => (i['action'] === 'delete' || i['force'] === true ? 'destructive' : i['action'] === 'list' ? 'none' : 'common'), mutating: true, parse: trimmedText,
    fields: { action: field.oneOf(['create', 'delete', 'list'], 'What to do with replace refs.'), object: rev('The object to replace or restore.'), replacement: rev('The object that replaces it.'), force: field.bool('Overwrite an existing replacement.') },
    required: ['action'], refs: ['object', 'replacement'],
    check: i => (i['action'] === 'create' ? (i['object'] === undefined || i['replacement'] === undefined ? 'create needs object and replacement' : undefined)
      : i['action'] === 'delete' ? (i['object'] === undefined ? 'delete needs object' : undefined)
        : i['object'] !== undefined || i['replacement'] !== undefined ? 'list takes no object' : undefined),
    notice: 'delete and force discard a replacement.',
    argv: i => i['action'] === 'list' ? ['replace', '--list'] : i['action'] === 'delete' ? ['replace', '-d', String(i['object'])]
      : ['replace', ...flag(i['force'], '-f'), String(i['object']), String(i['replacement'])],
  }),
  write('notes', {
    cls: i => (i['action'] === 'list' || i['action'] === 'show' ? 'none' : i['action'] === 'remove' || i['action'] === 'prune' || (i['action'] === 'add' && i['force'] === true) ? 'destructive' : 'common'), mutating: true, parse: trimmedText,
    fields: {
      action: field.oneOf(['list', 'show', 'add', 'append', 'remove', 'prune'], 'What to do with notes.'), object: rev('The object the note is on (default HEAD).'),
      message: field.str('The note text.'), force: field.bool('Overwrite an existing note.'), notesRef: { ...field.str('The notes ref (default refs/notes/commits).'), pattern: SAFE_REF },
    },
    required: ['action'], refs: ['object'],
    check: i => ((i['action'] === 'add' || i['action'] === 'append') && i['message'] === undefined ? `${String(i['action'])} needs message` : undefined),
    notice: 'remove, prune and add with force discard notes.',
    argv: i => ['notes', ...(text(i['notesRef']) !== undefined ? ['--ref', text(i['notesRef'])!] : []), String(i['action']),
      ...(i['action'] === 'add' ? flag(i['force'], '-f') : []), ...((i['action'] === 'add' || i['action'] === 'append') ? ['-m', String(i['message'])] : []),
      ...(i['action'] !== 'prune' && i['action'] !== 'list' ? [text(i['object']) ?? 'HEAD'] : i['action'] === 'list' && text(i['object']) !== undefined ? [text(i['object'])!] : [])],
  }),
  write('fast-import', {
    cls: 'common', parse: trimmedText, stdin: 'stream', required: ['stream'], timeoutMs: 120_000,
    fields: { stream: field.str('A git fast-import stream.', true) },
    argv: () => ['fast-import', '--quiet'],
  }),
  write('unpack-objects', {
    cls: 'common', parse: trimmedText, stdin: 'pack', stdinEncoding: 'base64', required: ['pack'], timeoutMs: 120_000,
    fields: { pack: field.str('A pack stream, base64-encoded.') },
    argv: () => ['unpack-objects', '-q'],
  }),
  write('index-pack', {
    cls: 'common', parse: trimmedText, stdin: 'pack', stdinEncoding: 'base64', required: ['pack'], timeoutMs: 120_000,
    fields: { pack: field.str('A pack stream, base64-encoded.'), fixThin: field.bool('Complete a thin pack with objects of the repository.') },
    argv: i => ['index-pack', '--stdin', ...flag(i['fixThin'], '--fix-thin')],
  }),
  write('pack-objects', {
    cls: 'none', mutating: false, stdin: 'revs', required: ['revs'], timeoutMs: 120_000,
    fields: { revs: field.str('Revisions to pack, one per line, as for git rev-list.') },
    argv: () => ['pack-objects', '--revs', '--stdout', '-q'],
    answer: { pack: Type.String(), size: Type.Number() },
    parse: run => ({ pack: Buffer.from(run.bytes).toString('base64'), size: run.bytes.length }),
  }),
];

export const gitObjectsTool = buildGitFamilyTool({
  id: 'git_objects',
  description: 'Write git objects, the index and notes by hand: commit-tree, mktree, mktag, write-tree, read-tree, update-index, replace, notes, fast-import, unpack-objects, index-pack and pack-objects. read-tree reset/update, replace delete/force, notes remove/prune/add force ask for approval every time.',
  ops: GIT_OBJECTS_OPS,
});
