/**
 * Story E20260921ad0d45c9:S005 / t2 — unwireAllHosts + runUninstall + k5 scan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { unwireAllHosts, runUninstall } from '../uninstall.js';
import { STEERING_MARKER_START, STEERING_MARKER_END } from '../hosts/steering-writer.js';
import type { HostSpec } from '../hosts/types.js';
import { fakeFs } from '../hosts/__tests__/fakes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..'); // vscode-plugin/src

function spec(id: string, mcp: string, steer: string): HostSpec {
  return {
    descriptor: { id, displayName: id, detection: { kind: 'by-extension-id', extensionId: id } },
    detect: () => false,
    resolveConfig: () => ({ mcpConfigPath: mcp, steeringPath: steer }),
  };
}

const wiredMcp = JSON.stringify({ mcpServers: { insrc: { command: 'node', args: ['/x'] }, other: { command: 'y' } } }, null, 2);
const wiredSteer = `# my notes\n\n${STEERING_MARKER_START}\ninsrc guidance\n${STEERING_MARKER_END}\n`;

test('unwireAllHosts builds an adapter per HostSpec and removes the mcp key + steering block, returning a tally', async () => {
  const fs = fakeFs({ '/h1/mcp.json': wiredMcp, '/h1/rules.md': wiredSteer });
  const res = await unwireAllHosts({ specs: [spec('h1', '/h1/mcp.json', '/h1/rules.md')], fs });
  assert.deepEqual(res, { unwired: 1, failed: 0 });
  const parsed = JSON.parse(fs.files.get('/h1/mcp.json')!);
  assert.equal('insrc' in parsed.mcpServers, false, 'insrc key removed');
  assert.deepEqual(parsed.mcpServers.other, { command: 'y' }, 'other server preserved');
  assert.equal(fs.files.get('/h1/rules.md'), '# my notes\n', 'steering restored to pre-insrc content');
});

test('unwireAllHosts is an idempotent no-op for a never-wired host (file byte-unchanged; failed:0)', async () => {
  const plainMcp = JSON.stringify({ mcpServers: { other: { command: 'y' } } }, null, 2);
  const fs = fakeFs({ '/h/mcp.json': plainMcp, '/h/rules.md': '# just notes\n' });
  const res = await unwireAllHosts({ specs: [spec('h', '/h/mcp.json', '/h/rules.md')], fs });
  assert.deepEqual(res, { unwired: 1, failed: 0 }, 'a no-op still counts as swept (not failed)');
  assert.equal(fs.files.get('/h/mcp.json'), plainMcp, 'mcp byte-unchanged');
  assert.equal(fs.files.get('/h/rules.md'), '# just notes\n', 'steering byte-unchanged');
});

test('a host whose unwire() throws HostFileAccessError is counted in failed and does NOT abort the sweep', async () => {
  const fs = fakeFs({ '/bad/mcp.json': wiredMcp, '/bad/rules.md': wiredSteer, '/ok/mcp.json': wiredMcp, '/ok/rules.md': wiredSteer });
  fs.failWrites.add('/bad/mcp.json'); // the bad host's mcp write throws
  const res = await unwireAllHosts({
    specs: [spec('bad', '/bad/mcp.json', '/bad/rules.md'), spec('ok', '/ok/mcp.json', '/ok/rules.md')],
    fs,
  });
  assert.deepEqual(res, { unwired: 1, failed: 1 }, 'the failing host is counted, the other still unwired');
  assert.equal('insrc' in JSON.parse(fs.files.get('/ok/mcp.json')!).mcpServers, false, 'the ok host was still unwired');
  assert.equal(fs.files.get('/bad/mcp.json'), wiredMcp, 'the failing host is left byte-unchanged (no partial write)');
});

test('runUninstall runs the sweep over HOST_SPECS + defaultHostFileSystem and never throws / never rejects', async () => {
  // Point HOME at a fresh empty temp dir so the real HOST_SPECS resolve to absent
  // files (a true no-op) — never the developer's real $HOME. The contract: never throws.
  const home = mkdtempSync(join(tmpdir(), 'insrc-uninstall-'));
  const prevHome = process.env.HOME;
  const prevProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    await assert.doesNotReject(() => runUninstall());
  } finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevProfile;
  }
});

test('source-scan: src/uninstall.ts carries NO vscode import (plain node) and imports only the hosts seams + node builtins (k5)', () => {
  const src = readFileSync(join(SRC, 'uninstall.ts'), 'utf8');
  assert.doesNotMatch(src, /from 'vscode'/, 'uninstall.ts must not import vscode (runs as a plain node script)');
  assert.doesNotMatch(src, /https?:\/\//, 'no cloud/HTTP path');
  const allowedNode = new Set(['node:url', 'node:fs', 'node:path', 'node:os']);
  for (const line of src.split('\n')) {
    const m = line.match(/from '([^']+)'/);
    if (!m) continue;
    const s = m[1]!;
    const ok = allowedNode.has(s) || s.startsWith('./hosts/');
    assert.ok(ok, `unexpected import ${s} (k5: only node builtins + the hosts seams)`);
  }
});
