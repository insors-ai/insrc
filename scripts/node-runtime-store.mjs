/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import { constants, lstatSync, mkdirSync, openSync, closeSync, readFileSync, readdirSync, readlinkSync,
	realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NODE_RUNTIME_POLICY, readNodeRuntimePolicy } from './node-runtime-policy.mjs';

const inside = (root, path) => path === root || path.startsWith(`${root}${sep}`);
function regular(path) {
	const stat = lstatSync(path);
	if (!stat.isFile()) throw new Error(`runtime file is not regular: ${path}`);
	return stat;
}

/** Inventory is always derived from a freshly extracted, digest-verified archive. */
export function runtimeInventory(root) {
	if (lstatSync(root).isSymbolicLink() || realpathSync(root) !== resolve(root)) throw new Error('noncanonical runtime root');
	const rows = [];
	function walk(directory) {
		for (const name of readdirSync(directory).sort()) {
			const path = join(directory, name), stat = lstatSync(path), key = relative(root, path);
			if (stat.isSymbolicLink()) {
				const link = readlinkSync(path);
				if (isAbsolute(link) || !inside(root, realpathSync(path))) throw new Error(`outside runtime link: ${key}`);
				rows.push([key, 'link', link]);
			} else if (stat.isDirectory()) {
				if (stat.mode & 0o022) throw new Error(`runtime directory is writable by another user: ${key}`);
				rows.push([key, 'directory']); walk(path);
			} else if (stat.isFile()) {
				if (stat.mode & 0o022) throw new Error(`runtime file is writable by another user: ${key}`);
				rows.push([key, 'file', stat.mode & 0o111, createHash('sha256').update(readFileSync(path)).digest('hex')]);
			} else throw new Error(`unsupported runtime entry: ${key}`);
		}
	}
	walk(root);
	return JSON.stringify(rows);
}

export function verifyRuntimeObject(reference, objectRoot) {
	if (lstatSync(objectRoot).isSymbolicLink() || realpathSync(objectRoot) !== resolve(objectRoot)) throw new Error('invalid cached runtime object');
	if (readdirSync(objectRoot).sort().join(',') !== 'archive.tar.gz,distribution,inventory.json') throw new Error('unexpected cached runtime object contents');
	const expected = runtimeInventory(reference);
	regular(join(objectRoot, 'inventory.json')); regular(join(objectRoot, 'archive.tar.gz'));
	if (readFileSync(join(objectRoot, 'inventory.json'), 'utf8') !== expected ||
		runtimeInventory(join(objectRoot, 'distribution')) !== expected) throw new Error('cached runtime inventory mismatch; repair before reuse');
}

export function publishRuntimeObject(stage, destination) {
	if (dirname(stage) !== dirname(destination) || lstatSync(stage).isSymbolicLink()) throw new Error('runtime publication must remain beside its destination');
	try { lstatSync(destination); throw new Error('runtime destination already exists'); }
	catch (error) { if (error.code !== 'ENOENT') throw error; }
	const inventory = runtimeInventory(join(stage, 'distribution'));
	regular(join(stage, 'archive.tar.gz'));
	writeFileSync(join(stage, 'inventory.json'), inventory, { flag: 'wx', mode: 0o600 });
	renameSync(stage, destination);
}

/** Binding publication is separate from provisioning so activation can retain its old selection. */
export function writeSourceRuntimeBinding(stateRoot, installationRoot, distribution, policy = NODE_RUNTIME_POLICY) {
	readNodeRuntimePolicy(policy);
	const state = realpathSync(stateRoot), installation = realpathSync(installationRoot);
	const target = `${process.platform}-${process.arch}`, entry = policy.targets[target];
	if (!entry?.enabled) throw new Error('cannot bind an unqualified runtime target');
	const expected = join(state, 'runtimes', `node-v${policy.nodeVersion}-${target}`, entry.sha256, 'distribution');
	if (distribution !== expected || realpathSync(distribution) !== distribution) throw new Error('runtime binding escapes its owned store');
	const inventorySha256 = createHash('sha256').update(runtimeInventory(distribution)).digest('hex');
	const record = { schemaVersion: 1, installationRoot: installation, target, nodeVersion: policy.nodeVersion,
		archiveSha256: entry.sha256, distribution, inventorySha256 };
	const directory = join(state, 'source-runtimes');
	try { if (lstatSync(directory).isSymbolicLink()) throw new Error('binding directory is a symbolic link'); }
	catch (error) { if (error.code !== 'ENOENT') throw error; }
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	const path = join(directory, `${createHash('sha256').update(installation).digest('hex')}.json`);
	const temporary = `${path}.${process.pid}.${Date.now()}`;
	const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
	try { writeFileSync(fd, `${JSON.stringify(record)}\n`); closeSync(fd); renameSync(temporary, path); }
	catch (error) { try { closeSync(fd); } catch {} try { unlinkSync(temporary); } catch {} throw error; }
	return record;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const [command, source, destination] = process.argv.slice(2);
	if (!source || !destination || process.argv.length !== 5) throw new Error('expected verify|publish SOURCE DESTINATION');
	if (command === 'verify') verifyRuntimeObject(source, destination);
	else if (command === 'publish') publishRuntimeObject(source, destination);
	else throw new Error('expected verify|publish');
}
