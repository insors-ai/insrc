import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { InstallerError, MAX_CONTROL_BYTES } from './contracts.js';
import { resolveInstallationLocation } from './location.js';
import { controlBinding } from './native.js';
import { parseInstaller, parseManagerRequest } from './schemas.js';
import { canonicalJson } from './release-descriptor.js';
import { parseDevDelivery } from './dev.js';
import { readInstalledReceipt } from './installed-receipt.js';
import { InstallerManager } from './manager.js';
import { controlRuntimeDirectory, productionPeers } from './production-peers.js';
declare const __INSRC_INSTALLER_TARGET__: unknown;
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
  if (typeof __INSRC_INSTALLER_TARGET__ === 'undefined') throw new InstallerError('target-unqualified', 'Use the installed manager for this platform');
  const target = parseInstaller('target', __INSRC_INSTALLER_TARGET__); controlRuntimeDirectory(target);
  const directory = dirname(fileURLToPath(import.meta.url)), installed = await readInstalledReceipt(directory, target);
  if (realpathSync(process.execPath) !== realpathSync(join(directory, 'tools/node', installed.manifest.runtime.relativeExecutable))) throw new InstallerError('runtime-invalid', 'Installed manager requires its own release runtime');
  const manager = new InstallerManager(location, target, productionPeers(target, location), event => process.stdout.write(JSON.stringify(event) + '\n'));
  const current = manager.inspect();
  if (current.kind === 'present' && (current.snapshot.installation.delivery.mode !== installed.mode
    || (current.snapshot.installation.activeReleaseId !== undefined && current.snapshot.installation.activeReleaseId !== installed.manifest.releaseId)
    || (installed.mode === 'dev' && canonicalJson(parseDevDelivery(current.snapshot.installation.delivery)) !== canonicalJson(installed.receipt.sourceOffer.delivery)))) throw new InstallerError('candidate-conflict', 'Installed receipt differs from the selected controller delivery/release');
  process.stdout.write(JSON.stringify(await manager.execute(request)) + '\n');
}
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  managerMain().catch(error => { process.stderr.write(`${error instanceof InstallerError ? error.code : 'manager-failed'}: ${error instanceof Error ? error.message.slice(0, 4096) : 'Operation failed'}\n`); process.exitCode = 1; });
}
