/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/** The TUI no longer performs incumbent npm installs. Markers and native flags
 * remain compatible with the source installer; update may not bypass its gate. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const sandbox = mkdtempSync(join(tmpdir(), 'insrc-maintenance-admission-'));
process.env.HOME = join(sandbox, 'home'); process.env.INSRC_DAEMON_ROOT = join(sandbox, 'daemon');
mkdirSync(process.env.HOME, { recursive: true }); mkdirSync(join(process.env.INSRC_DAEMON_ROOT, 'node_modules'), { recursive: true });
const { update, INSTALL_MARKER, nativeBuildEnv } = await import('../maintenance.js');
const marker = join(process.env.INSRC_DAEMON_ROOT, INSTALL_MARKER);
test.after(() => rmSync(sandbox, { recursive: true, force: true }));
for (const option of ['skipSync', 'skipInstall', 'skipBuild'] as const) {
 test(`TUI refuses ${option} before changing incumbent install state`, async () => {
  writeFileSync(marker, 'old-marker\n');
  const result = await update({ [option]: true }, () => {});
  assert.equal(result.ok, false); assert.match(result.error ?? '', /cannot skip authentication, installation or build validation/);
  assert.deepEqual(result.steps, []); assert.equal(readFileSync(marker, 'utf8'), 'old-marker\n');
 });
}
test('historical TUI requires authenticated current installer without writing a success marker', async () => {
 rmSync(marker, { force: true });
 const result = await update({}, () => {});
 assert.equal(result.ok, false); assert.match(result.error ?? '', /current authenticated release installer/);
 assert.match(result.error ?? '', /raw repository template has no release signing authority/);
 assert.equal(existsSync(marker), false);
});
test('native build environment preserves caller flags and CUDA choice while clearing Node injection', () => {
 const original = { CXXFLAGS: '-O2', NODE_OPTIONS: '--invalid', NODE_PATH: '/untrusted', ONNXRUNTIME_NODE_INSTALL_CUDA: 'v12' };
 assert.deepEqual(nativeBuildEnv(original), { CXXFLAGS: '-O2 -std=c++17', ONNXRUNTIME_NODE_INSTALL_CUDA: 'v12' });
 assert.equal(nativeBuildEnv({}).CXXFLAGS, '-std=c++17'); assert.equal(original.NODE_OPTIONS, '--invalid');
});
