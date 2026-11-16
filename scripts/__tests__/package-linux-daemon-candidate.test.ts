import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

const { inspectLinuxElf } = await import(new URL('../package-linux-daemon-candidate.mjs', import.meta.url).href);
const { stageRuntime } = await import(new URL('../package-daemon-candidate.mjs', import.meta.url).href);

test('Linux packaging rejects wrong ELF architecture and runtime ABI floors', () => {
	const elf = [
		'Class:                             ELF64',
		"Data:                              2's complement, little endian",
		'Machine:                           Advanced Micro Devices X86-64',
		'Type:                              DYN (Shared object file)',
		'[Requesting program interpreter: /lib64/ld-linux-x86-64.so.2]',
		'0x0000000000000001 (NEEDED)         Shared library: [libc.so.6]',
		'0x0000000000000001 (NEEDED)         Shared library: [libstdc++.so.6]',
		'Name: GLIBC_2.39  Flags: none Version: 10',
		'Name: GLIBCXX_3.4.32  Flags: none Version: 11',
	].join('\n');
	assert.deepEqual(inspectLinuxElf(elf), ['libc.so.6', 'libstdc++.so.6']);
	assert.throws(() => inspectLinuxElf(elf.replace('ELF64', 'ELF32')), /ELF class/);
	assert.throws(() => inspectLinuxElf(elf.replace('Advanced Micro Devices X86-64', 'AArch64')), /ELF class/);
	assert.throws(() => inspectLinuxElf(elf + '\nx86 ISA needed: x86-64-v3'), /ISA floor/);
	assert.throws(() => inspectLinuxElf(elf.replace('/lib64/ld-linux-x86-64.so.2', '/lib/ld-musl-x86_64.so.1')), /interpreter/);
	assert.throws(() => inspectLinuxElf(elf.replace('GLIBC_2.39', 'GLIBC_2.40')), /glibc ABI/);
	assert.throws(() => inspectLinuxElf(elf.replace('GLIBCXX_3.4.32', 'GLIBCXX_3.4.33')), /libstdc/);
});

test('Linux staging requires Linux entry points, retains matching native dependencies and refuses escaping links', async () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-linux-stage-')));
	const source = join(root, 'source');
	const stage = join(root, 'stage');
	const runtime = join(root, 'node', 'bin', 'node');
	const make = (path: string) => {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, path);
	};
	try {
		const required = 'out/bin/insrc-mcp.js';
		const longDeclaration = `node_modules/parser/${'x'.repeat(100)}.d.ts`;
		for (const file of [
			'out/daemon/index.js', 'out/cli/index.js', 'out/bin/insrc-shutdown-watchdog.js', 'out/bin/insrc-process-broker',
			'package.json', 'package-lock.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
			'scripts/daemon-ctl.sh', 'scripts/insrc', 'scripts/stage-daemon-bundle.mjs',
			'scripts/daemon-bundle-metadata.mjs', 'scripts/linux-daemon-metadata.mjs',
			'packages/project-memory/package.json', 'packages/project-memory/dist/index.js', 'packages/project-memory/LICENSE',
			'node_modules/parser/prebuilds/linux-x64/parser.node', 'node_modules/parser/prebuilds/darwin-arm64/parser.node',
			'node_modules/onnxruntime-node/bin/napi-v3/linux/x64/runtime.node',
			'node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_cuda.so',
			'node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/runtime.node',
			'node_modules/@img/sharp-libvips-linuxmusl-x64/lib/libvips-cpp.so.8',
			'node_modules/@lmdb/lmdb-linux-x64/node.napi.musl.node',
			'node_modules/oracledb/build/Release/oracledb-6.10.0-linux-x64.node',
			'node_modules/oracledb/build/Release/oracledb-6.10.0-linux-arm64.node',
			longDeclaration,
		]) make(join(source, file));
		make(runtime);
		make(join(root, 'node', 'LICENSE'));
		mkdirSync(join(source, 'node_modules', '@insrc'));
		symlinkSync('../../packages/project-memory', join(source, 'node_modules', '@insrc', 'project-memory'));
		mkdirSync(stage);
		await assert.rejects(stageRuntime(source, stage, runtime, 'linux-x64'), { code: 'ENOENT' });
		make(join(source, required));
		await stageRuntime(source, stage, runtime, 'linux-x64');
		assert(existsSync(join(stage, required)));
		assert(existsSync(join(stage, 'node_modules/parser/prebuilds/linux-x64/parser.node')));
		assert(!existsSync(join(stage, 'node_modules/parser/prebuilds/darwin-arm64/parser.node')));
		assert(!existsSync(join(stage, 'node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/runtime.node')));
		assert(!existsSync(join(stage, 'node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_cuda.so')));
		assert(!existsSync(join(stage, 'node_modules/@img/sharp-libvips-linuxmusl-x64')));
		assert(!existsSync(join(stage, 'node_modules/@lmdb/lmdb-linux-x64/node.napi.musl.node')));
		assert(existsSync(join(stage, 'node_modules/oracledb/build/Release/oracledb-6.10.0-linux-x64.node')));
		assert(!existsSync(join(stage, 'node_modules/oracledb/build/Release/oracledb-6.10.0-linux-arm64.node')));
		assert(!existsSync(join(stage, longDeclaration)));
		symlinkSync('/etc/passwd', join(source, 'node_modules', 'escape'));
		const invalid = join(root, 'invalid');
		mkdirSync(invalid);
		await assert.rejects(stageRuntime(source, invalid, runtime, 'linux-x64'), /unsupported runtime link/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
