import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SavedTicketAuthority, canonicalRequestJson, TICKET_LIFETIME_MS, TicketError } from '../management-tickets.js';
import type { TicketKeyStore } from '../management-tickets.js';
import type { ConnectionKey, CredentialPatch, MutationRequest } from '../../../shared/connection-management.js';

async function fixture() {
 const temp = await mkdtemp(join(tmpdir(),'cm-tickets-')); const root=await realpath(temp);
 const vault=new Map<string,string>(); let writes=0; let now=Date.parse('2026-10-24T00:00:00.000Z');
 const keystore:TicketKeyStore={getKey:async ref=>vault.get(ref)??null,setKey:async(ref,value)=>{writes++;vault.set(ref,value);}};
 const options={root,registryId:randomUUID(),adopted:false,keystore,isRegistered:async(path:string)=>path===root,now:()=>now};
 const authority=await SavedTicketAuthority.open(options);
 const key:ConnectionKey={repoRoot:root,id:'fixture',scope:'saved'};
 return {root,vault,options,authority,key,writes:()=>writes,setNow:(n:number)=>{now=n;},close:()=>rm(temp,{recursive:true,force:true})};
}
function code(expected:string) {return (error:unknown)=>{
 if (!(error instanceof TicketError)) return false;
 const messages:Record<string,string>={'invalid-input':'Invalid operation ticket.','operation-mismatch':'Invalid operation ticket.','reconciliation-required':'The operation requires reconciliation.','recovery-required':'Connection management requires recovery.','secret-unavailable':'Connection credentials are unavailable.'};
 assert.equal(error.code,expected);
 assert.equal(error.message,messages[expected]);
 assert.deepEqual(Object.keys(error).sort(),['code','name']);
 return true;
};}

test('CM-S1-C: signed tickets and keyed full-request fingerprints retain credential intent without config effects', async () => {
 const f=await fixture();
 try {
  const persisted={connections:[{id:'fixture',kind:'postgres',family:'file',url:'postgresql://u:${secret:legacy}@localhost/d',namespace:{allow:['retained:*']}}],_management:{revisions:{fixture:'r1'},receipts:{}}};
  const path=join(f.root,'registry.json'); await writeFile(path,JSON.stringify(persisted)); const before=await readFile(path);
  f.vault.set('legacy','stored-canary-password'); const keysBefore=[...f.vault];
  const ticket=await f.authority.issue(f.key,'update');
  assert.equal(Date.parse(ticket.expiresAt)-Date.parse(ticket.issuedAt),TICKET_LIFETIME_MS);
  assert.deepEqual(Object.keys(ticket).sort(),['connectionId','expiresAt','issuedAt','lookupRoot','mode','operationId','scope','signature']);
  const base:MutationRequest={ticket,operationId:ticket.operationId,key:f.key,mode:'update',expectedRevision:'r1'};
  const hashes:string[]=[];
  for (const patch of [{action:'keep'},{action:'clear'},{action:'replace',value:'replacement-canary'}] satisfies CredentialPatch[]) {
   hashes.push(await f.authority.requestMac({...base,credentials:{password:patch}}));
  }
  assert.equal(new Set(hashes).size,3);
  const first=await f.authority.requestMac({...base,credentials:{password:{action:'keep'}}});
  const reopened=await SavedTicketAuthority.open({...f.options,adopted:true});
  assert.equal(await reopened.requestMac({credentials:{password:{action:'keep'}},...base}),first);
  assert.notEqual(await f.authority.requestMac({...base,expectedRevision:'r2'}),await f.authority.requestMac(base));
  assert.deepEqual(await readFile(path),before,'ticket operations do not change pinned family, unknown config, revisions or receipts');
  assert.deepEqual([...f.vault],keysBefore,'no credential values or signing keys rewritten by issue/verify/fingerprint');
  assert.equal(f.writes(),1);
  assert.ok(!Object.keys(f.authority).includes('key'), 'signing material is not enumerable');
  for(const result of [ticket,...hashes]) assert.ok(!JSON.stringify(result).includes('canary'));
 } finally {await f.close();}
});

test('CM-S1-C: malformed, tampered and wrong-target tickets reject with sanitized errors', async () => {
 const f=await fixture();
 try {
  const ticket=await f.authority.issue(f.key,'create');
  const request={ticket,operationId:ticket.operationId,key:f.key,mode:'create'};
  const signature=(ticket.signature[0]==='A'?'B':'A')+ticket.signature.slice(1);
  for (const malformed of [null,[],{}, {...ticket,signature}, {...ticket,extra:'canary'}, {...ticket,connectionId:'changed'}, {...ticket,mode:'update'}, {...ticket,issuedAt:'2026-10-23T00:00:00.000Z'}, {...ticket,expiresAt:'2026-11-25T00:00:00.000Z'}]) {
   await assert.rejects(f.authority.inspect(malformed),code('invalid-input'));
  }
  for(const key of [{...f.key,id:'other'},{...f.key,repoRoot:'/other'},{...f.key,scope:'temporary'}]) {
   await assert.rejects(f.authority.requestMac({...request,key}),code('operation-mismatch'));
  }
  await assert.rejects(f.authority.issue({...f.key,scope:'temporary'},'create'),code('operation-mismatch'));
  const writes=f.writes(); await assert.rejects(f.authority.requestMac({...request,credentials:{password:{action:'keep',value:'canary'}}}),code('invalid-input'));
  assert.equal(f.writes(),writes);
 } finally {await f.close();}
});

test('CM-S1-C: expiry remains authenticated for reconciliation and cannot authorize new replay', async () => {
 const f=await fixture();
 try {
  const ticket=await f.authority.issue(f.key,'create'); const request={ticket,operationId:ticket.operationId,key:f.key,mode:'create'};
  const before=await f.authority.requestMac(request);
  f.setNow(Date.parse(ticket.expiresAt));
  assert.equal((await f.authority.inspect(ticket)).expired,true);
  await assert.rejects(f.authority.requestMac(request),code('reconciliation-required'));
  assert.equal(await f.authority.requestMac(request,{reconciliationOnly:true}),before);
  f.setNow(Date.parse(ticket.issuedAt)-1); await assert.rejects(f.authority.inspect(ticket),code('invalid-input'));
 } finally {await f.close();}
});

test('CM-S1-C: missing, changed or malformed adopted keys never rotate; initialization joins once', async () => {
 const f=await fixture();
 try {
  const initial=new Map<string,string>(); let initialized=0;
  const options={...f.options,registryId:randomUUID(),keystore:{getKey:async(ref:string)=>initial.get(ref)??null,setKey:async(ref:string,value:string)=>{initialized++;initial.set(ref,value);}}};
  const authorities=await Promise.all(Array.from({length:12},()=>SavedTicketAuthority.open(options)));
  assert.equal(authorities.length,12); assert.equal(initialized,1);
  const shared=await authorities[0]!.issue(f.key,'create');
  assert.equal((await authorities[11]!.inspect(shared)).ticket.operationId,shared.operationId);
  assert.equal(f.writes(),1);
  const ref=[...f.vault.keys()][0]!;
  f.vault.delete(ref);
  await assert.rejects(SavedTicketAuthority.open({...f.options,adopted:true}),code('recovery-required'));
  await assert.rejects(f.authority.issue(f.key,'create'),code('recovery-required')); assert.equal(f.writes(),1);
  f.vault.set(ref,'v2:'+randomBytes(32).toString('base64url'));
  await assert.rejects(f.authority.issue(f.key,'create'),code('recovery-required'));
  f.vault.set(ref,'malformed-canary');
  await assert.rejects(SavedTicketAuthority.open(f.options),code('recovery-required')); assert.equal(f.writes(),1);
  await assert.rejects(SavedTicketAuthority.open({...f.options,keystore:{getKey:async()=>{throw new Error('canary');},setKey:async()=>{throw new Error('canary');}}}),code('secret-unavailable'));
  await assert.rejects(SavedTicketAuthority.open({...f.options,isRegistered:async()=>false}),code('invalid-input'));
 } finally {await f.close();}
});

test('CM-S1-C: canonical JSON hashes complete JSON values without lossy or ambiguous coercion', () => {
 assert.equal(canonicalRequestJson({b:[1,'x'],a:{z:false,y:null}}),canonicalRequestJson({a:{y:null,z:false},b:[1,'x']}));
 const cycle:Record<string,unknown>={};cycle.self=cycle;
 for(const value of [undefined,NaN,Infinity,BigInt(1),()=>1,new Date(),{missing:undefined},[undefined],Array(1),cycle,JSON.parse('{"__proto__":1}'),{get value(){throw new Error('canary');}}]) {
  assert.throws(()=>canonicalRequestJson(value),code('invalid-input'));
 }
 assert.throws(()=>canonicalRequestJson({value:'x'.repeat(2*1024*1024+1)}),code('invalid-input'));
});
