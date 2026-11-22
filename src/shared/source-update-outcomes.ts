/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Stats } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { requireProcessIdentity, sameProcess } from './daemon-process.js';
import type { ProcessIdentity } from './daemon-process.js';
import type { RunFileGuard } from './daemon-run-files.js';
import type { SourceInstallationStore, SourceInstallationState } from './source-installation.js';
import type { DaemonUpdateOutcome } from './types.js';

type Outcome = NonNullable<SourceInstallationState['outcome']>;
interface Receipt { version: 1; id: string; generation: number; owner: ProcessIdentity; outcome?: DaemonUpdateOutcome; }
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
function owned(stat: Stats, directory: boolean): void {
 if (!(directory ? stat.isDirectory() : stat.isFile()) || stat.uid !== process.getuid?.() || (stat.mode & 0o077)
  || (!directory && (stat.nlink !== 1 || stat.size > 16384))) throw new Error('Unsafe source update outcome metadata');
}
/** Pin each directory before traversing it; never follow an editable parent link. */
function directory<T>(store: SourceInstallationStore, create: boolean, effect: (path: string, root: string) => T): T | undefined {
 const fds: number[] = [], pins: Array<{ path: string; dev: number; ino: number }> = [];
 try {
  let path = store.root;
  for (const name of ['', 'source-lifecycle', 'update-outcomes']) {
   if (name) path = join(`/proc/self/fd/${fds.at(-1)!}`, name);
   if (create && name === 'update-outcomes') {
    try { mkdirSync(path, { mode: 0o700 }); fsyncSync(fds.at(-1)!); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
   }
   let fd: number;
   try { fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); }
   catch (error) { if (!create && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
   fds.push(fd); const stat = fstatSync(fd); owned(stat, true); pins.push({ path, dev: stat.dev, ino: stat.ino });
  }
  const verify = () => { for (const pin of pins) { const now = lstatSync(pin.path); owned(now, true); if (now.dev !== pin.dev || now.ino !== pin.ino) throw new Error('Source outcome directory changed'); } };
  verify(); const result = effect(`/proc/self/fd/${fds.at(-1)!}`, `/proc/self/fd/${fds[0]!}`); verify(); return result;
 } finally { for (const fd of fds.reverse()) closeSync(fd); }
}
function read(path: string): Receipt | undefined {
 let fd: number;
 try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
 catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
 try {
  const before = fstatSync(fd); owned(before, false);
  const bytes = Buffer.alloc(before.size + 1), count = readSync(fd, bytes, 0, bytes.length, 0), after = fstatSync(fd), current = lstatSync(path);
  if (count !== before.size || before.ctimeMs !== after.ctimeMs || before.mtimeMs !== after.mtimeMs
   || before.dev !== current.dev || before.ino !== current.ino) throw new Error('Source update outcome changed while reading');
  const r = JSON.parse(bytes.subarray(0, count).toString('utf8')) as Receipt;
  if (!r || r.version !== 1 || !uuid.test(r.id) || !Number.isSafeInteger(r.generation) || r.generation < 0
   || !r.owner || Object.keys(r.owner).length !== 3 || !Number.isSafeInteger(r.owner.pid) || r.owner.pid <= 0
   || typeof r.owner.startedAt !== 'string' || !r.owner.startedAt || typeof r.owner.commandLine !== 'string' || !r.owner.commandLine
   || Object.keys(r).some(key => !['version', 'id', 'generation', 'owner', 'outcome'].includes(key))) throw new Error('Invalid source update receipt');
  if (r.outcome) {
   const o = r.outcome;
   if (o.updateId !== r.id || !['committed', 'rolled-back', 'recovery-required'].includes(o.decision ?? '')
    || o.state !== (o.decision === 'committed' ? 'succeeded' : 'failed') || !Number.isFinite(Date.parse(o.finishedAt))
    || (o.state === 'failed' && (typeof o.error !== 'string' || o.error.length > 4096))
    || Object.keys(o).some(key => !['updateId', 'decision', 'state', 'finishedAt', 'error'].includes(key))) throw new Error('Invalid source update outcome');
  }
  return r;
 } finally { closeSync(fd); }
}
function publish(directory: string, name: string, value: unknown): void {
 const temporary = join(directory, `.outcome-${randomUUID()}.tmp`), fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_WRONLY, 0o600);
 try {
  try { writeFileSync(fd, JSON.stringify(value) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, join(directory, name));
  const parent = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY); try { fsyncSync(parent); } finally { closeSync(parent); }
 } finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
}
function authority(store: SourceInstallationStore, id: string, guard: RunFileGuard) {
 guard.assertOwned();
 if (guard.path !== join(store.root, 'source-lifecycle/mutation.guard') || !sameProcess(guard.owner, requireProcessIdentity(process.pid))) throw new Error('Source outcome requires the mutation owner');
 const active = store.read().active;
 if (!active || active.id !== id || !sameProcess(active.owner, guard.owner)) throw new Error('Source outcome owner differs from the active transaction');
 return active;
}
/** Create before acknowledgment/network/build, while the transaction holds exclusion. */
export function beginSourceUpdate(store: SourceInstallationStore, id: string, guard: RunFileGuard): void {
 const active = authority(store, id, guard);
 if (active.phase !== 'reserved' || active.execution) throw new Error('Source update admission is no longer reserved');
 directory(store, true, path => {
  const name = `${id}.json`;
  if (read(join(path, name))) throw new Error('Source update receipt already exists');
  publish(path, name, { version: 1, id, generation: active.baselineGeneration, owner: active.owner });
 });
 guard.assertOwned();
}
/** Publish after actor settlement and before releasing/clearing the terminal reservation.
 * Recovery may adopt the reservation; its original receipt owner remains historical evidence. */
export function finishSourceUpdate(store: SourceInstallationStore, outcome: Outcome, guard: RunFileGuard): void {
 const active = authority(store, outcome.id, guard);
 if (active.phase !== outcome.decision || !isDeepStrictEqual(store.read().outcome, outcome)) throw new Error('Source outcome is not the durable decision');
 directory(store, false, (path, root) => {
  const name = `${outcome.id}.json`, receipt = read(join(path, name));
  if (!receipt) return; // Ordinary start/stop/restart does not replace the last update result.
  if (receipt.generation !== active.baselineGeneration) throw new Error('Source update receipt generation differs');
  if (receipt.outcome && receipt.outcome.decision !== 'recovery-required' && receipt.outcome.decision !== outcome.decision) throw new Error('Source update terminal decision conflicts');
  const result: DaemonUpdateOutcome = receipt.outcome?.decision === outcome.decision ? receipt.outcome : {
   updateId: outcome.id, decision: outcome.decision, finishedAt: new Date().toISOString(),
   ...(outcome.decision === 'committed' ? { state: 'succeeded' } : { state: 'failed', error: outcome.detail.slice(0, 4096) }),
  };
  publish(path, name, { ...receipt, outcome: result });
  // Old restored daemons read this top-level shape. The source receipt remains authoritative.
  publish(root, 'daemon.update-outcome.json', result);
 });
 guard.assertOwned();
}
/** Latest update by reservation generation, never by wall clock or later lifecycle results. */
export function readSourceUpdateOutcome(store: SourceInstallationStore): DaemonUpdateOutcome | null {
 const before = store.read();
 if (before.active && before.active.phase !== 'recovery-required') return null;
 const result = directory(store, false, (path, root) => {
  const names = readdirSync(path), generations = new Set<number>();
  if (names.length > 10000) throw new Error('Too many retained source update outcomes');
  let latest: Receipt | undefined;
  for (const name of names) {
   if (name.startsWith('.outcome-') && name.endsWith('.tmp')) continue;
   if (!name.endsWith('.json') || !uuid.test(name.slice(0, -5))) throw new Error('Unexpected source update receipt');
   const receipt = read(join(path, name));
   if (!receipt || `${receipt.id}.json` !== name || receipt.generation >= before.generation || generations.has(receipt.generation)) throw new Error('Inconsistent source update receipt');
   generations.add(receipt.generation);
   if (!latest || receipt.generation > latest.generation) latest = receipt;
  }
  if (before.active && (latest?.id !== before.active.id || latest.outcome?.decision !== 'recovery-required')) return null;
  return latest?.outcome ?? null;
 });
 const after = store.read();
 return after.generation === before.generation ? result ?? null : null;
}
