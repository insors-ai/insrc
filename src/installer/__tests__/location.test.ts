import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLocalControlRoot, isSupportedControlFilesystem, resolveInstallationLocation } from '../location.js';
import { parseInstaller } from '../schemas.js';

test('explicit home endpoint and terminal launch identity remain consistent', () => {
  const location = resolveInstallationLocation('home', { os: 'darwin', userHome: '/tmp/person' });
  assert.equal(location.home, '/tmp/person/.insrc');
  assert.equal(location.daemonEndpoint.address, '/tmp/person/.insrc/daemon.sock');
  assert.deepEqual(resolveInstallationLocation('home', { os: 'darwin', home: '/tmp/person/.insrc/' }), location);
  assert.deepEqual(parseInstaller('location', location), location);
  for (const home of ['relative', '~/insrc', '//server/share', '/tmp/../escape', '/tmp/./insrc']) {
    assert.throws(() => resolveInstallationLocation('home', { home, os: 'linux' }), home);
  }
  assert.throws(() => resolveInstallationLocation('../id', { home: '/tmp/a' }));
  assert.throws(() => resolveInstallationLocation('home', { home: '/tmp/' + 'é'.repeat(70), os: 'darwin' }), { code: 'endpoint-too-long' });
  const options = { os: 'win32' as const, home: 'C:\\Users\\person\\.insrc', userSid: 'S-1-5-21-123' };
  const windows = resolveInstallationLocation('home', options);
  parseInstaller('location', windows);
  assert.equal(windows.daemonEndpoint.kind, 'named-pipe');
  assert.equal(windows.daemonEndpoint.address, resolveInstallationLocation('home', { ...options, home: options.home.toUpperCase() }).daemonEndpoint.address);
  assert.notEqual(windows.daemonEndpoint.address, resolveInstallationLocation('other', options).daemonEndpoint.address);
  assert.notEqual(windows.daemonEndpoint.address, resolveInstallationLocation('home', { ...options, userSid: 'S-1-5-21-456' }).daemonEndpoint.address);
  assert.throws(() => resolveInstallationLocation('home', { os: 'win32', home: options.home }));
  for (const home of ['C:relative', '\\\\server\\share', 'C:\\x:stream', 'C:\\a\\..\\b', 'C:\\Users\\person.\\insrc', 'C:\\CON\\insrc']) assert.throws(() => resolveInstallationLocation('home', { ...options, home }));
  assert.throws(() => parseInstaller('location', { ...location, daemonEndpoint: { ...location.daemonEndpoint, installationId: 'other' } }));
});

test('control-root inspection rejects symlinks and files and never creates missing homes', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-location-')));
  try {
    const missing = join(root, 'missing');
    assertLocalControlRoot(missing);
    assert.equal(existsSync(missing), false);
    assert.throws(() => assertLocalControlRoot(missing, () => false), { code: 'filesystem-unsupported' });
    symlinkSync(root, join(root, 'alias'));
    assert.throws(() => assertLocalControlRoot(join(root, 'alias', 'home')), { code: 'home-invalid' });
    writeFileSync(join(root, 'file'), 'owned fixture');
    assert.throws(() => assertLocalControlRoot(join(root, 'file')), { code: 'home-invalid' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unknown and network filesystem families fail closed until qualified', () => {
  assert.equal(isSupportedControlFilesystem('darwin', 26), true);
  assert.equal(isSupportedControlFilesystem('linux', 0xef53), true);
  for (const type of [0, 0x6969, 0x517b, 0xff534d42, 0xfe534d42, 0x65735546, 12345]) {
    assert.equal(isSupportedControlFilesystem('linux', type), false);
    assert.equal(isSupportedControlFilesystem('darwin', type), false);
  }
  assert.equal(isSupportedControlFilesystem('win32', 0), false);
});
