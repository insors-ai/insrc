import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import { InstallerError, MAX_BRIDGE_BYTES, MAX_CONTROL_BYTES, PRIVATE_NODE_VERSION } from './contracts.js';
import type * as C from './contracts.js';
import { assertRelativeFile, normalizeHome } from './location.js';

const text = (maxLength = 4096) => ({ type: 'string', minLength: 1, maxLength, pattern: '^[^\\u0000-\\u001f\\u007f]+$' });
const token = { ...text(128), pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' };
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const file = text(1024);
const version = { const: 1 };
const boolean = { type: 'boolean' };
const list = (items: object, maxItems = 512) => ({ type: 'array', items, maxItems });
const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const enumeration = (...values: string[]) => ({ enum: values });
const target = object({ os: enumeration('darwin', 'linux', 'win32'), arch: enumeration('arm64', 'x64'), baseline: text(128) });
const runtime = object({ version: { const: PRIVATE_NODE_VERSION }, target, sha256: hash, relativeExecutable: file });
const delivery = { oneOf: [object({ mode: { const: 'bundle' }, repository: { ...text(256), pattern: '^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$' }, channel: token }), object({ mode: { const: 'dev' }, repository: text(2048), branch: text(1024) })] };
const hook = object({ id: token, version: token, module: file });
const endpoint = object({ kind: enumeration('unix', 'named-pipe'), address: text(512), installationId: token });
const phase = enumeration('preparing', 'quiescing', 'migrating', 'activating', 'ready', 'stopped', 'blocked');
const operation = object({ operationId: token, phase, predecessorId: token, candidateId: token, hookId: token, hookStage: enumeration('check', 'run', 'test'), errorCode: token, message: text() }, ['operationId', 'phase']);
const installation = object({ schemaVersion: version, installationId: token, dataHome: text(), delivery, activeReleaseId: token, operationId: token }, ['schemaVersion', 'installationId', 'dataHome', 'delivery']);
const frame = { type: 'string', minLength: 1, maxLength: MAX_BRIDGE_BYTES };
const request = object({ protocolVersion: version, endpoint, rpcFrame: frame });
const nonce = { type: 'string', minLength: 32, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' };

export const installerSchemas = {
  target, runtime, delivery, hook, endpoint, operation, installation,
  manifest: object({ schemaVersion: version, releaseId: token, sourceCommit: { type: 'string', pattern: '^(?:[a-f0-9]{40}|[a-f0-9]{64})$' }, target, runtime, payloadSha256: hash, daemonEntry: file, managerEntry: file, tuiEntry: file, protocolVersion: version, compatiblePredecessors: { ...list(token), uniqueItems: true }, migrations: list(hook) }),
  managerRequest: object({ protocolVersion: version, operationId: token, action: enumeration('inspect', 'check-upgrade', 'install', 'upgrade', 'start', 'stop', 'restart', 'retry-migration'), installationId: token, shutdownMode: enumeration('graceful', 'immediate'), acceptedOfferId: token, installOllama: boolean }, ['protocolVersion', 'operationId', 'action', 'installationId']),
  managerEvent: object({ protocolVersion: version, operationId: token, kind: enumeration('progress', 'result'), state: operation, retryable: boolean }),
  upgradeOffer: object({ offerId: token, installationId: token, currentReleaseId: token, candidateReleaseId: token, delivery }, ['offerId', 'installationId', 'candidateReleaseId', 'delivery']),
  dependencyReport: object({ runtimeReady: boolean, ollama: enumeration('ready', 'installed-not-running', 'missing', 'unavailable'), ollamaInstallOffer: object({ id: token, destination: text(), version: text(128) }), agents: object({ claude: boolean, codex: boolean, vibe: boolean }), recommendations: list(text(2048), 32), blockers: list(text(2048), 32) }, ['runtimeReady', 'ollama', 'agents', 'recommendations', 'blockers']),
  dependencyDecision: object({ offerId: token, choice: enumeration('install', 'decline') }),
  migrationContext: object({ installationId: token, operationId: token, fromReleaseId: token, toReleaseId: token, dataHome: text() }, ['installationId', 'operationId', 'toReleaseId', 'dataHome']),
  hookDecision: object({ needed: boolean, reason: text() }), hookValidation: object({ passed: boolean, detail: text() }),
  location: object({ home: text(), installationId: token, daemonEndpoint: endpoint }),
  bridgeRequest: request,
  bridgeEvent: object({ transportId: token, kind: enumeration('written', 'cancelled', 'frame', 'closed', 'error'), written: boolean, frame, code: token }, ['transportId', 'kind']),
  bridgeCommand: { oneOf: [object({ kind: { const: 'send' }, transportId: token, request }), object({ kind: { const: 'cancel' }, transportId: token })] },
  bridgeHello: object({ kind: { const: 'hello' }, protocolVersion: { const: 2 }, sessionNonce: nonce }),
  bridgeReady: object({ kind: { const: 'ready' }, protocolVersion: { const: 2 }, sessionNonce: nonce }),
  terminalLaunch: object({ operationId: token, installationId: token, home: text(), platform: enumeration('posix', 'powershell'), scriptPath: text(), scriptVersion: token, scriptSha256: hash, arguments: list(text(2048), 32), terminalName: { const: 'Insrc Installation' }, onInstallSuccess: { const: 'launch-tui' } }),
  terminalHandle: object({ operationId: token, terminalSessionId: token, state: enumeration('opened', 'reused', 'launch-failed') }),
  observation: object({ operationId: token, phase, daemonReady: boolean, errorCode: token }, ['operationId', 'phase', 'daemonReady']),
  snapshot: object({ schemaVersion: version, revision: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, installation, operation, lastResult: operation }, ['schemaVersion', 'revision', 'installation']),
} as const;

interface WireTypes {
  target: C.Target; runtime: C.RuntimeIdentity; delivery: C.Delivery; hook: C.HookReference; endpoint: C.LocalEndpoint;
  operation: C.OperationRecord; installation: C.Installation; manifest: C.ReleaseManifest; managerRequest: C.ManagerRequest;
  managerEvent: C.ManagerEvent; upgradeOffer: C.UpgradeOffer; dependencyReport: C.DependencyReport; dependencyDecision: C.DependencyDecision;
  migrationContext: C.MigrationContext; hookDecision: C.HookDecision; hookValidation: C.HookValidation; location: C.InstallationLocation;
  bridgeRequest: C.IpcBridgeRequest; bridgeEvent: C.BridgeEvent; bridgeCommand: C.BridgeCommand; bridgeHello: C.BridgeHello; bridgeReady: C.BridgeReady;
  terminalLaunch: C.TerminalInstallLaunch; terminalHandle: C.TerminalInstallHandle; observation: C.InstallationObservation; snapshot: C.ControllerSnapshot;
}
const ajv = new Ajv({ strict: true, allErrors: false, coerceTypes: false, useDefaults: false, removeAdditional: false });
const validators = Object.fromEntries(Object.entries(installerSchemas).map(([key, schema]) => [key, ajv.compile(schema)])) as Record<keyof WireTypes, ValidateFunction>;

export function parseInstaller<K extends keyof WireTypes>(kind: K, input: unknown): WireTypes[K] {
  let bytes: string | undefined;
  try { bytes = JSON.stringify(input); } catch { throw new InstallerError('schema-invalid', 'Expected bounded JSON'); }
  if (!bytes || Buffer.byteLength(bytes) > (kind.startsWith('bridge') ? MAX_BRIDGE_BYTES + MAX_CONTROL_BYTES : kind === 'manifest' ? 2 * 1024 * 1024 : MAX_CONTROL_BYTES)) {
    throw new InstallerError('schema-invalid', 'Installer record exceeds its byte limit');
  }
  if (!validators[kind](input)) throw new InstallerError('schema-invalid', `${kind}: ${ajv.errorsText(validators[kind].errors)}`);
  const checkEndpoint = (value: C.LocalEndpoint): void => {
    if (value.kind === 'named-pipe') {
      if (!/^\\\\\.\\pipe\\insrc-[a-f0-9]{32}$/.test(value.address)) throw new InstallerError('endpoint-invalid', 'Expected a scoped local named pipe');
    } else if (!value.address.endsWith('/daemon.sock')) {
      throw new InstallerError('endpoint-invalid', 'Unexpected daemon socket name');
    } else {
      normalizeHome(value.address, 'linux');
      if (Buffer.byteLength(value.address) > 107) throw new InstallerError('endpoint-too-long', 'Unix socket path exceeds platform maximum');
    }
  };
  const checkFrame = (value: string): void => {
    try {
      const decoded: unknown = JSON.parse(value);
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('Not an RPC object');
    } catch { throw new InstallerError('bridge-frame-invalid', 'Expected one complete JSON RPC frame'); }
  };
  if (kind === 'endpoint') checkEndpoint(input as C.LocalEndpoint);
  if (kind === 'bridgeRequest') { const request = input as C.IpcBridgeRequest; checkEndpoint(request.endpoint); checkFrame(request.rpcFrame); }
  if (kind === 'bridgeCommand') {
    const command = input as C.BridgeCommand;
    if (command.kind === 'send') { checkEndpoint(command.request.endpoint); checkFrame(command.request.rpcFrame); }
  }
  if (kind === 'bridgeEvent' && (input as C.BridgeEvent).frame !== undefined) checkFrame((input as C.BridgeEvent).frame!);
  if (kind === 'hook') assertRelativeFile((input as C.HookReference).module);
  if (kind === 'location') {
    const location = input as C.InstallationLocation;
    checkEndpoint(location.daemonEndpoint);
    normalizeHome(location.home, location.daemonEndpoint.kind === 'named-pipe' ? 'win32' : 'linux');
    if (location.installationId !== location.daemonEndpoint.installationId
      || (location.daemonEndpoint.kind === 'unix' && location.daemonEndpoint.address !== `${location.home}/daemon.sock`)) {
      throw new InstallerError('identity-mismatch', 'Location and endpoint identities differ');
    }
  }
  if (kind === 'managerEvent') {
    const event = input as C.ManagerEvent;
    if (event.operationId !== event.state.operationId) throw new InstallerError('identity-mismatch', 'Event belongs to another operation');
  }
  if (kind === 'snapshot') {
    const snapshot = input as C.ControllerSnapshot;
    if (snapshot.installation.operationId !== snapshot.operation?.operationId) throw new InstallerError('identity-mismatch', 'Controller operation linkage differs');
  }
  const checkHome = (home: string): void => { normalizeHome(home, /^[a-z]:/i.test(home) ? 'win32' : 'linux'); };
  if (kind === 'installation') checkHome((input as C.Installation).dataHome);
  if (kind === 'snapshot') checkHome((input as C.ControllerSnapshot).installation.dataHome);
  if (kind === 'migrationContext') checkHome((input as C.MigrationContext).dataHome);
  if (kind === 'dependencyReport') {
    const offer = (input as C.DependencyReport).ollamaInstallOffer;
    if (offer) checkHome(offer.destination);
  }
  return input as WireTypes[K];
}

function releaseManifest(input: unknown, expected?: { target: C.Target; predecessorId?: string | undefined }): C.ReleaseManifest {
  const manifest = parseInstaller('manifest', input);
  const same = (a: C.Target, b: C.Target) => a.os === b.os && a.arch === b.arch && a.baseline === b.baseline;
  if (!same(manifest.target, manifest.runtime.target) || (expected && !same(manifest.target, expected.target))) {
    throw new InstallerError('manifest-invalid', 'Release and runtime targets must match the requested target exactly');
  }
  const executable = manifest.target.os === 'win32' ? 'node.exe' : 'bin/node';
  if (manifest.runtime.relativeExecutable !== executable) throw new InstallerError('manifest-invalid', 'Unexpected runtime executable');
  if (expected?.predecessorId && !manifest.compatiblePredecessors.includes(expected.predecessorId)) throw new InstallerError('manifest-invalid', 'Unsupported predecessor');
  const hooks = new Set<string>();
  for (const hook of manifest.migrations) {
    const identity = `${hook.id}\0${hook.version}`;
    if (hooks.has(identity)) throw new InstallerError('manifest-invalid', 'Duplicate migration id/version');
    hooks.add(identity); assertRelativeFile(hook.module);
  }
  for (const file of [manifest.daemonEntry, manifest.managerEntry, manifest.tuiEntry, manifest.runtime.relativeExecutable]) assertRelativeFile(file);
  return manifest;
}

export function parseReleaseManifest(input: unknown, expected?: { target: C.Target; predecessorId?: string | undefined }): C.ReleaseManifest {
  try { return releaseManifest(input, expected); }
  catch (cause) {
    if (cause instanceof InstallerError && cause.code === 'manifest-invalid') throw cause;
    throw new InstallerError('manifest-invalid', 'Invalid release manifest', { cause });
  }
}

export function parseManagerRequest(input: unknown): C.ManagerRequest {
  // Reject before general shape checks: forged caller flags cannot make install admissible.
  if (input && typeof input === 'object' && 'action' in input && input.action === 'install') throw new InstallerError('install-terminal-required', 'Run the shared installer in an interactive terminal');
  const request = parseInstaller('managerRequest', input);
  if (request.shutdownMode && !['stop', 'restart', 'upgrade'].includes(request.action)) throw new InstallerError('schema-invalid', 'Shutdown mode is not applicable to this action');
  if (request.action === 'upgrade' && !request.acceptedOfferId) throw new InstallerError('offer-required', 'Upgrade requires an exact accepted offer');
  if (request.installOllama !== undefined) throw new InstallerError('install-terminal-required', 'Dependency consent belongs to the terminal offer flow');
  return request;
}

export function parseTerminalLaunch(input: unknown, location: C.InstallationLocation): C.TerminalInstallLaunch {
  const launch = parseInstaller('terminalLaunch', input);
  const os = launch.platform === 'powershell' ? 'win32' : 'linux';
  if (launch.installationId !== location.installationId || normalizeHome(launch.home, os) !== location.home) throw new InstallerError('identity-mismatch', 'Terminal launch targets another installation');
  normalizeHome(launch.scriptPath, os);
  return launch;
}
