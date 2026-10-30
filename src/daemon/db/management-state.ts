/** Signed, secret-free high-water checkpoint. Canonical JSON remains the commit marker. */
import { join, dirname } from 'node:path';
import { unlink } from 'node:fs/promises';
import { readProtected, writeProtected, syncDirectory } from './management-files.js';
import type { ProtectedBytes } from './management-files.js';
import { ManagedStoreError, registryAnchor, readRegistrySnapshot } from './managed-store.js';
import type { RegistryAnchor, RegistrySnapshot } from './managed-store.js';
import { SavedTicketAuthority, canonicalRequestJson } from './management-tickets.js';
export interface StoppedDaemonEvidence {
	readonly source: 'safe-stop-control';
	readonly pid: number;
	readonly processIdentity: string;
	readonly stoppedAt: string;
}
export interface RollbackReference {
	readonly sourceRef: string;
	readonly copyRef: string;
	readonly valueMac: string;
}
export interface ManagementState {
	readonly version: 2;
	readonly root: string;
	readonly registryId: string;
	readonly phase: 'adopting' | 'managed';
	readonly initialGeneration: string;
	readonly parent: {
		readonly inode: number;
		readonly device: number;
	};
	readonly baseline: {
		readonly name: string;
		readonly digest: string;
		readonly missing: boolean;
		readonly mode: number;
	};
	readonly oldDaemon?: StoppedDaemonEvidence | undefined;
	/** Fresh initialization has no prior daemon or legacy registry to migrate. */
	readonly initializedBy?: { readonly pid:number; readonly processIdentity:string; readonly createdAt:string } | undefined;
	readonly rollback: readonly RollbackReference[];
	readonly releaseDigest: string;
	readonly committed: RegistryAnchor;
	readonly pending?: RegistryAnchor | undefined;
	readonly pendingTemp?: string | undefined;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function validAnchor(value: unknown): value is RegistryAnchor {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		return false;
	const anchor = value as RegistryAnchor;
	return /^[a-f0-9]{64}$/.test(anchor.digest) && [anchor.inode, anchor.device, anchor.mode].every(n => Number.isSafeInteger(n) && n >= 0) && typeof anchor.missing === 'boolean'
		&& (anchor.registryId === undefined || uuid.test(anchor.registryId)) && (anchor.generation === undefined || uuid.test(anchor.generation))
		&& Object.keys(anchor).every(key => ['digest', 'inode', 'device', 'mode', 'missing', 'registryId', 'generation'].includes(key));
}
function parse(value: unknown, root: string): ManagementState {
	try {
		const state = value as ManagementState;
		if (!state || state.version !== 2 || state.root !== root || !uuid.test(state.registryId) || !uuid.test(state.initialGeneration) || !['adopting', 'managed'].includes(state.phase)
			|| !state.parent || !Number.isSafeInteger(state.parent.inode) || !Number.isSafeInteger(state.parent.device) || !state.baseline || !/^snapshot-[a-f0-9-]{36}\.json$/.test(state.baseline.name) || !/^[a-f0-9]{64}$/.test(state.baseline.digest) || typeof state.baseline.missing !== 'boolean' || !Number.isInteger(state.baseline.mode)
			|| (!!state.oldDaemon === !!state.initializedBy)
			|| (state.oldDaemon !== undefined && (state.oldDaemon.source !== 'safe-stop-control' || !Number.isSafeInteger(state.oldDaemon.pid) || state.oldDaemon.pid <= 0 || !/^[a-f0-9]{64}$/.test(state.oldDaemon.processIdentity) || !Number.isFinite(Date.parse(state.oldDaemon.stoppedAt))))
			|| (state.initializedBy !== undefined && (!Number.isSafeInteger(state.initializedBy.pid) || state.initializedBy.pid <= 0 || !/^[a-f0-9]{64}$/.test(state.initializedBy.processIdentity) || !Number.isFinite(Date.parse(state.initializedBy.createdAt)) || !state.baseline.missing || state.rollback?.length !== 0))
			|| !Array.isArray(state.rollback) || state.rollback.some(ref => typeof ref.sourceRef !== 'string' || typeof ref.copyRef !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ref.valueMac))
			|| !/^[a-f0-9]{64}$/.test(state.releaseDigest) || !validAnchor(state.committed) || (state.pending !== undefined && !validAnchor(state.pending))
			|| (state.pendingTemp !== undefined && !/^\.db-connections-[a-f0-9-]{36}\.tmp$/.test(state.pendingTemp)))
			throw new Error();
		if (Object.keys(state).some(key => !['version', 'root', 'registryId', 'phase', 'initialGeneration', 'parent', 'baseline', 'oldDaemon', 'initializedBy', 'rollback', 'releaseDigest', 'committed', 'pending', 'pendingTemp'].includes(key))
			|| Object.keys(state.parent).sort().join(',') !== 'device,inode' || Object.keys(state.baseline).sort().join(',') !== 'digest,missing,mode,name'
			|| (state.oldDaemon !== undefined && Object.keys(state.oldDaemon).sort().join(',') !== 'pid,processIdentity,source,stoppedAt')
			|| (state.initializedBy !== undefined && Object.keys(state.initializedBy).sort().join(',') !== 'createdAt,pid,processIdentity')
			|| state.rollback.some(ref => Object.keys(ref).sort().join(',') !== 'copyRef,sourceRef,valueMac' || ref.sourceRef.length > 16384 || ref.copyRef.length > 16384))
			throw new Error();
		if (state.phase === 'managed' && (!state.committed.registryId || state.committed.registryId !== state.registryId || state.committed.mode !== 0o400 || state.committed.missing))
			throw new Error();
		return state;
	}
	catch {
		throw new ManagedStoreError('recovery-required');
	}
}
export function anchorsMatch(a: RegistryAnchor, b: RegistryAnchor): boolean {
	return canonicalRequestJson(a) === canonicalRequestJson(b);
}
export class ManagementStateFile {
	#known: ProtectedBytes;
	#value: ManagementState;
	private constructor(readonly directory: string, readonly tickets: SavedTicketAuthority, known: ProtectedBytes, state: ManagementState) {
		this.#known = known;
		this.#value = state;
	}
	get path(): string {
		return join(this.directory, 'state.json');
	}
	static async open(directory: string, root: string, tickets: SavedTicketAuthority): Promise<ManagementStateFile> {
		const known = await readProtected(join(directory, 'state.json'));
		let wrapper: {
			payload: unknown;
			signature: string;
		};
		try {
			wrapper = JSON.parse(known.bytes.toString('utf8')) as typeof wrapper;
		}
		catch {
			throw new ManagedStoreError('recovery-required');
		}
		const state = parse(wrapper.payload, root);
		await tickets.verifyMaintenance('owner-state', state, wrapper.signature);
		return new ManagementStateFile(directory, tickets, known, state);
	}
	static async create(directory: string, state: ManagementState, tickets: SavedTicketAuthority): Promise<ManagementStateFile> {
		parse(state, state.root);
		const signature = await tickets.maintenanceMac('owner-state', state);
		const known = await writeProtected(join(directory, 'state.json'), JSON.stringify({ payload: state, signature }), true);
		return new ManagementStateFile(directory, tickets, known, structuredClone(state));
	}
	async current(): Promise<ManagementState> {
		const actual = await readProtected(this.path);
		if (actual.digest !== this.#known.digest || actual.inode !== this.#known.inode || actual.device !== this.#known.device)
			throw new ManagedStoreError('recovery-required');
		return structuredClone(this.#value);
	}
	async update(state: ManagementState): Promise<void> {
		await this.current();
		parse(state, this.#value.root);
		if (state.registryId !== this.#value.registryId)
			throw new ManagedStoreError('recovery-required');
		const signature = await this.tickets.maintenanceMac('owner-state', state), text = JSON.stringify({ payload: state, signature });
		try {
			const known = await writeProtected(this.path, text);
			this.#known = known;
			this.#value = structuredClone(state);
		}
		catch (error) {
			// A metadata rename may have succeeded before its directory sync failed.
			// Accept only this exact signed candidate, never arbitrary drift.
			const actual = await readProtected(this.path).catch(() => undefined);
			if (actual?.bytes.equals(Buffer.from(text))) {
				await syncDirectory(this.directory);
				this.#known = actual;
				this.#value = structuredClone(state);
			}
			else
				throw error;
		}
	}
	async prepare(before: RegistryAnchor, candidate: RegistryAnchor, temporaryBasename: string): Promise<void> {
		const state = await this.current();
		if (!anchorsMatch(state.committed, before))
			throw new ManagedStoreError('recovery-required');
		await this.update({ ...state, pending: candidate, pendingTemp: temporaryBasename });
	}
	async committed(anchor: RegistryAnchor): Promise<void> {
		const state = await this.current();
		if (!anchorsMatch(state.committed, anchor) && (!state.pending || !anchorsMatch(state.pending, anchor)))
			throw new ManagedStoreError('recovery-required');
		const { pending: _pending, pendingTemp: _temp, ...rest } = state;
		void _pending;
		void _temp;
		await this.update({ ...rest, committed: anchor });
	}
	async reconcile(snapshot: RegistrySnapshot): Promise<void> {
		const state = await this.current(), actual = registryAnchor(snapshot);
		if (!anchorsMatch(state.committed, actual) && (!state.pending || !anchorsMatch(state.pending, actual)))
			throw new ManagedStoreError('recovery-required');
		if (state.pending) {
			if (state.pendingTemp) {
				const temporary = join(dirname(this.directory), state.pendingTemp), remaining = await readRegistrySnapshot(temporary, true);
				if (!remaining.missing) {
					if (!anchorsMatch(registryAnchor(remaining), state.pending))
						throw new ManagedStoreError('recovery-required');
					await unlink(temporary);
				}
			}
			await syncDirectory(dirname(this.directory));
			await this.committed(actual);
		}
	}
}
