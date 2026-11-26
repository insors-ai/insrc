import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import type { Target } from '../contracts.js';
import { runtimePolicy, privateRuntimeEnvironment, runtimeArchive, runtimeStorePaths } from '../runtime-policy.js';
import { ControllerStore } from '../controller-store.js';
import { resolveInstallationLocation } from '../location.js';
import { archiveFixture, node22Fixture } from './_runtime-fixture.js';
import { renderInstallerBootstrap } from '../../../scripts/render-installer-bootstrap.mjs';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

const sha = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const q = (text: string): string => "'" + text.replaceAll("'", "'\\''") + "'";
const target: Target = { os: process.platform as Target['os'], arch: process.arch as Target['arch'], baseline: 'native-v1' };
let built: Promise<{ directory: string; bootstrap: string; native: string }> | undefined;
async function controlSource() {
  return built ??= (async () => {
    const directory = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'ibc-')), entry = join(directory, 'fixture.mjs'), bootstrap = join(directory, 'bootstrap.mjs');
    const helper = fileURLToPath(new URL('../../../out/installer/bootstrap-foundation.js', import.meta.url));
    const store = fileURLToPath(new URL('../../../out/installer/controller-store.js', import.meta.url));
    const location = fileURLToPath(new URL('../../../out/installer/location.js', import.meta.url));
    fs.writeFileSync(entry, `import fs from 'node:fs';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {publishBootstrapFoundation} from ${JSON.stringify(helper)};import {ControllerStore} from ${JSON.stringify(store)};import {resolveInstallationLocation} from ${JSON.stringify(location)};
const target=${JSON.stringify(target)};const event=(name,extra={})=>fs.appendFileSync(process.env.INSRC_BOOTSTRAP_TEST_EVENTS,JSON.stringify({name,pid:process.pid,node:process.execPath,time:Date.now(),...extra})+'\\n');
export async function terminalMain(args=process.argv.slice(2)){
 if(args[0]==='--bootstrap-publication'){
  const native=join(dirname(fileURLToPath(import.meta.url)),'native/control.node');const before=[fs.lstatSync(process.execPath).ino,fs.lstatSync(native).ino];event('helper-start',{work:args[3],control:dirname(native)});
  const abort=new AbortController();const cancel=()=>abort.abort(Error('fixture interrupt'));process.once('SIGINT',cancel);let timer;if(process.env.INSRC_BOOTSTRAP_TEST_CANCEL==='1')timer=setTimeout(()=>process.emit('SIGINT'),20);
  try{await publishBootstrapFoundation(target,args.slice(1),abort.signal);clearTimeout(timer);event('helper-after-close',{sameExecution:before[0]===fs.lstatSync(process.execPath).ino&&before[1]===fs.lstatSync(native).ino});process.once('exit',()=>event('helper-exit'));setTimeout(()=>process.exit(0),40);}
  catch(error){event('helper-error',{message:error.message});process.stderr.write(error.message+'\\n');process.exit(1);}return;
 }
 const home=args[args.indexOf('--home')+1];const owner=ControllerStore.acquire(resolveInstallationLocation('fixture',{home}));event('manager-fresh-lock');owner.close();
 fs.writeFileSync(process.env.INSRC_BOOTSTRAP_TEST_RESULT,JSON.stringify({version:process.version,node:process.execPath,argv:args,options:process.env.NODE_OPTIONS??null,nodePath:process.env.NODE_PATH??null,cuda:process.env.ONNXRUNTIME_NODE_INSTALL_CUDA,tty:[!!process.stdin.isTTY,!!process.stdout.isTTY,!!process.stderr.isTTY]}));
 if(process.env.INSRC_BOOTSTRAP_TEST_TUI==='1'){const code="require('node:fs').writeFileSync(process.env.INSRC_BOOTSTRAP_TEST_TUI_RESULT,JSON.stringify([!!process.stdin.isTTY,!!process.stdout.isTTY,!!process.stderr.isTTY]))";const child=spawnSync(process.execPath,['-e',code],{stdio:'inherit'});if(child.error)throw child.error;process.exitCode=child.status??1;}
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fs.realpathSync(fileURLToPath(import.meta.url)))terminalMain().catch(error=>{process.stderr.write(error.message+'\\n');process.exitCode=1;});`, { mode: 0o600 });
    const runtime = await node22Fixture(), children: ChildProcess[] = [];
    try {
      const child = spawnFixture(runtime.executable, [fileURLToPath(new URL('./bootstrap-bundle-fixture.mjs', import.meta.url)), directory, entry, bootstrap, JSON.stringify(target)], { stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
      let output = ''; child.stderr!.on('data', (b: Buffer) => { output += b; });
      assert.equal((await once(child, 'close'))[0], 0, output); fs.chmodSync(bootstrap, 0o600);
      return { directory, bootstrap, native: fileURLToPath(new URL('../../../out/installer/native/control.node', import.meta.url)) };
    } catch (error) { fs.rmSync(directory, { recursive: true, force: true }); throw error; }
    finally { await stopOwnedChildren(children); runtime.cleanup(); }
  })();
}
after(async () => { if (built) { const source = await built; fs.rmSync(source.directory, { recursive: true, force: true }); } });

async function fixture(options: { corruptArchive?: boolean; corruptNode?: boolean; corruptNative?: boolean; wrongTarget?: boolean; missingTar?: boolean; trapNode?: boolean; tty?: boolean; cancel?: boolean } = {}) {
  const source = await controlSource(), archive = await archiveFixture();
  const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'ibt-')), home = join(root, "data home Ω's"), tools = join(root, 'tools'), children: ChildProcess[] = [];
  fs.mkdirSync(tools);
  const assets = { target, bootstrap: { url: 'https://fixture.invalid/bootstrap', sha256: sha(fs.readFileSync(source.bootstrap)) }, native: { url: 'https://fixture.invalid/native', sha256: sha(fs.readFileSync(source.native)) } };
  const script = join(root, 'install.sh'); fs.writeFileSync(script, renderInstallerBootstrap('posix', { [`${target.os}-${target.arch}`]: assets, [`${target.os}-${target.arch === 'arm64' ? 'x64' : 'arm64'}`]: { ...assets, target: { ...target, arch: target.arch === 'arm64' ? 'x64' : 'arm64' } } }), { mode: 0o700 });
  for (const [name, absolute] of Object.entries({ uname: '/usr/bin/uname', tar: '/usr/bin/tar', gzip: '/usr/bin/gzip', mktemp: '/usr/bin/mktemp', mkdir: '/bin/mkdir', chmod: '/bin/chmod', rm: '/bin/rm', wc: '/usr/bin/wc', shasum: '/usr/bin/shasum' })) if (name !== 'tar' || !options.missingTar) fs.symlinkSync(absolute, join(tools, name));
  if (options.wrongTarget) {
    fs.rmSync(join(tools, 'uname')); fs.writeFileSync(join(tools, 'uname'), `#!/bin/sh\ncase "$1" in -s) echo ${process.platform === 'darwin' ? 'Darwin' : 'Linux'};; -m) echo ${process.arch === 'arm64' ? 'x86_64' : 'aarch64'};; esac\n`, { mode: 0o700 });
  }
  if (options.corruptNode) {
    fs.rmSync(join(tools, 'tar')); fs.writeFileSync(join(tools, 'tar'), '#!/bin/sh\n/usr/bin/tar "$@" || exit $?\nprev=;out=;last=;for arg in "$@";do [ "$prev" != -C ] || out=$arg;prev=$arg;last=$arg;done\nprintf tamper >> "$out/$last"\n', { mode: 0o700 });
  }
  const bad = join(root, 'bad'); fs.writeFileSync(bad, 'corrupt');
  fs.writeFileSync(join(tools, 'curl'), `#!/bin/sh\n[ ! -e ${q(join(root, 'offline'))} ] || exit 97\nurl=;out=;while [ "$#" -gt 0 ];do case "$1" in https://*) url=$1;; -o) shift;out=$1;;esac;shift;done\nprintf '%s\\n' "$url" >> ${q(join(root, 'network.log'))}\ncase "$url" in https://nodejs.org/*) /bin/cp ${q(options.corruptArchive ? bad : archive)} "$out";; https://fixture.invalid/bootstrap) /bin/cp ${q(source.bootstrap)} "$out";; https://fixture.invalid/native) /bin/cp ${q(options.corruptNative ? bad : source.native)} "$out";; *) exit 89;;esac\n`, { mode: 0o700 });
  if (options.trapNode) fs.writeFileSync(join(tools, 'node'), `#!/bin/sh\necho called > ${q(join(root, 'host-node-called'))}\nexit 88\n`, { mode: 0o700 });
  const resultFile = join(root, 'result.json'), eventsFile = join(root, 'events.jsonl'), tuiFile = join(root, 'tui.json');
  const identity = { version: '22.22.1' as const, target, sha256: runtimeArchive(target).sha256, relativeExecutable: 'bin/node' }, paths = runtimeStorePaths(home, identity);
  async function invoke() {
    fs.rmSync(resultFile, { force: true });
    const args = [script, '--home', home, '--installation-id', 'fixture', '--operation-id', 'terminal-smoke'];
    const command = options.tty ? '/usr/bin/script' : '/bin/sh';
    const values = !options.tty ? args : process.platform === 'darwin' ? ['-q', '/dev/null', '/bin/sh', ...args] : ['-q', '-e', '-c', ['/bin/sh', ...args].map(q).join(' '), '/dev/null'];
    const child = spawnFixture(command, values, { env: { ...process.env, PATH: tools, NODE_OPTIONS: '--require=/must-not-load', NODE_PATH: '/must-not-load', ONNXRUNTIME_NODE_INSTALL_CUDA: '', INSRC_BOOTSTRAP_TEST_EVENTS: eventsFile, INSRC_BOOTSTRAP_TEST_RESULT: resultFile, INSRC_BOOTSTRAP_TEST_TUI_RESULT: tuiFile, INSRC_BOOTSTRAP_TEST_TUI: options.tty ? '1' : '0', INSRC_BOOTSTRAP_TEST_CANCEL: options.cancel ? '1' : '0' }, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
    let output = ''; child.stdout!.on('data', (b: Buffer) => { output += b; }); child.stderr!.on('data', (b: Buffer) => { output += b; });
    const [code] = await once(child, 'close'); return { code, output, result: fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : undefined };
  }
  return { root, home, paths, invoke, offline() { fs.writeFileSync(join(root, 'offline'), 'offline'); }, events() { return fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []; }, async clean() { await stopOwnedChildren(children); fs.rmSync(root, { recursive: true, force: true }); }, tuiFile };
}

test('bootstrap authenticates archive executable and control bytes before running code and diagnoses prerequisites', { timeout: 120_000 }, async () => {
  for (const options of [{ corruptArchive: true }, { wrongTarget: true }, { missingTar: true }, { corruptNode: true }, { corruptNative: true }]) {
    const f = await fixture(options);
    try { const result = await f.invoke(); assert.notEqual(result.code, 0, result.output); assert.equal(result.result, undefined); assert.deepEqual(f.events(), []); assert.match(result.output, /prerequisite missing: tar|size mismatch|digest mismatch/); }
    finally { await f.clean(); }
  }
});

test('bootstrap uses real native publication exact helper exit and a fresh manager lock without host Node', { timeout: 180_000 }, async () => {
  for (const trapNode of [false, true]) {
    const f = await fixture({ trapNode });
    try {
      const result = await f.invoke(); assert.equal(result.code, 0, result.output);
      assert.equal(result.result.version, 'v22.22.1'); assert.equal(result.result.options, null); assert.equal(result.result.nodePath, null); assert.equal(result.result.cuda, '');
      assert.equal(fs.existsSync(join(f.root, 'host-node-called')), false);
      const events = f.events(); assert.deepEqual(events.map(e => e.name), ['helper-start', 'helper-after-close', 'helper-exit', 'manager-fresh-lock']);
      assert.equal(events[1].sameExecution, true); assert.notEqual(events[0].pid, events[3].pid);
      assert.ok(events[3].time >= events[2].time); assert.match(events[0].node, /bootstrap-stage\..*\/execution\//);
      assert.equal(result.result.node, join(f.paths.directory, 'bin/node'));
      assert.equal(fs.existsSync(join(f.home, 'install', 'controller.json')), false, 'publication is not enrollment');
    } finally { await f.clean(); }
  }
});

test('bootstrap reuses verified cached runtime and control offline with quoted Unicode paths', { timeout: 120_000 }, async () => {
  const f = await fixture({ trapNode: true });
  try {
    const first = await f.invoke(); assert.equal(first.code, 0, first.output);
    const node = join(f.paths.directory, 'bin/node'), before = fs.lstatSync(node), network = fs.readFileSync(join(f.root, 'network.log'), 'utf8'); f.offline();
    for (const command of ['curl', 'tar', 'gzip']) fs.unlinkSync(join(f.root, 'tools', command));
    const repeated = await f.invoke(); assert.equal(repeated.code, 0, repeated.output);
    assert.equal(fs.readFileSync(join(f.root, 'network.log'), 'utf8'), network); assert.equal(fs.lstatSync(node).ino, before.ino);
    assert.ok(repeated.result.argv.includes(f.home)); assert.ok(repeated.result.argv.includes('terminal-smoke'));
    fs.appendFileSync(node, 'tamper'); const changed = await f.invoke(); assert.notEqual(changed.code, 0); assert.equal(changed.result, undefined); assert.match(changed.output, /digest mismatch/); assert.equal(fs.lstatSync(node).ino, before.ino);
  } finally { await f.clean(); }
});

test('bootstrap preserves incomplete immutable entries and lock conflicts without installation', { timeout: 120_000 }, async () => {
  const f = await fixture();
  try {
    const owner = ControllerStore.acquire(resolveInstallationLocation('fixture', { home: f.home }));
    try { const conflict = await f.invoke(); assert.notEqual(conflict.code, 0); assert.equal(conflict.result, undefined); owner.assertHeld(); assert.equal(fs.existsSync(f.paths.root), false); }
    finally { owner.close(); }
    const first = await f.invoke(); assert.equal(first.code, 0, first.output); f.offline();
    const original = fs.lstatSync(f.paths.root); fs.unlinkSync(f.paths.completion);
    const incomplete = await f.invoke(); assert.notEqual(incomplete.code, 0); assert.equal(incomplete.result, undefined); assert.equal(fs.lstatSync(f.paths.root).ino, original.ino); assert.equal(fs.existsSync(f.paths.completion), false);
  } finally { await f.clean(); }
});

test('bootstrap cancellation closes its publication child before cleanup and never launches the manager', { timeout: 120_000 }, async () => {
  const f = await fixture({ cancel: true });
  try { const result = await f.invoke(); assert.notEqual(result.code, 0); assert.equal(result.result, undefined); assert.ok(f.events().some(e => e.name === 'helper-error')); assert.equal(f.events().some(e => e.name === 'manager-fresh-lock'), false); assert.equal(fs.existsSync(f.paths.root), false); }
  finally { await f.clean(); }
});

test('concurrent terminal bootstraps keep one native owner and publish one immutable foundation', { timeout: 180_000 }, async () => {
  const f = await fixture();
  const first = f.invoke().catch(error => ({ code: -1, output: String(error), result: undefined }));
  try {
    const until = Date.now() + 30_000;
    while (!fs.existsSync(join(f.home, 'install')) || !fs.readdirSync(join(f.home, 'install')).some(name => name.startsWith('runtime-stage-'))) {
      assert.ok(Date.now() < until, 'first helper did not reach its owned runtime stage');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const second = await f.invoke(); assert.notEqual(second.code, 0, second.output); assert.equal(second.result, undefined);
    const finished = await first; assert.equal(finished.code, 0, finished.output);
    assert.equal(f.events().filter(event => event.name === 'manager-fresh-lock').length, 1);
    assert.ok(fs.existsSync(f.paths.completion));
    assert.deepEqual(fs.readdirSync(join(f.home, 'install')).filter(name => name.startsWith('runtime-stage-')), []);
  } finally { await first; await f.clean(); }
});

test('POSIX terminal I O and fixture TUI use the canonical runtime after helper exit', { timeout: 120_000 }, async () => {
  const f = await fixture({ tty: true, trapNode: true });
  try { const result = await f.invoke(); assert.equal(result.code, 0, result.output); assert.deepEqual(result.result.tty, [true, true, true]); assert.deepEqual(JSON.parse(fs.readFileSync(f.tuiFile, 'utf8')), [true, true, true]); }
  finally { await f.clean(); }
});

test('private runtime and PowerShell source preserve pinned policy nonmoving execution and fresh admission', () => {
  assert.equal(runtimePolicy.nodeVersion, '22.22.1'); assert.equal(runtimePolicy.npmVersion, '10.9.4');
  assert.match(fs.readFileSync('.npmrc', 'utf8'), /target="22\.22\.1"/);
  assert.equal(privateRuntimeEnvironment({}).ONNXRUNTIME_NODE_INSTALL_CUDA, 'skip');
  for (const value of ['', '0', 'skip', 'custom']) assert.equal(privateRuntimeEnvironment({ ONNXRUNTIME_NODE_INSTALL_CUDA: value, NODE_OPTIONS: 'inject', NODE_PATH: 'inject' }).ONNXRUNTIME_NODE_INSTALL_CUDA, value);
  const ps = renderInstallerBootstrap('powershell', { 'win32-arm64': { target: { os: 'win32', arch: 'arm64', baseline: 'native-v1' }, bootstrap: { url: 'https://example.invalid/bootstrap', sha256: 'a'.repeat(64) }, native: { url: 'https://example.invalid/native', sha256: 'b'.repeat(64) } } });
  assert.match(ps, /d0722fcdefa1c08e4af31809e91ad4f23282f6c535c261607e8aa372d0ce61dd/);
  assert.match(ps, /Verify-File \$node \$nodeSha/); assert.match(ps, /headers\.archive/); assert.match(ps, /node\.lib/);
  assert.ok(ps.indexOf('$helperExit = $LASTEXITCODE') < ps.indexOf('$node = $canonicalNode', ps.indexOf('$helperExit = $LASTEXITCODE')));
  assert.match(ps, /execution.zip/); assert.doesNotMatch(ps, /Move-Item|renameSync|ExecutionPolicy|Start-Process.+RunAs/); assert.match(ps, /@installArgs/); assert.match(ps, /exit \$installerExit/);
  assert.throws(() => renderInstallerBootstrap('posix', { 'linux-x64': { bootstrap: { url: 'http://example.invalid', sha256: 'a'.repeat(64) }, native: { url: 'https://example.invalid', sha256: 'b'.repeat(64) } } }), /invalid digest-bound/);
  // These are source assertions; actual Windows execution remains T10 evidence.
});
