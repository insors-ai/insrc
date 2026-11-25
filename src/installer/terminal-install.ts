import { randomUUID } from 'node:crypto';
import { InstallerError } from './contracts.js';
import type { Delivery, DependencyDecision, InstallationLocation, ManagerEvent, Target } from './contracts.js';
import { InstallerManager } from './manager.js';
import type { ManagerPeers } from './peer-contracts.js';
import { requireTerminal } from './terminal-admission.js';
import { parseInstaller } from './schemas.js';
import { launchInstalledTui, publishInstalledLauncher, retryCommand, selectInstalledTui } from './installed-launcher.js';
import type { TuiExit, TuiSelection } from './installed-launcher.js';

export interface TerminalUI {
  streams: Parameters<typeof requireTerminal>[0];
  ask(question: string): Promise<string>;
  write(message: string): void;
  close(): void;
}
export interface TerminalInstallOptions {
  location: InstallationLocation; target: Target; peers: ManagerPeers; ui: TerminalUI;
  operationId?: string | undefined;
  signal?: AbortSignal | undefined;
  select?: typeof selectInstalledTui | undefined;
  publish?: typeof publishInstalledLauncher | undefined;
  launch?: ((selection: TuiSelection) => Promise<TuiExit>) | undefined;
}
export interface TerminalOutcome { kind: 'completed' | 'cancelled' | 'already-completed' | 'failed' | 'post-install-tui-error'; code: number; event?: ManagerEvent | undefined; errorCode?: string | undefined }
const affirmative = (answer: string) => /^(y|yes)$/i.test(answer.trim());

/** All consent comes from this terminal, never machine request flags. */
export async function runTerminalInstall(options: TerminalInstallOptions): Promise<TerminalOutcome> {
  const { location, target, peers, ui } = options;
  const admission = requireTerminal(ui.streams), operationId = options.operationId ?? randomUUID();
  const manager = new InstallerManager(location, target, peers, event => ui.write(`${event.state.phase}${event.state.message ? ': ' + event.state.message : ''}\n`));
  let ready: ManagerEvent | undefined;
  const checkCancellation = () => { if (options.signal?.aborted) throw new InstallerError('cancelled', 'Installation cancelled'); };
  const ask = async (question: string, fallback = '') => {
    checkCancellation();
    const answer = (await ui.ask(question)).trim();
    checkCancellation();
    if (answer.length > 2048 || /[\x00-\x1f]/.test(answer)) throw new InstallerError('input-invalid', 'Terminal input exceeds its bound');
    return answer || fallback;
  };
  try {
    checkCancellation();
    const inspected = manager.inspect();
    if (inspected.kind === 'corrupt') throw new InstallerError('controller-corrupt', inspected.reason);
    if (inspected.kind === 'present' && inspected.snapshot.operation) throw new InstallerError('busy', 'An unfinished operation requires explicit reconciliation');
    if (inspected.kind === 'present' && inspected.snapshot.lastResult?.operationId === operationId) {
      const releaseId = inspected.snapshot.installation.activeReleaseId;
      ui.write(releaseId ? `This operation already completed. Open the installed TUI with:\n${retryCommand(location, target, releaseId)}\n` : 'This operation already completed.\n');
      return { kind: 'already-completed', code: 0 };
    }
    let delivery: Delivery, acceptedOfferId: string | undefined;
    const upgrading = inspected.kind === 'present' && !!inspected.snapshot.installation.activeReleaseId;
    if (upgrading) {
      delivery = inspected.snapshot.installation.delivery;
      ui.write(`Installed delivery: ${delivery.mode} ${delivery.repository}\n`);
      const offer = await manager.checkUpgrade();
      if (!offer) { ui.write('The selected installation is current.\n'); return { kind: 'already-completed', code: 0 }; }
      if (!affirmative(await ask(`Upgrade ${offer.currentReleaseId ?? 'installation'} to ${offer.candidateReleaseId}? [y/N] `))) return { kind: 'cancelled', code: 130 };
      acceptedOfferId = offer.offerId;
    } else {
      const mode = await ask('Delivery mode: bundle or dev [bundle]: ', 'bundle');
      if (mode !== 'bundle' && mode !== 'dev') throw new InstallerError('delivery-invalid', 'Choose bundle or dev');
      delivery = mode === 'bundle'
        ? { mode, repository: await ask('GitHub repository [insors-ai/insrc]: ', 'insors-ai/insrc'), channel: await ask('Release channel [stable]: ', 'stable') }
        : { mode, repository: await ask('Source repository URL: '), branch: await ask('Source branch: ') };
      parseInstaller('delivery', delivery);
      if (mode === 'dev' && !peers.dev) throw new InstallerError('capability-unavailable', 'Dev delivery requires the owning s2 adapter');
    }
    if (!peers.dependencies || !peers.lifecycle || !peers.migrations) throw new InstallerError('capability-unavailable', 'Dependency, lifecycle/readiness and migration adapters are required');
    const report = parseInstaller('dependencyReport', await peers.dependencies.inspect(location, { signal: options.signal }));
    checkCancellation();
    for (const recommendation of report.recommendations) ui.write(`${recommendation}\n`);
    if (!Object.values(report.agents).some(Boolean)) ui.write('Recommend installing at least one coding CLI: Claude Code, Codex or Mistral Vibe.\n');
    let decision: DependencyDecision | undefined;
    if (report.ollamaInstallOffer) {
      const offer = report.ollamaInstallOffer;
      decision = { offerId: offer.id, choice: affirmative(await ask(`Install and start Ollama ${offer.version} at ${offer.destination}? [y/N] `)) ? 'install' : 'decline' };
    }
    if (!affirmative(await ask(`${upgrading ? 'Upgrade' : 'Install'} this installation at ${location.home}? [y/N] `))) return { kind: 'cancelled', code: 130 };
    ready = upgrading
      ? await manager.upgradeFromTerminal(admission, { protocolVersion: 1, operationId, installationId: location.installationId, action: 'upgrade', acceptedOfferId: acceptedOfferId! }, decision, options.signal)
      : await manager.install(admission, operationId, delivery, decision, options.signal);
    checkCancellation();
    if (ready.state.phase !== 'ready' || ready.state.errorCode || !ready.state.candidateId) throw new InstallerError(ready.state.errorCode ?? 'installation-blocked', ready.state.message ?? 'Installation did not reach verified readiness');
  } catch (error) {
    const cancelled = error instanceof Error && (error.name === 'AbortError' || error.name === 'TerminalClosedError' || error instanceof InstallerError && error.code === 'cancelled');
    try { ui.write(cancelled ? `Installation cancelled.${ready?.state.message ? '\n' + ready.state.message : ''}\n` : `${error instanceof InstallerError ? error.code : 'install-failed'}: ${error instanceof Error ? error.message : 'Installation failed'}\n`); } catch { /* The terminal may already be closed; never retry the operation. */ }
    return { kind: cancelled ? 'cancelled' : 'failed', code: cancelled ? 130 : 1, event: ready, errorCode: error instanceof InstallerError ? error.code : undefined };
  } finally { ui.close(); }
  // Manager returned only after ready commit and native lock release. No
  // subsequent launcher/TUI failure may rewrite that completed installation.
  try {
    checkCancellation();
    const selected = await (options.select ?? selectInstalledTui)(location, target, peers, ready);
    checkCancellation();
    (options.publish ?? publishInstalledLauncher)(location, target, ready.state.candidateId!, ready);
    const exit = await (options.launch ?? launchInstalledTui)(selected);
    if (exit.code !== 0 || exit.signal) throw new InstallerError('post-install-tui-error', 'The TUI ended unsuccessfully');
    return { kind: 'completed', code: 0, event: ready };
  } catch (error) {
    if (error instanceof InstallerError && error.code === 'cancelled') return { kind: 'cancelled', code: 130, event: ready, errorCode: error.code };
    try { ui.write(`Installation completed; the TUI could not open. Retry without reinstalling:\n${retryCommand(location, target, ready.state.candidateId!)}\n`); } catch { /* Completed selection survives terminal loss too. */ }
    return { kind: 'post-install-tui-error', code: 1, event: ready, errorCode: error instanceof InstallerError ? error.code : 'post-install-tui-error' };
  }
}
