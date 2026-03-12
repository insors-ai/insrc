import { readFileSync, existsSync } from 'node:fs';
import { PATHS } from '../shared/paths.js';
import type { AgentConfig } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('config');

const DEFAULT_CONTEXT = {
  local: 131_072,       // 128K — conservative default; qwen3-coder supports 262K
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
// Helpers
// ---------------------------------------------------------------------------

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
      context: mergeContext(defaults.models.context, models['context']),
    },
    keys: {
      anthropic: keys['anthropic'] ?? defaults.keys.anthropic,
      brave:     keys['brave']     ?? defaults.keys.brave,
    },
    permissions: {
      mode: permissions['mode'] === 'auto-accept' ? 'auto-accept' : defaults.permissions.mode,
    },
  };
}
