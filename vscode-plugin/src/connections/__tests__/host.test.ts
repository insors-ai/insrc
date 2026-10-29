import assert from 'node:assert/strict';
import test from 'node:test';
import { managementFixture } from './fixtures/management.js';
import { FakeConnectionPanel,RendererHarness } from './fixtures/renderer.js';
import { ConnectionsManagerHost } from '../host.js';
import { createConnectionsDraftTests } from '../gateway.js';
import { ConnectionRemovals } from '../../../../src/shared/connection-manager/removal.js';
import { ConnectionDraft,connectionDriverChoices } from '../../../../src/shared/connection-manager/draft.js';
import { decodeDriverDescriptors } from '../../../../src/shared/connection-manager/wire.js';
import { loadConnectionCorpus } from '../../../../src/shared/__tests__/fixtures/connection-corpus.js';
import { connectionManagerDocument,CONNECTION_MANAGER_SCRIPT } from '../renderer.js';
import { parseConnectionIntent } from '../types.js';
import type { ConnectionRenderView } from '../types.js';
import type { ConnectionListState } from '../../../../src/shared/connection-manager/model.js';

const nonce='synthetic_nonce_for_fixture',descriptors=decodeDriverDescriptors(loadConnectionCorpus().driverDescriptors);
async function until(fn:()=>boolean):Promise<void>{const deadline=Date.now()+8000;while(!fn()){if(Date.now()>deadline)throw new Error('Manager fixture did not settle');await new Promise<void>(r=>setTimeout(r,5));}}
function input(dom:RendererHarness,path:readonly string[],value:string):void{
 const e=dom.all(dom.el('fields')).find(e=>e.getAttribute('data-field')===JSON.stringify(path));assert.ok(e,'Expected descriptor field');e.focus();e.value=value;e.fire('input');
}
function password(dom:RendererHarness,slot='url.password'){
 const group=dom.el('credentials').children.find(e=>e.textContent.toLowerCase().includes(slot.replace('.',' ')));assert.ok(group);
 const action=group.children.find(e=>e.tag==='select');assert.ok(action);action.value='replace';action.fire('change');
 const field=dom.all(group).find(e=>e.tag==='input'&&e.type==='password');assert.ok(field);return field;
}
test('CM-S5-RENDER-TS: a closed panel cannot apply its late repository read to a replacement view',async()=>{
 const f=await managementFixture(),probes=createConnectionsDraftTests(f.owner),removals=new ConnectionRemovals(f.controller),panels:FakeConnectionPanel[]=[];
 let resolve!:(roots:readonly string[])=>void,calls=0;const first=new Promise<readonly string[]>(r=>{resolve=r;});
 const host=new ConnectionsManagerHost({owner:f.owner,mutations:f.controller,tests:probes,removals,registeredRoots:()=>++calls===1?first:Promise.resolve([f.f.root]),createPanel:()=>{const p=new FakeConnectionPanel();panels.push(p);return p;},nonce:()=>nonce});
 try{
  const opening=host.open();panels[0]!.dispose();await host.open();const next=panels[1]!;next.dom!.choose('root',f.f.root);await until(()=>next.view.list.listState==='empty-registry');
  resolve([]);await opening;assert.equal(next.view.list.repoRoot,f.f.root);assert.deepEqual(next.view.list.roots,[f.f.root]);assert.equal(f.owner.view.status,'ready');
 }finally{resolve([]);host.dispose();removals.dispose();probes.dispose();await f.close();}
});
test('CM-S5-RENDER-TS: injected webview host, strict messages/CSP/escaping, all states, masked input and view-only close',{timeout:30000},async()=>{
 const f=await managementFixture(),probes=createConnectionsDraftTests(f.owner),removals=new ConnectionRemovals(f.controller),panels:FakeConnectionPanel[]=[];
 const host=new ConnectionsManagerHost({owner:f.owner,mutations:f.controller,tests:probes,removals,registeredRoots:async()=>[f.f.root],createPanel:()=>{const p=new FakeConnectionPanel();panels.push(p);return p;},nonce:()=>nonce});
 try{
  await host.open();let panel=panels[0]!,dom=panel.dom!;
  assert.equal(panel.view.list.listState,'no-repository');assert.equal(panel.view.list.repoRoot,null);assert.equal(panel.view.list.roots.length,1);
  dom.choose('root',f.f.root);await until(()=>panel.view.list.listState==='empty-registry'&&panel.view.choices.length===29);
  dom.click('add');dom.choose('kind','postgres');dom.input('id','saved');input(dom,['endpoint'],'postgresql://fixture.invalid/database');
  const label='<img src=x onerror=PRIVATE_XSS_CANARY>';input(dom,['label'],label);
  let secret=password(dom);assert.equal(secret.value,'');secret.value='fixture-only-private-ui';secret.fire('input');assert.equal(panel.view.valid,true);
  secret.value='${secret:fixture-invalid}';secret.fire('input');assert.equal(panel.view.valid,false);assert.equal(dom.el('save').disabled,true);assert.equal(f.calls.filter(c=>c==='ticket').length,0);
  secret.value='fixture-only-private-ui';secret.fire('input');assert.equal(panel.view.valid,true);
  assert.ok(!JSON.stringify(panel.posts).includes('fixture-only-private-ui'));assert.equal(dom.el('error').textContent,'');
  const tickets=f.calls.filter(c=>c==='ticket').length;
  dom.click('filter-temporary');assert.equal(panel.view.dirty,true);assert.equal(panel.view.list.filter,'all');assert.equal(dom.activeElement?.id,'confirm-cancel');
  dom.click('confirm-cancel');assert.equal(panel.view.dirty,false);assert.equal(panel.view.draft?.publicValues['label'],label);assert.equal(f.calls.filter(c=>c==='ticket').length,tickets);
  dom.click('save');await until(()=>panel.view.list.counts.saved===1&&panel.view.draft===null&&panel.view.list.listState==='ready');
  assert.equal(f.calls.filter(c=>c==='mutate').length,1);assert.equal(f.calls.filter(c=>c==='ticket').length,1);assert.ok(dom.el('rows').textContent.includes(label));assert.equal(dom.all().filter(e=>e.tag==='img').length,0);
  dom.click('filter-temporary');assert.equal(panel.view.list.listState,'empty-filter');assert.equal(panel.view.list.counts.saved,1);assert.equal(panel.view.list.matchingCount,0);dom.click('clear-filter');
  dom.el('rows').children[0]!.fire('click');assert.equal(panel.view.draft?.mode,'update');assert.equal(dom.el('id').disabled,true);assert.equal(dom.el('kind').disabled,true);assert.equal(dom.el('scope').disabled,true);
  input(dom,['label'],'Unsaved retained label');secret=password(dom);secret.value='fixture-only-private-retained';secret.fire('input');dom.hide();assert.equal(secret.value,'');
  const beforeHide=panel.view,hiddenCalls=f.calls.length;panel.visibility(false);panel.emit({v:1,viewId:beforeHide.viewId,generation:beforeHide.generation,type:'save'});assert.equal(f.calls.length,hiddenCalls);assert.equal(f.owner.view.status,'ready');panel.visibility(true);
  // VS Code may recreate a hidden document from its original HTML. Ready is a same-panel handshake,
  // so its old render generation can only request the current safe projection, never an operation.
  const beforeReady=panel.posts.length;panel.emit({v:1,viewId:panel.view.viewId,generation:0,type:'ready'});assert.equal(panel.posts.length,beforeReady+1);assert.equal(f.calls.length,hiddenCalls);
  const oldPanel=panel,oldHeader={v:1,viewId:panel.view.viewId,generation:panel.view.generation};panel.dispose();assert.equal(f.owner.view.status,'ready');
  await host.open();panel=panels.at(-1)!;dom=panel.dom!;await until(()=>panel.view.list.listState==='ready');
  assert.equal(panel.view.draft?.publicValues['label'],'Unsaved retained label');assert.equal(dom.all().filter(e=>e.type==='password').some(e=>e.value!==''),false);
  const calls=f.calls.length;oldPanel.emit({...oldHeader,type:'save'});panel.emit({v:1,viewId:panel.view.viewId,generation:panel.view.generation,type:'rpc',method:'db.connections.v2.session.end'});assert.equal(f.calls.length,calls);
  dom.click('close');assert.equal(panel.view.dirty,true);dom.click('confirm-cancel');assert.equal(panel.disposed,false);dom.click('close');dom.click('confirm-accept');await until(()=>panel.disposed);assert.equal(f.owner.view.status,'ready');
  await host.open();panel=panels.at(-1)!;dom=panel.dom!;await until(()=>panel.view.list.listState==='ready');
  f.setRefreshFail(true);dom.click('refresh');await until(()=>panel.view.list.listState==='read-error');assert.equal(panel.view.rows.length,1);assert.equal(panel.view.list.stale,true);assert.equal(dom.el('rows').children[0]?.disabled,true);
  f.setRefreshFail(false);dom.click('refresh');await until(()=>panel.view.list.listState==='ready');
  dom.click('add');dom.choose('kind','postgres');dom.choose('scope','temporary');assert.match(dom.el('scope-copy').textContent,/survive repository, manager and Settings switches/);
  dom.input('id','temporary');input(dom,['endpoint'],'postgresql://fixture.invalid/database');dom.click('save');await until(()=>panel.view.list.counts.temporary===1&&panel.view.draft===null&&panel.view.list.listState==='ready');
  assert.equal(panel.view.list.counts.saved,1);panel.dispose();await host.open();panel=panels.at(-1)!;dom=panel.dom!;await until(()=>panel.view.list.listState==='ready');assert.equal(panel.view.list.counts.temporary,1);
  dom.el('rows').children.find(e=>e.textContent.includes('temporary'))!.fire('click');secret=password(dom);secret.value='fixture-only-expiring-ui';secret.fire('input');
  f.owner.expireTemporary();assert.equal(panel.view.draft,null);assert.equal(panel.view.list.counts.temporary,0);assert.equal(panel.view.list.counts.saved,1);assert.equal(panel.view.list.listState,'offline');
  for(const p of panels){assert.ok(!JSON.stringify(p.posts).includes('fixture-only-private-ui'));assert.ok(!JSON.stringify(p.posts).includes('fixture-only-private-retained'));assert.ok(!JSON.stringify(p.posts).includes('fixture-only-expiring-ui'));}
 }finally{host.dispose();removals.dispose();probes.dispose();await f.close();}
});

test('CM-S5-RENDER-TS: exact bounded intent shapes reject authority fields, accessors, stale protocol and generic RPC',()=>{
 const h={v:1,viewId:'fixture-view',generation:3};let getters=0;
 for(const raw of [
  {...h,type:'rpc',method:'db.connections.v2.mutate'}, {...h,type:'save',ticket:{}},{...h,type:'root',value:'/root',capability:'private'},
  {...h,type:'field',path:['constructor'],value:'x'}, {...h,type:'credential',slot:'url.password',action:'keep',value:'private'},
  {...h,type:'operation',recordId:'operation-1',action:'shell'}, {...h,type:'scope',value:'all'}, {...h,type:'save',generation:Number.MAX_SAFE_INTEGER+1},
  {...h,type:'search',value:'bad\nvalue'},Object.create({type:'save'}),
  Object.defineProperty({...h},'type',{enumerable:true,get(){getters++;throw new Error('Private getter');}}),
 ])assert.equal(parseConnectionIntent(raw),null);
 assert.equal(getters,0);assert.equal(parseConnectionIntent({...h,type:'save'})?.type,'save');assert.equal(parseConnectionIntent({...h,type:'credential',slot:'url.password',action:'replace',value:'fixture-only-private'})?.type,'credential');
 const html=connectionManagerDocument(nonce,'<script>alert(1)</script>',1);
 assert.ok(html.includes("default-src 'none'"));assert.ok(html.includes("connect-src 'none'"));assert.ok(html.includes("form-action 'none'"));assert.ok(html.includes('data-view="&lt;script&gt;'));
 assert.equal((html.match(/<script nonce=/g)||[]).length,1);assert.ok(!/innerHTML|setState|getState|localStorage|sessionStorage|fetch\(|XMLHttpRequest|eval\(/.test(CONNECTION_MANAGER_SCRIPT));
 assert.throws(()=>connectionManagerDocument('bad" nonce','id',1));assert.ok(html.includes(':focus-visible'));assert.ok(html.includes('aria-live="polite"'));assert.ok(html.includes('@media(max-width:760px)'));assert.ok(html.includes('--vscode-focusBorder'));
});

test('CM-S5-RENDER-TS: real renderer covers every descriptor, all list states and masked blank credentials without raw JSON',()=>{
 const key={repoRoot:'/fixture/repo-a',scope:'temporary' as const,id:'fixture'};
 const base:ConnectionRenderView={viewId:'fixture',generation:1,list:{roots:[key.repoRoot],repoRoot:key.repoRoot,filter:'all',search:'',listState:'ready',counts:{all:0,saved:0,temporary:0},matchingCount:0,stale:false,canMutate:true},rows:[],choices:connectionDriverChoices(descriptors),draft:null,formId:0,blocked:false,valid:false,test:{status:'idle',tookMs:null,message:'',cleanupUnverified:false},operations:[],confirmation:null,dirty:false,error:'',notice:''};
 const dom=new RendererHarness(connectionManagerDocument(nonce,'fixture',1));let formId=0;
 for(const descriptor of descriptors){const d=new ConnectionDraft(descriptor,key);if(descriptor.secretSlots[0])d.setCredential(descriptor.secretSlots[0],'replace','fixture-only-blank-mask');
  dom.deliver({type:'render',view:{...base,draft:d.view,formId:++formId}});assert.equal(dom.el('error').textContent,'',descriptor.kind);assert.equal(dom.el('kind').children.length,29);assert.equal(dom.all().some(e=>e.tag==='textarea'),false);
  for(const secret of dom.all(dom.el('credentials')).filter(e=>e.tag==='input')){assert.equal(secret.type,'password');assert.equal(secret.value,'');}
  assert.ok(!dom.el('credentials').textContent.includes('fixture-only-blank-mask'));
 }
 for(const state of ['loading','ready','empty-registry','empty-filter','read-error','offline','no-repository','upgrade-required'] as ConnectionListState[]){dom.deliver({type:'render',view:{...base,list:{...base.list,listState:state,canMutate:['ready','empty-registry','empty-filter'].includes(state)}}});assert.ok(dom.el('list-status').textContent.length>0);assert.equal(dom.el('error').textContent,'');}
 const csv=new ConnectionDraft(descriptors.find(d=>d.kind==='csv')!,key);csv.setField(['path'],'data.csv');csv.setField(['options','quote'],false);
 dom.deliver({type:'render',view:{...base,draft:csv.view,formId:++formId}});assert.ok(dom.el('fields').textContent.includes('Fixed value: false'));assert.equal(dom.el('error').textContent,'');
 const nats=new ConnectionDraft(descriptors.find(d=>d.kind==='nats')!,key);nats.setCredentialAddresses('options.servers',['nats://fixture.invalid:4222']);
 dom.deliver({type:'render',view:{...base,draft:nats.view,formId:++formId}});const controls=dom.all(dom.el('credentials'));const add=controls.find(e=>e.tag==='button'&&e.textContent==='Add replacement address');assert.ok(add);add.fire('click');
 assert.equal(dom.all(dom.el('credentials')).filter(e=>e.type==='password').length,2);const remove=dom.all(dom.el('credentials')).find(e=>e.tag==='button'&&e.textContent==='Remove replacement address');assert.ok(remove);remove.fire('click');assert.equal(dom.all(dom.el('credentials')).filter(e=>e.type==='password').length,1);
});
