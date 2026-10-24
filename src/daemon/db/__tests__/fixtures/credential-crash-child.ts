/** Isolated subprocess fixture: simulated keychain values live only in a disposable test root. */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ManagedRegistry, PreparationJournal, readRegistrySnapshot } from '../../managed-store.js';
import { CredentialGenerations } from '../../secrets.js';
import { materializeDraft } from '../../driver-profiles.js';
import '../../drivers/index.js';
const [root, failAt] = process.argv.slice(2) as [
	string,
	string
];
const path = join(root, 'db-connections.json');
const vaultPath = join(root, 'fake-keychain.json');
const vault = async (): Promise<Record<string, string>> => JSON.parse(await readFile(vaultPath, 'utf8'));
const keystore = {
	getKey: async (ref: string) => (await vault())[ref] ?? null,
	setKey: async (ref: string, value: string) => {
		const data = await vault();
		data[ref] = value;
		await writeFile(vaultPath, JSON.stringify(data), { mode: 0o600 });
	},
	deleteKey: async (ref: string) => {
		const data = await vault();
		delete data[ref];
		await writeFile(vaultPath, JSON.stringify(data), { mode: 0o600 });
	},
};
const boundary = async (stage: string): Promise<void> => {
	if (failAt === stage)
		process.exit(73);
};
const store = await ManagedRegistry.open(path, { ownsRoot: async () => true, boundary });
const snapshot = store.snapshot;
const journal = await PreparationJournal.open(path, snapshot.file._management!.registryId, boundary);
const generations = new CredentialGenerations(journal, 'a'.repeat(32), { keystore, current: () => readRegistrySnapshot(path), boundary });
const previous = snapshot.file.connections[0]!;
const operationId = randomUUID();
const draft = await materializeDraft({ key: { repoRoot: root, scope: 'saved', id: previous.id }, mode: 'update', current: { config: previous, revision: snapshot.file._management!.revisions[previous.id]! }, expectedRevision: snapshot.file._management!.revisions[previous.id]!, publicPatch: {}, credentials: { 'url.password': { action: 'replace', value: 'replacement-secret-canary/@%' } }, readSecret: keystore.getKey });
const staged = await generations.stage({ operationId, effective: draft.config, previous, actions: draft.credentialActions });
const revision = randomUUID();
const ticket = { operationId, lookupRoot: root, scope: 'saved' as const, connectionId: previous.id, mode: 'update' as const, issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), signature: 'fixture-ticket' };
const outcome = { operationId, revision, registration: 'persisted' as const, activation: 'pending' as const, credentialCleanup: 'pending' as const };
await store.commit(snapshot, { ...snapshot.file, connections: [staged.config], _management: { ...snapshot.file._management!, generation: randomUUID(), revisions: { [previous.id]: revision }, receipts: { [operationId]: { ticket, requestMac: 'fixture-keyed-mac', outcome, cleanupRefs: staged.cleanupRefs } } } });
await generations.recover();
await store.close();
