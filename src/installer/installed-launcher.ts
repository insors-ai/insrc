import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, unlinkSync, writeFileSync, fsyncSync, existsSync } from 'node:fs';
import { join, posix, win32 } from 'node:path';
import { InstallerError } from './contracts.js';
import type { InstallationLocation, ManagerEvent, Target } from './contracts.js';
import { ControllerStore, inspectController } from './controller-store.js';
import { assertLocalControlRoot, assertToken } from './location.js';
import { controlBinding } from './native.js';
import type { ManagerPeers } from './peer-contracts.js';
import { resolveInstalledControl } from './installed-receipt.js';
import { privateRuntimeEnvironment } from './runtime-policy.js';
import { parseReleaseManifest } from './schemas.js';

export interface TuiSelection { node: string; entry: string; managerEntry: string; releaseId: string; location: InstallationLocation }
export interface TuiExit { code: number | null; signal: NodeJS.Signals | null }
function launchCommand(location: InstallationLocation, target: Target, releaseId: string, node: string): string {
  assertToken(releaseId);
  const paths = target.os === 'win32' ? win32 : posix, root = paths.join(location.home, 'releases', releaseId);
  const bootstrap = paths.join(root, 'bootstrap.mjs');
  const quote = target.os === 'win32' ? (value: string) => `'${value.replaceAll("'", "''")}'` : (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  return (target.os === 'win32' ? '& ' : '') + [node, bootstrap, '--launch-tui', '--home', location.home, '--installation-id', location.installationId].map(quote).join(' ');
}

export async function retryCommand(location: InstallationLocation, target: Target, releaseId: string): Promise<string> {
  const { runtime } = await resolveInstalledControl(location, releaseId, target);
  return launchCommand(location, target, releaseId, runtime.node);
}

function readySnapshot(location: InstallationLocation, event: ManagerEvent) {
  const inspected = inspectController(location);
  if (event.kind !== 'result' || event.state.phase !== 'ready' || inspected.kind !== 'present' || inspected.snapshot.operation
    || inspected.snapshot.lastResult?.operationId !== event.operationId || inspected.snapshot.lastResult.phase !== 'ready'
    || !inspected.snapshot.installation.activeReleaseId || inspected.snapshot.installation.activeReleaseId !== event.state.candidateId) throw new InstallerError('readiness-uncertain', 'Ready installation selection changed before TUI handoff');
  return inspected.snapshot;
}

/** Read the selected immutable manager/runtime pair and require fresh owning-peer readiness. */
export async function selectInstalledTui(location: InstallationLocation, target: Target, peers: ManagerPeers, event: ManagerEvent): Promise<TuiSelection> {
  const snapshot = readySnapshot(location, event), id = snapshot.installation.activeReleaseId!;
  const delivery = snapshot.installation.delivery.mode === 'bundle' ? peers.bundle : peers.dev;
  if (!delivery || !peers.lifecycle) throw new InstallerError('capability-unavailable', 'Delivery and lifecycle readiness capabilities are required');
  const { candidate, runtime, installed } = await resolveInstalledControl(location, id, target);
  if (installed.mode !== snapshot.installation.delivery.mode) throw new InstallerError('candidate-conflict', 'Selected control receipt differs from delivery mode');
  const manifest = parseReleaseManifest(candidate.manifest, { target });
  if (candidate.releaseId !== id || candidate.directory !== join(location.home, 'releases', id)) throw new InstallerError('candidate-conflict', 'Selected release identity differs');
  const observed = await peers.lifecycle.observe(location);
  const again = inspectController(location);
  if (again.kind !== 'present' || JSON.stringify(again.snapshot) !== JSON.stringify(snapshot) || observed.state !== 'present'
    || observed.identity.protocolVersion !== 1 || observed.identity.state !== 'ready' || observed.identity.installationId !== location.installationId
    || observed.identity.releaseId !== id || JSON.stringify(observed.endpoint) !== JSON.stringify(location.daemonEndpoint)) throw new InstallerError('readiness-uncertain', 'Selected daemon readiness is uncertain');
  const selection = { node: runtime.node, entry: join(candidate.directory, manifest.tuiEntry), managerEntry: join(candidate.directory, manifest.managerEntry), releaseId: id, location };
  return selection;
}

const launcherMarker = '# insrc-installed-launcher-v2 ';
function readLauncher(fd: number): string {
  const before = fstatSync(fd);
  if (!before.isFile() || before.nlink !== 1 || before.size > 64 * 1024) throw new Error('Unsafe launcher record');
  const bytes = Buffer.alloc(before.size + 1); let count = 0;
  while (count < bytes.length) { const read = readSync(fd, bytes, count, bytes.length - count, null); if (!read) break; count += read; }
  const after = fstatSync(fd);
  if (count !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new Error('Launcher changed while reading');
  return bytes.subarray(0, count).toString('utf8');
}
function launcherContents(target: Target, releaseId: string, command: string): string {
  const marker = launcherMarker + JSON.stringify(releaseId) + '\n';
  return target.os === 'win32'
    ? `${marker}$ErrorActionPreference = 'Stop'\nRemove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue\nRemove-Item Env:NODE_PATH -ErrorAction SilentlyContinue\n${command}\nexit $LASTEXITCODE\n`
    : `#!/bin/sh\n${marker}unset NODE_OPTIONS NODE_PATH\nexec ${command}\n`;
}
/** Replace only an exact installer-owned template under the existing native lease. */
export async function publishInstalledLauncher(location: InstallationLocation, target: Target, releaseId: string, event: ManagerEvent): Promise<string> {
  const store = ControllerStore.acquire(location);
  let temporary: string | undefined;
  try {
    if (readySnapshot(location, event).installation.activeReleaseId !== releaseId) throw new InstallerError('readiness-uncertain', 'Launcher release differs from ready selection');
    const directory = join(location.home, 'bin');
    assertLocalControlRoot(directory, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
    mkdirSync(directory, { recursive: true, mode: 0o700 }); controlBinding().protect(directory);
    const name = target.os === 'win32' ? 'insrc.ps1' : 'insrc', file = join(directory, name);
    const command = await retryCommand(location, target, releaseId); store.assertHeld();
    const contents = launcherContents(target, releaseId, command);
    let present = false;
    try {
      const stat = lstatSync(file); present = true;
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 64 * 1024 || (process.platform !== 'win32' && (stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0))) throw new Error('Not a private regular launcher');
      const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      let existing: string;
      try {
        const opened = fstatSync(fd);
        if (opened.ino !== stat.ino || opened.dev !== stat.dev) throw new Error('Launcher changed while opening');
        existing = readLauncher(fd);
      } finally { closeSync(fd); }
      const line = existing.split('\n')[target.os === 'win32' ? 0 : 1];
      if (!line?.startsWith(launcherMarker)) throw new Error('Missing launcher ownership marker');
      const previous: unknown = JSON.parse(line.slice(launcherMarker.length));
      if (typeof previous !== 'string') throw new Error('Launcher release is missing');
      assertToken(previous);
      if (existing !== launcherContents(target, previous, await retryCommand(location, target, previous))) throw new Error('Launcher template differs');
      const current = lstatSync(file), check = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const opened = fstatSync(check);
        if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1 || current.ino !== stat.ino || current.dev !== stat.dev
          || (process.platform !== 'win32' && (current.uid !== process.getuid?.() || (current.mode & 0o077) !== 0))
          || opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size > 64 * 1024 || readLauncher(check) !== existing) throw new Error('Owned launcher changed during verification');
      } finally { closeSync(check); }
      store.assertHeld();
      if (existing === contents) return command;
    } catch (cause) {
      if (present || (cause as NodeJS.ErrnoException).code !== 'ENOENT') throw new InstallerError('launcher-conflict', 'Existing launcher is not owned by this installation', { cause });
    }
    temporary = join(directory, `.launcher-${randomUUID()}`);
    const fd = openSync(temporary, 'wx', 0o700);
    try { writeFileSync(fd, contents); fsyncSync(fd); } finally { closeSync(fd); }
    store.replaceLauncher(temporary, name);
    return command;
  } finally {
    try { if (temporary && existsSync(temporary)) unlinkSync(temporary); } finally { store.close(); }
  }
}

export function launchInstalledTui(selection: TuiSelection): Promise<TuiExit> {
  return new Promise((resolve, reject) => {
    const env = privateRuntimeEnvironment(process.env);
    env['INSRC_HOME'] = selection.location.home; env['INSRC_INSTALLATION_ID'] = selection.location.installationId;
    env['INSRC_CWD'] = process.env['INSRC_CWD'] ?? process.cwd();
    const child = spawn(selection.node, [selection.entry], { cwd: selection.location.home, env, stdio: 'inherit' });
    child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal }));
  });
}
