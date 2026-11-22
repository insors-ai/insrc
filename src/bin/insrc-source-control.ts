/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { beginSourceUpdate } from '../shared/source-update-outcomes.js';
import { SourceNativeActor } from '../shared/source-actor-client.js';
import { awaitSourceUpdateAcknowledgment } from '../daemon/source-update-launch.js';
import { requireProcessIdentity, sameProcess } from '../shared/daemon-process.js';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { SourceInstallationStore, SourcePublicationUnknownError, readSourceInstallationState, verifiedSourceSelection } from '../shared/source-installation.js';
import type { SourceSelection } from '../shared/source-installation.js';
import type { QualifiedReleasePair } from '../shared/source-release-compatibility.js';
import { readReleaseCompatibility, requireQualifiedReleasePair } from '../shared/source-release-compatibility.js';
import { verifyStagedReleasePin } from '../daemon/managed-release-staging.js';
import { NativeSourceTransactionHost } from '../daemon/source-transaction-host.js';
import { LinuxSourceTransaction } from '../daemon/source-update-transaction.js';
import { verifySourceRuntime } from '../daemon/source-store-inspection.js';
import { prepareSourcePredecessor } from '../daemon/source-predecessor.js';
import { qualifySourceRelease, authorizeSourceReleaseHead, stageQualifiedSourceRelease } from '../daemon/source-release-qualification.js';
import { assertSourceReleaseFloor } from '../shared/managed-source-release.js';
import { checkUpdateSource, readUpdateSource } from '../shared/update-source.js';
import { readProcessIdentity } from '../shared/daemon-process.js';
import type { SourceTransactionHost } from '../daemon/source-update-transaction.js';

type SourceControlOutcome = NonNullable<ReturnType<SourceInstallationStore['read']>['outcome']>;

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const NOT_SOURCE = 10;
async function privateJson(path: string): Promise<unknown> {
 const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
 try {
  const before = await file.stat();
  if (!before.isFile() || before.uid !== process.getuid?.() || before.nlink !== 1 || (before.mode & 0o077) || before.size > 128 * 1024) throw new Error('Source controller input is not bounded, private and owned');
  const bytes = Buffer.alloc(before.size + 1), { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
  const after = await file.stat(), current = await lstat(path);
  if (bytesRead !== before.size || before.ino !== current.ino || before.dev !== current.dev || after.ctimeMs !== before.ctimeMs || after.mtimeMs !== before.mtimeMs) throw new Error('Source controller input changed while reading');
  return JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
 } finally { await file.close(); }
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }

type LaunchProfile = 'linux-source-running' | 'linux-source-stopped';
/** Diagnostic profile only; the native host separately proves process ownership before cutover. */
async function sourceLaunchProfile(store: SourceInstallationStore): Promise<LaunchProfile> {
 const file = await open(join(store.root, 'daemon.pid'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  .catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
 if (!file) return 'linux-source-stopped';
 try {
  const before = await file.stat();
  if (!before.isFile() || before.uid !== process.getuid?.() || before.nlink !== 1 || (before.mode & 0o022) || before.size > 32) throw new Error('Unsafe daemon publication while choosing an update profile');
  const bytes = Buffer.alloc(before.size + 1), { bytesRead } = await file.read(bytes, 0, bytes.length, 0), after = await file.stat();
  const text = bytes.subarray(0, bytesRead).toString('utf8').trim();
  if (bytesRead !== before.size || after.ctimeMs !== before.ctimeMs || after.mtimeMs !== before.mtimeMs
   || !/^[1-9]\d*$/.test(text)) throw new Error('Invalid or changing daemon PID publication');
  return readProcessIdentity(Number(text)) ? 'linux-source-running' : 'linux-source-stopped';
 } finally { await file.close(); }
}
async function assertLaunchProfile(store: SourceInstallationStore, expected: LaunchProfile): Promise<void> {
 if (await sourceLaunchProfile(store) !== expected) throw new Error('Source launch profile changed during preparation; retry the authenticated update');
}

interface Staged {
 readonly candidate: SourceSelection;
 readonly compatibility: QualifiedReleasePair;
 readonly launchProfile: LaunchProfile;
}
function readStaged(value: unknown, store: SourceInstallationStore): Staged {
 if (!object(value) || value.version !== 1 || !object(value.candidate) || !object(value.candidate.source)
  || !object(value.compatibility) || !['linux-source-running', 'linux-source-stopped'].includes(value.launchProfile as string)
  || typeof value.catalog !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.catalog)) throw new Error('Invalid independent source staging receipt');
 const state = readSourceInstallationState({ version: 1, root: store.root, installationRoot: store.installationRoot,
  generation: 0, selected: value.candidate, active: null, retained: [], retainedSelections: [],
  sourceReleases: [value.candidate.source], outcome: null }, store.root, store.installationRoot);
 const candidate = state.selected!;
 const prior = readReleaseCompatibility(value.compatibility.prior), next = readReleaseCompatibility(value.compatibility.candidate);
 const compatibility = requireQualifiedReleasePair(prior, next, [{ prior, candidate: next }]);
 if (!isDeepStrictEqual(candidate.compatibility, next)) throw new Error('Staging receipt differs from the candidate compatibility');
 return { candidate, compatibility, launchProfile: value.launchProfile as Staged['launchProfile'] };
}
async function installation(stateRoot: string, logicalRoot?: string): Promise<SourceInstallationStore | undefined> {
 const root = await realpath(stateRoot);
 if (logicalRoot) return new SourceInstallationStore(root, await realpath(logicalRoot));
 let value: unknown;
 try { value = await privateJson(join(root, 'source-lifecycle/journal.json')); }
 catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
 if (!object(value) || typeof value.installationRoot !== 'string') throw new Error('Invalid source installation identity');
 const store = new SourceInstallationStore(root, value.installationRoot); store.read(); return store;
}
function observeUnchanged(store: SourceInstallationStore, receipt: SourceSelection['source']) {
 const state = store.read(), old = state.sourceReleases.find(item => isDeepStrictEqual(item.channel, receipt.channel));
 assertSourceReleaseFloor(receipt, old ? [old] : []);
 const outcome = { id: randomUUID(), decision: 'committed' as const, detail: 'Authenticated release is already selected; process and selection unchanged',
  ...(state.outcome?.legacyRoute ? { legacyRoute: state.outcome.legacyRoute } : {}) };
 try { store.update(state.generation, current => ({ ...current,
  sourceReleases: [...current.sourceReleases.filter(item => !isDeepStrictEqual(item.channel, receipt.channel)), receipt], outcome })); }
 catch (error) { if (!(error instanceof SourcePublicationUnknownError) || store.reconcile(error.publication).status !== 'published') throw error; }
 return outcome;
}
async function updateSelected(store: SourceInstallationStore, manager: SourceSelection,
 admitted?: (id: string) => Promise<void>): Promise<SourceControlOutcome> {
 const verifier = join(store.root, 'source-lifecycle/verifier.mjs');
 const initial = store.read(), prior = initial.selected?.pin ?? initial.outcome?.legacyRoute?.prior;
 if (!prior) throw new Error('Historical upgrade needs the current authenticated installer and qualified predecessor');
 const configured = readUpdateSource(join(store.root, 'config.json'));
 const checked = checkUpdateSource({ repoUrl: process.env['INSRC_DAEMON_UPDATE_REPO_URL'] || configured.repoUrl,
  branch: process.env['INSRC_DAEMON_UPDATE_BRANCH'] || configured.branch });
 const source = { repoUrl: checked.repoUrl ?? manager.source.channel.repoUrl, branch: checked.branch ?? manager.source.channel.branch };
 let host = new NativeSourceTransactionHost(store, manager);
 // Preparation discovers the next verified manager before any platform effect.
 const effects: SourceTransactionHost = {
  capture: (...args) => host.capture(...args), recover: id => host.recover(id), proveClosed: id => host.proveClosed(id),
  quiescent: (...args) => host.quiescent(...args), verifyStores: (...args) => host.verifyStores(...args),
  start: (...args) => host.start(...args), ready: (...args) => host.ready(...args),
  verifyRuntime: selection => host.verifyRuntime(selection), settled: transaction => host.settled(transaction),
  published: (outcome, guard) => host.published(outcome, guard),
 };
 try {
  return await new LinuxSourceTransaction(store, effects).update(async selected => {
   if (!isDeepStrictEqual(selected, initial.selected)) throw new Error('Source selection changed before update preparation');
   const head = await authorizeSourceReleaseHead({ stateRoot: store.root, runtime: process.execPath, verifier, source, target: manager.target });
   if (selected && head.receipt.commit === selected.pin.commit && head.receipt.tree === selected.source.tree
    && isDeepStrictEqual(head.receipt.channel, selected.source.channel)) return { unchanged: head.receipt };
   const launchProfile = await sourceLaunchProfile(store);
   const input = { stateRoot: store.root, runtime: process.execPath, verifier, source, priorCommit: prior.commit, target: manager.target, launchProfile };
   const prepared = await stageQualifiedSourceRelease(input, prior.root, prior.runtime);
   if (!prepared.prior || !prepared.compatibility) throw new Error('Staged selected-source update has no qualified predecessor');
   const candidate = await verifiedSourceSelection(store.root, prepared.candidate, prepared.sourceRelease, prepared.compatibility.candidate);
   await assertLaunchProfile(store, launchProfile);
   await host.close(); host = new NativeSourceTransactionHost(store, candidate);
   return { prior: prepared.prior, candidate, compatibility: prepared.compatibility };
  }, 'update', async (id, guard) => { beginSourceUpdate(store, id, guard); await admitted?.(id); });
 } finally { await host.close(); }
}

async function main(): Promise<void> {
 if (process.platform !== 'linux') { process.exitCode = NOT_SOURCE; return; }
 if (process.env['INSRC_SOURCE_UPDATE_REQUEST']) {
  const directory = process.env['INSRC_SOURCE_ACTOR_DIRECTORY'], binary = process.env['INSRC_SOURCE_ACTOR_BINARY'];
  if (!directory || !binary || process.env['INSRC_SOURCE_UPDATE_REQUEST'] !== join(directory, 'request.json')) throw new Error('Incomplete source updater handoff');
  const actor = await SourceNativeActor.reopen(directory, binary);
  try {
   if (actor.ticket.role !== 'update' || !sameProcess(actor.target, requireProcessIdentity(process.pid))
    || actor.ticket.token !== process.env['INSRC_SOURCE_ACTOR_TOKEN']) throw new Error('Source updater differs from its native owner');
   const request = actor.readUpdateMessage('request');
   if (!object(request) || Object.keys(request).length !== 3 || request.version !== 1
    || typeof request.stateRoot !== 'string' || typeof request.installationRoot !== 'string') throw new Error('Invalid source update request');
   const store = (await installation(request.stateRoot, request.installationRoot))!;
   const state = store.read(), manager = state.selected ?? state.outcome?.legacyRoute?.candidate;
   if (!manager || state.active || await realpath(packageRoot) !== manager.pin.root
    || !isDeepStrictEqual(manager.pin, actor.ticket.release) || binary !== join(manager.pin.root, 'out/bin/insrc-source-actor')) throw new Error('Source updater is not the current selected controller');
   await verifyStagedReleasePin(manager.pin); await verifySourceRuntime(manager, store.root);
   if (await realpath(process.execPath) !== manager.pin.runtime) throw new Error('Source updater did not use the selected owned Node');
   const result = await updateSelected(store, manager, id => awaitSourceUpdateAcknowledgment(actor, id));
   process.stdout.write(JSON.stringify(result) + '\n'); if (result.decision !== 'committed') process.exitCode = 4;
  } finally { await actor.close(); }
  return;
 }
 const [command, stateRoot, ...args] = process.argv.slice(2);
 if (!stateRoot) throw new Error('Source controller requires its state root');
 if (command === 'unchanged') {
  const [logicalRoot, verifier] = args;
  if (!logicalRoot || !verifier || args.length !== 2) throw new Error('usage: unchanged STATE_ROOT INSTALLATION_ROOT VERIFIER');
  const store = (await installation(stateRoot, logicalRoot))!, selected = store.read().selected;
  if (!selected) throw new Error('An unchanged-source update requires the selected installation');
  await verifyStagedReleasePin(selected.pin); await verifySourceRuntime(selected, store.root);
  if (await realpath(process.execPath) !== selected.pin.runtime) throw new Error('Run unchanged-source verification with the selected owned Node');
  const host = new NativeSourceTransactionHost(store, selected);
  try {
   const result = await new LinuxSourceTransaction(store, host).exclusive(async () => {
    const head = await authorizeSourceReleaseHead({ stateRoot: store.root, runtime: process.execPath, verifier,
     source: selected.source.channel, target: selected.target });
    if (head.receipt.commit !== selected.pin.commit || head.receipt.tree !== selected.source.tree) throw new Error('Source channel advanced; stage the qualified update instead');
    await verifyStagedReleasePin(selected.pin);
    const state = store.read();
    if (!isDeepStrictEqual(state.selected, selected)) throw new Error('Selected source changed during current-release verification');
    return observeUnchanged(store, head.receipt);
   });
   process.stdout.write(JSON.stringify(result) + '\n');
  } finally { await host.close(); }
  return;
 }
 if (command === 'upgrade') {
  const [logicalRoot, receipt, verifier, priorRuntime, rebuild] = args;
  if (!logicalRoot || !receipt || !verifier || !priorRuntime || (rebuild !== undefined && rebuild !== '--rebuild-predecessor') || args.length > 5) throw new Error('usage: upgrade STATE_ROOT INSTALLATION_ROOT STAGING_RECEIPT VERIFIER INCUMBENT_RUNTIME_OR_UNKNOWN [--rebuild-predecessor]');
  const store = (await installation(stateRoot, logicalRoot))!;
  const staged = readStaged(await privateJson(receipt), store);
  if (await realpath(packageRoot) !== staged.candidate.pin.root) throw new Error('Independent staging must deliver this controller from its authenticated candidate');
  await verifyStagedReleasePin(staged.candidate.pin); await verifySourceRuntime(staged.candidate, store.root);
  if (await realpath(process.execPath) !== staged.candidate.pin.runtime) throw new Error('Run the source controller with the verified staged Node executable');
  const host = new NativeSourceTransactionHost(store, staged.candidate, staged.launchProfile === 'linux-source-stopped');
  try {
   const pending = store.read().active;
   if (pending) {
    const recoveryManager = pending.candidate ?? store.read().selected ?? store.read().outcome?.legacyRoute?.candidate ?? staged.candidate;
    await verifyStagedReleasePin(recoveryManager.pin); await verifySourceRuntime(recoveryManager, store.root);
    const recoveryHost = new NativeSourceTransactionHost(store, recoveryManager);
    try { await new LinuxSourceTransaction(store, recoveryHost).recover(); } finally { await recoveryHost.close(); }
   }
   const result = await new LinuxSourceTransaction(store, host).update(async selected => {
    await assertLaunchProfile(store, staged.launchProfile);
    const input = { stateRoot: store.root, runtime: process.execPath, verifier, source: staged.candidate.source.channel,
     priorCommit: staged.compatibility.prior.releaseId, target: staged.candidate.target, launchProfile: staged.launchProfile };
    const qualified = await qualifySourceRelease(input);
    const pair = qualified.qualification.pairs[0];
    if (!isDeepStrictEqual(qualified.receipt, staged.candidate.source) || !pair
     || !isDeepStrictEqual(pair.prior, staged.compatibility.prior) || !isDeepStrictEqual(pair.candidate, staged.compatibility.candidate)) throw new Error('Source authorization changed after independent staging');
    const known = selected?.pin ?? store.read().outcome?.legacyRoute?.prior ?? undefined;
    const prepared = await prepareSourcePredecessor(input, { root: known?.root ?? store.installationRoot,
     runtime: known?.runtime ?? (priorRuntime === 'unknown' ? undefined : priorRuntime), knownBuild: known },
    { bootstrapRoot: packageRoot, rebuildPredecessor: rebuild === '--rebuild-predecessor' && !known });
    if (prepared.decision === 'recovery-required') throw new Error(prepared.reason);
    if (!isDeepStrictEqual(prepared.sourceRelease, staged.candidate.source) || !isDeepStrictEqual(prepared.compatibility, staged.compatibility)) throw new Error('Predecessor qualification changed after independent staging');
    await assertLaunchProfile(store, staged.launchProfile);
    return { prior: prepared.baseline, candidate: staged.candidate, compatibility: prepared.compatibility };
   });
   process.stdout.write(JSON.stringify(result) + '\n'); if (result.decision !== 'committed') process.exitCode = 4;
  } finally { await host.close(); }
  return;
 }
 if (!['resolve', 'recover', 'start', 'restart', 'stop', 'status', 'update'].includes(command ?? '') || args.length > 1) throw new Error('usage: resolve|recover|start|restart|stop|status|update STATE_ROOT [INSTALLATION_ROOT]');
 const store = await installation(stateRoot, args[0]);
 if (!store) { process.exitCode = NOT_SOURCE; return; }
 const state = store.read(), manager = state.active?.candidate ?? state.selected ?? state.outcome?.legacyRoute?.candidate;
 if (!manager) { if (state.active) throw new Error('Source preparation is pending; retry through the current authenticated installer'); process.exitCode = NOT_SOURCE; return; }
 await verifyStagedReleasePin(manager.pin); await verifySourceRuntime(manager, store.root);
 if (await realpath(process.execPath) !== manager.pin.runtime) throw new Error('Run the source controller with the verified selected Node executable');
 if (command === 'resolve' || command === 'status') {
  if (state.active) throw new Error('Source transaction recovery must finish before resolving a launch');
  const pin = state.selected?.pin ?? state.outcome?.legacyRoute?.prior;
  if (!pin) throw new Error('Source installation has no qualified launch route');
  await verifyStagedReleasePin(pin);
  const statusHost = command === 'status' ? new NativeSourceTransactionHost(store, manager) : undefined;
  try {
   const actor = await statusHost?.capture(state.selected, pin);
   process.stdout.write(JSON.stringify({ installationRoot: store.installationRoot, manager: manager.pin, launch: pin,
    selected: state.selected !== null, ...(command === 'status' ? { running: actor != null, pid: actor?.target.pid } : {}), outcome: state.outcome }) + '\n');
  } finally { await statusHost?.close(); }
  return;
 }
 const recoverHost = new NativeSourceTransactionHost(store, manager);
 try { await new LinuxSourceTransaction(store, recoverHost).recover(); } finally { await recoverHost.close(); }
 if (command === 'recover') { process.stdout.write(JSON.stringify(store.read().outcome) + '\n'); return; }
 if (command === 'update') {
  const result = await updateSelected(store, manager);
  process.stdout.write(JSON.stringify(result) + '\n'); if (result.decision !== 'committed') process.exitCode = 4; return;
 }
 const host = new NativeSourceTransactionHost(store, manager);
 try {
  const result = await new LinuxSourceTransaction(store, host).lifecycle(command as 'start' | 'restart' | 'stop');
  process.stdout.write(JSON.stringify({ ...result, forced: host.forced }) + '\n'); if (result.decision !== 'committed') process.exitCode = 4;
 } finally { await host.close(); }
}

void main().catch(error => {
 process.stderr.write(`Source controller: ${(error instanceof Error ? error.message : String(error)).slice(0, 8192)}\n`);
 process.exitCode = 4;
});
