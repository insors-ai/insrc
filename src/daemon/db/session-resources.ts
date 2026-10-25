/** Private session/root/revision driver resources, independent of saved DriverPool storage. */
import type { ConnectionConfig, Driver, DriverFactory } from '../../shared/db-driver.js';
import { getFactory } from './registry.js';
import { fileExecutionPolicy } from './file-policy.js';
import { ManagementServiceError } from './management.js';
interface Resource {
 readonly revision: string;
 driver: Driver | undefined;
 building: Promise<Driver> | undefined;
 closing: Promise<void> | undefined;
 retired: boolean;
}
export interface TemporaryResourcePorts { readonly factory?: ((kind: string) => DriverFactory | undefined) | undefined }
export class TemporaryDriverResources {
 readonly #records = new Map<string, Resource>();
 readonly #ports: TemporaryResourcePorts;
 #closed = false;
 #failedClose = false;
 readonly #root: string; readonly #ownerId: string; readonly #assertActive: () => void;
 constructor(root: string, ownerId: string, assertActive: () => void, ports: TemporaryResourcePorts = {}) { this.#root = root; this.#ownerId = ownerId; this.#assertActive = assertActive; this.#ports = Object.freeze({ ...ports }); }
 async acquire(config: ConnectionConfig, revision: string): Promise<Driver> {
  this.#check();
  let record = this.#records.get(revision);
  if (!record) { record = { revision, driver: undefined, building: undefined, closing: undefined, retired: false }; this.#records.set(revision, record); }
  if (record.retired) throw new ManagementServiceError('conflict');
  if (!record.driver && !record.building) {
   const selected = record;
   selected.building = Promise.resolve().then(async () => {
    this.#check();
    const factory = (this.#ports.factory ?? getFactory)(config.kind);
    if (!factory) throw new ManagementServiceError('unsupported-temporary');
    const driver = await factory(config, { fileExecutionPolicy: fileExecutionPolicy(config, { lookupRoot: this.#root, ownerId: this.#ownerId, revision, persistence: 'memory-only' }) });
    selected.driver = driver; // Private cleanup ownership, never a published callback view.
    return driver;
   }).finally(() => { selected.building = undefined; });
  }
  const driver = record.driver ?? await record.building!;
  this.#check(); if (record.retired) throw new ManagementServiceError('conflict');
  return driver;
 }
 #check(): void { if (this.#closed) throw new ManagementServiceError('session-expired'); if (this.#failedClose) throw new ManagementServiceError('resource-limit'); this.#assertActive(); }
 stopAdmission(): void { this.#closed = true; }
 retire(revision: string): Promise<void> {
  const record = this.#records.get(revision); if (!record) return Promise.resolve();
  record.retired = true;
  if (!record.closing) {
   record.closing = Promise.resolve().then(async () => {
    await record.building?.catch(() => {});
    if (record.driver) { await record.driver.close(); record.driver = undefined; }
    this.#records.delete(revision);
   }).catch(() => { this.#failedClose = true; throw new ManagementServiceError('recovery-required'); });
   void record.closing.catch(() => {}); // Retain failed closed handles without an unhandled rejection.
  }
  return record.closing;
 }
 async close(): Promise<void> {
  this.stopAdmission();
  const results = await Promise.allSettled([...this.#records.keys()].map(revision => this.retire(revision)));
  if (results.some(result => result.status === 'rejected')) throw new ManagementServiceError('recovery-required');
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
