import { environment, committed } from './fixtures/saved-management-fixture.js';
import { _setKeystoreForTests } from '../secrets.js';
import { getFactory } from '../registry.js';
import { ConnectionSessionOwner } from '../session-owner.js';
import { createTemporaryOverlay } from '../session-entries.js';
import { contextualDriverFactory } from '../driver-log-policy.js';
import { temporaryRemovalState, retryTemporaryRemovalCleanup } from '../session-management.js';
import type { Driver } from '../../../shared/db-driver.js';
import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
import { mkdtemp, mkdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sessionServices } from './fixtures/session-services.js';

test('CM-S3-ISOLATION: two real workbenches/roots SQL+KV positive rows, replay and full route canary snapshots', { timeout: 180000 }, async () => {
	const directory = await realpath(await mkdtemp(join(tmpdir(), 'cm-sqlkv-')));
	let services: Awaited<ReturnType<typeof sessionServices>> | undefined;
	try {
		services = await sessionServices(directory);
		for (const mode of ['source', 'compiled']) {
			const run = join(directory, mode); await mkdir(run);
			const baseline = Object.fromEntries(['DEBUG', 'NODE_DEBUG', 'OLLAMA_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL', 'NODE_ORACLEDB_DEBUG_PACKETS', 'ORA_DEBUG_JDWP'].map(key => [key, '']));
			const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/session-service-child.ts', import.meta.url)), run, mode], { env: { ...process.env, ...baseline, INSRC_MODE: 'daemon', INSRC_LOG_LEVEL: 'trace', NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
			let output = ''; child.stdout!.on('data', b => { output += b; }); child.stderr!.on('data', b => { output += b; });
			const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
			let observedWhileAlive = false;
			const liveDrain = new Promise<void>((resolve, reject) => {
				child.once('message', message => {
					void (async () => {
						assert.deepEqual(message, { type: 'session-drained', mode });
						assert.equal(child.exitCode, null); assert.equal(child.signalCode, null); assert.equal(child.connected, true);
						await services!.assertDrained();
						assert.equal(child.exitCode, null); assert.equal(child.signalCode, null); assert.equal(child.connected, true);
						observedWhileAlive = true; child.send!({ type: 'drain-verified' }); resolve();
					})().catch(error => { child.kill('SIGKILL'); reject(error); });
				});
				child.once('close', () => { if (!observedWhileAlive) reject(new Error('backend exited before live native drain observation')); });
			});
			void liveDrain.catch(() => { });
			try {
				child.send!(services.endpoints);
				const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
				await liveDrain; assert.equal(observedWhileAlive, true); assert.equal(code, 0, output); assert.match(output, /service-isolation-ok/); assert.equal(output.includes('CM_ROUTE_PRIVATE_'), false, 'private data reached process output');
			} finally { clearTimeout(timer); child.kill('SIGKILL'); }
		}
		assert.equal(services.diagnostics().includes('CM_ROUTE_PRIVATE_'), false, 'private data reached service logs');
	} finally { await services?.close(); await rm(directory, { recursive: true, force: true }); }
});

test('CM-S4-SOURCE: real PostgreSQL and Redis survive both-scope removal failed close retry and same-ID recreation',{timeout:180000},async()=>{
 const env=await environment();let services:Awaited<ReturnType<typeof sessionServices>>|undefined;
 try{
  services=await sessionServices(env.directory);
  const endpoint=services.endpoints[0]!;
  const check=async(driver:Driver)=>{
   if(driver.family==='rdbms')assert.deepEqual((await driver.sample('data',{limit:1})).rows,[{marker:endpoint.marker}]);
   else if(driver.family==='kv')assert.ok(JSON.stringify(await driver.get('data:marker')).includes(endpoint.marker));
   else throw new Error('Expected service driver');
  };
  for(const scope of ['saved','temporary'] as const)for(const kind of ['postgres','redis'] as const){
   const f=await env.rootFixture(`${scope}-${kind}`),context={connectionIdentity:'fixture',daemonEpoch:'epoch'};
   const patch={kind,endpoint:kind==='postgres'?endpoint.sql:endpoint.kv};
   const credentials=kind==='postgres'?{'url.username':{action:'replace' as const,value:endpoint.username},'url.password':{action:'replace' as const,value:endpoint.password}}:{'url.password':{action:'replace' as const,value:endpoint.kvPassword}};
   let closes=0,builds=0,failed!:()=>void;const attempted=new Promise<void>(resolve=>{failed=resolve;});
   const factory=async(config:Parameters<NonNullable<ReturnType<typeof getFactory>>>[0],privateContext?:Parameters<NonNullable<ReturnType<typeof getFactory>>>[1])=>{
    const driver=await getFactory(kind)!(config,privateContext),generation=++builds;
    const close=driver.close.bind(driver);
    mock.method(driver,'close',async()=>{if(generation===1){closes++;if(closes===1){failed();throw new Error('CM_REMOVE_PRIVATE_CLOSE_CANARY');}}await close();});return driver;
   };
   const previous=_setKeystoreForTests(f.keystore);
   const owner=new ConnectionSessionOwner({daemonEpoch:'epoch',isRegistered:async root=>root===f.root,createOverlay:(root,handle,owned)=>createTemporaryOverlay(root,handle,owned,{factory:()=>contextualDriverFactory(factory)}),dropOverlay:overlay=>overlay.close()});
   try{
    if(scope==='saved'){
     f.hooks.factory=factory;
     const create={...await f.request('same'),publicPatch:patch,credentials},initial=committed(await f.service.mutate(f.context,create));
     await f.pool.withConnection('same',check);
     const key=create.key,ticket=await f.service.ticket(f.context,key,'remove'),request={key,ticket,operationId:ticket.operationId,mode:'remove' as const,expectedRevision:initial.revision};
     assert.equal(committed(await f.service.mutate(f.context,request)).registration,'removed');await attempted;
     assert.equal((await f.service.removalState(f.context,ticket)).state,'removed-cleanup-pending');
     let retried=await f.service.retryRemovalCleanup(f.context,ticket);if(retried.state==='removed-cleanup-pending')retried=await f.service.retryRemovalCleanup(f.context,ticket);assert.equal(retried.state,'removed');
     await services.assertDrained();await services.assertPreserved();
     const fresh=committed(await f.service.mutate(f.context,{...await f.request('same'),publicPatch:patch,credentials}));
     await f.pool.withConnection('same',check);await f.service.retryRemovalCleanup(f.context,ticket);assert.equal(closes,2);assert.equal(builds,2);
     const finalTicket=await f.service.ticket(f.context,key,'remove');committed(await f.service.mutate(f.context,{key,ticket:finalTicket,operationId:finalTicket.operationId,mode:'remove',expectedRevision:fresh.revision}));
     await f.service.retryRemovalCleanup(f.context,finalTicket);
    }else{
     await owner.open(context,f.root);const owned=await owner.management(context,f.root),overlay=owned.overlay,authority={...owned,assertRequest:()=>owned.binding.assertActive()};
     const key={repoRoot:f.root,scope:'temporary' as const,id:'same'},initial=overlay.commit(await overlay.prepare({key,mode:'create',publicPatch:patch,credentials}));
     const resolver=overlay.resolver(owned.binding.access,{assertActive:authority.assertRequest,signal:owned.binding.signal});await resolver.withConnection(owned.binding.access,'same',check);
     const ticket=owned.ledger.issue(key,'remove'),token=overlay.prepareRemoval({id:'same',expectedRevision:initial.revision});
     await owned.ledger.mutate({key,ticket,operationId:ticket.operationId,mode:'remove',expectedRevision:initial.revision},async(_request,commit)=>commit(()=>overlay.commitRemoval(token)),authority.assertRequest);await attempted;
     assert.equal(temporaryRemovalState(authority,ticket).state,'removed-cleanup-pending');
     // A concurrent retry may join the first failed attempt; the next one starts physical retry.
     let retried=await retryTemporaryRemovalCleanup(authority,ticket);if(retried.state==='removed-cleanup-pending')retried=await retryTemporaryRemovalCleanup(authority,ticket);assert.equal(retried.state,'removed');
     await services.assertDrained();await services.assertPreserved();
     const fresh=overlay.commit(await overlay.prepare({key,mode:'create',publicPatch:patch,credentials}));await resolver.withConnection(owned.binding.access,'same',check);
     await retryTemporaryRemovalCleanup(authority,ticket);assert.equal(closes,2);assert.equal(builds,2);
     const last=overlay.commitRemoval(overlay.prepareRemoval({id:'same',expectedRevision:fresh.revision}));await overlay.retryRemovalCleanup(last.revision);
    }
    await services.assertDrained();await services.assertPreserved();assert.equal(closes,2);
   }finally{await owner.close();_setKeystoreForTests(previous);}
  }
  assert.equal(services.diagnostics().includes('CM_REMOVE_PRIVATE_CLOSE_CANARY'),false);
 }finally{await services?.close();await env.cleanup();}
});
