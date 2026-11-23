import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { get } from 'node:https';
import { existsSync, readFileSync, writeFileSync, realpathSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { assertSupportedVersion } from '../../../scripts/test-harness/context.mjs';
import { runtimeArchive } from '../runtime-policy.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
import type { ChildProcess } from 'node:child_process';
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
export async function archiveFixture(): Promise<string> {
  if (process.platform !== 'darwin' && process.platform !== 'linux' && process.platform !== 'win32') throw new Error('POSIX fixture requires native Linux/macOS; Windows qualification is separate');
  if (process.arch !== 'arm64' && process.arch !== 'x64') throw new Error('Unsupported fixture architecture');
  const archive = runtimeArchive({ os: process.platform, arch: process.arch });
  const cache = join(realpathSync(tmpdir()), `insrc-test-node-${archive.sha256}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`);
  if (existsSync(cache) && sha(readFileSync(cache)) === archive.sha256) return cache;
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    const request = get(archive.url, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('Official Node fixture download failed')); return; }
      const chunks: Buffer[] = []; let length = 0;
      response.on('data', (chunk: Buffer) => { length += chunk.length; if (length > 100 * 1024 * 1024) request.destroy(new Error('Fixture archive too large')); else chunks.push(chunk); });
      response.on('error', reject); response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.setTimeout(60_000, () => request.destroy(new Error('Fixture download timeout'))); request.on('error', reject);
  });
  assert.equal(sha(bytes), archive.sha256); writeFileSync(cache, bytes, { mode: 0o600 }); return cache;
}

/** Validator may run under a foreign host Node. Provision a verified fixture Node
 * before creating any coordinator; never relax its runtime admission. */
export async function node22Fixture(): Promise<{ executable: string; cleanup: () => void }> {
  try { assertSupportedVersion(process.version); return { executable: process.execPath, cleanup() {} }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'harness-runtime-unsupported') throw error; }
  const archive = await archiveFixture();
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'insrc-fixture-node-')), children: ChildProcess[] = [];
  try {
    const identity = runtimeArchive({ os: process.platform as 'darwin' | 'linux' | 'win32', arch: process.arch as 'arm64' | 'x64' });
    const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
    const child = process.platform === 'win32'
      ? spawnFixture('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(root)}`], { stdio: 'ignore' })
      : spawnFixture('tar', ['-xzf', archive, '-C', root, `${identity.root}/bin/node`], { stdio: 'ignore' });
    children.push(child); const [code] = await once(child, 'close'); assert.equal(code, 0);
    return { executable: join(root, identity.root, process.platform === 'win32' ? 'node.exe' : 'bin/node'), cleanup: () => rmSync(root, { recursive: true, force: true }) };
  } catch (error) { rmSync(root, { recursive: true, force: true }); throw error; }
  finally { await stopOwnedChildren(children); }
}
