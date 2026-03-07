import { randomUUID } from 'node:crypto';
import type { LLMMessage, LLMProvider, AgentConfig, ExplicitProvider } from '../shared/types.js';
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

  private readonly ollamaProvider: OllamaProvider;
  private readonly claudeProvider: ClaudeProvider | null;

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

  getProvider(explicit?: ExplicitProvider): LLMProvider {
    if (explicit === 'local') return this.ollamaProvider;

    if (explicit === 'claude' || explicit === 'opus') {
      if (!this.claudeProvider) {
        console.warn('Claude not available (no API key). Using local model.');
        return this.ollamaProvider;
      }
      if (explicit === 'opus') {
        return new ClaudeProvider({
          model: this.config.models.tiers.powerful,
          apiKey: this.config.keys.anthropic,
        });
      }
      return this.claudeProvider;
    }

    return this.ollamaProvider;
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

// ---------------------------------------------------------------------------
// Prefix parsing
// ---------------------------------------------------------------------------

export interface ParsedInput {
  explicit?: ExplicitProvider | undefined;
  message: string;
}

export function parseInput(raw: string): ParsedInput {
  const trimmed = raw.trim();

  if (trimmed.startsWith('@claude ')) {
    return { explicit: 'claude', message: trimmed.slice(8) };
  }
  if (trimmed.startsWith('@opus ')) {
    return { explicit: 'opus', message: trimmed.slice(6) };
  }
  if (trimmed.startsWith('@local ')) {
    return { explicit: 'local', message: trimmed.slice(7) };
  }

  return { message: trimmed };
}
