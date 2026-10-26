import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {getFactory} from '../registry.js';
import '../drivers/cassandra.js';import '../drivers/nats.js';import '../drivers/mongodb.js';import '../drivers/etcd.js';import '../drivers/memcached.js';
test('CM-S2-A8: admitted KV drivers propagate SDK disposal failures instead of reporting successful cleanup',async()=>{
 const configurations=[{id:'c',kind:'cassandra',options:{contactPoints:['127.0.0.1:1']}},{id:'n',kind:'nats',options:{servers:['nats://127.0.0.1:1'],bucket:'fixture'}},{id:'m',kind:'mongodb',url:'mongodb://127.0.0.1:1/fixture'},{id:'e',kind:'etcd',options:{hosts:['http://127.0.0.1:1']}},{id:'k',kind:'memcached',options:{servers:['127.0.0.1:1']}}];
 for(const config of configurations){
  const driver=await getFactory(config.kind)!(config),failure=new Error('PRIVATE_DISPOSAL_CANARY');
  if(config.kind==='nats'){
   Reflect.set(driver,'ncPromise',Promise.resolve({close:async()=>{throw failure;}}));
   try{await assert.rejects(driver.close(),error=>error===failure);}finally{Reflect.set(driver,'ncPromise',null);await driver.close();}
  }else{
   const client=Reflect.get(driver,'client') as object,method=config.kind==='cassandra'?'shutdown':'close';
   const spy=mock.method(client,method as never,(()=>{throw failure;}) as never);
   try{await assert.rejects(driver.close(),error=>error===failure);}finally{spy.mock.restore();await driver.close();}
  }
 }
});
