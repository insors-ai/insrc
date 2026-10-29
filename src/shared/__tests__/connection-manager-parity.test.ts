import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { runConnectionJUnit } from './fixtures/connection-junit.js';
import { loadConnectionCorpus } from './fixtures/connection-corpus.js';
import { createConnectionManager, reduceConnectionManager, projectConnectionManager } from '../connection-manager/model.js';
import type { ManagerEvent } from '../connection-manager/model.js';
import { decodeManagementCapabilities, decodeSafeConnectionList, decodeSafeConnection, decodeOperationTicket, decodeMutationOutcome, decodeOperationStatus, decodeDraftTestResult, decodeRemovalState } from '../connection-manager/wire.js';

test('CM-S5-SYNC: complete TypeScript and Kotlin wire/sc7 outputs match and divergent consumer controls fail', {timeout:360000}, () => {
  const dir=mkdtempSync(join(tmpdir(),'s5-parity-'));
  try {
    const corpus=loadConnectionCorpus(), actual:unknown[]=[];
    for(const scenario of corpus.managerScenarios){
      let state=createConnectionManager(['/fixture/repo-a','/fixture/repo-b'],'fixture-epoch');
      for(const step of scenario.steps){const result=reduceConnectionManager(state,step.event as unknown as ManagerEvent);state=result.state;
        actual.push({scenario:scenario.id,projection:projectConnectionManager(state),effects:result.effects});}
    }
    const decoders:Record<string,(value:unknown)=>unknown>={capabilities:decodeManagementCapabilities,list:value=>decodeSafeConnectionList(value,'/fixture/repo-a'),read:decodeSafeConnection,ticket:decodeOperationTicket,outcome:decodeMutationOutcome,status:decodeOperationStatus,test:decodeDraftTestResult,removal:decodeRemovalState};
    const wire=corpus.wire.map(item=>{let accepted=false;try{decoders[item.kind]!(item.input);accepted=true;}catch{}assert.equal(accepted,item.valid,item.id);return{id:item.id,accepted};});
    runConnectionJUnit('ai.insors.insrc.jetbrains.connections.ConnectionsManagerModelTest',2,{INSRC_PARITY_DIR:dir});
    runConnectionJUnit('ai.insors.insrc.jetbrains.connections.ConnectionProtocolTest',6,{INSRC_PARITY_DIR:dir});
    const native=JSON.parse(readFileSync(join(dir,'model.json'),'utf8'));
    assert.deepEqual(native,JSON.parse(JSON.stringify(actual)),'Full native and TypeScript projections/effects differ');
    assert.deepEqual(JSON.parse(readFileSync(join(dir,'wire.json'),'utf8')),wire);
    // A harness which only loads matching fixtures would incorrectly accept these.
    const wrongField=structuredClone(native);wrongField[0].projection.repoRoot='/divergent-consumer-root';
    assert.throws(()=>assert.deepEqual(wrongField,actual),assert.AssertionError);
    const wrongTransition=structuredClone(native);wrongTransition[0].effects=[];
    // The first scenario may begin with a no-op; find an actual emitted read.
    const at=native.findIndex((step:any)=>step.effects.length>0);assert.ok(at>=0);wrongTransition[at].effects=[];
    assert.throws(()=>assert.deepEqual(wrongTransition,actual),assert.AssertionError);
    const wrongWire=structuredClone(wire);wrongWire[0]!.accepted=!wrongWire[0]!.accepted;
    assert.throws(()=>assert.deepEqual(wrongWire,wire),assert.AssertionError);
    assert.equal(corpus.coverage.length,20);assert.equal(corpus.releaseEnabled,false);assert.equal(corpus.fixturesAreAcceptance,false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('CM-S5-SYNC: actual client bundle inputs exclude daemon storage and provider implementations', async () => {
  const require=createRequire(import.meta.url), {build}=require('esbuild') as typeof import('esbuild');
  const result=await build({entryPoints:['vscode-plugin/src/extension.ts'],bundle:true,platform:'node',format:'cjs',write:false,metafile:true,external:['vscode'],logLevel:'silent',define:{'import.meta.url':'"file:///fixture/extension.js"'}});
  const inputs=Object.keys(result.metafile!.inputs);
  assert.ok(inputs.some(file=>file.endsWith('/connections/host.ts')));
  // These are repository-relative esbuild inputs. vscode-plugin/src/daemon is
  // the existing thin lifecycle client, not the backend src/daemon implementation.
  assert.deepEqual(inputs.filter(file=>/^src\/(daemon|db|indexer|agent\/providers)\//.test(file)),[]);
  const version=/^pluginVersion\s*=\s*(\S+)/m.exec(readFileSync('jetbrains-plugin/gradle.properties','utf8'))![1]!;
  const jar=spawnSync('/usr/bin/unzip',['-Z1',`jetbrains-plugin/build/libs/insrc-jetbrains-${version}.jar`],{encoding:'utf8'});
  assert.equal(jar.status,0);assert.match(jar.stdout,/connections\/ConnectionsManagerPanel.class/);
  assert.ok(!jar.stdout.split('\n').some(entry=>/\.(ts|js)$/.test(entry)||/^(org\/duckdb|lmdb|src\/daemon|src\/agent\/providers)\//.test(entry)));
});
