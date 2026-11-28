import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FileHandle } from 'node:fs/promises';
import { chmod, lstat, mkdir, open, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { ownedRuntimeHome } from './_owned-runtime-home.js';
import { spawnFixture } from '../../daemon/tools/__tests__/_proc.js';

test('owned runtime cleanup restores directory write only after positive resource and child closure', { skip: process.platform === 'win32' }, async () => {
  const home = await ownedRuntimeHome(); let handle: FileHandle | undefined, close: (() => void) | undefined;
  try {
    const child = home.trackChild(spawnFixture(process.execPath,
      ['-e', "process.stdout.write('ready');setInterval(()=>{},1000)"], { stdio: ['ignore', 'pipe', 'pipe'] }));
    await once(child.stdout!, 'data');
    const directory = join(home.root, 'sealed'), file = join(directory, 'file');
    await mkdir(directory, { mode: 0o700 }); await writeFile(file, 'preserve until closed', { mode: 0o400 });
    handle = await open(file); const before = await handle.stat();
    await chmod(directory, 0o500); await chmod(home.root, 0o500);
    const closed = new Promise<void>(resolve => { close = resolve; }); home.trackResource(closed);
    const disposal = home.cleanup(); let ended = false; void disposal.then(() => { ended = true; }, () => {});
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(ended, false); assert.equal((await lstat(home.root)).mode & 0o777, 0o500);
    assert.equal((await handle.stat()).ino, before.ino); await handle.close(); close!(); await disposal;
    await assert.rejects(lstat(home.root), { code: 'ENOENT' });
  } finally { await handle?.close(); close?.(); await home.cleanup(); }
});

test('owned runtime cleanup unlinks only declared fixture links without touching external targets', async () => {
  const home = await ownedRuntimeHome(), external = await ownedRuntimeHome();
  const target = join(external.root, 'untouched'), link = join(home.root, 'known-link');
  try {
    await writeFile(target, 'external', { mode: 0o400 }); await chmod(external.root, 0o500);
    const before = await lstat(target), rootBefore = await lstat(external.root);
    await symlink(target, link); home.allowFixtureSymlink(link); await chmod(home.root, 0o500);
    await home.cleanup();
    assert.equal((await lstat(target)).mode, before.mode); assert.equal((await lstat(external.root)).mode, rootBefore.mode);
    assert.equal(await readFile(target, 'utf8'), 'external');
  } finally { try { await home.cleanup(); } finally { await external.cleanup(); } }
});

test('owned runtime cleanup retains a root with an undeclared symlink before chmod', async t => {
  const home = await ownedRuntimeHome();
  await symlink('/must-not-open-or-chmod', join(home.root, 'unknown')); await chmod(home.root, 0o500);
  await assert.rejects(home.cleanup(), { code: 'fixture-cleanup-uncertain' });
  if (process.platform !== 'win32') assert.equal((await lstat(home.root)).mode & 0o777, 0o500);
  assert.equal((await lstat(join(home.root, 'unknown'))).isSymbolicLink(), true);
  t.diagnostic(`Retained uncertainty fixture: ${home.root}`);
});

test('owned runtime cleanup refuses replacement roots and never adopts a caller path', async t => {
  await assert.rejects(ownedRuntimeHome('../foreign-'), { code: 'fixture-cleanup-uncertain' });
  const home = await ownedRuntimeHome(), original = home.root + '-retained-original';
  await rename(home.root, original); await mkdir(home.root, { mode: 0o700 });
  await writeFile(join(home.root, 'foreign'), 'retain');
  await assert.rejects(home.cleanup(), { code: 'fixture-cleanup-uncertain' });
  assert.equal(await readFile(join(home.root, 'foreign'), 'utf8'), 'retain');
  assert.equal((await lstat(original)).isDirectory(), true);
  t.diagnostic(`Retained replaced roots: ${home.root}; ${original}`);
});

test('owned runtime cleanup retains failed resource closure and explicit uncertainty', async t => {
  for (const mode of ['failed-resource', 'explicit-retain']) {
    const home = await ownedRuntimeHome(); await writeFile(join(home.root, 'proof'), mode); await chmod(home.root, 0o500);
    if (mode === 'failed-resource') home.trackResource(Promise.reject(Error('close failed')));
    else home.retain(false); // Falsy reasons must still retain the root.
    await assert.rejects(home.cleanup(), { code: 'fixture-cleanup-uncertain' });
    assert.equal(await readFile(join(home.root, 'proof'), 'utf8'), mode);
    if (process.platform !== 'win32') assert.equal((await lstat(home.root)).mode & 0o777, 0o500);
    t.diagnostic(`Retained ${mode} fixture: ${home.root}`);
  }
});

test('owned runtime cleanup is awaited for a partially allocated protected fixture', async () => {
  const home = await ownedRuntimeHome();
  await assert.rejects((async () => {
    try { await mkdir(join(home.root, 'partial'), { mode: 0o500 }); await chmod(home.root, 0o500); throw Error('allocation failed'); }
    finally { await home.cleanup(); }
  })(), /allocation failed/);
  await assert.rejects(lstat(home.root), { code: 'ENOENT' });
});

test('owned runtime cleanup retains unconfirmed resources after its bounded wait', async t => {
  const home = await ownedRuntimeHome(); home.trackResource(new Promise(() => {})); await chmod(home.root, 0o500);
  await assert.rejects(home.cleanup(), error => {
    assert.equal((error as { code: string }).code, 'fixture-cleanup-uncertain');
    assert.match(String((error as Error).cause), /resource closure is unconfirmed/); return true;
  });
  if (process.platform !== 'win32') assert.equal((await lstat(home.root)).mode & 0o777, 0o500);
  t.diagnostic(`Retained unconfirmed fixture: ${home.root}`);
});

test('owned runtime cleanup bounds traversal before changing protected directory modes', async t => {
  const home = await ownedRuntimeHome(); let current = home.root;
  for (let depth = 0; depth < 65; depth++) { current = join(current, 'd'); await mkdir(current, { mode: 0o700 }); }
  await chmod(home.root, 0o500);
  await assert.rejects(home.cleanup(), error => {
    assert.equal((error as { code: string }).code, 'fixture-cleanup-uncertain');
    assert.match(String((error as Error).cause), /tree bound exceeded/); return true;
  });
  if (process.platform !== 'win32') assert.equal((await lstat(home.root)).mode & 0o777, 0o500);
  assert.equal((await lstat(current)).isDirectory(), true);
  t.diagnostic(`Retained bounded-tree fixture: ${home.root}`);
});
