/**
 * git_inspect -- the read-only queries that have no tool of their own (Story s8). One tool with an `op` enum built from
 * the git op table; every op is class none. A query whose exit code 1 means "no match" (grep, check-ignore, cherry-style
 * lists, check-ref-format, the verify commands) answers found / valid / verified false and is not a failure.
 */

import { Type } from '@sinclair/typebox';
import type { TSchema } from '@sinclair/typebox';
import { field } from '../gh/op-table.js';
import type { FieldSpec } from '../gh/op-table.js';
import { buildGitFamilyTool, LINES_ANSWER, lineList, linesParse, trimmedText } from './op-table.js';
import type { GitOpSpec, GitRun } from './op-table.js';
import { SAFE_REV } from './safe-args.js';

const rev = (description: string): FieldSpec => ({ ...field.str(description), pattern: SAFE_REV });
const flag = (on: boolean | undefined, ...words: string[]): string[] => (on === true ? words : []);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

const CHANGES: Readonly<Record<string, TSchema>> = {
  count: Type.Number(),
  items: Type.Array(Type.Object({ status: Type.String(), path: Type.String() })),
};
/** `git diff-files --name-status` and its kin: `M<TAB>path`, and `R100<TAB>old<TAB>new` for a rename. */
const changesParse = (run: GitRun): Record<string, unknown> | undefined => {
  const items: { status: string; path: string }[] = [];
  for (const line of lineList(run.stdout)) {
    const [status, ...rest] = line.split('\t');
    if (status === undefined || rest.length === 0) { return undefined; }
    items.push({ status, path: rest.join('\t') });
  }
  return { count: items.length, items };
};

const read = (name: string, rest: Omit<GitOpSpec, 'name' | 'cls' | 'timeoutMs'> & { timeoutMs?: number }): GitOpSpec =>
  ({ cls: 'none', timeoutMs: 15_000, ...rest, name });

export const GIT_INSPECT_OPS: readonly GitOpSpec[] = [
  read('describe', {
    fields: { rev: rev('Commit-ish to describe (default HEAD).'), tags: field.bool('Use any tag, not only annotated ones.'), always: field.bool('Show the abbreviated object name when nothing describes it.') },
    refs: ['rev'], parse: trimmedText,
    argv: i => ['describe', ...flag(i['tags'] === true, '--tags'), ...flag(i['always'] === true, '--always'), ...(text(i['rev']) !== undefined ? [text(i['rev'])!] : [])],
  }),
  read('name-rev', {
    fields: { rev: rev('Commit-ish to name.') }, required: ['rev'], refs: ['rev'], parse: trimmedText,
    argv: i => ['name-rev', '--name-only', String(i['rev'])],
  }),
  read('cherry', {
    fields: { upstream: rev('Upstream branch to compare against.'), head: rev('Branch to check (default HEAD).') }, required: ['upstream'], refs: ['upstream', 'head'],
    argv: i => ['cherry', String(i['upstream']), ...(text(i['head']) !== undefined ? [text(i['head'])!] : [])],
    answer: { count: Type.Number(), items: Type.Array(Type.Object({ sign: Type.String(), sha: Type.String() })) },
    parse: run => {
      const items: { sign: string; sha: string }[] = [];
      for (const line of lineList(run.stdout)) {
        const m = /^([+-]) ([0-9a-f]{7,64})$/.exec(line);
        if (m === null) { return undefined; }
        items.push({ sign: m[1]!, sha: m[2]! });
      }
      return { count: items.length, items };
    },
  }),
  read('shortlog', {
    fields: { rev: rev('Revision to summarise (default HEAD).'), summary: field.bool('Only the commit counts.'), numbered: field.bool('Sort by number of commits.'), email: field.bool('Show author emails.') },
    refs: ['rev'], parse: trimmedText,
    argv: i => ['shortlog', ...flag(i['summary'] === true, '-s'), ...flag(i['numbered'] === true, '-n'), ...flag(i['email'] === true, '-e'), text(i['rev']) ?? 'HEAD'],
  }),
  read('show-branch', {
    fields: { refs: field.strs('Branches or refs to compare.') }, refs: ['refs'], parse: trimmedText,
    argv: i => ['show-branch', '--no-color', ...list(i['refs'])],
  }),
  read('grep', {
    fields: {
      pattern: field.str('The pattern to search for.'), rev: rev('Search this revision instead of the working tree.'),
      paths: field.strs('Limit to these paths.'), ignoreCase: field.bool('Ignore case.'), fixed: field.bool('Treat the pattern as a fixed string.'),
    },
    required: ['pattern'], refs: ['rev'], paths: ['paths'], okCodes: [0, 1],
    argv: i => ['grep', '-n', ...flag(i['ignoreCase'] === true, '-i'), ...flag(i['fixed'] === true, '-F'), '-e', String(i['pattern']),
      ...(text(i['rev']) !== undefined ? [text(i['rev'])!] : []), ...(list(i['paths']).length > 0 ? ['--', ...list(i['paths'])] : [])],
    answer: { found: Type.Boolean(), matches: Type.Array(Type.String()) },
    parse: run => ({ found: run.code === 0, matches: lineList(run.stdout) }),
  }),
  read('last-modified', {
    fields: { rev: rev('Revision to start from (default HEAD).'), paths: field.strs('Limit to these paths.') }, refs: ['rev'], paths: ['paths'],
    argv: i => ['last-modified', ...(text(i['rev']) !== undefined ? [text(i['rev'])!] : []), ...(list(i['paths']).length > 0 ? ['--', ...list(i['paths'])] : [])],
    answer: { count: Type.Number(), items: Type.Array(Type.Object({ sha: Type.String(), path: Type.String() })) },
    parse: run => {
      const items: { sha: string; path: string }[] = [];
      for (const line of lineList(run.stdout)) {
        const [sha, ...rest] = line.split('\t');
        if (sha === undefined || rest.length === 0) { return undefined; }
        items.push({ sha, path: rest.join('\t') });
      }
      return { count: items.length, items };
    },
  }),
  read('count-objects', {
    fields: { verbose: field.bool('Also report packs and garbage.') }, parse: trimmedText,
    argv: i => ['count-objects', ...flag(i['verbose'] === true, '-v')],
  }),
  read('var', {
    fields: { variable: field.oneOf(['GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT', 'GIT_EDITOR', 'GIT_PAGER', 'GIT_DEFAULT_BRANCH', 'GIT_SHELL_PATH'], 'The logical variable.') },
    required: ['variable'], parse: trimmedText,
    argv: i => ['var', String(i['variable'])],
  }),
  read('version', {
    fields: { build: field.bool('Also print the build options.') }, parse: trimmedText,
    argv: i => ['version', ...flag(i['build'] === true, '--build-options')],
  }),
  read('check-attr', {
    fields: { attrs: field.strs('Attribute names.'), paths: field.strs('Paths to check.') }, required: ['attrs', 'paths'], refs: ['attrs'], paths: ['paths'],
    argv: i => ['check-attr', ...list(i['attrs']), '--', ...list(i['paths'])],
    answer: { count: Type.Number(), items: Type.Array(Type.Object({ path: Type.String(), attr: Type.String(), value: Type.String() })) },
    parse: run => {
      const items: { path: string; attr: string; value: string }[] = [];
      for (const line of lineList(run.stdout)) {
        const m = /^(.*): ([^:]+): (.*)$/.exec(line);
        if (m === null) { return undefined; }
        items.push({ path: m[1]!, attr: m[2]!, value: m[3]! });
      }
      return { count: items.length, items };
    },
  }),
  read('check-ignore', {
    fields: { paths: field.strs('Paths to test against the ignore rules.') }, required: ['paths'], paths: ['paths'], okCodes: [0, 1],
    argv: i => ['check-ignore', '--', ...list(i['paths'])],
    answer: { found: Type.Boolean(), paths: Type.Array(Type.String()) },
    parse: run => ({ found: run.code === 0, paths: lineList(run.stdout) }),
  }),
  read('check-mailmap', {
    fields: { contacts: field.strs('Contacts as "Name <email>" or "<email>".') }, required: ['contacts'], refs: ['contacts'],
    argv: i => ['check-mailmap', ...list(i['contacts'])], answer: LINES_ANSWER, parse: linesParse,
  }),
  read('check-ref-format', {
    fields: { name: field.str('The reference name to test.'), branch: field.bool('Test it as a branch name.') }, required: ['name'], refs: ['name'], okCodes: [0, 1],
    argv: i => ['check-ref-format', ...flag(i['branch'] === true, '--branch'), String(i['name'])],
    answer: { valid: Type.Boolean() }, parse: run => ({ valid: run.code === 0 }),
  }),
  read('get-tar-commit-id', {
    fields: { archive: field.str('A tar archive made by git archive, base64-encoded.') }, required: ['archive'], stdin: 'archive', stdinEncoding: 'base64', okCodes: [0, 1],
    argv: () => ['get-tar-commit-id'],
    answer: { found: Type.Boolean(), sha: Type.String() }, parse: run => ({ found: run.code === 0, sha: run.stdout.trim() }),
  }),
  read('diff-files', {
    fields: { paths: field.strs('Limit to these paths.') }, paths: ['paths'], answer: CHANGES, parse: changesParse,
    argv: i => ['diff-files', '--name-status', ...(list(i['paths']).length > 0 ? ['--', ...list(i['paths'])] : [])],
  }),
  read('diff-index', {
    fields: { rev: rev('Tree-ish to compare with.'), cached: field.bool('Compare the index, not the working tree.'), paths: field.strs('Limit to these paths.') },
    required: ['rev'], refs: ['rev'], paths: ['paths'], answer: CHANGES, parse: changesParse,
    argv: i => ['diff-index', '--name-status', ...flag(i['cached'] === true, '--cached'), String(i['rev']), ...(list(i['paths']).length > 0 ? ['--', ...list(i['paths'])] : [])],
  }),
  read('diff-pairs', {
    fields: { raw: field.str('The output of git diff-tree -r -z.', true) }, required: ['raw'], stdin: 'raw',
    argv: () => ['diff-pairs', '-z'],
    maxBytes: 1024 * 1024,
  }),
  read('range-diff', {
    fields: { rangeA: rev('The first range (a..b).'), rangeB: rev('The second range.') }, required: ['rangeA', 'rangeB'], refs: ['rangeA', 'rangeB'], parse: trimmedText,
    argv: i => ['range-diff', '--no-color', String(i['rangeA']), String(i['rangeB'])],
  }),
  read('show-index', {
    fields: { index: field.str('A pack index (.idx) file, base64-encoded.') }, required: ['index'], stdin: 'index', stdinEncoding: 'base64', parse: trimmedText,
    argv: () => ['show-index'],
  }),
  read('verify-commit', {
    fields: { rev: rev('Commit to verify.'), verbose: field.bool('Print the commit as well.') }, required: ['rev'], refs: ['rev'], okCodes: [0, 1],
    argv: i => ['verify-commit', ...flag(i['verbose'] === true, '-v'), String(i['rev'])],
    answer: { verified: Type.Boolean(), text: Type.String() }, parse: run => ({ verified: run.code === 0, text: `${run.stdout}${run.stderr}`.trim() }),
  }),
  read('verify-tag', {
    fields: { rev: rev('Tag to verify.'), verbose: field.bool('Print the tag as well.') }, required: ['rev'], refs: ['rev'], okCodes: [0, 1],
    argv: i => ['verify-tag', ...flag(i['verbose'] === true, '-v'), String(i['rev'])],
    answer: { verified: Type.Boolean(), text: Type.String() }, parse: run => ({ verified: run.code === 0, text: `${run.stdout}${run.stderr}`.trim() }),
  }),
  read('verify-pack', {
    fields: { pack: field.str('Path of the .idx or .pack file.'), verbose: field.bool('List the objects.') }, required: ['pack'], refs: ['pack'], parse: trimmedText, timeoutMs: 120_000,
    argv: i => ['verify-pack', ...flag(i['verbose'] === true, '-v'), String(i['pack'])],
  }),
  read('fsck', {
    fields: { connectivityOnly: field.bool('Check connectivity only.'), noDangling: field.bool('Do not report dangling objects.'), unreachable: field.bool('Report unreachable objects.') }, parse: trimmedText, timeoutMs: 300_000,
    argv: i => ['fsck', '--no-progress', ...flag(i['connectivityOnly'] === true, '--connectivity-only'), ...flag(i['noDangling'] === true, '--no-dangling'), ...flag(i['unreachable'] === true, '--unreachable')],
  }),
  read('fsck-objects', {
    fields: { connectivityOnly: field.bool('Check connectivity only.'), noDangling: field.bool('Do not report dangling objects.'), unreachable: field.bool('Report unreachable objects.') }, parse: trimmedText, timeoutMs: 300_000,
    argv: i => ['fsck-objects', '--no-progress', ...flag(i['connectivityOnly'] === true, '--connectivity-only'), ...flag(i['noDangling'] === true, '--no-dangling'), ...flag(i['unreachable'] === true, '--unreachable')],
  }),
  read('pack-redundant', {
    parse: trimmedText, timeoutMs: 120_000,
    argv: () => ['pack-redundant', '--i-still-use-this', '--all'],
  }),
  read('repo', {
    fields: { what: field.oneOf(['info', 'structure'], 'info prints repository facts, structure prints its shape.'), keys: field.strs('For info: the keys to print (default: all).') },
    required: ['what'], refs: ['keys'], parse: trimmedText, timeoutMs: 60_000,
    argv: i => (i['what'] === 'structure' ? ['repo', 'structure'] : ['repo', 'info', ...(list(i['keys']).length > 0 ? list(i['keys']) : ['--all'])]),
  }),
];

export const gitInspectTool = buildGitFamilyTool({
  id: 'git_inspect',
  description: 'Read-only git queries: describe, name-rev, cherry, shortlog, show-branch, grep, last-modified, count-objects, var, version, check-attr, check-ignore, check-mailmap, check-ref-format, get-tar-commit-id, diff-files, diff-index, diff-pairs, range-diff, show-index, verify-commit, verify-tag, verify-pack, fsck, fsck-objects, pack-redundant and repo. Never asks for approval.',
  ops: GIT_INSPECT_OPS,
});
