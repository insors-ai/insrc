import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseDraftTestRequest, parseTestCancellation, parseDraftTestResult, assertDraftTestJson, DRAFT_TEST_MAX_BYTES, ManagementInputError } from '../connection-management-wire.js';
import { parseProbeWorkerStart, parseProbeWorkerCancel, parseProbeWorkerResult } from '../../daemon/db/draft-probe.js';

test('CM-S2-A1: strict public test requests reject malformed oversized and forged fields', () => {
	const request={requestId:randomUUID(),draftRevision:0,key:{repoRoot:'/repo',scope:'saved',id:'source'},publicPatch:{kind:'postgres',endpoint:'postgres://host/db'},credentials:{password:{action:'replace',value:'private-canary'}}};
	assert.deepEqual(parseDraftTestRequest(request),request);
	assert.throws(()=>parseDraftTestRequest({...request,credentials:{runtimeAuth:{action:'keep'}}}),ManagementInputError);
	for (const publicPatch of [{runtimeAuth:{}},{options:{runtimeAuth:{accessKeyId:'canary'}}},{options:{nested:[{runtimeAuth:{}}]}}]) assert.throws(()=>parseDraftTestRequest({...request,publicPatch}),ManagementInputError);
	for(const bad of [{...request,owner:'spoof'},{...request,runtimeAuth:{}},{...request,key:{...request.key,daemonEpoch:'spoof'}},{...request,requestId:'invalid'},{...request,draftRevision:-1},{...request,draftRevision:1.5},{...request,draftRevision:Number.MAX_SAFE_INTEGER+1},{...request,expectedRevision:''},{...request,credentials:{password:{action:'keep',value:'secret'}}},{...request,publicPatch:{value:'x'.repeat(DRAFT_TEST_MAX_BYTES)}}]) assert.throws(()=>parseDraftTestRequest(bad),ManagementInputError);
	assert.deepEqual(parseTestCancellation({requestId:request.requestId}),{requestId:request.requestId});
	assert.throws(()=>parseTestCancellation({requestId:request.requestId,owner:'spoof'}),ManagementInputError);
	const cycle: Record<string,unknown>={};cycle['self']=cycle;
	for(const bad of [cycle,{value:undefined},{value:BigInt(1)},{value:NaN},{value:new Date()},new Array(2)]) assert.throws(()=>assertDraftTestJson(bad),ManagementInputError);
	assertDraftTestJson('x'.repeat(DRAFT_TEST_MAX_BYTES-2));
	assert.throws(()=>assertDraftTestJson('x'.repeat(DRAFT_TEST_MAX_BYTES-1)),ManagementInputError);
	assert.throws(()=>assertDraftTestJson('é'.repeat(DRAFT_TEST_MAX_BYTES/2)),ManagementInputError);
});
test('CM-S2-A1: private worker messages validate auth and exact nonce correlation without raw errors', () => {
	const start={type:'start',requestId:randomUUID(),nonce:'a'.repeat(64),lookupRoot:'/repo',config:{id:'file',kind:'csv',path:'/repo/file.csv'}};
	assert.deepEqual(parseProbeWorkerStart(start),start);
	for (const options of [{runtimeAuth:{}},{nested:[{runtimeAuth:{}}]}]) assert.throws(()=>parseProbeWorkerStart({...start,config:{...start.config,options}}),ManagementInputError);
	const result={type:'result',requestId:start.requestId,nonce:start.nonce,code:'reachable'};
	assert.deepEqual(parseProbeWorkerResult(result,start),result);
	assert.deepEqual(parseProbeWorkerCancel({type:'cancel',requestId:start.requestId,nonce:start.nonce}),{type:'cancel',requestId:start.requestId,nonce:start.nonce});
	for(const bad of [{...result,nonce:'b'.repeat(64)},{...result,requestId:randomUUID()},{...result,error:'private-canary'},{...result,code:'raw-server-exception'}]) assert.throws(()=>parseProbeWorkerResult(bad,start),ManagementInputError);
	for(const bad of [{...start,runtimeAuth:{}},{...start,nonce:'x'},{...start,config:{...start.config,secretRef:'foreign'}},{...start,config:{...start.config,options:[]}},{...start,config:{...start.config,namespace:{allow:[3]}}}]) assert.throws(()=>parseProbeWorkerStart(bad),ManagementInputError);
	const aws={...start,config:{id:'aws',kind:'dynamodb'},runtimeAuth:{type:'aws-v1',accessKeyId:'key',secretAccessKey:'secret',sessionToken:'token',expiration:'2030-01-01T00:00:00.000Z'}};
	assert.deepEqual(parseProbeWorkerStart(aws),aws);
	for(const bad of [{...aws,runtimeAuth:undefined},{...aws,runtimeAuth:{...aws.runtimeAuth,expiration:'tomorrow'}},{...aws,runtimeAuth:{...aws.runtimeAuth,profile:'spoof'}},{...aws,runtimeAuth:{...aws.runtimeAuth,sessionToken:''}}]) assert.throws(()=>parseProbeWorkerStart(bad),ManagementInputError);
});
test('CM-S2-A1: result validator admits only fixed sanitized response shapes', () => {
	const result={requestId:randomUUID(),draftRevision:1,repoRoot:'/repo',daemonEpoch:'epoch',status:'reachable',tookMs:2.5};
	assert.deepEqual(parseDraftTestResult(result),result);
	for(const bad of [{...result,error:'private-canary'},{...result,safeMessage:'private-canary'},{...result,tookMs:NaN},{...result,status:'ok'},{...result,draftRevision:-1}]) assert.throws(()=>parseDraftTestResult(bad),ManagementInputError);
});
