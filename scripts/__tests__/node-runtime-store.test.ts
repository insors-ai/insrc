import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

const { NODE_RUNTIME_POLICY, renderNodeRuntimeShell } = await import(new URL('../node-runtime-policy.mjs', import.meta.url).href);
const { runtimeInventory, writeSourceRuntimeBinding } = await import(new URL('../node-runtime-store.mjs', import.meta.url).href);
const target = `${process.platform}-${process.arch}`;
const prefix = `node-v22.22.1-${target}`;
type Entry = { path: string; content?: string; type?: string; link?: string; mode?: number };

// Small explicit archive fixtures exercise bootstrap trust boundaries. Their Node
// is a recording shim, NOT a native runtime qualification; t7 uses official bytes.
function archive(entries: Entry[]): Buffer {
	const parts: Buffer[] = [];
	for (const entry of entries) {
		const header = Buffer.alloc(512), data = Buffer.from(entry.content ?? '');
		header.write(entry.path, 0, 100); header.write((entry.mode ?? 0o600).toString(8).padStart(7, '0') + '\0', 100, 8);
		header.write('0000000\0', 108); header.write('0000000\0', 116);
		header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136);
		header.fill(32, 148, 156); header.write(entry.type ?? '0', 156); header.write(entry.link ?? '', 157, 100);
		header.write('ustar\0', 257); header.write('00', 263);
		header.write(header.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
		parts.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
	}
	return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}

function fixture(extra: Entry[] = [], version = '22.22.1', arch = target) {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-runtime-test-')));
	const scripts = join(root, 'scripts'); mkdirSync(scripts); mkdirSync(join(root, 'src/assets'), { recursive: true });
	for (const file of ['provision-node-runtime.sh', 'node-runtime-archive.sh', 'node-runtime-policy.mjs', 'node-runtime-store.mjs']) {
		copyFileSync(new URL(`../${file}`, import.meta.url), join(scripts, file));
	}
	const shim = `#!/bin/sh\nif [ -n "\${INSRC_RUNTIME_TEST_MARKER:-}" ] && [ ! -f "$INSRC_RUNTIME_TEST_MARKER" ]; then\n printf ready > "$INSRC_RUNTIME_TEST_MARKER"\n /bin/sleep 2\nfi\nif [ "$1" = '-p' ]; then\n case "$2" in process.versions.node) printf '%s\\n' '${version}' ;; *) printf '%s\\n' '${arch}' ;; esac\nelse\n exec '${process.execPath.replaceAll("'", "'\\''")}' "$@"\nfi\n`;
	const bytes = archive([{ path: `${prefix}/bin/node`, mode: 0o700, content: shim },
		{ path: `${prefix}/lib/node_modules/npm/bin/npm-cli.js`, content: "process.stdout.write('10.9.4\\n');" },
		{ path: `${prefix}/LICENSE`, content: 'fixture license' }, ...extra]);
	const hash = createHash('sha256').update(bytes).digest('hex');
	const policy = structuredClone(NODE_RUNTIME_POLICY);
	policy.targets[target] = { ...policy.targets[target], enabled: true, qualification: 'docs/fixture.md', sha256: hash };
	writeFileSync(join(root, 'src/assets/node-runtime-policy.json'), JSON.stringify(policy));
	writeFileSync(join(scripts, 'node-runtime-policy.sh'), renderNodeRuntimeShell(policy));
	const input = join(root, 'input.tar.gz'); writeFileSync(input, bytes);
	const state = join(root, 'home/.insrc'), script = join(scripts, 'provision-node-runtime.sh');
	const object = join(state, 'runtimes', `node-v22.22.1-${target}`, hash), distribution = join(object, 'distribution');
	const env = { HOME: join(root, 'home'), PATH: '/usr/bin:/bin', NODE_OPTIONS: '--invalid-injected-node-option', NODE_PATH: '/external' };
	const run = (offline = true) => spawnSync('/bin/bash', [script, state, ...(offline ? [input] : [])], { env, encoding: 'utf8', timeout: 20000 });
	return { root, state, input, script, object, distribution, policy, env, run,
		clean: () => rmSync(root, { recursive: true, force: true }) };
}

test('bootstraps without PATH Node and reuses a verified cache offline', () => {
	const f = fixture();
	try {
		const first = f.run(); assert.equal(first.status, 0, first.stderr); assert.equal(first.stdout.trim(), f.distribution);
		assert.ok(existsSync(join(f.distribution, 'bin/node'))); assert.ok(existsSync(join(f.distribution, 'LICENSE')));
		rmSync(f.input);
		const second = f.run(false); assert.equal(second.status, 0, second.stderr); assert.equal(second.stdout.trim(), f.distribution);
		assert.ok(!existsSync(`${f.object}.lock`));
	} finally { f.clean(); }
});

test('rejects digest traversal links devices and runtime identity before publication', () => {
	const bad = [
		{ extra: [{ path: `${prefix}/../escape`, content: 'bad' }] },
		{ extra: [{ path: `${prefix}/link`, type: '2', link: '/outside' }] },
		{ extra: [{ path: `${prefix}/device`, type: '3' }] },
		{ extra: [], version: '20.18.0' },
		{ extra: [], arch: 'wrong-architecture' },
	];
	for (const input of bad) {
		const f = fixture(input.extra, input.version, input.arch);
		try {
			const result = f.run(); assert.notEqual(result.status, 0); assert.ok(!existsSync(f.object));
			assert.ok(!existsSync(`${f.object}.lock`));
			assert.deepEqual(readdirSync(resolve(f.object, '..')), []);
		} finally { f.clean(); }
	}
	const f = fixture();
	try { writeFileSync(f.input, 'corrupt'); const r = f.run(); assert.notEqual(r.status, 0); assert.match(r.stderr, /SHA-256 mismatch/); }
	finally { f.clean(); }
});

test('rejects cache corruption even when its cached inventory is rewritten', () => {
	const f = fixture();
	try {
		assert.equal(f.run().status, 0);
		writeFileSync(join(f.distribution, 'LICENSE'), 'changed');
		writeFileSync(join(f.object, 'inventory.json'), runtimeInventory(f.distribution));
		const result = f.run(false); assert.notEqual(result.status, 0); assert.match(result.stderr, /inventory mismatch/);
		assert.equal(readFileSync(join(f.distribution, 'LICENSE'), 'utf8'), 'changed', 'failed verification never deletes a selected object');
	} finally { f.clean(); }
});

test('serializes concurrent publication and removes only owned failed stages', () => {
	const f = fixture();
	try {
		const child = spawnSync('/bin/bash', ['-c',
			'"/bin/bash" "$1" "$2" "$3" > "$4/a" & first=$!; "/bin/bash" "$1" "$2" "$3" > "$4/b" & second=$!; wait "$first"; a=$?; wait "$second"; b=$?; test "$a" = 0 && test "$b" = 0',
			'test', f.script, f.state, f.input, f.root], { env: f.env, encoding: 'utf8', timeout: 25000 });
		assert.equal(child.status, 0, child.stderr);
		assert.equal(readFileSync(join(f.root, 'a'), 'utf8').trim(), f.distribution);
		assert.equal(readFileSync(join(f.root, 'b'), 'utf8').trim(), f.distribution);
		assert.deepEqual(readdirSync(resolve(f.object, '..')), [f.object.split('/').at(-1)]);
	} finally { f.clean(); }
});

test('publishes one canonical binding and refuses escaping or unqualified roots', () => {
	const f = fixture();
	try {
		assert.equal(f.run().status, 0);
		const installation = join(f.root, 'installation'); mkdirSync(installation);
		const disabled = structuredClone(f.policy); disabled.targets[target].enabled = false; disabled.targets[target].qualification = null;
		assert.throws(() => writeSourceRuntimeBinding(f.state, installation, f.distribution, disabled), /unqualified/);
		assert.throws(() => writeSourceRuntimeBinding(f.state, installation, f.root, f.policy), /escapes/);
		const record = writeSourceRuntimeBinding(f.state, installation, f.distribution, f.policy);
		assert.equal(record.distribution, f.distribution); assert.equal(record.archiveSha256, f.policy.targets[target].sha256);
		assert.equal(readdirSync(join(f.state, 'source-runtimes')).length, 1);
		writeSourceRuntimeBinding(f.state, installation, f.distribution, f.policy);
		assert.equal(readdirSync(join(f.state, 'source-runtimes')).length, 1);
		writeFileSync(join(f.distribution, 'LICENSE'), 'changed');
		writeFileSync(join(f.object, 'inventory.json'), runtimeInventory(f.distribution));
		assert.throws(() => writeSourceRuntimeBinding(f.state, installation, f.distribution, f.policy), /inventory mismatch/);
		assert.equal(readdirSync(join(f.state, 'source-runtimes')).length, 1, 'a rejected binding leaves the old selection');
	} finally { f.clean(); }
});

test('cleans an actually interrupted bootstrap and retries without publishing partial state', async () => {
	const f = fixture(), marker = join(f.root, 'paused');
	const child = spawn('/bin/bash', [f.script, f.state, f.input], {
		env: { ...f.env, INSRC_RUNTIME_TEST_MARKER: marker }, stdio: 'ignore',
	});
	const closed = new Promise<number | null>((resolve, reject) => {
		child.once('error', reject); child.once('close', code => resolve(code));
	});
	try {
		for (let i = 0; i < 250 && !existsSync(marker); i++) await new Promise(resolve => setTimeout(resolve, 20));
		assert.ok(existsSync(marker), 'retained child reached the staged version probe');
		assert.equal(child.kill('SIGTERM'), true, 'signal only this retained child, never search by PID');
		assert.equal(await closed, 143);
		assert.ok(!existsSync(f.object)); assert.ok(!existsSync(`${f.object}.lock`));
		assert.deepEqual(readdirSync(resolve(f.object, '..')), []);
		assert.equal(f.run().status, 0);
	} finally {
		if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
		await closed; f.clean();
	}
});

test('retries incomplete provisioning without selecting or deleting an unrelated stage', () => {
	const f = fixture();
	try {
		const original = readFileSync(f.input);
		const retained = join(resolve(f.object, '..'), '.prepare-interrupted');
		mkdirSync(retained, { recursive: true }); writeFileSync(join(retained, 'partial'), 'retained owner');
		writeFileSync(f.input, original.subarray(0, Math.floor(original.length / 2)));
		assert.notEqual(f.run().status, 0); assert.ok(!existsSync(f.object));
		assert.equal(readFileSync(join(retained, 'partial'), 'utf8'), 'retained owner');
		writeFileSync(f.input, original);
		const result = f.run(); assert.equal(result.status, 0, result.stderr);
		assert.equal(readFileSync(join(retained, 'partial'), 'utf8'), 'retained owner');
	} finally { f.clean(); }
});

test('binding interruption preserves the old record and selected runtime without deleting referenced objects', async () => {
 const f=fixture();
 const fs=(await import('node:fs')).default;
 const {syncBuiltinESMExports}=await import('node:module');
 const rename=fs.renameSync;
 try {
  assert.equal(f.run().status,0);const installation=join(f.root,'installation');mkdirSync(installation);
  writeSourceRuntimeBinding(f.state,installation,f.distribution,f.policy);
  const directory=join(f.state,'source-runtimes'),file=join(directory,readdirSync(directory)[0]!);
  const before=readFileSync(file);
  fs.renameSync=(from,to)=>{if(to===file)throw Error('interrupted before binding publication');return rename(from,to);};syncBuiltinESMExports();
  assert.throws(()=>writeSourceRuntimeBinding(f.state,installation,f.distribution,f.policy),/interrupted before binding/);
  assert.deepEqual(readFileSync(file),before);assert.deepEqual(readdirSync(directory),[file.split('/').at(-1)]);
  assert.ok(existsSync(join(f.distribution,'bin/node')));assert.ok(existsSync(join(f.object,'archive.tar.gz')));
 } finally {fs.renameSync=rename;syncBuiltinESMExports();f.clean();}
});

test('source binding consumption rejects changed metadata and escaping directories',()=>{
 const f=fixture();
 try{
  assert.equal(f.run().status,0);const installation=join(f.root,'installation');mkdirSync(installation);
  const store=join(f.root,'scripts/node-runtime-store.mjs');
  const command=(mode:string)=>spawnSync(process.execPath,[store,mode,f.state,installation,f.distribution],{env:{...f.env,NODE_OPTIONS:'',NODE_PATH:''},encoding:'utf8'});
  assert.equal(command('bind').status,0);assert.equal(command('binding').status,0);
  const directory=join(f.state,'source-runtimes'),file=join(directory,readdirSync(directory)[0]!);
  const record=JSON.parse(readFileSync(file,'utf8'));record.archiveSha256='0'.repeat(64);writeFileSync(file,JSON.stringify(record));
  const bad=command('binding');assert.notEqual(bad.status,0);assert.match(bad.stderr,/does not match/);
  const retained=join(f.root,'retained-bindings');renameSync(directory,retained);symlinkSync(retained,directory);
  const escaped=command('binding');assert.notEqual(escaped.status,0);assert.match(escaped.stderr,/unsafe binding directory/);
 }finally{f.clean();}
});
