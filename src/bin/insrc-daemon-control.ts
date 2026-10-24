/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/** Internal shell bridge: share the CLI's retained-capability stop, not a second PID implementation. */
import { stopDaemon } from '../cli/services/daemon.js';
import { captureDaemon, cleanupStoppedDaemon } from '../cli/services/lifecycle.js';

const seconds = Number(process.argv[2] ?? '30');
if (!Number.isFinite(seconds) || seconds < 0 || seconds > 3600) {
 process.stderr.write('invalid daemon stop wait; restart withheld\n'); process.exitCode = 4;
} else {
 try {
  const captured = await captureDaemon();
  if (!captured.target) {
   cleanupStoppedDaemon(captured); process.stdout.write('daemon shut down (no live original process)\n');
  } else {
   const result = await stopDaemon({ capture: async () => captured, stopWaitMs: seconds * 1000 });
   process.stdout.write(result.forced ? `daemon did not stop within ${seconds} s; killed (pid ${result.pid})\n` : 'daemon shut down\n');
  }
 } catch (error) {
  process.stderr.write(`daemon stop refused; restart withheld: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 4;
 }
}
