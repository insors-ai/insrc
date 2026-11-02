/**
 * git_text -- the filters that read their input from standard input (Story s8). The content is an input of the call, sent
 * through runShellBytes; the answer is the filter's output. Every op is class none: none of them changes a repository.
 * mailinfo and mailsplit write files, so they run in a scratch directory that is read back and removed.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Type } from '@sinclair/typebox';
import { field } from '../gh/op-table.js';
import { buildGitFamilyTool, lineList, trimmedText } from './op-table.js';
import type { GitOpSpec } from './op-table.js';

const content = (what: string) => ({ content: field.str(what, true) });
const flag = (on: unknown, ...words: string[]): string[] => (on === true ? words : []);
const read = (name: string, rest: Omit<GitOpSpec, 'name' | 'cls' | 'timeoutMs' | 'stdin' | 'required'>): GitOpSpec =>
  ({ cls: 'none', timeoutMs: 30_000, stdin: 'content', required: ['content'], ...rest, name });
const readOrEmpty = (path: string): string => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };

export const GIT_TEXT_OPS: readonly GitOpSpec[] = [
  read('column', {
    fields: { ...content('The lines to lay out in columns.'), mode: field.oneOf(['column', 'row', 'plain', 'dense'], 'Layout (default column).'), width: field.int('Width of the screen (default 80).', 10) },
    argv: i => ['column', `--mode=${typeof i['mode'] === 'string' ? i['mode'] : 'column'}`, `--width=${typeof i['width'] === 'number' ? i['width'] : 80}`], parse: trimmedText,
  }),
  read('stripspace', {
    fields: { ...content('The text to clean up.'), stripComments: field.bool('Remove lines that start with the comment character.'), commentLines: field.bool('Prefix every line with the comment character.') },
    exclusive: [['stripComments', 'commentLines']],
    argv: i => ['stripspace', ...flag(i['stripComments'], '--strip-comments'), ...flag(i['commentLines'], '--comment-lines')],
  }),
  read('interpret-trailers', {
    fields: { ...content('The message to add trailers to.'), trailers: field.strs('Trailers to add, as "Token: value".'), parse: field.bool('Only print the trailers of the message.'), onlyTrailers: field.bool('Only print the trailers.') },
    argv: i => ['interpret-trailers', ...flag(i['parse'], '--parse'), ...flag(i['onlyTrailers'], '--only-trailers'), ...(Array.isArray(i['trailers']) ? i['trailers'].flatMap(t => ['--trailer', String(t)]) : [])],
  }),
  read('fmt-merge-msg', {
    fields: { ...content('FETCH_HEAD lines: "<sha><TAB><TAB>branch \'x\' of <url>".'), message: field.str('Use this message instead of the default title.') },
    argv: i => ['fmt-merge-msg', ...(typeof i['message'] === 'string' ? ['-m', i['message']] : [])],
  }),
  read('patch-id', {
    fields: { ...content('A patch or a mailbox of patches.'), mode: field.oneOf(['stable', 'unstable', 'verbatim'], 'How the id is computed (default stable).') },
    argv: i => ['patch-id', `--${typeof i['mode'] === 'string' ? i['mode'] : 'stable'}`],
    answer: { count: Type.Number(), items: Type.Array(Type.Object({ patchId: Type.String(), commitId: Type.String() })) },
    parse: run => {
      const items: { patchId: string; commitId: string }[] = [];
      for (const line of lineList(run.stdout)) {
        const m = /^([0-9a-f]{40,64}) ([0-9a-f]{40,64})$/.exec(line);
        if (m === null) { return undefined; }
        items.push({ patchId: m[1]!, commitId: m[2]! });
      }
      return { count: items.length, items };
    },
  }),
  read('mailinfo', {
    fields: { ...content('One mail message.'), keepSubject: field.bool('Keep the subject as it is (-k).'), scissors: field.bool('Remove everything before a scissors line.') },
    scratch: true,
    argv: (i, dir) => ['mailinfo', ...flag(i['keepSubject'], '-k'), ...flag(i['scissors'], '--scissors'), join(dir, 'msg'), join(dir, 'patch')],
    answer: { headers: Type.String(), message: Type.String(), patch: Type.String() },
    parse: (run, _i, dir) => ({ headers: run.stdout.trim(), message: readOrEmpty(join(dir, 'msg')), patch: readOrEmpty(join(dir, 'patch')) }),
  }),
  read('mailsplit', {
    fields: { ...content('A mailbox (mbox) of messages.') },
    scratch: true,
    argv: (_i, dir) => ['mailsplit', `-o${dir}`],
    answer: { count: Type.Number(), messages: Type.Array(Type.String()) },
    parse: (run, _i, dir) => {
      const n = Number(run.stdout.trim());
      if (!Number.isInteger(n)) { return undefined; }
      const messages = readdirSync(dir).sort().map(f => readOrEmpty(join(dir, f)));
      return messages.length === n ? { count: n, messages } : undefined;
    },
  }),
];

export const gitTextTool = buildGitFamilyTool({
  id: 'git_text',
  description: 'Git filters that read text from the call: column, stripspace, interpret-trailers, fmt-merge-msg, patch-id, mailinfo and mailsplit. Pass the text as `content`. Never changes a repository and never asks for approval.',
  ops: GIT_TEXT_OPS,
});
