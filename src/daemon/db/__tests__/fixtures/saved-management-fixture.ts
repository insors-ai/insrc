import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { PATHS } from '../../../../shared/paths.js';
import { connectionsPath } from '../../config.js';
import { ManagedRegistry, PreparationJournal } from '../../managed-store.js';
import { SavedTicketAuthority } from '../../management-tickets.js';
import { CredentialGenerations } from '../../secrets.js';
import { DriverPool } from '../../pool.js';
import { SavedConnectionManagement, installSavedManagement } from '../../management.js';
import type { ConnectionConfig, Driver } from '../../../../shared/db-driver.js';
import type { MutationRequest, MutationOutcome } from '../../../../shared/connection-management.js';
import '../../drivers/index.js';
export function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>(r => {
		resolve = r;
	});
	return { promise, resolve };
}
export async function environment() {
	const directory = await realpath(await mkdtemp(join(tmpdir(), 'cm-service-')));
	const original = PATHS.insrc;
	Object.defineProperty(PATHS, 'insrc', { value: join(directory, 'insrc'), configurable: true });
	const fixtures: Awaited<ReturnType<typeof rootFixture>>[] = [];
	async function rootFixture(name: string, seed?: ConnectionConfig) {
		const root = join(directory, name);
		await mkdir(root);
		const path = connectionsPath(root);
		await mkdir(dirname(path), { recursive: true });
		const registryId = randomUUID();
		await writeFile(path, JSON.stringify({ connections: seed ? [seed] : [], retainedDocument: { exact: true }, _management: { version: 2, registryId, generation: randomUUID(), revisions: seed ? { [seed.id]: randomUUID() } : {}, receipts: {} } }, null, 2) + '\n', { mode: 0o400 });
		const counts = { gets: 0, credentialGets: 0, sets: 0, deletes: 0, stages: 0, writes: 0 };
		const hooks: {
			stage?: (() => Promise<void>) | undefined;
			factory?: ((config: ConnectionConfig) => Promise<Driver>) | undefined;
			writer?: ((stage: string) => Promise<void>) | undefined;
			activate?: ((id: string, revision: string) => Promise<void>) | undefined;
		} = {};
		const values = new Map<string, string>();
		const keystore = { getKey: async (ref: string) => {
				counts.gets++;
				if (!ref.startsWith('db-management:'))
					counts.credentialGets++;
				return values.get(ref) ?? null;
			}, setKey: async (ref: string, value: string) => {
				counts.sets++;
				values.set(ref, value);
			}, deleteKey: async (ref: string) => {
				counts.deletes++;
				values.delete(ref);
			} };
		const clock = { value: Date.now() };
		let tickets = await SavedTicketAuthority.open({ root, registryId, adopted: false, keystore, now: () => clock.value, isRegistered: async (candidate) => candidate === root });
		let store = await ManagedRegistry.open(path, { ownsRoot: async () => true, boundary: async (stage) => {
				if (stage === 'temp-open')
					counts.writes++;
				await hooks.writer?.(stage);
			} });
		let journal = await PreparationJournal.open(path, registryId);
		let generations = new CredentialGenerations(journal, 'a'.repeat(32), { keystore, current: () => store.inspect(), boundary: async (stage) => {
				if (stage === 'before-keychain-stage') {
					counts.stages++;
					await hooks.stage?.();
				}
			} });
		let pool = new DriverPool(root, { factory: () => async (config) => hooks.factory ? hooks.factory(config) : ({ id: config.id, kind: config.kind, family: 'rdbms', close: async () => {
				}, describe: async () => ({ columns: [] }) } as unknown as Driver) });
		await pool.reload();
		const context = { connectionIdentity: 'fixture-client', access: { lookupRoot: root, managementRepoRoot: root, daemonEpoch: 'fixture' } };
		let service = await SavedConnectionManagement.create({ root, store, tickets, generations, pool, enabled: async () => true, isRegistered: async (candidate) => candidate === root, activate: async (id, revision) => {
				await hooks.activate?.(id, revision);
			}, readSecret: keystore.getKey });
		let uninstall = installSavedManagement(root, service);
		const reset = () => {
			for (const key of Object.keys(counts) as (keyof typeof counts)[])
				counts[key] = 0;
		};
		const request = async (id: string, mode: 'create' | 'update' = 'create', revision?: string): Promise<MutationRequest> => {
			const key = { repoRoot: root, scope: 'saved' as const, id };
			const ticket = await service.ticket(context, key, mode);
			return { ticket, operationId: ticket.operationId, key, mode, ...(revision ? { expectedRevision: revision } : {}), publicPatch: mode === 'create' ? { kind: 'postgres', endpoint: 'postgres://host/db' } : { label: 'Changed' }, credentials: { 'url.username': { action: 'replace', value: 'fixture-user' }, 'url.password': { action: 'replace', value: 'replacement-secret-canary' } } };
		};
		const restart = async () => {
			uninstall();
			await pool.closeAll();
			await store.close();
			tickets = await SavedTicketAuthority.open({ root, registryId, adopted: true, keystore, now: () => clock.value, isRegistered: async (candidate) => candidate === root });
			store = await ManagedRegistry.open(path, { ownsRoot: async () => true, boundary: async (stage) => {
					if (stage === 'temp-open')
						counts.writes++;
					await hooks.writer?.(stage);
				} });
			journal = await PreparationJournal.open(path, registryId);
			generations = new CredentialGenerations(journal, 'a'.repeat(32), { keystore, current: () => store.inspect(), boundary: async (stage) => {
					if (stage === 'before-keychain-stage') {
						counts.stages++;
						await hooks.stage?.();
					}
				} });
			pool = new DriverPool(root, { factory: () => async (config) => hooks.factory ? hooks.factory(config) : ({ id: config.id, kind: config.kind, family: 'rdbms', close: async () => {
					}, describe: async () => ({ columns: [] }) } as unknown as Driver) });
			await pool.reload();
			service = await SavedConnectionManagement.create({ root, store, tickets, generations, pool, enabled: async () => true, isRegistered: async (candidate) => candidate === root, activate: async (id, revision) => {
					await hooks.activate?.(id, revision);
				}, readSecret: keystore.getKey });
			uninstall = installSavedManagement(root, service);
		};
		const f = { root, path, get store() {
				return store;
			}, get journal() {
				return journal;
			}, get generations() {
				return generations;
			}, get pool() {
				return pool;
			}, get tickets() {
				return tickets;
			}, get service() {
				return service;
			}, context, values, keystore, counts, hooks, clock, reset, request, restart, close: async () => {
				uninstall();
				await pool.closeAll();
				await store.close();
			} };
		fixtures.push(f);
		return f;
	}
	return { directory, rootFixture, cleanup: async () => {
			for (const f of fixtures)
				await f.close();
			Object.defineProperty(PATHS, 'insrc', { value: original, configurable: true });
			await rm(directory, { recursive: true, force: true });
		} };
}
export function committed(outcome: MutationOutcome) {
	assert.equal(outcome.status, 'committed', JSON.stringify(outcome));
	if (outcome.status !== 'committed')
		throw Error('expected commit');
	return outcome.value;
}
