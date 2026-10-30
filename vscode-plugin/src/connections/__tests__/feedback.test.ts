import assert from 'node:assert/strict';
import test from 'node:test';
import { managementFixture } from './fixtures/management.js';
import { FakeConnectionPanel } from './fixtures/renderer.js';
import { ConnectionsManagerHost } from '../host.js';
import { createConnectionsDraftTests } from '../gateway.js';
import { ConnectionRemovals } from '../../../../src/shared/connection-manager/removal.js';
import { DATASOURCE_MARKS } from '../datasource-icons.js';
import { loadConnectionCorpus } from '../../../../src/shared/__tests__/fixtures/connection-corpus.js';
import { parseConnectionIntent } from '../types.js';

async function until(fn:()=>boolean):Promise<void>{const end=Date.now()+8000;while(!fn()){if(Date.now()>end)throw new Error('Feedback fixture did not settle');await new Promise<void>(r=>setTimeout(r,5));}}
async function fixture(){
 const f=await managementFixture(),probes=createConnectionsDraftTests(f.owner),removals=new ConnectionRemovals(f.controller),panels:FakeConnectionPanel[]=[];
 const host=new ConnectionsManagerHost({owner:f.owner,mutations:f.controller,tests:probes,removals,registeredRoots:async()=>f.roots,openedPath:()=>f.f.root,createPanel:()=>{const p=new FakeConnectionPanel();panels.push(p);return p;}});
 await host.open();await until(()=>panels[0]!.view.list.listState==='empty-registry');
 return {f,host,panels,close:async()=>{host.dispose();removals.dispose();probes.dispose();await f.close();}};
}

test('CM-S5-RENDER-TS: datasource badges cover every driver and the icon picker supports selection and keyboard navigation',async()=>{
 const f=await fixture();try{
  const panel=f.panels[0]!,dom=panel.dom!;dom.click('add');
  assert.deepEqual(Object.keys(DATASOURCE_MARKS).sort(),loadConnectionCorpus().driverDescriptors.map(d=>d.kind).sort());
  assert.equal(new Set(Object.values(DATASOURCE_MARKS)).size,29);
  dom.click('kind');assert.equal(dom.el('kind-options').hidden,false);assert.equal(dom.el('kind').getAttribute('aria-expanded'),'true');
  const options=dom.el('kind-options').children;assert.equal(options.length,29);
  for(const option of options){assert.equal(option.getAttribute('role'),'option');assert.equal(option.children[0]!.tag,'svg');assert.equal(option.children[0]!.getAttribute('data-datasource'),option.value);}
  dom.el('kind-options').fire('keydown',{key:'End'});assert.equal(dom.activeElement,options.at(-1));
  dom.el('kind-options').fire('keydown',{key:'Home'});assert.equal(dom.activeElement,options[0]);
  dom.el('kind-options').fire('keydown',{key:'Escape'});assert.equal(dom.el('kind-options').hidden,true);assert.equal(dom.activeElement,dom.el('kind'));
  dom.click('kind');options.find(o=>o.value==='sqlite')!.fire('click');assert.equal(panel.view.draft?.kind,'sqlite');assert.equal(dom.el('kind').children[0]!.getAttribute('data-datasource'),'sqlite');
  assert.equal(dom.el('kind-options').hidden,true);dom.click('kind');dom.el('kind-picker').fire('focusout',{relatedTarget:dom.el('scope')});assert.equal(dom.el('kind-options').hidden,true);
 }finally{await f.close();}
});

test('CM-S5-RENDER-TS: fixed two-line history retains safe messages, cycles in a popup, and survives manager reopen',async()=>{
 const f=await fixture();try{
  let panel=f.panels[0]!,dom=panel.dom!;assert.match(panel.html,/#message-section\{position:fixed;bottom:0/);assert.match(panel.html,/grid-template-rows:1\.4em 1\.4em/);
  assert.equal(dom.el('message-open').disabled,true);dom.click('add');dom.click('save');
  assert.equal(panel.view.messages?.length,1);assert.match(dom.el('message-latest').textContent,/Connection ID/);
  const before=panel.view.messages!.length;dom.input('id','draft');assert.equal(panel.view.messages!.length,before,'render/edit does not duplicate status history');
  const messages=[{id:50,text:'First <img src=x onerror=bad>'},{id:51,text:'Latest safe status'}];
  dom.deliver({type:'render',view:{...panel.view,messages}});assert.equal(dom.el('message-count').textContent,'2 messages');assert.equal(dom.el('message-latest').textContent,'Latest safe status');
  dom.click('message-open');assert.equal(dom.el('message-dialog').open,true);assert.equal(dom.el('message-text').textContent,'Latest safe status');
  dom.click('message-prev');assert.equal(dom.el('message-text').textContent,messages[0]!.text);assert.equal(dom.el('message-position').textContent,'1 / 2');assert.equal(dom.all().filter(e=>e.tag==='img').length,0);
  dom.click('message-prev');assert.equal(dom.el('message-text').textContent,'Latest safe status');dom.click('message-next');assert.equal(dom.el('message-position').textContent,'1 / 2');
  dom.el('message-dialog').fire('cancel');assert.equal(dom.el('message-dialog').open,false);assert.equal(dom.activeElement,dom.el('message-open'));
  // Host history is authoritative and never accepts the synthetic renderer projection.
  panel.dispose();await f.host.open();panel=f.panels.at(-1)!;await until(()=>panel.view.list.listState==='empty-registry');dom=panel.dom!;
  assert.match(panel.view.messages?.[0]?.text??'',/Enter a Connection ID/);assert.ok(panel.view.messages!.length>=before);assert.ok(!JSON.stringify(panel.view.messages).includes('onerror'));
  for(let i=0;i<205;i++)dom.click('save');assert.equal(panel.view.messages?.length,200);assert.match(dom.el('message-count').textContent,/latest 200/);
  assert.equal(dom.sinkCalls.length,0);
 }finally{await f.close();}
});

test('CM-S5-RENDER-TS: per-row removal captures its own target with dirty-draft cancellation and stale-row refusal',async()=>{
 const f=await fixture();try{
  await f.f.controller.submit(f.f.draft('a'));await f.f.controller.submit(f.f.draft('b'));
  const panel=f.panels[0]!,dom=panel.dom!;await until(()=>panel.view.rows.length===2);
  assert.ok(!panel.html.includes('id="remove"'));
  const index=(id:string)=>panel.view.rows.findIndex(row=>row.key.id===id);
  dom.row(index('a')).fire('click');assert.equal(dom.el('kind').disabled,true);assert.equal(dom.el('kind').children[0]!.getAttribute('data-datasource'),'postgres');
  const label=dom.all(dom.el('fields')).find(e=>e.getAttribute('data-field')==='["label"]')!;label.value='dirty draft';label.fire('input');
  const target=panel.view.rows[index('b')]!,before=f.f.requests.length;
  assert.equal(dom.rowRemove(index('b')).children[0]!.tag,'svg');assert.match(dom.rowRemove(index('b')).getAttribute('title')!,/Delete b/);
  dom.rowRemove(index('b')).focus();dom.rowRemove(index('b')).fire('click');assert.equal(panel.view.dirty,true);dom.click('confirm-cancel');assert.equal(f.f.requests.length,before);assert.equal(panel.view.draft?.key.id,'a');assert.equal(dom.activeElement,dom.rowRemove(index('b')));
  dom.rowRemove(index('b')).fire('click');dom.click('confirm-accept');assert.equal(panel.view.confirmation?.key.id,'b');dom.click('confirm-cancel');assert.equal(f.f.requests.length,before);
  const header={v:1 as const,viewId:panel.view.viewId,generation:panel.view.generation};
  const stale={...header,type:'remove-row',key:target.key,revision:'00000000-0000-4000-8000-000000000000'};
  assert.ok(parseConnectionIntent(stale));assert.equal(parseConnectionIntent({...stale,method:'db.deleteConnection'}),null);panel.emit(stale);assert.equal(panel.view.confirmation,null);
  dom.rowRemove(index('b')).fire('click');assert.equal(panel.view.confirmation?.key.id,'b');dom.click('confirm-accept');await until(()=>panel.view.rows.length===1);
  assert.equal(panel.view.rows[0]!.key.id,'a');assert.equal(f.f.legacyWrites(),0);assert.ok(!JSON.stringify(panel.view.messages).includes('fixture-only-private-replacement'));
 }finally{await f.close();}
});
