/** Saved-root ticket authority. No config writes, request logs or plaintext receipts. */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import type { ConnectionKey, ManagementErrorCode, MutationRequest, OperationTicket } from '../../shared/connection-management.js';
import { assertTicketTarget, parseMutationRequest, parseOperationTicket, parseConnectionKey, ManagementInputError } from '../../shared/connection-management-wire.js';

export const TICKET_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export interface TicketKeyStore {
 getKey(ref: string): Promise<string | null>;
 setKey(ref: string, value: string): Promise<void>;
}
export class TicketError extends Error {
 constructor(readonly code: ManagementErrorCode) {
  super(code === 'reconciliation-required' ? 'The operation requires reconciliation.'
   : code === 'recovery-required' ? 'Connection management requires recovery.'
   : code === 'secret-unavailable' ? 'Connection credentials are unavailable.' : 'Invalid operation ticket.');
  this.name = 'TicketError';
 }
}

/** Reject non-JSON/ambiguous values rather than hashing a lossy JSON representation. */
export function canonicalRequestJson(value: unknown): string {
 let nodes = 0; let bytes = 0;
 const seen = new Set<object>();
 function charge(text: string): string {
  bytes += Buffer.byteLength(text);
  if (bytes > 2 * 1024 * 1024) throw new TicketError('invalid-input');
  return text;
 }
 function visit(item: unknown, depth: number): string {
  if (++nodes > 100000 || depth > 32) throw new TicketError('invalid-input');
  if (item === null) return charge('null');
  if (typeof item === 'boolean') return charge(String(item));
  if (typeof item === 'number' && Number.isFinite(item)) return charge(JSON.stringify(item));
  if (typeof item === 'string' && item.length <= 2 * 1024 * 1024) return charge(JSON.stringify(item));
  if (typeof item !== 'object' || item === null || seen.has(item)) throw new TicketError('invalid-input');
  seen.add(item);
  try {
   if (Array.isArray(item)) {
    if (Object.keys(item).length !== item.length || Reflect.ownKeys(item).length !== item.length + 1) throw new TicketError('invalid-input');
    const values: string[] = [];
    for (let i = 0; i < item.length; i++) {
     if (!Object.hasOwn(item, i)) throw new TicketError('invalid-input');
     const descriptor = Object.getOwnPropertyDescriptor(item, String(i));
     if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TicketError('invalid-input');
     values.push(visit(descriptor.value, depth + 1));
    }
    charge('[]' + ','.repeat(Math.max(0, values.length - 1)));
    return '[' + values.join(',') + ']';
   }
   const proto = Object.getPrototypeOf(item);
   if (proto !== Object.prototype && proto !== null) throw new TicketError('invalid-input');
   const descriptors = Object.getOwnPropertyDescriptors(item);
   if (Object.values(descriptors).some(d => !d.enumerable)) throw new TicketError('invalid-input');
   if (Object.getOwnPropertySymbols(item).length) throw new TicketError('invalid-input');
   const entries: string[] = [];
   for (const key of Object.keys(item).sort()) {
    const descriptor = descriptors[key];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || ['__proto__','prototype','constructor'].includes(key)) throw new TicketError('invalid-input');
    entries.push(charge(JSON.stringify(key) + ':') + visit(descriptor.value, depth + 1));
   }
   charge('{}' + ','.repeat(Math.max(0, entries.length - 1)));
   return '{' + entries.join(',') + '}';
  } finally { seen.delete(item); }
 }
 try { return visit(value, 0); } catch { throw new TicketError('invalid-input'); }
}

const initialization = new Map<string, Promise<void>>();
async function exclusive<T>(name: string, action: () => Promise<T>): Promise<T> {
 const previous = initialization.get(name) ?? Promise.resolve();
 let release!: () => void;
 const tail = new Promise<void>(resolve => { release = resolve; });
 initialization.set(name, tail);
 await previous;
 try { return await action(); } finally { release(); if (initialization.get(name) === tail) initialization.delete(name); }
}
function keyBytes(value: string): Buffer {
 if (!/^v2:[A-Za-z0-9_-]{43}$/.test(value)) throw new TicketError('recovery-required');
 const bytes = Buffer.from(value.slice(3), 'base64url');
 if (bytes.length !== 32 || bytes.toString('base64url') !== value.slice(3)) throw new TicketError('recovery-required');
 return bytes;
}
interface TicketAuthorityOptions {
 readonly root: string;
 /** Server-owned adoption identity, never a request parameter. */
 readonly registryId: string;
 readonly adopted: boolean;
 readonly keystore: TicketKeyStore;
 readonly isRegistered: (canonicalRoot: string) => Promise<boolean>;
 readonly now?: (() => number) | undefined;
}
export class SavedTicketAuthority {
 readonly #key: Buffer;
 private constructor(private readonly root: string, key: Buffer,
  private readonly registered: TicketAuthorityOptions['isRegistered'], private readonly now: () => number,
  private readonly keystore: TicketKeyStore, private readonly keyRef: string) { this.#key = key; }

 /** The owner/adoption gate must serialize initial adoption across daemon processes. */
 static async open(options: TicketAuthorityOptions): Promise<SavedTicketAuthority> {
  let root: string;
  try {
   root = await realpath(options.root);
   if (!(await stat(root)).isDirectory() || !await options.isRegistered(root)) throw new Error();
  } catch { throw new TicketError('invalid-input'); }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.registryId)) throw new TicketError('invalid-input');
  const ref = `db-management:v2:${options.registryId}:ticket-key`;
  const key = await exclusive(ref, async () => {
   let stored: string | null;
   try { stored = await options.keystore.getKey(ref); } catch { throw new TicketError('secret-unavailable'); }
   if (stored !== null) return keyBytes(stored);
   if (options.adopted) throw new TicketError('recovery-required');
   const value = 'v2:' + randomBytes(32).toString('base64url');
   try {
    await options.keystore.setKey(ref, value);
    if (await options.keystore.getKey(ref) !== value) throw new Error();
   } catch { throw new TicketError('secret-unavailable'); }
   return keyBytes(value);
  });
  return new SavedTicketAuthority(root, key, options.isRegistered, options.now ?? Date.now, options.keystore, ref);
 }
 private mac(domain: 'ticket' | 'request', value: unknown): Buffer {
  return createHmac('sha256', this.#key).update(`connection-management-v2:${domain}\0`).update(canonicalRequestJson(value)).digest();
 }
 private async eligible(): Promise<void> {
  try { if (!await this.registered(this.root)) throw new Error(); } catch { throw new TicketError('invalid-input'); }
  let stored: string | null;
  try { stored = await this.keystore.getKey(this.keyRef); } catch { throw new TicketError('secret-unavailable'); }
  if (stored === null || !timingSafeEqual(keyBytes(stored), this.#key)) throw new TicketError('recovery-required');
 }
 async issue(key: ConnectionKey, mode: OperationTicket['mode'], operationId: string = randomUUID()): Promise<OperationTicket> {
  try { key = parseConnectionKey(JSON.parse(canonicalRequestJson(key))); } catch { throw new TicketError('invalid-input'); }
  await this.eligible();
  if (key.repoRoot !== this.root || key.scope !== 'saved') throw new TicketError('operation-mismatch');
  const now = this.now();
  if (!Number.isFinite(now)) throw new TicketError('invalid-input');
  let ticket: OperationTicket;
  try { ticket = parseOperationTicket({operationId,lookupRoot:this.root,scope:key.scope,connectionId:key.id,mode,
   issuedAt:new Date(now).toISOString(),expiresAt:new Date(now + TICKET_LIFETIME_MS).toISOString(),signature:'unsigned'}); }
  catch { throw new TicketError('invalid-input'); }
  const { signature: _, ...unsigned } = ticket;
  return Object.freeze({...unsigned, signature:this.mac('ticket', unsigned).toString('base64url')});
 }
 /** Expired authenticated tickets remain inspectable for status/recovery, never silently not-seen. */
 async inspect(value: unknown): Promise<{ ticket: OperationTicket; expired: boolean }> {
  await this.eligible();
  let ticket: OperationTicket;
  try { ticket = parseOperationTicket(JSON.parse(canonicalRequestJson(value))); } catch { throw new TicketError('invalid-input'); }
  if (ticket.lookupRoot !== this.root || ticket.scope !== 'saved') throw new TicketError('operation-mismatch');
  const {signature, ...unsigned} = ticket;
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) throw new TicketError('invalid-input');
  const supplied = Buffer.from(signature, 'base64url');
  const expected = this.mac('ticket', unsigned);
  if (supplied.length !== expected.length || supplied.toString('base64url') !== signature || !timingSafeEqual(supplied, expected)) throw new TicketError('invalid-input');
  const now = this.now();
  if (!Number.isFinite(now) || Date.parse(ticket.issuedAt) > now || Date.parse(ticket.expiresAt) - Date.parse(ticket.issuedAt) !== TICKET_LIFETIME_MS) throw new TicketError('invalid-input');
  return {ticket:Object.freeze(ticket), expired:Date.parse(ticket.expiresAt) <= now};
 }
 async requestMac(value: unknown, options: { readonly reconciliationOnly?: boolean | undefined } = {}): Promise<string> {
  let request: MutationRequest;
  try { request = parseMutationRequest(JSON.parse(canonicalRequestJson(value))); } catch (error) { throw new TicketError(error instanceof ManagementInputError && error.code === 'operation-mismatch' ? 'operation-mismatch' : 'invalid-input'); }
  const {ticket,expired} = await this.inspect(request.ticket);
  try { assertTicketTarget(ticket,request.key,request.mode,request.operationId); } catch { throw new TicketError('operation-mismatch'); }
  if (expired && options.reconciliationOnly !== true) throw new TicketError('reconciliation-required');
  return this.mac('request', request).toString('base64url');
 }
}
