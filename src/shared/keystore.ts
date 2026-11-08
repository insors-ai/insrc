/**
 * Secure key storage via the OS keychain (keytar).
 *
 * Every secret lives in one Keychain item, the vault, so a process needs one Keychain access however
 * many secrets it uses. The item sits under its own service, so no secret name can address it. Its value
 * is JSON: `{ version: 1, secrets: { name: value }, retired: [names] }`.
 *
 * A secret from before the vault stays in its own legacy item under the old service until it is first
 * used, when it is copied in. Copying never deletes the legacy item: only an explicit delete does.
 *
 * The main thread owns the vault; a worker's calls are forwarded to it over the hub, so one process makes
 * one Keychain read. With daemon threads off the main thread uses it directly.
 *
 * Entries are held in a Map, so a name such as `__proto__` is an ordinary key. Decrypted values are never
 * written to disk or logged, and an error never quotes the payload.
 */

import keytar from 'keytar';

import { getLogger } from './logger.js';

const log = getLogger('keystore');

const LEGACY_SERVICE = 'insrc';
const VAULT_SERVICE = 'insrc-vault';
const VAULT_ACCOUNT = 'secrets';
/** How long a failed load is remembered, so a user who denied access is not asked by every request. */
const LOAD_FAILURE_MEMORY_MS = 5 * 60_000;

/** The OS keychain refused or failed an access, or the vault could not be used. */
export class KeystoreUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('The credential store is unavailable.', options);
    this.name = 'KeystoreUnavailableError';
  }
}

/** A malformed secret name or value. Checked at runtime because IPC params are only cast. */
export class KeystoreInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeystoreInputError';
  }
}

/** A keystore operation from a worker thread, unvalidated until it reaches the vault's owner. */
export interface KeystoreCall {
  readonly op: 'get' | 'set' | 'delete' | 'list';
  readonly name?: unknown;
  readonly value?: unknown;
}

/** The part of keytar the vault uses; tests replace it below the vault. */
export interface KeychainBackend {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, value: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

interface Vault {
  readonly secrets: Map<string, string>;
  readonly retired: Set<string>;
}

type LegacyRun =
  | { readonly state: 'reading'; readonly result: Promise<string | null> }
  /** The copy failed: served from memory for this run and copied on the next. */
  | { readonly state: 'cached'; readonly value: string }
  | { readonly state: 'absent' }
  | { readonly state: 'failed'; readonly cause: unknown; readonly at: number };

let backend: KeychainBackend = keytar;
let vault: Vault | undefined;
let loading: Promise<Vault> | undefined;
let loadFailure: { readonly cause: unknown; readonly at: number } | undefined;
let mutations: Promise<unknown> = Promise.resolve();
/** For the run only: what is known about a name held in neither the vault nor the retired list. */
const legacyRuns = new Map<string, LegacyRun>();
/** Set on a worker thread: every call goes to the vault's owner and never to the Keychain. */
let forward: ((call: KeystoreCall) => Promise<unknown>) | undefined;

/** Sends this thread's keystore calls to the vault's owner, or back to this thread's own vault with undefined. */
export function forwardKeystoreCalls(to: ((call: KeystoreCall) => Promise<unknown>) | undefined): void {
  forward = to;
}

/** A refusal of the request stays what it is; anything else on the way to the owner means unavailable. */
async function forwarded<T>(to: (call: KeystoreCall) => Promise<unknown>, call: KeystoreCall): Promise<T> {
  try {
    return await to(call) as T;
  } catch (cause) {
    if ((cause as Error).name === 'KeystoreInputError') throw new KeystoreInputError((cause as Error).message);
    throw new KeystoreUnavailableError({ cause });
  }
}

/** Test-only: replace the Keychain below the vault and forget everything held for the previous one. */
export function setKeychainBackendForTest(replacement: KeychainBackend | undefined): void {
  backend = replacement ?? keytar;
  vault = undefined;
  loading = undefined;
  loadFailure = undefined;
  mutations = Promise.resolve();
  legacyRuns.clear();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The whole-payload check, for a stored item and for every candidate before it is written. */
function parseVault(raw: string): Vault {
  let payload: unknown;
  // A JSON syntax error quotes its input, so it must not become a cause.
  try { payload = JSON.parse(raw); } catch { throw new Error('The vault item is not valid JSON.'); }
  if (!isPlainObject(payload) || payload['version'] !== 1) throw new Error('The vault item has an unknown version.');
  const stored = payload['secrets'], names = payload['retired'];
  if (!isPlainObject(stored) || !Array.isArray(names)) throw new Error('The vault item is incomplete.');
  const secrets = new Map<string, string>();
  for (const [name, value] of Object.entries(stored)) {
    if (typeof value !== 'string') throw new Error('The vault item holds a value that is not a string.');
    secrets.set(name, value);
  }
  const retired = new Set<string>();
  for (const name of names as unknown[]) {
    if (typeof name !== 'string' || retired.has(name) || secrets.has(name)) throw new Error('The vault item has an invalid retired list.');
    retired.add(name);
  }
  return { secrets, retired };
}

function serializeVault(content: Vault): string {
  return JSON.stringify({ version: 1, secrets: Object.fromEntries(content.secrets), retired: [...content.retired] });
}

async function readVault(): Promise<Vault> {
  try {
    const raw = await backend.getPassword(VAULT_SERVICE, VAULT_ACCOUNT);
    vault = raw === null ? { secrets: new Map(), retired: new Set() } : parseVault(raw);
    return vault;
  } catch (cause) {
    loadFailure = { cause, at: Date.now() };
    throw new KeystoreUnavailableError({ cause });
  }
}

/** Single-flight: while a dialog is open every caller waits on the one load. */
function loadVault(): Promise<Vault> {
  if (vault) return Promise.resolve(vault);
  if (loading) return loading;
  if (loadFailure) {
    if (Date.now() - loadFailure.at < LOAD_FAILURE_MEMORY_MS) return Promise.reject(new KeystoreUnavailableError({ cause: loadFailure.cause }));
    loadFailure = undefined;
  }
  loading = readVault().finally(() => { loading = undefined; });
  return loading;
}

/** One queue for every change: the Keychain item is written first and memory only after that succeeds. */
function mutate(change: (draft: Vault) => boolean | void): Promise<void> {
  const run = mutations.then(async () => {
    const current = await loadVault();
    const draft: Vault = { secrets: new Map(current.secrets), retired: new Set(current.retired) };
    if (change(draft) === false) return;
    const candidate = serializeVault(draft);
    try {
      parseVault(candidate);
      await backend.setPassword(VAULT_SERVICE, VAULT_ACCOUNT, candidate);
    } catch (cause) {
      throw new KeystoreUnavailableError({ cause });
    }
    vault = draft;
  });
  mutations = run.catch(() => undefined);
  return run;
}

function assertName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.length === 0) throw new KeystoreInputError('A secret name must be a non-empty string.');
}

/** A found legacy value enters the vault unless a save or delete got there first. */
async function readLegacy(name: string, settle: (next: LegacyRun | undefined) => void): Promise<string | null> {
  let value: string | null;
  try {
    value = await backend.getPassword(LEGACY_SERVICE, name);
  } catch (cause) {
    settle({ state: 'failed', cause, at: Date.now() });
    throw new KeystoreUnavailableError({ cause });
  }
  if (value === null) {
    settle({ state: 'absent' });
    return (await loadVault()).secrets.get(name) ?? null;
  }
  const found = value;
  try {
    await mutate(draft => {
      if (draft.secrets.has(name) || draft.retired.has(name)) return false;
      draft.secrets.set(name, found);
      return true;
    });
    settle(undefined);
  } catch {
    // Migration never deletes the legacy item, so the next run can copy it again.
    settle({ state: 'cached', value: found });
    return found;
  }
  const current = await loadVault();
  return current.retired.has(name) ? null : current.secrets.get(name) ?? found;
}

/** One lookup per name at a time, and at most one successful legacy read per run. */
function legacyLookup(name: string): Promise<string | null> {
  const known = legacyRuns.get(name);
  switch (known?.state) {
    case 'reading': return known.result;
    case 'cached': return Promise.resolve(known.value);
    case 'absent': return Promise.resolve(null);
    case 'failed':
      if (Date.now() - known.at < LOAD_FAILURE_MEMORY_MS) return Promise.reject(new KeystoreUnavailableError({ cause: known.cause }));
      legacyRuns.delete(name);
  }
  let reading: LegacyRun | undefined;
  // A save or delete clears the entry, so a read that outlives it records nothing.
  const settle = (next: LegacyRun | undefined): void => {
    if (legacyRuns.get(name) !== reading) return;
    if (next === undefined) legacyRuns.delete(name); else legacyRuns.set(name, next);
  };
  // Starts on a later tick, so `reading` is recorded before the read can settle.
  const result = Promise.resolve().then(() => readLegacy(name, settle));
  reading = { state: 'reading', result };
  legacyRuns.set(name, reading);
  return result;
}

async function ownerGetKey(name: unknown): Promise<string | null> {
  assertName(name);
  const current = await loadVault();
  const held = current.secrets.get(name);
  if (held !== undefined) return held;
  return current.retired.has(name) ? null : legacyLookup(name);
}

async function ownerSetKey(name: unknown, value: unknown): Promise<void> {
  assertName(name);
  if (typeof value !== 'string') throw new KeystoreInputError('A secret value must be a string.');
  await mutate(draft => {
    draft.secrets.set(name, value);
    draft.retired.delete(name);
  });
  legacyRuns.delete(name);
}

async function ownerDeleteKey(name: unknown): Promise<void> {
  assertName(name);
  await mutate(draft => {
    draft.secrets.delete(name);
    draft.retired.add(name);
  });
  legacyRuns.delete(name);
  try {
    await backend.deletePassword(LEGACY_SERVICE, name);
  } catch {
    log.warn({ name }, 'the legacy keychain item could not be deleted');
  }
}

async function ownerListKeys(): Promise<string[]> {
  return [...(await loadVault()).secrets.keys()];
}

/** The vault's owner answering a worker: everything is checked here, because nothing was checked there. */
export function serveKeystoreCall(call: unknown): Promise<unknown> {
  const request = (typeof call === 'object' && call !== null ? call : {}) as KeystoreCall;
  switch (request.op) {
    case 'get': return ownerGetKey(request.name);
    case 'set': return ownerSetKey(request.name, request.value);
    case 'delete': return ownerDeleteKey(request.name);
    case 'list': return ownerListKeys();
    default: return Promise.reject(new KeystoreInputError('A keystore request must name a known operation.'));
  }
}

/** Retrieve a secret, or null when it does not exist. A secret not yet in the vault is copied in on first use. */
export function getKey(name: string): Promise<string | null> {
  return forward ? forwarded(forward, { op: 'get', name }) : ownerGetKey(name);
}

/** Store a secret. An empty string is a valid value. */
export function setKey(name: string, value: string): Promise<void> {
  return forward ? forwarded(forward, { op: 'set', name, value }) : ownerSetKey(name, value);
}

/** Remove a secret and record it as retired, so a leftover legacy item cannot bring it back. */
export function deleteKey(name: string): Promise<void> {
  return forward ? forwarded(forward, { op: 'delete', name }) : ownerDeleteKey(name);
}

/** The names held in the vault; never their values. */
export function listKeys(): Promise<string[]> {
  return forward ? forwarded(forward, { op: 'list' }) : ownerListKeys();
}

/**
 * Mask a key value for display.
 *
 * Proportional reveal: show ceil(length / 16) chars, min 2, max 8.
 * Examples:
 *   length  8 → show 2: "sk******"
 *   length 32 → show 2: "sk******"
 *   length 64 → show 4: "sk-a****"
 *   length 128 → show 8: "sk-ant-a****"
 */
export function maskKey(value: string): string {
  if (value.length === 0) return '****';
  const reveal = Math.min(8, Math.max(2, Math.ceil(value.length / 16)));
  return value.slice(0, reveal) + '****';
}
