/** Daemon-private atomic registry boundary. Never chmod the live inode writable. */
import { createHash, randomUUID } from 'node:crypto';
import { open, lstat, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ConnectionsFile } from '../../shared/db-driver.js';
import type { ManagementEnvelope } from '../../shared/connection-management.js';
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
		} catch {
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
		const temp = join(dirname(this.path), `.db-connections-${randomUUID()}.tmp`);
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
			this.#snapshot = await readRegistrySnapshot(this.path);
			if (this.#snapshot.digest !== hash(text) || this.#snapshot.mode !== 0o400)
				throw new ManagedStoreError('reconciliation-required');
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
