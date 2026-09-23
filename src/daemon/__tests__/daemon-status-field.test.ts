/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the additive DaemonStatus.installedCommit field + its wiring into the
 * daemon.status handler (Story S002 / sc2, plan t2). The daemon.status handler body
 * lives inside the daemon setup closure, so — like the daemon.debug-status test —
 * these replicate the handler's field assignment inline over an injected reader,
 * plus one real end-to-end read against this repo's own git HEAD.
 *
 * Run: npx tsx --test src/daemon/__tests__/daemon-status-field.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readInstalledCommit, type ExecFn } from '../installed-commit.js';
import type { DaemonStatus } from '../../shared/types.js';

/** A minimal DaemonStatus base, mirroring the handler's object literal (sans the
 *  installedCommit field the handler adds from readInstalledCommit). */
function baseStatus(): Omit<DaemonStatus, 'installedCommit'> {
  return { uptime: 1, repos: [], queueDepth: 0, embeddingsPending: 0, modelPullStatus: 'ready' };
}

const SHA = 'abcabcabcabcabcabcabcabcabcabcabcabcabca';

test('t2: the status object includes installedCommit populated from the reader', () => {
  const exec: ExecFn = () => SHA;
  const status: DaemonStatus = { ...baseStatus(), installedCommit: readInstalledCommit('/root', { exec }) };
  assert.equal(status.installedCommit, SHA);
  // The other fields are intact.
  assert.equal(status.uptime, 1);
  assert.equal(status.queueDepth, 0);
});

test('t2: a reader returning \'\' yields installedCommit:\'\' with the rest of the status intact (never throws)', () => {
  const failing: ExecFn = () => { throw new Error('not a git repo'); };
  let status: DaemonStatus | undefined;
  assert.doesNotThrow(() => {
    status = { ...baseStatus(), installedCommit: readInstalledCommit('/nope', { exec: failing }) };
  });
  assert.equal(status!.installedCommit, '');
  assert.equal(status!.modelPullStatus, 'ready');
});

test('t2: sc1 (daemon.update/updateOutcome) surface is untouched by the status change', async () => {
  // The status field-add must not disturb S001's sc1 module: its exports still resolve.
  const mod = await import('../update-runner.js');
  assert.equal(typeof mod.launchUpdate, 'function');
  assert.equal(typeof mod.readUpdateOutcome, 'function');
  assert.equal(typeof mod.makeUpdateHandlers, 'function');
});

test('t2: end-to-end — readInstalledCommit() with the default git exec returns this repo\'s real HEAD sha', () => {
  // This test repo IS a git checkout, so the default execFileSync path returns a
  // real 40-hex sha, proving the wired reader works against a live git root.
  const sha = readInstalledCommit(process.cwd());
  assert.match(sha, /^[0-9a-f]{40}$/, `expected a 40-hex HEAD sha, got ${JSON.stringify(sha)}`);
});
