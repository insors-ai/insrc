/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { closeSync, constants, fsyncSync, lstatSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { join } from 'node:path';
import { isMainThread } from 'node:worker_threads';
import { PATHS } from '../shared/paths.js';
import { readReleaseCompatibility, sameReleaseFormats } from '../shared/source-release-compatibility.js';

function inspect(path: string): Stats | undefined {
 try { return lstatSync(path); }
 catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

/** A short-lived daemon actor, never a client opening live stores or publishing public run files.
 * The transaction owner grants this entry only after predecessor/descendant closure under
 * run-file exclusion. Its native supervisor proves probe closure before cutover continues. */
async function probe(): Promise<void> {
 const directory = process.env['INSRC_SOURCE_ACTOR_DIRECTORY'], token = process.env['INSRC_SOURCE_ACTOR_TOKEN'];
 if (process.platform !== 'linux' || !isMainThread || !directory || !token || !/^[a-f0-9]{64}$/.test(token)
  || Number(process.env['INSRC_SOURCE_ACTOR_ROOT_PID']) !== process.pid
  || Number(process.env['INSRC_SOURCE_ACTOR_MONITOR_PID']) !== process.ppid
  || realpathSync(directory) !== directory) throw new Error('Store probe requires its native daemon actor');
 const before = lstatSync(directory);
 if (!before.isDirectory() || before.uid !== process.getuid?.() || (before.mode & 0o077)) throw new Error('Store probe directory is not private and owned');
 let result: object;
 try {
  const raw = process.env['INSRC_SOURCE_STORE_PROBE'];
  if (!raw || Buffer.byteLength(raw) > 8192) throw new Error('Store probe request is missing or oversized');
  const request: unknown = JSON.parse(raw);
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).length !== 3
   || !('stateRoot' in request) || request.stateRoot !== PATHS.insrc || realpathSync(PATHS.insrc) !== PATHS.insrc
   || !('prior' in request) || !('candidate' in request)) throw new Error('Store probe request does not name this daemon state');
  const pair = { prior: readReleaseCompatibility(request.prior), candidate: readReleaseCompatibility(request.candidate) };
  if (!sameReleaseFormats(pair.prior, pair.candidate)) throw new Error('Store probe pair changes writable formats');
  for (const suffix of ['.compact', '.bak', '.compact-manifest']) {
   if (inspect(join(PATHS.insrc, `graph.lmdb${suffix}`))) throw new Error('Graph compaction recovery is pending; retain the existing state');
  }
  const graph = inspect(join(PATHS.insrc, 'graph.lmdb')), lance = inspect(join(PATHS.insrc, 'lance'));
  const lock = inspect(join(PATHS.insrc, 'graph.lmdb-lock'));
  if (Boolean(graph) !== Boolean(lance) || Boolean(graph) !== Boolean(lock)) throw new Error('Stopped stores are incomplete; retain the existing state for recovery');
  for (const stat of [graph, lance, lock]) {
   if (stat && (stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o022))) throw new Error('Stopped store path is unsafe');
  }
  if (graph && (!graph.isFile() || !lock?.isFile() || !lance?.isDirectory())) throw new Error('Stopped store path has the wrong type');
  if (graph) {
   const { declareLiveStoreOwner } = await import('../db/graph/store.js');
   declareLiveStoreOwner();
   const { verifyQuiescedReleaseStores } = await import('./release-compatibility.js');
   await verifyQuiescedReleaseStores(PATHS.insrc, pair);
  }
  // Both absent is an unused state, not permission to create stores in a client/probe.
  result = { version: 1, token, pid: process.pid, stateRoot: PATHS.insrc, pair, ok: true, empty: graph === undefined };
 } catch (error) {
  result = { version: 1, token, pid: process.pid, ok: false, error: (error instanceof Error ? error.message : String(error)).slice(0, 2048) };
 }
 const after = lstatSync(directory);
 if (after.ino !== before.ino || after.dev !== before.dev || realpathSync(directory) !== directory) throw new Error('Store probe directory changed');
 const fd = openSync(join(directory, 'probe-result.json'), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
 try { writeFileSync(fd, JSON.stringify(result) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
 const dir = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
 try { fsyncSync(dir); } finally { closeSync(dir); }
 process.exit('ok' in result && result.ok === true ? 0 : 1);
}

void probe().catch(error => {
 process.stderr.write(`Source store probe refused: ${(error instanceof Error ? error.message : String(error)).slice(0, 2048)}\n`);
 process.exit(1);
});
