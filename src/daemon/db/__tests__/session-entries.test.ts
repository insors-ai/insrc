import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createTemporaryOverlay, MAX_SESSION_CONNECTIONS } from '../session-entries.js';
import { ConnectionSessionOwner } from '../session-owner.js';
import { fileExecutionPolicy } from '../file-policy.js';
import { _setKeystoreForTests } from '../secrets.js';
import { environment } from './fixtures/saved-management-fixture.js';
import type { TemporaryConnectionOverlay, TemporaryEntryDraft } from '../session-entries.js';
import type { TrustedRpcContext } from '../../request-context.js';
import { contextualDriverFactory } from '../driver-log-policy.js';
import type { TemporaryResourcePorts } from '../session-resources.js';
import type { Driver } from '../../../shared/db-driver.js';
import '../drivers/index.js';

const context = (id: string): TrustedRpcContext => ({ connectionIdentity: id, daemonEpoch: 'epoch' });
const code = (expected: string) => (error: unknown) => error !== null && typeof error === 'object' && 'code' in error && error.code === expected;
const create = (root: string, id = 'same', password = 'private-owner-A'): TemporaryEntryDraft => ({ key: { repoRoot: root, scope: 'temporary', id }, mode: 'create', publicPatch: { kind: 'postgres', endpoint: 'postgres://host/db' }, credentials: { 'url.password': { action: 'replace', value: password } } });
async function tree(root: string): Promise<Record<string, string>> {
 const files: Record<string, string> = {};
 async function visit(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
   const path = join(directory, entry.name); if (entry.isDirectory()) await visit(path);
   else if (entry.isFile()) files[relative(root, path)] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
 }
 await visit(root); return files;
}
function owner(roots: readonly string[], now: () => number = () => 0, ports: TemporaryResourcePorts = {}) {
 return new ConnectionSessionOwner<TemporaryConnectionOverlay>({ daemonEpoch: 'epoch', monotonicNow: now, isRegistered: async root => roots.includes(root),
  createOverlay: (root,handle,context)=>createTemporaryOverlay(root,handle,context,ports), dropOverlay: overlay => overlay.close(),
 });
}

test('CM-S4-TEMP: exact overlay removal publishes revision-only receipt and invalidates private staged edits',async()=>{
 const env=await environment(),f=await env.rootFixture('remove'),b=await env.rootFixture('other'),service=owner([f.root,b.root]);
 try{
  await service.open(context('A'),f.root);await service.open(context('B'),f.root);
  const owned=await service.management(context('A'),f.root),a=owned.overlay,otherOwner=await service.overlay(context('B'),f.root),otherRoot=await service.overlay(context('A'),b.root);
  const initial=a.commit(await a.prepare(create(f.root))),isolated=otherOwner.commit(await otherOwner.prepare(create(f.root,'same','private-B')));
  otherRoot.commit(await otherRoot.prepare(create(b.root,'other-root')));
  const edit=await a.prepare({key:initial.key,mode:'update',expectedRevision:initial.revision,publicPatch:{label:'staged'},credentials:{'url.password':{action:'replace',value:'private-staged-canary'}}});
  const before=await tree(env.directory);f.reset();b.reset();
  const ticket=owned.ledger.issue(initial.key,'remove'),prepared=a.prepareRemoval({id:'same',expectedRevision:initial.revision});
  assert.throws(()=>otherRoot.commitRemoval(prepared),code('invalid-input'));
  const result=await owned.ledger.mutate({ticket,operationId:ticket.operationId,key:initial.key,mode:'remove',expectedRevision:initial.revision},async(_request,commit)=>commit(()=>a.commitRemoval(prepared)),()=>owned.binding.assertActive());
  assert.equal(result.status,'committed');if(result.status!=='committed')throw new Error('Expected removal receipt');
  assert.equal(result.value.registration,'removed');assert.equal(result.value.activation,'not-applicable');assert.notEqual(result.value.revision,initial.revision);
  assert.equal(owned.ledger.status(ticket).status,'committed');assert.throws(()=>a.read('same'),code('not-found'));assert.deepEqual(a.list(),[]);
  assert.throws(()=>a.commit(edit),code('conflict'));assert.throws(()=>a.commitRemoval(prepared),code('conflict'));
  const fresh=a.commit(await a.prepare(create(f.root,'same','private-new')));await a.retryRemovalCleanup(result.value.revision);assert.equal(a.read('same').revision,fresh.revision);
  assert.equal(otherOwner.read('same').revision,isolated.revision);assert.equal(otherRoot.list().length,1);
  await otherOwner.withGeneration('same',isolated.revision,config=>assert.equal(new URL(config.url!).password,'private-B'));
  assert.deepEqual(await tree(env.directory),before);assert.ok(Object.values(f.counts).every(n=>n===0));assert.ok(Object.values(b.counts).every(n=>n===0));
  assert.ok(!JSON.stringify([result,JSON.stringify(a)]).includes('private-'));
 }finally{await service.close();await env.cleanup();}
});

test('CM-S4-TEMP: pending removal retains shared session slot and ID reservation across roots until exact close',async()=>{
 const env=await environment(),f=await env.rootFixture('quota'),b=await env.rootFixture('other');let finish!:()=>void,entered!:()=>void,closes=0;
 const closing=new Promise<void>(resolve=>{finish=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
 const service=owner([f.root,b.root],()=>0,{factory:()=>contextualDriverFactory(async config=>({id:config.id,kind:config.kind,family:'rdbms',close:async()=>{closes++;entered();await closing;}} as Driver))});
 try{
  await service.open(context('A'),f.root);const owned=await service.management(context('A'),f.root),a=owned.overlay,other=await service.overlay(context('A'),b.root);
  for(let i=0;i<64;i++)a.commit(await a.prepare(create(f.root,`a${i}`)));
  const access=owned.binding.access,resolver=a.resolver(access,{assertActive:()=>owned.binding.assertActive(),signal:owned.binding.signal});
  await resolver.withConnection(access,'a0',async()=>{});const initial=a.read('a0');
  const lease=await resolver.lease(access,'a0');assert.throws(()=>a.prepareRemoval({id:'a0',expectedRevision:initial.revision}),code('busy'));await lease.release();
  const removed=a.commitRemoval(a.prepareRemoval({id:'a0',expectedRevision:initial.revision}));await started;
  assert.equal(a.list().length,63);assert.equal(a.reserves('a0'),true);assert.equal(a.removalCleanupPending(removed.revision),true);
  await assert.rejects(resolver.lease(access,'a0'),code('not-found'));await assert.rejects(other.prepare(create(b.root,'overflow')),code('busy'));await assert.rejects(a.prepare(create(f.root,'a0')),code('busy'));
  finish();await a.retryRemovalCleanup(removed.revision);assert.equal(closes,1);assert.equal(a.reserves('a0'),false);
  other.commit(await other.prepare(create(b.root,'freed-slot')));assert.equal(other.list().length,1);
  const unused=a.read('a1');a.commitRemoval(a.prepareRemoval({id:'a1',expectedRevision:unused.revision}));
  const fresh=a.commit(await a.prepare(create(f.root,'a0','private-new')));await a.retryRemovalCleanup(removed.revision);assert.equal(a.read('a0').revision,fresh.revision);assert.equal(closes,1);
 }finally{finish();await service.close();await env.cleanup();}
});

test('CM-S4-TEMP: removed config bytes are released immediately while runtime slot cleanup stays pending',async()=>{
 const env=await environment(),f=await env.rootFixture('bytes'),b=await env.rootFixture('other');let finish!:()=>void;
 const closing=new Promise<void>(resolve=>{finish=resolve;});
 const service=owner([f.root,b.root],()=>0,{factory:()=>contextualDriverFactory(async config=>({id:config.id,kind:config.kind,family:'rdbms',close:async()=>closing} as Driver))});
 try{
  await service.open(context('A'),f.root);const owned=await service.management(context('A'),f.root),a=owned.overlay,other=await service.overlay(context('A'),b.root),large='x'.repeat(2*1024*1024);
  for(let i=0;i<3;i++)a.commit(await a.prepare(create(f.root,`large${i}`,large)));other.commit(await other.prepare(create(b.root,'small')));
  await assert.rejects(other.prepare(create(b.root,'overflow',large)),code('busy'));
  const access=owned.binding.access;await a.resolver(access,{assertActive:()=>owned.binding.assertActive(),signal:owned.binding.signal}).withConnection(access,'large0',async()=>{});
  const removed=a.commitRemoval(a.prepareRemoval({id:'large0',expectedRevision:a.read('large0').revision}));
  assert.equal(a.removalCleanupPending(removed.revision),true);other.commit(await other.prepare(create(b.root,'now-fits',large)));assert.equal(other.list().length,2);
  finish();await a.retryRemovalCleanup(removed.revision);
 }finally{finish();await service.close();await env.cleanup();}
});

test('CM-S4-TEMP: stale canceled forged and expired removal tokens have no publication effects',async()=>{
 const env=await environment(),f=await env.rootFixture('cancel');let now=0;const service=owner([f.root],()=>now);
 try{
  await service.open(context('A'),f.root);const a=await service.overlay(context('A'),f.root),initial=a.commit(await a.prepare(create(f.root)));
  assert.throws(()=>a.prepareRemoval({id:'same',expectedRevision:'stale'}),code('conflict'));assert.throws(()=>a.prepareRemoval({id:'missing',expectedRevision:initial.revision}),code('not-found'));
  assert.throws(()=>a.commitRemoval({}),code('invalid-input'));
  const controller=new AbortController(),canceled=a.prepareRemoval({id:'same',expectedRevision:initial.revision},controller.signal);controller.abort();assert.throws(()=>a.commitRemoval(canceled),code('session-expired'));
  assert.equal(a.read('same').revision,initial.revision);
  const explicit=a.prepareRemoval({id:'same',expectedRevision:initial.revision});a.cancelRemoval(explicit);a.cancelRemoval(explicit);assert.throws(()=>a.commitRemoval(explicit),code('conflict'));
  const before=await tree(env.directory),pending=a.prepareRemoval({id:'same',expectedRevision:initial.revision});now=90000;
  assert.throws(()=>a.commitRemoval(pending),code('session-expired'));assert.throws(()=>a.list(),code('session-expired'));assert.deepEqual(await tree(env.directory),before);
 }finally{await service.close();await env.cleanup();}
});

test('CM-S3-MEMORY: owner generations keep replace clear safely with exact saved and keychain snapshots', async () => {
 const env = await environment(), f = await env.rootFixture('root'), b = await env.rootFixture('other');
 const previousKeystore = _setKeystoreForTests(f.keystore), service = owner([f.root, b.root]);
 try {
  await service.open(context('A'), f.root); await service.open(context('B'), f.root);
  const a = await service.overlay(context('A'), f.root), otherOwner = await service.overlay(context('B'), f.root), otherRoot = await service.overlay(context('A'), b.root);
  f.reset(); b.reset(); const before = await tree(env.directory), keys = [...f.values], otherKeys = [...b.values];
  const first = a.commit(await a.prepare(create(f.root))), secondOwner = otherOwner.commit(await otherOwner.prepare(create(f.root, 'same', 'private-owner-B')));
  const firstGeneration = await a.withGeneration('same', first.revision, config => config);
  assert.equal(new URL(firstGeneration.url!).password, 'private-owner-A'); assert.equal(Object.isFrozen(firstGeneration), true);
  const kept = a.commit(await a.prepare({ key: first.key, mode: 'update', expectedRevision: first.revision, publicPatch: { label: 'Kept' }, credentials: { 'url.password': { action: 'keep' } } }));
  await a.withGeneration('same', kept.revision, config => { assert.equal(new URL(config.url!).password, 'private-owner-A'); assert.equal(config.label, 'Kept'); });
  const replaced = a.commit(await a.prepare({ key: first.key, mode: 'update', expectedRevision: kept.revision, publicPatch: {}, credentials: { 'url.password': { action: 'replace', value: 'private-replacement' } } }));
  assert.equal(new URL(firstGeneration.url!).password, 'private-owner-A', 'prior generation remains immutable');
  const cleared = a.commit(await a.prepare({ key: first.key, mode: 'update', expectedRevision: replaced.revision, publicPatch: {}, credentials: { 'url.password': { action: 'clear' } } }));
  await a.withGeneration('same', cleared.revision, config => { assert.equal(new URL(config.url!).password, ''); });
  await otherOwner.withGeneration('same', secondOwner.revision, config => { assert.equal(new URL(config.url!).password, 'private-owner-B'); });
  assert.equal(otherRoot.list().length, 0); assert.equal(cleared.credentialPresence['url.password'], false); assert.equal(first.credentialPresence['url.password'], true);
  for (const response of [first, kept, replaced, cleared, a.list(), otherOwner.list(), JSON.stringify(service), JSON.stringify(a)]) {
   const text = JSON.stringify(response); assert.ok(!/private-owner|private-replacement|secretRef|\$\{secret:/.test(text));
  }
  assert.equal(Object.isFrozen(a.list()), true); assert.equal(Object.isFrozen(first.publicConfig), true);
  await assert.rejects(a.prepare({ ...create(f.root), mode: 'update', expectedRevision: first.revision }), code('conflict'));
  await assert.rejects(otherRoot.prepare(create(f.root)), code('invalid-input'));
  await assert.rejects(a.prepare({ key: cleared.key, mode: 'update', expectedRevision: cleared.revision, publicPatch: { kind: 'mysql' } }), code('invalid-input'));
  await assert.rejects(a.prepare({ key: cleared.key, mode: 'update', expectedRevision: cleared.revision, publicPatch: {}, credentials: { 'url.password': { action: 'replace', value: '${secret:saved-vault-ref}' } } }), code('invalid-input'));
  assert.deepEqual(await tree(env.directory), before); assert.deepEqual([...f.values], keys); assert.deepEqual([...b.values], otherKeys);
  assert.ok(Object.values(f.counts).every(n => n === 0)); assert.ok(Object.values(b.counts).every(n => n === 0));
 } finally { service.close(); _setKeystoreForTests(previousKeystore); await env.cleanup(); }
});

test('CM-S3-MEMORY: file generations reuse readonly paths and retain fixed memory-only policy', async () => {
 const env = await environment(), f = await env.rootFixture('root'); const service = owner([f.root]);
 try {
  await writeFile(join(f.root, 'source.csv'), 'id\n1\n'); await service.open(context('A'), f.root); const overlay = await service.overlay(context('A'), f.root);
  const before = await tree(env.directory); f.reset();
  const created = overlay.commit(await overlay.prepare({ key: { repoRoot: f.root, scope: 'temporary', id: 'file' }, mode: 'create', publicPatch: { kind: 'csv', path: 'source.csv', options: { header: true } } }));
  await overlay.withGeneration('file', created.revision, config => {
   assert.equal(config.path, join(f.root, 'source.csv')); assert.equal(Object.isFrozen(config.options), true);
   assert.throws(() => { (config.options as Record<string, unknown>)['header'] = false; });
   const policy = fileExecutionPolicy(config, { lookupRoot: f.root, ownerId: 'session-fixture', revision: created.revision, persistence: 'memory-only' });
   assert.equal(policy.memoryBudgetBytes, 256 * 1024 * 1024); assert.equal(policy.allowSpill, false); assert.equal(policy.persistence, 'memory-only');
  });
  await assert.rejects(overlay.prepare({ key: { repoRoot: f.root, scope: 'temporary', id: 'outside' }, mode: 'create', publicPatch: { kind: 'csv', path: '../outside.csv' } }));
  assert.equal(overlay.list().length, 1); assert.deepEqual(await tree(env.directory), before); assert.ok(Object.values(f.counts).every(n => n === 0));
 } finally { service.close(); await env.cleanup(); }
});

test('CM-S3-REPLAY: session entry quota spans roots and commit rechecks concurrent preparations', async () => {
 const env = await environment(), f = await env.rootFixture('root'), b = await env.rootFixture('other'), service = owner([f.root, b.root]);
 try {
  await service.open(context('A'), f.root); const a = await service.overlay(context('A'), f.root), other = await service.overlay(context('A'), b.root);
  for (let i = 0; i < MAX_SESSION_CONNECTIONS - 1; i++) a.commit(await a.prepare(create(f.root, `a${i}`)));
  const last = await a.prepare(create(f.root, 'last')), concurrent = await other.prepare(create(b.root, 'concurrent'));
  a.commit(last); assert.throws(() => other.commit(concurrent), code('busy'));
  assert.equal(a.list().length, 64); assert.equal(other.list().length, 0);
  await assert.rejects(other.prepare(create(b.root)), code('busy'));
  const before = a.list(), update = a.commit(await a.prepare({ key: a.read('a0').key, mode: 'update', expectedRevision: a.read('a0').revision, publicPatch: { label: 'Updated at quota' } }));
  assert.equal(update.label, 'Updated at quota'); assert.equal(a.list().length, before.length);
  await service.open(context('B'), f.root); const isolated = await service.overlay(context('B'), f.root); isolated.commit(await isolated.prepare(create(f.root))); assert.equal(isolated.list().length, 1);
 } finally { service.close(); await env.cleanup(); }
});

test('CM-S3-REPLAY: cumulative config quota refuses create and update without partial state', async () => {
 const env = await environment(), f = await env.rootFixture('root'), b = await env.rootFixture('other'), service = owner([f.root, b.root]);
 try {
  await service.open(context('A'), f.root); const a = await service.overlay(context('A'), f.root), other = await service.overlay(context('A'), b.root);
  const large = 'x'.repeat(2 * 1024 * 1024);
  for (let i = 0; i < 3; i++) a.commit(await a.prepare(create(f.root, `large${i}`, large)));
  const small = other.commit(await other.prepare(create(b.root, 'small'))), before = JSON.stringify([a.list(), other.list()]);
  await assert.rejects(other.prepare(create(b.root, 'overflow', large)), code('busy'));
  await assert.rejects(other.prepare({ key: small.key, mode: 'update', expectedRevision: small.revision, publicPatch: {}, credentials: { 'url.password': { action: 'replace', value: large } } }), code('busy'));
  assert.equal(JSON.stringify([a.list(), other.list()]), before);
  other.commit(await other.prepare({ key: small.key, mode: 'update', expectedRevision: small.revision, publicPatch: {}, credentials: { 'url.password': { action: 'clear' } } }));
 } finally { service.close(); await env.cleanup(); }
});

test('CM-S3-MEMORY: cancellation expiry forgery and stale prepared generations cannot commit or leak prior state', async () => {
 const env = await environment(), f = await env.rootFixture('root'); let now = 0; const service = owner([f.root], () => now);
 try {
  await service.open(context('A'), f.root); const a = await service.overlay(context('A'), f.root), controller = new AbortController();
  const canceled = await a.prepare(create(f.root, 'canceled'), controller.signal); controller.abort(); assert.throws(() => a.commit(canceled), code('session-expired')); assert.equal(a.list().length, 0);
  const first = await a.prepare(create(f.root)), second = await a.prepare(create(f.root)); a.commit(first); assert.throws(() => a.commit(second), code('conflict'));
  assert.throws(() => a.commit({ safe: first.safe }), code('invalid-input'));
  const pending = await a.prepare(create(f.root, 'late'));
  now = 90000; assert.throws(() => a.commit(pending), code('session-expired')); assert.throws(() => a.read('same'), code('session-expired'));
  assert.equal(JSON.stringify(a), '{}');
 } finally { service.close(); await env.cleanup(); }
});
