/**
 * Per-step context assembly with budget-aware truncation.
 *
 * Every LLM call builds a self-contained context from BrainstormState,
 * NOT from prior message history. The target provider has no memory of
 * prior steps — continuity lives in agent state.
 */

import type { LLMMessage, AgentConfig } from '../../../shared/types.js';
import { ClaudeProvider } from '../../providers/claude.js';
import type { LLMProvider } from '../../../shared/types.js';
import type { BrainstormState } from './agent-state.js';
import type { Idea, Theme, SpecRequirement } from './types.js';
import {
  SEED_SYSTEM, DIVERGE_SYSTEM, CONVERGE_CLUSTER_SYSTEM,
  CONVERGE_PROMOTE_SYSTEM, UPDATE_SPEC_SYSTEM, FINALIZE_SYSTEM,
} from './prompts.js';

// ---------------------------------------------------------------------------
// System prompts per step
// ---------------------------------------------------------------------------

const STEP_PROMPTS: Record<string, string> = {
  seed:           SEED_SYSTEM,
  diverge:        DIVERGE_SYSTEM,
  cluster:        CONVERGE_CLUSTER_SYSTEM,
  promote:        CONVERGE_PROMOTE_SYSTEM,
  'update-spec':  UPDATE_SPEC_SYSTEM,
  finalize:       FINALIZE_SYSTEM,
};

// ---------------------------------------------------------------------------
// Context layers — each step declares which layers it needs
// ---------------------------------------------------------------------------

type LayerName =
  | 'problem'
  | 'currentSpec'
  | 'activeIdeas'
  | 'codebaseFindings'
  | 'compressedHistory'
  | 'rejectedIdeas'
  | 'revisionLog'
  | 'userFeedback'
  | 'pendingProposals';

/** Which layers each step needs, in priority order. */
const STEP_LAYERS: Record<string, LayerName[]> = {
  seed:          ['problem', 'codebaseFindings'],
  diverge:       ['problem', 'activeIdeas', 'codebaseFindings', 'compressedHistory', 'rejectedIdeas', 'userFeedback'],
  cluster:       ['problem', 'activeIdeas', 'currentSpec', 'compressedHistory'],
  promote:       ['problem', 'currentSpec', 'activeIdeas', 'codebaseFindings', 'compressedHistory', 'userFeedback'],
  'update-spec': ['problem', 'currentSpec', 'pendingProposals', 'revisionLog', 'codebaseFindings'],
  finalize:      ['problem', 'currentSpec', 'compressedHistory', 'revisionLog', 'codebaseFindings'],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build LLM messages for a brainstorm step, adapted to the target provider's
 * context window.
 */
export function buildStepContext(
  state: BrainstormState,
  stepName: string,
  provider: LLMProvider,
  config: AgentConfig,
): LLMMessage[] {
  const isLocal = !(provider instanceof ClaudeProvider);
  const contextWindow = isLocal
    ? config.models.context.local
    : config.models.context.claude;
  const maxOutput = isLocal
    ? config.models.context.localMaxOutput
    : config.models.context.claudeMaxOutput;
  const charsPerToken = config.models.context.charsPerToken;
  const charBudget = (contextWindow - maxOutput) * charsPerToken;

  const systemPrompt = STEP_PROMPTS[stepName] ?? SEED_SYSTEM;
  const layers = STEP_LAYERS[stepName] ?? ['problem'];

  // Build user content sections in priority order, truncating as needed
  const sections: string[] = [];
  let usedChars = systemPrompt.length;

  for (const layer of layers) {
    const content = renderLayer(state, layer);
    if (!content) continue;

    if (usedChars + content.length > charBudget) {
      // Truncate this layer to fit remaining budget
      const remaining = charBudget - usedChars;
      if (remaining > 200) {
        sections.push(content.slice(0, remaining - 20) + '\n\n[...truncated]');
        usedChars = charBudget;
      }
      break; // Skip lower-priority layers
    }

    sections.push(content);
    usedChars += content.length;
  }

  return [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: sections.join('\n\n') },
  ];
}

// ---------------------------------------------------------------------------
// Layer renderers
// ---------------------------------------------------------------------------

function renderLayer(state: BrainstormState, layer: LayerName): string | null {
  switch (layer) {
    case 'problem':
      return renderProblem(state);
    case 'currentSpec':
      return formatSpecForContext(state);
    case 'activeIdeas':
      return renderActiveIdeas(state);
    case 'codebaseFindings':
      return state.codebaseFindings
        ? `## Codebase Context\n${state.codebaseFindings}`
        : null;
    case 'compressedHistory':
      return state.compressedHistory
        ? `## Prior Rounds\n${state.compressedHistory}`
        : null;
    case 'rejectedIdeas': {
      const rejected = state.ideas.filter(i => i.status === 'rejected');
      return rejected.length > 0
        ? `## Rejected Ideas (Avoid Similar)\n${formatIdeasBrief(rejected)}`
        : null;
    }
    case 'revisionLog':
      return state.revisions.length > 0
        ? `## Revision Log\n${state.revisions.map(r => `- [${r.action}] ${r.detail}`).join('\n')}`
        : null;
    case 'userFeedback':
      return state.recentFeedback
        ? `## User Direction\n${state.recentFeedback}`
        : null;
    case 'pendingProposals':
      return renderPendingProposals(state);
    default:
      return null;
  }
}

function renderProblem(state: BrainstormState): string {
  const parts = ['## Problem Statement', state.input.message];
  if (state.seedAnalysis) {
    parts.push('', '## Analysis', state.seedAnalysis);
  }
  return parts.join('\n');
}

function renderActiveIdeas(state: BrainstormState): string {
  const accepted = state.ideas.filter(i => i.status === 'accepted');
  const proposed = state.ideas.filter(
    i => i.status === 'proposed' && i.round === state.round,
  );

  const parts: string[] = [];
  if (accepted.length > 0) {
    parts.push(`## Accepted Ideas (${accepted.length})\n${formatIdeasForContext(accepted)}`);
  }
  if (proposed.length > 0) {
    parts.push(`## Proposed Ideas This Round\n${formatIdeasForContext(proposed)}`);
  }
  // Already promoted — tell the LLM not to regenerate these
  const promoted = state.ideas.filter(
    i => i.status === 'promoted' || i.status === 'merged',
  );
  if (promoted.length > 0) {
    parts.push(`## Already Promoted (Do NOT Regenerate)\n${formatIdeasBrief(promoted)}`);
  }
  return parts.length > 0 ? parts.join('\n\n') : '';
}

function renderPendingProposals(state: BrainstormState): string {
  const parts: string[] = [];
  if (state.pendingPromotions.length > 0) {
    parts.push('## Approved Promotions');
    for (const p of state.pendingPromotions) {
      parts.push(`- Idea ${p.ideaId}: ${p.statement} [${p.type}, ${p.priority}]`);
      parts.push(`  Criteria: ${p.acceptanceCriteria.join('; ')}`);
    }
  }
  if (state.pendingMerges.length > 0) {
    parts.push('## Approved Merges');
    for (const m of state.pendingMerges) {
      parts.push(`- Idea ${m.ideaId} → Req ${m.targetRequirementId}: ${m.note}`);
    }
  }
  return parts.length > 0 ? parts.join('\n') : '';
}

// ---------------------------------------------------------------------------
// Formatting helpers (exported for use by steps)
// ---------------------------------------------------------------------------

/** Format ideas with full detail for LLM context. */
export function formatIdeasForContext(ideas: Idea[]): string {
  return ideas.map(i => {
    const tags = i.tags.length > 0 ? ` — tags: ${i.tags.join(', ')}` : '';
    const refs = i.codeRefs.length > 0 ? ` — refs: ${i.codeRefs.join(', ')}` : '';
    return `[${i.index}] ${i.text}${tags}${refs}`;
  }).join('\n');
}

/** Format ideas briefly (index + first 80 chars). */
export function formatIdeasBrief(ideas: Idea[]): string {
  return ideas.map(i => {
    const text = i.text.length > 80 ? i.text.slice(0, 80) + '...' : i.text;
    return `[${i.index}] ${text}`;
  }).join('\n');
}

/** Format the current spec for LLM context. */
export function formatSpecForContext(state: BrainstormState): string | null {
  if (state.requirements.length === 0) return null;

  const parts = ['## Current Requirements Spec'];

  // Group by theme
  const byTheme = new Map<string, SpecRequirement[]>();
  for (const req of state.requirements) {
    const list = byTheme.get(req.themeId) ?? [];
    list.push(req);
    byTheme.set(req.themeId, list);
  }

  for (const theme of state.themes) {
    const reqs = byTheme.get(theme.id);
    if (!reqs || reqs.length === 0) continue;
    parts.push(`\n### ${theme.name}`);
    for (const req of reqs) {
      parts.push(`${req.index}. [${req.type.toUpperCase()}] [${req.priority}] ${req.statement}`);
      if (req.acceptanceCriteria.length > 0) {
        parts.push(`   Criteria: ${req.acceptanceCriteria.join('; ')}`);
      }
    }
  }

  return parts.join('\n');
}

/** Format themes for LLM context. */
export function formatThemesForContext(themes: Theme[]): string {
  return themes.map(t => `- **${t.name}**: ${t.description} (${t.ideaIds.length} ideas)`).join('\n');
}

/** Identify themes with thin coverage. */
export function formatGaps(state: BrainstormState): string {
  const gaps: string[] = [];
  for (const theme of state.themes) {
    const activeCount = theme.ideaIds.filter(id => {
      const idea = state.ideas.find(i => i.id === id);
      return idea && (idea.status === 'accepted' || idea.status === 'promoted');
    }).length;
    if (activeCount < 2) {
      gaps.push(`- Theme "${theme.name}" has only ${activeCount} active ideas`);
    }
  }
  const parked = state.ideas.filter(i => i.status === 'parked');
  if (parked.length > 0) {
    gaps.push(`- ${parked.length} parked ideas awaiting exploration`);
  }
  return gaps.length > 0 ? gaps.join('\n') : 'No gaps identified.';
}

// ---------------------------------------------------------------------------
// Round compression
// ---------------------------------------------------------------------------

/**
 * Compress a completed round into a history summary.
 * Appended to state.compressedHistory after each round.
 */
export function compressRound(state: BrainstormState, round: number): string {
  const roundIdeas = state.ideas.filter(i => i.round === round);
  const promoted = roundIdeas.filter(i => i.status === 'promoted');
  const rejected = roundIdeas.filter(i => i.status === 'rejected');
  const newReqs = state.revisions
    .filter(r => r.round === round && r.action === 'added')
    .map(r => state.requirements.find(req => req.id === r.requirementId)?.statement)
    .filter(Boolean);

  const lines = [
    `## Round ${round}`,
    `Generated ${roundIdeas.length} ideas, promoted ${promoted.length}, rejected ${rejected.length}.`,
  ];

  if (newReqs.length > 0) {
    lines.push(`New requirements:\n${newReqs.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}`);
  } else {
    lines.push('No new requirements this round.');
  }

  if (state.recentFeedback) {
    lines.push(`User direction: ${state.recentFeedback}`);
  }

  return lines.filter(Boolean).join('\n');
}
