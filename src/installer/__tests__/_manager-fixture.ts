import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest } from '../release-descriptor.js';
import { resolveInstallationLocation } from '../location.js';
import { ControllerStore } from '../controller-store.js';
import { InstallerManager } from '../manager.js';
import type { ManagerPeers, LaunchAdmission, MigrationExitReceipt, ShutdownRequest, DaemonObservation } from '../peer-contracts.js';
import type { PreparedCandidate } from '../bundle.js';
import type { Target, ManagerEvent } from '../contracts.js';
export function managerFixture(existingHome?: string) {
  const home = existingHome ?? mkdtempSync(join(realpathSync(tmpdir()), 'insrc-mgr-'));
  const location = resolveInstallationLocation('fixture', { home });
  const target: Target = { os: process.platform as Target['os'], arch: process.arch as Target['arch'], baseline: 'fixture' };
  const candidate = (releaseId: string): PreparedCandidate => ({ releaseId, directory: join(home, 'releases', releaseId), descriptorSha256: digest(releaseId + 'descriptor'), inventorySha256: digest(releaseId + 'inventory'), payloadSha256: digest(releaseId + 'payload'), manifest: { schemaVersion: 1, releaseId, sourceCommit: 'a'.repeat(40), target, runtime: { version: '22.22.1', target, sha256: 'b'.repeat(64), relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' }, payloadSha256: digest(releaseId + 'payload'), daemonEntry: 'out/daemon/index.js', managerEntry: 'manager.mjs', tuiEntry: 'out/cli/index.js', protocolVersion: 1, compatiblePredecessors: ['old'], migrations: [] } });
  const old = candidate('old'), next = candidate('next');
  if (!existingHome) {
    for (const item of [old, next]) { mkdirSync(item.directory, { recursive: true, mode: 0o700 }); writeFileSync(join(item.directory, 'marker'), item.releaseId); }
    const store = ControllerStore.acquire(location);
    store.commit({ schemaVersion: 1, revision: 0, installation: { schemaVersion: 1, installationId: 'fixture', dataHome: home, activeReleaseId: 'old', delivery: { mode: 'bundle', repository: 'insors-ai/insrc', channel: 'stable' } }, lastResult: { operationId: 'previous', phase: 'ready', candidateId: 'old' } }, null); store.close();
  }
  const identity = { protocolVersion: 1 as const, installationId: 'fixture', instanceId: 'incumbent', releaseId: 'old', state: 'ready' as const };
  const state = { shutdowns: [] as ShutdownRequest[], migrations: [] as LaunchAdmission[], activations: [] as LaunchAdmission[], ownership: 'released' as 'released' | 'held' | 'unknown', receipt: undefined as MigrationExitReceipt | undefined, journalValidated: true, allowRetry: false, missingReceipt: false, badReady: false, observation: { state: 'present', identity, endpoint: location.daemonEndpoint } as DaemonObservation };
  const peers: ManagerPeers = {
    bundle: {
      async resolve() { return { manifest: next.manifest, descriptorSha256: next.descriptorSha256 }; },
      async prepare() { return next; }, async open(_location, id) { return id === 'old' ? old : next; },
      async verify(item) { if (readFileSync(join(item.directory, 'marker'), 'utf8') !== item.releaseId) throw new Error('immutable candidate mismatch'); },
    },
    dependencies: { async inspect() { return { runtimeReady: true, ollama: 'ready', agents: { claude: false, codex: false, vibe: false }, recommendations: ['Install an agent CLI'], blockers: [] }; }, async decide() { return this.inspect(location); } },
    lifecycle: {
      async observe() { return state.observation; },
      async shutdown(_location, request) { state.shutdowns.push(request); return { operationId: request.operationId, instanceId: request.expectedInstanceId, accepted: true, mode: request.mode }; },
      async waitShutdownCompletion(_location, request) { return { operationId: request.operationId, instanceId: request.expectedInstanceId, completionNonce: request.completionNonce, resourceOwnershipReleased: true }; },
      async reconcileShutdown(_location, request) { return this.waitShutdownCompletion(_location, request); },
      async launchMigration(_candidate, admission, assertOwner) { assertOwner(); state.migrations.push(admission); state.receipt = { ...admission, purpose: 'migration', exitCode: 0, signal: null }; },
      async readMigrationExitReceipt() { if (state.missingReceipt || !state.receipt) throw new Error('missing migration receipt'); return state.receipt; },
      async migrationOwnership() { return state.ownership; },
      async activate(_candidate, admission, assertOwner) { assertOwner(); state.activations.push(admission); return { identity: { protocolVersion: 1, installationId: 'fixture', instanceId: admission.childInstanceId, releaseId: state.badReady ? 'wrong' : admission.candidateReleaseId, state: 'ready' }, endpoint: location.daemonEndpoint, sessionId: admission.sessionId, completionNonce: admission.completionNonce, candidateInventorySha256: admission.candidateInventorySha256 }; },
      async reconcileActivation(_candidate, admission) { return this.activate(_candidate, admission, () => {}); },
    },
    migrations: {
      async waitForJournal(_candidate, admission) { return { installationId: 'fixture', operationId: admission.operationId, candidateReleaseId: admission.candidateReleaseId, candidateInventorySha256: admission.candidateInventorySha256, sessionId: admission.sessionId, validated: state.journalValidated, hooks: [] }; },
      async reconcileJournal(_candidate, admission) { return this.waitForJournal(_candidate, admission); }, async allowRetry() { return state.allowRetry; }, async verifyInstalled() { return true; },
    },
  };
  const manager = (progress?: (event: ManagerEvent) => void) => new InstallerManager(location, target, peers, progress);
  return { home, location, target, old, next, peers, state, manager, cleanup() { if (!existingHome) rmSync(home, { recursive: true, force: true }); } };
}
