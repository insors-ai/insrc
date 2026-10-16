/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E20261016f52996c2:S001 / t5 — the code-reference page script and the chat page read a
 * reference the same way.
 *
 * The chat page (`vscode-plugin/src/chat/link-markup.ts`) and the companion/docgen page script
 * (`render/code-ref-script.ts`) each carry their own copy of the grammar, because one is a
 * string run in the chat webview and the other a string inlined in a page. This test reads the
 * chat page's CREF_EXT and CREF_FIND from that file and requires the script's to be the same
 * expression, with ONE allowed difference: the chat page takes a directory part of zero or more
 * segments, the script requires at least one, so a bare file name in a diagram is not a link.
 * The extension list, the line forms (`:N`, `:N-M`, `:N:C`) and the boundary rules must match.
 *
 * Run: npx tsx --test src/docgen/__tests__/code-ref-grammar-pin.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

import { CODE_REF_SCRIPT } from '../render/code-ref-script.js';

const CHAT_SOURCE = readFileSync(fileURLToPath(new URL('../../../vscode-plugin/src/chat/link-markup.ts', import.meta.url)), 'utf8');

/** The directory group of a reference: zero or more segments in the chat page, one or more in the script. */
const DIR_ZERO_OR_MORE = '(?:[A-Za-z0-9_.@-]+/)*';
const DIR_ONE_OR_MORE = '(?:[A-Za-z0-9_.@-]+/)+';

/** The text of one `var NAME=...;` line of a source, up to the line's end. */
function varLine(source: string, name: string): string {
  const m = new RegExp(`^var ${name}=(.*);$`, 'm').exec(source);
  assert.ok(m, `${name} is declared on one line`);
  return m[1]!;
}

/** Evaluate the declarations `names` (in order) of a source and return the named values. */
function evalVars(source: string, names: readonly string[]): Record<string, unknown> {
  const code = names.map(n => `var ${n}=${varLine(source, n)};`).join('\n');
  return runInNewContext(`${code}\n({ ${names.join(', ')} })`) as Record<string, unknown>;
}

/** A RegExp's source with the slash escaping a RegExp adds undone, so it reads as it was written. */
const sourceOf = (re: unknown): string => (re as RegExp).source.replace(/\\\//g, '/');

const chat = evalVars(CHAT_SOURCE, ['CREF_EXT', 'CREF_CORE', 'CREF_FIND']);
const script = evalVars(CODE_REF_SCRIPT, ['EXT', 'RE']);

test('src/docgen/__tests__/code-ref-grammar-pin.test.ts: the page script\'s reference grammar equals the chat page\'s CREF_EXT and CREF_CORE except that it requires a directory part', () => {
  // The extension list is the same list.
  assert.equal(script['EXT'], chat['CREF_EXT'], 'the extension list differs from the chat page\'s CREF_EXT');

  // The chat page's find expression, with the one allowed difference applied, is the script's.
  const chatFind = sourceOf(chat['CREF_FIND']);
  assert.ok(chatFind.includes(DIR_ZERO_OR_MORE), 'the chat page takes a directory part of zero or more segments (this pin is out of date if it does not)');
  const expected = chatFind.replace(DIR_ZERO_OR_MORE, DIR_ONE_OR_MORE);
  assert.equal(sourceOf(script['RE']), expected,
    'the script differs from the chat page in more than the required directory part: ' +
    'extension list, line forms (:N, :N-M, :N:C) and boundary rules must be the same');

  // The difference is real and is the only one: a bare name is read by the chat page and not by the script.
  const probe = 'synthesizer.ts:207';
  assert.ok((chat['CREF_FIND'] as RegExp).test(probe), 'the chat page reads a bare file name');
  assert.ok(!(script['RE'] as RegExp).test(probe), 'the script does not');
  for (const ref of ['src/a.ts', 'src/a.ts:12', 'src/a.ts:12-30', 'src/a.ts:12:4']) {
    const m = (script['RE'] as RegExp).exec(ref);
    assert.ok(m, `${ref} is read`);
    assert.equal(m[0], ref, `${ref} is read whole`);
  }
});
