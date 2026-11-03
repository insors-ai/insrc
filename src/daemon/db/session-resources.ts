import { temporaryDriverContext, invokeTemporaryFactory } from './driver-log-policy.js';
/** Private session/root/revision driver resources, independent of saved DriverPool storage. */
import type { ConnectionConfig, Driver, DriverFactory } from '../../shared/db-driver.js';
import type { FileExecutionResource } from '../../shared/connection-management.js';
import { getFactory } from './registry.js';
import { fileExecutionPolicy } from './file-policy.js';
import { ManagementServiceError } from './management.js';
import { RemovalRetirementOwner } from './removal-retirement.js';
import type { RemovalCleanup } from './removal-retirement.js';
interface Resource {
 readonly revision: string;
 readonly files: Set<FileExecutionResource>;
 readonly fileClosures: Map<FileExecutionResource, Promise<void>>;
 driver: Driver | undefined;
 building: Promise<Driver> | undefined;
 closing: Promise<void> | undefined;
 retired: boolean;
 removal: boolean;
}
interface ResourceRemoval { readonly revision: string; readonly reservation: object | undefined; resource: Resource | undefined; phase: 'prepared'|'committed'|'canceled' }
export interface TemporaryResourcePorts { readonly factory?: ((kind: string) => DriverFactory | undefined) | undefined }
export class TemporaryDriverResources {
 readonly #records = new Map<string, Resource>();
 readonly #ports: TemporaryResourcePorts;
 #closed = false;
 #failedClose = false;
 readonly #retirements: RemovalRetirementOwner;
 readonly #removalTokens = new WeakMap<object,ResourceRemoval>();
 readonly #preparedRemovals = new Set<object>();
 readonly #preparingRevisions = new Set<string>();
 readonly #root: string; readonly #ownerId: string; readonly #factoryAuthority: object; readonly #assertActive: () => void;
 constructor(root: string, ownerId: string, assertActive: () => void, factoryAuthority: object, ports: TemporaryResourcePorts = {}, private readonly retainRemovalSlot: () => () => void = () => () => {}) { this.#root = root; this.#ownerId = ownerId; this.#factoryAuthority = factoryAuthority; this.#assertActive = assertActive; this.#ports = Object.freeze({ ...ports }); this.#retirements=new RemovalRetirementOwner(root); }
 async acquire(config: ConnectionConfig, revision: string): Promise<Driver> {
  this.#check();
  let record = this.#records.get(revision);
  if (!record) { record = { revision, files: new Set(), fileClosures: new Map(), driver: undefined, building: undefined, closing: undefined, retired: false, removal: false }; this.#records.set(revision, record); }
  if (record.retired) throw new ManagementServiceError('conflict');
  if (!record.driver && !record.building) {
   const selected = record;
   selected.building = Promise.resolve().then(async () => {
    this.#check();
    const factory = (this.#ports.factory ?? getFactory)(config.kind);
    if (!factory) throw new ManagementServiceError('unsupported-temporary');
    const context = temporaryDriverContext(this.#factoryAuthority, fileExecutionPolicy(config, { lookupRoot: this.#root, ownerId: this.#ownerId, revision, persistence: 'memory-only' }), resource => {
     selected.files.add(resource); if (this.#closed || selected.retired) void this.#closeFile(selected, resource).catch(() => {});
    });
    let driver: Driver;
    try { driver = await invokeTemporaryFactory(factory, config, context); }
    catch (error) {
     const closed = await Promise.allSettled([...selected.files].map(file => this.#closeFile(selected, file)));
     if (closed.some(value => value.status === 'rejected')) { if (!selected.removal) this.#failedClose = true; throw new ManagementServiceError('recovery-required'); }
     throw error;
    }
    selected.driver = driver; // Private cleanup ownership, never a published callback view.
    return driver;
   }).finally(() => { selected.building = undefined; });
  }
  const driver = record.driver ?? await record.building!;
  this.#check(); if (record.retired) throw new ManagementServiceError('conflict');
  return driver;
 }
 #check(): void { if (this.#closed) throw new ManagementServiceError('session-expired'); if (this.#failedClose) throw new ManagementServiceError('resource-limit'); this.#assertActive(); }
 #closeFile(record: Resource, file: FileExecutionResource): Promise<void> {
  let closing = record.fileClosures.get(file);
  if (!closing) {
   // close synchronously aborts/interrupts the private execution before waiting for its work.
   try { closing = file.close(); } catch { closing = Promise.reject(new ManagementServiceError('recovery-required')); }
   record.fileClosures.set(file, closing);
			void closing.then(() => { record.files.delete(file); record.fileClosures.delete(file); }, () => { if (!record.removal) this.#failedClose = true; record.fileClosures.delete(file); });
  }
  return closing;
 }
 stopAdmission(): void {
  this.#closed = true;
  this.#retirements.stopAdmission();
  for (const token of this.#preparedRemovals) this.cancelRemoval(token);
  for (const record of this.#records.values()) for (const file of record.files) void this.#closeFile(record, file).catch(() => {});
 }
 /** Prepare only capacity/identity. The overlay owns the existing revision barrier and live entry slot. */
 prepareRemoval(revision: string, operationId: string): object {
  if (this.#closed) throw new ManagementServiceError('session-expired');
  this.#assertActive();
  if(this.#preparingRevisions.has(revision))throw new ManagementServiceError('busy');
  const record=this.#records.get(revision);
  if (record?.retired) throw new ManagementServiceError('conflict');
  const owns=record && (record.driver || record.building || record.files.size || record.fileClosures.size);
  const reservation=owns ? this.#retirements.prepare(operationId,revision) : undefined;
  const token=Object.freeze({});this.#removalTokens.set(token,{revision,reservation,resource:record,phase:'prepared'});this.#preparedRemovals.add(token);this.#preparingRevisions.add(revision);
  return token;
 }
 #removal(token: object): ResourceRemoval {
  const value=this.#removalTokens.get(token);if(!value)throw new ManagementServiceError('operation-mismatch');return value;
 }
 cancelRemoval(token: object): void {
  const value=this.#removal(token);if(value.phase==='canceled')return;
  if(value.phase!=='prepared')throw new ManagementServiceError('operation-mismatch');
  if(value.reservation)this.#retirements.cancel(value.reservation);
  value.phase='canceled';value.resource=undefined;this.#preparedRemovals.delete(token);this.#preparingRevisions.delete(value.revision);
 }
 /** Synchronous ownership transfer; no file or SDK close runs until cleanup.close(). */
 commitRemoval(token: object): RemovalCleanup {
  if(this.#closed)throw new ManagementServiceError('session-expired');this.#assertActive();
  const value=this.#removal(token);if(value.phase!=='prepared')throw new ManagementServiceError('operation-mismatch');
  const record=this.#records.get(value.revision);
  if(record!==value.resource || (!value.reservation && record && (record.driver || record.building || record.files.size || record.fileClosures.size)))throw new ManagementServiceError('conflict');
  if(record){record.retired=true;record.removal=true;}
  value.phase='committed';value.resource=undefined;this.#preparedRemovals.delete(token);this.#preparingRevisions.delete(value.revision);
  if(!value.reservation){if(record)this.#records.delete(value.revision);return Object.freeze({close:async()=>{}});}
  const release=this.retainRemovalSlot();
  return this.#retirements.commit(value.reservation,async()=>{await this.retire(value.revision);release();});
 }
 removalCleanupPending(operationId: string, revision: string): boolean {return this.#retirements.pending(operationId,revision);}
 retryRemovalCleanup(operationId: string, revision: string): Promise<void> {return this.#retirements.retry(operationId,revision);}
 retire(revision: string): Promise<void> {
  const record = this.#records.get(revision); if (!record) return Promise.resolve();
  record.retired = true;
  if (!record.closing) {
   record.closing = Promise.resolve().then(async () => {
    await record.building?.catch(() => {});
    const files = await Promise.allSettled([...record.files].map(file => this.#closeFile(record, file)));
    if (record.driver) { await record.driver.close(); record.driver = undefined; }
    if (files.some(value => value.status === 'rejected')) throw new ManagementServiceError('recovery-required');
    this.#records.delete(revision);
			}).catch(() => { if (!record.removal) this.#failedClose = true; record.closing = undefined; throw new ManagementServiceError('recovery-required'); });
   void record.closing.catch(() => {}); // Retain failed closed handles without an unhandled rejection.
  }
  return record.closing;
 }
 async close(): Promise<void> {
  this.stopAdmission();
  const results = await Promise.allSettled([...this.#records].filter(([,record])=>!record.removal).map(([revision]) => this.retire(revision)));
  let retirementFailed=false;try{await this.#retirements.drain();}catch{retirementFailed=true;}
  if (retirementFailed || results.some(result => result.status === 'rejected')) throw new ManagementServiceError('recovery-required');
 }
}

/** Source-owned errors never carry messages, getters or nested SDK objects across a temporary callback. */
export function temporaryDriverFailure(error: unknown): Error {
 try {
 const code = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'code') : undefined;
 const value: unknown = code && Object.hasOwn(code, 'value') ? code.value : undefined;
 switch (value) {
  case 'session-expired': case 'busy': case 'conflict': case 'not-found': case 'duplicate-id': case 'resource-limit': case 'unsupported-temporary':
   return new ManagementServiceError(value);
  default: return new ManagementServiceError('recovery-required');
 }
 } catch { return new ManagementServiceError('recovery-required'); }
}
