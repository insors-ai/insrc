/**
 * git_patch -- patches, archives and bundles (Story s8): apply, am, format-patch, archive, bundle, fast-export, diagnose
 * and bugreport. An op that writes a file the call names (format-patch --output-directory, archive --output, bundle
 * create, fast-export --export-marks, the output directory of diagnose and bugreport) is destructive, because the file may
 * already exist; the same op without a file prints to the answer and is not. apply --check only reads.
 */

import { statSync } from 'node:fs';
import { Type } from '@sinclair/typebox';
import { field } from '../gh/op-table.js';
import type { FieldSpec } from '../gh/op-table.js';
import { buildGitFamilyTool, trimmedText } from './op-table.js';
import type { GitOpSpec, GitRun } from './op-table.js';
import { SAFE_PATH, SAFE_REV } from './safe-args.js';

const rev = (description: string): FieldSpec => ({ ...field.str(description), pattern: SAFE_REV });
const path = (description: string): FieldSpec => ({ ...field.str(description), pattern: SAFE_PATH });
const flag = (on: unknown, ...words: string[]): string[] => (on === true ? words : []);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
/** stdout and stderr together: git prints the results of these commands on either. */
const combined = (run: GitRun): Record<string, unknown> => ({ text: `${run.stdout}${run.stderr}`.trim() });

const op = (name: string, rest: Omit<GitOpSpec, 'name' | 'timeoutMs'> & { timeoutMs?: number }): GitOpSpec => ({ timeoutMs: 60_000, ...rest, name });

export const GIT_PATCH_OPS: readonly GitOpSpec[] = [
  op('apply', {
    cls: i => (i['check'] === true ? 'none' : 'common'), mutating: true, parse: trimmedText, stdin: 'patch', required: ['patch'],
    fields: {
      patch: field.str('The patch to apply.', true), check: field.bool('Only check that it applies.'), cached: field.bool('Apply to the index only.'),
      index: field.bool('Apply to the working tree and the index.'), reverse: field.bool('Apply the patch in reverse.'),
    },
    exclusive: [['cached', 'index']],
    argv: i => ['apply', ...flag(i['check'], '--check'), ...flag(i['cached'], '--cached'), ...flag(i['index'], '--index'), ...flag(i['reverse'], '-R')],
  }),
  op('am', {
    cls: 'common', parse: combined, stdin: 'mbox', required: ['mbox'], timeoutMs: 120_000,
    fields: { mbox: field.str('A mailbox of patches (from git format-patch).'), threeWay: field.bool('Fall back on a three-way merge.'), signoff: field.bool('Add a Signed-off-by trailer.') },
    argv: i => ['am', '--quiet', ...flag(i['threeWay'], '--3way'), ...flag(i['signoff'], '--signoff')],
  }),
  op('format-patch', {
    cls: i => (text(i['outputDirectory']) !== undefined ? 'destructive' : 'none'), mutating: true, parse: trimmedText, timeoutMs: 120_000,
    fields: { range: rev('The commits to format: <since> or <since>..<until>.'), outputDirectory: path('Write the patch files into this directory instead of printing them.') },
    required: ['range'], refs: ['range'], paths: ['outputDirectory'],
    notice: 'With an output directory, files of the same name are overwritten.',
    argv: i => ['format-patch', ...(text(i['outputDirectory']) !== undefined ? ['-o', text(i['outputDirectory'])!] : ['--stdout']), String(i['range'])],
  }),
  op('archive', {
    cls: i => (text(i['output']) !== undefined ? 'destructive' : 'none'), mutating: true, timeoutMs: 120_000, maxBytes: 2 * 1024 * 1024,
    fields: {
      rev: rev('The tree-ish to archive.'), format: field.oneOf(['tar', 'zip', 'tar.gz', 'tgz'], 'Archive format (default tar).'), prefix: field.str('Prefix every path with this.'),
      paths: field.strs('Limit to these paths.'), output: path('Write the archive to this file instead of returning it.'),
    },
    required: ['rev'], refs: ['rev'], paths: ['paths', 'output'],
    notice: 'With an output file, an existing file of that name is overwritten.',
    argv: i => ['archive', `--format=${text(i['format']) ?? 'tar'}`, ...(text(i['prefix']) !== undefined ? [`--prefix=${text(i['prefix'])}`] : []),
      ...(text(i['output']) !== undefined ? [`--output=${text(i['output'])}`] : []), String(i['rev']), ...(list(i['paths']).length > 0 ? ['--', ...list(i['paths'])] : [])],
    answer: { archive: Type.String(), size: Type.Number(), output: Type.String() },
    parse: (run, i) => {
      const out = text(i['output']);
      if (out === undefined) { return { archive: Buffer.from(run.bytes).toString('base64'), size: run.bytes.length, output: '' }; }
      try { return { archive: '', size: statSync(out).size, output: out }; } catch { return undefined; }
    },
  }),
  op('bundle', {
    cls: i => (i['action'] === 'create' ? 'destructive' : 'none'), mutating: true, parse: combined, timeoutMs: 300_000,
    fields: { action: field.oneOf(['create', 'verify', 'list-heads'], 'What to do with the bundle file.'), file: path('The bundle file.'), revs: field.strs('For create: the refs or ranges to bundle (e.g. main, --all).') },
    required: ['action', 'file'], paths: ['file'],
    check: i => (i['action'] === 'create' ? (i['revs'] === undefined ? 'create needs revs' : undefined) : i['revs'] !== undefined ? `${String(i['action'])} takes no revs` : undefined),
    notice: 'create overwrites an existing bundle file.',
    argv: i => ['bundle', String(i['action']), String(i['file']), ...(i['action'] === 'create' ? list(i['revs']) : [])],
  }),
  op('fast-export', {
    cls: i => (text(i['exportMarks']) !== undefined ? 'destructive' : 'none'), mutating: true, timeoutMs: 120_000,
    fields: { revs: field.strs('The refs or ranges to export.'), all: field.bool('Export every ref (--all).'), exportMarks: path('Write the marks to this file.') },
    atLeastOne: [['revs', 'all']], refs: ['revs'], paths: ['exportMarks'],
    notice: 'With export marks, an existing file of that name is overwritten.',
    argv: i => ['fast-export', ...flag(i['all'], '--all'), ...(text(i['exportMarks']) !== undefined ? [`--export-marks=${text(i['exportMarks'])}`] : []), ...list(i['revs'])],
  }),
  op('diagnose', {
    cls: i => (text(i['output']) !== undefined ? 'destructive' : 'common'), mutating: true, parse: combined, timeoutMs: 300_000,
    fields: { output: path('Directory to write the archive into (default: the repository directory).'), suffix: field.str('Name the archive git-diagnostics-<suffix>.zip.'), mode: field.oneOf(['stats', 'all'], 'What to include (default stats).') },
    paths: ['output'],
    notice: 'An existing archive of the same name is overwritten.',
    argv: i => ['diagnose', `--mode=${text(i['mode']) ?? 'stats'}`, ...(text(i['output']) !== undefined ? ['-o', text(i['output'])!] : []), ...(text(i['suffix']) !== undefined ? ['-s', text(i['suffix'])!] : [])],
  }),
  op('bugreport', {
    // git bugreport opens the report in the configured editor once it is written; 'true' is an editor that does nothing
    env: { GIT_EDITOR: 'true' },
    cls: i => (text(i['output']) !== undefined ? 'destructive' : 'common'), mutating: true, parse: combined,
    fields: { output: path('Directory to write the report into (default: the repository directory).'), suffix: field.str('Name the report git-bugreport-<suffix>.txt.') },
    paths: ['output'],
    notice: 'An existing report of the same name is overwritten.',
    argv: i => ['bugreport', ...(text(i['output']) !== undefined ? ['-o', text(i['output'])!] : []), ...(text(i['suffix']) !== undefined ? ['-s', text(i['suffix'])!] : [])],
  }),
];

export const gitPatchTool = buildGitFamilyTool({
  id: 'git_patch',
  description: 'Patches, archives and bundles: apply, am, format-patch, archive, bundle, fast-export, diagnose and bugreport. Pass patch text as `patch` or `mbox`. An op that writes a file the call names asks for approval every time.',
  ops: GIT_PATCH_OPS,
});
