/** Disposable connection probe. Bootstrap is deliberately before all dynamic imports. */
process.env['INSRC_MODE']='probe-worker';
import type {DraftProbe,ProbeWorkerStart,ProbeWorkerCode} from '../daemon/db/draft-probe.js';
let started=false,cancelled=false,driver:DraftProbe|undefined,closing:Promise<void>|undefined;
const close=():Promise<void>=>closing??=driver?driver.close():Promise.resolve();
process.on('uncaughtException',()=>process.exit(1));
process.on('unhandledRejection',()=>process.exit(1));
process.on('disconnect',()=>{cancelled=true;void close().finally(()=>process.exit(1));});
process.on('message',(input:unknown)=>{void receive(input);});
async function receive(input:unknown):Promise<void>{
 if(started){
  try {const {parseProbeWorkerCancel}=await import('../daemon/db/draft-probe.js');const cancel=parseProbeWorkerCancel(input);
   if(cancel.requestId!==start?.requestId||cancel.nonce!==start.nonce)throw new Error();
   cancelled=true;if(driver)await close();
  }catch{cancelled=true;}
  return;
 }
 started=true;
 let code:ProbeWorkerCode='failed';
 try {
  const {parseProbeWorkerStart}=await import('../daemon/db/draft-probe.js');start=parseProbeWorkerStart(input);
  const {probeModule}=await import('../daemon/db/probe-kinds.js');const module=probeModule(start.config.kind);if(!module)throw new Error();
  const {fileExecutionPolicy}=await import('../daemon/db/file-policy.js');
  const {getFactory,familyOf}=await import('../daemon/db/registry.js');
  await import('../daemon/db/drivers/'+module+'.js');
  if(cancelled)throw new Error();
  if(start.config.kind==='dynamodb'){
   const {DynamoDriver}=await import('../daemon/db/drivers/dynamodb.js');
   const opts=start.config.options??{};
   driver=new DynamoDriver(start.config.id,String(opts['region']),undefined,typeof opts['endpoint']==='string'?opts['endpoint']:undefined,start.config,start.runtimeAuth);
  }else{
   const factory=getFactory(start.config.kind);if(!factory)throw new Error();
   const candidate=await factory(start.config,familyOf(start.config.kind)==='file'?{fileExecutionPolicy:fileExecutionPolicy(start.config,{lookupRoot:start.lookupRoot,ownerId:'probe',revision:start.nonce,persistence:'memory-only'})}:undefined);
   driver=candidate as typeof candidate&DraftProbe;
  }
  if(cancelled||typeof driver.probeReachability!=='function')throw new Error();
  await driver.probeReachability();
  if(cancelled)throw new Error();
  code='reachable';
 }catch(error){
  const message=error instanceof Error?error.message:'';
  code=message==='resource-limit'?'resource-limit':message==='unsupported-temporary'?'unsupported-temporary':'failed';
 }finally{
  try {await close();}catch{code='failed';}
 }
 if(cancelled)code='failed';
 if(!start||!process.send)process.exit(1);
 process.send({type:'result',requestId:start.requestId,nonce:start.nonce,code},()=>{process.disconnect();process.exit(0);});
}
let start:ProbeWorkerStart|undefined;
