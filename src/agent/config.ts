import { readFileSync, existsSync } from 'node:fs';
import { PATHS } from '../shared/paths.js';
import type { AgentConfig, AgentProviderConfigs, Intent, LLMProvider, StepBinding } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';
import { ClaudeProvider } from './providers/claude.js';

const log = getLogger('config');

const DEFAULT_CONTEXT = {
  local: 16_384,        // 16K — fits RTX 4060 Ti 16GB without layer spill; adjust in config.json
  localMaxOutput: 8_192,
  claude: 200_000,      // 200K
  claudeMaxOutput: 8_192,
  charsPerToken: 3,
};

const DEFAULT_CONFIG: AgentConfig = {
  ollama: {
    host: 'http://localhost:11434',
  },
  models: {
    local: 'qwen3-coder:latest',
    embedding: 'qwen3-embedding:4b',
    embeddingDim: 2560,
    tiers: {
      fast: 'claude-haiku-4-5',
      standard: 'claude-sonnet-4-6',
      powerful: 'claude-opus-4-6',
    },
    roles: {},
    context: { ...DEFAULT_CONTEXT },
  },
  keys: {},
  permissions: {
    mode: 'validate',
  },
  routing: {
    mode: 'static',
  },
};

/**
 * Load agent config from ~/.insrc/config.json, merged with defaults.
 * Missing fields fall back to defaults. Invalid JSON logs a warning and uses defaults.
 */
export function loadConfig(): AgentConfig {
  if (!existsSync(PATHS.config)) return { ...DEFAULT_CONFIG };

  try {
    const raw = JSON.parse(readFileSync(PATHS.config, 'utf8')) as Record<string, unknown>;
    return mergeConfig(DEFAULT_CONFIG, raw);
  } catch (err) {
    log.warn({ err }, `failed to parse ${PATHS.config}`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Load config with project-level overrides merged in.
 * Falls back to global config if no project config exists.
 */
export async function loadConfigForRepo(repoPath: string): Promise<AgentConfig> {
  const { resolveConfig } = await import('../config/loader.js');
  return resolveConfig(repoPath);
}

/**
 * Resolve the Claude model name for a given role.
 *
 * Lookup order:
 *   1. roles[role] → if it's a model ID (contains 'claude-'), use directly
 *   2. roles[role] → if it's a tier name ('fast'/'standard'/'powerful'), resolve via tiers
 *   3. Fall back to the tier default for the role category
 */
export function resolveModel(config: AgentConfig, role: string): string {
  const roleValue = config.models.roles[role];

  if (roleValue) {
    if (roleValue.includes('claude-')) return roleValue;
    const tier = roleValue as keyof typeof config.models.tiers;
    if (tier in config.models.tiers) return config.models.tiers[tier];
  }

  // Default tier mapping based on role prefix
  if (role.includes('validate') || role.includes('escalation') || role === 'document.review') {
    return config.models.tiers.fast;
  }
  return config.models.tiers.standard;
}

// ---------------------------------------------------------------------------
// Provider resolver — per-agent step-level provider selection
// ---------------------------------------------------------------------------

/**
 * Resolves LLM providers for agent steps based on config.
 *
 * Each agent has named steps (e.g. 'implement'/'generate', 'designer'/'review').
 * Steps can be bound to 'local' or 'claude' via `config.models.agents`.
 * Unbound steps fall back to the local provider.
 */
export class ProviderResolver {
  constructor(
    private readonly config: AgentConfig,
    private readonly local: LLMProvider,
    private readonly claude: LLMProvider | null,
  ) {}

  /**
   * Resolve provider for an agent step. Returns local provider as fallback
   * when Claude is configured but unavailable (no API key).
   */
  resolve(agent: string, step: string): LLMProvider {
    return this.doResolve(agent, step, false) ?? this.local;
  }

  /**
   * Like resolve() but returns null when the step maps to Claude and Claude
   * is unavailable. Used for optional-Claude slots (validate, enhance).
   */
  resolveOrNull(agent: string, step: string): LLMProvider | null {
    return this.doResolve(agent, step, true);
  }

  private doResolve(agent: string, step: string, nullOnMissing: boolean): LLMProvider | null {
    const agentCfg = this.config.models.agents;
    const binding = agentCfg?.[agent as keyof AgentProviderConfigs]?.[step];

    // No binding → default behavior (local, or null for optional slots)
    if (binding === undefined) {
      return nullOnMissing ? this.claude : this.local;
    }

    const parsed = parseBinding(binding, this.config);

    if (parsed.provider === 'local') {
      return this.local;
    }

    // Claude requested — need API key (from config or environment)
    const apiKey = this.config.keys.anthropic ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      if (nullOnMissing) return null;
      log.warn(`Claude configured for ${agent}.${step} but no API key — falling back to local`);
      return this.local;
    }

    return new ClaudeProvider({
      model: parsed.model,
      apiKey,
    });
  }
}

/** Parse a string or StepBinding into a resolved { provider, model }. */
function parseBinding(
  binding: string | StepBinding,
  config: AgentConfig,
): { provider: 'local' | 'claude'; model: string } {
  if (typeof binding === 'string') {
    if (binding === 'local') {
      return { provider: 'local', model: config.models.local };
    }
    if (binding === 'claude') {
      return { provider: 'claude', model: config.models.tiers.standard };
    }
    // Tier name → Claude with that tier
    if (binding in config.models.tiers) {
      const tier = binding as keyof typeof config.models.tiers;
      return { provider: 'claude', model: config.models.tiers[tier] };
    }
    // Explicit model name
    if (binding.includes('claude-')) {
      return { provider: 'claude', model: binding };
    }
    // Unknown string → treat as local model name
    return { provider: 'local', model: binding };
  }

  // StepBinding object
  if (binding.provider === 'local') {
    return { provider: 'local', model: binding.model ?? config.models.local };
  }

  // Claude binding
  const model = binding.model
    ?? (binding.tier ? config.models.tiers[binding.tier] : undefined)
    ?? config.models.tiers.standard;
  return { provider: 'claude', model };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeAgents(raw: unknown): AgentProviderConfigs | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  // Pass through — runtime validation happens in ProviderResolver.parseBinding
  return raw as AgentProviderConfigs;
}

function mergeIntentDefaults(raw: unknown): Partial<Record<Intent, 'local' | 'claude'>> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return raw as Partial<Record<Intent, 'local' | 'claude'>>;
}

function mergeContext(
  defaults: AgentConfig['models']['context'],
  raw: unknown,
): AgentConfig['models']['context'] {
  if (typeof raw !== 'object' || raw === null) return { ...defaults };
  const ctx = raw as Record<string, unknown>;
  return {
    local:          typeof ctx['local'] === 'number' ? ctx['local'] : defaults.local,
    localMaxOutput: typeof ctx['localMaxOutput'] === 'number' ? ctx['localMaxOutput'] : defaults.localMaxOutput,
    claude:         typeof ctx['claude'] === 'number' ? ctx['claude'] : defaults.claude,
    claudeMaxOutput:typeof ctx['claudeMaxOutput'] === 'number' ? ctx['claudeMaxOutput'] : defaults.claudeMaxOutput,
    charsPerToken:  typeof ctx['charsPerToken'] === 'number' ? ctx['charsPerToken'] : defaults.charsPerToken,
  };
}

function mergeConfig(defaults: AgentConfig, raw: Record<string, unknown>): AgentConfig {
  const ollama = typeof raw['ollama'] === 'object' && raw['ollama'] !== null
    ? raw['ollama'] as Record<string, unknown>
    : {};

  const models = typeof raw['models'] === 'object' && raw['models'] !== null
    ? raw['models'] as Record<string, unknown>
    : {};

  const tiers = typeof models['tiers'] === 'object' && models['tiers'] !== null
    ? models['tiers'] as Record<string, string>
    : {};

  const keys = typeof raw['keys'] === 'object' && raw['keys'] !== null
    ? raw['keys'] as Record<string, string>
    : {};

  const permissions = typeof raw['permissions'] === 'object' && raw['permissions'] !== null
    ? raw['permissions'] as Record<string, unknown>
    : {};

  const routing = typeof raw['routing'] === 'object' && raw['routing'] !== null
    ? raw['routing'] as Record<string, unknown>
    : {};

  return {
    ollama: {
      host: (typeof ollama['host'] === 'string' ? ollama['host'] : defaults.ollama.host),
    },
    models: {
      local: (typeof models['local'] === 'string' ? models['local'] : defaults.models.local),
      embedding: (typeof models['embedding'] === 'string' ? models['embedding'] : defaults.models.embedding),
      embeddingDim: (typeof models['embeddingDim'] === 'number' ? models['embeddingDim'] : defaults.models.embeddingDim),
      tiers: {
        fast:     tiers['fast']     ?? defaults.models.tiers.fast,
        standard: tiers['standard'] ?? defaults.models.tiers.standard,
        powerful: tiers['powerful'] ?? defaults.models.tiers.powerful,
      },
      roles: (typeof models['roles'] === 'object' && models['roles'] !== null
        ? models['roles'] as Record<string, string>
        : defaults.models.roles),
      agents: mergeAgents(models['agents']),
      intentDefaults: mergeIntentDefaults(models['intentDefaults']),
      context: mergeContext(defaults.models.context, models['context']),
    },
    keys: {
      anthropic: keys['anthropic'] ?? defaults.keys.anthropic,
      brave:     keys['brave']     ?? defaults.keys.brave,
    },
    permissions: {
      mode: permissions['mode'] === 'auto-accept' ? 'auto-accept' : defaults.permissions.mode,
    },
    routing: {
      mode: routing['mode'] === 'auto' ? 'auto' : (defaults.routing?.mode ?? 'static'),
    },
  };
}
