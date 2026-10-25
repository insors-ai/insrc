/** Opens only previously adopted roots. Startup never adopts or rotates missing keys. */
import { lstat, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { connectionsPath, repoIdOf } from './config.js';
import { readProtected } from './management-files.js';
import { ManagementOwnerLease } from './management-owner-lease.js';
import { ManagementStateFile, anchorsMatch } from './management-state.js';
import { ManagedRegistry, PreparationJournal, ManagedStoreError, readRegistrySnapshot, registryAnchor, managementStateDirectory } from './managed-store.js';
import { SavedTicketAuthority } from './management-tickets.js';
import { CredentialGenerations, credentialKeystore, referencedSecrets } from './secrets.js';
import type { KeystoreLike } from './secrets.js';
import { connectionManagementEnablement } from './management-enablement.js';
import type { ManagementEnablement } from './management-enablement.js';
import { SavedConnectionManagement, installSavedManagement } from './management.js';
import { acquirePool } from './pool-cache.js';
import { safeConnection } from './driver-profiles.js';
import type { DriverPool } from './pool.js';
export interface StartupPorts {
	readonly isRegistered: (root: string) => Promise<boolean>;
	readonly keystore?: KeystoreLike;
	readonly enablement?: () => Promise<ManagementEnablement>;
	readonly pool?: ((root: string) => Promise<DriverPool>);
}
export async function openManagedRoot(root: string, ports: StartupPorts): Promise<{
	close: () => Promise<void>;
}> {
	if (process.getuid?.() === undefined || process.geteuid?.() === undefined || process.getuid() === 0 || process.geteuid() !== process.getuid())
		throw new ManagedStoreError('recovery-required');
	if (await realpath(root) !== root || !await ports.isRegistered(root))
		throw new ManagedStoreError('recovery-required');
	const evidence = await (ports.enablement ?? connectionManagementEnablement)();
	if (!evidence.ready)
		throw new ManagedStoreError('recovery-required');
	const path = connectionsPath(root), directory = managementStateDirectory(path), parent = await lstat(dirname(path));
	if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid?.() || (parent.mode & 0o777) !== 0o700)
		throw new ManagedStoreError('recovery-required');
	const lease = await ManagementOwnerLease.acquire(join(directory, 'owner.json'), root);
	let store: ManagedRegistry | undefined, uninstall: (() => void) | undefined;
	try {
		const snapshot = await readRegistrySnapshot(path), envelope = snapshot.file._management;
		if (!envelope || snapshot.mode !== 0o400)
			throw new ManagedStoreError('recovery-required');
		const keystore = ports.keystore ?? credentialKeystore;
		const tickets = await SavedTicketAuthority.open({ root, registryId: envelope.registryId, adopted: true, keystore, isRegistered: ports.isRegistered });
		const state = await ManagementStateFile.open(directory, root, tickets), initial = await state.current();
		if (initial.phase !== 'managed' || initial.parent.inode !== parent.ino || initial.parent.device !== parent.dev)
			throw new ManagedStoreError('recovery-required');
		await state.reconcile(snapshot);
		const baseline = await readProtected(join(directory, initial.baseline.name));
		if (baseline.digest !== initial.baseline.digest)
			throw new ManagedStoreError('recovery-required');
		for (const rollback of initial.rollback) {
			const value = await keystore.getKey(rollback.copyRef);
			if (value === null)
				throw new ManagedStoreError('recovery-required');
			await tickets.verifyMaintenance('rollback-value', { sourceRef: rollback.sourceRef, value }, rollback.valueMac);
		}
		store = await ManagedRegistry.open(path, { ownsRoot: () => lease.current(), prepared: (a, b, name) => state.prepare(a, b, name), committed: a => state.committed(a) });
		const currentStore = store, journal = await PreparationJournal.open(path, envelope.registryId);
		const generations = new CredentialGenerations(journal, repoIdOf(root), { keystore, current: () => currentStore.inspect() });
		await generations.recover();
		await generations.assertReady();
		const enabled = async () => {
			if (!await lease.current())
				throw new ManagedStoreError('recovery-required');
			const current = await currentStore.inspect(), checkpoint = await state.current(), actualParent = await lstat(dirname(path));
			if (checkpoint.phase !== 'managed' || !anchorsMatch(checkpoint.committed, registryAnchor(current)) || actualParent.ino !== parent.ino || actualParent.dev !== parent.dev || (actualParent.mode & 0o777) !== 0o700)
				throw new ManagedStoreError('recovery-required');
			// Registry and owner fences precede every keychain operation.
			// Pin the running code, while retaining the adoption release as history.
			const release = await (ports.enablement ?? connectionManagementEnablement)();
			if (!release.ready || release.digest !== evidence.digest)
				throw new ManagedStoreError('recovery-required');
			await tickets.assertAvailable();
			for (const config of current.file.connections) {
				const projected = safeConnection(config, { repoRoot: root, scope: 'saved', id: config.id }, current.file._management!.revisions[config.id]!);
				if (projected.readOnly)
					throw new ManagedStoreError('recovery-required');
				for (const ref of referencedSecrets(config))
					if (!generations.owns(ref) || await keystore.getKey(ref) === null)
						throw new ManagedStoreError('recovery-required');
			}
			return true;
		};
		await enabled();
		const pool = await (ports.pool ?? acquirePool)(root);
		const service = await SavedConnectionManagement.create({ root, store, tickets, generations, pool, enabled, isRegistered: ports.isRegistered, readSecret: ref => keystore.getKey(ref), activate: async (id) => {
				await pool.withConnection(id, async () => {
				});
			} });
		uninstall = installSavedManagement(root, service);
		let closed = false;
		return { close: async () => {
				if (closed)
					return;
				closed = true;
				uninstall?.();
				await currentStore.close();
				await lease.close();
			} };
	}
	catch (error) {
		uninstall?.();
		await store?.close();
		await lease.close();
		throw error;
	}
}
