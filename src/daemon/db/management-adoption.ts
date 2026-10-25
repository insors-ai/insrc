/** Stopped-daemon maintenance only. No online adoption or writable live-inode fallback. */
import { randomUUID } from 'node:crypto';
import { lstat, realpath, readFile, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { connectionsPath, repoIdOf } from './config.js';
import { privateDirectory, writeProtected, syncDirectory } from './management-files.js';
import { ManagementOwnerLease, processObservation } from './management-owner-lease.js';
import { ManagementStateFile } from './management-state.js';
import type { StoppedDaemonEvidence, RollbackReference } from './management-state.js';
import { ManagedRegistry, PreparationJournal, ManagedStoreError, readRegistrySnapshot, registryAnchor, managementStateDirectory, proveWriterFence, proveProtectedRegistry, managementMarkerExists } from './managed-store.js';
import { SavedTicketAuthority } from './management-tickets.js';
import { CredentialGenerations, referencedSecrets, makeSecretRef } from './secrets.js';
import { safeConnection, credentialValues, materializeDraft } from './driver-profiles.js';
import type { KeystoreLike } from './secrets.js';
import type { CredentialPatch, MutationRequest } from '../../shared/connection-management.js';
import type { ManagementEnablement } from './management-enablement.js';
export interface AdoptionPorts {
	readonly isRegistered: (root: string) => Promise<boolean>;
	readonly keystore: KeystoreLike;
	readonly enablement: () => Promise<ManagementEnablement>;
	/** Must come from the safe-stop control, independently verified by the maintenance entrypoint. */
	readonly stopped: StoppedDaemonEvidence;
}
export async function adoptManagedRoot(root: string, ports: AdoptionPorts): Promise<void> {
	if (process.getuid?.() === undefined || process.geteuid?.() === undefined || process.getuid() === 0 || process.getuid() !== process.geteuid())
		throw new ManagedStoreError('unsupported-filesystem');
	if (await realpath(root) !== root || !await ports.isRegistered(root) || ports.stopped.source !== 'safe-stop-control' || !Number.isSafeInteger(ports.stopped.pid) || ports.stopped.pid <= 0 || processObservation.alive(ports.stopped.pid) || !/^[a-f0-9]{64}$/.test(ports.stopped.processIdentity) || !Number.isFinite(Date.parse(ports.stopped.stoppedAt)))
		throw new ManagedStoreError('recovery-required');
	const evidence = await ports.enablement();
	if (!evidence.ready)
		throw new ManagedStoreError('recovery-required');
	const path = connectionsPath(root), directory = managementStateDirectory(path);
	const parentBefore = await lstat(dirname(path));
	if (!parentBefore.isDirectory() || parentBefore.isSymbolicLink() || parentBefore.uid !== process.getuid?.())
		throw new ManagedStoreError('recovery-required');
	// Only this stopped maintenance path establishes private parent permissions.
	await chmod(dirname(path), 0o700);
	await syncDirectory(dirname(path));
	await privateDirectory(dirname(path));
	await proveWriterFence(dirname(path));
	const before = await readRegistrySnapshot(path, true);
	if (before.file._management || await managementMarkerExists(path))
		throw new ManagedStoreError('recovery-required');
	// Reject every unclassified record before writing keys or adoption metadata.
	for (const config of before.file.connections) {
		if (safeConnection(config, { repoRoot: root, scope: 'saved', id: config.id }, 'legacy').readOnly)
			throw new ManagedStoreError('recovery-required');
		for (const ref of referencedSecrets(config))
			if (ref !== makeSecretRef(repoIdOf(root), config.id))
				throw new ManagedStoreError('recovery-required');
	}
	await privateDirectory(directory);
	const lease = await ManagementOwnerLease.acquire(join(directory, 'owner.json'), root);
	let store: ManagedRegistry | undefined;
	try {
		const actual = await readRegistrySnapshot(path, true);
		if (JSON.stringify(registryAnchor(actual)) !== JSON.stringify(registryAnchor(before)))
			throw new ManagedStoreError('recovery-required');
		const registryId = randomUUID(), initialGeneration = randomUUID(), snapshotName = `snapshot-${randomUUID()}.json`;
		const original = before.missing ? Buffer.alloc(0) : await readFile(path);
		const baseline = await writeProtected(join(directory, snapshotName), original, true);
		if (baseline.digest !== before.digest)
			throw new ManagedStoreError('recovery-required');
		// Durable intent precedes even signing-key creation. An interrupted unsigned intent
		// can never be mistaken for an unmanaged root or silently assigned another key.
		await writeProtected(join(directory, 'preparing.json'), JSON.stringify({ version: 2, root, registryId, initialGeneration, snapshotName, baselineDigest: baseline.digest }), true);
		const tickets = await SavedTicketAuthority.open({ root, registryId, adopted: false, keystore: ports.keystore, isRegistered: ports.isRegistered });
		const rollback: RollbackReference[] = [], values = new Map<string, string>();
		for (const config of before.file.connections)
			for (const sourceRef of referencedSecrets(config)) {
				if (values.has(sourceRef))
					continue;
				const value = await ports.keystore.getKey(sourceRef);
				if (value === null)
					throw new ManagedStoreError('recovery-required');
				values.set(sourceRef, value);
				rollback.push({ sourceRef, copyRef: `db:rollback:${repoIdOf(root)}:${registryId}:${randomUUID()}`, valueMac: await tickets.maintenanceMac('rollback-value', { sourceRef, value }) });
			}
		const parent = await lstat(dirname(path));
		const state = await ManagementStateFile.create(directory, { version: 2, root, registryId, phase: 'adopting', initialGeneration, parent: { inode: parent.ino, device: parent.dev }, baseline: { name: snapshotName, digest: baseline.digest, missing: before.missing, mode: before.mode }, oldDaemon: ports.stopped, rollback, releaseDigest: evidence.digest, committed: registryAnchor(before) }, tickets);
		for (const entry of rollback) {
			if (await ports.keystore.getKey(entry.copyRef) !== null)
				throw new ManagedStoreError('recovery-required');
			await ports.keystore.setKey(entry.copyRef, values.get(entry.sourceRef)!);
			const copy = await ports.keystore.getKey(entry.copyRef);
			if (copy === null)
				throw new ManagedStoreError('recovery-required');
			await tickets.verifyMaintenance('rollback-value', { sourceRef: entry.sourceRef, value: copy }, entry.valueMac);
		}
		store = await ManagedRegistry.open(path, { ownsRoot: () => lease.current(), prepared: (a, b, name) => state.prepare(a, b, name), committed: a => state.committed(a) });
		let current = await store.commit(store.snapshot, { ...before.file, _management: { version: 2, registryId, generation: initialGeneration, revisions: Object.fromEntries(before.file.connections.map(c => [c.id, randomUUID()])), receipts: {} } });
		const currentStore = store, journal = await PreparationJournal.open(path, registryId), generations = new CredentialGenerations(journal, repoIdOf(root), { keystore: ports.keystore, current: () => currentStore.inspect() });
		for (const previous of before.file.connections) {
			const key = { repoRoot: root, scope: 'saved' as const, id: previous.id }, envelope = current.file._management!, revision = envelope.revisions[previous.id]!;
			const effective = await materializeDraft({ key, mode: 'update', current: { config: previous, revision }, expectedRevision: revision, publicPatch: {}, readSecret: async (ref) => {
					const entry = rollback.find(r => r.sourceRef === ref);
					if (!entry)
						throw new ManagedStoreError('recovery-required');
					const value = await ports.keystore.getKey(entry.copyRef);
					if (value === null)
						throw new ManagedStoreError('recovery-required');
					await tickets.verifyMaintenance('rollback-value', { sourceRef: ref, value }, entry.valueMac);
					return value;
				} });
			const actions: Record<string, CredentialPatch> = {};
			for (const [slot, value] of Object.entries(credentialValues(effective.config)))
				actions[slot] = value === undefined ? { action: 'clear' } : { action: 'replace', value: typeof value === 'string' ? value : JSON.stringify(value) };
			const ticket = await tickets.issue(key, 'update'), request: MutationRequest = { key, mode: 'update', ticket, operationId: ticket.operationId, expectedRevision: revision, publicPatch: {}, credentials: actions };
			const staged = await generations.stage({ operationId: ticket.operationId, effective: effective.config, previous, actions });
			const outcome = { operationId: ticket.operationId, revision: randomUUID(), registration: 'persisted' as const, activation: 'pending' as const, credentialCleanup: 'complete' as const };
			current = await store.commit(current, { ...current.file, connections: current.file.connections.map(c => c.id === previous.id ? staged.config : c), _management: { ...envelope, generation: randomUUID(), revisions: { ...envelope.revisions, [previous.id]: outcome.revision }, receipts: { ...envelope.receipts, [ticket.operationId]: { ticket, requestMac: await tickets.requestMac(request), outcome, cleanupRefs: staged.cleanupRefs } } } });
			await generations.recover();
			await generations.assertReady();
		}
		for (const config of current.file.connections)
			for (const ref of referencedSecrets(config))
				if (!generations.owns(ref) || await ports.keystore.getKey(ref) === null)
					throw new ManagedStoreError('recovery-required');
		await proveProtectedRegistry(path);
		await state.update({ ...await state.current(), phase: 'managed' });
	}
	finally {
		await store?.close();
		await lease.close();
	}
}
