import test from 'node:test';
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises, { mkdtemp, mkdir, writeFile, readFile, rm, realpath, chmod } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PATHS } from '../../../shared/paths.js';
import { connectionsPath } from '../config.js';
import { ManagedRegistry, PreparationJournal } from '../managed-store.js';
import { SavedTicketAuthority } from '../management-tickets.js';
import { CredentialGenerations, _setKeystoreForTests } from '../secrets.js';
import { DriverPool } from '../pool.js';
import { SavedConnectionManagement, installSavedManagement } from '../management.js';
import { connectionManagementRpc } from '../../connection-management-rpc.js';
import { saveConnectionRpc } from '../../db-rpc.js';
import type { Driver, ConnectionConfig } from '../../../shared/db-driver.js';
import { setTimeout as delay } from 'node:timers/promises';
import type { MutationRequest, MutationOutcome } from '../../../shared/connection-management.js';
import '../drivers/index.js';
import { environment, committed, deferred } from './fixtures/saved-management-fixture.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

async function removalRequest(f:Awaited<ReturnType<Awaited<ReturnType<typeof environment>>['rootFixture']>>,id:string,revision:string):Promise<MutationRequest>{
	const key={repoRoot:f.root,scope:'saved' as const,id};const ticket=await f.service.ticket(f.context,key,'remove');
	return {ticket,operationId:ticket.operationId,key,mode:'remove',expectedRevision:revision};
}
test('CM-S4-SAVED: removal atomically drops selected row and revision while preserving source and unrelated document',async()=>{
	const env=await environment(),f=await env.rootFixture('remove',{id:'preserved',kind:'postgres',family:'kv',url:'postgres://host/kept',label:'Pinned'});
	try {
		const source=join(f.root,'source.csv'),bytes='id,value\n1,source-data-canary\n';await writeFile(source,bytes);
		const create={...await f.request('selected'),publicPatch:{kind:'csv',path:'source.csv'},credentials:{}};
		const initial=committed(await f.service.mutate(f.context,create));
		const before=f.store.snapshot.file,selected=before.connections.find(c=>c.id==='selected')!;
		const request=await removalRequest(f,'selected',initial.revision);f.reset();
		const result=committed(await f.service.mutate(f.context,request));const after=f.store.snapshot.file;
		assert.equal(result.registration,'removed');assert.equal(result.activation,'not-applicable');assert.equal(result.credentialCleanup,'complete');assert.notEqual(result.revision,initial.revision);
		assert.deepEqual(after.connections,before.connections.filter(c=>c.id!=='selected'));assert.equal(after.connections[0]!.family,'kv');
		assert.deepEqual((after as Record<string,unknown>)['retainedDocument'],(before as Record<string,unknown>)['retainedDocument']);
		assert.equal(Object.hasOwn(after._management!.revisions,'selected'),false);assert.equal(after._management!.revisions['preserved'],before._management!.revisions['preserved']);
		assert.deepEqual(after._management!.receipts[create.operationId],before._management!.receipts[create.operationId]);
		const receipt=after._management!.receipts[request.operationId]!;
		assert.deepEqual(Object.keys(receipt).sort(),['cleanupRefs','outcome','requestMac','ticket']);assert.equal(receipt.outcome.revision,result.revision);
		assert.deepEqual(Object.keys(receipt.outcome).sort(),['activation','credentialCleanup','operationId','registration','revision']);
		assert.equal(f.counts.writes,1);assert.equal(f.counts.credentialGets,0);assert.equal(f.counts.sets,0);assert.equal(f.counts.deletes,0);
		assert.equal(await readFile(source,'utf8'),bytes);assert.equal(selected.kind,'csv');
		assert.equal(f.service.legacyProjection('selected'),undefined);await assert.rejects(f.pool.acquire('selected'),{code:'not-found'});
	}finally{await env.cleanup();}
});
test('CM-S4-REPLAY: concurrent identical removal and recreated-ID replay preserve exact original operation',async()=>{
	const env=await environment(),f=await env.rootFixture('replay');
	try{
		const initial=committed(await f.service.mutate(f.context,await f.request('selected')));
		const request=await removalRequest(f,'selected',initial.revision);f.reset();
		const [a,b]=await Promise.all([f.service.mutate(f.context,request),f.service.mutate(f.context,structuredClone(request))]);
		const removed=committed(a);assert.deepEqual(b,a);assert.equal(f.counts.writes,1);
		const fresh=committed(await f.service.mutate(f.context,await f.request('selected')));assert.notEqual(fresh.revision,initial.revision);
		const before=await readFile(f.path,'utf8');f.reset();
		assert.deepEqual(committed(await f.service.mutate(f.context,request)),removed);
		const mismatch=await f.service.mutate(f.context,{...request,expectedRevision:fresh.revision});assert.equal(mismatch.status,'rejected');if(mismatch.status==='rejected')assert.equal(mismatch.code,'operation-mismatch');
		assert.equal(f.store.snapshot.file._management!.revisions['selected'],fresh.revision);assert.equal(await readFile(f.path,'utf8'),before);
		assert.equal(f.counts.writes,0);assert.equal(f.counts.deletes,0);assert.equal(f.counts.sets,0);
	}finally{await env.cleanup();}
});
test('CM-S4-SAVED: busy stale and missing removals preserve registration credentials and receipts',async()=>{
	const env=await environment(),f=await env.rootFixture('refusal');
	try{
		const initial=committed(await f.service.mutate(f.context,await f.request('selected')));
		const busy=await removalRequest(f,'selected',initial.revision),stale=await removalRequest(f,'selected','stale'),missing=await removalRequest(f,'missing',initial.revision);
		const lease=await f.pool.lease('selected');
		try{
			for(const [request,code] of [[busy,'busy'],[stale,'conflict'],[missing,'not-found']] as const){
				const bytes=await readFile(f.path,'utf8'),vault=[...f.values];f.reset();const result=await f.service.mutate(f.context,request);
				assert.equal(result.status,'rejected');if(result.status==='rejected')assert.equal(result.code,code);
				assert.equal(await readFile(f.path,'utf8'),bytes);assert.deepEqual([...f.values],vault);
				assert.equal(f.counts.writes,0);assert.equal(f.counts.credentialGets,0);assert.equal(f.counts.sets,0);assert.equal(f.counts.deletes,0);
				assert.equal(f.pool.leaseState('selected').barrier,'none');
			}
		}finally{await lease.release();}
	}finally{await env.cleanup();}
});
test('CM-S4-REPLAY: ambiguous rename and fsync failures retain the barrier until same-ticket classification',async()=>{
	for(const boundary of ['before-rename','after-rename','parent-sync']){
		const env=await environment(),f=await env.rootFixture(boundary);let request:MutationRequest|undefined;let closes=0;
		try{
			const initial=committed(await f.service.mutate(f.context,{...await f.request('selected'),credentials:{}}));
			f.hooks.factory=async config=>({id:config.id,kind:config.kind,family:'rdbms',close:async()=>{closes++;}} as Driver);
			await f.pool.withConnection('selected',async()=>{});request=await removalRequest(f,'selected',initial.revision);
			const before=await readFile(f.path,'utf8');
			f.hooks.writer=async stage=>{if(stage===boundary)throw new Error('private-write-canary');};
			const unknown=await f.service.mutate(f.context,request);assert.equal(unknown.status,'rejected');if(unknown.status==='rejected')assert.equal(unknown.code,'reconciliation-required');
			assert.equal(f.pool.leaseState('selected').barrier,'remove');assert.equal(closes,0);await assert.rejects(f.pool.acquire('selected'),{code:'busy'});
			const changed=await f.service.mutate(f.context,{...request,expectedRevision:randomUUID()});assert.equal(changed.status,'rejected');if(changed.status==='rejected')assert.equal(changed.code,'operation-mismatch');
			assert.equal(f.pool.leaseState('selected').barrier,'remove');f.hooks.writer=undefined;
			const status=await f.service.status(f.context,request.ticket);
			assert.equal(f.pool.leaseState('selected').barrier,'none');
			if(boundary==='before-rename'){
				assert.equal(status.status,'not-seen');assert.equal(await readFile(f.path,'utf8'),before);assert.equal(closes,0);
				await f.pool.withConnection('selected',async()=>{});committed(await f.service.mutate(f.context,request));
			}else{assert.equal(status.status,'committed');if(status.status==='committed')assert.equal(status.value.registration,'removed');}
			await f.pool.retryRemovalCleanup(request.operationId,initial.revision);assert.equal(closes,1);
			await assert.rejects(f.pool.acquire('selected'),{code:'not-found'});
		}finally{f.hooks.writer=undefined;if(request)await f.service.status(f.context,request.ticket);await env.cleanup();}
	}
});
test('CM-S4-REPLAY: expired and pruned removal receipts cannot delete a recreated generation',async()=>{
	const env=await environment(),f=await env.rootFixture('expired');
	try{
		const initial=committed(await f.service.mutate(f.context,{...await f.request('selected'),credentials:{}}));
		const request=await removalRequest(f,'selected',initial.revision);const removed=committed(await f.service.mutate(f.context,request));
		await f.restart();assert.deepEqual(committed(await f.service.mutate(f.context,request)),removed);
		const recreated=committed(await f.service.mutate(f.context,{...await f.request('selected'),credentials:{}}));
		f.clock.value=Date.parse(request.ticket.expiresAt)+1;
		const expired=await f.service.status(f.context,request.ticket);assert.equal(expired.status,'committed');
		await f.service.pruneReceipts(f.context);assert.equal(f.store.snapshot.file._management!.receipts[request.operationId],undefined);
		const before=await readFile(f.path,'utf8'),result=await f.service.mutate(f.context,request);
		assert.equal(result.status,'rejected');if(result.status==='rejected')assert.equal(result.code,'reconciliation-required');
		assert.equal((await f.service.status(f.context,request.ticket)).status,'reconciliation-required');
		assert.equal(f.store.snapshot.file._management!.revisions['selected'],recreated.revision);assert.equal(await readFile(f.path,'utf8'),before);
	}finally{await env.cleanup();}
});
test('CM-S4-REPLAY: real process crash before or after rename recovers removal truth on restart',async()=>{
	const exec=promisify(execFile),child=fileURLToPath(new URL('./fixtures/saved-removal-restart.ts',import.meta.url));
	for(const stage of ['before-rename','after-rename']){
		const directory=await mkdtemp(join(tmpdir(),'cm-remove-restart-'));await mkdir(join(directory,'repo'));
		try{
			await assert.rejects(exec(process.execPath,['--import','tsx',child,directory,stage],{timeout:20000,maxBuffer:1024*1024}),error=>!!error&&typeof error==='object'&&'code' in error&&error.code===73);
			const result=await exec(process.execPath,['--import','tsx',child,directory,'status'],{timeout:20000,maxBuffer:1024*1024});
			const line=result.stdout.split('\n').find(line=>line.startsWith('removal-restart-result:'));assert.ok(line,result.stdout+result.stderr);
			const status=JSON.parse(line.slice('removal-restart-result:'.length));
			assert.equal(status.status,stage==='before-rename'?'not-seen':'committed');assert.equal(status.journal,0);
			assert.deepEqual(status.connections,stage==='before-rename'?['selected']:[]);
			if(stage==='after-rename')assert.equal(status.registration,'removed');
		}finally{await rm(directory,{recursive:true,force:true});}
	}
});
test('CM-S1-B: actual mutation path rejects duplicate stale missing and busy intent before credential or writer ports', async () => {
	const env = await environment();
	const f = await env.rootFixture('root');
	try {
		const created = committed(await f.service.mutate(f.context, await f.request('fixture')));
		for (const [id, mode, revision, code] of [['fixture', 'create', undefined, 'duplicate-id'], ['missing', 'update', created.revision, 'not-found'], ['fixture', 'update', 'stale', 'conflict']] as const) {
			const request = await f.request(id, mode, revision);
			const before = [...f.values];
			f.reset();
			const result = await f.service.mutate(f.context, request);
			assert.equal(result.status, 'rejected');
			if (result.status === 'rejected')
				assert.equal(result.code, code);
			assert.deepEqual(f.counts, { gets: 0, credentialGets: 0, sets: 0, deletes: 0, stages: 0, writes: 0 });
			assert.deepEqual([...f.values], before);
		}
		const request = await f.request('fixture', 'update', created.revision);
		const lease = await f.pool.lease('fixture');
		f.reset();
		const result = await f.service.mutate(f.context, request);
		assert.deepEqual(f.counts, { gets: 0, credentialGets: 0, sets: 0, deletes: 0, stages: 0, writes: 0 });
		assert.equal(result.status, 'rejected');
		if (result.status === 'rejected')
			assert.equal(result.code, 'busy');
		await lease.release();
	}
	finally {
		await env.cleanup();
	}
});
test('CM-S1-D: same-root concurrent creates commit once and independent roots do not share serialization', async () => {
	const env = await environment();
	const a = await env.rootFixture('a');
	const b = await env.rootFixture('b');
	try {
		const requests = [await a.request('fixture'), await a.request('fixture')];
		a.reset();
		const results = await Promise.all(requests.map(r => a.service.mutate(a.context, r)));
		assert.equal(results.filter(r => r.status === 'committed').length, 1);
		assert.equal(results.filter(r => r.status === 'rejected' && r.code === 'duplicate-id').length, 1);
		assert.equal(Object.keys(JSON.parse(await readFile(a.path, 'utf8'))._management.receipts).length, 1);
		assert.equal(a.counts.stages, 2);
		assert.equal((await a.service.list(a.context)).length, 1);
		const barrier = a.pool.beginMutation('blocked', 'create');
		const ar = await a.request('blocked');
		const br = await b.request('fixture');
		const other = await b.service.mutate(b.context, br);
		committed(other);
		const blocked = await a.service.mutate(a.context, ar);
		assert.equal(blocked.status, 'rejected');
		barrier();
		assert.equal((await b.service.list(b.context))[0]!.key.repoRoot, b.root);
		const started = deferred();
		const resume = deferred();
		a.hooks.stage = async () => {
			started.resolve();
			await resume.promise;
		};
		const pausedRequest = await a.request('paused');
		const independentRequest = await b.request('independent');
		const paused = a.service.mutate(a.context, pausedRequest);
		try {
			await started.promise;
			const independent = await Promise.race([b.service.mutate(b.context, independentRequest), delay(1000, undefined)]);
			assert.ok(independent, 'other root must commit while the first root is paused');
			committed(independent);
		}
		finally {
			resume.resolve();
		}
		committed(await paused);
		a.hooks.stage = undefined;
		const original = committed(results.find(r => r.status === 'committed')!);
		const stale = await a.request('fixture', 'update', original.revision);
		const snapshot = a.store.snapshot;
		await a.store.commit(snapshot, { ...snapshot.file, connections: snapshot.file.connections.filter(c => c.id !== 'fixture'), _management: { ...snapshot.file._management!, generation: randomUUID() } });
		await a.pool.reload();
		const missing = await a.service.mutate(a.context, stale);
		assert.equal(missing.status, 'rejected');
		if (missing.status === 'rejected')
			assert.equal(missing.code, 'not-found');
		const recreated = committed(await a.service.mutate(a.context, await a.request('fixture')));
		assert.notEqual(recreated.revision, original.revision);
		const obsolete = await a.service.mutate(a.context, stale);
		assert.equal(obsolete.status, 'rejected');
		if (obsolete.status === 'rejected')
			assert.equal(obsolete.code, 'conflict');
		const first = results.find(r => r.status === 'committed')!;
		assert.ok(!JSON.stringify(first).includes('secret-canary'));
		assert.deepEqual(JSON.parse(await readFile(a.path, 'utf8')).retainedDocument, { exact: true });
	}
	finally {
		await env.cleanup();
	}
});
test('CM-S1-U: v2 dispatch and real legacy save reject corrupt unreadable registries before every staging and writer effect', async () => {
	const env = await environment();
	try {
		for (const failure of ['malformed', 'shape', 'EACCES', 'EPERM', 'EIO'] as const) {
			const f = await env.rootFixture(failure);
			const request = await f.request('fixture');
			if (failure === 'malformed' || failure === 'shape') {
				await chmod(f.path, 0o600);
				await writeFile(f.path, failure === 'malformed' ? '{invalid-private-canary' : JSON.stringify({ connections: [{ id: 'private-canary' }] }));
			}
			const before = await readFile(f.path, 'utf8');
			const keys = [...f.values];
			f.reset();
			let writes = 0, renames = 0;
			const originalRead = fsPromises.readFile;
			const originalWrite = fsPromises.writeFile;
			const originalRename = fsPromises.rename;
			const read = mock.method(fsPromises, 'readFile', async (...args: Parameters<typeof originalRead>) => {
				if (args[0] === f.path && !['malformed', 'shape'].includes(failure))
					throw Object.assign(new Error('private-canary'), { code: failure });
				return originalRead(...args);
			});
			const write = mock.method(fsPromises, 'writeFile', async (...args: Parameters<typeof originalWrite>) => {
				writes++;
				return originalWrite(...args);
			});
			const rename = mock.method(fsPromises, 'rename', async (...args: Parameters<typeof originalRename>) => {
				renames++;
				return originalRename(...args);
			});
			syncBuiltinESMExports();
			try {
				const result = await connectionManagementRpc('db.connections.v2.mutate', request, { connectionIdentity: f.context.connectionIdentity, daemonEpoch: f.context.access.daemonEpoch }) as MutationOutcome;
				assert.equal(result.status, 'rejected');
				if (result.status === 'rejected') {
					assert.equal(result.code, 'registry-unreadable');
					assert.ok(result.message.length > 0);
					assert.ok(!JSON.stringify(result).includes('canary'));
				}
				const legacy = await saveConnectionRpc({ repoRoot: f.root, config: { id: 'fixture', kind: 'postgres', url: 'postgres://u:replacement-secret-canary@host/db' } }, {connectionIdentity:'fixture-transport',daemonEpoch:'fixture-epoch'});
				assert.ok('error' in legacy);
				if ('error' in legacy) {
					assert.match(legacy.error, /registry-unreadable/);
					assert.ok(!legacy.error.includes('canary'));
				}
				assert.deepEqual(f.counts, { gets: 0, credentialGets: 0, sets: 0, deletes: 0, stages: 0, writes: 0 });
				assert.equal(writes, 0);
				assert.equal(renames, 0);
				assert.deepEqual([...f.values], keys);
			}
			finally {
				read.mock.restore();
				write.mock.restore();
				rename.mock.restore();
				syncBuiltinESMExports();
			}
			assert.equal(await readFile(f.path, 'utf8'), before);
		}
		const root = join(env.directory, 'unmanaged');
		await mkdir(root);
		const values = new Map<string, string>();
		_setKeystoreForTests({ getKey: async (ref) => values.get(ref) ?? null, setKey: async (ref, value) => {
				values.set(ref, value);
			}, deleteKey: async (ref) => {
				values.delete(ref);
			} });
		const empty = await saveConnectionRpc({ repoRoot: root, config: { id: 'fixture', kind: 'csv', path: 'fixture.csv' } }, {connectionIdentity:'fixture-transport',daemonEpoch:'fixture-epoch'});
		assert.ok(!('error' in empty));
		assert.equal(JSON.parse(await readFile(connectionsPath(root), 'utf8')).connections.length, 1);
		assert.equal(values.size, 0);
	}
	finally {
		await env.cleanup();
	}
});
test('CM-S1-B: legacy upsert is serialized through the same managed gate and preserves private fields and pinned family', async () => {
	const env = await environment();
	const f = await env.rootFixture('root');
	const entered = deferred(), resume = deferred();
	f.hooks.stage = async () => {
		f.hooks.stage = undefined;
		entered.resolve();
		await resume.promise;
	};
	try {
		const first = saveConnectionRpc({ repoRoot: f.root, config: { id: 'fixture', kind: 'postgres', url: 'postgres://u:first-secret-canary@host/db', label: 'First' } }, {connectionIdentity:'fixture-transport',daemonEpoch:'fixture-epoch'});
		// Establish gate admission order, rather than relying on asynchronous preflight completion order.
		await entered.promise;
		const second = saveConnectionRpc({ repoRoot: f.root, config: { id: 'fixture', kind: 'postgres', url: 'postgres://u:second-secret-canary@host/db', label: 'Second' } }, {connectionIdentity:'fixture-transport',daemonEpoch:'fixture-epoch'});
		resume.resolve();
		const outcomes = await Promise.all([first, second]);
		for (const result of outcomes) {
			assert.ok(!('error' in result), JSON.stringify(result));
			assert.ok(!JSON.stringify(result).includes('secret-canary'));
			assert.ok(!JSON.stringify(result).includes('db:v2:'));
		}
		const file = JSON.parse(await readFile(f.path, 'utf8'));
		assert.equal(file.connections.length, 1);
		assert.equal(file.connections[0].label, 'Second');
		assert.equal(file.connections[0].family, 'rdbms');
		assert.equal(Object.keys(file._management.receipts).length, 2);
		assert.deepEqual(file.retainedDocument, { exact: true });
		const pinned = await env.rootFixture('pinned', { id: 'fixture', kind: 'postgres', family: 'kv', url: 'postgres://u:original-secret-canary@host/db', namespace: { allow: ['retained'] } });
		const edit = await saveConnectionRpc({ repoRoot: pinned.root, config: { id: 'fixture', kind: 'postgres', url: 'postgres://u:new-secret-canary@host/db', label: 'Pinned edit' } }, {connectionIdentity:'fixture-transport',daemonEpoch:'fixture-epoch'});
		assert.ok(!('error' in edit), JSON.stringify(edit));
		const updated = JSON.parse(await readFile(pinned.path, 'utf8')).connections[0];
		assert.equal(updated.family, 'kv');
		assert.deepEqual(updated.namespace, { allow: ['retained'] });
		assert.equal(updated.label, 'Pinned edit');
	}
	finally {
		resume.resolve();
		await env.cleanup();
	}
});
test('CM-S1-U: unmanaged legacy compatibility also rejects corrupt registry reads before password extraction', async () => {
	const env = await environment();
	let keyWrites = 0;
	const keys = new Map<string, string>([['foreign', 'unchanged']]);
	_setKeystoreForTests({ getKey: async (ref) => keys.get(ref) ?? null, setKey: async (ref, value) => {
			keyWrites++;
			keys.set(ref, value);
		}, deleteKey: async (ref) => {
			keys.delete(ref);
		} });
	try {
		for (const code of ['malformed', 'shape', 'EACCES', 'EPERM', 'EIO'] as const) {
			const root = join(env.directory, 'legacy-' + code);
			await mkdir(root);
			const path = connectionsPath(root);
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, code === 'malformed' ? '{private-canary' : code === 'shape' ? '{}' : '{"connections":[]}');
			const before = await readFile(path, 'utf8');
			const original = fsPromises.readFile;
			const read = mock.method(fsPromises, 'readFile', async (...args: Parameters<typeof original>) => {
				if (args[0] === path && !['malformed', 'shape'].includes(code))
					throw Object.assign(new Error('private-canary'), { code });
				return original(...args);
			});
			syncBuiltinESMExports();
			try {
				const result = await saveConnectionRpc({ repoRoot: root, config: { id: 'fixture', kind: 'postgres', url: 'postgres://u:replacement-secret-canary@host/db' } }, {connectionIdentity:'fixture-transport',daemonEpoch:'fixture-epoch'});
				assert.ok('error' in result);
				if ('error' in result) {
					assert.match(result.error, /registry-unreadable/);
					assert.ok(!result.error.includes('canary'));
				}
				assert.equal(keyWrites, 0);
				assert.deepEqual([...keys], [['foreign', 'unchanged']]);
			}
			finally {
				read.mock.restore();
				syncBuiltinESMExports();
			}
			assert.equal(await readFile(path, 'utf8'), before);
		}
	}
	finally {
		await env.cleanup();
	}
});
