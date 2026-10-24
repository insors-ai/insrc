/** Full-service crash fixture. All credentials are synthetic and the vault is a disposable JSON file. */
import { readFile, writeFile } from 'node:fs/promises';
import { PATHS } from '../../../../shared/paths.js';
import { connectionsPath } from '../../config.js';
import { ManagedRegistry, PreparationJournal } from '../../managed-store.js';
import { SavedTicketAuthority } from '../../management-tickets.js';
import { CredentialGenerations } from '../../secrets.js';
import { DriverPool } from '../../pool.js';
import { SavedConnectionManagement } from '../../management.js';
import type { Driver } from '../../../../shared/db-driver.js';
import '../../drivers/index.js';
const [insrc, root, vaultPath, requestPath] = process.argv.slice(2) as [
	string,
	string,
	string,
	string
];
Object.defineProperty(PATHS, 'insrc', { value: insrc, configurable: true });
const values = async (): Promise<Record<string, string>> => JSON.parse(await readFile(vaultPath, 'utf8'));
const keystore = { getKey: async (ref: string) => (await values())[ref] ?? null, setKey: async (ref: string, value: string) => {
		const data = await values();
		data[ref] = value;
		await writeFile(vaultPath, JSON.stringify(data));
	}, deleteKey: async (ref: string) => {
		const data = await values();
		delete data[ref];
		await writeFile(vaultPath, JSON.stringify(data));
	} };
const path = connectionsPath(root);
const store = await ManagedRegistry.open(path, { ownsRoot: async () => true });
const registryId = store.snapshot.file._management!.registryId;
const tickets = await SavedTicketAuthority.open({ root, registryId, adopted: true, keystore, isRegistered: async (candidate) => candidate === root });
const journal = await PreparationJournal.open(path, registryId);
const generations = new CredentialGenerations(journal, 'a'.repeat(32), { keystore, current: () => store.inspect() });
const pool = new DriverPool(root, { factory: () => async (config) => ({ id: config.id, kind: config.kind, family: 'rdbms', close: async () => {
		} } as unknown as Driver) });
await pool.reload();
const service = await SavedConnectionManagement.create({ root, store, tickets, generations, pool, enabled: async () => true, isRegistered: async (candidate) => candidate === root, activate: async () => {
	}, readSecret: keystore.getKey });
const request: unknown = JSON.parse(await readFile(requestPath, 'utf8'));
const result = await service.mutate({ connectionIdentity: 'fixture-client', access: { lookupRoot: root, managementRepoRoot: root, daemonEpoch: 'fixture' } }, request);
if (result.status !== 'committed')
	process.exit(72);
// The caller never receives the committed response.
process.exit(74);
