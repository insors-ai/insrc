import { spawn }      from 'node:child_process';
import { existsSync, openSync } from 'node:fs';
import { mkdirSync }  from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';
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

  daemon
    .command('backup <path>')
    .description('snapshot LMDB + Lance into <path> while the daemon stays running')
    .action(cmdBackup);

  daemon
    .command('compact')
    .description('reclaim freed pages in the LMDB env (mdb_env_copy2 + atomic swap; daemon must be idle)')
    .action(cmdCompact);
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

async function cmdBackup(path: string): Promise<void> {
  const target = isAbsolute(path) ? path : resolve(process.cwd(), path);
  try {
    const result = await rpc<BackupResult>('daemon.backup', { path: target });
    log.info(`backup written to ${result.targetDir}`);
    log.info(`  lmdb:  ${formatBytes(result.lmdbBytes)}`);
    log.info(`  lance: ${formatBytes(result.lanceBytes)}`);
    log.info(`  took:  ${(result.elapsedMs / 1000).toFixed(2)} s`);
  } catch (err) {
    log.error(String(err));
    process.exitCode = 1;
  }
}

interface BackupResult {
  targetDir:  string;
  lmdbBytes:  number;
  lanceBytes: number;
  elapsedMs:  number;
}

interface CompactResult {
  beforeBytes: number;
  afterBytes:  number;
  savedBytes:  number;
  elapsedMs:   number;
}

async function cmdCompact(): Promise<void> {
  try {
    const result = await rpc<CompactResult>('daemon.compact');
    log.info(`compact complete in ${(result.elapsedMs / 1000).toFixed(2)} s`);
    log.info(`  before: ${formatBytes(result.beforeBytes)}`);
    log.info(`  after:  ${formatBytes(result.afterBytes)}`);
    const pctSaved = result.beforeBytes === 0
      ? 0
      : (result.savedBytes / result.beforeBytes) * 100;
    log.info(`  saved:  ${formatBytes(result.savedBytes)} (${pctSaved.toFixed(1)}%)`);
  } catch (err) {
    log.error(String(err));
    process.exitCode = 1;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0)    return '0 B';
  if (bytes < 1024)   return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024)      return `${kb.toFixed(1)} KiB`;
  const mb = kb / 1024;
  if (mb < 1024)      return `${mb.toFixed(1)} MiB`;
  return `${(mb / 1024).toFixed(2)} GiB`;
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
    if (status.lmdbFileSizeMb !== undefined) {
      log.info(`lmdb:    ${status.lmdbFileSizeMb} MiB on disk  (run 'insrc daemon compact' to reclaim freed pages)`);
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
