/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { releaseMetadataDigest } from '../../shared/managed-release-trust.js';
import { measureManagedReleaseInventory } from '../managed-release-inventory.js';

test('Changed native code, loadable data, bindings, signature policy, injected modules, symlinks and unidentified variance fail closed', async t => {
	const temp = await realpath(await mkdtemp(join(tmpdir(), 'insrc-release-inventory-')));
	t.after(() => rm(temp, { recursive: true, force: true }));
	const root = join(temp, 'checkout');
	const runtime = join(temp, 'node');
	const directories = ['out', 'out/daemon', 'node_modules', 'node_modules/fixture', 'scripts', 'packages/project-memory/dist'];
	const files = {
		'node-runtime': 'runtime', 'out/daemon/index.js': 'daemon',
		'node_modules/fixture/native.node': 'code|data|bindings|signature',
		'scripts/daemon-ctl.sh': 'launcher', 'package.json': '{}', 'package-lock.json': '{}',
		'.npmrc': 'registry=https://example.invalid', 'packages/project-memory/dist/index.js': 'memory',
	};
	for (const directory of directories) await mkdir(join(root, directory), { recursive: true });
	for (const [name, value] of Object.entries(files)) {
		const path = name === 'node-runtime' ? runtime : join(root, name);
		await writeFile(path, value);
	}
	await chmod(runtime, 0o755);
	await symlink('daemon/index.js', join(root, 'out/entry'));
	const entries: [string, number, string | null][] = [];
	for (const directory of directories) entries.push([directory, (await lstat(join(root, directory))).mode, null]);
	for (const [name, value] of Object.entries(files)) {
		const path = name === 'node-runtime' ? runtime : join(root, name);
		entries.push([name, (await lstat(path)).mode, releaseMetadataDigest(Buffer.from(value))]);
	}
	entries.push(['out/entry', (await lstat(join(root, 'out/entry'))).mode, 'daemon/index.js']);
	const bytes = Buffer.from(JSON.stringify(entries));
	const reference = { bytes, digest: releaseMetadataDigest(bytes) };
	const raw = await measureManagedReleaseInventory(root, runtime, reference);
	assert.equal(await measureManagedReleaseInventory(root, runtime), raw);
	await assert.rejects(measureManagedReleaseInventory(root, runtime, { ...reference, digest: 'a'.repeat(64) }), /signed runtime inventory/);
	const native = join(root, 'node_modules/fixture/native.node');
	for (const value of ['CODE|data|bindings|signature', 'code|DATA|bindings|signature',
		'code|data|BINDINGS|signature', 'code|data|bindings|SIGNATURE', 'code|data|bindings|signature|extra']) {
		await writeFile(native, value);
		await assert.rejects(measureManagedReleaseInventory(root, runtime, reference), /differs from signed reference/);
		assert.notEqual(await measureManagedReleaseInventory(root, runtime), raw);
	}
	await writeFile(native, files['node_modules/fixture/native.node']);
	const module = join(root, 'node_modules/extra.js');
	await writeFile(module, 'injected module');
	await assert.rejects(measureManagedReleaseInventory(root, runtime, reference), /unexpected runtime inventory/);
	await rm(module);
	const optional = join(root, 'node_modules/optional');
	await mkdir(optional);
	await writeFile(join(optional, 'package.json'), '{}');
	await assert.rejects(measureManagedReleaseInventory(root, runtime, reference), /unexpected runtime inventory/);
	await rm(optional, { recursive: true });
	const entry = join(root, 'out/entry');
	await rm(entry);
	await symlink(runtime, entry);
	await assert.rejects(measureManagedReleaseInventory(root, runtime, reference), /link escapes/);
	await rm(entry);
	await symlink(join(root, 'out/daemon/index.js'), entry);
	await assert.rejects(measureManagedReleaseInventory(root, runtime, reference), /link escapes/);
	await rm(entry);
	await symlink('daemon/index.js', entry);
	const unmeasured = join(root, 'unmeasured.js');
	await writeFile(unmeasured, 'unmeasured executable');
	await rm(entry);
	await symlink('../unmeasured.js', entry);
	const escapingEntries = entries.map(item => item[0] === 'out/entry' ? [item[0], item[1], '../unmeasured.js'] : item);
	const escapingBytes = Buffer.from(JSON.stringify(escapingEntries));
	await assert.rejects(measureManagedReleaseInventory(root, runtime, {
		bytes: escapingBytes, digest: releaseMetadataDigest(escapingBytes),
	}), /link target is unmeasured/);
	await rm(entry);
	await symlink('daemon/index.js', entry);
	await rm(join(root, 'scripts/daemon-ctl.sh'));
	await assert.rejects(measureManagedReleaseInventory(root, runtime, reference), /entry is missing/);
});
