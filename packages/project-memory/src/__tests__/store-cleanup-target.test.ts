import assert from 'node:assert/strict';
import { mkdir, rename, rm, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { MemoryError } from '../errors.js';
import { nativeTest } from './fixtures/node22.js';
import { finalCommand, framePlan, integrationFixture } from './fixtures/store-integration.js';
import { canonical } from '../store/plan.js';

nativeTest(import.meta.url, 'store-cleanup-preflight-rejects-overlap-alias-and-inode-change-without-deletion', async () => {
  const f = await integrationFixture(), target = join(f.root, 'memory.lance'), saved = join(f.root, 'saved-memory'), alias = join(f.root, 'alias');
  try {
    const frame = await f.append(finalCommand('cleanup-target')); await f.store.commit(framePlan(frame, '0', 100));
    const before = canonical(await f.rows()), pending = f.queue.stats().pendingEvents;
    await f.store.preflightCleanupTarget(target);
    await symlink(target, alias);
    for (const path of [null, '', f.root, dirname(f.root), join(f.root, 'queue'), join(f.root, 'layout.json'), join(f.root, '.owner.lock'), join(f.root, 'store-format.json'), join(target, 'records.lance'), alias, f.root + '/memory.lance/../memory.lance', join(f.root, 'foreign')]) await assert.rejects(f.store.preflightCleanupTarget(path), MemoryError);
    await rename(target, saved); await symlink(saved, target);
    try { await assert.rejects(f.store.preflightCleanupTarget(target), MemoryError); }
    finally { await rm(target); await rename(saved, target); }
    await rename(target, saved); await mkdir(target, { mode: 0o700 });
    try { await assert.rejects(f.store.preflightCleanupTarget(target), MemoryError); }
    finally { await rm(target, { recursive: true }); await rename(saved, target); }
    assert.equal(canonical(await f.rows()), before); assert.equal(f.queue.stats().pendingEvents, pending);
    await rm(alias); await f.reopen(); assert.equal(canonical(await f.rows()), before);
  } finally { await f.close(); }
});
