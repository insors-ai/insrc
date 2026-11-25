/** Read-only dependency adapter. Mutating preparation is supplied by later S3 tasks. */
import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import { access, lstat, open, readdir, stat } from 'node:fs/promises';
import { get } from 'node:http';
import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';
import { InstallerError } from './contracts.js';
import type { DependencyReport, InstallationLocation, Target } from './contracts.js';
import type { DependencyPort, DependencyProbeContext } from './peer-contracts.js';
import { assertToken, normalizeHome } from './location.js';
import { canonicalJson, digest } from './release-descriptor.js';
import { parseInstaller } from './schemas.js';
import { verifyDevToolchain } from './dev-toolchain.js';
import { createOllamaOffer, ollamaEndpoint, ollamaPayloadRelativePath, parseOllamaPolicy } from './ollama-policy.js';
import type { OllamaOffer, OllamaPolicy } from './ollama-policy.js';
import { requireDependencyOperation } from './dependency-context.js';

export interface DependencyReadIo {
  stat(file: string): Promise<Stats>;
  lstat(file: string): Promise<Stats>;
  access(file: string, mode: number): Promise<void>;
  readdir(file: string): Promise<string[]>;
  read(file: string, limit: number, signal: AbortSignal): Promise<Buffer>;
}
export const dependencyReadIo: DependencyReadIo = {
  stat: file => stat(file), lstat: file => lstat(file), access, readdir: file => readdir(file),
  async read(file, limit, signal) {
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
    } finally { await handle.close(); }
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
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Literal loopback only; even a reconfigured localhost DNS cannot reach a remote host. */
export async function probeOllamaVersion(endpoint: string, signal: AbortSignal): Promise<OllamaProbe> {
  const url = new URL(ollamaEndpoint(endpoint));
  const addresses = url.hostname === 'localhost' ? ['127.0.0.1', '::1'] : [url.hostname.replace(/^\[|\]$/g, '')];
  let last: OllamaProbe = { state: 'refused', diagnostic: 'ECONNREFUSED' };
  for (const hostname of addresses) {
    signal.throwIfAborted();
    last = await new Promise<OllamaProbe>(resolve => {
      const request = get({ hostname, port: url.port, path: '/api/version', method: 'GET', agent: false, signal,
        headers: { accept: 'application/json', 'user-agent': 'insrc-installer/1' } }, response => {
        if (response.statusCode !== 200) { response.destroy(); resolve({ state: 'unavailable', diagnostic: `HTTP ${response.statusCode ?? 0}` }); return; }
        let size = 0; const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 16 * 1024) { response.destroy(); resolve({ state: 'unavailable', diagnostic: 'version response exceeds 16 KiB' }); }
          else chunks.push(chunk);
        });
        response.on('error', error => resolve({ state: 'unavailable', diagnostic: diagnostic(error) }));
        response.on('end', () => {
          try {
            const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!isObject(value) || typeof value['version'] !== 'string' || value['version'].length > 128
              || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(value['version'])) throw new Error('invalid version');
            resolve({ state: 'ready', version: value['version'] });
          } catch { resolve({ state: 'unavailable', diagnostic: 'malformed Ollama version response' }); }
        });
      });
      request.on('error', error => resolve({ state: diagnostic(error) === 'ECONNREFUSED' ? 'refused' : 'unavailable', diagnostic: diagnostic(error) }));
    });
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
      return { executable: path, complete: true };
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
  assertToken(location.installationId); const home = normalizeHome(location.home, target.os);
  const budget = options.budgetMs ?? 3000;
  if (!Number.isInteger(budget) || budget < 1 || budget > 3000) throw new InstallerError('dependency-probe-failed', 'Invalid dependency inspection budget');
  const deadline = new AbortController(), closed = new AbortController();
  const timer = setTimeout(() => deadline.abort(new InstallerError('dependency-probe-timeout', 'Inspection deadline exceeded')), budget);
  const signal = AbortSignal.any([deadline.signal, closed.signal, ...(context.signal ? [context.signal] : [])]);
  const io = options.io ?? dependencyReadIo, env = options.environment ?? process.env;
  const userHome = normalizeHome(options.userHome ?? homedir(), target.os);
  const report: DependencyReport = { runtimeReady: false, ollama: 'unavailable', agents: { claude: false, codex: false, vibe: false }, recommendations: [], blockers: [] };
  const note = (message: string) => { if (report.recommendations.length < 28) report.recommendations.push(message); };
  const finish = (): DependencyReport => {
    if (!Object.values(report.agents).some(Boolean)) note('Recommend installing at least one coding CLI: Claude Code, Codex or Mistral Vibe.');
    return parseInstaller('dependencyReport', structuredClone(report));
  };
  const work = async (): Promise<DependencyInspection> => {
    signal.throwIfAborted();
    try { verifyDevToolchain(options.runtimeDirectory, target); report.runtimeReady = true; }
    catch { report.blockers.push('Private Node runtime or target provenance is invalid; use the selected verified installer runtime.'); }
    const policies = options.policies ?? [];
    if (policies.length > 32) throw new InstallerError('dependency-policy-invalid', 'Dependency policy catalog exceeds bound');
    const matching = policies.map(parseOllamaPolicy).filter(p => canonicalJson(p.target) === canonicalJson(target));
    if (matching.length > 1) throw new InstallerError('dependency-policy-invalid', 'More than one policy selects the same target');
    const policy = matching[0];
    const availability = async (): Promise<{ endpoint?: string; service: OllamaProbe }> => {
      try { const endpoint = await configuredEndpoint(home, io, signal); return { endpoint, service: await probeOllamaVersion(endpoint, signal) }; }
      catch (error) { signal.throwIfAborted(); return { service: { state: 'unavailable', diagnostic: `local configuration/probe failed (${diagnostic(error)})` } }; }
    };
    const executables = async () => {
      for (const name of ['claude', 'codex', 'vibe'] as const) {
        try {
          const plan = executableCandidates(name, env, target.os, userHome), found = await lookup(plan.paths, io, signal, target.os);
          signal.throwIfAborted(); report.agents[name] = !!found.executable;
          if (!found.complete || plan.diagnostics.length) note(`${name} lookup is incomplete; executable presence may be unknown.`);
        } catch { signal.throwIfAborted(); note(`${name} lookup is incomplete; executable presence may be unknown.`); }
      }
      try {
        const plan = executableCandidates('ollama', env, target.os, userHome);
        plan.paths.push(...await privateOllamaCandidates(location, target, io, signal));
        if (policy) plan.paths.push(posixOrNative(home, `${ollamaPayloadRelativePath(policy)}/${policy.layout.executable}`));
        const found = await lookup([...new Set(plan.paths)], io, signal, target.os);
        return { ...found, complete: found.complete && (!plan.diagnostics.length || !!found.executable), searchSha256: digest(canonicalJson(plan.paths)) };
      } catch { signal.throwIfAborted(); return { complete: false, executable: undefined, searchSha256: digest('incomplete') }; }
    };
    // Independent HTTP and filesystem probes only; no LLM/provider can be reached here.
    const [{ endpoint, service }, binary] = await Promise.all([availability(), executables()]); signal.throwIfAborted();
    if (service.state === 'ready') report.ollama = 'ready';
    else if (service.state === 'unavailable' || !binary.complete) {
      report.ollama = 'unavailable'; report.blockers.push(`Ollama availability is uncertain: ${service.state === 'unavailable' ? service.diagnostic : 'executable lookup incomplete'}.`);
    } else if (binary.executable) {
      report.ollama = 'installed-not-running'; report.blockers.push('Ollama is installed but its configured local service is not running.');
      note(`Start Ollama manually using its executable: ${target.os === 'win32' ? '& ' : ''}'${binary.executable.replaceAll("'", target.os === 'win32' ? "''" : "'\\''")}' serve`);
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
    } else if (report.ollama === 'missing') note('Automatic user-level Ollama installation is not qualified for this exact target/configuration; install Ollama manually and retry.');
    return { report: finish(), endpoint, executable: binary.executable, policy, offer };
  };
  let aborted: (() => void) | undefined;
  try {
    return await Promise.race([work(), new Promise<never>((_resolve, reject) => {
      aborted = () => reject(signal.reason); signal.addEventListener('abort', aborted, { once: true }); if (signal.aborted) aborted();
    })]);
  } catch (error) {
    if (context.signal?.aborted) throw new InstallerError('cancelled', 'Dependency inspection cancelled');
    report.ollama = 'unavailable'; report.ollamaInstallOffer = undefined;
    report.blockers.push(deadline.signal.aborted ? 'Dependency inspection exceeded its aggregate deadline; some presence checks may be incomplete.' : `Dependency inspection failed (${diagnostic(error)}); availability is unknown.`);
    return { report: finish() };
  } finally { if (aborted) signal.removeEventListener('abort', aborted); clearTimeout(timer); closed.abort(); }
}

/** Construction is pure. Only inspect/decline are available before the owning preparation tasks. */
export function dependencyPort(targetInput: Target, locationInput: InstallationLocation, input: DependencyOptions): DependencyPort {
  const target = parseInstaller('target', targetInput), location = { ...locationInput, home: normalizeHome(locationInput.home, target.os) };
  const options = { ...input, environment: { ...(input.environment ?? process.env) }, policies: input.policies?.map(parseOllamaPolicy) };
  const check = (requested: InstallationLocation) => {
    if (requested.installationId !== location.installationId || normalizeHome(requested.home, target.os) !== location.home) throw new InstallerError('identity-mismatch', 'Dependency adapter belongs to another installation');
  };
  return {
    async inspect(requested, context) { check(requested); return (await inspectDependencies(location, target, options, context)).report; },
    async decide(requested, decision, context) {
      check(requested); const parsed = parseInstaller('dependencyDecision', decision);
      if (parsed.choice === 'install') requireDependencyOperation(location, context);
      const current = await inspectDependencies(location, target, options, context);
      if (current.offer?.id !== parsed.offerId) throw new InstallerError('dependency-offer-stale', 'Dependency consent differs from the current exact offer');
      if (parsed.choice === 'decline') return current.report;
      throw new InstallerError('capability-unavailable', 'Ollama payload preparation requires the owning S3 preparation implementation');
    },
  };
}
