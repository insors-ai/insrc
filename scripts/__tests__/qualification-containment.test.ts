import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { completeNode22Fixture } from '../../src/installer/__tests__/_runtime-fixture.js';
import { spawnFixture, stopOwnedChildren } from '../../src/daemon/tools/__tests__/_proc.js';

let runtime: Awaited<ReturnType<typeof completeNode22Fixture>>;
before(async () => { runtime = await completeNode22Fixture(); });
after(() => runtime?.cleanup());
async function probe(args: string[], profile: string): Promise<void> {
  const child = spawnFixture(runtime.executable, args, { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', INSRC_QUALIFICATION_PROFILE: profile }, stdio: ['ignore', 'pipe', 'pipe'] });
  const children = [child], closed = once(child, 'close'); let output = '';
  child.stdout!.on('data', bytes => { output += String(bytes); }); child.stderr!.on('data', bytes => { output += String(bytes); });
  try { assert.equal((await closed)[0], 0, output); }
  finally { await stopOwnedChildren(children); }
}
async function scenario(mode: string, profile: string): Promise<void> {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'qc-'));
  try { await probe([realpathSync('scripts/__tests__/qualification-containment-fixture.mjs'), root, mode], profile); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
test('outer-deadline-cancels-independent-in-process-preparation', async () => {
  for (const profile of ['normal', 'slow-vm']) for (const mode of ['deadline', 'SIGINT', 'SIGTERM', 'finish']) await scenario(mode, profile);
});
test('ci-and-operator-containment-admit-only-sufficient-native-work-and-cleanup-headroom', async () => {
  for (const profile of ['normal', 'slow-vm']) await scenario('headroom', profile);
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const backend = ci.slice(ci.indexOf('  build-and-test:'), ci.indexOf('  runtime-foundation-windows:'));
  assert.match(backend, /timeout-minutes: 20/); assert.equal(backend.includes('INSRC_QUALIFICATION_PROFILE'), false);
  const native = ci.slice(ci.indexOf('  runtime-foundation-windows:'));
  assert.match(native, /timeout-minutes:.*360.*240/); assert.match(native, /INSRC_QUALIFICATION_PROFILE:.*inputs.qualification-profile/);
  assert.match(native, /node scripts\/qualification-containment.mjs/); assert.equal(native.includes('npm test --'), false);
  assert.match(native, /name: Retain qualification diagnostics\n\s+if: always\(\)\n\s+timeout-minutes: 8/);
  const workflow = yaml.load(ci) as { on: { workflow_dispatch: { inputs: Record<string, { options: string[]; default: string }> } }; jobs: Record<string, { 'timeout-minutes': number | string; steps: Array<{ 'timeout-minutes'?: number }> }> };
  assert.deepEqual(workflow.on.workflow_dispatch.inputs['qualification-profile']!.options, ['normal', 'slow-vm']);
  assert.equal(workflow.jobs['build-and-test']!['timeout-minutes'], 20);
  const setup = workflow.jobs['runtime-foundation-windows']!.steps.slice(0, 3);
  assert.equal(setup.reduce((sum, step) => sum + step['timeout-minutes']!, 0), 4);
});
test('qualification-invalid-profile-refuses-before-root-or-lease-allocation', async () => {
  const url = pathToFileURL(realpathSync('scripts/qualify-runtime-foundation.mjs')).href;
  const program = `import assert from 'node:assert/strict';import fs from 'node:fs';import cp from 'node:child_process';import{syncBuiltinESMExports}from'node:module';
    const forbidden=()=>{throw Error('unexpected admission')};for(const k of ['mkdtempSync','mkdirSync','writeFileSync'])fs[k]=forbidden;
    cp.spawn=forbidden;syncBuiltinESMExports();await assert.rejects(import(${JSON.stringify(url)}),{code:'qualification-profile-invalid'});`;
  for (const profile of ['', 'invalid']) await probe(['--input-type=module', '-e', program], profile);
});
test('qualification-evidence-records-selected-caps-before-resource-copy-without-success-claim', async () => {
  for (const profile of ['normal', 'slow-vm']) await scenario('evidence', profile);
});
