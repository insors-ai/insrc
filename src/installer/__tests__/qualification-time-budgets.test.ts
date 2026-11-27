import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { build } from 'esbuild';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
import { requirePreparedBuild } from '../../../scripts/test-harness/build.mjs';

const source = resolve('src/installer/qualification-time-budgets.mjs');
const moduleUrl = pathToFileURL(source).href;
async function probe(program: string, profile?: string): Promise<string> {
  const env = { ...process.env };
  delete env['INSRC_QUALIFICATION_PROFILE'];
  if (profile !== undefined) env['INSRC_QUALIFICATION_PROFILE'] = profile;
  const child = spawnFixture(process.execPath, ['--input-type=module', '-e', program], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const children = [child], closed = once(child, 'close');
  let stdout = '', stderr = '';
  child.stdout!.on('data', bytes => { stdout += bytes.toString(); });
  child.stderr!.on('data', bytes => { stderr += bytes.toString(); });
  try {
    const [code] = await closed;
    assert.equal(code, 0, stderr);
    return stdout;
  } finally { await stopOwnedChildren(children); }
}
const load = `const {QUALIFICATION_TIME_BUDGETS:p}=await import(${JSON.stringify(moduleUrl)});`;

test('qualification-profile-selects-frozen-normal-and-slow-vm-role-budgets', async () => {
  const normal = { profile: 'normal',
    coordinator: { buildMs: 600000, fileMs: 600000, runMs: 5400000, cleanupMs: 5000 },
    manager: { buildMs: 600000, fileMs: 600000, runMs: 5400000, cleanupMs: 5000 },
    qualification: { buildMs: 3600000, fileMs: 3600000, runMs: 7200000, cleanupMs: 5000 },
    git: { buildMs: 600000, fileMs: 30000, runMs: 40000, cleanupMs: 5000 },
    runtime: { acquisitionMs: 600000, verificationMs: 120000, resourceDrainMs: 5000 } };
  const slow = { profile: 'slow-vm',
    coordinator: { buildMs: 2400000, fileMs: 2400000, runMs: 14400000, cleanupMs: 30000 },
    manager: { buildMs: 2400000, fileMs: 2400000, runMs: 14400000, cleanupMs: 120000 },
    qualification: { buildMs: 7200000, fileMs: 7200000, runMs: 18000000, cleanupMs: 300000 },
    git: { buildMs: 2400000, fileMs: 120000, runMs: 180000, cleanupMs: 30000 },
    runtime: { acquisitionMs: 2400000, verificationMs: 480000, resourceDrainMs: 30000 } };
  const program = `import assert from 'node:assert/strict';${load}
    assert.ok(Object.isFrozen(p));for(const value of Object.values(p)){if(typeof value==='object'){
      assert.ok(Object.isFrozen(value));for(const n of Object.values(value))assert.ok(Number.isSafeInteger(n)&&n>0);
    }}process.stdout.write(JSON.stringify(p));`;
  for (const [profile, expected] of [[undefined, normal], ['normal', normal], ['slow-vm', slow]] as const) {
    assert.deepEqual(JSON.parse(await probe(program, profile)), expected);
  }
});

test('invalid-profile-fails-before-any-filesystem-or-worker-admission', async () => {
  const program = `import assert from 'node:assert/strict';import fs from 'node:fs';
    import cp from 'node:child_process';import http from 'node:http';import https from 'node:https';
    import {syncBuiltinESMExports} from 'node:module';
    const forbidden=()=>{throw Error('policy attempted I/O or process admission')};
    const open=fs.openSync;fs.openSync=(path,flags,...rest)=>{
      if(flags!=='r'&&flags!==0)forbidden();return open(path,flags,...rest);
    };
    for(const key of ['mkdirSync','writeFileSync','mkdtempSync'])fs[key]=forbidden;
    for(const key of ['spawn','spawnSync','fork','exec','execSync','execFile','execFileSync'])cp[key]=forbidden;
    http.request=forbidden;https.request=forbidden;globalThis.fetch=forbidden;syncBuiltinESMExports();
    await assert.rejects(import(${JSON.stringify(moduleUrl)}),{code:'qualification-profile-invalid'});`;
  for (const value of ['', ' ', 'slow-vm ', 'NORMAL', '2400000', '2', 'fast', 'normal\n']) await probe(program, value);
});

test('profile-snapshot-cannot-change-after-module-import', async () => {
  await probe(`import assert from 'node:assert/strict';${load}
    const before=JSON.stringify(p);process.env.INSRC_QUALIFICATION_PROFILE='normal';
    const again=await import(${JSON.stringify(moduleUrl)});assert.equal(again.QUALIFICATION_TIME_BUDGETS,p);
    assert.throws(()=>{p.manager.runMs=1},TypeError);assert.throws(()=>{p.runtime={}},TypeError);
    assert.equal(JSON.stringify(p),before);assert.equal(p.profile,'slow-vm');`, 'slow-vm');
});

test('copied-policy-asset-has-source-bytes-and-loads-from-installed-control', async () => {
  requirePreparedBuild();
  const copied = resolve('out/installer/qualification-time-budgets.mjs');
  const bytes = readFileSync(source), digest = createHash('sha256').update(bytes).digest('hex');
  assert.deepEqual(readFileSync(copied), bytes);
  const attestation = JSON.parse(readFileSync('out/assets/connection-management-build.json', 'utf8'));
  assert.equal(attestation.sourceFiles['installer/qualification-time-budgets.mjs'], digest);
  assert.equal(attestation.compiledFiles['installer/qualification-time-budgets.mjs'], digest);
  const directory = mkdtempSync(join(tmpdir(), 'insrc-budget-bundle-'));
  try {
    const bundled = await build({ stdin: { contents: `export {QUALIFICATION_TIME_BUDGETS} from ${JSON.stringify(copied)};`,
      resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
    const bundle = join(directory, 'control.mjs');
    assert.equal(bundled.outputFiles.length, 1);
    writeFileSync(bundle, bundled.outputFiles[0]!.contents);
    for (const path of [copied, bundle]) {
      await probe(`import assert from 'node:assert/strict';const {QUALIFICATION_TIME_BUDGETS:p}=await import(${JSON.stringify(pathToFileURL(path).href)});
        assert.equal(p.profile,'slow-vm');assert.equal(p.manager.runMs,14400000);assert.ok(Object.isFrozen(p.runtime));`, 'slow-vm');
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
