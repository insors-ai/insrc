/** Private metadata IO: exclusive staging, synced read-only replacement, no writable live inode. */
import { open, lstat, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ManagedStoreError } from './managed-store.js';
export interface ProtectedBytes {
	readonly bytes: Buffer;
	readonly digest: string;
	readonly inode: number;
	readonly device: number;
}
export async function syncDirectory(path: string): Promise<void> {
	const file = await open(path, 'r');
	try {
		await file.sync();
	}
	finally {
		await file.close();
	}
}
export async function privateDirectory(path: string): Promise<void> {
	await mkdir(path, { recursive: true, mode: 0o700 });
	const info = await lstat(path);
	if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700)
		throw new ManagedStoreError('recovery-required');
}
export async function readProtected(path: string, limit = 2 * 1024 * 1024): Promise<ProtectedBytes> {
	try {
		const before = await lstat(path);
		if (!before.isFile() || before.isSymbolicLink() || before.uid !== process.getuid?.() || (before.mode & 0o777) !== 0o400 || before.size > limit)
			throw new Error();
		const handle = await open(path, 'r');
		try {
			const held = await handle.stat();
			if (held.ino !== before.ino || held.dev !== before.dev)
				throw new Error();
			const bytes = await handle.readFile();
			const after = await lstat(path);
			if (after.ino !== held.ino || after.dev !== held.dev || after.size !== held.size || after.mode !== held.mode || after.mtimeMs !== held.mtimeMs)
				throw new Error();
			return { bytes, digest: createHash('sha256').update(bytes).digest('hex'), inode: held.ino, device: held.dev };
		}
		finally {
			await handle.close();
		}
	}
	catch {
		throw new ManagedStoreError('recovery-required');
	}
}
export async function writeProtected(path: string, bytes: Buffer | string, exclusive = false): Promise<ProtectedBytes> {
	await privateDirectory(dirname(path));
	const temporary = exclusive ? path : join(dirname(path), '.state-' + randomUUID() + '.tmp');
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(temporary, 'wx', 0o600);
		await handle.writeFile(bytes);
		await handle.sync();
		await handle.chmod(0o400);
		await handle.sync();
		await handle.close();
		handle = undefined;
		if (!exclusive)
			await rename(temporary, path);
		await syncDirectory(dirname(path));
		return await readProtected(path, Math.max(2 * 1024 * 1024, Buffer.byteLength(bytes)));
	}
	catch {
		throw new ManagedStoreError('recovery-required');
	}
	finally {
		await handle?.close().catch(() => {
		});
		if (!exclusive)
			await unlink(temporary).catch(() => {
			});
	}
}
