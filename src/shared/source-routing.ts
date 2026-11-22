/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';
import { PATHS } from './paths.js';
import { SourceInstallationStore } from './source-installation.js';
import type { SourceInstallationState, SourceSelection } from './source-installation.js';
import { ownedNodeEnvironment } from './owned-node-runtime.js';
import type { OwnedToolchain } from './owned-node-runtime.js';
import { verifyStagedReleasePin } from '../daemon/managed-release-staging.js';
import type { StagedReleasePin } from '../daemon/managed-release-staging.js';
import { verifySourceRuntime } from '../daemon/source-store-inspection.js';

const execute = promisify(execFile);
export type SourceControlOutcome = NonNullable<SourceInstallationState['outcome']>;
export type SourceControlReply = SourceControlOutcome & { readonly forced?: boolean | undefined };
export interface SourceControlRoute {
 readonly store: SourceInstallationStore;
 readonly manager: SourceSelection;
 readonly toolchain: OwnedToolchain;
 readonly launch: StagedReleasePin;
 readonly active: boolean;
}

/** Read selector metadata only. Clients never open daemon databases. An invalid
 * present journal is fatal; only absence or a validated legacy state permits fallback. */
export async function readSourceInstallation(stateRoot = PATHS.insrc, expectedRoot?: string): Promise<SourceInstallationStore | undefined> {
 if (process.platform !== 'linux') return undefined;
 let root: string;
 try { root = await realpath(stateRoot); }
 catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
 const path = join(root, 'source-lifecycle/journal.json');
 const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  .catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
 if (!file) return undefined;
 let logical: string;
 try {
  const before = await file.stat();
  if (!before.isFile() || before.uid !== process.getuid?.() || before.nlink !== 1 || (before.mode & 0o077)
   || before.size > 128 * 1024) throw new Error('Source journal is not bounded, private and owned');
  const bytes = Buffer.alloc(before.size + 1), { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
  const after = await file.stat(), current = await lstat(path);
  if (bytesRead !== before.size || after.ctimeMs !== before.ctimeMs || after.mtimeMs !== before.mtimeMs
   || current.dev !== before.dev || current.ino !== before.ino) throw new Error('Source journal changed while resolving its installation');
  const value: unknown = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
  if (!value || typeof value !== 'object' || !('installationRoot' in value) || typeof value.installationRoot !== 'string') throw new Error('Invalid source installation identity');
  logical = value.installationRoot;
 } finally { await file.close(); }
 const store = new SourceInstallationStore(root, logical);
 store.read();
 if (expectedRoot !== undefined && await realpath(expectedRoot) !== logical) throw new Error('Requested installation differs from the source selector');
 return store;
}

/** Verify the manager before executing its controller or runtime bootstrap assets. */
export async function resolveSourceControl(stateRoot = PATHS.insrc, expectedRoot?: string): Promise<SourceControlRoute | undefined> {
 const store = await readSourceInstallation(stateRoot, expectedRoot);
 if (!store) return undefined;
 const state = store.read(), manager = state.active?.candidate ?? state.selected ?? state.outcome?.legacyRoute?.candidate;
 if (!manager) {
  if (state.active) throw new Error('Source preparation is pending; recover with the current authenticated release installer');
  return undefined;
 }
 const launch = state.selected?.pin ?? state.outcome?.legacyRoute?.prior;
 if (!launch && !state.active) throw new Error('Source installation has no qualified launch route');
 await verifyStagedReleasePin(manager.pin);
 const toolchain = await verifySourceRuntime(manager, store.root);
 return { store, manager, toolchain, launch: launch ?? manager.pin, active: state.active !== null };
}

/** Entry launch cannot execute a provisional candidate, including during rollback. */
export async function resolveSourceLaunch(stateRoot = PATHS.insrc, expectedRoot?: string): Promise<SourceControlRoute | undefined> {
 const route = await resolveSourceControl(stateRoot, expectedRoot);
 if (!route) return undefined;
 if (route.active) throw new Error('Source transaction recovery must finish before launching a client');
 await verifyStagedReleasePin(route.launch);
 // A qualified restored prior retains its separately pinned runtime. Its full
 // executable bytes are included in the verified release fingerprint above.
 return route;
}

/** Reuse the selected controller for lifecycle effects; never call incumbent build functions. */
export async function runSourceControl(route: SourceControlRoute, command: 'start' | 'restart' | 'stop' | 'update' | 'recover',
 env: NodeJS.ProcessEnv = process.env): Promise<SourceControlReply> {
 const entry = join(route.manager.pin.root, 'out/bin/insrc-source-control.js');
 const args = [entry, command, route.store.root, route.store.installationRoot];
 let stdout: string;
 try {
  ({ stdout } = await execute(route.toolchain.node, args, { env: ownedNodeEnvironment(route.toolchain, env),
   cwd: route.manager.pin.root, timeout: 30 * 60_000, maxBuffer: 256 * 1024 }));
 } catch (error) {
  const result = error as { message?: string; stdout?: string; stderr?: string };
  let detail = '';
  try { const outcome = JSON.parse(result.stdout ?? '') as { detail?: unknown }; if (typeof outcome.detail === 'string') detail = outcome.detail.slice(0, 4096); } catch { /* Raw diagnostics remain available below. */ }
  const diagnostic = [detail, result.stderr?.slice(-3072), detail ? '' : result.stdout?.slice(-4096), result.message?.slice(-1024)].filter(Boolean).join('\n').slice(0, 8192);
  throw new Error(`Source command failed ${JSON.stringify([route.toolchain.node, ...args])}: ${diagnostic || String(error).slice(-8192)}`, { cause: error });
 }
 try {
  const reply = JSON.parse(stdout) as SourceControlReply;
  const { forced, ...record } = reply;
  const outcome = route.store.read().outcome;
  if ((forced !== undefined && typeof forced !== 'boolean') || !outcome || !isDeepStrictEqual(record, outcome)) throw new Error('Reply differs from its durable outcome');
  return { ...outcome, ...(forced === undefined ? {} : { forced }) };
 } catch (error) {
  throw new Error(`Invalid source reply for ${JSON.stringify([route.toolchain.node, ...args])}: ${stdout.slice(-8192)}`, { cause: error });
 }
}
