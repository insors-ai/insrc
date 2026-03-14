/**
 * Incremental spec update logic, conflict detection, and rendering.
 */

import { createHash } from 'node:crypto';
import type { LLMProvider, AgentConfig } from '../../../shared/types.js';
import type { BrainstormState } from './agent-state.js';
import type { SpecRequirement, SpecRevision, PromotionProposal, MergeProposal } from './types.js';
import { buildStepContext } from './context-builder.js';

// ---------------------------------------------------------------------------
// Update spec (Claude)
// ---------------------------------------------------------------------------

/**
 * Write approved promotions and merges into the live spec.
 * Uses Claude to polish requirement text and check consistency.
 */
export async function updateSpec(
  state: BrainstormState,
  provider: LLMProvider,
  config: AgentConfig,
): Promise<{ requirements: SpecRequirement[]; revisions: SpecRevision[] }> {
  if (state.pendingPromotions.length === 0 && state.pendingMerges.length === 0) {
    return { requirements: [...state.requirements], revisions: [] };
  }

  const messages = buildStepContext(state, 'update-spec', provider, config);
  const response = await provider.complete(messages, { maxTokens: 3000, temperature: 0.2 });

  return parseSpecUpdate(response.text, state);
}

function parseSpecUpdate(
  text: string,
  state: BrainstormState,
): { requirements: SpecRequirement[]; revisions: SpecRevision[] } {
  // Try to parse as JSON first
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        requirements?: Array<Record<string, unknown>>;
        revisions?: Array<Record<string, unknown>>;
      };

      const requirements = [...state.requirements];
      const revisions: SpecRevision[] = [];
      let nextIdx = state.nextReqIndex;

      if (parsed.requirements) {
        for (const raw of parsed.requirements) {
          const id = raw['id'] as string;
          if (id === 'new' || !state.requirements.find(r => r.id === id)) {
            // New requirement
            const newId = createHash('sha256')
              .update(`${state.input.repoPath}:req:${nextIdx}`)
              .digest('hex')
              .slice(0, 32);

            requirements.push({
              id: newId,
              index: nextIdx,
              statement: (raw['statement'] as string) ?? '',
              type: normalizeType(raw['type'] as string),
              priority: normalizePriority(raw['priority'] as string),
              themeId: (raw['themeId'] as string) ?? '',
              acceptanceCriteria: (raw['acceptanceCriteria'] as string[]) ?? [],
              rationale: (raw['rationale'] as string) ?? '',
              sourceIdeaIds: [],
              codeRefs: [],
              revision: 1,
              addedInRound: state.round,
            });
            nextIdx++;
          } else {
            // Update existing
            const existingIdx = requirements.findIndex(r => r.id === id);
            if (existingIdx >= 0) {
              const existing = requirements[existingIdx]!;
              requirements[existingIdx] = {
                ...existing,
                statement: (raw['statement'] as string) ?? existing.statement,
                acceptanceCriteria: (raw['acceptanceCriteria'] as string[]) ?? existing.acceptanceCriteria,
                revision: existing.revision + 1,
              };
            }
          }
        }
      }

      if (parsed.revisions) {
        for (const raw of parsed.revisions) {
          revisions.push({
            round: state.round,
            requirementId: (raw['requirementId'] as string) ?? '',
            action: normalizeAction(raw['action'] as string),
            detail: (raw['detail'] as string) ?? '',
          });
        }
      }

      return { requirements, revisions };
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: apply promotions/merges directly without LLM polish
  return applyProposalsDirect(state);
}

/**
 * Fallback: directly apply pending promotions and merges to the spec
 * without LLM polishing (used when LLM output can't be parsed).
 */
function applyProposalsDirect(state: BrainstormState): {
  requirements: SpecRequirement[];
  revisions: SpecRevision[];
} {
  const requirements = [...state.requirements];
  const revisions: SpecRevision[] = [];
  let nextIdx = state.nextReqIndex;

  for (const p of state.pendingPromotions) {
    const id = createHash('sha256')
      .update(`${state.input.repoPath}:req:${nextIdx}`)
      .digest('hex')
      .slice(0, 32);

    requirements.push({
      id,
      index: nextIdx,
      statement: p.statement,
      type: p.type,
      priority: p.priority,
      themeId: p.themeId,
      acceptanceCriteria: p.acceptanceCriteria,
      rationale: p.rationale,
      sourceIdeaIds: [p.ideaId],
      codeRefs: [],
      revision: 1,
      addedInRound: state.round,
    });

    revisions.push({
      round: state.round,
      requirementId: id,
      action: 'added',
      detail: `Promoted from idea: ${p.statement.slice(0, 60)}`,
    });

    nextIdx++;
  }

  for (const m of state.pendingMerges) {
    const reqIdx = requirements.findIndex(r => r.id === m.targetRequirementId);
    if (reqIdx >= 0) {
      const existing = requirements[reqIdx]!;
      requirements[reqIdx] = {
        ...existing,
        acceptanceCriteria: [...existing.acceptanceCriteria, ...m.additionalCriteria],
        sourceIdeaIds: [...existing.sourceIdeaIds, m.ideaId],
        revision: existing.revision + 1,
      };
      revisions.push({
        round: state.round,
        requirementId: existing.id,
        action: 'merged',
        detail: m.note || `Merged idea into requirement ${existing.index}`,
      });
    }
  }

  return { requirements, revisions };
}

// ---------------------------------------------------------------------------
// Spec editing from user feedback
// ---------------------------------------------------------------------------

/**
 * Apply user's direct edits to requirements from review-spec gate feedback.
 * Simple line-by-line replacement for now.
 */
export function applySpecEdits(
  requirements: SpecRequirement[],
  feedback: string,
): SpecRequirement[] {
  const updated = [...requirements];

  // Parse "N: new statement" pattern
  const lines = feedback.split('\n');
  for (const line of lines) {
    const m = line.match(/^(\d+):\s*(.+)/);
    if (m) {
      const idx = parseInt(m[1]!, 10);
      const reqIdx = updated.findIndex(r => r.index === idx);
      if (reqIdx >= 0) {
        updated[reqIdx] = {
          ...updated[reqIdx]!,
          statement: m[2]!.trim(),
          revision: updated[reqIdx]!.revision + 1,
        };
      }
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * Simple heuristic conflict detection between requirements.
 * Flags pairs that mention similar subjects with opposing verbs.
 */
export function detectConflicts(requirements: SpecRequirement[]): string[] {
  const conflicts: string[] = [];

  for (let i = 0; i < requirements.length; i++) {
    for (let j = i + 1; j < requirements.length; j++) {
      const a = requirements[i]!;
      const b = requirements[j]!;

      // Very simple: flag if both mention same keywords but with opposing qualifiers
      const aWords = new Set(a.statement.toLowerCase().split(/\s+/));
      const bWords = new Set(b.statement.toLowerCase().split(/\s+/));
      const overlap = [...aWords].filter(w => bWords.has(w) && w.length > 4);

      if (overlap.length >= 3) {
        const hasNegation = (s: string) => /\b(not|never|no|without|disable)\b/i.test(s);
        if (hasNegation(a.statement) !== hasNegation(b.statement)) {
          conflicts.push(
            `Potential conflict: Req ${a.index} ("${a.statement.slice(0, 50)}...") vs ` +
            `Req ${b.index} ("${b.statement.slice(0, 50)}...")`,
          );
        }
      }
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render the current spec as markdown for gate display.
 */
export function renderSpecMarkdown(state: BrainstormState): string {
  const parts: string[] = ['# Requirements Specification', ''];

  if (state.themes.length > 0) {
    parts.push('## Themes');
    for (const theme of state.themes) {
      parts.push(`- **${theme.name}**: ${theme.description}`);
    }
    parts.push('');
  }

  // Group requirements by theme
  const byTheme = new Map<string, SpecRequirement[]>();
  for (const req of state.requirements) {
    const list = byTheme.get(req.themeId) ?? [];
    list.push(req);
    byTheme.set(req.themeId, list);
  }

  for (const theme of state.themes) {
    const reqs = byTheme.get(theme.id);
    if (!reqs || reqs.length === 0) continue;

    parts.push(`## ${theme.name}`);
    for (const req of reqs) {
      parts.push(`${req.index}. **[${req.type.toUpperCase()}]** [${req.priority}] ${req.statement}`);
      if (req.acceptanceCriteria.length > 0) {
        for (const c of req.acceptanceCriteria) {
          parts.push(`   - ${c}`);
        }
      }
    }
    parts.push('');
  }

  // Unthemed requirements
  const unthemed = state.requirements.filter(
    r => !state.themes.some(t => t.id === r.themeId),
  );
  if (unthemed.length > 0) {
    parts.push('## Uncategorized');
    for (const req of unthemed) {
      parts.push(`${req.index}. **[${req.type.toUpperCase()}]** [${req.priority}] ${req.statement}`);
    }
    parts.push('');
  }

  if (state.revisions.length > 0) {
    parts.push('## Revision Log');
    for (const rev of state.revisions) {
      parts.push(`- Round ${rev.round}: [${rev.action}] ${rev.detail}`);
    }
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeType(raw: string | undefined): 'functional' | 'non-functional' | 'constraint' {
  const lower = (raw ?? '').toLowerCase();
  if (lower.includes('non-functional') || lower.includes('nonfunctional')) return 'non-functional';
  if (lower.includes('constraint')) return 'constraint';
  return 'functional';
}

function normalizePriority(raw: string | undefined): 'must' | 'should' | 'could' {
  const lower = (raw ?? '').toLowerCase();
  if (lower.includes('must')) return 'must';
  if (lower.includes('could')) return 'could';
  return 'should';
}

function normalizeAction(raw: string | undefined): 'added' | 'modified' | 'removed' | 'merged' {
  const lower = (raw ?? '').toLowerCase();
  if (lower.includes('add')) return 'added';
  if (lower.includes('modif')) return 'modified';
  if (lower.includes('remov')) return 'removed';
  if (lower.includes('merg')) return 'merged';
  return 'added';
}
