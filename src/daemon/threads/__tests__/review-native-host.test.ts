import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';
import { ReviewNativeHost } from '../review-native-host.js';
import { ReviewProcessLeases } from '../review-processes.js';

test('orderly native host disposal ignores late port closure and cannot close a replacement owner',async()=>{
 const leases=new ReviewProcessLeases({authorize:()=>{},verifyIntent:async()=>{}}),key={project:'/tmp',family:'code' as const,reviewId:'late-close'};
 const owner=leases.register(key,'old'),{port1,port2}=new MessageChannel();let lost=0;
 const host=new ReviewNativeHost({leases,owner,port:port1,persist:async()=>{throw Error('No native operations expected');},resolveBinary:async c=>c,assertActive:()=>{},onLost:()=>{lost++;}});
 const first=host.close();assert.equal(host.close(),first);await first;
 await host.flushClosures();host.dispose();host.dispose();
 const replacement=leases.register(key,'replacement');
 await new Promise(resolve=>setTimeout(resolve,10));
 await host.close();await host.flushClosures();port2.close();
 assert.equal(lost,0);assert.equal(leases.isFenced(key),false,'late old callbacks cannot fence the replacement');
 await leases.close(replacement);leases.release(replacement);
});

test('unexpected native port loss shares explicit close work and notifies its owner once',async()=>{
 const leases=new ReviewProcessLeases({authorize:()=>{},verifyIntent:async()=>{}}),key={project:'/tmp',family:'design' as const,reviewId:'lost-port'};
 const owner=leases.register(key,'owner'),{port1,port2}=new MessageChannel();let lost=0,notify!:()=>void;
 const closed=new Promise<void>(resolve=>{notify=resolve;});
 const host=new ReviewNativeHost({leases,owner,port:port1,persist:async()=>{throw Error('No native operations expected');},resolveBinary:async c=>c,assertActive:()=>{},onLost:()=>{lost++;notify();}});
 port2.close();await closed;await host.close();await host.flushClosures();host.dispose();
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(lost,1);
});
