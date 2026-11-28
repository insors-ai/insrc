import { test, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import type { Target } from '../contracts.js';
import { runtimePolicy, privateRuntimeEnvironment, runtimeArchive, runtimeStorePaths } from '../runtime-policy.js';
import { ControllerStore } from '../controller-store.js';
import { resolveInstallationLocation } from '../location.js';
import { archiveFixture, node22Fixture } from './_runtime-fixture.js';
import { renderInstallerBootstrap } from '../../../scripts/render-installer-bootstrap.mjs';
import { spawnFixture, stopOwnedChildren, waitFor } from '../../daemon/tools/__tests__/_proc.js';
import { ownedRuntimeHome } from './_owned-runtime-home.js';

const sha = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const q = (text: string): string => "'" + text.replaceAll("'", "'\\''") + "'";
const target: Target = { os: process.platform as Target['os'], arch: process.arch as Target['arch'], baseline: 'native-v1' };
interface BootstrapEvent { name: string; pid: number; node: string; time: number; sameExecution?: boolean; distinctPublication?: boolean; work?: string; code?: number }
let built: Promise<{ directory: string; bootstrap: string; native: string; clean: () => Promise<void> }> | undefined;
async function controlSource() {
  return built ??= (async () => {
    const capture = await ownedRuntimeHome('ibc-'), directory = capture.root, entry = join(directory, 'fixture.mjs'), bootstrap = join(directory, 'bootstrap.mjs');
    const children: ChildProcess[] = []; let runtime: Awaited<ReturnType<typeof node22Fixture>> | undefined;
    try {
    const main = fileURLToPath(new URL('../../../out/installer/terminal-main.js', import.meta.url));
    const store = fileURLToPath(new URL('../../../out/installer/controller-store.js', import.meta.url));
    const location = fileURLToPath(new URL('../../../out/installer/location.js', import.meta.url));
    fs.writeFileSync(entry, `import fs from 'node:fs';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
import {terminalMain as productionTerminalMain} from ${JSON.stringify(main)};import {ControllerStore} from ${JSON.stringify(store)};import {resolveInstallationLocation} from ${JSON.stringify(location)};
const target=${JSON.stringify(target)};const event=(name,extra={})=>fs.appendFileSync(process.env.INSRC_BOOTSTRAP_TEST_EVENTS,JSON.stringify({name,pid:process.pid,node:process.execPath,time:Date.now(),...extra})+'\\n');
export async function terminalMain(args=process.argv.slice(2)){
 if(args[0]==='--bootstrap-publication'){
  if(process.env.INSRC_BOOTSTRAP_TEST_WORK_ALIAS==='1'){args=[...args];args[3]=args[3].replace('/install/','//install//')+'/';}
  const native=join(dirname(fileURLToPath(import.meta.url)),'native/control.node');const before=[fs.lstatSync(process.execPath).ino,fs.lstatSync(native).ino];event('helper-start',{work:args[3],control:dirname(native)});
  if(process.env.INSRC_BOOTSTRAP_TEST_SIGNAL==='1'){
   const open=fs.promises.open;let held=false;fs.promises.open=async(...values)=>{const handle=await open(...values);if(!held&&String(values[0]).includes('runtime-stage-')){held=true;event('helper-publication-ready');await new Promise(resolve=>{let timer;const release=()=>{clearTimeout(timer);process.removeListener('SIGINT',release);process.removeListener('SIGTERM',release);process.removeListener('SIGHUP',release);resolve();};process.once('SIGINT',release);process.once('SIGTERM',release);process.once('SIGHUP',release);timer=setTimeout(release,10000);});}return handle;};syncBuiltinESMExports();
  }
  process.once('exit',code=>{if(code===0){const control=join(args[1],'install/bootstrap',args[4]+'-'+args[5]);const canonicalNode=join(args[1],'runtimes/22.22.1',target.os+'-'+target.arch+'-'+target.baseline,${JSON.stringify(runtimeArchive(target).sha256)},'distribution/bin/node');event('helper-after-close',{sameExecution:before[0]===fs.lstatSync(process.execPath).ino&&before[1]===fs.lstatSync(native).ino,distinctPublication:before[0]!==fs.lstatSync(canonicalNode).ino&&before[1]!==fs.lstatSync(join(control,'native/control.node')).ino});const tamper=process.env.INSRC_BOOTSTRAP_TEST_POST_TAMPER;if(tamper){const file=tamper==='node'?canonicalNode:join(control,tamper==='bootstrap'?'bootstrap.mjs':'native/control.node');if(tamper==='node')fs.chmodSync(file,fs.lstatSync(file).mode|0o200);fs.appendFileSync(file,'post-publication-tamper');}}else event('helper-error',{code});event('helper-exit',{code});});
  return productionTerminalMain(args);
 }
 const home=args[args.indexOf('--home')+1];const owner=ControllerStore.acquire(resolveInstallationLocation('fixture',{home}));event('manager-fresh-lock');owner.close();
 fs.writeFileSync(process.env.INSRC_BOOTSTRAP_TEST_RESULT,JSON.stringify({version:process.version,node:process.execPath,argv:args,options:process.env.NODE_OPTIONS??null,nodePath:process.env.NODE_PATH??null,cuda:process.env.ONNXRUNTIME_NODE_INSTALL_CUDA,tty:[!!process.stdin.isTTY,!!process.stdout.isTTY,!!process.stderr.isTTY]}));
 if(process.env.INSRC_BOOTSTRAP_TEST_TUI==='1'){const code="require('node:fs').writeFileSync(process.env.INSRC_BOOTSTRAP_TEST_TUI_RESULT,JSON.stringify([!!process.stdin.isTTY,!!process.stdout.isTTY,!!process.stderr.isTTY]))";const child=spawnSync(process.execPath,['-e',code],{stdio:'inherit'});if(child.error)throw child.error;process.exitCode=child.status??1;}
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fs.realpathSync(fileURLToPath(import.meta.url)))terminalMain().catch(error=>{process.stderr.write(error.message+'\\n');process.exitCode=1;});`, { mode: 0o600 });
      runtime = await node22Fixture();
      const child = capture.trackChild(spawnFixture(runtime.executable, [fileURLToPath(new URL('./bootstrap-bundle-fixture.mjs', import.meta.url)), directory, entry, bootstrap, JSON.stringify(target)], { stdio: ['ignore', 'pipe', 'pipe'] })); children.push(child);
      let output = ''; child.stderr!.on('data', (b: Buffer) => { output += b; });
      assert.equal((await once(child, 'close'))[0], 0, output); fs.chmodSync(bootstrap, 0o600);
      return { directory, bootstrap, native: fileURLToPath(new URL('../../../out/installer/native/control.node', import.meta.url)), clean: () => capture.cleanup() };
    } catch (cause) { await capture.cleanup(); throw cause; }
    finally { await stopOwnedChildren(children); runtime?.cleanup(); }
  })();
}
after(async () => { await built?.then(source => source.clean(), () => {}); });

async function fixture(options: { corruptArchive?: boolean; corruptNode?: boolean; corruptNative?: boolean; foreignArchivePinnedSize?: boolean; missingTar?: boolean; trapNode?: boolean; tty?: boolean; workAlias?: boolean; signal?: 'SIGINT' | 'SIGTERM' | 'SIGHUP'; postPublicationTamper?: 'node' | 'bootstrap' | 'native' } = {}) {
  const source = await controlSource(), archive = await archiveFixture();
  const capture = await ownedRuntimeHome('ibt-'), root = capture.root, home = join(root, "data home Ω's"), tools = join(root, 'tools');
  try {
  fs.mkdirSync(tools);
  const assets = { target, bootstrap: { url: 'https://fixture.invalid/bootstrap', sha256: sha(fs.readFileSync(source.bootstrap)) }, native: { url: 'https://fixture.invalid/native', sha256: sha(fs.readFileSync(source.native)) } };
  const script = join(root, 'install.sh'); fs.writeFileSync(script, renderInstallerBootstrap('posix', { [`${target.os}-${target.arch}`]: assets, [`${target.os}-${target.arch === 'arm64' ? 'x64' : 'arm64'}`]: { ...assets, target: { ...target, arch: target.arch === 'arm64' ? 'x64' : 'arm64' } } }), { mode: 0o700 });
  for (const [name, absolute] of Object.entries({ uname: '/usr/bin/uname', tar: '/usr/bin/tar', gzip: '/usr/bin/gzip', mktemp: '/usr/bin/mktemp', mkdir: '/bin/mkdir', chmod: '/bin/chmod', rm: '/bin/rm', wc: '/usr/bin/wc', shasum: '/usr/bin/shasum' })) if (name !== 'tar' || !options.missingTar) { fs.symlinkSync(absolute, join(tools, name)); capture.allowFixtureSymlink(join(tools, name)); }
  // Native fixture bytes with the foreign architecture's pinned byte count:
  // this row proves size rejection, not digest or target-identity rejection.
  if (options.foreignArchivePinnedSize) {
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
  async function invoke(requestedHome = home) {
    fs.rmSync(resultFile, { force: true });
    const args = [script, '--home', requestedHome, '--installation-id', 'fixture', '--operation-id', 'terminal-smoke'];
    const command = options.tty ? '/usr/bin/script' : '/bin/sh';
    const values = !options.tty ? args : process.platform === 'darwin' ? ['-q', '/dev/null', '/bin/sh', ...args] : ['-q', '-e', '-c', ['/bin/sh', ...args].map(q).join(' '), '/dev/null'];
    const child = capture.trackChild(spawnFixture(command, values, { env: { ...process.env, PATH: tools, NODE_OPTIONS: '--require=/must-not-load', NODE_PATH: '/must-not-load', ONNXRUNTIME_NODE_INSTALL_CUDA: '', INSRC_BOOTSTRAP_TEST_EVENTS: eventsFile, INSRC_BOOTSTRAP_TEST_RESULT: resultFile, INSRC_BOOTSTRAP_TEST_TUI_RESULT: tuiFile, INSRC_BOOTSTRAP_TEST_TUI: options.tty ? '1' : '0', INSRC_BOOTSTRAP_TEST_SIGNAL: options.signal ? '1' : '0', INSRC_BOOTSTRAP_TEST_POST_TAMPER: options.postPublicationTamper ?? '', INSRC_BOOTSTRAP_TEST_WORK_ALIAS: options.workAlias ? '1' : '0' }, stdio: ['ignore', 'pipe', 'pipe'] }));
    const closed = once(child, 'close');
    let output = ''; child.stdout!.on('data', (b: Buffer) => { output += b; }); child.stderr!.on('data', (b: Buffer) => { output += b; });
    if (options.signal) {
      assert.ok(await waitFor(() => events().some(e => e.name === 'helper-publication-ready') || child.exitCode !== null || child.signalCode !== null, 90000), 'publication readiness deadline');
      assert.ok(events().some(e => e.name === 'helper-publication-ready'), output);
      assert.equal(child.exitCode, null); assert.equal(child.signalCode, null); assert.ok(child.pid);
      process.kill(-child.pid, options.signal);
    }
    const [code, signal] = await closed; return { code, signal, output, result: fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : undefined };
  }
  function events(): BootstrapEvent[] { return fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []; }
  return { root, home, paths, control: join(home, 'install/bootstrap', assets.bootstrap.sha256 + '-' + assets.native.sha256), invoke, offline() { fs.writeFileSync(join(root, 'offline'), 'offline'); }, events, async clean() { await capture.cleanup(); }, tuiFile };
  } catch (cause) { await capture.cleanup(); throw cause; }
}

// Independent captured homes; bounded concurrency preserves all cases under the
// registered gate's shared deadline without sharing mutable fixture state.
describe('terminal bootstrap with protected runtimes', { concurrency: 2 }, () => {

test('bootstrap authenticates archive executable and control bytes before running code and diagnoses prerequisites', { timeout: 120_000 }, async () => {
  for (const [options, diagnostic] of [[{ corruptArchive: true }, /asset size mismatch/], [{ foreignArchivePinnedSize: true }, /asset size mismatch/], [{ missingTar: true }, /prerequisite missing: tar/], [{ corruptNode: true }, /asset digest mismatch/], [{ corruptNative: true }, /asset digest mismatch/]] as const) {
    const f = await fixture(options);
    try { const result = await f.invoke(); assert.notEqual(result.code, 0, result.output); assert.equal(result.result, undefined); assert.deepEqual(f.events(), []); assert.match(result.output, diagnostic); }
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
      assert.equal(events[1]!.sameExecution, true); assert.equal(events[1]!.distinctPublication, true); assert.notEqual(events[0]!.pid, events[3]!.pid);
      assert.ok(events[3]!.time >= events[2]!.time); assert.match(events[0]!.node, /bootstrap-stage\..*\/execution\//);
      assert.equal(result.result.node, join(f.paths.directory, 'bin/node'));
      assert.equal(fs.lstatSync(f.paths.root).mode & 0o7777, 0o500);
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
    // The authenticated cached helper must finish the exact root-only window,
    // even while its executing Node/control already live in canonical storage.
    const root = fs.lstatSync(f.paths.root); fs.chmodSync(f.paths.root, 0o700);
    const repeated = await f.invoke(); assert.equal(repeated.code, 0, repeated.output);
    assert.equal(fs.lstatSync(f.paths.root).mode & 0o7777, 0o500); assert.equal(fs.lstatSync(f.paths.root).ino, root.ino);
    assert.equal(fs.readFileSync(join(f.root, 'network.log'), 'utf8'), network); assert.equal(fs.lstatSync(node).ino, before.ino);
    assert.ok(repeated.result.argv.includes(f.home)); assert.ok(repeated.result.argv.includes('terminal-smoke'));
    // Deliberate same-user corruption after explicit fixture-only unsealing.
    fs.chmodSync(node, fs.lstatSync(node).mode | 0o200); fs.appendFileSync(node, 'tamper'); const changed = await f.invoke(); assert.notEqual(changed.code, 0); assert.equal(changed.result, undefined); assert.match(changed.output, /digest mismatch/); assert.equal(fs.lstatSync(node).ino, before.ino);
  } finally { await f.clean(); }
});

test('bootstrap preserves incomplete immutable entries and lock conflicts without installation', { timeout: 120_000 }, async () => {
  const f = await fixture();
  try {
    const owner = ControllerStore.acquire(resolveInstallationLocation('fixture', { home: f.home }));
    try { const conflict = await f.invoke(); assert.notEqual(conflict.code, 0); assert.equal(conflict.result, undefined); owner.assertHeld(); assert.equal(fs.existsSync(f.paths.root), false); }
    finally { owner.close(); }
    const first = await f.invoke(); assert.equal(first.code, 0, first.output); f.offline();
    const original = fs.lstatSync(f.paths.root); fs.chmodSync(f.paths.root, 0o700); fs.unlinkSync(f.paths.completion);
    const incomplete = await f.invoke(); assert.notEqual(incomplete.code, 0); assert.equal(incomplete.result, undefined); assert.equal(fs.lstatSync(f.paths.root).ino, original.ino); assert.equal(fs.existsSync(f.paths.completion), false);
  } finally { await f.clean(); }
});

test('bootstrap cancellation closes its publication child before cleanup and never launches the manager', { timeout: 120_000 }, async () => {
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]] as const) {
    const f = await fixture({ signal });
    try {
      const result = await f.invoke(); assert.equal(result.code, code, result.output); assert.equal(result.signal, null);
      assert.equal(result.result, undefined); assert.ok(f.events().some(e => e.name === 'helper-publication-ready'));
      assert.ok(f.events().some(e => e.name === 'helper-error')); assert.equal(f.events().some(e => e.name === 'manager-fresh-lock'), false);
      assert.match(result.output, /cancelled: Bootstrap publication interrupted/);
      assert.doesNotMatch(result.output, /publication child exit unconfirmed/);
      assert.equal(fs.existsSync(f.paths.root), false);
      assert.deepEqual(fs.readdirSync(join(f.home, 'install')).filter(name => /^(bootstrap|runtime)-stage\./.test(name) || name.startsWith('runtime-stage-')), []);
    } finally { await f.clean(); }
  }
});

test('bootstrap canonicalizes trailing and repeated separators before publication and cached reuse', { timeout: 120_000 }, async () => {
  const f = await fixture();
  try {
    const first = await f.invoke(f.home + '/'); assert.equal(first.code, 0, first.output); assert.ok(first.result.argv.includes(f.home));
    const inode = fs.lstatSync(join(f.paths.directory, 'bin/node')).ino; f.offline();
    const repeated = await f.invoke(dirname(f.home) + '//' + f.home.slice(dirname(f.home).length + 1));
    assert.equal(repeated.code, 0, repeated.output); assert.ok(repeated.result.argv.includes(f.home));
    assert.equal(fs.lstatSync(join(f.paths.directory, 'bin/node')).ino, inode);
  } finally { await f.clean(); }
});

test('bootstrap publication normalizes aliased work before containment and asset transport', { timeout: 180_000 }, async () => {
  const f = await fixture({ workAlias: true, trapNode: true });
  try {
    const result = await f.invoke(); assert.equal(result.code, 0, result.output);
    const events = f.events(); assert.match(events[0]!.work!, /\/\/install\/\/bootstrap-stage\.[A-Za-z0-9-]+\/$/);
    assert.equal(events[1]!.sameExecution, true); assert.equal(events[1]!.distinctPublication, true);
    assert.equal(events.at(-1)!.name, 'manager-fresh-lock');
    assert.equal(result.result.node, join(f.paths.directory, 'bin/node'));
    assert.equal(fs.lstatSync(f.paths.root).mode & 0o7777, 0o500);
    assert.equal(fs.existsSync(join(f.root, 'host-node-called')), false);
  } finally { await f.clean(); }
});

test('bootstrap authenticates all canonical executable and control assets after publication', { timeout: 300_000 }, async () => {
  for (const postPublicationTamper of ['node', 'bootstrap', 'native'] as const) {
    const f = await fixture({ postPublicationTamper });
    try {
      const result = await f.invoke(); assert.notEqual(result.code, 0); assert.equal(result.result, undefined);
      assert.match(result.output, /asset digest mismatch/); assert.ok(f.events().some(e => e.name === 'helper-exit' && e.code === 0));
      assert.equal(f.events().some(e => e.name === 'manager-fresh-lock'), false);
      assert.deepEqual(fs.readdirSync(join(f.home, 'install')).filter(name => name.startsWith('bootstrap-stage.')), []);
    } finally { await f.clean(); }
  }
});

test('bootstrap refuses tampered cached bootstrap and native control offline before helper execution', { timeout: 180_000 }, async () => {
  for (const name of ['bootstrap.mjs', 'native/control.node']) {
    const f = await fixture();
    try {
      const first = await f.invoke(); assert.equal(first.code, 0, first.output); const events = f.events().length; f.offline();
      fs.appendFileSync(join(f.control, name), 'cached-control-tamper');
      const result = await f.invoke(); assert.notEqual(result.code, 0); assert.equal(result.result, undefined);
      assert.match(result.output, /asset digest mismatch/); assert.equal(f.events().length, events);
    } finally { await f.clean(); }
  }
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
  const finalChecks = ps.slice(ps.indexOf('$node = $canonicalNode', ps.indexOf('$helperExit = $LASTEXITCODE')));
  assert.match(finalChecks, /Verify-File \$node \$nodeSha/); assert.match(finalChecks, /Verify-File \(Join-Path \$control 'bootstrap.mjs'\) \$bootstrapSha/); assert.match(finalChecks, /Verify-File \(Join-Path \$control 'native\/control.node'\) \$nativeSha/);
  assert.throws(() => renderInstallerBootstrap('posix', { 'linux-x64': { bootstrap: { url: 'https://example.invalid/bootstrap', sha256: 'a'.repeat(64) }, native: { url: 'https://example.invalid/native', sha256: 'b'.repeat(64) } } }), /invalid bootstrap target identity/);
  assert.throws(() => renderInstallerBootstrap('posix', { 'linux-x64': { bootstrap: { url: 'http://example.invalid', sha256: 'a'.repeat(64) }, native: { url: 'https://example.invalid', sha256: 'b'.repeat(64) } } }), /invalid digest-bound/);
  // These are source assertions; actual Windows execution remains deferred.
});

});
