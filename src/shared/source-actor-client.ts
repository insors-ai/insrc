/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFile, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, readSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual, promisify } from 'node:util';
import { captureStopTarget } from './daemon-process-client.js';
import type { StopTarget } from './daemon-process-client.js';
import { requireProcessIdentity, sameProcess } from './daemon-process.js';
import { processIdentityState } from './daemon-process.js';
import type { ProcessIdentity } from './daemon-process.js';
import { cleanNodeEnvironment } from './owned-node-runtime.js';
import type { StagedReleasePin } from '../daemon/managed-release-staging.js';

const exec = promisify(execFile);
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const LINUX_BIRTH = /^linux:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}):[0-9]+$/;
export interface SourceActorTicket {
 readonly version: 1;
 readonly token: string;
 readonly monitor: ProcessIdentity;
 readonly root: ProcessIdentity;
 readonly release: StagedReleasePin;
 readonly transactionId: string;
 readonly role: 'candidate' | 'prior' | 'probe' | 'update';
}
export interface SourceActorLaunch {
 /** Current authenticated package supplies executables, never an arbitrary value from a ticket. */
 readonly binary: string;
 readonly broker: string;
 readonly barrier: string;
 readonly directory: string;
 readonly release: StagedReleasePin;
 readonly transactionId: string;
 readonly role: Exclude<SourceActorTicket['role'], 'update'>;
 readonly env?: NodeJS.ProcessEnv | undefined;
}
function canonical(path: string): void {
 if (!isAbsolute(path) || realpathSync(path) !== path) throw new Error('Source actor requires canonical absolute references');
}
function privateDirectory(path: string): void {
 canonical(path); const stat = lstatSync(path);
 if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) throw new Error('Source actor directory is not private and owned');
}
function publish(directory: string, value: unknown, name = 'ticket'): void {
 const temporary = join(directory, `${name}.tmp`), file = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
 try { writeFileSync(file, JSON.stringify(value) + '\n'); fsyncSync(file); } finally { closeSync(file); }
 renameSync(temporary, join(directory, `${name}.json`));
 const dir = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
 try { fsyncSync(dir); } finally { closeSync(dir); }
}
function ownedText(path: string, max = 64 * 1024): string {
 const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
 try {
  const stat = fstatSync(fd);
  if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) || stat.nlink !== 1 || stat.size > max) throw new Error('Unsafe source actor metadata');
  const bytes = Buffer.alloc(stat.size + 1), count = readSync(fd, bytes, 0, bytes.length, 0), after = fstatSync(fd), current = lstatSync(path);
  if (count !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || current.ino !== stat.ino || current.dev !== stat.dev) throw new Error('Source actor metadata changed while reading');
  return bytes.subarray(0, count).toString('utf8');
 } finally { closeSync(fd); }
}
function validateIntent(directory: string, ticket: SourceActorTicket): string {
 const value: unknown = JSON.parse(ownedText(join(directory, 'intent.json')));
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid source actor intent');
 const intent = value as { version: number; token: string; creator: ProcessIdentity; release: StagedReleasePin; transactionId: string; role: string };
 const creator = intent.creator, rootBoot = LINUX_BIRTH.exec(ticket.root.startedAt)?.[1], monitorBoot = LINUX_BIRTH.exec(ticket.monitor.startedAt)?.[1];
 if (Object.keys(intent).length !== 6 || intent.version !== 1 || intent.token !== ticket.token || intent.transactionId !== ticket.transactionId
  || intent.role !== ticket.role || !isDeepStrictEqual(intent.release, ticket.release) || !creator || Object.keys(creator).length !== 3
  || !Number.isSafeInteger(creator.pid) || creator.pid <= 0 || typeof creator.startedAt !== 'string'
  || typeof creator.commandLine !== 'string' || !creator.commandLine || !rootBoot || monitorBoot !== rootBoot
  || LINUX_BIRTH.exec(creator.startedAt)?.[1] !== rootBoot) throw new Error('Source actor ticket differs from its pre-fork intent/kernel incarnation');
 return rootBoot;
}

function entry(root: string, role: SourceActorTicket['role']): string {
 return join(root, role === 'probe' ? 'out/daemon/source-store-probe.js' : role === 'update' ? 'out/bin/insrc-source-control.js' : 'out/daemon/index.js');
}

/** Authenticate the Unix peer against the caller's retained actor before sending lifecycle RPC. */
export async function sourceActorRpc(binary: string, socket: string, target: StopTarget,
 method: 'daemon.status' | 'daemon.shutdown'): Promise<unknown> {
 if (process.platform !== 'linux') throw new Error('Source actor RPC requires Linux');
 canonical(binary);
 if (await target.handle.hasExited()) throw new Error('Source actor exited before public RPC');
 const { stdout } = await exec(binary, ['rpc', socket, String(target.pid), target.startedAt, method], {
  env: cleanNodeEnvironment(process.env), timeout: 20_000, maxBuffer: 256 * 1024 });
 const reply: unknown = JSON.parse(stdout);
 if (!reply || typeof reply !== 'object' || Array.isArray(reply) || !('id' in reply) || reply.id !== 1
  || !('result' in reply) || 'error' in reply) throw new Error('Source daemon returned an invalid or failed lifecycle response');
 if (method === 'daemon.status' && await target.handle.hasExited()) throw new Error('Source actor exited during status RPC');
 return reply.result;
}

/** Native subreaper lifetime is independent of a committed controller; a pidfd still binds the daemon itself. */
export class SourceNativeActor {
 private constructor(readonly directory: string, readonly ticket: SourceActorTicket, readonly target: StopTarget,
  private readonly binary: string, private readonly monitor?: ChildProcess | undefined) {}

 static async launch(options: SourceActorLaunch): Promise<SourceNativeActor> {
  if (process.platform !== 'linux') throw new Error('Source native actors require Linux');
  for (const path of [options.binary, options.broker, options.barrier, options.release.root, options.release.runtime]) canonical(path);
  await mkdir(options.directory, { recursive: true, mode: 0o700 }); privateDirectory(options.directory);
  const directory = await mkdtemp(join(options.directory, 'actor-')); privateDirectory(directory);
  const token = randomBytes(32).toString('hex');
  // This is written before any monitor/root can be forked, including an unobserved spawn.
  publish(directory, { version: 1, token, creator: requireProcessIdentity(process.pid), release: options.release,
   transactionId: options.transactionId, role: options.role }, 'intent');
  const executableEntry = entry(options.release.root, options.role);
  canonical(executableEntry);
  const updater = await SourceNativeActor.currentUpdater();
  if (updater) {
   try { return await updater.launchIndependent(options, directory, token); }
   finally { await updater.target.handle.close(); }
  }
  const log = openSync(join(directory, 'process.log'), 'wx', 0o600);
  const child = spawn(options.binary, [directory, options.release.runtime, executableEntry,
   options.barrier, token, String(process.pid)], { cwd: options.release.root,
    env: cleanNodeEnvironment(options.env ?? process.env), stdio: ['ignore', log, log], detached: true });
  closeSync(log);
  let target: StopTarget | undefined, monitor: ProcessIdentity | undefined;
  try {
   await once(child, 'spawn'); monitor = requireProcessIdentity(child.pid!);
   let root = 0;
   for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Source monitor exited before its startup barrier');
    let reply: string;
    try { reply = await SourceNativeActor.control(options.binary, token, monitor, 'STATUS'); }
    catch (error) { if ((error as { code?: number }).code !== 3) throw error; await delay(50); continue; }
    const match = /^WAITING ([1-9]\d*)$/.exec(reply);
    if (match) { root = Number(match[1]); break; }
    await delay(50);
   }
   if (!root) throw new Error('Source startup barrier was not observed');
   // Probe ownership stays with the resident native supervisor. The daemon-only broker
   // intentionally refuses arbitrary probe executables and is not widened here.
   const observed = requireProcessIdentity(root);
   if (!observed.commandLine.endsWith(executableEntry)
    || realpathSync(`/proc/${root}/exe`) !== options.release.runtime) throw new Error('Source actor does not match the pinned executable/entry');
   const ticket: SourceActorTicket = { version: 1, token, monitor, root: observed, release: options.release,
    transactionId: options.transactionId, role: options.role };
   target = options.role === 'probe' ? SourceNativeActor.residentTarget(directory, ticket, options.binary)
    : await captureStopTarget(root, { executable: options.broker }) ?? undefined;
   if (!target || target.startedAt !== observed.startedAt || target.commandLine !== observed.commandLine
    || await target.handle.hasExited()) throw new Error('Source actor changed during capability capture');
   publish(directory, ticket);
   return new SourceNativeActor(directory, ticket, target, options.binary, child);
  } catch (error) {
   try { if (monitor) await SourceNativeActor.control(options.binary, token, monitor, 'KILL'); }
   finally { await target?.handle.close(); }
   const diagnostic = readFileSync(join(directory, 'process.log'), 'utf8').slice(-8192);
   throw new Error(`Source actor startup failed: ${error instanceof Error ? error.message : String(error)}\n${diagnostic}`, { cause: error });
  }
 }
 /** The resident owner creates an independent supervisor before entry is granted.
  * A normal detached fork remains in the incumbent subreaper's subtree. */
 async detachUpdater(release: StagedReleasePin, request: unknown, transactionId: string, env: NodeJS.ProcessEnv = process.env): Promise<SourceNativeActor> {
  if (this.ticket.role === 'probe' || this.ticket.role === 'update' || await this.target.handle.hasExited()) throw new Error('Source updater requires a live daemon owner');
  canonical(release.root); canonical(release.runtime);
  if (this.binary !== join(release.root, 'out/bin/insrc-source-actor') || release.runtime !== this.ticket.release.runtime) throw new Error('Source updater must use the current resident owner and owned runtime');
  for (const name of await readdir(this.directory)) {
   if (!name.startsWith('update-')) continue;
   if (!/^update-[a-f0-9]{64}$/.test(name)) throw new Error('Invalid retained source updater directory');
   const previous = await SourceNativeActor.reopen(join(this.directory, name), this.binary);
   try {
    if (previous.ticket.role !== 'update' || !await previous.target.handle.hasExited()) throw new Error('Source updater already owns a handoff');
    await previous.childrenClosed();
   } finally { await previous.target.handle.close(); }
  }
  const token = randomBytes(32).toString('hex'), directory = join(this.directory, `update-${token}`);
  await mkdir(directory, { mode: 0o700 }); privateDirectory(directory);
  publish(directory, { version: 1, token, creator: this.ticket.root, release, transactionId, role: 'update' }, 'intent');
  publish(directory, request, 'request');
  let monitor: ProcessIdentity | undefined;
  try {
   const response = await SourceNativeActor.control(this.binary, this.ticket.token, this.ticket.monitor, `DETACH_UPDATE:${token}`, env);
   const match = /^DETACHED ([1-9]\d*) (linux:[a-f0-9-]+:[0-9]+)$/.exec(response);
   if (!match) throw new Error(`Resident source owner refused detached updater: ${response}`);
   monitor = requireProcessIdentity(Number(match[1]));
   if (monitor.startedAt !== match[2]) throw new Error('Detached source supervisor changed during capture');
   return await SourceNativeActor.captureIndependent(directory, token, monitor, release, transactionId, 'update', this.binary);
  } catch (error) {
   if (monitor) await SourceNativeActor.control(this.binary, token, monitor, 'KILL');
   throw error;
  }
 }
 private static async currentUpdater(): Promise<SourceNativeActor | undefined> {
  if (process.env['INSRC_SOURCE_ACTOR_ROOT_PID'] !== String(process.pid)) return undefined;
  const directory = process.env['INSRC_SOURCE_ACTOR_DIRECTORY'], binary = process.env['INSRC_SOURCE_ACTOR_BINARY'];
  if (!directory || !binary) throw new Error('Source actor has incomplete resident ownership metadata');
  const actor = await SourceNativeActor.reopen(directory, binary);
  if (!sameProcess(actor.target, requireProcessIdentity(process.pid)) || actor.ticket.token !== process.env['INSRC_SOURCE_ACTOR_TOKEN']) throw new Error('Source creator differs from its native ticket');
  if (actor.ticket.role === 'update') return actor;
  await actor.target.handle.close(); return undefined;
 }
 private async launchIndependent(options: SourceActorLaunch, directory: string, token: string): Promise<SourceNativeActor> {
  // No environment is persisted: the authenticated control client sends it over
  // the private native socket immediately before creating the independent scope.
  const descriptor = ['INSRC-SOURCE-ACTOR-1', directory, options.binary, options.release.runtime,
   entry(options.release.root, options.role), options.barrier].join('\0') + '\0';
  const file = openSync(join(this.directory, `launch-${token}`), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(file, descriptor); fsyncSync(file); } finally { closeSync(file); }
  const parent = openSync(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { fsyncSync(parent); } finally { closeSync(parent); }
  let monitor: ProcessIdentity | undefined;
  try {
   const response = await SourceNativeActor.control(this.binary, this.ticket.token, this.ticket.monitor, `DETACH_ACTOR:${token}`, options.env);
   const match = /^DETACHED ([1-9]\d*) (linux:[a-f0-9-]+:[0-9]+)$/.exec(response);
   if (!match) throw new Error(`Resident source updater refused independent actor: ${response}`);
   monitor = requireProcessIdentity(Number(match[1]));
   if (monitor.startedAt !== match[2]) throw new Error('Independent source supervisor changed during capture');
   return await SourceNativeActor.captureIndependent(directory, token, monitor, options.release, options.transactionId, options.role, options.binary, options.broker);
  } catch (error) {
   if (monitor) await SourceNativeActor.control(options.binary, token, monitor, 'KILL');
   throw error;
  }
 }
 private static async captureIndependent(directory: string, token: string, monitor: ProcessIdentity, release: StagedReleasePin,
  transactionId: string, role: SourceActorTicket['role'], binary: string, broker?: string): Promise<SourceNativeActor> {
  let root = 0;
  for (let i = 0; i < 300; i++) {
   let reply: string;
   try { reply = await SourceNativeActor.control(binary, token, monitor, 'STATUS'); }
   catch (error) { if ((error as { code?: number }).code !== 3) throw error; await delay(50); continue; }
   const waiting = /^WAITING ([1-9]\d*)$/.exec(reply);
   if (waiting) { root = Number(waiting[1]); break; }
   await delay(50);
  }
  if (!root) throw new Error('Independent source actor did not reach its entry barrier');
  const observed = requireProcessIdentity(root), currentMonitor = requireProcessIdentity(monitor.pid);
  if (currentMonitor.startedAt !== monitor.startedAt || !observed.commandLine.endsWith(entry(release.root, role))
   || realpathSync(`/proc/${root}/exe`) !== release.runtime) throw new Error('Independent source actor differs from its pinned runtime/entry');
  const ticket: SourceActorTicket = { version: 1, token, monitor: currentMonitor, root: observed, release, transactionId, role };
  const target = role === 'update' || role === 'probe' ? SourceNativeActor.residentTarget(directory, ticket, binary)
   : broker ? await captureStopTarget(root, { executable: broker }) : undefined;
  if (!target) throw new Error('Independent source actor has no retained capability');
  try {
   if (target.startedAt !== observed.startedAt || target.commandLine !== observed.commandLine || await target.handle.hasExited()) throw new Error('Independent source actor changed during capture');
   publish(directory, ticket);
   return new SourceNativeActor(directory, ticket, target, binary);
  } catch (error) { await target.handle.close(); throw error; }
 }
 private static async control(binary: string, token: string, monitor: ProcessIdentity, command: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const result = await exec(binary, ['control', token, String(monitor.pid), monitor.startedAt, command], {
   env: cleanNodeEnvironment(env), timeout: 20_000, maxBuffer: 8192 });
  return result.stdout.trim();
 }
 async grant(): Promise<void> {
  const reply = await SourceNativeActor.control(this.binary, this.ticket.token, this.ticket.monitor, 'GRANT');
  if (reply !== `GRANTED ${this.target.pid}`) throw new Error('Source actor refused its startup grant');
 }
 async commit(): Promise<void> {
  const reply = await SourceNativeActor.control(this.binary, this.ticket.token, this.ticket.monitor, 'COMMIT');
  if (reply !== `COMMITTED ${this.target.pid}`) throw new Error('Source actor did not commit ownership');
  this.monitor?.unref();
 }
 async kill(): Promise<void> {
  if (SourceNativeActor.hasClosedReceipt(this.directory, this.ticket)) { await this.childrenClosed(); return; }
  let reply: string;
  try { reply = await SourceNativeActor.control(this.binary, this.ticket.token, this.ticket.monitor, 'KILL'); }
  catch (error) {
   if (!SourceNativeActor.hasClosedReceipt(this.directory, this.ticket)) throw error;
   await this.childrenClosed(); return;
  }
  if (reply !== `CLOSED ${this.target.pid}`) throw new Error('Source actor/descendant exit is unconfirmed');
  await this.childrenClosed();
 }
 async childrenClosed(): Promise<void> {
  for (let i = 0; i < 250; i++) {
   if (SourceNativeActor.hasClosedReceipt(this.directory, this.ticket)) {
    if (!await this.target.handle.hasExited()) throw new Error('Source closure receipt conflicts with the retained process');
    return;
   }
   await delay(50);
  }
  throw new Error('Source actor subtree closure has not been proved');
 }
 /** Consume a private, actor-bound probe result only after the native owner proves full closure. */
 async probeResult(): Promise<unknown> {
  if (this.ticket.role !== 'probe') throw new Error('Source actor is not a store probe');
  await this.childrenClosed();
  const result: unknown = JSON.parse(ownedText(join(this.directory, 'probe-result.json'), 16 * 1024));
  if (!result || typeof result !== 'object' || Array.isArray(result) || !('version' in result) || result.version !== 1
   || !('token' in result) || result.token !== this.ticket.token || !('pid' in result) || result.pid !== this.target.pid) throw new Error('Source probe result belongs to another actor');
  return result;
 }
 private static hasClosedReceipt(directory: string, ticket: SourceActorTicket): boolean {
  privateDirectory(directory);
  try {
   const expected = `CLOSED ${ticket.token} ${ticket.root.pid} ${ticket.root.startedAt}\n`;
   if (ownedText(join(directory, 'closed'), 1024) !== expected) throw new Error('Source closure receipt belongs to another actor');
   if (processIdentityState(ticket.root) === 'same') throw new Error('Source closure contradicts the kernel actor identity');
   return true;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  // A new kernel conclusively ended every member of the old local process tree,
  // even when power loss prevented the original supervisor from publishing a receipt.
  const recordedBoot = validateIntent(directory, ticket), currentBoot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  if (!UUID.test(currentBoot)) throw new Error('Current Linux kernel incarnation is unreadable');
  return recordedBoot !== currentBoot;
 }
 /** Reopening authenticates the resident supervisor, which still owns the original pidfd/subtree. */
 static async reopen(directory: string, binary: string): Promise<SourceNativeActor> {
  privateDirectory(directory); canonical(binary);
  const value: unknown = JSON.parse(ownedText(join(directory, 'ticket.json')));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid source actor ticket');
  const ticket = value as SourceActorTicket;
  const keys = ['version', 'token', 'monitor', 'root', 'release', 'transactionId', 'role'];
  if (Object.keys(ticket).length !== keys.length || keys.some(key => !Object.hasOwn(ticket, key))
   || ticket.version !== 1 || !/^[a-f0-9]{64}$/.test(ticket.token) || typeof ticket.transactionId !== 'string'
   || !['candidate', 'prior', 'probe', 'update'].includes(ticket.role)) throw new Error('Invalid source actor ticket fields');
  for (const id of [ticket.root, ticket.monitor]) {
   if (!id || Object.keys(id).length !== 3 || !Number.isSafeInteger(id.pid) || id.pid <= 0
    || typeof id.startedAt !== 'string' || !LINUX_BIRTH.test(id.startedAt) || typeof id.commandLine !== 'string' || !id.commandLine) throw new Error('Invalid source actor incarnation');
  }
  if (!ticket.release || typeof ticket.release.root !== 'string' || typeof ticket.release.runtime !== 'string'
   || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(ticket.release.commit) || !/^[a-f0-9]{64}$/.test(ticket.release.fingerprint)) throw new Error('Invalid source actor pin');
  canonical(ticket.release.root); canonical(ticket.release.runtime);
  validateIntent(directory, ticket);
  if (!ticket.root.commandLine.endsWith(entry(ticket.release.root, ticket.role))) throw new Error('Source actor ticket entry differs from its role');
  const target = SourceNativeActor.residentTarget(directory, ticket, binary);
  await target.handle.hasExited();
  return new SourceNativeActor(directory, ticket, target, binary);
 }
 private static residentTarget(directory: string, ticket: SourceActorTicket, binary: string): StopTarget {
  const closed = () => SourceNativeActor.hasClosedReceipt(directory, ticket);
  const state = async () => {
   if (closed()) return true;
   let reply: string;
   try { reply = await SourceNativeActor.control(binary, ticket.token, ticket.monitor, 'STATUS'); }
   catch (error) {
    // The native owner may publish closure and exit between the receipt read and connect.
    // Only that positive, actor-bound proof reconciles a failed transport.
    if (closed()) return true;
    throw error;
   }
   if (!new RegExp(`^(WAITING|STARTING|RUNNING|COMMITTED) ${ticket.root.pid}$`).test(reply)) throw new Error('Source supervisor changed its root');
   return false;
  };
  const target: StopTarget = { ...ticket.root, handle: { hasExited: state,
   async terminate() {
    if (await state()) return 'exited';
    const reply = await SourceNativeActor.control(binary, ticket.token, ticket.monitor, 'KILL');
    if (reply !== `CLOSED ${ticket.root.pid}`) throw new Error('Source subtree termination is unconfirmed');
    return 'sent';
   }, async close() {} } };
  return target;
 }
 async close(): Promise<void> { await this.target.handle.close(); this.monitor?.unref(); }
}
