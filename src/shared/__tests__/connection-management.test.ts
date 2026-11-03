import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseMutationRequest, parseOperationTicket, parseRemovalStateRequest, parseRemovalCleanupRetry, ManagementInputError, rejectManagementInput } from '../connection-management-wire.js';
import type { MutationRequest, ManagementCapabilities, ManagementEnvelope, MemoryRowSource, SafeConnection, RemovalState, CommittedOutcome } from '../connection-management.js';
import type { ConnectionsFile } from '../db-driver.js';

export const ticket = { operationId:randomUUID(), lookupRoot:'/registered/root', scope:'saved' as const, connectionId:'fixture', mode:'create' as const, issuedAt:'2026-10-24T00:00:00.000Z', expiresAt:'2026-11-23T00:00:00.000Z', signature:'synthetic-signature' };
const request: MutationRequest = { ticket, operationId:ticket.operationId, key:{repoRoot:ticket.lookupRoot,scope:ticket.scope,id:ticket.connectionId},mode:'create',publicPatch:{kind:'postgres',label:'fixture'},credentials:{url:{action:'replace',value:'synthetic'}} };

test('CM-S4-INPUT: removal state and cleanup accept only a bounded exact remove ticket', () => {
 const remove = {...ticket,mode:'remove' as const};
 for (const parse of [parseRemovalStateRequest,parseRemovalCleanupRetry]) {
  assert.deepEqual(parse({ticket:remove}),{ticket:remove});
  assert.deepEqual(parse({ticket:{...remove,scope:'temporary'}}),{ticket:{...remove,scope:'temporary'}});
  for (const bad of [null,[],{}, {ticket}, {ticket:{...remove,mode:'update'}},
   {ticket:remove,key:request.key}, {ticket:remove,expectedRevision:'new'}, {ticket:remove,credentials:{}},
   {ticket:{...remove,sourcePath:'secret-canary'}}, {ticket:{...remove,connectionId:'x'.repeat(16385)}},
   {ticket:{...remove,expiresAt:remove.issuedAt}}, {ticket:remove,[Symbol('hidden')]:'secret-canary'},
   {ticket:{...remove,[Symbol('hidden')]:'secret-canary'}}, Object.create({ticket:remove})]) {
   assert.throws(()=>parse(bad),(e:unknown)=>e instanceof ManagementInputError && !e.message.includes('secret-canary'));
  }
  let getterCalls=0;
  const accessor=Object.defineProperty({},'ticket',{enumerable:true,get:()=>{getterCalls++;return remove;}});
  const ticketAccessor=Object.defineProperty({...remove},'signature',{enumerable:true,get:()=>{getterCalls++;return 'secret-canary';}});
  assert.throws(()=>parse(accessor),ManagementInputError);
  assert.throws(()=>parse({ticket:ticketAccessor}),ManagementInputError);
  assert.equal(getterCalls,0);
 }
});

test('CM-S4-INPUT: existing remove target validation and persisted outcome shape stay unchanged', () => {
 const remove={...ticket,mode:'remove' as const};
 const mutation:MutationRequest={ticket:remove,operationId:remove.operationId,key:request.key,mode:'remove',expectedRevision:'r1'};
 assert.deepEqual(parseMutationRequest(mutation),mutation);
 for(const bad of [{...mutation,key:{...request.key,id:'other'}},{...mutation,key:{...request.key,scope:'temporary'}},
  {...mutation,key:{...request.key,repoRoot:'/other'}},{...mutation,expectedRevision:undefined},
  {...mutation,publicPatch:{}},{...mutation,credentials:{}}]) assert.throws(()=>parseMutationRequest(bad),ManagementInputError);
 const outcome:CommittedOutcome={operationId:remove.operationId,revision:'receipt-revision',registration:'removed',activation:'not-applicable',credentialCleanup:'pending'};
 const state:RemovalState={key:request.key,operationId:remove.operationId,state:'removed-cleanup-pending',credentialCleanup:'pending',resourceCleanup:'complete'};
 assert.equal(state.resourceCleanup,'complete');
 assert.deepEqual(Object.keys(outcome).sort(),['activation','credentialCleanup','operationId','registration','revision']);
 // @ts-expect-error Runtime cleanup is sc6 state, never a persisted sc2 outcome key.
 const invalid:CommittedOutcome={...outcome,resourceCleanup:'pending'};
 void invalid;
});

test('CM-S1-J: v2 wire rejects malformed and mismatched tickets without returning draft values', () => {
 assert.deepEqual(parseMutationRequest(request),request);
 for (const malformed of [null,[],{}, {...request,unexpected:'secret-canary'}, {...request,ticket:{...ticket,secretRef:'secret-canary'}}, {...request,ticket:{...ticket,issuedAt:'yesterday'}}, {...request,key:{...request.key,repoRoot:'/another/root'}}, {...request,key:{...request.key,id:'other'}}, {...request,credentials:{url:{action:'keep',value:'secret-canary'}}}, {...request,mode:'update'}, {...request,mode:'remove',expectedRevision:'r'}]) {
  assert.throws(()=>parseMutationRequest(malformed), (e:unknown)=>e instanceof ManagementInputError && !e.message.includes('secret-canary'));
 }
 assert.throws(()=>parseOperationTicket({...ticket,expiresAt:ticket.issuedAt}),ManagementInputError);
});

test('CM-S1-J: legacy document remains readable and v2 declarations preserve safe outcome boundaries', () => {
 const legacy: ConnectionsFile = { connections:[{id:'fixture',kind:'csv',path:'data.csv'}], retained:{opaque:true} };
 const envelope: ManagementEnvelope = {version:2,registryId:'registry',generation:'generation',revisions:{fixture:'r'},receipts:{}};
 const managed: ConnectionsFile = {...legacy,_management:envelope};
 assert.deepEqual(JSON.parse(JSON.stringify(managed)), managed);
 assert.deepEqual(managed.connections,legacy.connections);
 const capability:ManagementCapabilities={version:2,daemonEpoch:'epoch',features:[],receiptRetentionDays:30};
 assert.equal(capability.version,2);
 // These compile-time assignments intentionally reject stored credentials on the wire.
 const safe:SafeConnection={key:request.key,revision:'r',kind:'csv',family:'file',effectiveFamily:'file',publicConfig:{path:'fixture.csv'},credentialPresence:{}};
 // @ts-expect-error SafeConnection has no raw config/secretRef slot.
 const unsafe:SafeConnection={...safe,secretRef:'stored-ref'};
 void unsafe;
 const rowSource: MemoryRowSource | undefined = undefined;
 assert.equal(rowSource,undefined);
});


test('CM-S1-J: protocol declarations compile in strict NodeNext including negative secret-field assignments', () => {
 const program=ts.createProgram([fileURLToPath(import.meta.url)], {strict:true,exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,noEmit:true,skipLibCheck:true,esModuleInterop:true,verbatimModuleSyntax:true,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,target:ts.ScriptTarget.ES2022,types:['node']});
 assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[]);
});


test('CM-S1-J: real legacy save replies retain their shape and v2 errors never return stored credentials', async t => {
 const {connectionSessionRuntime}=await import('../../daemon/connection-session-rpc.js');
 // This legacy-only fixture has no registered daemon DB; explicitly disable its singleton reservation authority.
 t.mock.method(connectionSessionRuntime,'ready',async()=>false);
 const { PATHS } = await import('../paths.js');
 const { saveConnectionRpc } = await import('../../daemon/db-rpc.js');
 const { _setKeystoreForTests } = await import('../../daemon/db/secrets.js');
 const actualKeystore = await import('../keystore.js');
 await import('../../daemon/db/drivers/index.js');
 const isolated = mkdtempSync(join(tmpdir(),'cm-wire-legacy-'));
 const previous = PATHS.insrc;
 const vault = new Map<string,string>();
 const secret = 'synthetic-stored-password-canary';
 try {
  Object.defineProperty(PATHS,'insrc',{value:isolated});
  _setKeystoreForTests({getKey:async ref=>vault.get(ref)??null,setKey:async(ref,value)=>{vault.set(ref,value);},deleteKey:async ref=>{vault.delete(ref);}});
  const legacy=await saveConnectionRpc({repoRoot:isolated,config:{id:'legacy',kind:'postgres',url:`postgresql://fixture:${secret}@localhost/fixture`}}, {connectionIdentity:'fixture-transport',daemonEpoch:'fixture-epoch'});
  assert.ok(!('error' in legacy));
  assert.equal(legacy.id,'legacy'); assert.equal(legacy.family,'rdbms'); assert.equal(typeof legacy.wrotePath,'string');
  assert.ok(!('status' in legacy));
  assert.ok(Object.keys(legacy).every(key=>['id','family','wrotePath','redactedUrl'].includes(key)));
  assert.ok([...vault.values()].includes(secret), 'fake keychain contains the actual stored value');
  assert.ok(!JSON.stringify(legacy).includes(secret));
  let failure:unknown;
  try { parseMutationRequest({...request,key:{...request.key,id:secret}}); } catch(error) { failure=error; }
  const rejected=rejectManagementInput(failure);
  assert.deepEqual(rejected,{status:'rejected',code:'operation-mismatch',message:'Operation target does not match its ticket.'});
  const arbitrary=rejectManagementInput(new Error(secret));
  assert.deepEqual(arbitrary,{status:'rejected',code:'invalid-input',message:'Invalid connection request.'});
  for (const response of [legacy,rejected,arbitrary]) {
   assert.ok(!JSON.stringify(response).includes(secret));
   assert.ok(!Object.hasOwn(response,'config') && !Object.hasOwn(response,'credentials') && !Object.hasOwn(response,'secretRef'));
  }
 } finally { Object.defineProperty(PATHS,'insrc',{value:previous}); _setKeystoreForTests(actualKeystore); rmSync(isolated,{recursive:true,force:true}); }
});
