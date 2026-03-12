import type { Intent } from '../shared/types.js';
import type { RouteResult } from './router.js';
import type { AssembledContext } from './context/index.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('agent');

// ---------------------------------------------------------------------------
// Automatic escalation thresholds (deferred from Phase 2.5)
//
// After context assembly, check if the task complexity warrants Claude:
//   - >3 distinct files referenced in code context → escalate
//   - >1 repo in closure → escalate
//   - >8K input tokens assembled → escalate
// ---------------------------------------------------------------------------

export interface EscalationCheck {
  shouldEscalate: boolean;
  reason?: string | undefined;
}

/**
 * Check if assembled context suggests this task should escalate to Claude.
 * Only applies when the initial route was local — explicit routes are not overridden.
 */
export function shouldEscalate(
  assembled: AssembledContext,
  closureRepos: string[],
): EscalationCheck {
  // >1 repo in closure
  if (closureRepos.length > 1) {
    return { shouldEscalate: true, reason: `multi-repo task (${closureRepos.length} repos)` };
  }

  // >8K assembled input tokens
  if (assembled.totalTokens > 8_000) {
    return { shouldEscalate: true, reason: `large context (${assembled.totalTokens} tokens)` };
  }

  // >3 distinct files in code context
  const filePattern = /\[(?:function|method|class|interface|type|variable) .+ — (.+?):\d+-\d+\]/g;
  const files = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = filePattern.exec(assembled.code.text)) !== null) {
    files.add(match[1]!);
  }
  if (files.size > 3) {
    return { shouldEscalate: true, reason: `multi-file task (${files.size} files)` };
  }

  return { shouldEscalate: false };
}

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

  log.info(`[${intent}] → ${route.label}${prefix}${conf}`);
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
  log.info(`[cost] estimated ${est} for this turn`);
}

/**
 * Prompt for confirmation before an @opus call.
 * Returns true if the user confirms (or if running non-interactively).
 *
 * For now this is informational only — no blocking prompt.
 * Phase 3 (tool execution) can add interactive confirmation.
 */
export function announceOpus(): void {
  log.info('[cost] Opus is the most expensive tier (~$0.05+/turn).');
  log.info('[cost] Use @claude for standard tasks, @opus for deep architectural questions.');
}
