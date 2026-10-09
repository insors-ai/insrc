/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E2 s1 / t6 — extension.ts wires the delivery board: the command, its logger, its client, and that none of it sits behind the chat gate. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = readFileSync(join(HERE, '..', '..', 'extension.ts'), 'utf8');
const REGISTRY = readFileSync(join(HERE, '..', '..', 'surfaces', 'command-registry.ts'), 'utf8');
const PKG = JSON.parse(readFileSync(join(HERE, '..', '..', '..', 'package.json'), 'utf8')) as {
  contributes?: { commands?: Array<{ command: string; title: string; category?: string }> };
};

/** [start, end) of the `if (chatEnabled) { … }` block, found by brace matching. */
function chatGateSpan(src: string): readonly [number, number] {
  const start = src.indexOf('if (chatEnabled) {');
  assert.ok(start >= 0, 'extension.ts has the chat gate');
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return [start, i + 1];
  }
  throw new Error('unbalanced chat gate');
}

test('extension.ts registers insrc.delivery.openBoard outside the chat gate with a warn-and-error logger and a repo-scoped delivery client', () => {
  const cmd = PKG.contributes?.commands?.find(c => c.command === 'insrc.delivery.openBoard');
  assert.deepEqual(cmd, { command: 'insrc.delivery.openBoard', title: 'Open delivery board', category: 'insrc' });
  assert.match(REGISTRY, /\| 'insrc\.delivery\.openBoard'/);

  const [gateStart, gateEnd] = chatGateSpan(EXT);
  const at = (needle: string): number => {
    const i = EXT.indexOf(needle);
    assert.ok(i >= 0, `extension.ts contains ${needle}`);
    return i;
  };
  for (const needle of ["commands.register({ id: 'insrc.delivery.openBoard'", 'createDeliveryBoardHost({', 'createDeliveryClient({']) {
    const i = at(needle);
    assert.ok(i < gateStart || i >= gateEnd, `${needle} sits outside the insrc.chat.enabled gate`);
  }

  const wiring = EXT.slice(at('createDeliveryBoardHost({'), at("commands.register({ id: 'insrc.delivery.openBoard'"));
  assert.match(wiring, /logger: \{ warn: panelLog\.warn, error: \(message: string\): void => console\.error\(`\[insrc\] \$\{message\}`\) \}/);
  assert.match(wiring, /rpc: client\.rpc,/);
  assert.match(wiring, /repo: vscode\.workspace\.workspaceFolders\?\.\[0\]\?\.uri\.fsPath \?\? null,/);
  assert.match(wiring, /deadlinesMs: \{ snapshot: 30_000, evidence: 15_000 \}/);
  assert.match(wiring, /createWebviewPanel\(viewType, title, vscode\.ViewColumn\.Active, \{ enableScripts: true \}\)/);
  assert.match(EXT, /const client = createIpcClient\(\);/);
});
