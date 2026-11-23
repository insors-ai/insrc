import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { appendFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { runtimePolicy, privateRuntimeEnvironment } from '../runtime-policy.js';
import { archiveFixture } from './_runtime-fixture.js';
import { renderInstallerBootstrap } from '../../../scripts/render-installer-bootstrap.mjs';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
const sha = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const q = (text: string): string => "'" + text.replaceAll("'", "'\\''") + "'";
async function runBootstrap(options: { corrupt?: boolean; wrongTarget?: boolean; missingTar?: boolean; trapNode?: boolean; cuda?: string; repeat?: boolean; tamper?: boolean } = {}) {
  const archive = await archiveFixture();
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'insrc-bootstrap-')), children: ChildProcess[] = [];
  try {
    const tools = join(root, 'tools'), home = join(root, 'data home Ω'); mkdirSync(tools);
    const native = join(root, 'control.node'); writeFileSync(native, 'digest-bound-native-fixture');
    const bootstrap = join(root, 'bootstrap.mjs');
    writeFileSync(bootstrap, `import fs from 'node:fs'; if(process.version!=='v22.22.1')throw Error('wrong runtime'); fs.writeFileSync(${JSON.stringify(join(root, 'result.json'))},JSON.stringify({version:process.version,argv:process.argv.slice(2),options:process.env.NODE_OPTIONS??null,nodePath:process.env.NODE_PATH??null,cuda:process.env.ONNXRUNTIME_NODE_INSTALL_CUDA}));`);
    const assets = { bootstrap: { url: 'https://fixture.invalid/bootstrap', sha256: sha(readFileSync(bootstrap)) }, native: { url: 'https://fixture.invalid/native', sha256: sha(readFileSync(native)) } };
    const script = renderInstallerBootstrap('posix', { [`${process.platform}-arm64`]: assets, [`${process.platform}-x64`]: assets });
    const path = join(root, 'install.sh'); writeFileSync(path, script, { mode: 0o700 });
    for (const [name, absolute] of Object.entries({ uname: '/usr/bin/uname', tar: '/usr/bin/tar', gzip: '/usr/bin/gzip', mktemp: '/usr/bin/mktemp', mkdir: '/bin/mkdir', chmod: '/bin/chmod', rm: '/bin/rm', shasum: '/usr/bin/shasum' })) {
      if (name !== 'tar' || !options.missingTar) symlinkSync(absolute, join(tools, name));
    }
    if (options.wrongTarget) {
      rmSync(join(tools, 'uname'));
      writeFileSync(join(tools, 'uname'), `#!/bin/sh\ncase "$1" in -s) echo ${process.platform === 'darwin' ? 'Darwin' : 'Linux'};; -m) echo ${process.arch === 'arm64' ? 'x86_64' : 'aarch64'};; esac\n`, { mode: 0o700 });
    }
    const official = options.corrupt ? join(root, 'corrupt.tar.gz') : archive; if (options.corrupt) writeFileSync(official, 'corrupt');
    writeFileSync(join(tools, 'curl'), `#!/bin/sh\nurl=; out=;\nwhile [ "$#" -gt 0 ]; do case "$1" in https://*) url=$1;; -o) shift; out=$1;; esac; shift; done\ncase "$url" in https://nodejs.org/*) /bin/cp ${q(official)} "$out";; https://fixture.invalid/bootstrap) /bin/cp ${q(bootstrap)} "$out";; https://fixture.invalid/native) /bin/cp ${q(native)} "$out";; *) exit 89;; esac\n`, { mode: 0o700 });
    if (options.trapNode) writeFileSync(join(tools, 'node'), `#!/bin/sh\necho called > ${q(join(root, 'host-node-called'))}\nexit 88\n`, { mode: 0o700 });
    async function invoke() {
      const child = spawnFixture('/bin/sh', [path, '--home', home, '--installation-id', 'fixture'], { env: { ...process.env, PATH: tools, NODE_OPTIONS: '--require=/must-not-be-loaded', NODE_PATH: '/must-not-be-used', ...(options.cuda === undefined ? {} : { ONNXRUNTIME_NODE_INSTALL_CUDA: options.cuda }) }, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
      let output = ''; child.stdout!.on('data', (b: Buffer) => { output += b; }); child.stderr!.on('data', (b: Buffer) => { output += b; });
      const [code] = await once(child, 'close'); return { code, output };
    }
    let { code, output } = await invoke();
    if (options.repeat || options.tamper) {
      assert.equal(code, 0, output);
      const publishedNode = join(home, 'runtimes/22.22.1', `${process.platform}-${process.arch}`, 'bin/node');
      const inode = lstatSync(publishedNode).ino;
      if (options.tamper) { appendFileSync(publishedNode, 'tampered'); rmSync(join(root, 'result.json')); }
      ({ code, output } = await invoke());
      assert.equal(lstatSync(publishedNode).ino, inode, 'existing runtime must never be replaced');
    }
    const result = existsSync(join(root, 'result.json')) ? JSON.parse(readFileSync(join(root, 'result.json'), 'utf8')) : undefined;
    return { code, output, result, hostNodeCalled: existsSync(join(root, 'host-node-called')) };
  } finally { await stopOwnedChildren(children); rmSync(root, { recursive: true, force: true }); }
}

test('bootstrap rejects corrupt wrong target runtime and missing extraction prerequisites', { timeout: 120_000 }, async () => {
  for (const options of [{ corrupt: true }, { wrongTarget: true }, { missingTar: true }]) {
    const result = await runBootstrap(options);
    assert.notEqual(result.code, 0, result.output); assert.equal(result.result, undefined);
    assert.match(result.output, options.missingTar ? /prerequisite missing: tar/ : /digest mismatch/);
  }
});

test('bootstrap works with missing or wrong host Node and clears Node injection', { timeout: 120_000 }, async () => {
  for (const trapNode of [false, true]) {
    const result = await runBootstrap({ trapNode, cuda: '' });
    assert.equal(result.code, 0, result.output); assert.equal(result.hostNodeCalled, false);
    assert.equal(result.result.version, 'v22.22.1'); assert.equal(result.result.options, null); assert.equal(result.result.nodePath, null); assert.equal(result.result.cuda, '');
    assert.ok(result.result.argv.includes('--home')); assert.ok(result.result.argv.includes('fixture'));
  }
});

test('private runtime policy matches native headers and preserves explicit CUDA setting', () => {
  assert.equal(runtimePolicy.nodeVersion, '22.22.1'); assert.equal(runtimePolicy.npmVersion, '10.9.4');
  assert.match(readFileSync('.npmrc', 'utf8'), new RegExp(`target="${runtimePolicy.headersVersion.replaceAll('.', '\\.')}"`));
  assert.equal(privateRuntimeEnvironment({}).ONNXRUNTIME_NODE_INSTALL_CUDA, 'skip');
  for (const value of ['', '0', 'skip', 'custom']) assert.equal(privateRuntimeEnvironment({ ONNXRUNTIME_NODE_INSTALL_CUDA: value, NODE_OPTIONS: 'inject', NODE_PATH: 'inject' }).ONNXRUNTIME_NODE_INSTALL_CUDA, value);
  assert.equal(privateRuntimeEnvironment({ NODE_OPTIONS: 'inject', NODE_PATH: 'inject' }).NODE_OPTIONS, undefined);
  const powershell = renderInstallerBootstrap('powershell', { 'win32-arm64': { bootstrap: { url: 'https://example.invalid/bootstrap', sha256: 'a'.repeat(64) }, native: { url: 'https://example.invalid/native', sha256: 'b'.repeat(64) } } });
  assert.match(powershell, /d0722fcdefa1c08e4af31809e91ad4f23282f6c535c261607e8aa372d0ce61dd/);
  assert.doesNotMatch(powershell, /ExecutionPolicy|Start-Process.+RunAs/);
  assert.throws(() => renderInstallerBootstrap('posix', { 'linux-x64': { bootstrap: { url: 'http://example.invalid', sha256: 'a'.repeat(64) }, native: { url: 'https://example.invalid', sha256: 'b'.repeat(64) } } }), /invalid digest-bound/);
});


test('bootstrap reuses identical runtime and refuses changed immutable runtime', { timeout: 120_000 }, async () => {
  const repeated = await runBootstrap({ repeat: true }); assert.equal(repeated.code, 0, repeated.output);
  const changed = await runBootstrap({ tamper: true }); assert.notEqual(changed.code, 0);
  assert.match(changed.output, /immutable publication differs/); assert.equal(changed.result, undefined);
});
