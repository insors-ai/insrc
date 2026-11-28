import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

const moduleUrl = (name: string) => JSON.stringify(pathToFileURL(resolve(`out/installer/${name}.js`)).href);
const preloader = pathToFileURL(resolve('src/installer/qualification-time-budgets.mjs')).href;
const policy = JSON.stringify(pathToFileURL(resolve('src/installer/operation-time-budgets.mjs')).href);

async function probe(profile: string | undefined, trusted: boolean): Promise<void> {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'insrc-production-deadlines-'));
  const environment: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' };
  delete environment.INSRC_QUALIFICATION_PROFILE;
  if (profile !== undefined) environment.INSRC_QUALIFICATION_PROFILE = profile;
  const program = `import assert from 'node:assert/strict';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {Readable} from 'node:stream';
    import {createHash} from 'node:crypto';import {join} from 'node:path';
    const root=process.argv[1], expected=${trusted && profile === 'slow-vm' ? 2400000 : 600000};
    const {operationTimeBudgets,qualificationAdmitted}=await import(${policy});
    assert.equal(qualificationAdmitted(),${trusted});
    assert.equal(operationTimeBudgets().profile,${JSON.stringify(trusted ? profile ?? 'normal' : 'normal')});
    // These imports include dev Git/delivery/worker and the retained harness.
    await import(${moduleUrl('manager-entry')});await import(${moduleUrl('terminal-entry')});
    const {terminalMain}=await import(${moduleUrl('terminal-main')});
    await assert.rejects(terminalMain(['--ollama-service-worker']),{code:'schema-invalid'});
    const {RUNTIME_LIMITS}=await import(${moduleUrl('runtime-metadata')});
    assert.equal(RUNTIME_LIMITS.networkMs,expected);
    const verification=${trusted && profile === 'slow-vm' ? 480000 : 120000};
    assert.equal(RUNTIME_LIMITS.verificationMs,verification);
    const {createRun,qualificationEnvironment}=await import(${JSON.stringify(pathToFileURL(resolve('scripts/test-harness/context.mjs')).href)});
    const {withRun}=await import(${JSON.stringify(pathToFileURL(resolve('scripts/test-harness/process.mjs')).href)});
    const run=createRun(root);
    assert.equal(run.budgets.runMs,${trusted && profile === 'slow-vm' ? 14400000 : 5400000});
    assert.equal(qualificationEnvironment(process.env).INSRC_QUALIFICATION_PROFILE,${JSON.stringify(trusted ? profile ?? 'normal' : 'normal')});
    await withRun(run,async()=>{});
    const {InstallerManager}=await import(${moduleUrl('manager')});
    const {resolveInstallationLocation}=await import(${moduleUrl('location')});
    const target={os:process.platform,arch:process.arch,baseline:'deadline-probe'};
    assert.equal(new InstallerManager(resolveInstallationLocation('deadline-probe',{home:root}),target,{}).inspect().kind,'missing');
    const {resolveDevSource}=await import(${moduleUrl('dev-git')});
    const {privateRuntimeIdentity}=await import(${moduleUrl('runtime-policy')});
    const writes=[], write=fs.writeFileSync;
    fs.writeFileSync=(file,data,...args)=>{
      if(String(file).includes('insrc-dev-source-check-')&&String(file).endsWith('run.json'))writes.push(JSON.parse(String(data)).budgets);
      return write(file,data,...args);
    };syncBuiltinESMExports();
    try {await assert.rejects(resolveDevSource({mode:'dev',repository:root,branch:'main'},target,privateRuntimeIdentity(target)),{code:'source-fetch-failed'});}
    finally {fs.writeFileSync=write;syncBuiltinESMExports();}
    assert.deepEqual(writes,[operationTimeBudgets().git]);
    const observed=[], timeout=AbortSignal.timeout;
    AbortSignal.timeout=ms=>{observed.push(ms);return new AbortController().signal;};
    try {
      const {downloadJson,downloadVerifiedAsset}=await import(${moduleUrl('download')});
      const bytes=Buffer.from('{}'), transport=async()=>({status:200,body:Readable.from([bytes])});
      assert.deepEqual(await downloadJson('https://fixture.invalid/metadata',{transport}),{});
      await downloadVerifiedAsset({url:'https://fixture.invalid/asset',bytes:2,sha256:createHash('sha256').update(bytes).digest('hex')},join(root,'asset'),{transport});
      const {stageRuntime}=await import(${moduleUrl('runtime-acquire')});
      const stop=Error('stopped before allocation');
      await assert.rejects(stageRuntime({assertHeld(){throw stop;},location:{}},{}),error=>error===stop);
      const {verifyRuntimeEntry,resolveRuntimeStore}=await import(${moduleUrl('runtime-store')});
      await assert.rejects(verifyRuntimeEntry(root,{}));await assert.rejects(resolveRuntimeStore({},{}));
      assert.deepEqual(observed,[expected,expected,expected,verification,verification]);
      await assert.rejects(resolveDevSource({mode:'invalid'},{},{}),{code:'schema-invalid'});
    } finally {AbortSignal.timeout=timeout;}
    process.stdout.write('deadline-proof-complete');`;
  const child = spawnFixture(process.execPath, [...(trusted ? ['--import', preloader] : []), '--input-type=module', '-e', program, root],
    { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(child, 'close'); let output = '';
  child.stdout!.on('data', bytes => { output += String(bytes); });
  child.stderr!.on('data', bytes => { output += String(bytes); });
  let confirmed = false;
  try { assert.equal((await closed)[0], 0, output); assert.equal(output, 'deadline-proof-complete'); confirmed = true; }
  finally {
    await stopOwnedChildren([child]);
    // The successful child drained its own empty coordinator before returning.
    // Failure retains its isolated evidence rather than inferring actor closure.
    if (confirmed) rmSync(root, { recursive: true });
  }
}

test('ordinary installer imports and action deadlines ignore every ambient qualification selector', async () => {
  for (const profile of [undefined, 'normal', 'slow-vm', 'invalid', '']) await probe(profile, false);
});

test('explicit trusted qualification admission preserves bounded runtime and manager deadlines', async () => {
  for (const profile of ['normal', 'slow-vm']) await probe(profile, true);
});
