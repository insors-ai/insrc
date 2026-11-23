import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { InstallerError, MAX_CONTROL_BYTES } from './contracts.js';
import { resolveInstallationLocation } from './location.js';
import { controlBinding } from './native.js';
import { parseInstaller, parseManagerRequest } from './schemas.js';
import { readBoundedFile } from './safe-zip.js';
import { parseReleaseDescriptor } from './release-descriptor.js';
import { InstallerManager } from './manager.js';
import { productionPeers } from './production-peers.js';
/** Ordinary CLI owns no prompts and cannot construct an install admission. */
export async function managerMain(args = process.argv.slice(2)): Promise<void> {
  let bytes = '';
  for await (const chunk of process.stdin) { bytes += String(chunk); if (Buffer.byteLength(bytes) > MAX_CONTROL_BYTES) throw new InstallerError('schema-invalid', 'Manager request exceeds bound'); if (bytes.includes('\n')) { if (bytes.slice(bytes.indexOf('\n') + 1).trim()) throw new InstallerError('schema-invalid', 'One manager request is allowed'); break; } }
  const request = parseManagerRequest(JSON.parse(bytes) as unknown);
  let home: string | undefined, installationId = 'default';
  for (let index = 0; index < args.length; index += 2) {
    const value = args[index + 1]; if (!value) throw new InstallerError('schema-invalid', 'Missing manager argument');
    if (args[index] === '--home') home = value; else if (args[index] === '--installation-id') installationId = value; else throw new InstallerError('schema-invalid', 'Unknown manager argument');
  }
  const location = resolveInstallationLocation(installationId, { home, ...(process.platform === 'win32' ? { userSid: controlBinding().userSid() } : {}) });
  // Bundled manager lives at release root. Source/out invocation is inspection
  // tooling only and cannot guess a release identity or obtain fake peers.
  const receipt = JSON.parse((await readBoundedFile(join(dirname(fileURLToPath(import.meta.url)), '.release.json'), 2 * 1024 * 1024)).toString('utf8')) as { manifest?: { target?: unknown } };
  const descriptor = parseReleaseDescriptor(receipt, { target: parseInstaller('target', receipt.manifest?.target) });
  const manager = new InstallerManager(location, descriptor.manifest.target, productionPeers(descriptor.manifest.target, location), event => process.stdout.write(JSON.stringify(event) + '\n'));
  process.stdout.write(JSON.stringify(await manager.execute(request)) + '\n');
}
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  managerMain().catch(error => { process.stderr.write(`${error instanceof InstallerError ? error.code : 'manager-failed'}: ${error instanceof Error ? error.message.slice(0, 4096) : 'Operation failed'}\n`); process.exitCode = 1; });
}
