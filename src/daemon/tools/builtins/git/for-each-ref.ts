/**
 * git_for_each_ref -- list refs with chosen fields, filtered by what they contain or are merged into (read-only, no approval).
 */

import { Type } from '@sinclair/typebox';
import type { Tool, ToolInput, ToolResult } from '../../types.js';
import { assertSafeArg, readGit, rejectInput, str } from './helpers.js';
import { forEachRefFormat, parseForEachRef, parseOutput } from './parsers.js';
import { GitForEachRefDataSchema } from './schemas.js';
import type { GitForEachRefData } from './schemas.js';

/** The fixed set of fields a caller may ask for. */
export const FOR_EACH_REF_FIELDS = [
  'refname', 'refname:short', 'objectname', 'objectname:short', 'objecttype', '*objectname', 'upstream', 'upstream:short', 'upstream:track',
  'HEAD', 'symref', 'subject', 'authorname', 'authoremail', 'committerdate:iso-strict', 'creatordate:iso-strict',
] as const;

const DEFAULT_FIELDS = ['refname', 'objectname'];
const SORT_KEY = /^-?[a-z*][a-z:*\-=0-9]*$/i;

export const gitForEachRefTool: Tool = {
  id: 'git_for_each_ref',
  description: 'List refs (branches, tags, remote-tracking refs) with the chosen fields. Filter by pattern, by commits they contain, are merged into, are not merged into, or point at.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    pattern: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: 'Ref patterns, e.g. ["refs/heads", "refs/remotes/origin"]. Default: every ref.' })),
    fields: Type.Optional(Type.Array(Type.String({ enum: [...FOR_EACH_REF_FIELDS] }), { minItems: 1, description: 'Fields to return per ref. Default: refname and objectname.' })),
    sort: Type.Optional(Type.String({ description: 'Sort key, e.g. refname or -committerdate (a leading - reverses).' })),
    count: Type.Optional(Type.Number({ description: 'At most this many refs.', minimum: 1 })),
    contains: Type.Optional(Type.String({ description: 'Only refs whose history contains this commit (--contains).' })),
    merged: Type.Optional(Type.String({ description: 'Only refs whose tip is reachable from this commit (--merged).' })),
    noMerged: Type.Optional(Type.String({ description: 'Only refs whose tip is not reachable from this commit (--no-merged).' })),
    pointsAt: Type.Optional(Type.String({ description: 'Only refs that point at this object (--points-at).' })),
  }, { additionalProperties: false }),
  outputSchema: GitForEachRefDataSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const fields = Array.isArray(input['fields']) ? (input['fields'] as unknown[]).map(String) : DEFAULT_FIELDS;
    const patterns = Array.isArray(input['pattern']) ? (input['pattern'] as unknown[]).map(String) : [];
    const sort = str(input, 'sort');
    if (sort !== undefined && !SORT_KEY.test(sort)) { return rejectInput('git_for_each_ref', `unsupported sort key ${JSON.stringify(sort)}`); }

    const argv = ['git', 'for-each-ref', `--format=${forEachRefFormat(fields)}`];
    if (sort !== undefined) { argv.push(`--sort=${sort}`); }
    if (typeof input['count'] === 'number') { argv.push(`--count=${Math.floor(input['count'])}`); }
    for (const [key, flag] of [['contains', '--contains'], ['merged', '--merged'], ['noMerged', '--no-merged'], ['pointsAt', '--points-at']] as const) {
      const v = str(input, key);
      if (v !== undefined) { assertSafeArg(v, 'ref'); argv.push(flag, v); }
    }
    for (const p of patterns) { assertSafeArg(p, 'ref'); }
    argv.push(...patterns);

    const read = await readGit('git_for_each_ref', argv, cwd, 30_000);
    if (!read.ok) { return read.failure; }
    const parsed = parseOutput('git_for_each_ref', read.r, raw => parseForEachRef(raw, fields));
    if (!parsed.ok) { return parsed.failure; }
    const data: GitForEachRefData = { refs: parsed.value };
    const body = parsed.value.map(r => fields.map(f => r[f]).join('  ')).join('\n') || '(no refs)';
    return { output: body, format: 'text', success: true, data };
  },
};
