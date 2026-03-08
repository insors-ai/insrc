import type { AgentConfig, ExplicitProvider, Intent, LLMProvider } from '../shared/types.js';
import { ClaudeProvider } from './providers/claude.js';

// ---------------------------------------------------------------------------
// Intent → default provider mapping (from design doc)
// ---------------------------------------------------------------------------

/** Intents that always escalate to Claude (two-stage: local sketch → Claude enhance) */
const CLAUDE_DEFAULT: Set<Intent> = new Set([
  'requirements', 'design', 'plan', 'review',
]);

/** Intent that uses no LLM at all — pure graph queries */
const NO_LLM: Set<Intent> = new Set(['graph']);

/** All other intents default to local */
// implement, refactor, test, debug, document, research → local

// ---------------------------------------------------------------------------
// Intent → Claude model tier for validation/enhancement
// ---------------------------------------------------------------------------

type Tier = 'fast' | 'standard' | 'powerful';

const INTENT_TIER: Partial<Record<Intent, Tier>> = {
  requirements: 'standard',
  design:       'standard',
  plan:         'standard',
  review:       'standard',
  research:     'standard',
  implement:    'fast',
  refactor:     'fast',
  test:         'fast',
  debug:        'fast',
  document:     'fast',
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export interface RouteResult {
  /** Provider to use for the primary LLM call */
  provider: LLMProvider;
  /** Label for display (e.g. "Local", "Claude Sonnet", "Claude Opus") */
  label: string;
  /** Whether this is a graph-only intent (no LLM needed) */
  graphOnly: boolean;
  /** Claude model tier used (if applicable) */
  tier?: Tier | undefined;
}

export interface RouterDeps {
  ollamaProvider: LLMProvider;
  claudeProvider: ClaudeProvider | null;
  config: AgentConfig;
}

/**
 * Select the provider for a classified intent.
 *
 * Priority:
 *   1. Explicit @provider prefix always wins
 *   2. graph intent → no LLM
 *   3. Claude-default intents (requirements, design, plan, review) → Claude
 *   4. Everything else → local (Ollama)
 *
 * Falls back to local if Claude is requested but unavailable.
 */
export function selectProvider(
  intent: Intent,
  explicit: ExplicitProvider | undefined,
  deps: RouterDeps,
): RouteResult {
  const { ollamaProvider, claudeProvider, config } = deps;

  // Explicit @local → always local
  if (explicit === 'local') {
    return { provider: ollamaProvider, label: 'Local', graphOnly: false };
  }

  // Explicit @opus → Claude Opus
  if (explicit === 'opus') {
    if (!claudeProvider) {
      console.warn('[router] Claude not available (no API key). Using local model.');
      return { provider: ollamaProvider, label: 'Local (Claude unavailable)', graphOnly: false };
    }
    const provider = new ClaudeProvider({
      model: config.models.tiers.powerful,
      apiKey: config.keys.anthropic,
    });
    return { provider, label: 'Claude Opus', graphOnly: false, tier: 'powerful' };
  }

  // Explicit @claude → Claude at the standard tier for this intent
  if (explicit === 'claude') {
    if (!claudeProvider) {
      console.warn('[router] Claude not available (no API key). Using local model.');
      return { provider: ollamaProvider, label: 'Local (Claude unavailable)', graphOnly: false };
    }
    const tier = INTENT_TIER[intent] ?? 'standard';
    const model = config.models.tiers[tier];
    const provider = new ClaudeProvider({
      model,
      apiKey: config.keys.anthropic,
    });
    return { provider, label: `Claude ${tierLabel(tier)}`, graphOnly: false, tier };
  }

  // Graph intent → no LLM
  if (NO_LLM.has(intent)) {
    // Return ollamaProvider as a placeholder — the graph handler won't call it
    return { provider: ollamaProvider, label: 'Graph (no LLM)', graphOnly: true };
  }

  // Claude-default intents
  if (CLAUDE_DEFAULT.has(intent)) {
    if (!claudeProvider) {
      console.warn('[router] Claude not available for', intent, '— using local model.');
      return { provider: ollamaProvider, label: 'Local (Claude unavailable)', graphOnly: false };
    }
    const tier = INTENT_TIER[intent] ?? 'standard';
    const model = config.models.tiers[tier];
    const provider = new ClaudeProvider({
      model,
      apiKey: config.keys.anthropic,
    });
    return { provider, label: `Claude ${tierLabel(tier)}`, graphOnly: false, tier };
  }

  // Default → local
  return { provider: ollamaProvider, label: 'Local', graphOnly: false };
}

function tierLabel(tier: Tier): string {
  switch (tier) {
    case 'fast':     return 'Haiku';
    case 'standard': return 'Sonnet';
    case 'powerful': return 'Opus';
  }
}
