/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFile, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, readSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { captureStopTarget } from './daemon-process-client.js';
import type { StopTarget } from './daemon-process-client.js';
import { requireProcessIdentity } from './daemon-process.js';
import { processIdentityState } from './daemon-process.js';
import type { ProcessIdentity } from './daemon-process.js';
import { cleanNodeEnvironment } from './owned-node-runtime.js';
import type { StagedReleasePin } from '../daemon/managed-release-staging.js';

const exec = promisify(execFile);
export interface SourceActorTicket {
 readonly version: 1;
 readonly token: string;
 readonly monitor: ProcessIdentity;
 readonly root: ProcessIdentity;
 readonly release: StagedReleasePin;
 readonly transactionId: string;
 readonly role: 'candidate' | 'prior' | 'probe';
}
export interface SourceActorLaunch {
 /** Current authenticated package supplies executables, never an arbitrary value from a ticket. */
 readonly binary: string;
 readonly broker: string;
 readonly barrier: string;
 readonly directory: string;
 readonly release: StagedReleasePin;
 readonly transactionId: string;
 readonly role: SourceActorTicket['role'];
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

/** Native subreaper lifetime is independent of a committed controller; a pidfd still binds the daemon itself. */
export class SourceNativeActor {
 private constructor(readonly directory: string, readonly ticket: SourceActorTicket, readonly target: StopTarget,
  private readonly binary: string, private readonly monitor?: ChildProcess | undefined) {}

 static async launch(options: SourceActorLaunch): Promise<SourceNativeActor> {
  if (process.platform !== 'linux') throw new Error('Source native actors require Linux');
  for (const path of [options.binary, options.broker, options.barrier, options.release.root, options.release.runtime]) canonical(path);
  await mkdir(options.directory, { recursive: true, mode: 0o700 }); privateDirectory(options.directory);
  const directory = await mkdtemp(join(options.directory, 'actor-')); privateDirectory(directory);
  const token = randomBytes(32).toString('hex'), log = openSync(join(directory, 'process.log'), 'wx', 0o600);
  // This is written before any monitor/root can be forked, including an unobserved spawn.
  publish(directory, { version: 1, token, creator: requireProcessIdentity(process.pid), release: options.release,
   transactionId: options.transactionId, role: options.role }, 'intent');
  const child = spawn(options.binary, [directory, options.release.runtime, join(options.release.root, 'out/daemon/index.js'),
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
   target = await captureStopTarget(root, { executable: options.broker });
   if (!target || !target.commandLine.endsWith(join(options.release.root, 'out/daemon/index.js'))
    || realpathSync(`/proc/${root}/exe`) !== options.release.runtime) throw new Error('Source actor does not match the pinned executable/entry');
   const ticket: SourceActorTicket = { version: 1, token, monitor, root: {
    pid: target.pid, startedAt: target.startedAt, commandLine: target.commandLine }, release: options.release,
    transactionId: options.transactionId, role: options.role };
   publish(directory, ticket);
   return new SourceNativeActor(directory, ticket, target, options.binary, child);
  } catch (error) {
   try { if (monitor) await SourceNativeActor.control(options.binary, token, monitor, 'KILL'); }
   finally { await target?.handle.close(); }
   const diagnostic = readFileSync(join(directory, 'process.log'), 'utf8').slice(-8192);
   throw new Error(`Source actor startup failed: ${error instanceof Error ? error.message : String(error)}\n${diagnostic}`, { cause: error });
  }
 }
 private static async control(binary: string, token: string, monitor: ProcessIdentity, command: string): Promise<string> {
  const result = await exec(binary, ['control', token, String(monitor.pid), monitor.startedAt, command], {
   env: cleanNodeEnvironment(process.env), timeout: 20_000, maxBuffer: 8192 });
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
  const reply = await SourceNativeActor.control(this.binary, this.ticket.token, this.ticket.monitor, 'KILL');
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
 private static hasClosedReceipt(directory: string, ticket: SourceActorTicket): boolean {
  privateDirectory(directory);
  try {
   const expected = `CLOSED ${ticket.token} ${ticket.root.pid} ${ticket.root.startedAt}\n`;
   if (ownedText(join(directory, 'closed'), 1024) !== expected) throw new Error('Source closure receipt belongs to another actor');
   if (processIdentityState(ticket.root) === 'same') throw new Error('Source closure contradicts the kernel actor identity');
   return true;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
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
   || !['candidate', 'prior', 'probe'].includes(ticket.role)) throw new Error('Invalid source actor ticket fields');
  for (const id of [ticket.root, ticket.monitor]) {
   if (!id || Object.keys(id).length !== 3 || !Number.isSafeInteger(id.pid) || id.pid <= 0
    || typeof id.startedAt !== 'string' || !id.startedAt.startsWith('linux:') || typeof id.commandLine !== 'string' || !id.commandLine) throw new Error('Invalid source actor incarnation');
  }
  if (!ticket.release || typeof ticket.release.root !== 'string' || typeof ticket.release.runtime !== 'string'
   || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(ticket.release.commit) || !/^[a-f0-9]{64}$/.test(ticket.release.fingerprint)) throw new Error('Invalid source actor pin');
  canonical(ticket.release.root); canonical(ticket.release.runtime);
  const closed = () => SourceNativeActor.hasClosedReceipt(directory, ticket);
  const state = async () => {
   if (closed()) return true;
   const reply = await SourceNativeActor.control(binary, ticket.token, ticket.monitor, 'STATUS');
   if (!new RegExp(`^(WAITING|STARTING|RUNNING|COMMITTED) ${ticket.root.pid}$`).test(reply)) throw new Error('Source supervisor changed its root');
   return false;
  };
  await state();
  const target: StopTarget = { ...ticket.root, handle: { hasExited: state,
   async terminate() {
    if (await state()) return 'exited';
    const reply = await SourceNativeActor.control(binary, ticket.token, ticket.monitor, 'KILL');
    if (reply !== `CLOSED ${ticket.root.pid}`) throw new Error('Source subtree termination is unconfirmed');
    return 'sent';
   }, async close() {} } };
  return new SourceNativeActor(directory, ticket, target, binary);
 }
 async close(): Promise<void> { await this.target.handle.close(); this.monitor?.unref(); }
}
