import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeGraphStore, getGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { openPaths } from './helpers/mcp-e2e.js';

test('process isolation closes inherited LMDB descriptors before application startup', { skip: process.platform !== 'linux' }, async () => {
 const dir = mkdtempSync(join(tmpdir(), 'insrc-inherited-store-'));
 const path = join(dir, 'graph.lmdb');
 setGraphStorePath(path);
 await getGraphStore();
 assert.ok(openPaths(process.pid).includes(path), 'the parent really holds a store descriptor');
 const preload = fileURLToPath(new URL('./fixtures/close-inherited-stores.mjs', import.meta.url));
 const child = spawn(process.execPath, ['--import', preload, '-e', "process.stdin.resume(); process.stdout.write('ready')"], { stdio: ['pipe', 'pipe', 'pipe'] });
 try {
  await once(child.stdout, 'data');
  assert.ok(child.pid !== undefined);
  assert.equal(openPaths(child.pid).includes(path), false);
  assert.ok(openPaths(process.pid).includes(path), 'the parent store stays open');
 } finally {
  const exited = once(child, 'exit');
  child.kill();
  await exited;
  await closeGraphStore();
  rmSync(dir, {recursive:true, force:true});
 }
});
