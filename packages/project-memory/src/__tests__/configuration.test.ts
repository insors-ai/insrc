import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateOptions, validateRuntime, validateFilesystem, prepareRoot, classifyLayout, LAYOUT_PENDING, LAYOUT_TEXT } from '../configuration.js';
import { MemoryError } from '../errors.js';
import { options } from './fixtures/options.js';
import { nativeTest } from './fixtures/node22.js';

test('options-fail-before-side-effects', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'memory-options-'));
  try {
    for (const input of [null, {}, options('relative'), { ...options(dir), models: {} }, { ...options(dir), policy: {} }, { ...options(dir), logger: {} }, { ...options(dir), limits: { ...options(dir).limits, modelTimeoutMs: NaN } }, { ...options(dir), limits: { ...options(dir).limits, segmentBytes: 1 } }]) assert.throws(() => validateOptions(input), MemoryError);
    assert.deepEqual(await readdir(dir), []);
    const source = options(dir); const snapshot = validateOptions(source);
    assert.equal(snapshot.models, source.models); assert.ok(Object.isFrozen(snapshot.limits));
    assert.throws(() => validateRuntime('darwin', '26.5.1'), MemoryError);
    assert.throws(() => validateFilesystem(0x6969, 'linux'), MemoryError);
    validateRuntime('linux', '22.22.1'); validateFilesystem(0xef53, 'linux');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

nativeTest(import.meta.url, 'canonical-root-and-readonly-layout-validation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'memory-layout-'));
  try {
    const path = join(dir, 'data'); const root = await prepareRoot(validateOptions(options(path)));
    assert.equal(await classifyLayout(root), 'new'); assert.deepEqual(await readdir(path), []);
    await symlink(path, join(dir, 'alias'));
    const alias = await prepareRoot(validateOptions(options(join(dir, 'alias'))));
    assert.equal(alias.path, root.path); assert.equal(alias.ino, root.ino);
    await writeFile(join(path, LAYOUT_PENDING), LAYOUT_TEXT.slice(0, 12), { mode: 0o600 });
    assert.equal(await classifyLayout(root), 'new');
    assert.equal((await readdir(path)).length, 1, 'read-only validation must not repair metadata');
    await rm(join(path, LAYOUT_PENDING));
    execFileSync('mkfifo', ['-m', '600', join(path, LAYOUT_PENDING)]);
    await assert.rejects(classifyLayout(root), MemoryError, 'special metadata files must fail without waiting for a writer');
    await rm(join(path, LAYOUT_PENDING));
    await writeFile(join(path, 'index.lance'), 'unrelated');
    await assert.rejects(classifyLayout(root), MemoryError);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
