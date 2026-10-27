/** Synchronous cross-process ownership for BUILD ledger/approval writes. */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, unlinkSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { publishCreateOnly } from './team/create-only.js';

export class ApprovalWriterBusyError extends Error {
 readonly code = 'approval-writer-busy';
 constructor() { super('Another writer owns this BUILD artifact; retry after it finishes.'); this.name = 'ApprovalWriterBusyError'; }
}
function read(path: string): string | undefined { try { return readFileSync(path, 'utf8'); } catch { return undefined; } }
function deadOwner(raw: string | undefined): boolean {
 if (raw === undefined) return false;
 try {
  const value = JSON.parse(raw) as { pid?: unknown };
  if (typeof value.pid !== 'number' || !Number.isSafeInteger(value.pid) || value.pid <= 0) return false;
  try { process.kill(value.pid, 0); return false; } catch (err) { return (err as NodeJS.ErrnoException).code === 'ESRCH'; }
 } catch { return false; }
}
function removeOwned(path: string, token: string): void { if (read(path) === token) { try { unlinkSync(path); } catch { /* already released */ } } }
/** Reclaims a dead process only under an exclusive takeover guard; never steals a live writer. */
export function withBuildWriter<T>(jsonPath: string, run: () => T): T {
 mkdirSync(dirname(jsonPath), { recursive: true });
 const canonical = join(realpathSync(dirname(jsonPath)), basename(jsonPath));
 const path = `${canonical}.approval-lock`, guard = `${path}.takeover`, token = JSON.stringify({ owner: randomUUID(), pid: process.pid });
 let acquired = publishCreateOnly(path, token) === 'created';
 if (!acquired) {
  const prior = read(path);
  if (!deadOwner(prior) || publishCreateOnly(guard, token) !== 'created') throw new ApprovalWriterBusyError();
  try {
   if (read(path) === prior && deadOwner(prior)) unlinkSync(path);
   acquired = publishCreateOnly(path, token) === 'created';
  } finally { removeOwned(guard, token); }
 }
 if (!acquired) throw new ApprovalWriterBusyError();
 try { return run(); }
 finally { removeOwned(path, token); }
}
