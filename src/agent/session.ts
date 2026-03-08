import { randomUUID } from 'node:crypto';
import type { AgentConfig } from '../shared/types.js';
import { OllamaProvider } from './providers/ollama.js';
import { ClaudeProvider } from './providers/claude.js';
import { ContextManager, initSession } from './context/index.js';

export interface SessionOpts {
  repoPath: string;
  config: AgentConfig;
}

export class Session {
  readonly id: string;
  readonly repoPath: string;
  readonly config: AgentConfig;

  turnIndex = 0;
  closureRepos: string[] = [];

  /** Runtime permission mode — can be toggled with /toggle-permissions */
  permissionMode: 'validate' | 'auto-accept';

  /** Layered context manager (L1–L4). */
  contextManager!: ContextManager;

  /** Exposed for the router — do not use directly for LLM calls. */
  readonly ollamaProvider: OllamaProvider;
  /** Exposed for the router — null when no API key is configured. */
  readonly claudeProvider: ClaudeProvider | null;

  constructor(opts: SessionOpts) {
    this.id = randomUUID();
    this.repoPath = opts.repoPath;
    this.config = opts.config;

    this.permissionMode = opts.config.permissions.mode;

    this.ollamaProvider = new OllamaProvider(
      opts.config.models.local,
      opts.config.ollama.host,
    );

    this.claudeProvider = opts.config.keys.anthropic
      ? new ClaudeProvider({
          model: opts.config.models.tiers.standard,
          apiKey: opts.config.keys.anthropic,
        })
      : null;
  }

  async init(): Promise<void> {
    this.closureRepos = await initSession(this.repoPath);
    this.contextManager = new ContextManager({
      repoPath: this.repoPath,
      closureRepos: this.closureRepos,
      provider: this.ollamaProvider,
    });
  }

  get ollamaAvailable(): Promise<boolean> {
    return this.ollamaProvider.ping();
  }

  get hasClaudeKey(): boolean {
    return this.claudeProvider !== null;
  }
}
