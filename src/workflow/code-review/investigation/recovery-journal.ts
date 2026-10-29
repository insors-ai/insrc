/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { constants, openSync, closeSync, fsyncSync, fstatSync, readFileSync, writeFileSync, writeSync, mkdirSync, lstatSync, realpathSync, linkSync, unlinkSync, ftruncateSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalJson } from '../../../design/corpus/canonical.js';
import { ledgerDigest } from './ledger-identity.js';
import { RecoveryError, RECOVERY_NAMESPACE, RECOVERY_LIMITS, recoveryId, recoveryDigest, recoveryInteger, recoveryRecord, recoveryValue, recoveryVersion } from './recovery-types.js';
import type { RecoveryEvent, RecoveryEventKind } from './recovery-types.js';

export type RecoveryFault = 'blob-file-synced' | 'blob-installed' | 'blob-directory-synced' | 'event-written' | 'event-synced';
export interface RecoveryJournalOptions {
 readonly assertProcessOwner: () => void;
 readonly fault?: ((point: RecoveryFault) => void) | undefined;
}
interface RootQueue { tail: Promise<void>; }
// One queue per canonical run root, even when two callers construct separate handles.
const queues = new Map<string, RootQueue>();
const nofollow = constants.O_NOFOLLOW;
const eventKinds: readonly RecoveryEventKind[] = ['lease','release','block','attempt-issued','attempt-settled','usage-pending','usage-recorded','state','extension'];
function syncDirectory(path: string): void {
 const fd = openSync(path, constants.O_RDONLY | nofollow);
 try { fsyncSync(fd); } finally { closeSync(fd); }
}
function regular(path: string): void {
 const s = lstatSync(path); if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || (s.mode & 0o077) !== 0)
  throw new RecoveryError('corrupt', 'Unsafe recovery file.');
}
/** Local filesystem only. The injected daemon guard must prove exclusive process ownership. */
export class RecoveryJournal {
 readonly directory: string;
 private readonly queue: RootQueue;
 constructor(repo: string, readonly runId: string, private readonly options: RecoveryJournalOptions) {
  recoveryId(runId); options.assertProcessOwner();
  let path = realpathSync(repo);
  for (const [index, part] of [...RECOVERY_NAMESPACE.split('/'),runId,'blobs'].entries()) {
   const parent = path; path = join(path,part);
   try { mkdirSync(path, { mode: 0o700 }); syncDirectory(parent); }
   catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause; }
   const s = lstatSync(path);
   if (!s.isDirectory() || s.isSymbolicLink()) throw new RecoveryError('invalid-input','Unsafe recovery directory.');
   // Existing .insrc/review-runs belong to other subsystems; enforce privacy on our namespace only.
   if (index >= 2 && (s.mode & 0o077) !== 0) throw new RecoveryError('invalid-input','Recovery directory is not private.');
  }
  this.directory = join(realpathSync(repo), RECOVERY_NAMESPACE, runId);
  this.queue = queues.get(this.directory) ?? { tail: Promise.resolve() }; queues.set(this.directory,this.queue);
 }
 async exclusive<T>(operation: () => T | Promise<T>): Promise<T> {
  const result = this.queue.tail.then(() => { this.guard(); return operation(); });
  this.queue.tail = result.then(() => {}, () => {}); return result;
 }
 guard(): void { this.options.assertProcessOwner(); this.checkDirectories(); }
 private checkDirectories(): void {
  const parts = this.directory.split('/'); let path = '/';
  for (const part of parts.filter(Boolean)) { path = join(path,part); if (lstatSync(path).isSymbolicLink()) throw new RecoveryError('ownership-lost','Recovery directory replaced by symlink.'); }
  if (!lstatSync(join(this.directory,'blobs')).isDirectory() || lstatSync(join(this.directory,'blobs')).isSymbolicLink()) throw new RecoveryError('corrupt','Unsafe blob directory.');
 }
 private blob(reference: string): string {
  const prefix = `${this.runId}/`; if (!reference.startsWith(prefix)) throw new RecoveryError('invalid-input','Foreign recovery reference.');
  const digest = reference.slice(prefix.length); recoveryDigest(digest); return join(this.directory,'blobs',digest);
 }
 /** Must be called under exclusive() when combined with other mutations. Installation never replaces an existing blob. */
 stage(value: Readonly<Record<string, unknown>> | string): { reference: string; digest: string } {
  this.guard(); const copy = recoveryValue(value), bytes = canonicalJson(copy,RECOVERY_LIMITS.valueBytes), digest = ledgerDigest(copy);
  const reference = `${this.runId}/${digest}`, target = this.blob(reference), temp = join(this.directory,'blobs',`temp-${randomUUID()}`);
  const fd = openSync(temp,constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | nofollow,0o600);
  try {
   writeFileSync(fd,bytes); fsyncSync(fd); this.options.fault?.('blob-file-synced'); this.guard();
   try { linkSync(temp,target); this.options.fault?.('blob-installed'); }
   catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause; this.read(reference); }
  } finally { closeSync(fd); unlinkSync(temp); }
  syncDirectory(join(this.directory,'blobs')); this.options.fault?.('blob-directory-synced'); this.guard();
  return {reference,digest};
 }
 read(reference: string): unknown {
  this.guard(); const path = this.blob(reference); regular(path);
  const fd = openSync(path,constants.O_RDONLY | nofollow);
  try {
   if (fstatSync(fd).size > RECOVERY_LIMITS.valueBytes) throw new RecoveryError('corrupt','Oversized recovery blob.');
   const bytes = readFileSync(fd,'utf8'); const value: unknown = JSON.parse(bytes);
   if (`${this.runId}/${ledgerDigest(value)}` !== reference || canonicalJson(value,RECOVERY_LIMITS.valueBytes) !== bytes) throw new RecoveryError('corrupt','Recovery blob digest mismatch.');
   return recoveryValue(value);
  } catch (cause) { throw new RecoveryError('corrupt','Cannot verify recovery blob.',{cause}); }
  finally { closeSync(fd); }
 }
 /** Read-only by default. Explicit tail repair requires an exclusive owner transaction. */
 events(repairTail = false): readonly RecoveryEvent[] {
  this.guard(); const path = join(this.directory,'events.jsonl');
  let fd: number;
  try { regular(path); fd = openSync(path,(repairTail ? constants.O_RDWR : constants.O_RDONLY) | nofollow); }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return []; throw cause; }
  try {
   if (fstatSync(fd).size > RECOVERY_LIMITS.journalBytes) throw new RecoveryError('corrupt','Recovery journal limit exceeded.');
   const bytes = readFileSync(fd); const boundary = bytes.lastIndexOf(10) + 1;
   const complete = bytes.subarray(0,boundary).toString('utf8'); const result: RecoveryEvent[] = [];
   for (const line of complete.split('\n').slice(0,-1)) {
    if (result.length >= RECOVERY_LIMITS.events || Buffer.byteLength(line) > RECOVERY_LIMITS.valueBytes) throw new RecoveryError('corrupt','Recovery event limit exceeded.');
    let e: Record<string,unknown>;
    try { e = recoveryRecord(recoveryValue(JSON.parse(line))); recoveryVersion(e['version']); recoveryInteger(e['ordinal'],1); recoveryInteger(e['generation']); recoveryId(e['eventId']); }
    catch(cause){ throw new RecoveryError('corrupt','Invalid complete recovery frame.',{cause}); }
    const {digest,...body}=e;
    if (Object.keys(e).sort().join(',') !== ['version','ordinal','previousDigest','eventId','runId','subjectDigest','policyDigest','generation','kind','payloadRef','digest'].sort().join(',')
     || digest !== ledgerDigest(body) || canonicalJson(e,RECOVERY_LIMITS.valueBytes) !== line || e['runId'] !== this.runId
     || e['ordinal'] !== result.length+1 || e['previousDigest'] !== (result.at(-1)?.digest ?? 'genesis')
     || !eventKinds.includes(e['kind'] as RecoveryEventKind) || typeof e['payloadRef'] !== 'string'
     || !/^[a-f0-9]{64}$/.test(String(e['subjectDigest'])) || !/^[a-f0-9]{64}$/.test(String(e['policyDigest']))) throw new RecoveryError('corrupt','Recovery event chain mismatch.');
    this.read(e['payloadRef']); result.push(e as unknown as RecoveryEvent);
   }
   if (boundary !== bytes.length) {
    if (!repairTail) throw new RecoveryError('uncertain-append','Torn journal tail requires owner reconciliation.');
    this.guard(); const quarantine=join(this.directory,`torn-${randomUUID()}`); const q=openSync(quarantine,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|nofollow,0o600);
    try { writeFileSync(q,bytes.subarray(boundary)); fsyncSync(q); } finally { closeSync(q); }
    syncDirectory(this.directory); ftruncateSync(fd,boundary); fsyncSync(fd); syncDirectory(this.directory);
   }
   return recoveryValue(result);
  } finally { closeSync(fd); }
 }
 /** Re-establish durability before returning a receipt discovered after an uncertain append. */
 stabilize():void {this.guard();const fd=openSync(join(this.directory,'events.jsonl'),constants.O_RDONLY|nofollow);try{fsyncSync(fd);syncDirectory(this.directory);this.guard();}finally{closeSync(fd);}}
 append(input: Omit<RecoveryEvent,'version'|'ordinal'|'previousDigest'|'digest'|'runId'>): RecoveryEvent {
  this.guard(); this.read(input.payloadRef); recoveryId(input.eventId); recoveryInteger(input.generation); recoveryDigest(input.subjectDigest); recoveryDigest(input.policyDigest);
  if (!eventKinds.includes(input.kind)) throw new RecoveryError('invalid-input','Unknown recovery event kind.');
  const events=this.events(), prior=events.find(e=>e.eventId===input.eventId);
  if(prior){const {version:_,ordinal:__,previousDigest:___,digest:____,runId:_____,...old}=prior;if(ledgerDigest(old)!==ledgerDigest(input))throw new RecoveryError('invalid-input','Conflicting event replay.');const existing=openSync(join(this.directory,'events.jsonl'),constants.O_RDONLY|nofollow);try{this.guard();fsyncSync(existing);syncDirectory(this.directory);}finally{closeSync(existing);}return prior;}
  const body={...recoveryValue(input),version:1 as const,runId:this.runId,ordinal:events.length+1,previousDigest:events.at(-1)?.digest??'genesis'};
  const event={...body,digest:ledgerDigest(body)}, bytes=canonicalJson(event,RECOVERY_LIMITS.valueBytes)+'\n', path=join(this.directory,'events.jsonl');
  if(events.length>=RECOVERY_LIMITS.events)throw new RecoveryError('storage-unavailable','Recovery event allowance exhausted.');
  const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_APPEND|nofollow,0o600);
  try {
   if(fstatSync(fd).size+Buffer.byteLength(bytes)>RECOVERY_LIMITS.journalBytes)throw new RecoveryError('storage-unavailable','Recovery journal allowance exhausted.');
   regular(path);this.guard(); const data=Buffer.from(bytes);let offset=0;while(offset<data.length){const n=writeSync(fd,data,offset,data.length-offset);if(n<1)throw Error('Short journal write');offset+=n;}
   this.options.fault?.('event-written');fsyncSync(fd);syncDirectory(this.directory);this.options.fault?.('event-synced');this.guard();
   return recoveryValue(event);
  }catch(cause){throw new RecoveryError('uncertain-append','Journal append outcome requires reconciliation; no ACK.',{cause});}
  finally{closeSync(fd);}
 }
}
