import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { ZipFile } from 'yazl';
import { zstdCompressSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { dependencyReadIo, inspectDependencies, inspectDependenciesClosed } from '../dependencies.js';
import type { DependencyOptions } from '../dependencies.js';
import { createDependencyOperationContext } from '../dependency-context.js';
import { digest } from '../release-descriptor.js';
import { ollamaPolicySha256 } from '../ollama-policy.js';
import type { OllamaPolicy } from '../ollama-policy.js';
import type { Target } from '../contracts.js';
import { resolveInstallationLocation } from '../location.js';
import { controlBinding } from '../native.js';
import { devRuntimeFixture } from './_dev-runtime-fixture.js';

export function fixtureExecutable(target: Target): Buffer {
  const bytes = Buffer.alloc(512), arm = target.arch === 'arm64';
  if (target.os === 'darwin') { bytes.writeUInt32LE(0xfeedfacf); bytes.writeUInt32LE(arm ? 0x0100000c : 0x01000007, 4); bytes.writeUInt32LE(2, 12); }
  if (target.os === 'linux') { bytes.set([127, 69, 76, 70, 2, 1, 1]); bytes.writeUInt16LE(3, 16); bytes.writeUInt16LE(arm ? 183 : 62, 18); }
  if (target.os === 'win32') { bytes.write('MZ'); bytes.writeUInt32LE(128, 60); bytes.writeUInt32LE(0x4550, 128); bytes.writeUInt16LE(arm ? 0xaa64 : 0x8664, 132); bytes.writeUInt16LE(240, 148); bytes.writeUInt16LE(2, 150); bytes.writeUInt16LE(0x20b, 152); }
  return bytes;
}
const tar = createRequire(import.meta.url)('tar-stream') as { pack(): Readable & { entry(header: object, data: Buffer): void; finalize(): void } };
export function qualifyFixturePolicy(policy: OllamaPolicy): OllamaPolicy {
  const copy = structuredClone(policy); copy.qualification = { policySha256: ollamaPolicySha256(copy), native: true, evidence: 'fixtures/not-native-evidence.json', checks: { version: true, readiness: true, reuse: true, decline: true, userOnly: true } }; return copy;
}
/** No native Ollama executable is run here. Real native qualification is t9. */
export async function ollamaFixture(installationId = 'ollama-preparation', contents: { executable?: Buffer; files?: Array<{ path: string; bytes: Buffer; mode: number }>; prefix?: string } = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), contents.prefix ?? 'iop-')), home = join(root, 'home'), bin = join(root, 'bin');
  mkdirSync(home, { mode: 0o700 }); mkdirSync(bin, { mode: 0o700 }); if (process.platform === 'win32') { controlBinding().protect(root); controlBinding().protect(home); }
  const target: Target = { os: process.platform as Target['os'], arch: process.arch as Target['arch'], baseline: 'fixture' };
  const executable = target.os === 'win32' ? 'ollama.exe' : target.os === 'darwin' ? 'Ollama.app/Contents/Resources/ollama' : 'bin/ollama';
  const files = [{ path: executable, bytes: contents.executable ?? fixtureExecutable(target), mode: 0o755 }, { path: 'lib/data.dat', bytes: Buffer.alloc(4096, 1), mode: 0o644 }, ...(contents.files ?? [])], parts: Buffer[] = [];
  if (target.os === 'linux') {
    const output = tar.pack(); for (const file of files) output.entry({ name: file.path, mode: file.mode }, file.bytes); output.finalize(); for await (const part of output) parts.push(Buffer.from(part));
  } else {
    const output = new ZipFile(); output.outputStream.on('data', (part: Buffer) => parts.push(part)); const done = once(output.outputStream, 'end');
    // Large native process fixtures use stored ZIP members; decoder boundary
    // coverage belongs to archive tests, not worker dispatch qualification.
    for (const file of files) output.addBuffer(file.bytes, file.path, { mode: 0o100000 | file.mode, compress: file.bytes.length < 1024 * 1024 }); output.end(); await done;
  }
  const bytes = target.os === 'linux' ? zstdCompressSync(Buffer.concat(parts)) : Buffer.concat(parts);
  const server = createServer((_request, response) => response.end('{"version":"0.0.1-fixture"}'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address === 'object');
  const port = address.port, endpoint = `http://127.0.0.1:${port}`; await new Promise<void>(resolve => server.close(() => resolve()));
  writeFileSync(join(home, 'config.json'), JSON.stringify({ models: { local: { host: endpoint } } })); writeFileSync(join(home, 'application-data'), 'retain');
  const location = resolveInstallationLocation(installationId, { home });
  let policy: OllamaPolicy = qualifyFixturePolicy({ schemaVersion: 1, target, version: '0.0.1-fixture',
    asset: { url: `https://github.com/ollama/ollama/releases/download/v0.0.1-fixture/ollama.${target.os === 'linux' ? 'tar.zst' : 'zip'}`, sha256: digest(bytes), bytes: bytes.length, format: target.os === 'linux' ? 'tar.zst' : 'zip' },
    limits: { expandedBytes: Math.max(1024 * 1024, files.reduce((n, file) => n + file.bytes.length, 0) * 2), fileBytes: Math.max(512 * 1024, ...files.map(file => file.bytes.length)), files: 128, windowBytes: 2 ** 25 }, layout: { executable, requiredFiles: [executable, 'lib/data.dat'], aliases: [] },
    endpoint, modelsRelativePath: 'deps/ollama/data/models', logsRelativePath: 'deps/ollama/logs/server', start: true });
  const { runtime } = await devRuntimeFixture(home, target, installationId);
  const options: DependencyOptions = { runtime,
    userHome: root, environment: { PATH: bin }, policies: [policy], io: { ...dependencyReadIo, async stat(file) {
      const path = relative(root, file); if (path === '..' || path.startsWith('../') || path.startsWith('..\\')) throw Object.assign(new Error('fixture absence'), { code: 'ENOENT' }); return dependencyReadIo.stat(file);
    } } };
  let owned = true;
  const context = (nonce = 'a'.repeat(64), signal?: AbortSignal) => createDependencyOperationContext(location, target.os, { operationId: 'prepare-operation', attemptNonce: nonce, signal,
    assertCurrent() { if (!owned) throw new Error('fixture manager ownership lost'); }, progress() {} });
  const recheck = (signal: AbortSignal) => inspectDependenciesClosed(location, target, options, { signal });
  const input = async () => { const result = await inspectDependencies(location, target, options); assert.ok(result.offer, JSON.stringify(result.report)); return { policy: result.policy!, offer: result.offer }; };
  return { root, home, bin, target, location, bytes, policy, options, server, endpoint, port, context, recheck, input,
    setPolicy(value: OllamaPolicy) { policy = qualifyFixturePolicy(value); options.policies = [policy]; },
    loseOwner() { owned = false; }, transport: async () => ({ status: 200, body: Readable.from([bytes]) }),
    async cleanup() { if (server.listening) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } rmSync(root, { recursive: true, force: true }); } };
}
