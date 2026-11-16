/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, open, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageRuntime } from './package-daemon-candidate.mjs';
import { measureBundleRuntime, stageVerifiedBundle } from './stage-daemon-bundle.mjs';
import { LINUX_ARCHIVE_LIMIT, LINUX_NODE_VERSION, LINUX_RELEASE_TARGET, linuxArchiveName } from './linux-daemon-metadata.mjs';
import { sha256 } from './daemon-bundle-metadata.mjs';

const nodeArchiveSha256 = '9a6bc82f9b491279147219f6a18add1e18424dce90d41d2a5fcd69d4924ba3aa';
const hostLibraries = new Set([
	'ld-linux-x86-64.so.2', 'libc.so.6', 'libdl.so.2', 'libgcc_s.so.1', 'libgobject-2.0.so.0',
	'libgio-2.0.so.0', 'libglib-2.0.so.0', 'libm.so.6', 'libpthread.so.0', 'libresolv.so.2',
	'librt.so.1', 'libsecret-1.so.0', 'libstdc++.so.6', 'libutil.so.1', 'libz.so.1',
]);
const nativeExtension = /(?:\.node|\.so(?:\.[\w.-]+)?|\.dylib|\.dll|\.exe)$/i;
const run = (command, args, cwd) => execFileSync(command, args, {
	cwd, encoding: 'utf8', timeout: 120_000, env: { ...process.env, LC_ALL: 'C' }, maxBuffer: 16 * 1024 * 1024,
});

async function digestFile(path, maxBytes) {
	const hash = createHash('sha256');
	let bytes = 0;
	for await (const chunk of createReadStream(path)) {
		bytes += chunk.length;
		if (bytes > maxBytes) throw new Error('archive exceeds the size limit');
		hash.update(chunk);
	}
	return { bytes, sha256: hash.digest('hex') };
}

export function inspectLinuxElf(description) {
	if (!/Class:\s+ELF64\b/.test(description) || !/Data:\s+2.s complement, little endian/.test(description) ||
		!/Machine:\s+Advanced Micro Devices X86-64/.test(description) ||
		!/Type:\s+(?:DYN|EXEC)\b/.test(description)) throw new Error('unsupported Linux ELF class, encoding, machine or type');
	if (/x86 ISA needed:.*x86-64-v[234]/.test(description)) throw new Error('unsupported Linux ELF ISA floor');
	const interpreter = /Requesting program interpreter: ([^\]]+)/.exec(description);
	if (interpreter && interpreter[1] !== '/lib64/ld-linux-x86-64.so.2') throw new Error('unsupported Linux ELF interpreter');
	const glibc = [...description.matchAll(/Name: GLIBC_([^\s]+)/g)].map(match => match[1]);
	if (glibc.some(version => {
		const parts = version.split('.');
		return !/^2\.\d{1,2}(?:\.\d+)?$/.test(version) || Number(parts[1]) > 39 ||
			(Number(parts[1]) === 39 && Number(parts[2] ?? 0) > 0);
	})) throw new Error('Linux ELF requires an unsupported glibc ABI');
	for (const [, version] of description.matchAll(/Name: GLIBCXX_([^\s]+)/g)) {
		if (!/^3\.4(?:\.\d+)?$/.test(version) || Number(version.split('.')[2] ?? 0) > 32) {
			throw new Error('Linux ELF requires an unsupported libstdc++ ABI');
		}
	}
	return [...description.matchAll(/\(NEEDED\)\s+Shared library: \[([^\]]+)\]/g)].map(match => match[1]);
}

async function collectNativeInventory(root) {
	const targets = new Map();
	async function visit(directory) {
		await chmod(directory, 0o700);
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(path);
				continue;
			}
			const mode = entry.isFile() ? (await lstat(path)).mode : 0;
			if ((path !== join(root, 'tools/LICENSE.node') && nativeExtension.test(entry.name)) || path === join(root, 'tools/node') ||
				path === join(root, 'out/bin/insrc-process-broker') || ((mode & 0o100) && await hasElfMagic(path))) {
				if (!entry.isFile() && !entry.isSymbolicLink()) throw new Error(`unusable native file: ${path}`);
				targets.set(path, await realpath(path));
			}
			if (entry.isFile()) await chmod(path, mode & 0o100 ? 0o700 : 0o600);
		}
	}
	await visit(root);
	const materials = new Map();
	for (const [path, real] of targets) {
		if (!materials.has(real)) {
			if (/^node_modules\/@img\/sharp-linux-x64\/lib\/sharp-linux-x64-[\d.]+\.node$/.test(relative(root, real))) {
				// The npm binary carries search paths for several package managers,
				// including ones outside our archive. Retain only its bundled npm path.
				run('patchelf', ['--force-rpath', '--set-rpath', '$ORIGIN/../../sharp-libvips-linux-x64/lib', real]);
			}
			const description = run('readelf', ['-h', '-l', '-d', '-n', '-V', real]);
			materials.set(real, { dependencies: inspectLinuxElf(description), description });
		}
		const { dependencies, description } = materials.get(real);
		requireLinuxElfDependencies(root, path, description, dependencies, targets);
	}
	return [...new Set([...materials.values()].flatMap(data => data.dependencies).filter(name => hostLibraries.has(name)))].sort();
}

export function requireLinuxElfDependencies(root, path, description, dependencies, inventory) {
	const paths = [...description.matchAll(/\((?:RUNPATH|RPATH)\)[^\n]*\[([^\]]*)\]/g)]
		.flatMap(match => match[1].split(':')).map(item => resolveElfSearchPath(root, dirname(path), item));
	for (const name of dependencies) {
		if (hostLibraries.has(name)) continue;
		if (!/^[a-zA-Z0-9_.+-]+$/.test(name) || !paths.some(directory => inventory.has(join(directory, name)))) {
			throw new Error(`unlisted Linux runtime dependency: ${name} in ${relative(root, path)}`);
		}
	}
}

async function hasElfMagic(path) {
	const file = await open(path, 'r');
	try {
		const magic = Buffer.alloc(4);
		return (await file.read(magic)).bytesRead === 4 && magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
	} finally { await file.close(); }
}

function resolveElfSearchPath(root, directory, entry) {
	const origin = /^\$(?:ORIGIN|\{ORIGIN\})(?:\/([a-zA-Z0-9_./+@-]*))?$/.exec(entry);
	if (!origin) throw new Error(`non-relocatable Linux ELF search path: ${entry}`);
	const resolved = resolve(directory, origin[1] ?? '.');
	const relativePath = relative(root, resolved);
	if (isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith('../')) {
		throw new Error('Linux ELF search path escapes the bundle');
	}
	return resolved;
}

async function requireNativeBuildHost(source, commit) {
	const release = await readFile('/etc/os-release', 'utf8');
	if (process.platform !== 'linux' || process.arch !== 'x64' || process.versions.node !== LINUX_NODE_VERSION ||
		!/^ID="?ubuntu"?$/m.test(release) || !/^VERSION_ID="?24\.04"?$/m.test(release) ||
		run('getconf', ['GNU_LIBC_VERSION']).trim() !== 'glibc 2.39') {
		throw new Error('Linux candidates require Ubuntu 24.04 amd64 with pinned Node and glibc');
	}
	if (!/^[a-f0-9]{40}$/.test(commit) || run('git', ['rev-parse', 'HEAD'], source).trim() !== commit ||
		run('git', ['status', '--porcelain', '--untracked-files=all'], source) !== '') {
		throw new Error('Linux candidates require the exact clean source checkout');
	}
}

async function readPinnedNode(nodeArchive, workspace) {
	const node = await digestFile(nodeArchive, 64 * 1024 ** 2);
	if (node.sha256 !== nodeArchiveSha256) throw new Error('pinned Linux Node archive digest mismatch');
	const runtime = join(workspace, 'node');
	await mkdir(runtime, { mode: 0o700 });
	const upstreamName = `node-v${LINUX_NODE_VERSION}-linux-x64`;
	run('/usr/bin/tar', ['-xJf', nodeArchive, '--strip-components=1', '-C', runtime,
		`${upstreamName}/bin/node`, `${upstreamName}/LICENSE`]);
	return join(runtime, 'bin/node');
}

export async function packageLinuxCandidate({ version, lane, commit, source, nodeArchive, output }) {
	const archiveName = linuxArchiveName(version, lane);
	source = await realpath(source);
	await requireNativeBuildHost(source, commit);
	const work = await realpath(await mkdtemp(join(tmpdir(), 'insrc-linux-candidate-')));
	let createdOutput = false;
	try {
		const stage = join(work, 'payload');
		await mkdir(stage, { mode: 0o700 });
		await stageRuntime(source, stage, await readPinnedNode(resolve(nodeArchive), work), LINUX_RELEASE_TARGET);
		const systemLibraries = await collectNativeInventory(stage);
		const runtimeFingerprint = await measureBundleRuntime(stage);
		await mkdir(output, { mode: 0o700 });
		createdOutput = true;
		const archive = join(output, archiveName);
		run('/usr/bin/tar', ['--format=ustar', '--sort=name', '--hard-dereference', '--owner=0', '--group=0',
			'--numeric-owner', '--mtime=@0', '-czf', archive, '-C', stage, ...(await readdir(stage)).sort()]);
		const { bytes: archiveBytes, sha256: archiveSha256 } = await digestFile(archive, LINUX_ARCHIVE_LIMIT);
		const host = { distribution: 'ubuntu', version: '24.04', architecture: 'amd64', glibc: '2.39',
			nodeVersion: LINUX_NODE_VERSION, systemLibraries, pidfdRequired: true };
		const record = { schemaVersion: 1, target: LINUX_RELEASE_TARGET, lane, version, commit, archiveName,
			archiveBytes, archiveSha256, runtimeFingerprint, host };
		// Verify the exact tar emitted by the build using the shared install-side parser.
		await stageVerifiedBundle(archive, record, work, sha256(Buffer.from(JSON.stringify(record))));
		await writeFile(join(output, 'candidate.json'), JSON.stringify(record), { flag: 'wx', mode: 0o600 });
		return record;
	} catch (error) {
		if (createdOutput) await rm(output, { recursive: true, force: true });
		throw error;
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	const [lane, version, commit, nodeArchive, output, ...extra] = process.argv.slice(2);
	if (!lane || !version || !commit || !nodeArchive || !output || extra.length) {
		throw new Error('usage: package-linux-daemon-candidate.mjs LANE VERSION COMMIT NODE_ARCHIVE NEW_OUTPUT');
	}
	const result = await packageLinuxCandidate({ lane, version, commit, nodeArchive, output, source: process.cwd() });
	process.stdout.write(JSON.stringify(result) + '\n');
}
