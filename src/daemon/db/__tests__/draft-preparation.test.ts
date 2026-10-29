import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,realpath,readFile,writeFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PATHS} from '../../../shared/paths.js';
import {connectionsPath,repoIdOf} from '../config.js';
import {adoptManagedRoot} from '../management-adoption.js';
import {openManagedRoot} from '../management-startup.js';
import {makeSecretRef,referencedSecrets,_setKeystoreForTests} from '../secrets.js';
import {savedManagementFor,withSavedRootGate} from '../management.js';
import {DriverPool} from '../pool.js';
import {PreparationJournal} from '../managed-store.js';
import type {Driver} from '../../../shared/db-driver.js';
import '../drivers/index.js';

test('CM-S2-F1: production metadata admission precedes secrets and prepares only selected owned credentials without effects',async()=>{
 const directory=await realpath(await mkdtemp(join(tmpdir(),'draft-prepare-'))),root=join(directory,'repo'),old=PATHS.insrc;
 await mkdir(root);Object.defineProperty(PATHS,'insrc',{value:join(directory,'state'),configurable:true});
 const values=new Map<string,string>(),reads:string[]=[],writes:string[]=[];
 let pause: (()=>Promise<void>) | undefined,failStages=false;
 const keystore={getKey:async(ref:string)=>{reads.push(ref);if(ref.startsWith('db:v2:'))await pause?.();return values.get(ref)??null;},setKey:async(ref:string,value:string)=>{writes.push(ref);if(failStages && ref.startsWith('db:v2:'))throw new Error('stage failure');values.set(ref,value);},deleteKey:async(ref:string)=>{writes.push(ref);values.delete(ref);}};
 const previous=_setKeystoreForTests(keystore),path=connectionsPath(root);
 const ports={isRegistered:async(r:string)=>r===root,keystore,enablement:async()=>({ready:true,digest:'a'.repeat(64)}),stopped:{source:'safe-stop-control' as const,pid:2147483647,processIdentity:'b'.repeat(64),stoppedAt:new Date().toISOString()}};
 const pool=new DriverPool(root,{factory:()=>async config=>({id:config.id,kind:config.kind,family:'rdbms',close:async()=>{}} as Driver)});
 let owner: Awaited<ReturnType<typeof openManagedRoot>> | undefined;
 try {
  await mkdir(dirname(path),{recursive:true});
  const connections=['selected','unrelated'].map(id=>{const ref=makeSecretRef(repoIdOf(root),id);values.set(ref,id+'-password');return {id,kind:'postgres',url:'postgres://user:${secret:'+ref+'}@host/db',secretRef:ref};});
  await writeFile(path,JSON.stringify({connections}),{mode:0o600});await adoptManagedRoot(root,ports);
  owner=await openManagedRoot(root,{...ports,pool:async()=>{await pool.reload();return pool;}});
  const service=savedManagementFor(root)!,document=JSON.parse(await readFile(path,'utf8')),selected=document.connections.find((c:{id:string})=>c.id==='selected'),selectedRefs=referencedSecrets(selected),unrelatedRefs=referencedSecrets(document.connections.find((c:{id:string})=>c.id==='unrelated'));
  const revision=document._management.revisions.selected,key={repoRoot:root,scope:'saved' as const,id:'selected'},context={connectionIdentity:'fixture',access:{lookupRoot:root,managementRepoRoot:root,daemonEpoch:'epoch'}};
  const base={key,expectedRevision:revision,publicPatch:{},credentials:{}};
  const reload=mock.method(pool,'reload',async()=>{throw new Error('probe must not reload pool');});
  const before=await readFile(path),vault=[...values];reads.length=0;writes.length=0;
  for(const request of [{...base,key:{...key,id:'missing'}},{...base,expectedRevision:randomUUID()},{key,publicPatch:{},credentials:{}}]) {
   await assert.rejects(service.prepareDraft(context,request));assert.deepEqual(reads,[]);
  }
  await assert.rejects(service.prepareDraft(context,base,AbortSignal.abort()));assert.deepEqual(reads,[]);
  const kept=await service.prepareDraft(context,base);assert.equal(decodeURIComponent(new URL(kept.config.url!).password),'selected-password');
  assert.ok(reads.every(ref=>ref.startsWith('db-management:') || selectedRefs.has(ref)));
  assert.ok(reads.every(ref=>!unrelatedRefs.has(ref)));assert.ok(reads.some(ref=>selectedRefs.has(ref)));
  for(const patch of [{action:'replace' as const,value:'replacement'},{action:'clear' as const}]) {
   reads.length=0;const effective=await service.prepareDraft(context,{...base,credentials:{'url.password':patch}});
   assert.equal(decodeURIComponent(new URL(effective.config.url!).password),patch.action==='replace'?'replacement':'');
   assert.ok(reads.every(ref=>!unrelatedRefs.has(ref)));
  }
  let release!:()=>void,started!:()=>void;const announced=new Promise<void>(r=>{started=r;}),blocked=new Promise<void>(r=>{release=r;});
  pause=async()=>{started();await blocked;};const pending=service.prepareDraft(context,base);await announced;
  let entered=false;const queued=withSavedRootGate(root,async()=>{entered=true;});await new Promise(r=>setImmediate(r));assert.equal(entered,false);release();await pending;await queued;pause=undefined;
  assert.equal(reload.mock.callCount(),0);assert.deepEqual(writes,[]);assert.deepEqual([...values],vault);assert.deepEqual(await readFile(path),before);
  // An admitted existing-row probe keeps the same pool lease after preparation.
  let releases=0;const originalLease=pool.lease.bind(pool);const leased=mock.method(pool,'lease',async id=>{const lease=await originalLease(id);return {...lease,release:async()=>{releases++;await lease.release();}};});
  let drain!:()=>void;const drained=new Promise<void>(resolve=>{drain=resolve;});
  await service.prepareDraft(context,base,undefined,drained);
  assert.equal(pool.leaseState(key.id).active,1);
  assert.throws(()=>pool.prepareRemoval(key.id,revision,randomUUID()),{code:'busy'});
  drain();drain();await drained;await new Promise(resolve=>setImmediate(resolve));assert.equal(pool.leaseState(key.id).active,0);assert.equal(releases,1);leased.mock.restore();
  const preparedRemoval=pool.prepareRemoval(key.id,revision,randomUUID());pool.cancelRemoval(preparedRemoval);
  let unsavedDrain!:()=>void;const unsavedWork=new Promise<void>(resolve=>{unsavedDrain=resolve;});
  await service.prepareDraft(context,{key:{...key,id:'unsaved'},publicPatch:{kind:'postgres',endpoint:'postgres://host/db'},credentials:{}},undefined,unsavedWork);
  assert.equal(pool.leaseState('unsaved').active,0);unsavedDrain();
  const signing=[...values.keys()].find(ref=>ref.startsWith('db-management:'))!;const signingValue=values.get(signing)!;values.delete(signing);await assert.rejects(service.prepareDraft(context,base));values.set(signing,signingValue);
  await chmod(path,0o600);reads.length=0;await assert.rejects(service.prepareDraft(context,base));assert.deepEqual(reads,[]);await chmod(path,0o400);
  reload.mock.restore();
  const ticket=await service.ticket(context,key,'update');failStages=true;
  const failed=await service.mutate(context,{ticket,operationId:ticket.operationId,key,mode:'update',expectedRevision:revision,publicPatch:{},credentials:{'url.password':{action:'replace',value:'uncommitted'}}});
  assert.equal(failed.status,'rejected');failStages=false;
  const journal=await PreparationJournal.open(path,document._management.registryId);assert.ok((await journal.pending()).length>0);
  const pendingBytes=await readFile(path),pendingVault=[...values];reads.length=0;writes.length=0;
  await assert.rejects(service.prepareDraft(context,base));
  assert.deepEqual(reads,[]);assert.deepEqual(writes,[]);assert.deepEqual(await readFile(path),pendingBytes);assert.deepEqual([...values],pendingVault);
 } finally {await owner?.close();await pool.closeAll();_setKeystoreForTests(previous);Object.defineProperty(PATHS,'insrc',{value:old,configurable:true});await rm(directory,{recursive:true,force:true});}
});
