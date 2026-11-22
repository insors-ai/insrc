/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import { requireProcessIdentity, sameProcess } from '../shared/daemon-process.js';
import { SourceNativeActor } from '../shared/source-actor-client.js';
import { resolveSourceControl } from '../shared/source-routing.js';
import type { SourceInstallationStore } from '../shared/source-installation.js';

const timeout = 15_000;
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }

/** The worker owns the durable reservation before reporting ready; no preparation
 * occurs until the server confirms delivery and the native scope is committed. */
export async function launchSourceUpdate(awaitReply: () => Promise<boolean>): Promise<{ launched: true; updateId: string }> {
 const route = await resolveSourceControl();
 if (!route || route.active) throw new Error('Source update needs the current authenticated installer/client and a recovered source selection; an old installed updater cannot upgrade itself');
 const directory = process.env['INSRC_SOURCE_ACTOR_DIRECTORY'];
 if (!directory) throw new Error('Source daemon has no retained native owner; use the current authenticated installer');
 const resident = await SourceNativeActor.reopen(directory, join(route.manager.pin.root, 'out/bin/insrc-source-actor'));
 let job: SourceNativeActor | undefined;
 try {
  if (!sameProcess(resident.target, requireProcessIdentity(process.pid)) || !isDeepStrictEqual(resident.ticket.release, route.launch)
   || resident.ticket.token !== process.env['INSRC_SOURCE_ACTOR_TOKEN']) throw new Error('Source daemon differs from its selected resident owner');
  job = await resident.detachUpdater(route.manager.pin, { version: 1, stateRoot: route.store.root, installationRoot: route.store.installationRoot }, randomUUID());
  await job.grant();
  const updateId = await waitForReservation(job, route.store), updater = job;
  void (async () => {
   let releaseAttempted = false;
   try {
    if (!await awaitReply()) throw new Error('Update acknowledgment was not delivered');
    await updater.commit(); // Outlive the incumbent before permitting any preparation.
    releaseAttempted = true;
    updater.writeUpdateMessage('release', { version: 1, updateId, acknowledged: true });
   } catch (error) {
    // A rename/fsync error may have published the true release. Never retract it.
    if (!releaseAttempted) {
     try { updater.writeUpdateMessage('release', { version: 1, updateId, acknowledged: false }); } catch { /* Worker times out before preparation. */ }
    }
   } finally { await updater.close(); }
  })().catch(() => { /* The worker's durable terminal result is the public error surface. */ });
  job = undefined;
  return { launched: true, updateId };
 } catch (error) {
  let diagnostic = '';
  if (job) {
   try { diagnostic = (await readFile(join(job.directory, 'process.log'), 'utf8')).slice(-4096); } catch { /* No log yet. */ }
   // An unacknowledged worker is never permitted to prepare; native creator
   // ownership and its bounded release timeout close it without a PID kill.
  }
  throw new Error(`Source updater command ${JSON.stringify([route.toolchain.node, join(route.manager.pin.root, 'out/bin/insrc-source-control.js')])} failed before acknowledgment: ${error instanceof Error ? error.message : String(error)}\n${diagnostic}`, { cause: error });
 } finally { await job?.close(); await resident.close(); }
}
async function waitForReservation(actor: SourceNativeActor, store: SourceInstallationStore): Promise<string> {
 const deadline = performance.now() + timeout;
 while (performance.now() < deadline) {
  const value = actor.readUpdateMessage('ready');
  if (value !== undefined) {
   const active = store.read().active;
   if (!object(value) || Object.keys(value).length !== 2 || value.version !== 1 || typeof value.updateId !== 'string'
    || !active || active.id !== value.updateId || active.phase !== 'reserved' || active.execution
    || !sameProcess(active.owner, actor.ticket.root)) throw new Error('Source updater readiness differs from its durable reservation');
   return active.id;
  }
  if (await actor.target.handle.hasExited()) throw new Error('Source updater exited before reservation');
  await delay(25);
 }
 throw new Error('Source updater did not reserve within its admission deadline');
}

/** Called inside the transaction admission callback, while exclusion is held. */
export async function awaitSourceUpdateAcknowledgment(actor: SourceNativeActor, updateId: string): Promise<void> {
 if (actor.ticket.role !== 'update' || !sameProcess(actor.target, requireProcessIdentity(process.pid))) throw new Error('Only the source updater root can wait for acknowledgment');
 actor.writeUpdateMessage('ready', { version: 1, updateId });
 const deadline = performance.now() + timeout;
 while (performance.now() < deadline) {
  const value = actor.readUpdateMessage('release');
  if (value !== undefined) {
   if (!object(value) || Object.keys(value).length !== 3 || value.version !== 1 || value.updateId !== updateId
    || value.acknowledged !== true) throw new Error('Update acknowledgment was not delivered');
   return;
  }
  await delay(25);
 }
 throw new Error('Update acknowledgment was not delivered before the release deadline');
}
