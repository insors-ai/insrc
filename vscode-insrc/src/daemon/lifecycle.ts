/**
 * Daemon lifecycle management — spawn, health poll, auto-restart.
 *
 * The daemon is spawned as a detached process that outlives any single
 * VS Code window. Multiple windows share the same daemon instance.
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
import { tryConnect, createRpcClient, SOCKET_PATH, type RpcClient } from './rpc';

const PID_PATH = path.join(os.homedir(), '.insrc', 'daemon.pid');
const HEALTH_INTERVAL = 30_000;  // 30s health poll
const POLL_INTERVAL = 500;       // 500ms socket poll during startup
const STARTUP_TIMEOUT = 15_000;  // 15s max wait for daemon
const MAX_RESTART_ATTEMPTS = 3;

export interface DaemonStatus {
  running: boolean;
  uptime?: string;
  queueDepth?: number;
  ollamaAvailable?: boolean;
  modelReady?: boolean;
  repos?: Array<{ path: string; status: string; lastIndexed?: string }>;
}

export interface DaemonManager {
  /** Ensure daemon is running. Spawns if needed. */
  ensureDaemon(): Promise<boolean>;
  /** Get current daemon status via RPC. */
  getStatus(): Promise<DaemonStatus>;
  /** Get the RPC client for making calls. */
  getClient(): RpcClient;
  /** Start health polling. */
  startHealthPolling(onStatusChange: (status: DaemonStatus) => void): void;
  /** Stop health polling and disconnect. */
  dispose(): void;
}

export function createDaemonManager(outputChannel: vscode.OutputChannel): DaemonManager {
  const client = createRpcClient();
  let healthTimer: ReturnType<typeof setInterval> | null = null;
  let restartAttempts = 0;
  let lastStatus: DaemonStatus = { running: false };

  function log(msg: string): void {
    outputChannel.appendLine(`[daemon] ${msg}`);
  }

  /**
   * Check if daemon is running by trying socket connection,
   * then falling back to PID file check.
   */
  async function isDaemonRunning(): Promise<boolean> {
    // Method 1: try connecting to socket
    if (await tryConnect()) {
      return true;
    }

    // Method 2: check PID file
    if (fs.existsSync(PID_PATH)) {
      try {
        const pid = parseInt(fs.readFileSync(PID_PATH, 'utf-8').trim(), 10);
        process.kill(pid, 0); // signal 0 = alive check
        return true;
      } catch {
        // Stale PID file — daemon is dead
        log('stale PID file detected, cleaning up');
        try { fs.unlinkSync(PID_PATH); } catch { /* ignore */ }
      }
    }

    return false;
  }

  /**
   * Spawn the daemon as a detached background process.
   */
  function spawnDaemon(): void {
    log('spawning daemon process...');

    // Find the insrc project root (parent of vscode-insrc/)
    const extensionPath = path.resolve(__dirname, '..', '..');
    const insrcRoot = path.resolve(extensionPath, '..');

    // Check if we can find the daemon entry point
    const daemonEntry = path.join(insrcRoot, 'src', 'cli', 'index.ts');
    if (!fs.existsSync(daemonEntry)) {
      log(`daemon entry not found at ${daemonEntry}, trying npx`);
    }

    const child = spawn('npx', ['tsx', daemonEntry, 'daemon', 'start'], {
      detached: true,
      stdio: 'ignore',
      cwd: insrcRoot,
      env: { ...process.env },
    });

    child.unref();
    log(`daemon spawned (child PID: ${child.pid})`);
  }

  /**
   * Wait for the daemon socket to become available.
   */
  function waitForSocket(timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const start = Date.now();
      const poll = (): void => {
        tryConnect().then((connected) => {
          if (connected) {
            resolve(true);
          } else if (Date.now() - start > timeoutMs) {
            resolve(false);
          } else {
            setTimeout(poll, POLL_INTERVAL);
          }
        }).catch(() => {
          if (Date.now() - start > timeoutMs) {
            resolve(false);
          } else {
            setTimeout(poll, POLL_INTERVAL);
          }
        });
      };
      poll();
    });
  }

  /**
   * Ensure daemon is running. Spawns and waits if needed.
   */
  async function ensureDaemon(): Promise<boolean> {
    if (await isDaemonRunning()) {
      log('daemon already running');
      restartAttempts = 0;
      return true;
    }

    log('daemon not running, starting...');
    spawnDaemon();

    const ready = await waitForSocket(STARTUP_TIMEOUT);
    if (ready) {
      log('daemon ready');
      restartAttempts = 0;
      return true;
    }

    log('daemon failed to start within timeout');
    return false;
  }

  /**
   * Query daemon status via RPC.
   */
  async function getStatus(): Promise<DaemonStatus> {
    try {
      const result = await client.call<{
        uptime?: string;
        queueDepth?: number;
        ollamaAvailable?: boolean;
        modelReady?: boolean;
        repos?: Array<{ path: string; status: string; lastIndexed?: string }>;
      }>('daemon.status');

      lastStatus = {
        running: true,
        uptime: result.uptime,
        queueDepth: result.queueDepth,
        ollamaAvailable: result.ollamaAvailable,
        modelReady: result.modelReady,
        repos: result.repos,
      };

      restartAttempts = 0;
      return lastStatus;
    } catch {
      lastStatus = { running: false };
      return lastStatus;
    }
  }

  /**
   * Start periodic health polling.
   */
  function startHealthPolling(onStatusChange: (status: DaemonStatus) => void): void {
    if (healthTimer) return;

    healthTimer = setInterval(async () => {
      const prevRunning = lastStatus.running;
      const status = await getStatus();

      // Detect daemon crash — was running, now not
      if (prevRunning && !status.running) {
        log('daemon appears to have crashed');

        if (restartAttempts < MAX_RESTART_ATTEMPTS) {
          restartAttempts++;
          log(`auto-restart attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS}`);

          const restarted = await ensureDaemon();
          if (restarted) {
            const newStatus = await getStatus();
            onStatusChange(newStatus);
            return;
          }
        }

        if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
          vscode.window.showErrorMessage(
            'insrc daemon is unavailable. Click to retry.',
            'Retry',
          ).then((action) => {
            if (action === 'Retry') {
              restartAttempts = 0;
              ensureDaemon().then(() => getStatus()).then(onStatusChange);
            }
          });
        }
      }

      onStatusChange(status);
    }, HEALTH_INTERVAL);
  }

  function dispose(): void {
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
    client.disconnect();
    log('disconnected');
  }

  return {
    ensureDaemon,
    getStatus,
    getClient: () => client,
    startHealthPolling,
    dispose,
  };
}
