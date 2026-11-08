/**
 * Secure key storage via the OS keychain (keytar).
 *
 * Every secret lives in one Keychain item, the vault, so a process needs one Keychain access however
 * many secrets it uses. The item sits under its own service, so no secret name can address it. Its value
 * is JSON: `{ version: 1, secrets: { name: value }, retired: [names] }`.
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
  constructor(what: 'name' | 'value') {
    super(what === 'name' ? 'A secret name must be a non-empty string.' : 'A secret value must be a string.');
    this.name = 'KeystoreInputError';
  }
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

let backend: KeychainBackend = keytar;
let vault: Vault | undefined;
let loading: Promise<Vault> | undefined;
let loadFailure: { readonly cause: unknown; readonly at: number } | undefined;
let mutations: Promise<unknown> = Promise.resolve();

/** Test-only: replace the Keychain below the vault and forget everything held for the previous one. */
export function setKeychainBackendForTest(replacement: KeychainBackend | undefined): void {
  backend = replacement ?? keytar;
  vault = undefined;
  loading = undefined;
  loadFailure = undefined;
  mutations = Promise.resolve();
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
function mutate(change: (draft: Vault) => void): Promise<void> {
  const run = mutations.then(async () => {
    const current = await loadVault();
    const draft: Vault = { secrets: new Map(current.secrets), retired: new Set(current.retired) };
    change(draft);
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
  if (typeof name !== 'string' || name.length === 0) throw new KeystoreInputError('name');
}

/** Retrieve a secret, or null when it does not exist. */
export async function getKey(name: string): Promise<string | null> {
  assertName(name);
  return (await loadVault()).secrets.get(name) ?? null;
}

/** Store a secret. An empty string is a valid value. */
export async function setKey(name: string, value: string): Promise<void> {
  assertName(name);
  if (typeof value !== 'string') throw new KeystoreInputError('value');
  await mutate(draft => {
    draft.secrets.set(name, value);
    draft.retired.delete(name);
  });
}

/** Remove a secret and record it as retired, so a leftover legacy item cannot bring it back. */
export async function deleteKey(name: string): Promise<void> {
  assertName(name);
  await mutate(draft => {
    draft.secrets.delete(name);
    draft.retired.add(name);
  });
  try {
    await backend.deletePassword(LEGACY_SERVICE, name);
  } catch {
    log.warn({ name }, 'the legacy keychain item could not be deleted');
  }
}

/** The names held in the vault; never their values. */
export async function listKeys(): Promise<string[]> {
  return [...(await loadVault()).secrets.keys()];
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
