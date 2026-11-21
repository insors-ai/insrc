/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import type { RunFileGuard } from '../shared/daemon-run-files.js';
import { requireProcessIdentity, sameProcess } from '../shared/daemon-process.js';
import { ownedNodeEnvironment, resolveOwnedToolchain } from '../shared/owned-node-runtime.js';
import type { OwnedToolchain } from '../shared/owned-node-runtime.js';
import { SourceNativeActor } from '../shared/source-actor-client.js';
import type { SourceSelection, SourceInstallationStore } from '../shared/source-installation.js';
import type { QualifiedReleasePair } from '../shared/source-release-compatibility.js';
import { verifyStagedReleasePin } from './managed-release-staging.js';

/** Runtime metadata alone cannot authorize a launch: the release-owned bootstrap verifies
 * the retained official archive and distribution inventory before returning these paths. */
export async function verifySourceRuntime(selection: SourceSelection, stateRoot: string): Promise<OwnedToolchain> {
 const toolchain = await resolveOwnedToolchain(selection.pin.root, stateRoot);
 const expected = `${selection.toolchain.nodeVersion}:${selection.target}:${selection.toolchain.archiveSha256}`;
 if (toolchain.node !== selection.pin.runtime || toolchain.identity !== expected) throw new Error('Verified source runtime differs from the selected release');
 return toolchain;
}

/** Run the inspection as a separately owned daemon actor; this controller never opens a DB. */
export async function inspectSourceStores(store: SourceInstallationStore, manager: SourceSelection,
 pair: QualifiedReleasePair, guard: RunFileGuard): Promise<void> {
 const active = store.read().active;
 const assertAdmitted = () => {
  guard.assertOwned();
  const current = store.read().active;
  if (!active || !current || current.id !== active.id || !sameProcess(current.owner, requireProcessIdentity(process.pid))
   || !sameProcess(current.owner, guard.owner) || guard.path !== join(store.root, 'daemon.run-files.guard')
   || !isDeepStrictEqual(current.candidate, manager) || !isDeepStrictEqual(current.execution?.compatibility, pair)
   || !current.execution?.originalClosed || !current.execution.candidateClosed
   || !['predecessor-exited', 'rollback-required'].includes(current.phase)) throw new Error('Store probe lacks a quiesced source transaction grant');
 };
 assertAdmitted();
 await verifyStagedReleasePin(manager.pin);
 const toolchain = await verifySourceRuntime(manager, store.root);
 assertAdmitted();
 const actor = await SourceNativeActor.launch({
  binary: join(manager.pin.root, 'out/bin/insrc-source-actor'), broker: join(manager.pin.root, 'out/bin/insrc-process-broker'),
  barrier: join(manager.pin.root, 'out/bin/insrc-source-startup-barrier.js'), directory: join(store.root, 'source-lifecycle/actors'),
  release: manager.pin, transactionId: active!.id, role: 'probe',
  env: ownedNodeEnvironment(toolchain, { ...process.env, HOME: dirname(store.root),
   INSRC_SOURCE_STORE_PROBE: JSON.stringify({ stateRoot: store.root, ...pair }) }),
 });
 try {
  // The private intent and complete actor ticket are fsynced before this grant.
  assertAdmitted(); await actor.grant();
  const deadline = performance.now() + 180_000;
  while (!await actor.target.handle.hasExited()) {
   assertAdmitted();
   if (performance.now() >= deadline) throw new Error('Source store probe exceeded its inspection deadline');
   await delay(100);
  }
  const result = await actor.probeResult();
  if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) {
   const detail = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'missing probe verdict';
   throw new Error(`Source store compatibility refused: ${detail}`);
  }
  if (!('stateRoot' in result) || result.stateRoot !== store.root || !('pair' in result) || !isDeepStrictEqual(result.pair, pair)) throw new Error('Source store probe returned an unrelated qualification');
  assertAdmitted(); await verifyStagedReleasePin(manager.pin); assertAdmitted();
 } finally {
  try { await actor.kill(); await actor.childrenClosed(); }
  finally { await actor.close(); }
 }
}
