/**
 * Re-export provider mention utilities from the shared framework location.
 * Brainstorm agent was the original home; now shared across all agents.
 */

export {
  parseProviderMention,
  resolveStepProvider as resolveStepProviderGeneric,
  consumeOverride,
  applyOverride,
  type ProviderOverride,
  type HasProviderOverride,
} from '../../framework/provider-mention.js';

// ---------------------------------------------------------------------------
// Brainstorm-specific convenience wrapper
// ---------------------------------------------------------------------------

import type { StepContext } from '../../framework/types.js';
import type { BrainstormState } from './agent-state.js';
import { resolveStepProvider as _resolveGeneric } from '../../framework/provider-mention.js';
import type { LLMProvider } from '../../../shared/types.js';

/**
 * Resolve provider for a brainstorm step.
 * Thin wrapper that injects the agent name 'brainstorm'.
 */
export function resolveStepProvider(
  ctx: StepContext,
  state: BrainstormState,
  stepName: string,
): LLMProvider {
  return _resolveGeneric(ctx, state, 'brainstorm', stepName);
}
