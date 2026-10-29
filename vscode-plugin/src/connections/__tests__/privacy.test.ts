import test from 'node:test';
import assert from 'node:assert/strict';
import { managementFixture } from './fixtures/management.js';
import { FakeConnectionPanel, type Element } from './fixtures/renderer.js';
import { ConnectionsManagerHost } from '../host.js';
import { createConnectionsDraftTests } from '../gateway.js';
import { ConnectionRemovals } from '../../../../src/shared/connection-manager/removal.js';
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { syncBuiltinESMExports, createRequire } from 'node:module';
import { connectionTestSupervisor } from '../../../../src/daemon/db/draft-test.js';
import { createConnectionsMutationController } from '../gateway.js';

async function until(check:()=>boolean){const deadline=Date.now()+8000;while(!check()){assert.ok(Date.now()<deadline);await new Promise(resolve=>setTimeout(resolve,5));}}
function secrets(panel:FakeConnectionPanel,slot:string){const group=panel.dom!.el('credentials').children.find(e=>e.textContent.toLowerCase().includes(slot.replace('.',' ')))!;return {group,action:group.children.find(e=>e.tag==='select')!,input:panel.dom!.all(group).find(e=>e.type==='password')!};}
function clickText(root:Element,text:string){const button=root.dom.all(root).find(e=>e.tag==='button'&&e.textContent===text);assert.ok(button);button.fire('click');}

test('CM-S5-PRIVACY-TS: real renderer erases replaced detached and hidden password widgets and refuses stale private events',async()=>{
  const f=await managementFixture(), probes=createConnectionsDraftTests(f.owner),removals=new ConnectionRemovals(f.controller),panel=new FakeConnectionPanel();
  const host=new ConnectionsManagerHost({owner:f.owner,mutations:f.controller,tests:probes,removals,registeredRoots:async()=>[f.f.root],createPanel:()=>panel});
  try{
    await host.open();const dom=panel.dom!;dom.choose('root',f.f.root);await until(()=>panel.view.list.listState==='empty-registry');dom.click('add');dom.choose('kind','postgres');
    let privateField=secrets(panel,'url.password');privateField.action.value='replace';privateField.action.fire('change');privateField.input.value='fixture-private-dom-canary';privateField.input.fire('input');
    const view=panel.view;
    panel.emit({v:1,viewId:view.viewId,generation:view.generation,type:'credential',slot:'url.password',action:'keep'});
    assert.ok(privateField.input.value.length===0,'Keep from privileged shared state must erase the DOM value');
    privateField.action.value='replace';privateField.action.fire('change');privateField.input.value='fixture-private-detach-canary';privateField.input.fire('input');
    const oldPublic=dom.all(dom.el('fields')).find(e=>e.getAttribute('data-field')===JSON.stringify(['endpoint']))!;dom.click('add');dom.click('confirm-accept');assert.ok(privateField.input.value.length===0,'Discard/rebuild must erase detached controls');
    const posts=dom.posted.length;privateField.input.value='fixture-stale-private-event';privateField.input.fire('input');assert.equal(dom.posted.length,posts,'Detached private controls cannot submit into another draft');oldPublic.value='postgresql://fixture-stale-config.invalid/database';oldPublic.fire('input');assert.equal(dom.posted.length,posts,'Detached temporary configuration cannot enter another draft');
    dom.choose('kind','nats');privateField=secrets(panel,'options.servers');privateField.action.value='replace';privateField.action.fire('change');privateField.input.value='nats://fixture-private-address.invalid:4222';privateField.input.fire('input');
    const old=privateField.input;clickText(privateField.group,'Remove replacement address');assert.ok(old.value.length===0,'Removed address controls must be erased');const removedPosts=dom.posted.length;old.fire('input');assert.equal(dom.posted.length,removedPosts);
    privateField=secrets(panel,'options.servers');privateField.input.value='nats://fixture-private-hidden.invalid:4222';privateField.input.fire('input');dom.hide();assert.ok(privateField.input.value.length===0);
    assert.ok(!JSON.stringify(panel.posts).includes('fixture-private-dom-canary'));
  }finally{host.dispose();probes.dispose();removals.dispose();await f.close();}
});

test('CM-S5-PRIVACY-TS: actual client lifetime effects cannot reach persistence logs telemetry or another owner',async()=>{
  const f=await managementFixture({manualClock:true}),other=f.forkOwner(),otherMutations=createConnectionsMutationController(other);
  const probes=createConnectionsDraftTests(f.owner),removals=new ConnectionRemovals(f.controller),panel=new FakeConnectionPanel();
  const otherProbes=createConnectionsDraftTests(other),otherRemovals=new ConnectionRemovals(otherMutations),otherPanel=new FakeConnectionPanel();
  const host=new ConnectionsManagerHost({owner:f.owner,mutations:f.controller,tests:probes,removals,registeredRoots:async()=>[f.f.root],createPanel:()=>panel});
  const otherHost=new ConnectionsManagerHost({owner:other,mutations:otherMutations,tests:otherProbes,removals:otherRemovals,registeredRoots:async()=>[f.f.root],createPanel:()=>otherPanel});
  const role=new AsyncLocalStorage<boolean>(),sinks:string[]=[],restore:(()=>void)[]=[];
  const canaries=['s5-private-endpoint-canary','s5-private-label-canary','s5-private-credential-canary','s5-private-source-canary','s5-private-capability-canary'];
  const before={writes:f.f.counts.writes,sets:f.f.counts.sets,deletes:f.f.counts.deletes};
  function poison(target:any,key:string,name:string){const original=target[key];target[key]=function(...args:any[]){if(role.getStore()){sinks.push(name);throw new Error('Client persistence or logging is forbidden');}return original.apply(this,args);};restore.push(()=>{target[key]=original;});}
  for(const key of ['writeFileSync','writeFile','appendFileSync','appendFile','renameSync','rename','mkdirSync','mkdir','openSync','open'])poison(fs,key,'fs.'+key);
  for(const key of ['writeFile','appendFile','rename','mkdir','open'])poison(fs.promises,key,'fs.promises.'+key);
  for(const key of ['log','info','warn','error','debug'])poison(console,key,'console.'+key);
  syncBuiltinESMExports();
  try{
    await role.run(true,async()=>{
      await host.open();await otherHost.open();const dom=panel.dom!;
      otherPanel.dom!.choose('root',f.f.root);dom.choose('root',f.f.root);await until(()=>panel.view.list.listState==='empty-registry'&&otherPanel.view.list.listState==='empty-registry');
      dom.click('add');dom.choose('kind','postgres');dom.choose('scope','temporary');dom.input('id','private-preview');
      const field=(name:string,value:string)=>{const input=dom.all(dom.el('fields')).find(e=>e.getAttribute('data-field')===JSON.stringify([name]))!;input.value=value;input.fire('input');};
      field('endpoint','postgresql://127.0.0.1:1/s5-private-endpoint-canary');field('label','s5-private-label-canary');
      const secret=secrets(panel,'url.password');secret.action.value='replace';secret.action.fire('change');secret.input.value='s5-private-credential-canary';secret.input.fire('input');
      let view=panel.view;panel.emit({v:1,viewId:view.viewId,generation:view.generation,type:'rpc',capability:'s5-private-capability-canary'});
      panel.emit({v:1,viewId:view.viewId,generation:view.generation,type:'field',path:['path'],value:'s5-private-source-canary.csv'});
      assert.ok(!canaries.some(value=>panel.view.error.includes(value)));
      dom.click('test');await until(()=>['failed','timeout','unavailable'].includes(panel.view.test.status));await until(()=>connectionTestSupervisor.activeCount===0);
      dom.click('save');await until(()=>panel.view.list.counts.temporary===1&&panel.view.draft===null);
      otherPanel.dom!.click('refresh');await until(()=>otherPanel.view.list.listState==='empty-registry');
      const otherEvents=JSON.stringify(otherPanel.posts);assert.ok(!canaries.some(value=>otherEvents.includes(value)));
      dom.el('rows').children[0]!.fire('click');dom.click('remove');dom.click('confirm-accept');await until(()=>panel.view.list.counts.temporary===0&&panel.view.operations.some(record=>record.removal?.state==='removed'));
      // Recreate, obtain an authenticated lease-expired reply, then reconnect.
      const value=f.draft('expiry-preview','temporary');assert.equal((await f.controller.submit(value)).phase,'committed');
      f.advanceOwnerClock(90000);await f.controller.submit(f.draft('expiry-rejected','temporary'));await until(()=>f.owner.view.status==='expired');
      await f.owner.selectRoot(f.f.root);assert.equal(f.owner.view.status,'ready');
      assert.deepEqual({writes:f.f.counts.writes,sets:f.f.counts.sets,deletes:f.f.counts.deletes},before,'Temporary lifecycle must not persist registry or credentials');
      // Durable Saved metadata is intentional and counted separately.
      assert.equal((await f.controller.submit(f.draft('durable-control'))).phase,'committed');assert.ok(f.f.counts.writes>before.writes);
      f.owner.dispose();await f.owner.whenDisposed();
      assert.deepEqual(dom.sinkCalls,[]);assert.deepEqual(otherPanel.dom!.sinkCalls,[]);
    });
    assert.deepEqual(sinks,[]);
  }finally{
    for(const reset of restore.reverse())reset();syncBuiltinESMExports();host.dispose();otherHost.dispose();probes.dispose();otherProbes.dispose();removals.dispose();otherRemovals.dispose();otherMutations.dispose();await f.close();
  }
});

test('CM-S5-PRIVACY-TS: actual manager module has no Settings memento file artifact or telemetry capability',async()=>{
  const {build}=createRequire(import.meta.url)('esbuild') as typeof import('esbuild');
  const bundle=await build({entryPoints:['vscode-plugin/src/connections/host.ts'],bundle:true,platform:'node',format:'cjs',write:false,metafile:true,logLevel:'silent'});
  const imports=Object.values(bundle.metafile!.outputs).flatMap(output=>output.imports.map(item=>item.path));
  assert.ok(!imports.some(value=>/^(vscode|node:fs|fs|keytar|.*telemetry)(\/|$)/.test(value)));
});
