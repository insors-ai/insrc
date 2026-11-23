/** Installer-only wire contracts. No application boot, storage or provider imports. */
export const PRIVATE_NODE_VERSION = '22.22.1';
export const BRIDGE_PROTOCOL_VERSION = 2;
export const BRIDGE_HANDSHAKE_MS = 3_000;
export const MAX_CONTROL_BYTES = 64 * 1024;
export const MAX_BRIDGE_BYTES = 16 * 1024 * 1024;

export type Delivery = { mode: 'bundle'; repository: string; channel: string }
  | { mode: 'dev'; repository: string; branch: string };
export interface Target { os: 'darwin' | 'linux' | 'win32'; arch: 'arm64' | 'x64'; baseline: string }
export interface RuntimeIdentity { version: string; target: Target; sha256: string; relativeExecutable: string }
export interface HookReference { id: string; version: string; module: string }
export interface ReleaseManifest {
  schemaVersion: 1; releaseId: string; sourceCommit: string; target: Target; runtime: RuntimeIdentity;
  payloadSha256: string; daemonEntry: string; managerEntry: string; tuiEntry: string; protocolVersion: 1;
  compatiblePredecessors: string[]; migrations: HookReference[];
}
export interface Installation {
  schemaVersion: 1; installationId: string; dataHome: string; delivery: Delivery;
  activeReleaseId?: string | undefined; operationId?: string | undefined;
}
export type ManagerAction = 'inspect' | 'check-upgrade' | 'install' | 'upgrade' | 'start' | 'stop' | 'restart' | 'retry-migration';
export type IdeManagerAction = Exclude<ManagerAction, 'install'>;
export type Phase = 'preparing' | 'quiescing' | 'migrating' | 'activating' | 'ready' | 'stopped' | 'blocked';
export interface ManagerRequest {
  protocolVersion: 1; operationId: string; action: ManagerAction; installationId: string;
  shutdownMode?: 'graceful' | 'immediate' | undefined; acceptedOfferId?: string | undefined; installOllama?: boolean | undefined;
}
export interface OperationRecord {
  operationId: string; phase: Phase; predecessorId?: string | undefined; candidateId?: string | undefined;
  hookId?: string | undefined; hookStage?: 'check' | 'run' | 'test' | undefined;
  errorCode?: string | undefined; message?: string | undefined;
}
export interface ManagerEvent { protocolVersion: 1; operationId: string; kind: 'progress' | 'result'; state: OperationRecord; retryable: boolean }
export interface UpgradeOffer { offerId: string; installationId: string; currentReleaseId?: string | undefined; candidateReleaseId: string; delivery: Delivery }
export interface DependencyReport {
  runtimeReady: boolean; ollama: 'ready' | 'installed-not-running' | 'missing' | 'unavailable';
  ollamaInstallOffer?: { id: string; destination: string; version: string } | undefined;
  agents: { claude: boolean; codex: boolean; vibe: boolean }; recommendations: string[]; blockers: string[];
}
export interface DependencyDecision { offerId: string; choice: 'install' | 'decline' }
export interface MigrationContext { installationId: string; operationId: string; fromReleaseId?: string | undefined; toReleaseId: string; dataHome: string }
export interface HookDecision { needed: boolean; reason: string }
export interface HookValidation { passed: boolean; detail: string }
export interface UpgradeHook {
  check(context: MigrationContext): Promise<HookDecision>;
  run(context: MigrationContext): Promise<void>;
  test(context: MigrationContext): Promise<HookValidation>;
}
export interface LocalEndpoint { kind: 'unix' | 'named-pipe'; address: string; installationId: string }
export interface InstallationLocation { home: string; installationId: string; daemonEndpoint: LocalEndpoint }
export interface IpcBridgeRequest { protocolVersion: 1; endpoint: LocalEndpoint; rpcFrame: string }
export interface IpcBridgeEvent { kind: 'frame' | 'closed' | 'error'; frame?: string | undefined; written?: boolean | undefined; code?: string | undefined }
export interface BridgeHello { kind: 'hello'; protocolVersion: 2; sessionNonce: string }
export interface BridgeReady { kind: 'ready'; protocolVersion: 2; sessionNonce: string }
export type BridgeCommand = { kind: 'send'; transportId: string; request: IpcBridgeRequest } | { kind: 'cancel'; transportId: string };
export interface BridgeEvent {
  transportId: string; kind: 'written' | 'cancelled' | 'frame' | 'closed' | 'error';
  written?: boolean | undefined; frame?: string | undefined; code?: string | undefined;
}
/** Implementations belong to the later controller/transport tasks, not these schemas. */
export interface OperationEscalation { escalateShutdown(request: ManagerRequest): Promise<ManagerEvent> }
export interface BridgeTransport {
  bridgeHandshake(request: BridgeHello): Promise<BridgeReady>;
  controlBridge(command: BridgeCommand): AsyncIterable<BridgeEvent>;
}
export interface TerminalInstallLaunch {
  operationId: string; installationId: string; home: string; platform: 'posix' | 'powershell';
  scriptPath: string; scriptVersion: string; scriptSha256: string; arguments: string[];
  terminalName: 'Insrc Installation'; onInstallSuccess: 'launch-tui';
}
export interface TerminalInstallHandle { operationId: string; terminalSessionId: string; state: 'opened' | 'reused' | 'launch-failed' }
export interface InstallationObservation { operationId: string; phase: Phase; daemonReady: boolean; errorCode?: string | undefined }
export interface ControllerSnapshot {
  schemaVersion: 1; revision: number; installation: Installation;
  operation?: OperationRecord | undefined; lastResult?: OperationRecord | undefined;
}

export class InstallerError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options); this.name = 'InstallerError';
  }
}
