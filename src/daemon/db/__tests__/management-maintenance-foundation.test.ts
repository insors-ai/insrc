import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, chmod, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ManagementOwnerLease } from '../management-owner-lease.js';
import type { ProcessObservation } from '../management-owner-lease.js';
import { privateDirectory, writeProtected, readProtected } from '../management-files.js';
import { proveWriterFence, proveProtectedRegistry, assertUnmanagedWrite } from '../managed-store.js';
import { verifyConnectionManagementRelease, CONNECTION_TEST_GATE_FILES, CONNECTION_FOUNDATION_GATE_FILES } from '../management-enablement.js';
async function fixture(use: (directory: string) => Promise<void>) {
	const dir = await mkdtemp(join(tmpdir(), 'cm-maintenance-'));
	try {
		await privateDirectory(dir);
		await use(dir);
	}
	finally {
		await rm(dir, { recursive: true, force: true });
	}
}
test('maintenance metadata is protected and partial adoption blocks legacy writers', async () => fixture(async (dir) => {
	const path = join(dir, 'state.json');
	await writeProtected(path, 'first', true);
	assert.equal((await readProtected(path)).bytes.toString(), 'first');
	await assert.rejects(writeProtected(path, 'overwrite', true));
	await writeProtected(path, 'replacement');
	assert.equal(await readFile(path, 'utf8'), 'replacement');
	await chmod(path, 0o600);
	await assert.rejects(readProtected(path));
	await privateDirectory(join(dir, 'connection-management'));
	await assert.rejects(assertUnmanagedWrite(join(dir, 'db-connections.json'), { connections: [] }));
}));
test('exclusive owner lease rejects live or unknown owners and reclaims only dead or reused identities', async () => fixture(async (dir) => {
	let pid = 10;
	const identities = new Map([[10, 'a'.repeat(64)], [20, 'b'.repeat(64)]]), alive = new Set([10, 20]);
	const processes: ProcessObservation = { currentPid: () => pid, identity: p => identities.get(p), alive: p => alive.has(p) };
	const path = join(dir, 'owner.json'), first = await ManagementOwnerLease.acquire(path, dir, processes);
	pid = 20;
	await assert.rejects(ManagementOwnerLease.acquire(path, dir, processes));
	identities.delete(10);
	await assert.rejects(ManagementOwnerLease.acquire(path, dir, processes));
	alive.delete(10);
	const second = await ManagementOwnerLease.acquire(path, dir, processes);
	assert.equal(await first.current(), false);
	assert.equal(await second.current(), true);
	await second.close();
}));
test('target filesystem denies legacy subprocess writes and isolates detached descriptors', async () => fixture(async (dir) => {
	await proveWriterFence(dir);
	const path = join(dir, 'registry.json');
	await writeProtected(path, JSON.stringify({ connections: [] }), true);
	await proveProtectedRegistry(path);
	assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { connections: [] });
}));
test('release evidence remains disabled until the completed build supplies verified gates', async () => fixture(async (dir) => {
	const path = join(dir, 'disabled.json');
	await writeFile(path, JSON.stringify({ version: 2, ready: false }));
	assert.equal((await verifyConnectionManagementRelease(pathToFileURL(path))).ready, false);
	await writeFile(path, JSON.stringify({ version: 2, ready: true, sourceFiles: {}, compiledFiles: {}, inventoryDigest: 'a'.repeat(64), testReportDigest: 'a'.repeat(64), scopes: ['sc1', 'sc2', 'sc3', 'sc4', 'sc8'] }));
	assert.equal((await verifyConnectionManagementRelease(pathToFileURL(path))).ready, false);
	const { createHash } = await import('node:crypto');
	const names = ['management-enablement', 'management-files', 'management-owner-lease', 'management-state', 'management-adoption', 'management-startup', 'managed-store', 'management-tickets', 'management', 'driver-profiles'];
	const sourceFiles: Record<string, string> = {};
	for (const name of names)
		sourceFiles['daemon/db/' + name + '.ts'] = createHash('sha256').update(await readFile(new URL('../' + name + '.ts', import.meta.url))).digest('hex');
	for (const name of [...CONNECTION_FOUNDATION_GATE_FILES,...CONNECTION_TEST_GATE_FILES]) sourceFiles[name+'.ts']=createHash('sha256').update(await readFile(new URL('../../../'+name+'.ts',import.meta.url))).digest('hex');
	const compiledFiles: Record<string, string> = {};
	for (const name of Object.keys(sourceFiles)) { const compiled = name.replace(/\.ts$/, '.js'); compiledFiles[compiled] = createHash('sha256').update(await readFile(new URL('../../../../out/' + compiled, import.meta.url))).digest('hex'); }
	const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
	const inventory = JSON.stringify({ productionFiles: sourceFiles, files: Object.fromEntries(Object.entries(sourceFiles).map(([path, sourceDigest]) => ['src/' + path, { sourceDigest, classification: 'verification-fixture', rationale: 'Private positive verification fixture; no product release claim.' }])) });
	const report = JSON.stringify({ releaseReady: true, recordedAt: 'first' });
	await writeFile(join(dir, 'inventory.json'), inventory); await writeFile(join(dir, 'report.json'), report);
	const valid = { version: 2, ready: true, sourceFiles, compiledFiles, inventoryFile: 'inventory.json', testReportFile: 'report.json', inventoryDigest: hash(inventory), testReportDigest: hash(report), scopes: ['sc1', 'sc2', 'sc3', 'sc4', 'sc8'] };
	await writeFile(path, JSON.stringify(valid));
	assert.equal((await verifyConnectionManagementRelease(pathToFileURL(path))).ready, true);
	await writeFile(path,JSON.stringify({...valid,scopes:['sc1','sc2','sc3','sc8']}));
	assert.equal((await verifyConnectionManagementRelease(pathToFileURL(path))).ready,false,'S001-only evidence cannot enable testing');
	await writeFile(path,JSON.stringify(valid));
	await writeFile(path,JSON.stringify({...valid,sourceFiles:Object.fromEntries(CONNECTION_TEST_GATE_FILES.map(name=>[name+'.ts',sourceFiles[name+'.ts']]))}));
	assert.equal((await verifyConnectionManagementRelease(pathToFileURL(path))).ready,false,'S002-only hashes cannot enable missing foundation evidence');
	await writeFile(path,JSON.stringify(valid));
	const initial = (await verifyConnectionManagementRelease(pathToFileURL(path))).digest;
	const updatedReport = JSON.stringify({ releaseReady: true, recordedAt: 'later' }); await writeFile(join(dir, 'report.json'), updatedReport);
	await writeFile(path, JSON.stringify({ ...valid, testReportDigest: hash(updatedReport) }));
	assert.equal((await verifyConnectionManagementRelease(pathToFileURL(path))).digest, initial, 'report timestamps do not change running code identity');
	await writeFile(join(dir, 'report.json'), report);
	await writeFile(path, JSON.stringify({ ...valid, sourceFiles: { ...sourceFiles, 'daemon/db/management.ts': '0'.repeat(64) } }));
	assert.equal((await verifyConnectionManagementRelease(pathToFileURL(path))).ready, false);
	await writeFile(path, JSON.stringify({ ...valid, scopes: ['sc1', 'sc2', 'sc3'] }));
	assert.equal((await verifyConnectionManagementRelease(pathToFileURL(path))).ready, false);
}));
test('signed restart checkpoint accepts only its exact prepared inode and rejects drift or lost signing keys', async () => fixture(async (dir) => {
	const { SavedTicketAuthority } = await import('../management-tickets.js');
	const { ManagementStateFile, anchorsMatch } = await import('../management-state.js');
	const { registryAnchor, readRegistrySnapshot } = await import('../managed-store.js');
	const { randomUUID } = await import('node:crypto');
	const { realpath, lstat, rename } = await import('node:fs/promises');
	const root = await realpath(dir), registryId = randomUUID(), generation = randomUUID(), keys = new Map<string, string>();
	const keystore = { getKey: async (ref: string) => keys.get(ref) ?? null, setKey: async (ref: string, value: string) => {
			keys.set(ref, value);
		} };
	const tickets = await SavedTicketAuthority.open({ root, registryId, adopted: false, keystore, isRegistered: async (r) => r === root });
	const path = join(dir, 'registry.json');
	await writeProtected(path, JSON.stringify({ connections: [], _management: { version: 2, registryId, generation, revisions: {}, receipts: {} } }), true);
	const snapshot = await readRegistrySnapshot(path), parent = await lstat(dir), directory = join(dir, 'connection-management');
	await privateDirectory(directory);
	const state = await ManagementStateFile.create(directory, { version: 2, root, registryId, phase: 'managed', initialGeneration: generation, parent: { inode: parent.ino, device: parent.dev }, baseline: { name: `snapshot-${randomUUID()}.json`, digest: snapshot.digest, missing: false, mode: 0o400 }, oldDaemon: { source: 'safe-stop-control', pid: 123, processIdentity: 'a'.repeat(64), stoppedAt: new Date().toISOString() }, rollback: [], releaseDigest: 'a'.repeat(64), committed: registryAnchor(snapshot) }, tickets);
	const name = `.db-connections-${randomUUID()}.tmp`, temp = join(dir, name);
	await writeProtected(temp, JSON.stringify({ ...snapshot.file, _management: { ...snapshot.file._management, generation: randomUUID() } }), true);
	const candidate = await readRegistrySnapshot(temp);
	await state.prepare(registryAnchor(snapshot), registryAnchor(candidate), name);
	await rename(temp, path);
	const reopened = await ManagementStateFile.open(directory, root, tickets);
	await reopened.reconcile(await readRegistrySnapshot(path));
	assert(anchorsMatch((await reopened.current()).committed, registryAnchor(candidate)));
	await writeProtected(path, JSON.stringify({ connections: [] }));
	await assert.rejects(reopened.reconcile(await readRegistrySnapshot(path)));
	keys.clear();
	await assert.rejects(ManagementStateFile.open(directory, root, tickets));
}));
