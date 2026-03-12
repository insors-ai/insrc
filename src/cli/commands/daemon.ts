import { spawn }      from 'node:child_process';
import { existsSync, openSync } from 'node:fs';
import { mkdirSync }  from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Command } from 'commander';
import { rpc } from '../client.js';
import { PATHS } from '../../shared/paths.js';
import type { DaemonStatus, RegisteredRepo } from '../../shared/types.js';
import { getLogger } from '../../shared/logger.js';

const log = getLogger('cli');

const __dirname = dirname(fileURLToPath(import.meta.url));
// Daemon entry point relative to this compiled file's location
const DAEMON_ENTRY = join(__dirname, '../../daemon/index.js');

export function registerDaemonCommands(program: Command): void {
  const daemon = program.command('daemon').description('manage the background indexer daemon');

  daemon
    .command('start')
    .description('start the daemon in the background')
    .action(cmdStart);

  daemon
    .command('stop')
    .description('gracefully stop the running daemon')
    .action(cmdStop);

  daemon
    .command('status')
    .description('show daemon health and indexing queue')
    .action(cmdStatus);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdStart(): Promise<void> {
  if (existsSync(PATHS.pidFile)) {
    // Let the daemon itself check for a stale PID; just warn here
    log.warn('daemon may already be running (pid file exists)');
  }

  mkdirSync(PATHS.logDir, { recursive: true });
  const logFd = openSync(PATHS.daemonLog, 'a');

  // Spawn via tsx so the daemon runs from TypeScript source directly
  const child = spawn(
    process.execPath,
    ['--import', 'tsx/esm', DAEMON_ENTRY],
    {
      detached: true,
      stdio:    ['ignore', logFd, logFd],
      env:      { ...process.env },
    },
  );
  child.unref();

  // Wait up to 3 s for the PID file to appear
  for (let i = 0; i < 30; i++) {
    await sleep(100);
    if (existsSync(PATHS.pidFile)) {
      log.info('daemon started (log: ' + PATHS.daemonLog + ')');
      return;
    }
  }
  log.warn('daemon may have failed to start — check ' + PATHS.daemonLog);
}

async function cmdStop(): Promise<void> {
  try {
    await rpc('daemon.shutdown');
    // Wait for PID file to disappear (up to 5 s)
    for (let i = 0; i < 50; i++) {
      await sleep(100);
      if (!existsSync(PATHS.pidFile)) {
        log.info('daemon stopped');
        return;
      }
    }
    log.warn('daemon did not stop within 5 s');
  } catch (err) {
    log.error(String(err));
  }
}

async function cmdStatus(): Promise<void> {
  try {
    const status = await rpc<DaemonStatus>('daemon.status');
    const uptime = formatUptime(status.uptime);
    log.info(`status:  running  (uptime ${uptime})`);
    log.info(`queue:   ${status.queueDepth} job(s) pending`);
    if (status.modelPullStatus === 'pulling') {
      log.info(`model:   pulling ${status.modelPullPct ?? 0}%`);
    } else {
      log.info(`model:   ready`);
    }
    if (status.repos.length === 0) {
      log.info('repos:   none registered');
    } else {
      log.info('repos:');
      for (const r of status.repos) printRepo(r);
    }
  } catch (err) {
    log.error(String(err));
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function printRepo(r: RegisteredRepo): void {
  const when = r.lastIndexed
    ? new Date(r.lastIndexed).toLocaleString()
    : 'never';
  log.info(`  [${r.status.padEnd(8)}] ${r.path}  (last indexed: ${when})`);
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
