/**
 * Health Monitor — tracks Ollama and daemon availability.
 *
 * State machine per component:
 *   healthy → degraded → unavailable
 *
 * Transitions:
 *   healthy → degraded: single failed ping
 *   degraded → unavailable: 2 consecutive failed pings
 *   degraded → healthy: successful ping
 *   unavailable → degraded: successful ping (recovery)
 *   unavailable → healthy: 2 consecutive successful pings
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComponentState = 'healthy' | 'degraded' | 'unavailable';

export interface ComponentHealth {
  state: ComponentState;
  /** Timestamp of last successful ping (ms since epoch, 0 = never). */
  lastOk: number;
  /** Timestamp of last failed ping (ms since epoch, 0 = never). */
  lastFail: number;
  /** Consecutive failures since last success. */
  consecutiveFailures: number;
  /** Consecutive successes since last failure. */
  consecutiveSuccesses: number;
}

export interface HealthSnapshot {
  ollama: ComponentHealth;
  daemon: ComponentHealth;
}

export type HealthChangeCallback = (
  component: 'ollama' | 'daemon',
  prev: ComponentState,
  next: ComponentState,
) => void;

// ---------------------------------------------------------------------------
// HealthMonitor
// ---------------------------------------------------------------------------

/** Default check interval: 30 seconds. */
export const DEFAULT_CHECK_INTERVAL_MS = 30_000;

export class HealthMonitor {
  private readonly ollamaHealth: ComponentHealth;
  private readonly daemonHealth: ComponentHealth;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private onChange: HealthChangeCallback | null = null;

  /** Ping functions injected by the caller (avoids circular deps). */
  private readonly pingOllama: () => Promise<boolean>;
  private readonly pingDaemon: () => Promise<boolean>;

  constructor(opts: {
    pingOllama: () => Promise<boolean>;
    pingDaemon: () => Promise<boolean>;
    onChange?: HealthChangeCallback;
  }) {
    this.pingOllama = opts.pingOllama;
    this.pingDaemon = opts.pingDaemon;
    this.onChange = opts.onChange ?? null;

    this.ollamaHealth = freshHealth();
    this.daemonHealth = freshHealth();
  }

  /** Start periodic health checks. */
  start(intervalMs = DEFAULT_CHECK_INTERVAL_MS): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => void this.check(), intervalMs);
    // Don't prevent process exit
    if (this.intervalHandle && typeof this.intervalHandle === 'object' && 'unref' in this.intervalHandle) {
      (this.intervalHandle as NodeJS.Timeout).unref();
    }
  }

  /** Stop periodic health checks. */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /** Run one health check cycle for both components. */
  async check(): Promise<HealthSnapshot> {
    const [ollamaOk, daemonOk] = await Promise.all([
      this.pingOllama(),
      this.pingDaemon(),
    ]);

    this.recordResult('ollama', this.ollamaHealth, ollamaOk);
    this.recordResult('daemon', this.daemonHealth, daemonOk);

    return this.snapshot();
  }

  /** Record the result of an external Ollama operation (e.g. a failed LLM call). */
  recordOllamaResult(ok: boolean): void {
    this.recordResult('ollama', this.ollamaHealth, ok);
  }

  /** Record the result of an external daemon operation (e.g. a failed RPC). */
  recordDaemonResult(ok: boolean): void {
    this.recordResult('daemon', this.daemonHealth, ok);
  }

  /** Get current health snapshot. */
  snapshot(): HealthSnapshot {
    return {
      ollama: { ...this.ollamaHealth },
      daemon: { ...this.daemonHealth },
    };
  }

  /** Get Ollama state. */
  get ollamaState(): ComponentState {
    return this.ollamaHealth.state;
  }

  /** Get daemon state. */
  get daemonState(): ComponentState {
    return this.daemonHealth.state;
  }

  /** Whether Ollama is usable (healthy or degraded). */
  get ollamaUsable(): boolean {
    return this.ollamaHealth.state !== 'unavailable';
  }

  /** Whether daemon is usable (healthy or degraded). */
  get daemonUsable(): boolean {
    return this.daemonHealth.state !== 'unavailable';
  }

  /** Set callback for state changes. */
  setOnChange(cb: HealthChangeCallback | null): void {
    this.onChange = cb;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private recordResult(
    component: 'ollama' | 'daemon',
    health: ComponentHealth,
    ok: boolean,
  ): void {
    const prev = health.state;
    const now = Date.now();

    if (ok) {
      health.lastOk = now;
      health.consecutiveFailures = 0;
      health.consecutiveSuccesses++;
      health.state = transition(health.state, true, health.consecutiveSuccesses);
    } else {
      health.lastFail = now;
      health.consecutiveSuccesses = 0;
      health.consecutiveFailures++;
      health.state = transition(health.state, false, health.consecutiveFailures);
    }

    if (prev !== health.state && this.onChange) {
      this.onChange(component, prev, health.state);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshHealth(): ComponentHealth {
  return {
    state: 'healthy',
    lastOk: 0,
    lastFail: 0,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
  };
}

/**
 * State transition logic.
 *
 * On failure:
 *   healthy → degraded (1st failure)
 *   degraded → unavailable (2nd consecutive failure)
 *   unavailable stays unavailable
 *
 * On success:
 *   unavailable → degraded (1st success)
 *   degraded → healthy (1st success)
 *   healthy stays healthy
 */
function transition(
  current: ComponentState,
  ok: boolean,
  consecutiveCount: number,
): ComponentState {
  if (ok) {
    switch (current) {
      case 'unavailable': return consecutiveCount >= 2 ? 'healthy' : 'degraded';
      case 'degraded': return 'healthy';
      case 'healthy': return 'healthy';
    }
  } else {
    switch (current) {
      case 'healthy': return 'degraded';
      case 'degraded': return 'unavailable';
      case 'unavailable': return 'unavailable';
    }
  }
}
