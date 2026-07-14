import pino from 'pino';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { PATHS } from './paths.js';

// ---------------------------------------------------------------------------
// Ensure log directory exists
// ---------------------------------------------------------------------------

try { mkdirSync(PATHS.logDir, { recursive: true }); } catch { /* ok */ }

// ---------------------------------------------------------------------------
// Mode detection
// ---------------------------------------------------------------------------

export type LogMode = 'daemon' | 'cli' | 'mcp';

let _mode: LogMode = 'cli';

/** Call once at process entry to set the logging mode. */
export function setLogMode(mode: LogMode): void {
  _mode = mode;
}

/** Get the current logging mode. */
export function getLogMode(): LogMode {
  return process.env.INSRC_MODE as LogMode ?? _mode;
}

// ---------------------------------------------------------------------------
// Log level
// ---------------------------------------------------------------------------

const VALID_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];

function resolveLevel(): pino.Level {
  // 1. Check config.json (highest priority)
  try {
    const configPath = join(homedir(), '.insrc', 'config.json');
    const raw = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    const configLevel = config['logLevel'] as string | undefined;
    if (configLevel && VALID_LEVELS.includes(configLevel)) {
      return configLevel as pino.Level;
    }
  } catch { /* config missing or malformed — fall through */ }

  // 2. Check env var
  const env = process.env.INSRC_LOG_LEVEL;
  if (env && VALID_LEVELS.includes(env)) {
    return env as pino.Level;
  }

  return 'info';
}

// ---------------------------------------------------------------------------
// Transport builders
// ---------------------------------------------------------------------------

function buildDaemonTransport(): pino.TransportMultiOptions {
  return {
    targets: [
      {
        target: 'pino-roll',
        options: {
          file: PATHS.daemonLog,
          frequency: 'daily',
          limit: { count: 7 },
          size: '10m',
          mkdir: true,
        },
        level: resolveLevel(),
      },
    ],
  };
}

/**
 * MCP transport -- like the CLI transport, but pretty-print destination
 * is stderr (fd 2) so stdout stays clean for the MCP protocol stream.
 * The rotating file sink still writes to `PATHS.agentLog` so operator
 * inspection matches the daemon + CLI paths.
 */
function buildMcpTransport(): pino.TransportMultiOptions {
  return {
    targets: [
      {
        target: 'pino-pretty',
        options: {
          destination: 2, // stderr -- MCP protocol owns stdout
          colorize: false,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          messageFormat: '{if module}[{module}] {end}{msg}',
        },
        level: resolveLevel(),
      },
      {
        target: 'pino-roll',
        options: {
          file: PATHS.agentLog,
          frequency: 'daily',
          limit: { count: 7 },
          size: '10m',
          mkdir: true,
        },
        level: resolveLevel(),
      },
    ],
  };
}

function buildCliTransport(): pino.TransportMultiOptions {
  return {
    targets: [
      {
        target: 'pino-pretty',
        options: {
          destination: 1, // stdout
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          messageFormat: '{if module}[{module}] {end}{msg}',
        },
        level: resolveLevel(),
      },
      {
        target: 'pino-roll',
        options: {
          file: PATHS.agentLog,
          frequency: 'daily',
          limit: { count: 7 },
          size: '10m',
          mkdir: true,
        },
        level: resolveLevel(),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Root logger (lazy singleton)
// ---------------------------------------------------------------------------

let _root: pino.Logger | null = null;

function getRoot(): pino.Logger {
  if (_root) return _root;

  const mode = getLogMode();
  const transport = mode === 'daemon'
    ? buildDaemonTransport()
    : mode === 'mcp'
      ? buildMcpTransport()
      : buildCliTransport();

  _root = pino({
    level: resolveLevel(),
    transport,
  });

  return _root;
}

// ---------------------------------------------------------------------------
// Child logger cache
// ---------------------------------------------------------------------------

const _children = new Map<string, pino.Logger>();

/**
 * Get a child logger for a module.
 *
 * ```ts
 * import { getLogger } from '../shared/logger.js';
 * const log = getLogger('daemon');
 * log.info('started');           // → [daemon] started
 * log.error({ err }, 'failed');  // → structured error with stack
 * ```
 */
export function getLogger(module: string): pino.Logger {
  let child = _children.get(module);
  if (child) return child;

  child = getRoot().child({ module });
  _children.set(module, child);
  return child;
}

// ---------------------------------------------------------------------------
// Bridge: pino → (msg: string) => void
// ---------------------------------------------------------------------------

/**
 * Adapt a pino logger to the `(msg: string) => void` signature used by
 * task pipelines and other injectable log parameters.
 */
export function toLogFn(logger: pino.Logger): (msg: string) => void {
  return (msg: string) => logger.info(msg);
}
