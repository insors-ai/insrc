/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
test('CLI source admission preserves historical checkout and validates explicit source overrides', async () => {
 const f = updateFixture(); process.env.HOME = join(f.root, 'home'); mkdirSync(process.env.HOME);
 process.env.INSRC_DAEMON_ROOT = f.install;
 try {
  const { update } = await import('../services/maintenance.js');
  const head = git(f.install, 'rev-parse', 'HEAD'), origin = git(f.install, 'remote', 'get-url', 'origin');
  writeFileSync(join(f.install, 'package.json'), '{"localEdit":true}\n');
  for (const opts of [{ source: { repoUrl: f.fork, branch: 'dev' } }, { repoUrl: f.remote, branch: 'main', source: { repoUrl: '--bad', branch: 'a..b' } }]) {
   const result = await update(opts, () => {});
   assert.equal(result.ok, false); assert.match(result.error ?? '', /current authenticated release installer/);
   assert.equal(git(f.install, 'rev-parse', 'HEAD'), head); assert.equal(git(f.install, 'remote', 'get-url', 'origin'), origin);
   assert.equal(readFileSync(join(f.install, 'package.json'), 'utf8'), '{"localEdit":true}\n');
  }
  for (const opts of [{ repoUrl: '--upload-pack=x' }, { branch: 'a..b' }]) {
   const result = await update(opts, () => {}); assert.equal(result.ok, false); assert.match(result.error ?? '', /daemonUpdate\.(repoUrl|branch)/);
  }
 } finally { delete process.env.INSRC_DAEMON_ROOT; f.cleanup(); }
});
