import test from 'node:test';
import assert from 'node:assert/strict';
import {RequestLifetime} from '../request-context.js';
test('CM-S2-F2: completion seals once while aborted admitted work retains drain until cleanup',async()=>{
 const lifetime=new RequestLifetime();let release!:()=>void;
 lifetime.registerDrain(new Promise<void>(resolve=>{release=resolve;}));
 let drained=false,completed=0;lifetime.drained.then(()=>{drained=true;});lifetime.completed.then(()=>{completed++;});
 lifetime.abort();lifetime.complete();lifetime.complete();lifetime.seal();
 await lifetime.completed;assert.equal(completed,1);assert.equal(lifetime.signal.aborted,true);assert.equal(drained,false);
 assert.throws(()=>lifetime.registerDrain(Promise.resolve()),/sealed/);
 release();await lifetime.drained;assert.equal(drained,true);
 const empty=new RequestLifetime();empty.complete();await empty.drained;
 const rejected=new RequestLifetime();rejected.registerDrain(Promise.reject(new Error('cleanup failed')));rejected.complete();await rejected.drained;
});

test('CM-S2-F2: direct unary dispatch preserves internal completion after disconnect and delivery failure',async()=>{
 const {directDispatch}=await import('../server.js');
 const lifetime=new RequestLifetime();let release!:()=>void,cleanup!:()=>void;let calls=0;
 const response=new Promise<void>(r=>{release=r;}),drain=new Promise<void>(r=>{cleanup=r;});
 const forward=directDispatch({test:async(_params,context)=>{context!.registerDrain!(drain);await response;assert.equal(context!.signal!.aborted,true);return 'done';}});
 const cancel=forward({kind:'request',requestId:'r',method:'test',params:{},stream:false,lifetime,trustedContext:{connectionIdentity:'socket',daemonEpoch:'epoch'}},()=>{calls++;throw new Error('socket closed');});
 cancel();release();await lifetime.completed;assert.equal(calls,1);
 let drained=false;void lifetime.drained.then(()=>{drained=true;});await Promise.resolve();assert.equal(drained,false);cleanup();await lifetime.drained;
 const unknown=new RequestLifetime();
 assert.throws(()=>forward({kind:'request',requestId:'u',method:'unknown',params:{},stream:false,lifetime:unknown},()=>{throw new Error('closed');}),/closed/);
 await unknown.completed;await unknown.drained;
});

test('CM-S2-F2: a timeout reply completes while registered cleanup remains pending after abort',async()=>{
 const {directDispatch}=await import('../server.js');const lifetime=new RequestLifetime();let release!:()=>void;
 const cleanup=new Promise<void>(r=>{release=r;});let reply:unknown;
 directDispatch({test:async(_p,context)=>{context!.registerDrain!(cleanup);return new Promise(r=>setTimeout(()=>r({status:'timeout'}),5));}})({kind:'request',requestId:'timeout',method:'test',params:{},stream:false,lifetime,trustedContext:{connectionIdentity:'socket',daemonEpoch:'epoch'}},envelope=>{reply=envelope;});
 await lifetime.completed;assert.deepEqual(reply,{kind:'reply',requestId:'timeout',result:{status:'timeout'}});
 lifetime.abort();let drained=false;void lifetime.drained.then(()=>{drained=true;});await Promise.resolve();assert.equal(drained,false);release();await lifetime.drained;
});
