/**
 * git_rev_parse -- resolve revisions and ask git about the repository (read-only, no approval).
 *
 * One query per call: a revision to resolve (optionally abbreviated or verified), or one of the repository facts git
 * reports (git dir, top level, inside a work tree, shallow). The answer is the lines git printed.
 */

import type { TypedTool } from '../../call-tool.js';
import { Type } from '@sinclair/typebox';
import type { ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, readGit, rejectInput, str } from './helpers.js';
import { parseOutput } from './parsers.js';
import { GitRevParseDataSchema } from './schemas.js';
import type { GitRevParseData } from './schemas.js';

export const gitRevParseTool = {
  id: 'git_rev_parse',
  description: 'Resolve a revision to its object name (optionally abbreviated or verified), or report a repository fact: git dir, top level, inside a work tree, shallow.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    rev: Type.Optional(Type.String({ description: 'Revision to resolve (HEAD, a branch, a tag, HEAD~2, a sha).' })),
    abbrevRef: Type.Optional(Type.Boolean({ description: 'With rev: its short ref name (--abbrev-ref), e.g. main for HEAD on main.' })),
    short: Type.Optional(Type.Boolean({ description: 'With rev: an abbreviated object name (--short).' })),
    verify: Type.Optional(Type.Boolean({ description: 'With rev: fail unless it names an object (--verify).' })),
    gitDir: Type.Optional(Type.Boolean({ description: 'Report the path of the .git directory (--git-dir).' })),
    showToplevel: Type.Optional(Type.Boolean({ description: 'Report the repository root (--show-toplevel).' })),
    isInsideWorkTree: Type.Optional(Type.Boolean({ description: 'Report whether cwd is inside a work tree (--is-inside-work-tree).' })),
    isShallow: Type.Optional(Type.Boolean({ description: 'Report whether the repository is shallow (--is-shallow-repository).' })),
  }, { additionalProperties: false }),
  outputSchema: GitRevParseDataSchema,

  async execute(input: ToolInput, deps?: ToolDeps): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const rev = str(input, 'rev');
    const facts: string[] = [];
    if (input['gitDir'] === true) { facts.push('--git-dir'); }
    if (input['showToplevel'] === true) { facts.push('--show-toplevel'); }
    if (input['isInsideWorkTree'] === true) { facts.push('--is-inside-work-tree'); }
    if (input['isShallow'] === true) { facts.push('--is-shallow-repository'); }
    if (rev === undefined && facts.length === 0) { return rejectInput('git_rev_parse', 'give a rev or one of gitDir, showToplevel, isInsideWorkTree, isShallow'); }

    const argv = ['git', 'rev-parse'];
    if (rev !== undefined) {
      assertSafeArg(rev, 'ref');
      if (input['verify'] === true) { argv.push('--verify'); }
      if (input['abbrevRef'] === true) { argv.push('--abbrev-ref'); }
      if (input['short'] === true) { argv.push('--short'); }
    }
    argv.push(...facts);
    if (rev !== undefined) { argv.push(rev); }

    const read = await readGit('git_rev_parse', argv, cwd, 10_000, deps?.signal);
    if (!read.ok) { return read.failure; }
    const parsed = parseOutput('git_rev_parse', read.r, raw => raw.split('\n').filter(l => l !== ''));   // a cut capture is a failure
    if (!parsed.ok) { return parsed.failure; }
    const values = parsed.value;
    const data: GitRevParseData = { values };
    return { output: values.join('\n') || '(nothing)', format: 'text', success: true, data };
  },
} satisfies TypedTool;
