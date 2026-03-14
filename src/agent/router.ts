import type { AgentConfig, Attachment, ExplicitProvider, Intent, LLMProvider } from '../shared/types.js';
import { ClaudeProvider } from './providers/claude.js';
import { hasEscalationAttachment } from './attachments/router.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('router');

// ---------------------------------------------------------------------------
// Intent → default provider mapping (from design doc)
// ---------------------------------------------------------------------------

/** Base set of intents that default to Claude (overridable via config.models.intentDefaults). */
const CLAUDE_DEFAULT_BASE: ReadonlySet<Intent> = new Set([
  'requirements', 'design', 'brainstorm', 'plan', 'review',
  'deploy', 'release', 'infra',
]);

/** Check whether an intent defaults to Claude, respecting config overrides. */
function isClaudeDefault(intent: Intent, config: AgentConfig): boolean {
  const override = config.models.intentDefaults?.[intent];
  if (override !== undefined) return override === 'claude';
  return CLAUDE_DEFAULT_BASE.has(intent);
}

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
  brainstorm:   'standard',
  plan:         'standard',
  review:       'standard',
  research:     'standard',
  deploy:       'standard',
  release:      'fast',
  infra:        'fast',
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
  /** Whether routing was forced by attachment (image/PDF). */
  attachmentForced?: boolean | undefined;
}

export interface RouterDeps {
  ollamaProvider: LLMProvider;
  claudeProvider: ClaudeProvider | null;
  config: AgentConfig;
  /** Attachments on the current task (if any). */
  attachments?: Attachment[] | undefined;
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
  const { ollamaProvider, claudeProvider, config, attachments } = deps;

  // Attachment-forced escalation: image/PDF → Claude (standard tier, unless @opus)
  if (hasEscalationAttachment(attachments) && explicit !== 'opus') {
    if (!claudeProvider) {
      log.warn('Claude not available for attachment processing (no API key). Using local model.');
      return { provider: ollamaProvider, label: 'Local (Claude unavailable)', graphOnly: false };
    }
    const tier: Tier = 'standard';
    const model = config.models.tiers[tier];
    const provider = new ClaudeProvider({ model, apiKey: config.keys.anthropic });
    return {
      provider,
      label: `Claude ${tierLabel(tier)} (attachment)`,
      graphOnly: false,
      tier,
      attachmentForced: true,
    };
  }

  // Explicit @local → always local
  if (explicit === 'local') {
    return { provider: ollamaProvider, label: 'Local', graphOnly: false };
  }

  // Explicit @opus → Claude Opus
  if (explicit === 'opus') {
    if (!claudeProvider) {
      log.warn('Claude not available (no API key). Using local model.');
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
      log.warn('Claude not available (no API key). Using local model.');
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
  if (isClaudeDefault(intent, config)) {
    if (!claudeProvider) {
      log.warn(`Claude not available for ${intent} — using local model.`);
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
