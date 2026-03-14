/**
 * Provider override parsing from gate feedback and step-level resolution.
 *
 * Supports @local, @haiku, @sonnet, @opus at any gate to override the
 * next LLM step's provider. @sticky <provider> locks for the remainder
 * of the session; @clear reverts to config/defaults.
 *
 * Generic — shared across brainstorm, pair, delegate, and any future agents.
 */

import type { LLMProvider, AgentConfig } from '../../shared/types.js';
import type { AgentState, StepContext } from './types.js';
import { ClaudeProvider } from '../providers/claude.js';

// ---------------------------------------------------------------------------
// Provider override type
// ---------------------------------------------------------------------------

export interface ProviderOverride {
  provider: { kind: 'local' } | { kind: 'claude'; tier: string } | null;
  sticky: boolean;
}

// ---------------------------------------------------------------------------
// Mention parsing
// ---------------------------------------------------------------------------

const PROVIDER_MAP: Record<string, ProviderOverride['provider']> = {
  local:  { kind: 'local' },
  haiku:  { kind: 'claude', tier: 'fast' },
  sonnet: { kind: 'claude', tier: 'standard' },
  opus:   { kind: 'claude', tier: 'powerful' },
};

/**
 * Parse a provider @-mention from gate feedback text.
 * Returns the override (if any) and the feedback with the mention stripped.
 */
export function parseProviderMention(feedback: string): {
  override: ProviderOverride | null;
  cleanFeedback: string;
} {
  const trimmed = feedback.trimStart();

  // @sticky <provider>
  const stickyRe = /^@sticky\s+(local|haiku|sonnet|opus)\b\s*/i;
  const stickyMatch = trimmed.match(stickyRe);
  if (stickyMatch) {
    const provider = PROVIDER_MAP[stickyMatch[1]!.toLowerCase()];
    return {
      override: { provider: provider!, sticky: true },
      cleanFeedback: trimmed.slice(stickyMatch[0].length).trim(),
    };
  }

  // @clear
  const clearRe = /^@clear\b\s*/i;
  const clearMatch = trimmed.match(clearRe);
  if (clearMatch) {
    return {
      override: { provider: null, sticky: false },
      cleanFeedback: trimmed.slice(clearMatch[0].length).trim(),
    };
  }

  // @local / @haiku / @sonnet / @opus (one-shot)
  const mentionRe = /^@(local|haiku|sonnet|opus)\b\s*/i;
  const match = trimmed.match(mentionRe);
  if (match) {
    const provider = PROVIDER_MAP[match[1]!.toLowerCase()];
    return {
      override: { provider: provider!, sticky: false },
      cleanFeedback: trimmed.slice(match[0].length).trim(),
    };
  }

  return { override: null, cleanFeedback: feedback };
}

// ---------------------------------------------------------------------------
// Step-level provider resolution (generic over any state with providerOverride)
// ---------------------------------------------------------------------------

/** Any agent state that carries a providerOverride field. */
export interface HasProviderOverride extends AgentState {
  providerOverride?: ProviderOverride | undefined;
}

/**
 * Resolve the LLM provider for an agent step.
 *
 * Priority:
 *   1. @-mention override in state.providerOverride
 *   2. Config binding via ctx.providers.resolve(agentName, step)
 *   3. Step default (handled by ProviderResolver when no config)
 */
export function resolveStepProvider<S extends HasProviderOverride>(
  ctx: StepContext,
  state: S,
  agentName: string,
  stepName: string,
): LLMProvider {
  const override = state.providerOverride;
  if (override?.provider) {
    if (override.provider.kind === 'local') {
      return ctx.providers.local;
    }
    // Claude with specific tier
    const apiKey = ctx.config.keys.anthropic ?? process.env['ANTHROPIC_API_KEY'];
    if (apiKey) {
      const tier = override.provider.tier as keyof AgentConfig['models']['tiers'];
      const model = ctx.config.models.tiers[tier];
      return new ClaudeProvider({ model, apiKey });
    }
    // No API key — fall through to config/default
  }

  return ctx.providers.resolve(agentName, stepName);
}

// ---------------------------------------------------------------------------
// Override lifecycle
// ---------------------------------------------------------------------------

/**
 * Consume a non-sticky override after an LLM call.
 * Returns updated state with the override cleared (or kept if sticky).
 */
export function consumeOverride<S extends HasProviderOverride>(state: S): S {
  if (!state.providerOverride) return state;
  if (state.providerOverride.sticky) return state;
  // Clear non-sticky override
  return { ...state, providerOverride: undefined };
}

/**
 * Apply a parsed provider override to state.
 * A null provider (from @clear) removes any existing override.
 */
export function applyOverride<S extends HasProviderOverride>(
  state: S,
  override: ProviderOverride,
): S {
  if (override.provider === null) {
    return { ...state, providerOverride: undefined };
  }
  return { ...state, providerOverride: override };
}
