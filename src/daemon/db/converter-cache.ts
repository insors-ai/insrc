/** Saved-only, content-addressed conversion generations with exact owner identity. */
import { createHash, randomUUID } from 'node:crypto';
import { open, mkdir, readFile, readdir, rm, stat, lstat, realpath, rename, writeFile } from 'node:fs/promises';
import { join, relative, isAbsolute, resolve, dirname } from 'node:path';
import { PATHS } from '../../shared/paths.js';
import type { FileExecutionPolicy } from '../../shared/connection-management.js';
import { getLogger } from '../../shared/logger.js';
const log = getLogger('converter-cache');
export const CONVERTER_VERSION = 'cm-typed-v2';
export interface SavedCacheIdentity {
	readonly canonicalRoot: string;
	readonly connectionId: string;
	readonly revision: string;
	readonly sourceIdentity: string;
	readonly converterVersion: string;
	readonly optionsDigest: string;
}
export interface SavedCacheLease {
	readonly path: string;
	release(): void;
}
interface Sidecar {
	readonly version: 2;
	readonly identity: SavedCacheIdentity;
	readonly sourceFingerprint: string;
	readonly outputFingerprint: string;
}
const INFLIGHT = new Map<string, Promise<string>>(), PINS = new Map<string, number>(), CLEARING = new Set<string>();
function identityJson(identity: SavedCacheIdentity): string {
	const values = [identity.canonicalRoot, identity.connectionId, identity.revision, identity.sourceIdentity, identity.converterVersion, identity.optionsDigest];
	if (values.some(value => typeof value !== 'string' || !value.length) || !isAbsolute(identity.canonicalRoot) || !isAbsolute(identity.sourceIdentity))
		throw new Error('Invalid saved cache identity');
	return JSON.stringify(values);
}
function key(identity: SavedCacheIdentity): string {
	return createHash('sha256').update(identityJson(identity)).digest('hex');
}
export function cacheRoot(): string {
	return join(PATHS.insrc, 'cache', 'file-converted', 'v2');
}
export async function savedCacheIdentity(policy: FileExecutionPolicy, source: string, converter: string): Promise<SavedCacheIdentity> {
	if (policy.persistence !== 'saved-cache')
		throw new Error('Memory-only execution cannot use saved cache');
	const canonicalRoot = await realpath(policy.identity.lookupRoot), sourceIdentity = await realpath(source);
	const rel = relative(resolve(cacheRoot()), sourceIdentity);
	if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)))
		throw new Error('Cache artifacts cannot be source files');
	return Object.freeze({ canonicalRoot, connectionId: policy.identity.connectionId, revision: policy.identity.revision, sourceIdentity, converterVersion: CONVERTER_VERSION + '/' + converter, optionsDigest: policy.identity.converterOptionsDigest });
}
/** All six identity components fence directory, work, metadata and deletion. */
export function cacheDirFor(identity: SavedCacheIdentity): string {
	return join(cacheRoot(), key(identity));
}
export function destForSource(identity: SavedCacheIdentity, fingerprint: string): string {
	if (!/^[a-f0-9]{64}$/.test(fingerprint))
		throw new Error('Invalid source fingerprint');
	return join(cacheDirFor(identity), 'files', fingerprint + '.parquet');
}
function stamp(s: {
	dev: bigint;
	ino: bigint;
	size: bigint;
	mtimeNs: bigint;
	ctimeNs: bigint;
}): string {
	return [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':');
}
async function fingerprint(path: string): Promise<{
	digest: string;
	stamp: string;
}> {
	const before = await lstat(path, { bigint: true });
	if (!before.isFile() || before.isSymbolicLink())
		throw new Error('Invalid saved conversion source');
	const file = await open(path, 'r');
	try {
		const initial = await file.stat({ bigint: true });
		if (stamp(initial) !== stamp(before))
			throw new Error('Saved conversion source changed');
		const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(64 * 1024);
		let offset = 0;
		for (;;) {
			const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
			if (!bytesRead)
				break;
			hash.update(buffer.subarray(0, bytesRead));
			offset += bytesRead;
		}
		const after = await file.stat({ bigint: true }), current = await lstat(path, { bigint: true });
		if (stamp(initial) !== stamp(after) || stamp(after) !== stamp(current))
			throw new Error('Saved conversion source changed');
		return { digest: hash.digest('hex'), stamp: stamp(after) };
	}
	finally {
		await file.close();
	}
}
async function outputFingerprint(path: string): Promise<string> {
	const info = await lstat(path);
	if (info.isSymbolicLink())
		throw new Error('Invalid cache artifact');
	if (info.isFile())
		return (await fingerprint(path)).digest;
	if (!info.isDirectory())
		throw new Error('Invalid cache artifact');
	const hash = createHash('sha256');
	for (const entry of (await readdir(path)).sort()) {
		hash.update(JSON.stringify(entry));
		hash.update(await outputFingerprint(join(path, entry)));
	}
	return hash.digest('hex');
}
async function privateDirectory(path: string): Promise<void> {
	// Every cache ancestor is daemon-owned; reject links rather than following them.
	const base = resolve(PATHS.insrc), rel = relative(base, resolve(path));
	if (rel.startsWith('..') || isAbsolute(rel))
		throw new Error('Invalid cache destination');
	await mkdir(base, { recursive: true, mode: 0o700 });
	if ((await lstat(base)).isSymbolicLink())
		throw new Error('Invalid cache destination');
	let current = base;
	for (const part of rel.split('/').filter(Boolean)) {
		current = join(current, part);
		await mkdir(current, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== 'EEXIST')
				throw error;
		});
		const info = await lstat(current);
		if (!info.isDirectory() || info.isSymbolicLink())
			throw new Error('Invalid cache destination');
	}
}
async function fresh(identity: SavedCacheIdentity, dest: string, sourceFingerprint: string): Promise<boolean> {
	try {
		const metadataInfo = await lstat(dest + '.meta');
		if (!metadataInfo.isFile() || metadataInfo.isSymbolicLink() || metadataInfo.size > 64 * 1024)
			return false;
		const meta = JSON.parse(await readFile(dest + '.meta', 'utf8')) as Sidecar;
		return meta.version === 2 && identityJson(meta.identity) === identityJson(identity) && meta.sourceFingerprint === sourceFingerprint && meta.outputFingerprint === await outputFingerprint(dest);
	}
	catch {
		return false;
	}
}
export async function isCached(identity: SavedCacheIdentity): Promise<boolean> {
	const source = await fingerprint(identity.sourceIdentity);
	return fresh(identity, destForSource(identity, source.digest), source.digest);
}
function pin(path: string): SavedCacheLease {
	PINS.set(path, (PINS.get(path) ?? 0) + 1);
	let live = true;
	return { path, release() {
			if (!live)
				return;
			live = false;
			const remaining = (PINS.get(path) ?? 1) - 1;
			if (remaining)
				PINS.set(path, remaining);
			else
				PINS.delete(path);
			scheduleCap();
		} };
}
export async function ensureCached(identity: SavedCacheIdentity, convert: (source: string, dest: string) => Promise<{
	rowCount: number;
	durationMs: number;
}>): Promise<SavedCacheLease> {
	const identityKey = key(identity), existing = INFLIGHT.get(identityKey);
	if (CLEARING.has(identityKey))
		throw new Error('Saved cache generation busy');
	if (existing) {
		await existing;
		return ensureCached(identity, convert);
	}
	const work = (async () => {
		const source = await fingerprint(identity.sourceIdentity), dest = destForSource(identity, source.digest);
		if (await fresh(identity, dest, source.digest))
			return dest;
		await privateDirectory(dirname(dest));
		const staging = join(dirname(dest), '.pending-' + randomUUID()), retired = join(dirname(dest), '.retired-' + randomUUID());
		let moved = false;
		try {
			const result = await convert(identity.sourceIdentity, staging), after = await fingerprint(identity.sourceIdentity);
			if (after.digest !== source.digest || after.stamp !== source.stamp)
				throw new Error('Saved conversion source changed');
			const output = await outputFingerprint(staging), metadata: Sidecar = { version: 2, identity, sourceFingerprint: source.digest, outputFingerprint: output };
			// Invalid/corrupt same-content outputs may be replaced; pinned generations are never removed.
			if (await lstat(dest).then(() => true).catch(() => false)) {
				if (PINS.has(dest))
					throw new Error('Saved cache generation busy');
				await rename(dest, retired);
				moved = true;
			}
			try {
				await rename(staging, dest);
			}
			catch (error) {
				if (moved)
					await rename(retired, dest);
				throw error;
			}
			const metaStage = dest + '.meta.pending-' + randomUUID();
			try {
				await writeFile(metaStage, JSON.stringify(metadata), { mode: 0o600, flag: 'wx' });
				await rename(metaStage, dest + '.meta');
			}
			finally {
				await rm(metaStage, { force: true });
			}
			if (moved)
				await rm(retired, { recursive: true, force: true });
			log.info({ identity: identityKey, rowCount: result.rowCount }, 'saved conversion cached');
			return dest;
		}
		finally {
			await rm(staging, { recursive: true, force: true });
			await rm(retired, { recursive: true, force: true });
		}
	})();
	INFLIGHT.set(identityKey, work);
	try {
		const path = await work;
		const lease = pin(path);
		scheduleCap();
		return lease;
	}
	finally {
		if (INFLIGHT.get(identityKey) === work)
			INFLIGHT.delete(identityKey);
	}
}
/** Invalidates only this full owner/source/options generation; sources are outside this tree. */
export async function clearConnectionCache(identity: SavedCacheIdentity): Promise<void> {
	const identityKey = key(identity);
	if (CLEARING.has(identityKey))
		throw new Error('Saved cache generation busy');
	CLEARING.add(identityKey);
	try {
		const work = INFLIGHT.get(identityKey);
		if (work)
			await work;
		const directory = cacheDirFor(identity);
		if ([...PINS].some(([path, count]) => count > 0 && path.startsWith(directory + '/')))
			throw new Error('Saved cache generation busy');
		await privateDirectory(dirname(directory));
		await rm(directory, { recursive: true, force: true });
	}
	finally {
		CLEARING.delete(identityKey);
	}
}
export function _resetForTests(): void {
	if (INFLIGHT.size || PINS.size || CLEARING.size)
		throw new Error('Cache owners still active');
}
let capWork: Promise<void> | undefined;
let capRequested = false;
function scheduleCap(): void {
	capRequested = true;
	if (capWork)
		return;
	capWork = (async () => {
		while (capRequested) {
			capRequested = false;
			await enforceCap();
		}
	})().catch(() => {
		log.warn('saved cache eviction failed');
	}).finally(() => {
		capWork = undefined;
		if (capRequested)
			scheduleCap();
	});
}
async function artifactSize(path: string): Promise<number> {
	const info = await lstat(path);
	if (info.isSymbolicLink())
		throw new Error('Invalid cache artifact');
	if (info.isFile())
		return info.size;
	if (!info.isDirectory())
		return 0;
	let size = 0;
	for (const entry of await readdir(path))
		size += await artifactSize(join(path, entry));
	return size;
}
async function enforceCap(): Promise<void> {
	const configured = Number(process.env['INSRC_CONVERTER_CACHE_MB']), cap = Number.isFinite(configured) && configured > 0 ? configured * 1024 * 1024 : 5 * 1024 * 1024 * 1024;
	const root = cacheRoot();
	const info = await lstat(root).catch(() => null);
	if (!info)
		return;
	if (info.isSymbolicLink())
		throw new Error('Invalid cache root');
	const entries: {
		identity: string;
		path: string;
		size: number;
		mtime: number;
	}[] = [];
	let total = 0;
	for (const identity of await readdir(root)) {
		if (!/^[a-f0-9]{64}$/.test(identity))
			continue;
		const files = join(root, identity, 'files');
		const directory = await lstat(files).catch(() => null);
		if (!directory?.isDirectory() || directory.isSymbolicLink())
			continue;
		for (const name of await readdir(files)) {
			if (!/^[a-f0-9]{64}\.parquet$/.test(name))
				continue;
			const path = join(files, name), artifact = await lstat(path).catch(() => null);
			if (!artifact || artifact.isSymbolicLink())
				continue;
			const size = await artifactSize(path) + (await stat(path + '.meta').catch(() => ({ size: 0 }))).size;
			entries.push({ identity, path, size, mtime: artifact.mtimeMs });
			total += size;
		}
	}
	entries.sort((a, b) => a.mtime - b.mtime);
	for (const entry of entries) {
		if (total <= cap)
			break;
		if (PINS.has(entry.path) || INFLIGHT.has(entry.identity))
			continue;
		await rm(entry.path, { recursive: true, force: true });
		await rm(entry.path + '.meta', { force: true });
		total -= entry.size;
	}
}
export async function _settleForTests(): Promise<void> {
	while (capWork)
		await capWork;
}
