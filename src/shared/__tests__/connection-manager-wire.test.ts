import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConnectionCorpus } from './fixtures/connection-corpus.js';
import { ConnectionReplyError, CONNECTION_REPLY_LIMITS, connectionReplyData, decodeManagementCapabilities, decodeDriverDescriptors, decodeSafeConnection, decodeSafeConnectionList, decodeOperationTicket, decodeMutationOutcome, decodeOperationStatus, decodeDraftTestResult, decodeRemovalState, decodePublicConnectionPatch } from '../connection-manager/wire.js';
import type { ConnectionKey, OperationTicket } from '../connection-management.js';
import type { ConnectionConfig } from '../db-driver.js';
import '../../daemon/db/drivers/index.js';
import { driverDescriptors, safeConnection as projectSafeConnection, materializeDraft, ProfileError } from '../../daemon/db/driver-profiles.js';

const corpus=loadConnectionCorpus();
const key=corpus.identity.key as ConnectionKey;
test('CM-S5-WIRE-TS: shared endpoint safety cases retain values across read list and patch boundaries',()=>{
 assert.equal(corpus.endpointPolicy.version,2);assert.equal(corpus.endpointCases.length,77);
 for(const item of corpus.endpointCases){
  const row=example('read');row.publicConfig.endpoint=item.value;
  const actions=[()=>decodeSafeConnection(row).publicConfig['endpoint'],()=>decodeSafeConnectionList([row],key.repoRoot)[0]!.publicConfig['endpoint'],()=>decodePublicConnectionPatch({endpoint:item.value})['endpoint'],()=>((decodePublicConnectionPatch({options:{endpoint:item.value}})['options'] as Record<string,unknown>)['endpoint'])];
  for(const action of actions)if(item.valid)assert.equal(action(),item.value,item.id);else assert.throws(action,ConnectionReplyError,item.id);
 }
});
test('CM-S5-WIRE-TS: unsupported opaque producer inputs remain server-owned readonly metadata',()=>{
 for(const [kind,url] of [['postgres','jdbc:postgresql://user:pw@host/db'],['oracle','jdbc:oracle:thin:user/pw@host']] as const){
  const config:ConnectionConfig={id:key.id,kind,url};const before=structuredClone(config);
  const row=projectSafeConnection(config,key,corpus.identity.revision);
  assert.equal(row.readOnly,true);assert.equal(Object.hasOwn(row.publicConfig,'endpoint'),false);
  assert.equal(decodeSafeConnection(row).readOnly,true);assert.equal(JSON.stringify(row).includes('user/pw'),false);assert.equal(JSON.stringify(row).includes('user:pw'),false);
  assert.deepEqual(config,before,'the producer retains the original SDK-specific config server-side');
 }
});
test('CM-S5-WIRE-TS: producer projection remains list-decodable and daemon owns address dialect rejection',async()=>{
 const bad=['postgres://host/db\\x','postgres://host/db'+String.fromCharCode(127),'postgres://host/db'+String.fromCharCode(0x85),'postgres://host/db'+String.fromCharCode(0xd800),'mysql://host/a%ff','postgres://h/db?application_name=%E9'];
 const configs:ConnectionConfig[]=bad.map((url,i)=>({id:'unsafe-'+i,kind:url.startsWith('mysql:')?'mysql':'postgres',url}));
 configs.push({id:'unsafe-dynamo',kind:'dynamodb',options:{region:'test',endpoint:'http://localhost:8000/a\\b'}});
 const rows=configs.map(config=>{const before=structuredClone(config);const row=projectSafeConnection(config,{...key,id:config.id},corpus.identity.revision);assert.equal(row.readOnly,true);assert.equal(Object.hasOwn(row.publicConfig,'endpoint'),false);assert.equal(Object.hasOwn((row.publicConfig['options']??{}) as object,'endpoint'),false);assert.deepEqual(config,before);return row;});
 assert.equal(decodeSafeConnectionList(rows,key.repoRoot).length,rows.length);
 for(const kind of ['postgres','cockroachdb','mysql','mariadb','mssql','oracle','clickhouse','redis','valkey','keydb','mongodb']){
  const scheme=kind==='cockroachdb'?'postgres':kind==='clickhouse'?'https':['valkey','keydb'].includes(kind)?'redis':kind;
  const config:ConnectionConfig={id:'valid-'+kind,kind,url:scheme+'://user:pw@host/db'};const before=structuredClone(config);
  const row=projectSafeConnection(config,{...key,id:config.id},corpus.identity.revision);assert.equal(row.readOnly,false,kind);assert.equal(decodeSafeConnection(row).readOnly,false,kind);assert.deepEqual(config,before);
 }
 for(const publicPatch of [
  {kind:'postgres',endpoint:'jdbc://postgresql://u:p@h/db'},
  {kind:'mssql',endpoint:'sqlserver://host;password=x;user=y/db'},
  {kind:'nats',options:{servers:['nats://u:p@host:4222'],bucket:'fixture'}},
  {kind:'etcd',options:{hosts:['http://u:p@host:2379']}},
 ])await assert.rejects(materializeDraft({key,mode:'create',publicPatch,readSecret:async()=>null}),ProfileError);
});
const decoders:Record<string,(v:unknown)=>unknown>={capabilities:decodeManagementCapabilities,list:v=>decodeSafeConnectionList(v,key.repoRoot),read:decodeSafeConnection,ticket:decodeOperationTicket,outcome:decodeMutationOutcome,status:decodeOperationStatus,test:decodeDraftTestResult,removal:decodeRemovalState};
type MutableFixture = Record<string,unknown> & {publicConfig:Record<string,unknown>;value:Record<string,unknown>};
function example(kind:string):MutableFixture { return structuredClone(corpus.wire.find(c=>c.kind===kind&&c.valid)!.input) as MutableFixture; }
function refuses(fn:()=>unknown):void { assert.throws(fn,e=>e instanceof ConnectionReplyError&&e.code==='invalid-response'&&e.message==='The daemon returned an invalid connection response.'); }

test('CM-S5-WIRE-TS: bounded strict TypeScript v2 reply decoding and descriptor refusal',()=>{
 for(const c of corpus.wire){const decode=decoders[c.kind];assert.ok(decode,c.kind);if(c.valid)assert.doesNotThrow(()=>decode(c.input),c.id);else refuses(()=>decode(c.input));}
 const descriptors=driverDescriptors(), decoded=decodeDriverDescriptors(descriptors);
 assert.equal(decoded.length,29);assert.equal(decoded.filter(d=>d.editable).length,29,'all current audited schemas supported');
 const changed={...descriptors[0]!,publicInputSchema:{...descriptors[0]!.publicInputSchema,unevaluatedProperties:false}};
 const disabled=decodeDriverDescriptors([changed])[0]!;assert.equal(disabled.editable,false);assert.match(disabled.unsupportedReason!,/newer connection editor/);
 const unknownRequired={...descriptors[0]!,publicInputSchema:{...descriptors[0]!.publicInputSchema,required:['notAField']}};assert.equal(decodeDriverDescriptors([unknownRequired])[0]!.editable,false);
 const kindMissing={...descriptors[0]!,publicInputSchema:{type:'object',properties:{},required:[],additionalProperties:false}};assert.equal(decodeDriverDescriptors([kindMissing])[0]!.editable,false);
 refuses(()=>decodeDriverDescriptors([descriptors[0],descriptors[0]]));
 refuses(()=>decodeDriverDescriptors([{...descriptors[0],secretSlots:['runtimeAuth.private']} ]));
 refuses(()=>decodeDriverDescriptors([{...descriptors[0],rawConfig:{}}]));
});

test('CM-S5-WIRE-TS: rejects accessor prototype symbol sparse cyclic and excessive data without invoking getters',()=>{
 let calls=0;const v={...example('capabilities')};Object.defineProperty(v,'daemonEpoch',{enumerable:true,get(){calls++;throw new Error('PRIVATE_SDK_MESSAGE');}});refuses(()=>decodeManagementCapabilities(v));assert.equal(calls,0);
 const toJSON={...example('capabilities'),toJSON(){calls++;return {};}};refuses(()=>decodeManagementCapabilities(toJSON));assert.equal(calls,0);
 refuses(()=>connectionReplyData(Object.create(null)));refuses(()=>connectionReplyData(Object.create({private:true})));
 const symbol={a:1,[Symbol('private')]:2};refuses(()=>connectionReplyData(symbol));
 const hidden={a:1};Object.defineProperty(hidden,'b',{value:2});refuses(()=>connectionReplyData(hidden));
 refuses(()=>connectionReplyData(new Array(3)));const extra=[1] as number[]&{private?:boolean};extra.private=true;refuses(()=>connectionReplyData(extra));
 const cyclic:Record<string,unknown>={};cyclic['self']=cyclic;refuses(()=>connectionReplyData(cyclic));
 let deep:unknown={};for(let n=0;n<=CONNECTION_REPLY_LIMITS.depth;n++)deep={child:deep};refuses(()=>connectionReplyData(deep));
 refuses(()=>connectionReplyData('x'.repeat(CONNECTION_REPLY_LIMITS.string+1)));
 refuses(()=>connectionReplyData({['x'.repeat(CONNECTION_REPLY_LIMITS.string+1)]:true}));
 refuses(()=>connectionReplyData(Array.from({length:CONNECTION_REPLY_LIMITS.items+1},()=>0)));
 const large=Array.from({length:1100},()=> 'x'.repeat(CONNECTION_REPLY_LIMITS.string));refuses(()=>connectionReplyData(large));
 refuses(()=>connectionReplyData(Number.NaN));refuses(()=>connectionReplyData(BigInt(1)));
 const nested:{value:number}={value:1};const copy=connectionReplyData({nested}) as {nested:{value:number}};nested.value=2;assert.equal(copy.nested.value,1);
});

test('CM-S5-WIRE-TS: validates root key operation mode epoch and stale test tuple before use',()=>{
 refuses(()=>decodeManagementCapabilities(example('capabilities'),'wrong-epoch'));
 refuses(()=>decodeSafeConnection(example('read'),{key:{...key,id:'other'}}));
 refuses(()=>decodeSafeConnectionList(example('list'),'/fixture/wrong-root'));
 refuses(()=>decodeSafeConnectionList([example('read'),example('read')],key.repoRoot));
 refuses(()=>decodeOperationTicket(example('ticket'),{key:{...key,scope:'temporary'}}));
 refuses(()=>decodeOperationTicket(example('ticket'),{operationId:'33333333-3333-4333-8333-333333333333'}));
 refuses(()=>decodeOperationTicket(example('ticket'),{mode:'update'}));
 refuses(()=>decodeMutationOutcome(example('outcome'),{mode:'create'}));
 refuses(()=>decodeOperationStatus(example('outcome'),{operationId:'33333333-3333-4333-8333-333333333333'}));
 refuses(()=>decodeDraftTestResult(example('test'),{daemonEpoch:'new-epoch'}));
 refuses(()=>decodeDraftTestResult(example('test'),{draftRevision:3}));
 refuses(()=>decodeDraftTestResult(example('test'),{key:{...key,repoRoot:'/fixture/other'}}));
 refuses(()=>decodeRemovalState(example('removal'),{key:{...key,id:'new-generation-id'}}));
 const ticket=decodeOperationTicket(example('ticket'),{key,mode:'remove'}) as OperationTicket;assert.equal(ticket.operationId,corpus.identity.operationId);
});

test('CM-S5-WIRE-TS: rejects private public-config values and strips untrusted error copy',()=>{
 const raw=example('read');raw.publicConfig.secretRef='PRIVATE_SDK_MESSAGE';refuses(()=>decodeSafeConnection(raw));
 const endpoint=example('read');endpoint.publicConfig.endpoint='postgresql://secret:password@fixture.invalid/db';refuses(()=>decodeSafeConnection(endpoint));
 for(const value of ['redis://:pw@my_host:6379','postgresql://u:p@a:1,b:2/db']){
  const authority=example('read');authority.publicConfig.endpoint=value;refuses(()=>decodeSafeConnection(authority));refuses(()=>decodePublicConnectionPatch({endpoint:value}));
 }
 for(const value of ['https://host/?q=a b','https://host/?q={value}','https://host/[value]?q=100%']){
  const escaped=example('read');escaped.publicConfig.endpoint=value;assert.equal(decodeSafeConnection(escaped).publicConfig['endpoint'],value);assert.equal(decodeSafeConnectionList([escaped],key.repoRoot).length,1);assert.equal(decodePublicConnectionPatch({endpoint:value})['endpoint'],value);
 }
 refuses(()=>decodePublicConnectionPatch({endpoint:'https://bad host/?q=ok'}));
 for(const path of ['${secret:PRIVATE_SDK_MESSAGE}','%24%7Bsecret%3APRIVATE_SDK_MESSAGE%7D','%2524%257Bsecret%253APRIVATE_SDK_MESSAGE%257D']){
  const file=example('read');file.publicConfig={path};refuses(()=>decodeSafeConnection(file));
 }
 const rejected=decodeMutationOutcome({status:'rejected',code:'busy',message:'PRIVATE_SDK_MESSAGE'});assert.ok(!JSON.stringify(rejected).includes('PRIVATE_SDK_MESSAGE'));
 const removal=example('removal');removal.safeMessage='PRIVATE_SDK_MESSAGE';assert.ok(!JSON.stringify(decodeRemovalState(removal)).includes('PRIVATE_SDK_MESSAGE'));
 const legacy=example('read');legacy.compatibilityWarning='PRIVATE_SDK_MESSAGE';assert.ok(!JSON.stringify(decodeSafeConnection(legacy)).includes('PRIVATE_SDK_MESSAGE'));
 const unknown=example('outcome');unknown.value.private='PRIVATE_SDK_MESSAGE';refuses(()=>decodeMutationOutcome(unknown));
});
