import { randomUUID } from 'node:crypto';
import type { LLMMessage, AgentConfig } from '../shared/types.js';
import { OllamaProvider } from './providers/ollama.js';
import { ClaudeProvider } from './providers/claude.js';
import { initSession } from './context.js';

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

  /** Exposed for the router — do not use directly for LLM calls. */
  readonly ollamaProvider: OllamaProvider;
  /** Exposed for the router — null when no API key is configured. */
  readonly claudeProvider: ClaudeProvider | null;

  constructor(opts: SessionOpts) {
    this.id = randomUUID();
    this.repoPath = opts.repoPath;
    this.config = opts.config;

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
  }

  get ollamaAvailable(): Promise<boolean> {
    return this.ollamaProvider.ping();
  }

  get hasClaudeKey(): boolean {
    return this.claudeProvider !== null;
  }

  buildSystemPrompt(): LLMMessage {
    const repos = this.closureRepos.length > 1
      ? `Repos in scope: ${this.closureRepos.join(', ')}`
      : `Repo: ${this.repoPath}`;

    return {
      role: 'system',
      content: [
        'You are insrc, a local-first hybrid coding assistant.',
        'You help developers understand, modify, test, and debug code.',
        'You have access to a Code Knowledge Graph (Kuzu + LanceDB) for structural queries.',
        'Be concise. Cite file paths and line numbers when referencing code.',
        '',
        repos,
      ].join('\n'),
    };
  }
}
