import type { Intent } from '../shared/types.js';
import type { RouteResult } from './router.js';

// ---------------------------------------------------------------------------
// Escalation announcements
// ---------------------------------------------------------------------------

/**
 * Print a routing announcement before the LLM call.
 *
 * Shows the classified intent and which provider will handle it.
 * For Claude calls, shows the model tier. For @opus, prompts for
 * confirmation with an estimated cost warning.
 */
export function announceRoute(
  intent: Intent,
  route: RouteResult,
  opts: { confidence: number; explicit: boolean },
): void {
  const conf = opts.confidence >= 0.7 ? '' : ` (confidence: ${Math.round(opts.confidence * 100)}%)`;
  const prefix = opts.explicit ? ' [explicit]' : '';

  console.log(`  [${intent}] → ${route.label}${prefix}${conf}`);
}

/**
 * Print a cost warning for Claude calls.
 * Called before any non-graph Claude invocation.
 */
export function announceCost(tier: string): void {
  const estimates: Record<string, string> = {
    fast:     '~$0.001',
    standard: '~$0.01',
    powerful: '~$0.05',
  };
  const est = estimates[tier] ?? '(unknown)';
  console.log(`  [cost] estimated ${est} for this turn`);
}

/**
 * Prompt for confirmation before an @opus call.
 * Returns true if the user confirms (or if running non-interactively).
 *
 * For now this is informational only — no blocking prompt.
 * Phase 3 (tool execution) can add interactive confirmation.
 */
export function announceOpus(): void {
  console.log('  [cost] Opus is the most expensive tier (~$0.05+/turn).');
  console.log('  [cost] Use @claude for standard tasks, @opus for deep architectural questions.');
}
