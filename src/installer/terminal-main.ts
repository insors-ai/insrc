import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { requireTerminal } from './terminal-admission.js';
import { InstallerError } from './contracts.js';
import { resolveInstallationLocation, assertToken } from './location.js';
import { controlBinding } from './native.js';
import { parseInstaller } from './schemas.js';
import { productionPeers } from './production-peers.js';
import { resolveControlRuntime } from './runtime-binding.js';
import { privateRuntimeIdentity } from './runtime-policy.js';
import { canonicalJson } from './release-descriptor.js';
import { DevWorkerInput, executeDevWorker } from './dev-worker.js';
import { createDevPreparationWork, verifyDevPayload } from './dev-payload.js';
import { join } from 'node:path';
import { runTerminalInstall } from './terminal-install.js';
import { terminalAbort } from './terminal-abort.js';
import { InstallerManager } from './manager.js';
import { executeOllamaServiceWorker } from './ollama-service-worker.js';
import { launchInstalledTui, selectInstalledTui } from './installed-launcher.js';
/** Substituted only by the digest-bound release publisher, never wire/env input. */
declare const __INSRC_INSTALLER_TARGET__: unknown;
export async function terminalMain(args = process.argv.slice(2)): Promise<void> {
  if (args[0] === '--bootstrap-publication') {
    if (typeof __INSRC_INSTALLER_TARGET__ === 'undefined') throw new InstallerError('target-unqualified', 'Use the target-specific control bootstrap');
    const abort = new AbortController(), cancel = () => abort.abort(new InstallerError('cancelled', 'Bootstrap publication interrupted'));
    process.once('SIGINT', cancel); process.once('SIGTERM', cancel); process.once('SIGHUP', cancel);
    try {
      const { publishBootstrapFoundation } = await import('./bootstrap-foundation.js');
      await publishBootstrapFoundation(parseInstaller('target', __INSRC_INSTALLER_TARGET__), args.slice(1), abort.signal);
      abort.signal.throwIfAborted();
      process.exit(0);
    } catch (error) {
      process.stderr.write(`${error instanceof InstallerError ? error.code : 'bootstrap-failed'}: ${error instanceof Error ? error.message : 'Bootstrap publication failed'}\n`);
      process.exit(1);
    } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); process.removeListener('SIGHUP', cancel); }
  }
  if (args[0] === '--ollama-service-worker') {
    if (args.length !== 4 || !args[1] || !args[2] || !args[3]) throw new InstallerError('schema-invalid', 'Service worker requires installation home, identity and attempt record');
    if (typeof __INSRC_INSTALLER_TARGET__ === 'undefined') throw new InstallerError('target-unqualified', 'Use the target-specific control bootstrap');
    const target = parseInstaller('target', __INSRC_INSTALLER_TARGET__);
    assertToken(args[2]);
    const location = resolveInstallationLocation(args[2], { home: args[1], ...(process.platform === 'win32' ? { userSid: controlBinding().userSid() } : {}) });
    await executeOllamaServiceWorker(location, args[3], { target });
    return;
  }
  if (args[0] === '--dev-preparation-worker') {
    if (args.length !== 2 || !args[1]) throw new InstallerError('schema-invalid', 'Worker requires one explicit installation home');
    if (typeof __INSRC_INSTALLER_TARGET__ === 'undefined') throw new InstallerError('target-unqualified', 'Use the target-specific control bootstrap');
    const target = parseInstaller('target', __INSRC_INSTALLER_TARGET__);
    const channel = new DevWorkerInput(process.stdin);
    try {
      const launch = await channel.launch, record = launch.checkpoint;
      if (canonicalJson(record.sourceOffer.target) !== canonicalJson(target)) throw new InstallerError('identity-mismatch', 'Worker checkpoint targets another control build');
      const location = resolveInstallationLocation(record.installationId, { home: args[1], ...(process.platform === 'win32' ? { userSid: controlBinding().userSid() } : {}) });
      await resolveControlRuntime(location, record.sourceOffer.runtime, { signal: channel.controller.signal });
      const predecessor = record.predecessorId ? (await verifyDevPayload(join(location.home, 'releases', record.predecessorId), target, location)).receipt : undefined;
      await executeDevWorker(location.home, launch, { signal: channel.controller.signal, environment: process.env,
        work: createDevPreparationWork(location, record, { ...(predecessor ? { predecessor } : {}) }) });
    } finally { channel.dispose(); }
    return;
  }
  requireTerminal();
  if (typeof __INSRC_INSTALLER_TARGET__ === 'undefined') throw new InstallerError('target-unqualified', 'Use the published target-specific installer');
  const target = parseInstaller('target', __INSRC_INSTALLER_TARGET__);
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
  const runtime = await resolveControlRuntime(location, privateRuntimeIdentity(target));
  const peers = productionPeers(target, location, runtime);
  if (retry) {
    const manager = new InstallerManager(location, target, peers);
    const ready = await manager.execute({ protocolVersion: 1, operationId: randomUUID(), installationId, action: 'start' });
    const selected = await selectInstalledTui(location, target, peers, ready);
    const exit = await launchInstalledTui(selected); process.exitCode = exit.code ?? 1; return;
  }
  const terminal = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const abort = terminalAbort(terminal, message => { process.stdout.write(message); });
  try {
    const result = await runTerminalInstall({ location, target, peers, operationId, signal: abort.signal, ui: {
      streams: process, ask: question => terminal.question(question, { signal: abort.signal }),
      write: message => { process.stdout.write(message); }, close: () => abort.close(),
    } });
    process.exitCode = result.code;
  } finally { abort.dispose(); }
}
