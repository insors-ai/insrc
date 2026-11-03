import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import test from 'node:test';
import { IPC_LANE_LIMITS, IpcLaneError, openIpcLane, rpc } from '../ipc-client.js';

class FakeSocket extends EventEmitter {
 frames:string[]=[];destroyed=false;blocked=false;
 write(frame:string):boolean{this.frames.push(frame);return !this.blocked;}
 destroy():this{if(!this.destroyed){this.destroyed=true;this.emit('close');}return this;}
 reply(id:number,result:unknown):void{this.emit('data',Buffer.from(JSON.stringify({id,result})+'\n'));}
}
const laneFor=(s:FakeSocket,firstRequestId?:number)=>openIpcLane({connect:()=>s as unknown as Socket,...(firstRequestId!==undefined?{firstRequestId}:{})});
const error=(code:string,written:boolean)=>(e:unknown)=>e instanceof IpcLaneError&&e.code===code&&e.written===written&&e.message==='The daemon connection request could not be completed.';

async function fixture(handler:(socket:Socket)=>void){
 const sockets=new Set<Socket>();const server=createServer(s=>{sockets.add(s);s.on('error',()=>{});s.on('close',()=>sockets.delete(s));handler(s);});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address==='object');
 const connect=()=>createConnection({port:address.port,host:'127.0.0.1'});
 return {connect,async close(){for(const s of sockets)s.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}

test('CM-S5-TRANSPORT-TS: actual persistent socket framing, multiplexing, write-outcome, overflow, timeout/cancel/close and one-shot compatibility',async()=>{
 const requests:{id:number;method:string}[]=[];
 const f=await fixture(socket=>{let buffer='';socket.on('data',chunk=>{buffer+=chunk.toString();for(;;){const end=buffer.indexOf('\n');if(end<0)break;requests.push(JSON.parse(buffer.slice(0,end)));buffer=buffer.slice(end+1);
  if(requests.length===2){const a=Buffer.from(JSON.stringify({id:requests[1]!.id,result:{text:'🧪 café'}})+'\n');const utf=a.indexOf(Buffer.from('🧪'));socket.write(a.subarray(0,utf+2));socket.write(Buffer.concat([a.subarray(utf+2),Buffer.from(JSON.stringify({id:requests[0]!.id,result:1})+'\n')]));}
 }});});
 const lane=openIpcLane({connect:f.connect});
 try{const first=lane.rpc<number>('daemon.first'),second=lane.rpc<{text:string}>('daemon.second');assert.deepEqual(await second,{text:'🧪 café'});assert.equal(await first,1);assert.equal(lane.isClosed,false);assert.equal(requests.length,2);}
 finally{lane.dispose();await f.close();}
 const legacy=await fixture(s=>s.on('data',chunk=>{const req=JSON.parse(chunk.toString());s.end(JSON.stringify({id:req.id,result:{ok:true}})+'\n');}));
 try{assert.deepEqual(await rpc('daemon.status',{},legacy.connect),{ok:true});}finally{await legacy.close();}
});

test('CM-S5-TRANSPORT-TS: real late canceled reply cannot resolve another request or close a healthy lane',async()=>{
 let announce!:(id:number)=>void;const written=new Promise<number>(resolve=>{announce=resolve;});let serverSocket!:Socket;
 const f=await fixture(socket=>{serverSocket=socket;let buffer='';socket.on('data',chunk=>{buffer+=chunk.toString();for(;;){const end=buffer.indexOf('\n');if(end<0)break;const request=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(request.method==='db.connections.v2.mutate')announce(request.id);else socket.write(JSON.stringify({id:request.id,result:'current'})+'\n');}});});
 const lane=openIpcLane({connect:f.connect}),controller=new AbortController();
 try{const pending=lane.rpc('db.connections.v2.mutate',{}, {signal:controller.signal});const rejected=assert.rejects(pending,error('canceled',true));const old=await written;controller.abort();await rejected;
  serverSocket.write(JSON.stringify({id:old,result:'late'})+'\n');assert.equal(await lane.rpc('daemon.status'),'current');assert.equal(lane.isClosed,false);
 }finally{lane.dispose();await f.close();}
});

test('CM-S5-TRANSPORT-TS: queued cancellation backpressure capacity and timeout preserve exact write truth',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const s=new FakeSocket(),lane=laneFor(s),controller=new AbortController();
 const before=lane.rpc('daemon.status',{}, {signal:controller.signal});const canceled=assert.rejects(before,error('canceled',false));controller.abort();await canceled;assert.equal(s.frames.length,0);
 s.blocked=true;s.emit('connect');const a=lane.rpc('daemon.a'),b=lane.rpc('daemon.b');const timedA=assert.rejects(a,error('timeout',true)),timedB=assert.rejects(b,error('timeout',false));assert.equal(s.frames.length,1);
 t.mock.timers.tick(IPC_LANE_LIMITS.timeoutMs);await Promise.all([timedA,timedB]);s.blocked=false;s.emit('drain');assert.equal(s.frames.length,1,'timed-out queued request never sent');
 s.reply(2,'late'); // id1 was canceled before connect; id2 was actually written then timed out.
 assert.equal(lane.isClosed,false);
 const active=Array.from({length:IPC_LANE_LIMITS.pending},()=>lane.rpc('daemon.capacity'));
 const settled=active.map(p=>assert.rejects(p,error('closed',true)));
 await assert.rejects(lane.rpc('daemon.overflow'),error('capacity',false));lane.dispose();lane.dispose();await Promise.all(settled);
 assert.equal(lane.isClosed,true);assert.equal(s.listenerCount('data'),0);assert.equal(s.listenerCount('drain'),0);
});

test('CM-S5-TRANSPORT-TS: malformed duplicate unsolicited UTF8 and oversized frames reject safely',async()=>{
 const frames=[Buffer.from('{"id":1,"result":1,"result":2}\n'),Buffer.from('{"id":1,"result":{"x":1,"x":2}}\n'),Buffer.from('{"id":99,"result":1}\n'),Buffer.from('{"id":1,"result":1,"error":"PRIVATE_SDK_MESSAGE"}\n'),Buffer.from([0xff,10]),Buffer.alloc(IPC_LANE_LIMITS.frameBytes+1,32)];
 for(const frame of frames){const s=new FakeSocket(),lane=laneFor(s);let closes=0;lane.onClose(()=>{closes++;throw new Error('subscriber');});const pending=lane.rpc('daemon.status');const rejected=assert.rejects(pending,error('invalid-response',true));s.emit('connect');s.emit('data',frame);await rejected;assert.equal(closes,1);assert.equal(lane.isClosed,true);lane.dispose();}
 const s=new FakeSocket(),lane=laneFor(s);const p=lane.rpc('daemon.status');s.emit('connect');s.reply(1,1);assert.equal(await p,1);s.reply(1,2);assert.equal(lane.isClosed,true,'duplicate completed reply closes lane rather than aliasing a new request');
});

test('CM-S5-TRANSPORT-TS: disconnects remote errors serialization and ID exhaustion never leak or evict unknown requests',async()=>{
 for(const sent of [false,true]){const s=new FakeSocket(),lane=laneFor(s);const p=lane.rpc('daemon.status');const rejected=assert.rejects(p,error('disconnected',sent));if(sent)s.emit('connect');s.emit('error',new Error('PRIVATE_SDK_MESSAGE'));await rejected;}
 class PartialWrite extends FakeSocket{override write(frame:string):boolean{this.frames.push(frame);throw new Error('PRIVATE_PARTIAL_WRITE');}}
 const partial=new PartialWrite(),partialLane=laneFor(partial);const partialResult=partialLane.rpc('db.connections.v2.mutate');const uncertain=assert.rejects(partialResult,error('disconnected',true));partial.emit('connect');await uncertain;
 const s=new FakeSocket(),lane=laneFor(s);let getter=0;const params={};Object.defineProperty(params,'private',{enumerable:true,get(){getter++;return 'secret';}});
 await assert.rejects(lane.rpc('daemon.status',params),error('invalid-request',false));assert.equal(getter,0);assert.equal(s.frames.length,0);
 const cyclic:Record<string,unknown>={};cyclic['self']=cyclic;await assert.rejects(lane.rpc('daemon.status',cyclic),error('invalid-request',false));
 await assert.rejects(lane.rpc('daemon.status',{text:'x'.repeat(IPC_LANE_LIMITS.frameBytes)}),error('invalid-request',false));
 const p=lane.rpc('daemon.status');const rejected=assert.rejects(p,error('remote-error',true));s.emit('connect');s.emit('data',Buffer.from('{"id":1,"error":"PRIVATE_SDK_MESSAGE"}\n'));await rejected;lane.dispose();
 const end=new FakeSocket(),last=laneFor(end,Number.MAX_SAFE_INTEGER);const final=last.rpc('daemon.status');end.emit('connect');end.reply(Number.MAX_SAFE_INTEGER,'last');assert.equal(await final,'last');await assert.rejects(last.rpc('daemon.status'),error('closed',false));assert.equal(last.isClosed,true);assert.equal(end.frames.length,1);
});

test('CM-S5-TRANSPORT-TS: aggregate byte pressure refuses before write and teardown retains no owned listeners',async()=>{
 const s=new FakeSocket(),lane=laneFor(s);s.emit('connect');
 const first=lane.rpc('daemon.large',{data:'x'.repeat(9*1024*1024)});const closed=assert.rejects(first,error('closed',true));
 await assert.rejects(lane.rpc('daemon.overflow',{data:'x'.repeat(9*1024*1024)}),error('capacity',false));assert.equal(s.frames.length,1);
 lane.dispose();await closed;assert.deepEqual(s.eventNames(),[]);
 const huge=new FakeSocket(),bounded=laneFor(huge);const p=bounded.rpc('daemon.status');const rejected=assert.rejects(p,error('invalid-response',true));huge.emit('connect');
 huge.emit('data',Buffer.from('{"id":1,"result":['+Array.from({length:IPC_LANE_LIMITS.nodes+1},()=>0).join(',')+']}\n'));await rejected;assert.equal(bounded.isClosed,true);
});
