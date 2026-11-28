import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { storeScratchImage, readScratchImage, resolveScratchImage, scratchWorkspaceLink } from '../scratch-editor-assets.js';
import { SCRATCH_IMAGE_BYTES } from '../scratch-editor-protocol.js';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
async function fixture(run: (dir: string) => Promise<void>) { const dir = await mkdtemp(join(tmpdir(), 'scratch-assets-')); try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); } }
test('scratch assets validate image content size and exclusive portable names without overwriting', async () => fixture(async root => {
  const document = join(root, 'note.md'); await writeFile(document, '# Keep\n');
  const first = await storeScratchImage(document, png, 'image/png', () => 'same');
  assert.equal(first.href, 'assets/same.png'); assert.deepEqual(await readFile(first.path), png);
  await assert.rejects(storeScratchImage(document, png, 'image/png', () => 'same'), /exclusive/);
  assert.deepEqual(await readFile(first.path), png);
  assert.equal(await resolveScratchImage(document, first.href), first.path);
  assert.equal((await readScratchImage(first.path)).mediaType, 'image/png');
  for (const [bytes, type] of [[png, 'image/jpeg'], [Buffer.from('not an image'), 'image/png'], [png, 'image/svg+xml'], [Buffer.alloc(SCRATCH_IMAGE_BYTES + 1), 'image/png']] as const) await assert.rejects(storeScratchImage(document, bytes, type), /image/);
  assert.equal(await readFile(document, 'utf8'), '# Keep\n');
  assert.deepEqual(await readdir(join(root, 'assets')), ['same.png']);
}));
test('scratch assets refuse symlink roots files traversal and outside-workspace picks', async () => fixture(async dir => {
  const root = join(dir, 'scratches'), outside = join(dir, 'outside'), workspace = join(dir, 'workspace');
  await mkdir(root); await mkdir(outside); await mkdir(workspace); const document = join(root, 'note.md'); await writeFile(document, 'Keep');
  await symlink(outside, join(root, 'assets'), 'dir');
  await assert.rejects(storeScratchImage(document, png, 'image/png'), /directory/); assert.deepEqual(await readdir(outside), []);
  await rm(join(root, 'assets')); await mkdir(join(root, 'assets'));
  await writeFile(join(outside, 'outside.png'), png); await symlink(join(outside, 'outside.png'), join(root, 'assets', 'linked.png'));
  await assert.rejects(resolveScratchImage(document, 'assets/linked.png'));
  for (const href of ['../outside/outside.png', 'assets/../outside.png', 'https://example.test/x.png', 'blob:transient', 'assets/%2e%2e.png']) await assert.rejects(resolveScratchImage(document, href));
  await writeFile(join(workspace, 'space name.md'), 'file');
  assert.equal(await scratchWorkspaceLink(document, join(workspace, 'space name.md'), workspace), '../workspace/space%20name.md');
  await symlink(join(outside, 'outside.png'), join(workspace, 'escape.png'));
  await assert.rejects(scratchWorkspaceLink(document, join(workspace, 'escape.png'), workspace), /workspace/);
  await assert.rejects(readScratchImage(join(workspace, 'escape.png')));
}));
