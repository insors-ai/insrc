/**
 * git_setup -- creating repositories (Story s8): init, init-db and clone. The ext:: transport, which runs a command, is
 * switched off for clone, and a url that starts with '-' is refused.
 */

import { Type } from '@sinclair/typebox';
import { field } from '../gh/op-table.js';
import type { FieldSpec } from '../gh/op-table.js';
import { buildGitFamilyTool } from './op-table.js';
import type { GitOpSpec, GitRun } from './op-table.js';
import { SAFE_REF } from './safe-args.js';

const flag = (on: unknown, ...words: string[]): string[] => (on === true ? words : []);
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const branch: FieldSpec = { ...field.str('The name of the initial branch.'), pattern: SAFE_REF };

const INIT_FIELDS = { directory: field.str('The directory to create the repository in (default: the working directory).'), bare: field.bool('Make a bare repository.'), initialBranch: branch };
const initAnswer = { reinitialised: Type.Boolean(), text: Type.String() };
const initParse = (run: GitRun): Record<string, unknown> => ({ reinitialised: /^Reinitialized existing/i.test(run.stdout.trim()), text: run.stdout.trim() });
const initOp = (name: 'init' | 'init-db'): GitOpSpec => ({
  name, cls: 'common', timeoutMs: 60_000, fields: INIT_FIELDS, refs: ['directory'], answer: initAnswer, parse: initParse,
  argv: i => [name, ...flag(i['bare'], '--bare'), ...(text(i['initialBranch']) !== undefined ? ['--initial-branch', text(i['initialBranch'])!] : []), ...(text(i['directory']) !== undefined ? [text(i['directory'])!] : [])],
});

export const GIT_SETUP_OPS: readonly GitOpSpec[] = [
  initOp('init'),
  initOp('init-db'),
  {
    name: 'clone', cls: 'common', timeoutMs: 600_000, parse: (run: GitRun) => ({ text: `${run.stdout}${run.stderr}`.trim() }),
    fields: {
      url: field.str('The repository to clone: a path or a url.'), directory: field.str('The directory to clone into.'), depth: field.int('Make a shallow clone of this many commits.'),
      branch: { ...field.str('Check out this branch (or tag) instead of the remote HEAD.'), pattern: SAFE_REF }, bare: field.bool('Make a bare repository.'),
    },
    required: ['url'], refs: ['url', 'directory'],
    check: i => (/^ext::/i.test(String(i['url'])) ? 'the ext:: transport runs a command and is not allowed' : undefined),
    argv: i => ['-c', 'protocol.ext.allow=never', 'clone', '--quiet', ...flag(i['bare'], '--bare'), ...(typeof i['depth'] === 'number' ? ['--depth', String(i['depth'])] : []),
      ...(text(i['branch']) !== undefined ? ['--branch', text(i['branch'])!] : []), '--', String(i['url']), ...(text(i['directory']) !== undefined ? [text(i['directory'])!] : [])],
  },
];

export const gitSetupTool = buildGitFamilyTool({
  id: 'git_setup',
  description: 'Create a repository: init, init-db (the old name of init) and clone. init in an existing repository reinitialises it without losing anything and says so.',
  ops: GIT_SETUP_OPS,
});
