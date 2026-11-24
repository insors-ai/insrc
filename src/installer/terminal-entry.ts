import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { requireTerminal } from './terminal-admission.js';
import { InstallerError, PRIVATE_NODE_VERSION } from './contracts.js';
import { resolveInstallationLocation, assertToken } from './location.js';
import { controlBinding } from './native.js';
import { parseInstaller } from './schemas.js';
import { productionPeers } from './production-peers.js';
import { runTerminalInstall } from './terminal-install.js';
import { InstallerManager } from './manager.js';
import { launchInstalledTui, selectInstalledTui } from './installed-launcher.js';
/** Substituted only by the digest-bound release publisher, never wire/env input. */
declare const __INSRC_INSTALLER_TARGET__: unknown;
export async function terminalMain(args = process.argv.slice(2)): Promise<void> {
  requireTerminal();
  if (typeof __INSRC_INSTALLER_TARGET__ === 'undefined') throw new InstallerError('target-unqualified', 'Use the published target-specific installer');
  const target = parseInstaller('target', __INSRC_INSTALLER_TARGET__);
  if (process.version !== `v${PRIVATE_NODE_VERSION}` || process.platform !== target.os || process.arch !== target.arch) throw new InstallerError('runtime-invalid', 'The published private runtime target is required');
  let home: string | undefined, installationId = 'default', operationId: string | undefined, retry = false;
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === '--launch-tui') { if (retry) throw new InstallerError('schema-invalid', 'Duplicate launcher flag'); retry = true; continue; }
    const value = args[++index]; if (!value) throw new InstallerError('schema-invalid', 'Missing terminal installer argument');
    if (key === '--home') home = value;
    else if (key === '--installation-id') installationId = value;
    else if (key === '--operation-id') operationId = value;
    else throw new InstallerError('schema-invalid', 'Unknown terminal installer argument');
  }
  assertToken(installationId); if (operationId) assertToken(operationId);
  const location = resolveInstallationLocation(installationId, { home, ...(process.platform === 'win32' ? { userSid: controlBinding().userSid() } : {}) });
  const peers = productionPeers(target, location);
  if (retry) {
    const manager = new InstallerManager(location, target, peers);
    const ready = await manager.execute({ protocolVersion: 1, operationId: randomUUID(), installationId, action: 'start' });
    const selected = await selectInstalledTui(location, target, peers, ready);
    const exit = await launchInstalledTui(selected); process.exitCode = exit.code ?? 1; return;
  }
  const terminal = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let closing = false;
  const abort = new AbortController(); terminal.on('close', () => { if (!closing) abort.abort(); }); terminal.on('SIGINT', () => { abort.abort(); terminal.close(); });
  const result = await runTerminalInstall({ location, target, peers, operationId, signal: abort.signal, ui: {
    streams: process, ask: question => terminal.question(question, { signal: abort.signal }),
    write: message => { process.stdout.write(message); }, close: () => { closing = true; terminal.close(); },
  } });
  process.exitCode = result.code;
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  terminalMain().catch(error => { process.stderr.write(`${error instanceof InstallerError ? error.code : 'install-failed'}: ${error instanceof Error ? error.message : 'Installation failed'}\n`); process.exitCode = 1; });
}
