import test from 'node:test';
import assert from 'node:assert/strict';
import { managementFixture } from './fixtures/management.js';
import { FakeConnectionPanel } from './fixtures/renderer.js';
import { ConnectionsManagerHost } from '../host.js';
import { createConnectionsDraftTests } from '../gateway.js';
import { ConnectionRemovals } from '../../../../src/shared/connection-manager/removal.js';
import { loadConnectionCorpus } from '../../../../src/shared/__tests__/fixtures/connection-corpus.js';
import { connectionActionSupported } from '../../../../src/shared/connection-manager/capabilities.js';
import type { ConnectionAction } from '../../../../src/shared/connection-manager/capabilities.js';
import type { ConnectionScope } from '../../../../src/shared/connection-management.js';

async function until(check:()=>boolean){const deadline=Date.now()+8000;while(!check()){assert.ok(Date.now()<deadline);await new Promise(resolve=>setTimeout(resolve,5));}}
async function fixture(){const peer=await managementFixture(),probes=createConnectionsDraftTests(peer.owner),removals=new ConnectionRemovals(peer.controller),panel=new FakeConnectionPanel();
 const host=new ConnectionsManagerHost({owner:peer.owner,mutations:peer.controller,tests:probes,removals,registeredRoots:async()=>[peer.f.root],createPanel:()=>panel});
 return {peer,panel,host,open:async()=>{await host.open();panel.dom!.choose('root',peer.f.root);},close:async()=>{host.dispose();probes.dispose();removals.dispose();await peer.close();}};}
function field(panel:FakeConnectionPanel,name:string,value:string){const element=panel.dom!.all(panel.dom!.el('fields')).find(e=>e.getAttribute('data-field')===JSON.stringify([name]))!;element.value=value;element.fire('input');}

test('CM-S5-COMPAT-TS: old missing malformed and base-incomplete handshakes show upgrade without legacy writes',async()=>{
 for(const mode of ['missing','old','future','malformed','base']){const f=await fixture();try{
  f.peer.setCapabilities(mode==='base'?'normal':mode,mode==='base'?['safe-read']:[]);await f.open();await until(()=>f.panel.view.list.listState==='upgrade-required');
  assert.equal(f.panel.dom!.el('add').disabled,true);const view=f.panel.view;
  for(const type of ['save','test','remove'])f.panel.emit({v:1,viewId:view.viewId,generation:view.generation,type});
  assert.equal(f.peer.calls.filter(call=>call==='ticket'||call==='mutate').length,0);assert.equal(f.peer.legacyWrites(),0);
 }finally{await f.close();}}
});

test('CM-S5-COMPAT-TS: per-action feature admission preserves optional Test independence and refuses disabled Save and Remove intents',async()=>{
 const f=await fixture();try{
  f.peer.setCapabilities('normal',['draft-test','test-cancellation']);await f.open();await until(()=>f.panel.view.list.listState==='empty-registry');const dom=f.panel.dom!;
  dom.click('add');dom.choose('kind','postgres');dom.input('id','optional-test');field(f.panel,'endpoint','postgresql://fixture.invalid/database');
  assert.equal(dom.el('save').disabled,false);assert.equal(dom.el('test').disabled,true);dom.click('test');assert.match(f.panel.view.error,/Upgrade/);dom.click('save');await until(()=>f.panel.view.list.counts.saved===1&&f.panel.view.draft===null);
  f.peer.setCapabilities('normal',['saved-update']);dom.click('refresh');await until(()=>f.panel.view.list.listState==='ready'&&!f.peer.owner.features(f.peer.f.root).includes('saved-update'));
  dom.row(0).fire('click');assert.equal(dom.el('save').disabled,true);const before=f.peer.calls.filter(call=>call==='ticket').length;dom.click('save');assert.equal(f.peer.calls.filter(call=>call==='ticket').length,before);
  f.peer.setCapabilities('normal',['saved-create']);dom.click('refresh');await until(()=>f.panel.view.list.listState==='ready'&&!f.peer.owner.features(f.peer.f.root).includes('saved-create'));
  dom.click('add');dom.choose('kind','postgres');dom.input('id','temporary-only');field(f.panel,'endpoint','postgresql://fixture.invalid/database');assert.equal(dom.el('save').disabled,true);dom.click('save');assert.equal(f.peer.calls.filter(call=>call==='ticket').length,before);
  dom.choose('scope','temporary');dom.click('confirm-accept');field(f.panel,'endpoint','postgresql://fixture.invalid/database');assert.equal(dom.el('save').disabled,false);dom.click('save');await until(()=>f.panel.view.list.counts.temporary===1&&f.panel.view.draft===null);
  f.peer.setCapabilities('normal',['saved-remove']);dom.click('refresh');await until(()=>f.panel.view.list.listState==='ready'&&!f.peer.owner.features(f.peer.f.root).includes('saved-remove'));dom.click('filter-all');
  const saved=f.panel.view.rows.findIndex(row=>row.key.scope==='saved');dom.row(saved).fire('click');assert.equal(dom.selectedRemove().disabled,true);dom.selectedRemove().fire('click');assert.equal(f.panel.view.confirmation,null);assert.equal(f.peer.calls.filter(call=>call==='ticket').length,before+1);
  const temporary=f.panel.view.rows.findIndex(row=>row.key.scope==='temporary');dom.row(temporary).fire('click');assert.equal(dom.selectedRemove().disabled,false);dom.selectedRemove().fire('click');dom.click('confirm-accept');await until(()=>f.panel.view.list.counts.temporary===0);assert.equal(f.peer.legacyWrites(),0);
 }finally{await f.close();}
});

test('CM-S5-COMPAT-TS: capability loss retains original unknown attempts and recovery resumes without another mutation',async()=>{
 const f=await fixture();try{await f.open();await until(()=>f.panel.view.list.listState==='empty-registry');f.peer.setFault('after');const record=await f.peer.controller.submit(f.peer.draft('unknown'));assert.equal(record.phase,'unknown');
  f.peer.setCapabilities('normal',['operation-status']);f.panel.dom!.click('refresh');await until(()=>f.panel.view.controls.operations[record.recordId]?.includes('reconcile')===false);
  const before=f.peer.calls.filter(call=>call==='status').length,view=f.panel.view;f.panel.emit({v:1,viewId:view.viewId,generation:view.generation,type:'operation',recordId:record.recordId,action:'reconcile'});assert.equal(f.peer.calls.filter(call=>call==='status').length,before);assert.equal(f.peer.controller.record(record.recordId).phase,'unknown');
  f.peer.setCapabilities('normal');f.panel.dom!.click('refresh');await until(()=>f.panel.view.controls.operations[record.recordId]?.includes('reconcile')===true);
  const current=f.panel.view;f.panel.emit({v:1,viewId:current.viewId,generation:current.generation,type:'operation',recordId:record.recordId,action:'reconcile'});await until(()=>f.peer.controller.record(record.recordId).phase==='committed');
  assert.equal(f.peer.calls.filter(call=>call==='mutate').length,1);assert.equal(f.peer.calls.filter(call=>call==='ticket').length,1);assert.equal(f.peer.legacyWrites(),0);
 }finally{await f.close();}
});

test('CM-S5-COMPAT-TS: shared capability decisions pinned read-only metadata and actual legacy Saved projection remain unchanged',async()=>{
 for(const c of loadConnectionCorpus().capabilityCases)assert.equal(connectionActionSupported(c.features,c.scope as ConnectionScope,c.action as ConnectionAction,c.mode as 'create'|'update'|'remove'),c.expected,c.id);
 const f=await fixture();try{const root=f.peer.f.root;const row={key:{repoRoot:root,scope:'saved',id:'pinned'},revision:'11111111-1111-4111-8111-111111111111',kind:'csv',family:'rdbms',effectiveFamily:'rdbms',declaredFamily:'rdbms',registeredFamily:'file',readOnly:true,compatibilityWarning:'legacy mismatch',publicConfig:{kind:'csv',path:'source.csv'},credentialPresence:{}};
  f.peer.setReadRows([row]);await f.open();await until(()=>f.panel.view.list.listState==='ready');f.panel.dom!.row(0).fire('click');assert.equal(f.panel.view.draft?.family,'rdbms');assert.equal(f.panel.view.draft?.readOnly,true);assert.equal(f.panel.dom!.el('save').disabled,true);assert.equal(f.panel.dom!.selectedRemove().disabled,false);
  assert.equal(f.peer.f.counts.writes,0);f.peer.setReadRows(null);
  assert.equal((await f.peer.controller.submit(f.peer.draft('legacy-saved'))).phase,'committed');assert.equal((await f.peer.controller.submit(f.peer.draft('legacy-hidden','temporary'))).phase,'committed');
  assert.deepEqual(await f.peer.legacyList(),[{id:'legacy-saved',kind:'postgres',family:'rdbms'}]);assert.equal(f.peer.legacyWrites(),0);
 }finally{await f.close();}
});


test('CM-S5-COMPAT-TS: metadata-only daemon permits local drafts while Save Test and legacy writes stay refused',async()=>{
 const f=await fixture();try{
  f.peer.setCapabilities('normal',['workbench-sessions','session-delegation']);
  await f.host.open();assert.equal(f.panel.dom!.el('add').disabled,true);
  f.panel.dom!.choose('root',f.peer.f.root);
  await until(()=>f.panel.view.list.listState==='upgrade-required'&&f.panel.view.canCreateDraft);
  const dom=f.panel.dom!;assert.equal(dom.el('add').disabled,false);assert.equal(f.panel.view.notice,'');
  dom.click('add');assert.equal(dom.el('id').disabled,false);assert.equal(dom.el('kind').disabled,false);assert.equal(dom.el('scope').disabled,false);
  dom.choose('kind','csv');dom.input('id','throwaway');field(f.panel,'path','source.csv');
  assert.equal(f.panel.view.draft?.key.id,'throwaway');assert.equal(f.panel.view.valid,true);
  assert.equal(dom.el('save').disabled,true);assert.equal(dom.el('test').disabled,true);assert.match(dom.el('form-guidance').textContent,/Draft only/);
  assert.match(dom.el('save-guidance').textContent,/daemon has not enabled/);assert.match(dom.el('test-guidance').textContent,/daemon has not enabled/);
  assert.equal(f.panel.view.validationMessages.length,0);
  dom.click('save');dom.click('test');assert.equal(f.peer.calls.filter(call=>['ticket','mutate','test'].includes(call)).length,0);assert.equal(f.peer.legacyWrites(),0);
  // Loss of metadata revokes local draft editing too; never reuse a stale catalog.
  f.peer.setCapabilities('normal',['safe-read']);dom.click('refresh');await until(()=>!f.panel.view.canCreateDraft&&f.panel.view.list.listState==='upgrade-required');
  assert.equal(dom.el('id').disabled,true);dom.input('id','must-not-apply');assert.equal(f.panel.view.draft?.key.id,'throwaway');
 }finally{await f.close();}
});
