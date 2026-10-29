/** Daemon-memory ownership for explicit-removal cleanup. No configuration or persistence ports. */
import { ManagementServiceError } from './management.js';

export const MAX_ROOT_REMOVAL_RETIREMENTS = 64;
export const MAX_DAEMON_REMOVAL_RETIREMENTS = 256;

/** One shared budget across Saved pools and temporary owners in the main daemon. */
export class RemovalRetirementBudget {
 readonly #roots = new Map<string,number>();
 #total = 0;
 reserve(root: string): () => void {
  const count=this.#roots.get(root) ?? 0;
  if (count >= MAX_ROOT_REMOVAL_RETIREMENTS || this.#total >= MAX_DAEMON_REMOVAL_RETIREMENTS) throw new ManagementServiceError('resource-limit');
  this.#roots.set(root,count+1); this.#total++;
  let released=false;
  return () => {
   if (released) return;
   released=true; this.#total--;
   const remaining=(this.#roots.get(root) ?? 1)-1;
   if (remaining) this.#roots.set(root,remaining); else this.#roots.delete(root);
  };
 }
}
const daemonBudget=new RemovalRetirementBudget();
interface Retirement {
 readonly operationId: string;
 readonly revision: string;
 readonly release: () => void;
 phase: 'reserved' | 'committed' | 'canceled' | 'complete';
 close: (() => Promise<void>) | undefined;
 inFlight: Promise<void> | undefined;
}
export interface RemovalCleanup { close(): Promise<void> }

/** Each existing pool/overlay owns one instance; a token is never wire authority. */
export class RemovalRetirementOwner {
 readonly #tokens = new WeakMap<object,Retirement>();
 readonly #pending = new Map<string,Retirement>();
 #stopped = false;
 constructor(readonly root: string, private readonly budget: RemovalRetirementBudget = daemonBudget) {}

 prepare(operationId: string, revision: string): object {
  if (this.#stopped) throw new ManagementServiceError('busy');
  if (!this.root || !operationId || !revision) throw new ManagementServiceError('invalid-input');
  if (this.#pending.has(operationId)) throw new ManagementServiceError('operation-mismatch');
  const release=this.budget.reserve(this.root);
  const record:Retirement={operationId,revision,release,phase:'reserved',close:undefined,inFlight:undefined};
  const token=Object.freeze({});
  this.#tokens.set(token,record); this.#pending.set(operationId,record);
  return token;
 }
 #record(token: object): Retirement {
  const record=this.#tokens.get(token);
  if (!record) throw new ManagementServiceError('operation-mismatch');
  return record;
 }
 cancel(token: object): void {
  const record=this.#record(token);
  if (record.phase === 'canceled') return;
  if (record.phase !== 'reserved') throw new ManagementServiceError('busy');
  record.phase='canceled'; this.#pending.delete(record.operationId); record.release();
 }
 /** Call synchronously at proven commit, after all token/capacity preparation. */
 commit(token: object, close: () => Promise<void>): RemovalCleanup {
  const record=this.#record(token);
  if (record.phase !== 'reserved' || typeof close !== 'function') throw new ManagementServiceError('operation-mismatch');
  record.phase='committed'; record.close=close;
  return Object.freeze({close:()=>this.#close(record)});
 }
 pending(operationId: string, revision: string): boolean {
  const record=this.#pending.get(operationId);
  if (!record) return false;
  if (record.revision !== revision) throw new ManagementServiceError('operation-mismatch');
  return true;
 }
 retry(operationId: string, revision: string): Promise<void> {
  const record=this.#pending.get(operationId);
  if (!record) return Promise.resolve();
  if (record.revision !== revision) throw new ManagementServiceError('operation-mismatch');
  return this.#close(record);
 }
 #close(record: Retirement): Promise<void> {
  if (record.phase === 'complete') return Promise.resolve();
  if (record.phase !== 'committed') return Promise.reject(new ManagementServiceError('busy'));
  if (!record.inFlight) {
   record.inFlight=Promise.resolve().then(()=>record.close!()).then(()=>{
    record.phase='complete'; record.close=undefined;
    this.#pending.delete(record.operationId); record.release();
   },()=>{throw new ManagementServiceError('recovery-required');}).finally(()=>{record.inFlight=undefined;});
  }
  return record.inFlight;
 }
 stopAdmission(): void { this.#stopped=true; }
 /** Drains retained handles at capacity; unresolved reservations remain with their mutation owner. */
 async drain(): Promise<void> {
  this.stopAdmission();
  let failed=false;
  for (const record of this.#pending.values()) {
   if (record.phase !== 'committed') continue;
   try { await this.#close(record); } catch { failed=true; }
  }
  if (failed) throw new ManagementServiceError('recovery-required');
 }
}
