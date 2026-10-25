import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {MessageChannel} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import {dynamoIdentityProvider,prepareDynamoAuth} from '../dynamo-identity.js';
import {DynamoDriver} from '../drivers/dynamodb.js';
import {parseProbeWorkerStart} from '../draft-probe.js';

test('CM-S2-E2: Dynamo activation and private auth IPC preserve environment token and profile identity without fallback',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'dynamo-identity-'));
 const names=['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE','AWS_SHARED_CREDENTIALS_FILE','AWS_CONFIG_FILE','AWS_EC2_METADATA_DISABLED','INSRC_MODE'];
 const previous=new Map(names.map(name=>[name,process.env[name]]));
 const signatures:{key:string;token:string|undefined}[]=[];
 const server=createServer((req,res)=>{signatures.push({key:/Credential=([^/]+)/.exec(String(req.headers.authorization))?.[1]??'',token:req.headers['x-amz-security-token'] as string|undefined});req.resume();res.setHeader('content-type','application/x-amz-json-1.0');res.end('{"TableNames":[]}');});
 try {
  await writeFile(join(directory,'credentials'),'[named]\naws_access_key_id = PROFILEKEY\naws_secret_access_key = profile-secret-canary\naws_session_token = profile-token-canary\n[chosen]\naws_access_key_id = DEFAULTPROFILEKEY\naws_secret_access_key = default-secret-canary\n');
  await writeFile(join(directory,'config'),'');
  Object.assign(process.env,{AWS_SHARED_CREDENTIALS_FILE:join(directory,'credentials'),AWS_CONFIG_FILE:join(directory,'config'),AWS_EC2_METADATA_DISABLED:'true',AWS_ACCESS_KEY_ID:'ENVKEY',AWS_SECRET_ACCESS_KEY:'environment-secret-canary',AWS_SESSION_TOKEN:'environment-token-canary'});delete process.env['AWS_PROFILE'];
  const config={id:'fixture',kind:'dynamodb',options:{region:'us-east-1'}};
  const auth=await prepareDynamoAuth(config);
  assert.equal(auth.accessKeyId,'ENVKEY');assert.equal(auth.sessionToken,'environment-token-canary');
  assert.equal((await dynamoIdentityProvider(config)()).accessKeyId,auth.accessKeyId);
  const profile=await prepareDynamoAuth({...config,options:{...config.options,profile:'named'}});assert.equal(profile.accessKeyId,'PROFILEKEY');assert.equal(profile.sessionToken,'profile-token-canary');
  delete process.env['AWS_ACCESS_KEY_ID'];delete process.env['AWS_SECRET_ACCESS_KEY'];delete process.env['AWS_SESSION_TOKEN'];process.env['AWS_PROFILE']='chosen';
  assert.equal((await prepareDynamoAuth(config)).accessKeyId,'DEFAULTPROFILEKEY');
  await assert.rejects(prepareDynamoAuth({...config,options:{profile:'absent'}}));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address && typeof address==='object');const endpoint='http://127.0.0.1:'+address.port;
  const activation=new DynamoDriver('activation','us-east-1','named',endpoint,{...config,options:{...config.options,profile:'named'}});
  try {await activation.listNamespaces({limit:1});} finally {await activation.close();}
  const channel=new MessageChannel();
  channel.port1.postMessage({type:'start',requestId:randomUUID(),nonce:'a'.repeat(64),lookupRoot:directory,config,runtimeAuth:profile});
  const [message]=await once(channel.port2,'message');const start=parseProbeWorkerStart(message);channel.port1.close();channel.port2.close();
  // Worker has no credential environment/profile fallback, even if a different profile is present in the parent fixture.
  process.env['INSRC_MODE']='probe-worker';
  assert.throws(()=>new DynamoDriver('missing','us-east-1',undefined,endpoint,config));
  const worker=new DynamoDriver('worker','us-east-1',undefined,endpoint,start.config,start.runtimeAuth);
  try {await worker.listNamespaces({limit:1});} finally {await worker.close();}
  assert.deepEqual(signatures,[{key:'PROFILEKEY',token:'profile-token-canary'},{key:'PROFILEKEY',token:'profile-token-canary'}]);
  assert.equal(JSON.stringify(config).includes('secret-canary'),false);
  let finish!:(v:{accessKeyId:string;secretAccessKey:string})=>void;const pending=new Promise<{accessKeyId:string;secretAccessKey:string}>(r=>{finish=r;});const controller=new AbortController();let continuations=0;
  const late=prepareDynamoAuth(config,controller.signal,()=>pending).then(()=>{continuations++;});controller.abort();finish({accessKeyId:'late',secretAccessKey:'late'});await assert.rejects(late);assert.equal(continuations,0);
  for(const provider of [async()=>({accessKeyId:'expired',secretAccessKey:'secret',expiration:new Date(0)}),async()=>({accessKeyId:'',secretAccessKey:'secret'}),async()=>{throw new Error('private-provider-canary');}]) await assert.rejects(prepareDynamoAuth(config,undefined,provider),e=>e instanceof Error && !e.message.includes('canary'));
 } finally {
  for(const [name,value]of previous) if(value===undefined)delete process.env[name];else process.env[name]=value;
  await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});
 }
});

test('CM-S2-A9: parent AWS identity reaches actual isolated workers for environment and profile sources without fallback',async()=>{
 const {DraftTestSupervisor,probeWorkerEnvironment}=await import('../draft-test.js');
 const {RequestLifetime}=await import('../../request-context.js');
 const root=await mkdtemp(join(tmpdir(),'cm-aws-worker-'));
 const names=['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE','AWS_SHARED_CREDENTIALS_FILE','AWS_CONFIG_FILE','AWS_EC2_METADATA_DISABLED'];
 const previous=new Map(names.map(name=>[name,process.env[name]]));const seen:string[]=[];
 const server=createServer((req,res)=>{seen.push((/Credential=([^/]+)/.exec(String(req.headers.authorization))?.[1]??'')+' '+String(req.headers['x-amz-security-token']));req.resume();res.end('{"TableNames":["PRIVATE_TABLE_CANARY"]}');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address==='object');
 try{
  await writeFile(join(root,'credentials'),'[chosen]\naws_access_key_id = CHOSENKEY\naws_secret_access_key = chosen-secret-canary\n[named]\naws_access_key_id = NAMEDKEY\naws_secret_access_key = named-secret-canary\naws_session_token = named-token-canary\n');await writeFile(join(root,'config'),'');
  Object.assign(process.env,{AWS_SHARED_CREDENTIALS_FILE:join(root,'credentials'),AWS_CONFIG_FILE:join(root,'config'),AWS_EC2_METADATA_DISABLED:'true'});
  for(const mode of ['environment','chosen','named']){
   delete process.env['AWS_ACCESS_KEY_ID'];delete process.env['AWS_SECRET_ACCESS_KEY'];delete process.env['AWS_SESSION_TOKEN'];delete process.env['AWS_PROFILE'];
   if(mode==='environment')Object.assign(process.env,{AWS_ACCESS_KEY_ID:'ENVKEY',AWS_SECRET_ACCESS_KEY:'environment-secret-canary',AWS_SESSION_TOKEN:'environment-token-canary'});else process.env['AWS_PROFILE']='chosen';
   const config={id:'fixture',kind:'dynamodb',options:{region:'us-east-1',endpoint:'http://127.0.0.1:'+address.port,...(mode==='named'?{profile:'named'}:{})}};
   const activation=new DynamoDriver('activation','us-east-1',mode==='named'?'named':undefined,config.options.endpoint,config);
   try{await activation.probeReachability();}finally{await activation.close();}
   const supervisor=new DraftTestSupervisor(),lifetime=new RequestLifetime();
   const result=await supervisor.run({requestId:randomUUID(),draftRevision:0,key:{repoRoot:root,scope:'temporary',id:'fixture'},publicPatch:{},credentials:{}},{connectionIdentity:mode,daemonEpoch:'epoch',signal:lifetime.signal,registerDrain:lifetime.registerDrain},async()=>({config,credentialActions:{}}));
   assert.equal(result.status,'reachable');assert.ok(!JSON.stringify(result).includes('CANARY'));lifetime.complete();await lifetime.drained;assert.equal(supervisor.activeCount,0);await supervisor.shutdown();
   assert.equal(seen.at(-1),seen.at(-2),'activation and private-worker signing identity agree');
   assert.equal(Object.keys(probeWorkerEnvironment()).some(key=>key.startsWith('AWS_')),false);
  }
  assert.match(seen[0]!,/ENVKEY.*environment-token-canary/);assert.match(seen[2]!,/CHOSENKEY/);assert.match(seen[4]!,/NAMEDKEY.*named-token-canary/);
 }finally{for(const[name,value]of previous)if(value===undefined)delete process.env[name];else process.env[name]=value;await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
});
