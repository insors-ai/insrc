import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConnectionCorpus } from './fixtures/connection-corpus.js';
import { ConnectionReplyError, CONNECTION_REPLY_LIMITS, connectionReplyData, decodeManagementCapabilities, decodeDriverDescriptors, decodeSafeConnection, decodeSafeConnectionList, decodeOperationTicket, decodeMutationOutcome, decodeOperationStatus, decodeDraftTestResult, decodeRemovalState } from '../connection-manager/wire.js';
import type { ConnectionKey, OperationTicket } from '../connection-management.js';
import '../../daemon/db/drivers/index.js';
import { driverDescriptors } from '../../daemon/db/driver-profiles.js';

const corpus=loadConnectionCorpus();
const key=corpus.identity.key as ConnectionKey;
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
 for(const path of ['${secret:PRIVATE_SDK_MESSAGE}','%24%7Bsecret%3APRIVATE_SDK_MESSAGE%7D','%2524%257Bsecret%253APRIVATE_SDK_MESSAGE%257D']){
  const file=example('read');file.publicConfig={path};refuses(()=>decodeSafeConnection(file));
 }
 const rejected=decodeMutationOutcome({status:'rejected',code:'busy',message:'PRIVATE_SDK_MESSAGE'});assert.ok(!JSON.stringify(rejected).includes('PRIVATE_SDK_MESSAGE'));
 const removal=example('removal');removal.safeMessage='PRIVATE_SDK_MESSAGE';assert.ok(!JSON.stringify(decodeRemovalState(removal)).includes('PRIVATE_SDK_MESSAGE'));
 const legacy=example('read');legacy.compatibilityWarning='PRIVATE_SDK_MESSAGE';assert.ok(!JSON.stringify(decodeSafeConnection(legacy)).includes('PRIVATE_SDK_MESSAGE'));
 const unknown=example('outcome');unknown.value.private='PRIVATE_SDK_MESSAGE';refuses(()=>decodeMutationOutcome(unknown));
});
