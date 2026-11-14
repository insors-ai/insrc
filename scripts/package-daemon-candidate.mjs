/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, lstat, mkdir, mkdtemp, readdir, readlink, realpath, rm, stat, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const NODE_VERSION = '22.22.1';
const MIN_MACOS = '15.0';
const required = [
	'out/daemon/index.js', 'out/bin/insrc-daemon-control.js',
	'out/bin/insrc-daemon-supervisor.js', 'out/bin/insrc-shutdown-watchdog.js',
	'out/bin/insrc-process-broker', 'out/bin/insrc-darwin-lifecycle',
	'packages/project-memory/dist/index.js',
];

export function candidateIdentity(version, commit) {
	if (!/^[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}-pilot\.[1-9][0-9]{0,8}$/.test(version)) throw new Error('invalid pilot version');
	if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('expected exact lowercase commit SHA');
	return { version, commit, target: 'darwin-arm64', minimumMacOS: MIN_MACOS, nodeVersion: NODE_VERSION,
		archiveName: `insrc-daemon-${version}-darwin-arm64.tar.gz` };
}

export async function stageRuntime(source, stage, runtime) {
	for (const name of required) {
		if (!(await lstat(join(source, name))).isFile()) throw new Error(`missing regular runtime file: ${name}`);
	}
	const copy = (from, to) => cp(from, to, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
	for (const name of ['out', 'node_modules', 'package.json', 'package-lock.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
		await copy(join(source, name), join(stage, name));
	}
	await mkdir(join(stage, 'tools'));
	await copy(runtime, join(stage, 'tools', 'node'));
	await copy(resolve(dirname(runtime), '..', 'LICENSE'), join(stage, 'tools', 'LICENSE.node'));
	const memory = 'packages/project-memory';
	await mkdir(join(stage, memory), { recursive: true });
	for (const file of ['package.json', 'dist', 'LICENSE']) {
		await copy(join(source, memory, file), join(stage, memory, file));
	}
	// npm links this workspace as a directory; the release format only admits
	// file symlinks. Copy the built package into the runtime resolution location.
	const workspaceLink = join(stage, 'node_modules/@insrc/project-memory');
	if (!(await lstat(workspaceLink)).isSymbolicLink()) throw new Error('expected npm workspace symlink');
	await rm(workspaceLink);
	await copy(join(stage, memory), workspaceLink);
	// Runtime entrypoints use explicit paths, not npm's executable shims.
	await rm(join(stage, 'node_modules/.bin'), { recursive: true, force: true });
	await validateLinks(await realpath(stage));
}

async function validateLinks(root, dir = root) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const file = join(dir, entry.name);
		if (entry.isDirectory()) await validateLinks(root, file);
		else if (entry.isSymbolicLink()) {
			const target = await readlink(file);
			const location = resolve(dirname(file), target);
			const path = relative(root, location);
			if (isAbsolute(target) || path === '..' || path.startsWith(`..${sep}`) ||
				!(await lstat(location)).isFile() || await realpath(location) !== location) {
				throw new Error(`unsupported runtime link: ${relative(root, file)}`);
			}
		} else if (!entry.isFile()) throw new Error(`unsupported runtime entry: ${relative(root, file)}`);
	}
}

async function main([version, commit, directory]) {
	const identity = candidateIdentity(version, commit);
	if (!directory || process.platform !== 'darwin' || process.arch !== 'arm64' || process.versions.node !== NODE_VERSION) {
		throw new Error(`requires macOS arm64, official Node ${NODE_VERSION} and a new output directory`);
	}
	const source = await realpath(fileURLToPath(new URL('..', import.meta.url)));
	const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
	if (head !== commit) throw new Error('checked out commit differs from request');
	const runtime = await realpath(process.execPath);
	const output = resolve(directory);
	const stage = await realpath(await mkdtemp(join(tmpdir(), 'insrc-daemon-candidate-')));
	try {
		await stageRuntime(source, stage, runtime);
		await mkdir(output, { mode: 0o700 });
		const archive = join(output, identity.archiveName);
		const entries = (await readdir(stage)).sort();
		execFileSync('/usr/bin/tar', ['--no-mac-metadata', '--no-xattrs', '--format', 'ustar', '-czf', archive, '-C', stage, ...entries]);
		const hash = createHash('sha256');
		for await (const chunk of createReadStream(archive)) hash.update(chunk);
		const archiveSha256 = hash.digest('hex');
		const metadata = { schemaVersion: 1, ...identity, archiveSha256, archiveBytes: (await stat(archive)).size };
		await writeFile(join(output, 'candidate.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
		if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `archive_sha256=${archiveSha256}\n`);
		process.stdout.write(`${archiveSha256}  ${archive}\n`);
	} finally {
		await rm(stage, { recursive: true, force: true });
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
