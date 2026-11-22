/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import { finishSourceUpdate } from '../shared/source-update-outcomes.js';
import { cleanNodeEnvironment } from '../shared/owned-node-runtime.js';
import { sameProcess } from '../shared/daemon-process.js';
import type { ProcessIdentity } from '../shared/daemon-process.js';
import { removeOwnedRunFile, runFileIdentity, sameRunFile } from '../shared/daemon-run-files.js';
import type { RunFileGuard, RunFileIdentity } from '../shared/daemon-run-files.js';
import { SourceNativeActor, sourceActorRpc } from '../shared/source-actor-client.js';
import type { SourceInstallationStore, SourceSelection, SourceTransaction } from '../shared/source-installation.js';
import { verifyStagedReleasePin } from './managed-release-staging.js';
import type { StagedReleasePin } from './managed-release-staging.js';
import type { SourceActor, SourceTransactionHost } from './source-update-transaction.js';
import { inspectSourceStores, verifySourceRuntime } from './source-store-inspection.js';

interface Publication {
 readonly version: 1;
 readonly root: ProcessIdentity;
 readonly pid: RunFileIdentity;
 readonly socket: RunFileIdentity;
}
function readPrivate(path: string): unknown {
 const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
 try {
  const before = fstatSync(fd);
  if (!before.isFile() || before.uid !== process.getuid?.() || (before.mode & 0o077) || before.nlink !== 1 || before.size > 16384) throw new Error('Unsafe source actor publication');
  const bytes = Buffer.alloc(before.size + 1), count = readSync(fd, bytes, 0, bytes.length, 0), after = fstatSync(fd), current = lstatSync(path);
  if (count !== before.size || after.ctimeMs !== before.ctimeMs || after.mtimeMs !== before.mtimeMs || before.ino !== current.ino || before.dev !== current.dev) throw new Error('Source actor publication changed');
  return JSON.parse(bytes.subarray(0, count).toString('utf8'));
 } finally { closeSync(fd); }
}
function publish(path: string, publication: Publication): void {
 const temporary = `${path}.tmp`, fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
 try { writeFileSync(fd, JSON.stringify(publication) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
 renameSync(temporary, path);
 const parent = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
 try { fsyncSync(parent); } finally { closeSync(parent); }
}
function publication(actor: SourceNativeActor): Publication | undefined {
 let value: unknown;
 try { value = readPrivate(join(actor.directory, 'publication.json')); }
 catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid source publication record');
 const p = value as Publication;
 if (Object.keys(p).length !== 4 || p.version !== 1 || !p.root || !sameProcess(p.root, actor.ticket.root)) throw new Error('Source publication belongs to another actor');
 for (const identity of [p.pid, p.socket]) {
  if (!identity || Object.keys(identity).length !== 5 || ['dev', 'ino', 'ctimeNs', 'mtimeNs', 'size'].some(key =>
   typeof identity[key as keyof RunFileIdentity] !== 'string' || !/^\d+$/.test(identity[key as keyof RunFileIdentity]))) throw new Error('Invalid source publication file identity');
 }
 return p;
}

/** Production effects for actors owned by the Linux source supervisor.
 * Unmanaged running predecessors need a separate qualified owner; a PID file is never adoption authority. */
export class NativeSourceTransactionHost implements SourceTransactionHost {
 private forcedStop = false;
 get forced(): boolean { return this.forcedStop; }
 private readonly actors = new Map<string, SourceNativeActor>();
 private readonly binary: string;
 private readonly directory: string;
 constructor(readonly store: SourceInstallationStore, readonly manager: SourceSelection,
  private readonly stoppedLegacyQualified = false) {
  if (process.platform !== 'linux') throw new Error('Native source transaction host requires Linux');
  this.binary = join(manager.pin.root, 'out/bin/insrc-source-actor');
  this.directory = join(store.root, 'source-lifecycle/actors');
 }
 private key(id: ProcessIdentity): string { return JSON.stringify([id.pid, id.startedAt, id.commandLine]); }
 private retain(actor: SourceNativeActor): SourceNativeActor { this.actors.set(this.key(actor.target), actor); return actor; }
 private async scan(): Promise<SourceNativeActor[]> {
  await verifyStagedReleasePin(this.manager.pin);
  let names: string[];
  try {
   const info = lstatSync(this.directory);
   if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o077) || realpathSync(this.directory) !== this.directory) throw new Error('Unsafe source actor registry');
   names = await readdir(this.directory);
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  if (names.length > 512 || names.some(name => !/^actor-[A-Za-z0-9]+$/.test(name))) throw new Error('Invalid or oversized source actor registry');
  const result: SourceNativeActor[] = [];
  for (const name of names.sort()) {
   const directory = join(this.directory, name);
   const retained = [...this.actors.values()].find(actor => actor.directory === directory);
   // Missing tickets (including unobserved spawns) remain a recovery conflict, never permission to launch.
   result.push(retained ?? this.retain(await SourceNativeActor.reopen(directory, this.binary)));
  }
  return result;
 }
 private matchingPublication(actors: SourceNativeActor[], pid: RunFileIdentity | undefined, socket: RunFileIdentity | undefined): Publication | undefined {
  return actors.map(publication).find(p => p && (!pid || sameRunFile(pid, p.pid)) && (!socket || sameRunFile(socket, p.socket)));
 }
 private wrap(actor: SourceNativeActor): SourceActor {
  return { target: actor.target, childrenClosed: () => actor.childrenClosed(), shutdown: async () => {
   if (!await actor.target.handle.hasExited()) {
    try { await sourceActorRpc(this.binary, join(this.store.root, 'daemon.sock'), actor.target, 'daemon.shutdown'); }
    catch { /* Retain the original owned actor even if its public reply is absent. */ }
    const deadline = performance.now() + 30_000;
    while (!await actor.target.handle.hasExited() && performance.now() < deadline) await delay(100);
    if (!await actor.target.handle.hasExited()) { this.forcedStop = true; await actor.kill(); }
   }
   await actor.childrenClosed();
  } };
 }
 async capture(initial: SourceSelection | null, prior: StagedReleasePin): Promise<SourceActor | null> {
  await verifyStagedReleasePin(this.manager.pin);
  const actors = await this.scan(), live: SourceNativeActor[] = [];
  for (const actor of actors) {
   if (!await actor.target.handle.hasExited()) live.push(actor); else await actor.childrenClosed();
  }
  if (live.length > 1 || live.some(actor => !['candidate', 'prior'].includes(actor.ticket.role) || !isDeepStrictEqual(actor.ticket.release, prior))) throw new Error('Source installation has an unrelated or concurrent live actor');
  if (live[0]) {
   await this.ready(this.wrap(live[0]), prior);
   return this.wrap(live[0]);
  }
  const guard = this.store.acquireLifecycleGuard('run-files');
  try {
   const pid = runFileIdentity(join(this.store.root, 'daemon.pid')), socket = runFileIdentity(join(this.store.root, 'daemon.sock'));
   if ((pid || socket) && !this.matchingPublication(actors, pid, socket)) throw new Error('Unmanaged predecessor publication lacks retained child ownership; no stop or cutover performed');
   if (!initial && !this.stoppedLegacyQualified && !isDeepStrictEqual(this.store.read().outcome?.legacyRoute?.prior, prior)) throw new Error('Legacy source activation requires an independently qualified stopped predecessor profile');
  } finally { guard.release(); }
  return null;
 }
 async recover(identity: ProcessIdentity): Promise<SourceActor | null> {
  const actor = (await this.scan()).find(item => sameProcess(item.target, identity));
  if (!actor) throw new Error('Recorded source actor has no retained native ownership ticket');
  if (await actor.target.handle.hasExited()) { await actor.childrenClosed(); return null; }
  return this.wrap(actor);
 }
 async proveClosed(identity: ProcessIdentity): Promise<void> {
  const actor = (await this.scan()).find(item => sameProcess(item.target, identity));
  if (!actor || !await actor.target.handle.hasExited()) throw new Error('Recorded source actor exit is unproved');
  await actor.childrenClosed();
 }
 async quiescent(_prior: StagedReleasePin, _candidate: StagedReleasePin, guard: RunFileGuard): Promise<void> {
  guard.assertOwned();
  const actors = await this.scan();
  for (const actor of actors) {
   if (!await actor.target.handle.hasExited()) throw new Error('A source actor still owns the stopped-store boundary');
   await actor.childrenClosed();
  }
  const pidPath = join(this.store.root, 'daemon.pid'), socketPath = join(this.store.root, 'daemon.sock');
  const pid = runFileIdentity(pidPath), socket = runFileIdentity(socketPath);
  if (!pid && !socket) return;
  // Historical publication receipts do not authorize unlinking a later actor's files.
  const owner = this.matchingPublication(actors, pid, socket);
  if (!owner) throw new Error('Stopped source run files have no matching owned publication receipt; replacement preserved');
  guard.assertOwned();
  removeOwnedRunFile(pidPath, owner.pid, guard); removeOwnedRunFile(socketPath, owner.socket, guard);
 }
 async verifyStores(pair: Parameters<SourceTransactionHost['verifyStores']>[0], guard: RunFileGuard): Promise<void> {
  await inspectSourceStores(this.store, this.manager, pair, guard);
 }
 async verifyRuntime(selection: SourceSelection): Promise<void> { await verifySourceRuntime(selection, this.store.root); }
 async start(pin: StagedReleasePin, guard: RunFileGuard, record: (actor: SourceActor) => void, grantEntry: () => void): Promise<SourceActor> {
  guard.assertOwned(); await verifyStagedReleasePin(this.manager.pin);
  const active = this.store.read().active; if (!active) throw new Error('Source actor launch has no transaction');
  const env = cleanNodeEnvironment(process.env);
  env.HOME = dirname(this.store.root); env.PATH = `${dirname(pin.runtime)}:${env.PATH || '/usr/bin:/bin'}`;
  env.ONNXRUNTIME_NODE_INSTALL_CUDA ??= 'skip'; env.PYTHONDONTWRITEBYTECODE = '1';
  const actor = this.retain(await SourceNativeActor.launch({ binary: this.binary,
   broker: join(this.manager.pin.root, 'out/bin/insrc-process-broker'), barrier: join(this.manager.pin.root, 'out/bin/insrc-source-startup-barrier.js'),
   directory: this.directory, release: pin, transactionId: active.id, role: active.prior?.commit === pin.commit ? 'prior' : 'candidate', env }));
  const result = this.wrap(actor); record(result); grantEntry(); await actor.grant(); return result;
 }
 async ready(actor: SourceActor, pin: StagedReleasePin): Promise<void> {
  const native = this.actors.get(this.key(actor.target)); if (!native || !isDeepStrictEqual(native.ticket.release, pin)) throw new Error('Source readiness has no matching native actor');
  const deadline = performance.now() + 120_000;
  while (true) {
   if (await actor.target.handle.hasExited()) throw new Error('Source actor exited before readiness');
   let guard: RunFileGuard | undefined;
   try {
    guard = this.store.acquireLifecycleGuard('run-files');
    const pidPath = join(this.store.root, 'daemon.pid'), socketPath = join(this.store.root, 'daemon.sock');
    const pid = runFileIdentity(pidPath), socket = runFileIdentity(socketPath);
    if (!pid || !socket || !lstatSync(socketPath).isSocket()) throw new Error('Source daemon has not published readiness');
    const fd = openSync(pidPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
     const stat = fstatSync(fd); if (!stat.isFile() || stat.uid !== process.getuid?.() || stat.size > 32 || stat.nlink !== 1) throw new Error('Unsafe source daemon PID publication');
     const bytes = Buffer.alloc(stat.size + 1), count = readSync(fd, bytes, 0, bytes.length, 0);
     if (count !== stat.size || bytes.subarray(0, count).toString('utf8').trim() !== String(actor.target.pid)) throw new Error('Source daemon publication names another process');
    } finally { closeSync(fd); }
    const result = await sourceActorRpc(this.binary, socketPath, actor.target, 'daemon.status');
    if (!result || typeof result !== 'object' || !('installedCommit' in result) || result.installedCommit !== pin.commit || 'storeFailure' in result) throw new Error('Source daemon status does not identify the healthy pinned release');
    const afterPid = runFileIdentity(pidPath), afterSocket = runFileIdentity(socketPath);
    if (!afterPid || !afterSocket || !sameRunFile(pid, afterPid) || !sameRunFile(socket, afterSocket)) throw new Error('Source daemon changed its publication during readiness');
    publish(join(native.directory, 'publication.json'), { version: 1, root: native.ticket.root, pid, socket });
    return;
   } catch (error) {
    if (performance.now() >= deadline) throw error;
   } finally { guard?.release(); }
   await delay(100);
  }
 }
 async settled(transaction: SourceTransaction): Promise<void> {
  const identity = transaction.phase === 'committed' ? transaction.execution?.candidate : transaction.execution?.restored;
  if (!identity) return; // Existing already-committed incumbents were not relaunched by this transaction.
  const actor = (await this.scan()).find(item => sameProcess(item.target, identity));
  if (!actor) throw new Error('Terminal source actor ownership is missing');
  if (await actor.target.handle.hasExited()) await actor.childrenClosed(); else await actor.commit();
 }
 async published(outcome: NonNullable<ReturnType<SourceInstallationStore['read']>['outcome']>, guard: RunFileGuard): Promise<void> {
  finishSourceUpdate(this.store, outcome, guard);
 }
 async close(): Promise<void> { for (const actor of this.actors.values()) await actor.close(); this.actors.clear(); }
}
