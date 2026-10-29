import assert from 'node:assert/strict';
import test from 'node:test';
import { managementFixture } from './fixtures/management.js';
import { createConnectionsMutationController } from '../gateway.js';
import { ConnectionDraft } from '../../../../src/shared/connection-manager/draft.js';
import { decodeDriverDescriptors, decodeSafeConnectionList } from '../../../../src/shared/connection-manager/wire.js';
import { loadConnectionCorpus } from '../../../../src/shared/__tests__/fixtures/connection-corpus.js';

test('CM-S5-WINDOW: two real workbench owners isolate same IDs, overlapping lane IDs, roots and disposal', async () => {
  const f=await managementFixture({multipleRoots:true}), second=f.forkOwner(), mutations=createConnectionsMutationController(second);
  const root=f.f.root, other=f.roots[1]!, p='db.connections.v2.';
  const descriptor=decodeDriverDescriptors(loadConnectionCorpus().driverDescriptors).find(d=>d.kind==='postgres')!;
  const draft=(repoRoot:string,label:string)=>{const value=new ConnectionDraft(descriptor,{repoRoot,scope:'temporary',id:'shared-id'});value.setField(['endpoint'],'postgresql://fixture.invalid/database');value.setField(['label'],label);return value;};
  const rows=async(owner:typeof second,repoRoot=root)=>decodeSafeConnectionList(await owner.requestTemporary(repoRoot,owner.view,p+'list',{repoRoot}),repoRoot);
  try {
    await second.selectRoot(root);
    // Every actual lane begins its own counter at 1; both owners run concurrently.
    const [first,another]=await Promise.all([f.controller.submit(draft(root,'first-owner')),mutations.submit(draft(root,'second-owner'))]);
    assert.equal(first.phase,'committed');assert.equal(another.phase,'committed');assert.notEqual(first.outcome?.revision,another.outcome?.revision);
    assert.deepEqual((await rows(f.owner)).map(row=>row.label),['first-owner']);assert.deepEqual((await rows(second)).map(row=>row.label),['second-owner']);
    const old=second.view, calls=f.calls.length;
    await assert.rejects(second.requestTemporary(root,{...old,generation:old.generation+1},p+'list',{repoRoot:root}),{code:'stale-view'});
    await assert.rejects(second.requestTemporary(root,old,p+'list',{repoRoot:other}),{code:'invalid-request'});
    await assert.rejects(second.requestTemporary(root,old,p+'list',{repoRoot:root,capability:'forged-owner'}),{code:'invalid-request'});
    assert.equal(f.calls.length,calls);
    await second.selectRoot(other);assert.equal((await mutations.submit(draft(other,'other-root'))).phase,'committed');
    assert.deepEqual((await rows(second,other)).map(row=>row.label),['other-root']);
    await second.selectRoot(root);assert.deepEqual((await rows(second)).map(row=>row.label),['second-owner']);
    assert.deepEqual(await second.requestSaved(root,p+'list',{repoRoot:root}),[]);
    f.controller.dispose();f.owner.dispose();await f.owner.whenDisposed();
    assert.equal(second.view.status,'ready');assert.deepEqual((await rows(second)).map(row=>row.label),['second-owner']);
    await second.selectRoot(other);assert.deepEqual((await rows(second,other)).map(row=>row.label),['other-root']);
  } finally {mutations.dispose();await f.close();}
});
