import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
import { node22Fixture } from './_runtime-fixture.js';

const url = (path: string) => JSON.stringify(pathToFileURL(resolve(path)).href);
const preamble = `import assert from 'node:assert/strict';import fs from 'node:fs';import {join} from 'node:path';
  import {createRun,checkedBudgets,qualificationEnvironment} from ${url('scripts/test-harness/context.mjs')};
  import {withRun} from ${url('scripts/test-harness/process.mjs')};
  import {QUALIFICATION_TIME_BUDGETS as p} from ${url('src/installer/qualification-time-budgets.mjs')};
  const root=process.argv[1];`;

async function isolated(profile: 'normal' | 'slow-vm', program: string): Promise<void> {
  const runtime = await node22Fixture();
  const root = mkdtempSync(join(tmpdir(), 'insrc-budget-scopes-'));
  const child = spawnFixture(runtime.executable, ['--input-type=module', '-e', preamble + program, root],
    { env: { ...process.env, INSRC_QUALIFICATION_PROFILE: profile, INSRC_BUILD_CONFIRM_CLOSURE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const children = [child], closed = once(child, 'close');
  let output = '';
  child.stdout!.on('data', data => { output += String(data); });
  child.stderr!.on('data', data => { output += String(data); });
  try { assert.equal((await closed)[0], 0, output); }
  finally { await stopOwnedChildren(children); rmSync(root, { recursive: true, force: true }); runtime.cleanup(); }
}

test('explicit-short-scope-overrides-remain-exact-under-slow-vm', async () => {
  await isolated('slow-vm', `const exact={buildMs:11,fileMs:13,runMs:17,cleanupMs:19};
    assert.deepEqual(checkedBudgets(exact),exact);
    for(const bad of [{fileMs:0},{runMs:-1},{buildMs:1.5},{cleanupMs:Infinity},{extra:1}])
      assert.throws(()=>checkedBudgets(bad),{code:'harness-context-invalid'});
    const run=createRun(root,{budgets:exact});assert.deepEqual(run.budgets,exact);
    assert.deepEqual(JSON.parse(fs.readFileSync(join(run.active,'run.json'))).budgets,exact);
    await withRun(run,async()=>{});assert.equal(fs.existsSync(run.active),false);`);
});

test('omitted-child-profile-is-canonicalized-and-conflicting-profile-rejected', async () => {
  await isolated('slow-vm', `const inherited={KEEP:'retained',insrc_qualification_profile:'slow-vm',INSRC_QUALIFICATION_PROFILE:'slow-vm'};
    const normalized=qualificationEnvironment(inherited);
    assert.equal(normalized.KEEP,'retained');assert.equal(normalized.INSRC_QUALIFICATION_PROFILE,'slow-vm');
    assert.equal(normalized.insrc_qualification_profile,undefined);assert.equal(inherited.insrc_qualification_profile,'slow-vm');
    assert.equal(qualificationEnvironment({}).INSRC_QUALIFICATION_PROFILE,'slow-vm');
    const run=createRun(root);
    await withRun(run,async scope=>{
      for(const env of [{INSRC_QUALIFICATION_PROFILE:'normal'},{INSRC_QUALIFICATION_PROFILE:''},
        {INSRC_QUALIFICATION_PROFILE:'2'},{insrc_qualification_profile:'normal'},
        {INSRC_QUALIFICATION_PROFILE:'slow-vm',insrc_qualification_profile:'normal'}]){
        await assert.rejects(scope.start(process.execPath,['-e','process.exit(99)'],{env}),{code:'qualification-profile-invalid'});
      }
      assert.equal(fs.existsSync(join(run.workspace,'child-admissions.jsonl')),false);
      const result=await scope.start(process.execPath,['-e','process.stdout.write(process.env.INSRC_QUALIFICATION_PROFILE)'],{env:{}});
      assert.equal(result.code,0);assert.equal(fs.readFileSync(result.log,'utf8'),'slow-vm');
    });
    const admissions=fs.readFileSync(join(run.workspace,'child-admissions.jsonl'),'utf8').trim().split('\\n').map(JSON.parse);
    const results=fs.readFileSync(join(run.workspace,'child-results.jsonl'),'utf8').trim().split('\\n').map(JSON.parse);
    const disposals=fs.readFileSync(join(run.workspace,'child-disposals.jsonl'),'utf8').trim().split('\\n').map(JSON.parse);
    assert.equal(admissions.length,1);assert.equal(results.length,1);assert.equal(disposals.length,1);
    assert.equal(admissions[0].childId,results[0].childId);assert.equal(admissions[0].childId,disposals[0].childId);
    assert.equal(disposals[0].state,'closed');assert.equal(fs.existsSync(run.active),false);`);
});

test('normal-coordinator-and-git-role-caps-remain-exact', async () => {
  for (const profile of ['normal', 'slow-vm'] as const) {
    await isolated(profile, `const expected=p.profile==='normal'?{buildMs:600000,fileMs:600000,runMs:5400000,cleanupMs:5000}
      :{buildMs:2400000,fileMs:2400000,runMs:14400000,cleanupMs:30000};
      const run=createRun(root);assert.deepEqual(run.budgets,expected);
      await withRun(run,async scope=>{
        const result=await scope.start(process.execPath,['-e','process.stdout.write(process.env.INSRC_QUALIFICATION_PROFILE)']);
        assert.equal(result.code,0);assert.equal(fs.readFileSync(result.log,'utf8'),p.profile);
      });
      const git=createRun(root,{budgets:p.git});
      await withRun(git,async()=>{assert.equal(git.budgets.fileMs,p.profile==='normal'?30000:120000);
        assert.equal(git.budgets.runMs,p.profile==='normal'?40000:180000);});
      assert.equal(fs.existsSync(git.active),false);`);
  }
});
