/** Read-only inspection and exact-consented private dependency preparation. */
import { constants, existsSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { access, lstat, open, readdir, realpath, stat } from 'node:fs/promises';
import { get } from 'node:http';
import { homedir } from 'node:os';
import { dirname, posix, win32 } from 'node:path';
import { InstallerError, PRIVATE_NODE_VERSION } from './contracts.js';
import type { DependencyReport, InstallationLocation, Target } from './contracts.js';
import type { DependencyPort, DependencyProbeContext } from './peer-contracts.js';
import { assertToken, normalizeHome } from './location.js';
import { canonicalJson, digest } from './release-descriptor.js';
import { parseInstaller } from './schemas.js';
import { runtimeArchive, runtimePolicy } from './runtime-policy.js';
import { createOllamaOffer, dependencyAttemptPaths, ollamaEndpoint, ollamaPayloadRelativePath, parseOllamaPolicy } from './ollama-policy.js';
import type { OllamaOffer, OllamaPolicy } from './ollama-policy.js';
import { requireDependencyOperation, requireDependencyRetry } from './dependency-context.js';
import { assertOllamaReadsClosed, closedOllamaAttempts, prepareOllama } from './ollama-prepare.js';
import { cleanupOllamaInstallAttempt } from './ollama-recovery.js';
import { dependencyLockIdentity, dependencyPath, dependencyUncertain, readDependencyRecord } from './ollama-records.js';
import { privateOllamaDirectory } from './ollama-layout.js';
import { controlBinding } from './native.js';
import { parseServiceFrame, serviceJson, servicePaths, SERVICE_FRAME_LIMIT } from './ollama-service-records.js';
import type { OllamaPrepareOptions } from './ollama-prepare.js';
import { closeOwnedFile } from './owned-file.js';
import { startOllamaService, reconcileOllamaDependencies } from './ollama-service.js';
import type { OllamaServiceOptions } from './ollama-service.js';

export interface DependencyReadIo {
  realpath(file: string): Promise<string>;
  stat(file: string): Promise<Stats>;
  lstat(file: string): Promise<Stats>;
  access(file: string, mode: number): Promise<void>;
  readdir(file: string): Promise<string[]>;
  read(file: string, limit: number, signal: AbortSignal): Promise<Buffer>;
}
export const dependencyReadIo: DependencyReadIo = {
  realpath, stat: file => stat(file), lstat: file => lstat(file), access, readdir: file => readdir(file),
  async read(file, limit, signal) {
    signal.throwIfAborted();
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > limit) throw new InstallerError('dependency-probe-failed', 'Configuration must be a bounded regular file');
      const chunks: Buffer[] = []; let total = 0;
      while (true) {
        signal.throwIfAborted(); const buffer = Buffer.alloc(Math.min(64 * 1024, limit + 1 - total));
        const { bytesRead } = await handle.read(buffer); signal.throwIfAborted();
        if (!bytesRead) break;
        total += bytesRead;
        if (total > limit) throw new InstallerError('dependency-probe-failed', 'Configuration exceeds its byte bound');
        chunks.push(buffer.subarray(0, bytesRead));
      }
      return Buffer.concat(chunks);
    } finally { await closeOwnedFile(handle); }
  },
};
export interface DependencyOptions {
  /** S1-verified root from bootstrap/installed receipt, never a wire argument. */
  runtimeDirectory: string;
  environment?: NodeJS.ProcessEnv | undefined;
  userHome?: string | undefined;
  policies?: readonly OllamaPolicy[] | undefined;
  /** Narrow trusted test seams; not selected from requests or environment. */
  io?: DependencyReadIo | undefined;
  budgetMs?: number | undefined;
  preparation?: Omit<OllamaPrepareOptions, 'recheck'> | undefined;
  service?: Omit<OllamaServiceOptions, 'recheck'> | undefined;
}
export interface DependencyInspection {
  report: DependencyReport; endpoint?: string | undefined; executable?: string | undefined;
  policy?: OllamaPolicy | undefined; offer?: OllamaOffer | undefined;
}
export type OllamaProbe = { state: 'ready'; version: string } | { state: 'refused' | 'unavailable'; diagnostic: string };
const diagnostic = (error: unknown): string => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : 'probe-failed';
};
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
const requireProbeClosure = (error: unknown): void => { if ((error as { code?: string } | undefined)?.code === 'resource-close-uncertain') throw error; };
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** S1 supplies an already authenticated runtime root. Unlike the synchronous
 * build verifier, every filesystem read here participates in the probe deadline. */
async function verifyProbeRuntime(directory: string, target: Target, io: DependencyReadIo, signal: AbortSignal): Promise<void> {
  runtimeArchive(target);
  if (process.version !== `v${PRIVATE_NODE_VERSION}` || process.platform !== target.os || process.arch !== target.arch) throw new InstallerError('runtime-invalid', 'Wrong private runtime/target');
  const path = target.os === 'win32' ? win32 : posix;
  signal.throwIfAborted(); const root = await io.realpath(normalizeHome(directory, target.os)); signal.throwIfAborted();
  const node = await io.realpath(process.execPath); signal.throwIfAborted();
  if (node !== path.join(root, target.os === 'win32' ? 'node.exe' : 'bin/node')) throw new InstallerError('runtime-invalid', 'Current process is not the selected private Node');
  const regular = async (name: string) => {
    const file = path.join(root, name); let current = file;
    while (true) {
      signal.throwIfAborted(); const info = await io.lstat(current); signal.throwIfAborted();
      if (info.isSymbolicLink() || (current === file ? !info.isFile() : !info.isDirectory())) throw new InstallerError('runtime-invalid', 'Private runtime contains a linked or non-regular path');
      if (current === root) break; current = path.dirname(current);
    }
    return file;
  };
  const npmRoot = target.os === 'win32' ? 'node_modules/npm' : 'lib/node_modules/npm';
  await regular(target.os === 'win32' ? 'node.exe' : 'bin/node');
  for (const file of [`${npmRoot}/bin/npm-cli.js`, `${npmRoot}/bin/npx-cli.js`, `${npmRoot}/node_modules/node-gyp/bin/node-gyp.js`,
    'include/node/common.gypi', 'include/node/config.gypi', 'include/node/node_api.h', ...(target.os === 'win32' ? [`${target.arch}/node.lib`] : [])]) await regular(file);
  const metadata = await io.read(await regular(`${npmRoot}/package.json`), 128 * 1024, signal); signal.throwIfAborted();
  const npm: unknown = JSON.parse(metadata.toString('utf8'));
  if (!isObject(npm) || npm['version'] !== runtimePolicy.npmVersion) throw new InstallerError('runtime-invalid', 'Private npm version differs');
  const header = (await io.read(await regular('include/node/node_version.h'), 64 * 1024, signal)).toString('utf8'); signal.throwIfAborted();
  if (['MAJOR', 'MINOR', 'PATCH'].map(key => new RegExp(`^#define NODE_${key}_VERSION\\s+(\\d+)`, 'm').exec(header)?.[1]).join('.') !== runtimePolicy.headersVersion) {
    throw new InstallerError('runtime-invalid', 'Private Node headers differ');
  }
}

/** Literal loopback only; even a reconfigured localhost DNS cannot reach a remote host. */
export async function probeOllamaVersion(endpoint: string, signal: AbortSignal): Promise<OllamaProbe> {
  const url = new URL(ollamaEndpoint(endpoint));
  const addresses = url.hostname === 'localhost' ? ['127.0.0.1', '::1'] : [url.hostname.replace(/^\[|\]$/g, '')];
  let last: OllamaProbe = { state: 'refused', diagnostic: 'ECONNREFUSED' };
  for (const hostname of addresses) {
    signal.throwIfAborted();
    last = await new Promise<OllamaProbe>(resolve => {
      let outcome: OllamaProbe | undefined, requestClosed = false, responseClosed = true;
      const finish = (value?: OllamaProbe) => {
        outcome ??= value;
        if (requestClosed && responseClosed) resolve(outcome ?? { state: 'unavailable', diagnostic: 'version request closed before response completed' });
      };
      const request = get({ hostname, port: url.port, path: '/api/version', method: 'GET', agent: false, signal,
        headers: { accept: 'application/json', 'user-agent': 'insrc-installer/1' } }, response => {
        responseClosed = false; response.once('close', () => { responseClosed = true; finish(); });
        response.on('error', error => finish({ state: 'unavailable', diagnostic: diagnostic(error) }));
        if (response.statusCode !== 200) { finish({ state: 'unavailable', diagnostic: `HTTP ${response.statusCode ?? 0}` }); response.destroy(); return; }
        let size = 0; const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 16 * 1024) { finish({ state: 'unavailable', diagnostic: 'version response exceeds 16 KiB' }); response.destroy(); }
          else chunks.push(chunk);
        });
        response.on('end', () => {
          try {
            const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!isObject(value) || typeof value['version'] !== 'string' || value['version'].length > 128
              || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(value['version'])) throw new Error('invalid version');
            finish({ state: 'ready', version: value['version'] });
          } catch { finish({ state: 'unavailable', diagnostic: 'malformed Ollama version response' }); }
        });
      });
      request.on('error', error => finish({ state: diagnostic(error) === 'ECONNREFUSED' ? 'refused' : 'unavailable', diagnostic: diagnostic(error) }));
      request.once('close', () => { requestClosed = true; finish(); });
    });
    signal.throwIfAborted();
    if (last.state !== 'refused') return last;
  }
  return last;
}

function envValue(env: NodeJS.ProcessEnv, key: string, os: Target['os']): string {
  return env[key] ?? (os === 'win32' ? env[Object.keys(env).find(name => name.toUpperCase() === key) ?? ''] : '') ?? '';
}
/** Pure bounded lookup plan, including Windows suffixes; it never executes a command. */
export function executableCandidates(name: 'ollama' | 'claude' | 'codex' | 'vibe', env: NodeJS.ProcessEnv,
  os: Target['os'], userHome: string): { paths: string[]; diagnostics: string[] } {
  const path = os === 'win32' ? win32 : posix, diagnostics: string[] = [], raw = envValue(env, 'PATH', os);
  if (raw.length > 32768) throw new InstallerError('dependency-probe-failed', 'PATH exceeds lookup bound');
  const directories = raw ? raw.split(os === 'win32' ? ';' : ':') : [];
  if (directories.length > 128) throw new InstallerError('dependency-probe-failed', 'PATH directory count exceeds lookup bound');
  const valid: string[] = [];
  for (const directory of directories) {
    try { valid.push(normalizeHome(directory, os)); }
    catch { diagnostics.push('A relative or invalid PATH directory could not be inspected'); }
  }
  const suffixes = os === 'win32' ? [...new Set((envValue(env, 'PATHEXT', os) || '.EXE;.COM;.CMD;.BAT;.PS1').split(';').map(s => s.toLowerCase()))] : [''];
  if (suffixes.length > 16 || suffixes.some(s => !/^\.[a-z0-9]{1,8}$/.test(s) && os === 'win32')) {
    throw new InstallerError('dependency-probe-failed', 'PATHEXT exceeds executable lookup bounds');
  }
  valid.push(path.join(userHome, '.local/bin'), path.join(userHome, '.npm-global/bin'));
  const candidates = valid.flatMap(directory => suffixes.map(suffix => path.join(directory, name + suffix)));
  if (os === 'darwin' && name === 'codex') {
    // This is the actual packaged CLI, not the ChatGPT GUI executable. No
    // Claude/Vibe desktop executable is guessed to be a coding CLI.
    for (const applications of ['/Applications', path.join(userHome, 'Applications')]) {
      candidates.push(path.join(applications, 'ChatGPT.app/Contents/Resources/codex-cli/bin/codex'));
    }
  }
  if (name === 'ollama') {
    if (os === 'darwin') candidates.push('/Applications/Ollama.app/Contents/Resources/ollama', path.join(userHome, 'Applications/Ollama.app/Contents/Resources/ollama'));
    if (os === 'win32') {
      const appdata = envValue(env, 'LOCALAPPDATA', os);
      if (appdata) { const base = normalizeHome(appdata, os); candidates.push(path.join(base, 'Programs/Ollama/ollama.exe'), path.join(base, 'Ollama/ollama.exe')); }
    }
  }
  return { paths: [...new Set(candidates)], diagnostics };
}

async function configuredEndpoint(home: string, io: DependencyReadIo, signal: AbortSignal): Promise<string> {
  let bytes: Buffer;
  try { bytes = await io.read(posixOrNative(home, 'config.json'), 1024 * 1024, signal); }
  catch (error) { if (missing(error)) return 'http://localhost:11434'; throw error; }
  signal.throwIfAborted(); const value: unknown = JSON.parse(bytes.toString('utf8'));
  if (!isObject(value) || (value['models'] !== undefined && !isObject(value['models']))) throw new InstallerError('dependency-probe-failed', 'Invalid local provider configuration');
  const models = value['models'] as Record<string, unknown> | undefined, local = models?.['local'];
  if (local !== undefined && !isObject(local)) throw new InstallerError('dependency-probe-failed', 'Invalid local provider configuration');
  const host = isObject(local) ? local['host'] : undefined;
  if (host !== undefined && typeof host !== 'string') throw new InstallerError('dependency-probe-failed', 'Invalid local Ollama host');
  return ollamaEndpoint(host === undefined ? 'http://localhost:11434' : host as string);
}
function posixOrNative(home: string, tail: string): string { return (/^[A-Za-z]:[\\/]/.test(home) ? win32 : posix).join(home, tail); }
async function lookup(paths: string[], io: DependencyReadIo, signal: AbortSignal, os: Target['os']): Promise<{ executable?: string; complete: boolean }> {
  if (paths.length > 2304) throw new InstallerError('dependency-probe-failed', 'Executable candidate bound exceeded');
  let complete = true;
  for (const path of paths) {
    signal.throwIfAborted();
    try {
      const info = await io.stat(path); signal.throwIfAborted();
      if (!info.isFile()) { complete = false; continue; }
      await io.access(path, os === 'win32' ? constants.F_OK : constants.X_OK); signal.throwIfAborted();
      return { executable: path, complete };
    } catch (error) { signal.throwIfAborted(); if (!missing(error) && (error as NodeJS.ErrnoException).code !== 'ENOTDIR') complete = false; }
  }
  return { complete };
}

/** Include old immutable private versions as well as the current shipped catalog. */
async function privateOllamaCandidates(location: InstallationLocation, target: Target, io: DependencyReadIo, signal: AbortSignal): Promise<string[]> {
  const path = target.os === 'win32' ? win32 : posix, root = path.join(location.home, 'deps/ollama');
  // Absence beneath a linked ancestor is not an owned/clean destination.
  let ancestor = root;
  while (true) {
    signal.throwIfAborted();
    try {
      const info = await io.lstat(ancestor); signal.throwIfAborted();
      if (info.isSymbolicLink() || !info.isDirectory()) throw new InstallerError('dependency-probe-failed', 'Private dependency ancestor is linked or malformed');
    } catch (error) { if (!missing(error)) throw error; }
    const parent = path.dirname(ancestor); if (parent === ancestor) break; ancestor = parent;
  }
  const list = async (directory: string): Promise<string[]> => {
    signal.throwIfAborted();
    try {
      const info = await io.lstat(directory); signal.throwIfAborted();
      if (info.isSymbolicLink() || !info.isDirectory()) throw new InstallerError('dependency-probe-failed', 'Private dependency namespace must be a real directory');
      const entries = await io.readdir(directory); signal.throwIfAborted();
      if (entries.length > 64) throw new InstallerError('dependency-probe-failed', 'Private dependency version count exceeds bound'); return entries.sort();
    } catch (error) { if (missing(error)) return []; throw error; }
  };
  const result: string[] = [];
  for (const version of await list(root)) {
    if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)) continue;
    const versionRoot = path.join(root, version);
    const info = await io.lstat(versionRoot); signal.throwIfAborted();
    if (!info.isDirectory() || info.isSymbolicLink()) throw new InstallerError('dependency-probe-failed', 'Private dependency version is linked or malformed');
    for (const hash of await list(path.join(versionRoot, `${target.os}-${target.arch}`))) {
      if (!/^[a-f0-9]{64}$/.test(hash)) continue;
      const payload = path.join(versionRoot, `${target.os}-${target.arch}`, hash);
      const info = await io.lstat(payload); signal.throwIfAborted();
      if (!info.isDirectory() || info.isSymbolicLink()) throw new InstallerError('dependency-probe-failed', 'Private dependency payload is linked or malformed');
      for (const binary of target.os === 'win32' ? ['ollama.exe'] : target.os === 'darwin' ? ['Ollama.app/Contents/Resources/ollama', 'bin/ollama', 'ollama'] : ['bin/ollama']) result.push(path.join(payload, binary));
      if (result.length > 128) throw new InstallerError('dependency-probe-failed', 'Private executable count exceeds lookup bound');
    }
  }
  return result;
}

export async function inspectDependencies(location: InstallationLocation, target: Target, options: DependencyOptions,
  context: DependencyProbeContext = {}): Promise<DependencyInspection> {
  return inspectDependencyWork(location, target, options, context, false);
}
/** Mutation callers bound this promise and drain it. It never claims closure
 * merely because the public three-second report has already settled. */
export async function inspectDependenciesClosed(location: InstallationLocation, target: Target, options: DependencyOptions,
  context: DependencyProbeContext = {}): Promise<DependencyInspection> {
  return inspectDependencyWork(location, target, options, context, true);
}
async function inspectDependencyWork(location: InstallationLocation, target: Target, options: DependencyOptions,
  context: DependencyProbeContext, waitForClosure: boolean,
  evidence?: ((inspection: DependencyInspection, signal: AbortSignal) => Promise<DependencyInspection>) | undefined): Promise<DependencyInspection> {
  assertToken(location.installationId); const home = normalizeHome(location.home, target.os);
  const budget = options.budgetMs ?? 3000;
  if (!Number.isInteger(budget) || budget < 1 || budget > 3000) throw new InstallerError('dependency-probe-failed', 'Invalid dependency inspection budget');
  const io = options.io ?? dependencyReadIo, env = options.environment ?? process.env;
  const userHome = normalizeHome(options.userHome ?? homedir(), target.os);
  const deadline = new AbortController(), closed = new AbortController();
  const timer = setTimeout(() => deadline.abort(new InstallerError('dependency-probe-timeout', 'Inspection deadline exceeded')), budget);
  const signal = AbortSignal.any([deadline.signal, closed.signal, ...(context.signal ? [context.signal] : [])]);
  const report: DependencyReport = { runtimeReady: false, ollama: 'unavailable', agents: { claude: false, codex: false, vibe: false }, recommendations: [], blockers: [] };
  const note = (message: string) => { if (report.recommendations.length < 28) report.recommendations.push(message); };
  const finish = (): DependencyReport => {
    if (!Object.values(report.agents).some(Boolean)) note('Recommend installing at least one coding CLI: Claude Code, Codex or Mistral Vibe.');
    return parseInstaller('dependencyReport', structuredClone(report));
  };
  const work = async (): Promise<DependencyInspection> => {
    signal.throwIfAborted();
    try { await verifyProbeRuntime(options.runtimeDirectory, target, io, signal); signal.throwIfAborted(); report.runtimeReady = true; }
    catch (error) { requireProbeClosure(error); signal.throwIfAborted(); report.blockers.push('Private Node runtime or target provenance is invalid; use the selected verified installer runtime.'); }
    const policies = options.policies ?? [];
    if (policies.length > 32) throw new InstallerError('dependency-policy-invalid', 'Dependency policy catalog exceeds bound');
    const matching = policies.map(parseOllamaPolicy).filter(p => canonicalJson(p.target) === canonicalJson(target));
    if (matching.length > 1) throw new InstallerError('dependency-policy-invalid', 'More than one policy selects the same target');
    const policy = matching[0];
    const availability = async (): Promise<{ endpoint?: string; service: OllamaProbe }> => {
      try { const endpoint = await configuredEndpoint(home, io, signal); return { endpoint, service: await probeOllamaVersion(endpoint, signal) }; }
      catch (error) { requireProbeClosure(error); signal.throwIfAborted(); return { service: { state: 'unavailable', diagnostic: `local configuration/probe failed (${diagnostic(error)})` } }; }
    };
    const executables = async () => {
      for (const name of ['claude', 'codex', 'vibe'] as const) {
        try {
          const plan = executableCandidates(name, env, target.os, userHome), found = await lookup(plan.paths, io, signal, target.os);
          signal.throwIfAborted(); report.agents[name] = !!found.executable;
          if (!found.complete || plan.diagnostics.length) note(`${name} ${found.executable ? 'was detected, but some search candidates could not be inspected' : 'was not detected; search was incomplete'}.`);
        } catch (error) { requireProbeClosure(error); signal.throwIfAborted(); note(`${name} lookup is incomplete; executable presence may be unknown.`); }
      }
      try {
        const plan = executableCandidates('ollama', env, target.os, userHome);
        plan.paths.push(...await privateOllamaCandidates(location, target, io, signal));
        if (policy) plan.paths.push(posixOrNative(home, `${ollamaPayloadRelativePath(policy)}/${policy.layout.executable}`));
        const found = await lookup([...new Set(plan.paths)], io, signal, target.os);
        return { ...found, complete: found.complete && (!plan.diagnostics.length || !!found.executable), searchSha256: digest(canonicalJson(plan.paths)) };
      } catch (error) { requireProbeClosure(error); signal.throwIfAborted(); return { complete: false, executable: undefined, searchSha256: digest('incomplete') }; }
    };
    // Independent HTTP and filesystem probes only; no LLM/provider can be reached here.
    const probes = await Promise.allSettled([availability(), executables()]);
    for (const probe of probes) if (probe.status === 'rejected') requireProbeClosure(probe.reason);
    signal.throwIfAborted();
    const [availabilityResult, executableResult] = probes;
    if (availabilityResult.status === 'rejected') throw availabilityResult.reason;
    if (executableResult.status === 'rejected') throw executableResult.reason;
    const { endpoint, service } = availabilityResult.value, binary = executableResult.value;
    if (service.state === 'ready') report.ollama = 'ready';
    else if (service.state === 'unavailable' || (!binary.complete && !binary.executable)) {
      report.ollama = 'unavailable'; report.blockers.push(`Ollama availability is uncertain: ${service.state === 'unavailable' ? service.diagnostic : 'executable lookup incomplete'}.`);
    } else if (binary.executable) {
      report.ollama = 'installed-not-running'; report.blockers.push('Ollama is installed but its configured local service is not running.');
      note(`Start Ollama manually using its executable: ${target.os === 'win32' ? '& ' : ''}'${binary.executable.replaceAll("'", target.os === 'win32' ? "''" : "'\\''")}' serve`);
      if (!binary.complete) note('Ollama was detected, but some executable search candidates could not be inspected.');
    } else {
      report.ollama = 'missing'; report.blockers.push('Ollama is missing; its local service requirement is unmet.');
    }
    let offer: OllamaOffer | undefined;
    if (report.ollama === 'missing' && policy?.qualification && report.runtimeReady && endpoint === policy.endpoint) {
      let absent = false;
      try { await io.lstat(posixOrNative(home, ollamaPayloadRelativePath(policy))); }
      catch (error) { if (missing(error)) absent = true; else throw error; }
      signal.throwIfAborted();
      if (absent) offer = createOllamaOffer(location, policy, { binary: 'missing', endpoint: 'refused', destination: 'absent', searchSha256: binary.searchSha256 });
    }
    if (offer) {
      report.ollamaInstallOffer = { id: offer.id, destination: offer.destination, version: offer.version };
      note(`Accepting this offer installs and starts a user-session Ollama service at ${offer.endpoint}.`);
      note(`Models stay at ${offer.modelsDirectory}; logs stay at ${offer.logsDirectory}. No models are downloaded automatically.`);
      note(`Ollama support files and temporary data stay at ${(target.os === 'win32' ? win32 : posix).dirname(offer.modelsDirectory)}.`);
    } else if (report.ollama === 'missing') {
      note('Automatic user-level Ollama installation is not qualified for this exact target/configuration.');
      note('Manual download: https://github.com/ollama/ollama/releases — choose an official payload for your OS and CPU; an unavailable matching payload remains unsupported.');
      if (target.os === 'linux') note('Extract the complete Linux archive, preserving bin/ and lib/, into a new user-owned directory such as ~/.local/opt/ollama; use an available zstd-capable extractor. Run its absolute bin/ollama path with serve. Do not use sudo or the system install script.');
      else if (target.os === 'darwin') note('Place the official Ollama.app in ~/Applications, then run ~/Applications/Ollama.app/Contents/Resources/ollama serve. Decline global CLI links or moving the app to system Applications; no elevation or quarantine bypass.');
      else note('Extract the complete standalone CLI ZIP, including libraries, into a user-owned directory such as %LOCALAPPDATA%\\Ollama\\manual. In PowerShell run & "$env:LOCALAPPDATA\\Ollama\\manual\\ollama.exe" serve; no Administrator, PATH change or service registration.');
      note('Keep the serve terminal open, use the configured local Ollama endpoint, then retry inspection. These manual routes are not native auto-install qualification; no models are downloaded by insrc.');
    }
    const inspection = { report: finish(), endpoint, executable: binary.executable, policy, offer };
    return evidence ? evidence(inspection, signal) : inspection;
  };
  const pendingWork = work(), closure = pendingWork.then(() => {}, error => { requireProbeClosure(error); });
  void closure.catch(() => {});
  let aborted: (() => void) | undefined;
  try {
    return await Promise.race([pendingWork, new Promise<never>((_resolve, reject) => {
      aborted = () => reject(signal.reason); signal.addEventListener('abort', aborted, { once: true }); if (signal.aborted) aborted();
    })]);
  } catch (error) {
    if (context.signal?.aborted) throw new InstallerError('cancelled', 'Dependency inspection cancelled');
    report.ollama = 'unavailable'; report.ollamaInstallOffer = undefined;
    report.blockers.push(deadline.signal.aborted ? 'Dependency inspection exceeded its aggregate deadline; some presence checks may be incomplete.' : `Dependency inspection failed (${diagnostic(error)}); availability is unknown.`);
    return { report: finish() };
  } finally { if (aborted) signal.removeEventListener('abort', aborted); clearTimeout(timer); closed.abort(); if (waitForClosure) await closure; }
}

/** Construction is pure. Preparation alone truthfully reports a stopped binary;
 * the owning service task supplies the separately consented retained handoff. */
export function dependencyPort(targetInput: Target, locationInput: InstallationLocation, input: DependencyOptions): DependencyPort {
  const target = parseInstaller('target', targetInput), location = { ...locationInput, home: normalizeHome(locationInput.home, target.os) };
  const options = { ...input, environment: { ...(input.environment ?? process.env) }, policies: input.policies?.map(parseOllamaPolicy) };
  const check = (requested: InstallationLocation) => {
    if (requested.installationId !== location.installationId || normalizeHome(requested.home, target.os) !== location.home) throw new InstallerError('identity-mismatch', 'Dependency adapter belongs to another installation');
  };
  return {
    async cleanupInstall(requested, input) {
      check(requested); const context = requireDependencyRetry(location, input);
      context.assertCurrent(); assertOllamaReadsClosed(location);
      const paths = dependencyAttemptPaths(context.operationId, context.attemptNonce), record = dependencyPath(location, paths.recordRelativePath);
      if (!existsSync(record)) {
        // Before any attempt was admitted, only a truly empty scope is safe.
        // Orphan temporary/unknown records are preserved, never inferred owned.
        if (existsSync(dependencyPath(location, paths.stageRelativePath))) throw dependencyUncertain('Unadmitted dependency staging cannot be discarded');
        const directory = dirname(record);
        if (existsSync(directory)) {
          await privateOllamaDirectory(directory); context.assertCurrent();
          const names = await readdir(directory); context.assertCurrent();
          if (names.length > 1024 || names.some(n => n.startsWith(`${context.attemptNonce}.`) && n !== `${context.attemptNonce}.json.lock`)) {
            throw dependencyUncertain('Original dependency attempt is missing but private evidence remains');
          }
          if (existsSync(`${record}.lock`)) {
            dependencyLockIdentity(`${record}.lock`);
            const handle = controlBinding().acquire(`${record}.lock`); controlBinding().close(handle);
          }
        }
        await closedOllamaAttempts(location, context.signal); context.assertCurrent(); return;
      }
      let policy = options.policies?.find(p => p.target.os === target.os && p.target.arch === target.arch && p.target.baseline === target.baseline);
      const frameFile = servicePaths(record).frame;
      if (existsSync(frameFile)) {
        const frame = parseServiceFrame(serviceJson(await readDependencyRecord(location, frameFile, SERVICE_FRAME_LIMIT))); context.assertCurrent();
        if (canonicalJson(frame.location) !== canonicalJson(location) || frame.attempt.identity.recordRelativePath !== paths.recordRelativePath) throw dependencyUncertain('Historical service policy belongs to another installation');
        policy = frame.policy;
      }
      await cleanupOllamaInstallAttempt(location, context, policy); context.assertCurrent();
    },
    async inspect(requested, context) { check(requested); return (await inspectDependencyWork(location, target, options, context ?? {}, false,
      (inspection, signal) => reconcileOllamaDependencies(location, inspection.policy, inspection, signal))).report; },
    async decide(requested, decision, context) {
      check(requested); const parsed = parseInstaller('dependencyDecision', decision);
      const operation = parsed.choice === 'install' ? requireDependencyOperation(location, context) : undefined;
      const current = await inspectDependencies(location, target, options, context);
      if (current.offer?.id !== parsed.offerId) throw new InstallerError('dependency-offer-stale', 'Dependency consent differs from the current exact offer');
      if (parsed.choice === 'decline') return current.report;
      if (!current.policy || !current.offer || !operation) throw new InstallerError('dependency-offer-stale', 'Qualified dependency preparation is unavailable');
      const prepared = await prepareOllama(location, current.policy, current.offer, operation, { ...options.preparation,
        recheck: signal => inspectDependenciesClosed(location, target, options, { signal }) });
      if (options.service) return startOllamaService(location, prepared, operation, { ...options.service,
        recheck: signal => inspectDependenciesClosed(location, target, options, { signal }) });
      operation.assertCurrent(); return (await inspectDependencies(location, target, options, operation)).report;
    },
  };
}
