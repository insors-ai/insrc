import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { get } from 'node:https';
import { createHash } from 'node:crypto';
import { runtimeArchive, runtimePolicy } from '../runtime-policy.js';
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const targets = Object.keys(runtimePolicy.archives) as (keyof typeof runtimePolicy.archives)[];
/** Official byte fixtures, like _runtime-fixture.ts. Cache only; no target
 * executable is launched and no installed runtime or policy is written. */
export async function officialInputs(): Promise<string> {
  const directory = join(fs.realpathSync(tmpdir()), 'insrc-test-runtime-profiles-22.22.1');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const assets = targets.map(key => {
    const archive = runtimeArchive({ os: key.split('-')[0] as 'darwin' | 'linux' | 'win32', arch: key.split('-')[1] as 'arm64' | 'x64' });
    return { ...archive, bytes: runtimePolicy.profiles[key].archiveBytes };
  }).concat([runtimePolicy.supplemental.headers, ...Object.values(runtimePolicy.supplemental.libraries)].map(asset => ({ ...asset, root: '' })));
  for (const asset of assets) {
    const relative = new URL(asset.url).pathname.split('/v22.22.1/')[1]!;
    const file = join(directory, relative);
    if (fs.existsSync(file)) { assert.equal(sha(fs.readFileSync(file)), asset.sha256); continue; }
    fs.mkdirSync(join(file, '..'), { recursive: true, mode: 0o700 });
    let request: ReturnType<typeof get> | undefined, closed: Promise<void> | undefined;
    try {
      const bytes = await new Promise<Buffer>((resolve, reject) => {
        request = get(asset.url, { agent: false, signal: AbortSignal.timeout(60_000) }, response => {
          if (response.statusCode !== 200) { response.resume(); reject(Error('Official runtime fixture HTTP failure')); return; }
          const chunks: Buffer[] = []; let count = 0;
          response.on('error', reject);
          response.on('data', (chunk: Buffer) => { count += chunk.length; if (count > asset.bytes) response.destroy(Error('Runtime fixture grew')); else chunks.push(chunk); });
          response.on('end', () => resolve(Buffer.concat(chunks)));
        });
        closed = new Promise<void>(resolve => request!.once('close', resolve)); request.on('error', reject);
      });
      assert.equal(bytes.length, asset.bytes); assert.equal(sha(bytes), asset.sha256);
      fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
    } finally { request?.destroy(); await closed; }
  }
  return directory;
}
