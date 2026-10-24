/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { IpcServer } from '../../server.js';
import { daemonRunFiles, cleanupFailedPublication, endForRunFileConflict } from '../../run-file-ownership.js';
import { createShutdown, realEndDeps, exitRespectingStoreHealth, endAfterStoreFailure } from '../../shutdown.js';
import { reportFatal } from '../../fatal.js';
import { appendFileSync } from 'node:fs';
import { PATHS } from '../../../shared/paths.js';
const mode = process.argv[2]!;
const publication = daemonRunFiles.lease(); daemonRunFiles.writePid();
const server = new IpcServer({}); await server.listen();
if (mode !== 'startup') publication.release();
process.on('exit', () => appendFileSync(`${PATHS.insrc}/exit-hook`, 'ran'));
process.send?.('ready');
process.on('message', async () => {
 if (mode === 'backstop') while (server.attachedClients().length === 0) await new Promise(resolve => setImmediate(resolve));
 if (mode === 'startup') {
  void cleanupFailedPublication(server, publication).then(() => exitRespectingStoreHealth(1, 'a failed start')).catch(endForRunFileConflict);
 } else if (mode === 'locks-lost') {
  endAfterStoreFailure('test', { state: 'locks-lost', at: new Date().toISOString(), operation: 'test' }, { ...realEndDeps, lastLinePath: `${PATHS.insrc}/last.log` });
 } else if (mode === 'fatal') {
  reportFatal('unhandledRejection', new Error('test fatal'), { logFatal: () => {}, crashLogDir: PATHS.insrc, end: realEndDeps });
 } else {
  const shutdown = createShutdown({ armWatchdog: async () => ({ pid: 1, stage() {}, disarm() {} }), log: { info() {}, warn() {} }, stopBackgroundWork: () => { void server.close().catch(endForRunFileConflict); }, queueDone: new Promise(() => {}), closeStores: async () => {}, hardExitMs: 25 });
  shutdown('test');
 }
});
