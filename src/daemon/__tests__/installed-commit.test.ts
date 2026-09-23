/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the installed-commit reader (Story S002 / sc2, plan t1). Every
 * git exec is an injected seam, so nothing here spawns a real git process — the
 * best-effort/never-throw guarantee daemon.status relies on is asserted directly.
 *
 * Run: npx tsx --test src/daemon/__tests__/installed-commit.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readInstalledCommit, DAEMON_ROOT, type ExecFn } from '../installed-commit.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';

test('t1: readInstalledCommit returns the trimmed sha for a valid HEAD (trailing newline stripped)', () => {
  const exec: ExecFn = () => `${SHA}\n`;
  assert.equal(readInstalledCommit('/some/root', { exec }), SHA);
});

test('t1: readInstalledCommit invokes git with `-C <root> rev-parse HEAD`', () => {
  let seen: { cmd: string; args: readonly string[] } | undefined;
  const exec: ExecFn = (cmd, args) => { seen = { cmd, args }; return SHA; };
  readInstalledCommit('/daemon/root', { exec });
  assert.deepEqual(seen, { cmd: 'git', args: ['-C', '/daemon/root', 'rev-parse', 'HEAD'] });
});

test('t1: any exec failure (throw / non-git / ENOENT) returns \'\' and never throws', () => {
  const throwing: ExecFn = () => { throw new Error('fatal: not a git repository'); };
  assert.doesNotThrow(() => readInstalledCommit('/nope', { exec: throwing }));
  assert.equal(readInstalledCommit('/nope', { exec: throwing }), '');

  const enoent: ExecFn = () => { const e = new Error('spawn git ENOENT'); (e as NodeJS.ErrnoException).code = 'ENOENT'; throw e; };
  assert.equal(readInstalledCommit('/root', { exec: enoent }), '');
});

test('t1: with no root arg it resolves DAEMON_ROOT = $INSRC_DAEMON_ROOT ?? ~/.insrc/daemon', () => {
  // DAEMON_ROOT is resolved at import time from the env; assert readInstalledCommit
  // targets exactly that root when called with no explicit root.
  let seenRoot: string | undefined;
  const exec: ExecFn = (_cmd, args) => { seenRoot = args[1]; return SHA; };
  readInstalledCommit(undefined, { exec });
  assert.equal(seenRoot, DAEMON_ROOT);
  // And DAEMON_ROOT itself follows the env-var + default convention.
  const expected = process.env['INSRC_DAEMON_ROOT'] ?? `${process.env['HOME'] ?? ''}/.insrc/daemon`;
  if (process.env['INSRC_DAEMON_ROOT']) {
    assert.equal(DAEMON_ROOT, process.env['INSRC_DAEMON_ROOT']);
  } else {
    assert.ok(DAEMON_ROOT.endsWith('/.insrc/daemon'), `DAEMON_ROOT should default under ~/.insrc/daemon (got ${DAEMON_ROOT}, expected like ${expected})`);
  }
});
