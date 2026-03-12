import { randomUUID } from 'node:crypto';
import type { AgentConfig } from '../shared/types.js';
import { OllamaProvider } from './providers/ollama.js';
import { ClaudeProvider } from './providers/claude.js';
import { ContextManager, initSession } from './context/index.js';
import { embedText } from './context/semantic.js';
import { sessionClose, sessionSeed, sessionForget } from './tools/mcp-client.js';
import { HealthMonitor, type HealthSnapshot, type ComponentState } from './faults/index.js';

export interface SessionOpts {
  repoPath: string;
  config: AgentConfig;
}

/** Cumulative cost tracking for Claude API usage. */
export interface CostTracker {
  inputTokens: number;
  outputTokens: number;
  turns: number;
}

export class Session {
  readonly id: string;
  readonly repoPath: string;
  readonly config: AgentConfig;
  readonly startedAt: number;

  turnIndex = 0;
  closureRepos: string[] = [];

  /** Runtime permission mode — can be toggled with /toggle-permissions */
  permissionMode: 'validate' | 'auto-accept';

  /** Layered context manager (L1–L4). */
  contextManager!: ContextManager;

  /** Cumulative Claude API cost tracking. */
  readonly cost: CostTracker = { inputTokens: 0, outputTokens: 0, turns: 0 };

  /** Entity IDs seen across all turns (for session close). */
  private readonly seenEntities = new Set<string>();

  /** Exposed for the router — do not use directly for LLM calls. */
  readonly ollamaProvider: OllamaProvider;
  /** Exposed for the router — null when no API key is configured. */
  readonly claudeProvider: ClaudeProvider | null;

  /** Health monitor for Ollama and daemon (Phase 12). */
  readonly health: HealthMonitor;

  constructor(opts: SessionOpts) {
    this.id = randomUUID();
    this.repoPath = opts.repoPath;
    this.config = opts.config;
    this.startedAt = Date.now();

    this.permissionMode = opts.config.permissions.mode;

    this.ollamaProvider = new OllamaProvider(
      opts.config.models.local,
      opts.config.ollama.host,
      opts.config.models.context.local,
    );

    this.claudeProvider = opts.config.keys.anthropic
      ? new ClaudeProvider({
          model: opts.config.models.tiers.standard,
          apiKey: opts.config.keys.anthropic,
        })
      : null;

    // Health monitor — ping functions injected to avoid circular deps
    this.health = new HealthMonitor({
      pingOllama: () => this.ollamaProvider.ping(),
      pingDaemon: async () => {
        const { ping } = await import('./tools/mcp-client.js');
        return ping();
      },
    });
  }

  async init(): Promise<void> {
    this.closureRepos = await initSession(this.repoPath);
    this.contextManager = new ContextManager({
      repoPath: this.repoPath,
      closureRepos: this.closureRepos,
      provider: this.ollamaProvider,
    });

    // Start periodic health checks (30s interval, unref'd)
    this.health.start();
  }

  /** Track entity IDs referenced in a turn. */
  trackEntities(entityIds: string[]): void {
    for (const id of entityIds) this.seenEntities.add(id);
  }

  /**
   * Seed L2 summary from prior sessions for the same repo.
   * Called once after the first user message is received.
   */
  async seedFromPriorSessions(openingMessage: string): Promise<string | null> {
    const queryVector = await embedText(this.ollamaProvider, openingMessage);
    if (queryVector.length === 0) return null;

    const priors = await sessionSeed(this.repoPath, queryVector);
    if (priors.length === 0) return null;

    const seed = priors.map(s => s.summary).filter(Boolean).join('\n\n');
    return seed || null;
  }

  /**
   * Close the session: promote L2 summary to persistent store, delete raw turns.
   * Called on /exit or SIGINT.
   */
  async close(): Promise<void> {
    // Stop periodic health checks
    this.health.stop();

    const summary = this.contextManager.getSummary();
    if (!summary) return; // Nothing to persist if no summary was generated

    const summaryVector = await embedText(this.ollamaProvider, summary);

    await sessionClose({
      id: this.id,
      repo: this.repoPath,
      summary,
      seenEntities: [...this.seenEntities],
      summaryVector,
    });
  }

  /** Delete all session summaries for the current repo (/forget). */
  async forget(): Promise<void> {
    await sessionForget(this.repoPath);
  }

  /** Whether Ollama is usable (healthy or degraded). Falls back to live ping. */
  get ollamaAvailable(): Promise<boolean> {
    // If health monitor has data, use cached state for fast path
    if (this.health.snapshot().ollama.lastOk > 0 || this.health.snapshot().ollama.lastFail > 0) {
      return Promise.resolve(this.health.ollamaUsable);
    }
    // First call before any health check — do a live ping
    return this.ollamaProvider.ping();
  }

  /** Get current health snapshot. */
  healthSnapshot(): HealthSnapshot {
    return this.health.snapshot();
  }

  get hasClaudeKey(): boolean {
    return this.claudeProvider !== null;
  }
}
