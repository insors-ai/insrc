/**
 * Keychain integration for the data driver.
 *
 * Connection secrets (RDBMS passwords, AWS profiles, etc.) live in
 * the OS keychain under the existing `insrc` service and are
 * referenced from `db-connections.json` via a `${secret:<ref>}`
 * token inside the `url` field + a `secretRef` pointer.
 *
 * Ref naming convention: `db:<repoId>:<connId>`. The setup UX (phase
 * 2) owns ref minting; this module just resolves + manages them.
 */
import { getLogger } from '../../shared/logger.js';
import * as defaultKeystore from '../../shared/keystore.js';
import { createHash, randomUUID } from 'node:crypto';
import type { ConnectionConfig } from '../../shared/db-driver.js';
import type { CredentialPatch, PreparationRecord } from '../../shared/connection-management.js';
import { credentialValues, withCredentialValues } from './driver-profiles.js';
import type { CredentialValue } from './driver-profiles.js';
import { ManagedStoreError, PreparationJournal } from './managed-store.js';
import type { RegistrySnapshot } from './managed-store.js';
const log = getLogger('db-secrets');
const SECRET_TOKEN = /\$\{secret:([^}]+)\}/g;
// Indirection through a mutable reference so tests can swap in an
// in-memory fake -- ESM namespace imports are non-configurable, so
// `mock.method` against `keystore` doesn't work here.
export interface KeystoreLike {
	getKey(name: string): Promise<string | null>;
	setKey(name: string, value: string): Promise<void>;
	deleteKey(name: string): Promise<void>;
}
let keystore: KeystoreLike = defaultKeystore;
/** Daemon-only port; keeps test stores isolated from the OS keychain. */
export const credentialKeystore: KeystoreLike = {
	getKey: ref => keystore.getKey(ref),
	setKey: (ref, value) => keystore.setKey(ref, value),
	deleteKey: ref => keystore.deleteKey(ref),
};
export function _setKeystoreForTests(impl: KeystoreLike): KeystoreLike {
	const previous = keystore;
	keystore = impl;
	return previous;
}
export function makeSecretRef(repoId: string, connId: string): string {
	return `db:${repoId}:${connId}`;
}
/**
 * Replace every `${secret:<ref>}` token in `value` with its keychain
 * value. Missing refs throw -- callers are responsible for catching
 * and surfacing a user-actionable error (eg. "re-enter password via
 * insrc.editDbConnection").
 */
export async function resolveSecrets(value: string): Promise<string> {
	const tokens = Array.from(value.matchAll(SECRET_TOKEN));
	const encoded = Array.from(value.matchAll(/(?:%24|\$)%7Bsecret%3A(?:%[0-9a-f]{2}|[a-z0-9_~.!*'()-])+%7D/gi));
	let out = value;
	for (const match of tokens) {
		const ref = match[1];
		if (ref === undefined) {
			continue;
		}
		const secret = await keystore.getKey(ref);
		if (secret === null) {
			throw new Error(`data-driver: missing keychain secret for ref '${ref}'`);
		}
		out = out.replace(match[0], secret);
	}
	for (const match of encoded) {
		const ref = decodeURIComponent(match[0]).slice(9, -1);
		const secret = await keystore.getKey(ref);
		if (secret === null) {
			throw new Error(`data-driver: missing keychain secret for ref '${ref}'`);
		}
		out = out.replace(match[0], encodeURIComponent(secret));
	}
	return out;
}
export function setSecret(ref: string, value: string): Promise<void> {
	log.debug({ ref }, 'setting data-driver secret');
	return keystore.setKey(ref, value);
}
export function deleteSecret(ref: string): Promise<void> {
	log.debug({ ref }, 'deleting data-driver secret');
	return keystore.deleteKey(ref);
}
/**
 * Given a raw connection URL, extract the password component (if any),
 * store it under `ref`, and return the URL with the password replaced
 * by `${secret:<ref>}`.
 *
 * Returns the original URL unchanged (and does not touch the keychain)
 * when no password is present.
 *
 * Used by the setup UX on save: the user enters a plaintext URL in
 * the palette prompt, we redact it before writing to
 * db-connections.json.
 */
export async function extractUrlPassword(rawUrl: string, ref: string): Promise<string> {
	let u: URL;
	try {
		u = new URL(rawUrl);
	}
	catch {
		// Not a URL (sqlite path, mongodb atlas SRV without scheme, ...)
		// -- nothing to redact.
		return rawUrl;
	}
	if (u.password === '') {
		return rawUrl;
	}
	const password = decodeURIComponent(u.password);
	await setSecret(ref, password);
	u.password = `\${secret:${ref}}`;
	// URL constructor re-encodes the `${...}` token -- undo that so it
	// round-trips cleanly through JSON + resolveSecrets. Two variants
	// observed: `$` may or may not be percent-encoded depending on Node
	// version, but `{`, `}`, and `:` always are inside userinfo.
	return u.toString()
		.replace(/(?:\$|%24)%7Bsecret%3A/, '${secret:')
		.replace(encodeURIComponent(ref) + '%7D', ref + '}');
}
/** Find references even in encoded userinfo or retained private fields. Never logs values. */
export function referencedSecrets(value: unknown): ReadonlySet<string> {
	const refs = new Set<string>();
	const visit = (item: unknown): void => {
		if (typeof item === 'string') {
			let text = item;
			for (let i = 0; i < 8; i++) {
				for (const match of text.matchAll(/\$\{secret:([^}]+)\}/g))
					if (match[1])
						refs.add(match[1]);
				const next = text.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
				if (next === text)
					break;
				text = next;
			}
		}
		else if (Array.isArray(item)) {
			for (const child of item)
				visit(child);
		}
		else if (item && typeof item === 'object') {
			for (const [key, child] of Object.entries(item)) {
				if (key === 'secretRef' && typeof child === 'string')
					refs.add(child);
				visit(child);
			}
		}
	};
	visit(value);
	return refs;
}
export type CredentialBoundary = 'prepared' | 'before-keychain-stage' | 'after-keychain-stage' | 'before-obsolete-cleanup' | 'after-obsolete-cleanup';
export interface GenerationPorts {
	readonly keystore: KeystoreLike;
	/** Must check canonical registry/owner fences. Never return an inferred empty document. */
	readonly current: () => Promise<RegistrySnapshot>;
	readonly boundary?: ((stage: CredentialBoundary) => Promise<void>) | undefined;
}
export interface StagedCredentials {
	readonly config: ConnectionConfig;
	readonly preparation: PreparationRecord;
	readonly cleanupRefs: readonly string[];
}
export interface CredentialStageInput {
	readonly operationId: string;
	readonly effective: ConnectionConfig;
	readonly previous?: ConnectionConfig | undefined;
	readonly actions: Readonly<Record<string, CredentialPatch>>;
}
export interface CredentialRecovery {
	readonly operationId: string;
	readonly committed: boolean;
	readonly cleanup: 'complete' | 'pending';
}
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Root-service-owned; generations are immutable and never replace a legacy fixed key. */
export class CredentialGenerations {
	readonly #prefix: string;
	constructor(readonly journal: PreparationJournal, readonly repoId: string, private readonly ports: GenerationPorts) {
		if (!/^[0-9a-f]{32}$/.test(repoId))
			throw new ManagedStoreError('recovery-required');
		this.#prefix = `db:v2:${repoId}:${journal.registryId}:`;
	}
	owns(ref: string, operationId?: string): boolean {
		if (!ref.startsWith(this.#prefix))
			return false;
		const suffix = ref.slice(this.#prefix.length).split(':');
		return suffix.length === 4 && /^[0-9a-f]{32}$/.test(suffix[0] ?? '') && UUID4.test(suffix[1] ?? '') && UUID4.test(suffix[2] ?? '') && /^(0|[1-9][0-9]{0,3})$/.test(suffix[3] ?? '') && (operationId === undefined || suffix[1] === operationId);
	}
	async assertReady(): Promise<void> {
		if ((await this.journal.pending()).length)
			throw new ManagedStoreError('recovery-required');
		await this.current();
	}
	private async current(): Promise<RegistrySnapshot> {
		const current = await this.ports.current();
		if (current.missing || current.mode !== 0o400 || current.file._management?.registryId !== this.journal.registryId)
			throw new ManagedStoreError('recovery-required');
		for (const ref of referencedSecrets(current.file.connections)) {
			let value: string | null;
			try {
				value = await this.ports.keystore.getKey(ref);
			}
			catch {
				throw new ManagedStoreError('recovery-required');
			}
			if (value === null)
				throw new ManagedStoreError('recovery-required');
		}
		return current;
	}
	async stage(input: CredentialStageInput): Promise<StagedCredentials> {
		try {
			return await this.stageSnapshot(structuredClone(input));
		}
		catch {
			throw new ManagedStoreError('recovery-required');
		}
	}
	private async stageSnapshot(input: CredentialStageInput): Promise<StagedCredentials> {
		if (!UUID4.test(input.operationId))
			throw new ManagedStoreError('recovery-required');
		await this.assertReady();
		const current = await this.current();
		const previous = input.previous ? credentialValues(input.previous) : {};
		const effective = credentialValues(input.effective);
		const output: Record<string, CredentialValue> = {};
		const staged: {
			ref: string;
			value: string;
		}[] = [];
		const connection = createHash('sha256').update(input.effective.id).digest('hex').slice(0, 32);
		const generation = randomUUID();
		const token = (value: string): string => {
			const ref = `${this.#prefix}${connection}:${input.operationId}:${generation}:${staged.length}`;
			staged.push({ ref, value });
			return '${secret:' + ref + '}';
		};
		const resolve = async (value: CredentialValue): Promise<CredentialValue> => {
			if (value === undefined)
				return undefined;
			const one = async (s: string): Promise<string> => {
				let result = s;
				for (const match of s.matchAll(/\$\{secret:([^}]+)\}/g)) {
					const ref = match[1]!;
					const secret = await this.ports.keystore.getKey(ref);
					if (secret === null)
						throw new ManagedStoreError('recovery-required');
					result = result.replace(match[0], secret);
				}
				return result;
			};
			if (typeof value === 'string')
				return one(value);
			const array: string[] = [];
			for (const item of value)
				array.push(await one(item));
			return array;
		};
		for (const [slot, value] of Object.entries(effective)) {
			const action = input.actions[slot]?.action ?? 'keep';
			if (action === 'keep' && input.previous && JSON.stringify(await resolve(previous[slot])) === JSON.stringify(value)) {
				output[slot] = previous[slot];
				continue;
			}
			const seal = (s: string): string => {
				if (s === '')
					return s;
				if (slot === 'options.endpoint' || slot === 'options.servers' || slot === 'options.hosts') {
					// Anonymous addresses are public fields; seal only credential-bearing addresses.
					if (!s.includes('@'))
						return s;
				}
				return token(s);
			};
			output[slot] = value === undefined ? undefined : typeof value === 'string' ? seal(value) : value.map(seal);
		}
		let config = withCredentialValues(input.effective, output);
		if (Object.hasOwn(output, 'url.password')) {
			const { secretRef: _old, ...withoutPointer } = config;
			void _old;
			const password = output['url.password'];
			const ref = typeof password === 'string' ? [...referencedSecrets(password)][0] : undefined;
			config = ref ? { ...withoutPointer, secretRef: ref } : withoutPointer;
		}
		const preparation: PreparationRecord = { operationId: input.operationId, registryId: this.journal.registryId, expectedGeneration: current.file._management!.generation, ownedStagedRefs: staged.map(s => s.ref), phase: 'prepared' };
		try {
			await this.journal.prepare(preparation);
			await this.ports.boundary?.('prepared');
			for (const item of staged) {
				// Canonical truth must remain the precommit generation before every immutable stage.
				const actual = await this.current();
				if (actual.digest !== current.digest || actual.inode !== current.inode)
					throw new ManagedStoreError('recovery-required');
				await this.ports.boundary?.('before-keychain-stage');
				if (await this.ports.keystore.getKey(item.ref) !== null)
					throw new ManagedStoreError('recovery-required');
				await this.ports.keystore.setKey(item.ref, item.value);
				await this.ports.boundary?.('after-keychain-stage');
			}
		}
		catch {
			throw new ManagedStoreError('recovery-required');
		}
		const live = referencedSecrets(config);
		const cleanupRefs = [...referencedSecrets(input.previous)].filter(ref => this.owns(ref) && !live.has(ref));
		return { config, preparation, cleanupRefs };
	}
	/** Canonical receipt is the sole commit marker. Referenced generations are never deleted. */
	async recover(): Promise<readonly CredentialRecovery[]> {
		const records = await this.journal.pending();
		const current = await this.current();
		const envelope = current.file._management!;
		const live = referencedSecrets(current.file.connections);
		const allStaged = new Set(records.flatMap(record => record.ownedStagedRefs));
		const results: CredentialRecovery[] = [];
		if (records.some(record => record.ownedStagedRefs.some(ref => !this.owns(ref, record.operationId))))
			throw new ManagedStoreError('recovery-required');
		for (const record of records) {
			if (record.ownedStagedRefs.some(ref => !this.owns(ref, record.operationId)))
				throw new ManagedStoreError('recovery-required');
			const receipt = envelope.receipts[record.operationId];
			const committed = receipt !== undefined;
			if (receipt && (receipt.ticket.operationId !== record.operationId || receipt.outcome.operationId !== record.operationId))
				throw new ManagedStoreError('recovery-required');
			if (!receipt && (envelope.generation !== record.expectedGeneration || record.ownedStagedRefs.some(ref => live.has(ref))))
				throw new ManagedStoreError('recovery-required');
			const obsolete = receipt?.cleanupRefs ?? [];
			if (obsolete.some(ref => !this.owns(ref)))
				throw new ManagedStoreError('recovery-required');
			const candidates = [...new Set([...record.ownedStagedRefs, ...obsolete])].filter(ref => !live.has(ref) && (!allStaged.has(ref) || record.ownedStagedRefs.includes(ref)));
			let pending = false;
			for (const ref of candidates) {
				try {
					// Recheck immediately before a destructive port; service root lease prevents other writers.
					const fresh = await this.current();
					if (fresh.digest !== current.digest || fresh.inode !== current.inode || referencedSecrets(fresh.file.connections).has(ref))
						throw new ManagedStoreError('recovery-required');
					await this.ports.boundary?.('before-obsolete-cleanup');
					await this.ports.keystore.deleteKey(ref);
					await this.ports.boundary?.('after-obsolete-cleanup');
				}
				catch {
					pending = true;
					break;
				}
			}
			if (!pending) {
				try {
					await this.journal.complete(record);
				}
				catch {
					pending = true;
				}
			}
			results.push({ operationId: record.operationId, committed, cleanup: pending ? 'pending' : 'complete' });
		}
		return results;
	}
}
