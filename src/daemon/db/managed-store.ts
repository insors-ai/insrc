/** Daemon-private atomic registry boundary. Never chmod the live inode writable. */
import { createHash, randomUUID } from 'node:crypto';
import { open, lstat, readFile, rename, unlink, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ConnectionsFile } from '../../shared/db-driver.js';
import type { ManagementEnvelope, PreparationRecord } from '../../shared/connection-management.js';
export class ManagedStoreError extends Error {
	constructor(readonly code: 'registry-unreadable' | 'recovery-required' | 'reconciliation-required' | 'unsupported-filesystem') {
		super({ 'registry-unreadable': 'Connection registry cannot be read safely.', 'recovery-required': 'Connection registry requires recovery.', 'reconciliation-required': 'Connection commit requires reconciliation.', 'unsupported-filesystem': 'Connection management requires a verified filesystem fence.' }[code]);
		this.name = 'ManagedStoreError';
	}
}
export interface RegistrySnapshot {
	readonly file: ConnectionsFile;
	readonly digest: string;
	readonly inode: number;
	readonly device: number;
	readonly mode: number;
	readonly missing: boolean;
}
export type CommitBoundary = 'temp-open' | 'temp-write' | 'temp-sync' | 'temp-chmod' | 'before-rename' | 'after-rename' | 'parent-sync';
export interface ManagedStorePorts {
	/** Trusted owner-lease check, supplied only by the serialized daemon service. */
	readonly ownsRoot: () => Promise<boolean>;
	/** Failure injection/observability; never receives document values. */
	readonly boundary?: ((stage: CommitBoundary) => Promise<void>) | undefined;
}
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function envelope(value: unknown): value is ManagementEnvelope {
	if (!value || typeof value !== 'object')
		return false;
	const e = value as Record<string, unknown>;
	return e['version'] === 2 && typeof e['registryId'] === 'string' && typeof e['generation'] === 'string'
		&& !!e['revisions'] && typeof e['revisions'] === 'object' && !Array.isArray(e['revisions'])
		&& !!e['receipts'] && typeof e['receipts'] === 'object' && !Array.isArray(e['receipts']);
}
export async function readRegistrySnapshot(path: string, allowMissing = false): Promise<RegistrySnapshot> {
	try {
		const handle = await open(path, 'r');
		try {
			const before = await lstat(path);
			const stat = await handle.stat();
			if (!before.isFile() || before.isSymbolicLink() || before.ino !== stat.ino || before.dev !== stat.dev)
				throw new ManagedStoreError('registry-unreadable');
			const text = await handle.readFile('utf8');
			const after = await lstat(path);
			if (after.ino !== stat.ino || after.dev !== stat.dev || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.mode !== stat.mode)
				throw new ManagedStoreError('registry-unreadable');
			const file: unknown = JSON.parse(text);
			if (!file || typeof file !== 'object' || !Array.isArray((file as ConnectionsFile).connections))
				throw new ManagedStoreError('registry-unreadable');
			const doc = file as ConnectionsFile;
			if (Object.hasOwn(doc, '_management') && !envelope(doc._management))
				throw new ManagedStoreError('registry-unreadable');
			return { file: doc, digest: hash(text), inode: stat.ino, device: stat.dev, mode: stat.mode & 0o777, missing: false };
		}
		finally {
			await handle.close();
		}
	}
	catch (err) {
		if (allowMissing && (err as NodeJS.ErrnoException).code === 'ENOENT')
			return { file: { connections: [] }, digest: hash(''), inode: 0, device: 0, mode: 0, missing: true };
		if (err instanceof ManagedStoreError)
			throw err;
		throw new ManagedStoreError('registry-unreadable');
	}
}
/** Physical proof on the target directory; no production registry is modified. */
export async function proveWriterFence(directory: string): Promise<void> {
	if (process.platform === 'win32' || process.getuid?.() === 0)
		throw new ManagedStoreError('unsupported-filesystem');
	const original = join(directory, `.connection-fence-${randomUUID()}`);
	const replacement = `${original}.new`;
	let old: Awaited<ReturnType<typeof open>> | undefined;
	let next: Awaited<ReturnType<typeof open>> | undefined;
	try {
		old = await open(original, 'wx', 0o600);
		await old.writeFile('old');
		await old.sync();
		next = await open(replacement, 'wx', 0o600);
		await next.writeFile('protected');
		await next.sync();
		await next.chmod(0o400);
		await next.sync();
		await next.close();
		next = undefined;
		await rename(replacement, original);
		let refused = false;
		try {
			const legacy = await open(original, 'w');
			await legacy.close();
		}
		catch (err) {
			refused = (err as NodeJS.ErrnoException).code === 'EACCES';
		}
		if (!refused)
			throw new ManagedStoreError('unsupported-filesystem');
		await old.write(Buffer.from('detached'), 0, 8, 0);
		await old.sync();
		if (await readFile(original, 'utf8') !== 'protected')
			throw new ManagedStoreError('unsupported-filesystem');
		const parent = await open(directory, 'r');
		try {
			await parent.sync();
		}
		finally {
			await parent.close();
		}
	}
	catch {
		throw new ManagedStoreError('unsupported-filesystem');
	}
	finally {
		await next?.close().catch(() => {
		});
		await old?.close().catch(() => {
		});
		await unlink(replacement).catch(() => {
		});
		await unlink(original).catch(() => {
		});
	}
}
const opening = new Set<string>();
const stores = new Map<string, ManagedRegistry>();
const writers = new WeakMap<ManagedRegistry, (expected: RegistrySnapshot, text: string) => Promise<void>>();
const proofs = new WeakMap<object, {
	store: ManagedRegistry;
	expected: RegistrySnapshot;
	text: string;
}>();
/** Opaque, single-use proof. Runtime identity is checked in addition to TypeScript branding. */
declare const commitBrand: unique symbol;
export interface ManagedCommit {
	readonly [commitBrand]: true;
}
export async function writeWithManagedProof(path: string, text: string, proof: ManagedCommit): Promise<void> {
	const claim = proofs.get(proof);
	if (!claim || claim.store.path !== path || claim.text !== text)
		throw new ManagedStoreError('recovery-required');
	proofs.delete(proof);
	const write = writers.get(claim.store);
	if (!write)
		throw new ManagedStoreError('recovery-required');
	await write(claim.expected, text);
}
/** Reject even a caller trying to drop the envelope; read existing truth first. */
export async function assertUnmanagedWrite(path: string, file: ConnectionsFile): Promise<void> {
	if (stores.has(path) || Object.hasOwn(file, '_management'))
		throw new ManagedStoreError('recovery-required');
	const current = await readRegistrySnapshot(path, true);
	if (Object.hasOwn(current.file, '_management'))
		throw new ManagedStoreError('recovery-required');
}
export class ManagedRegistry {
	readonly #ports: ManagedStorePorts;
	#tail: Promise<void> = Promise.resolve();
	#snapshot: RegistrySnapshot;
	#uncertain = false;
	#uncertainCandidate: RegistrySnapshot | undefined;
	private constructor(readonly path: string, snapshot: RegistrySnapshot, ports: ManagedStorePorts) {
		this.#snapshot = snapshot;
		this.#ports = ports;
		writers.set(this, (expected, text) => this.#write(expected, text));
	}
	static async open(path: string, ports: ManagedStorePorts): Promise<ManagedRegistry> {
		if (stores.has(path) || opening.has(path))
			throw new ManagedStoreError('recovery-required');
		opening.add(path);
		try {
			if (!await ports.ownsRoot())
				throw new ManagedStoreError('recovery-required');
			await proveWriterFence(dirname(path));
			const snapshot = await readRegistrySnapshot(path, true);
			if (snapshot.file._management && snapshot.mode !== 0o400)
				throw new ManagedStoreError('recovery-required');
			const store = new ManagedRegistry(path, snapshot, ports);
			stores.set(path, store);
			return store;
		}
		finally {
			opening.delete(path);
		}
	}
	/** Snapshot is cloned so consumers cannot change expected committed truth. */
	get snapshot(): RegistrySnapshot {
		return structuredClone(this.#snapshot);
	}
	/** Read-only drift check used before credential ports and mutation admission. */
	async inspect(): Promise<RegistrySnapshot> {
		await this.#check(this.#snapshot);
		return this.snapshot;
	}
	/** Reconcile only the exact precommit inode or the exact replacement inode built by this owner. */
	async reconcile(): Promise<RegistrySnapshot> {
		await this.#tail;
		if (!this.#uncertain)
			return this.inspect();
		if (stores.get(this.path) !== this || !await this.#ports.ownsRoot())
			throw new ManagedStoreError('recovery-required');
		const actual = await readRegistrySnapshot(this.path);
		const matches = (known: RegistrySnapshot | undefined) => known && actual.digest === known.digest && actual.inode === known.inode && actual.device === known.device && actual.mode === known.mode && actual.missing === known.missing;
		if (!matches(this.#snapshot) && !matches(this.#uncertainCandidate))
			throw new ManagedStoreError('recovery-required');
		const parent = await open(dirname(this.path), 'r');
		try {
			await parent.sync();
		}
		catch {
			throw new ManagedStoreError('reconciliation-required');
		}
		finally {
			await parent.close();
		}
		this.#snapshot = actual;
		this.#uncertain = false;
		this.#uncertainCandidate = undefined;
		return this.snapshot;
	}
	async cleanupCommittedTemp(operationId: string): Promise<void> {
		const current = await this.inspect();
		if (!UUID.test(operationId) || !Object.hasOwn(current.file._management?.receipts ?? {}, operationId))
			throw new ManagedStoreError('recovery-required');
		await discardOperationTemp(this.path, operationId);
	}
	async close(): Promise<void> {
		await this.#tail;
		if (stores.get(this.path) === this)
			stores.delete(this.path);
	}
	async #check(expected: RegistrySnapshot): Promise<void> {
		if (stores.get(this.path) !== this || expected.digest !== this.#snapshot.digest || expected.inode !== this.#snapshot.inode || expected.device !== this.#snapshot.device || expected.mode !== this.#snapshot.mode || !await this.#ports.ownsRoot() || this.#uncertain)
			throw new ManagedStoreError('recovery-required');
		let actual: RegistrySnapshot;
		try {
			actual = await readRegistrySnapshot(this.path, expected.missing);
		}
		catch {
			throw new ManagedStoreError('recovery-required');
		}
		if (actual.digest !== expected.digest || actual.inode !== expected.inode || actual.device !== expected.device || actual.mode !== expected.mode || actual.missing !== expected.missing)
			throw new ManagedStoreError('recovery-required');
		if (actual.file._management && actual.mode !== 0o400)
			throw new ManagedStoreError('recovery-required');
	}
	async commit(expected: RegistrySnapshot, file: ConnectionsFile): Promise<RegistrySnapshot> {
		const immutable = structuredClone(file);
		const text = JSON.stringify(immutable, null, 2) + '\n';
		const run = this.#tail.then(async () => {
			if (!envelope(immutable._management) || immutable._management.generation === expected.file._management?.generation || (expected.file._management && immutable._management.registryId !== expected.file._management.registryId))
				throw new ManagedStoreError('recovery-required');
			const proof = {} as ManagedCommit;
			proofs.set(proof, { store: this, expected: structuredClone(expected), text });
			await writeWithManagedProof(this.path, text, proof);
			return this.snapshot;
		});
		this.#tail = run.then(() => {
		}, () => {
		});
		return run;
	}
	/** Internal proof consumer; untrusted callers still must pass full current fences. */
	async #write(expected: RegistrySnapshot, text: string): Promise<void> {
		await this.#check(expected);
		const next = JSON.parse(text) as ConnectionsFile;
		const added = Object.keys(next._management!.receipts).filter(id => !Object.hasOwn(expected.file._management?.receipts ?? {}, id));
		const changed = Object.keys(next._management!.receipts).filter(id => JSON.stringify(next._management!.receipts[id]) !== JSON.stringify(expected.file._management?.receipts[id]));
		const candidate = added.length === 1 ? added[0] : changed.length === 1 ? changed[0] : undefined;
		const temporaryId = candidate && UUID.test(candidate) ? candidate : randomUUID();
		const temp = join(dirname(this.path), `.db-connections-${temporaryId}.tmp`);
		let handle: Awaited<ReturnType<typeof open>> | undefined;
		let renameAttempted = false;
		try {
			handle = await open(temp, 'wx', 0o600);
			await this.#ports.boundary?.('temp-open');
			await handle.writeFile(text, 'utf8');
			await this.#ports.boundary?.('temp-write');
			await handle.sync();
			await this.#ports.boundary?.('temp-sync');
			await handle.chmod(0o400);
			await handle.sync();
			await this.#ports.boundary?.('temp-chmod');
			const replacement = await handle.stat();
			this.#uncertainCandidate = { file: next, digest: hash(text), inode: replacement.ino, device: replacement.dev, mode: replacement.mode & 0o777, missing: false };
			await handle.close();
			handle = undefined;
			await this.#check(expected);
			await this.#ports.boundary?.('before-rename');
			renameAttempted = true;
			await rename(temp, this.path);
			await this.#ports.boundary?.('after-rename');
			const parent = await open(dirname(this.path), 'r');
			try {
				await parent.sync();
				await this.#ports.boundary?.('parent-sync');
			}
			finally {
				await parent.close();
			}
			const observed = await readRegistrySnapshot(this.path);
			if (observed.digest !== hash(text) || observed.mode !== 0o400 || observed.inode !== this.#uncertainCandidate?.inode || observed.device !== this.#uncertainCandidate.device)
				throw new ManagedStoreError('reconciliation-required');
			this.#snapshot = observed;
			this.#uncertainCandidate = undefined;
		}
		catch {
			if (renameAttempted) {
				this.#uncertain = true;
				throw new ManagedStoreError('reconciliation-required');
			}
			throw new ManagedStoreError('recovery-required');
		}
		finally {
			await handle?.close().catch(() => {
			});
			await unlink(temp).catch(() => {
			});
		}
	}
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type PreparationBoundary = 'before-preparation-sync' | 'after-preparation-sync' | 'after-preparation-directory-sync' | 'before-recovery-parent-sync' | 'after-recovery-parent-sync' | 'before-completion-sync' | 'after-completion-sync';
const journalCompletionLatches = new Map<string, Map<string, PreparationRecord>>();
/** Durable, secret-free recovery records. The service's root lease serializes all calls. */
export class PreparationJournal {
	readonly #completionPending: Map<string, PreparationRecord>;
	private constructor(readonly directory: string, readonly registryId: string, readonly registryPath: string, private readonly boundary?: ((stage: PreparationBoundary) => Promise<void>) | undefined) {
		this.#completionPending = journalCompletionLatches.get(directory) ?? new Map();
		journalCompletionLatches.set(directory, this.#completionPending);
	}
	static async open(registryPath: string, registryId: string, boundary?: ((stage: PreparationBoundary) => Promise<void>) | undefined): Promise<PreparationJournal> {
		if (!UUID.test(registryId))
			throw new ManagedStoreError('recovery-required');
		const directory = join(dirname(registryPath), 'connection-management-recovery');
		await mkdir(directory, { mode: 0o700 }).catch(err => {
			if ((err as NodeJS.ErrnoException).code !== 'EEXIST')
				throw new ManagedStoreError('recovery-required');
		});
		const stat = await lstat(directory);
		if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid?.())
			throw new ManagedStoreError('recovery-required');
		const journal = new PreparationJournal(directory, registryId, registryPath, boundary);
		await boundary?.('before-recovery-parent-sync');
		const parent = await open(dirname(directory), 'r');
		try {
			await parent.sync();
		}
		finally {
			await parent.close();
		}
		await boundary?.('after-recovery-parent-sync');
		await journal.sync();
		return journal;
	}
	private async sync(): Promise<void> {
		const dir = await open(this.directory, 'r');
		try {
			await dir.sync();
		}
		finally {
			await dir.close();
		}
	}
	private check(record: unknown): asserts record is PreparationRecord {
		if (!record || typeof record !== 'object' || Array.isArray(record))
			throw new ManagedStoreError('recovery-required');
		const r = record as PreparationRecord;
		if (Object.keys(r).sort().join(',') !== 'expectedGeneration,operationId,ownedStagedRefs,phase,registryId' || !UUID.test(r.operationId) || r.registryId !== this.registryId || !UUID.test(r.expectedGeneration) || !['prepared', 'commit-uncertain', 'cleanup-pending'].includes(r.phase) || !Array.isArray(r.ownedStagedRefs) || r.ownedStagedRefs.length > 4096 || r.ownedStagedRefs.some(ref => typeof ref !== 'string' || ref.length > 512) || new Set(r.ownedStagedRefs).size !== r.ownedStagedRefs.length)
			throw new ManagedStoreError('recovery-required');
	}
	async prepare(record: PreparationRecord): Promise<void> {
		this.check(record);
		if (this.#completionPending.size)
			throw new ManagedStoreError('recovery-required');
		const text = JSON.stringify(record) + '\n';
		const handle = await open(join(this.directory, `${record.operationId}.json`), 'wx', 0o600);
		try {
			await handle.writeFile(text, 'utf8');
			await this.boundary?.('before-preparation-sync');
			await handle.sync();
			await handle.chmod(0o400);
			await handle.sync();
			await this.boundary?.('after-preparation-sync');
		}
		finally {
			await handle.close();
		}
		await this.sync();
		await this.boundary?.('after-preparation-directory-sync');
	}
	async pending(): Promise<readonly PreparationRecord[]> {
		try {
			const records: PreparationRecord[] = [];
			for (const name of (await readdir(this.directory)).sort()) {
				if (!name.endsWith('.json') || !UUID.test(name.slice(0, -5)))
					throw new ManagedStoreError('recovery-required');
				const path = join(this.directory, name);
				const st = await lstat(path);
				if (!st.isFile() || st.isSymbolicLink() || st.uid !== process.getuid?.() || ![0o400, 0o600].includes(st.mode & 0o777) || st.size > 2 * 1024 * 1024)
					throw new ManagedStoreError('recovery-required');
				const value: unknown = JSON.parse(await readFile(path, 'utf8'));
				this.check(value);
				if (value.operationId !== name.slice(0, -5))
					throw new ManagedStoreError('recovery-required');
				records.push(value);
			}
			for (const record of this.#completionPending.values()) {
				const disk = records.find(r => r.operationId === record.operationId);
				if (disk && JSON.stringify(disk) !== JSON.stringify(record))
					throw new ManagedStoreError('recovery-required');
				if (!disk)
					records.push(structuredClone(record));
			}
			return records;
		}
		catch {
			throw new ManagedStoreError('recovery-required');
		}
	}
	async complete(record: PreparationRecord): Promise<void> {
		this.check(record);
		const path = join(this.directory, `${record.operationId}.json`);
		let existing: unknown;
		try {
			existing = JSON.parse(await readFile(path, 'utf8'));
		}
		catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'ENOENT' || !this.#completionPending.has(record.operationId))
				throw new ManagedStoreError('recovery-required');
			existing = this.#completionPending.get(record.operationId);
		}
		this.check(existing);
		if (JSON.stringify(existing) !== JSON.stringify(record))
			throw new ManagedStoreError('recovery-required');
		await discardOperationTemp(this.registryPath, record.operationId);
		this.#completionPending.set(record.operationId, structuredClone(record));
		await unlink(path).catch(err => {
			if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
				throw err;
		});
		await this.boundary?.('before-completion-sync');
		await this.sync();
		await this.boundary?.('after-completion-sync');
		this.#completionPending.delete(record.operationId);
	}
}
async function discardOperationTemp(registryPath: string, operationId: string): Promise<void> {
	const temp = join(dirname(registryPath), `.db-connections-${operationId}.tmp`);
	try {
		const stat = await lstat(temp);
		if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || ![0o600, 0o400].includes(stat.mode & 0o777))
			throw new ManagedStoreError('recovery-required');
		await unlink(temp);
		const parent = await open(dirname(temp), 'r');
		try {
			await parent.sync();
		}
		finally {
			await parent.close();
		}
	}
	catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
			throw new ManagedStoreError('recovery-required');
	}
}
