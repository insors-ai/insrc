/**
 * Theme clustering, promotion evaluation, and gap analysis.
 */

import { createHash } from 'node:crypto';
import type { LLMProvider, AgentConfig } from '../../../shared/types.js';
import type { BrainstormState } from './agent-state.js';
import type { Idea, Theme, PromotionProposal, MergeProposal } from './types.js';
import { buildStepContext } from './context-builder.js';

// ---------------------------------------------------------------------------
// Clustering (local model)
// ---------------------------------------------------------------------------

/**
 * Cluster accepted ideas into themes using the local model.
 */
export async function clusterIdeas(
  state: BrainstormState,
  provider: LLMProvider,
  config: AgentConfig,
): Promise<{ themes: Theme[]; mergeProposals: Array<{ sourceIndex: number; targetIndex: number; reason: string }> }> {
  const messages = buildStepContext(state, 'cluster', provider, config);
  const response = await provider.complete(messages, { maxTokens: 2000, temperature: 0.3 });
  return parseClusterOutput(response.text, state);
}

export function parseClusterOutput(
  text: string,
  state: BrainstormState,
): { themes: Theme[]; mergeProposals: Array<{ sourceIndex: number; targetIndex: number; reason: string }> } {
  const themes: Theme[] = [];
  const mergeProposals: Array<{ sourceIndex: number; targetIndex: number; reason: string }> = [];

  const sections = text.split(/^###\s+/m).filter(Boolean);

  for (const section of sections) {
    const lines = section.split('\n');
    const heading = lines[0]?.trim() ?? '';

    if (heading.toLowerCase().startsWith('theme:')) {
      const name = heading.replace(/^theme:\s*/i, '').trim();
      const description = lines[1]?.trim() ?? '';

      // Parse "Ideas: 1, 3, 7"
      const ideasLine = lines.find(l => /^ideas?:/i.test(l.trim()));
      const ideaIndices = ideasLine
        ? ideasLine.replace(/^ideas?:\s*/i, '').split(/[,\s]+/).map(Number).filter(n => !isNaN(n))
        : [];

      const ideaIds = ideaIndices
        .map(idx => state.ideas.find(i => i.index === idx)?.id)
        .filter((id): id is string => !!id);

      const id = createHash('sha256')
        .update(`${state.input.repoPath}:theme:${name}`)
        .digest('hex')
        .slice(0, 32);

      themes.push({ id, name, description, ideaIds, requirementIds: [] });
    } else if (heading.toLowerCase().startsWith('merge')) {
      // Parse merge proposals: "- Merge idea N into idea M: reason"
      for (const line of lines.slice(1)) {
        const m = line.match(/merge\s+idea\s+(\d+)\s+into\s+idea\s+(\d+):\s*(.+)/i);
        if (m) {
          mergeProposals.push({
            sourceIndex: parseInt(m[1]!, 10),
            targetIndex: parseInt(m[2]!, 10),
            reason: m[3]!.trim(),
          });
        }
      }
    }
  }

  // Merge with existing themes if any
  const merged = mergeThemes(state.themes, themes);
  return { themes: merged, mergeProposals };
}

/** Merge new themes with existing, avoiding duplicates by name similarity. */
function mergeThemes(existing: Theme[], incoming: Theme[]): Theme[] {
  const result = [...existing];

  for (const theme of incoming) {
    const existingIdx = result.findIndex(
      t => t.name.toLowerCase() === theme.name.toLowerCase(),
    );
    if (existingIdx >= 0) {
      // Merge idea IDs
      const prev = result[existingIdx]!;
      const mergedIds = [...new Set([...prev.ideaIds, ...theme.ideaIds])];
      result[existingIdx] = { ...prev, ideaIds: mergedIds };
    } else {
      result.push(theme);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Promotion evaluation (Claude)
// ---------------------------------------------------------------------------

/**
 * Evaluate which ideas are mature enough to promote to requirements.
 */
export async function proposePromotions(
  state: BrainstormState,
  themes: Theme[],
  provider: LLMProvider,
  config: AgentConfig,
): Promise<{ promotions: PromotionProposal[]; merges: MergeProposal[] }> {
  // Build context with themes included
  const stateWithThemes = { ...state, themes };
  const messages = buildStepContext(stateWithThemes, 'promote', provider, config);
  const response = await provider.complete(messages, { maxTokens: 3000, temperature: 0.3 });
  return parsePromotionOutput(response.text, themes, state);
}

export function parsePromotionOutput(
  text: string,
  themes: Theme[],
  state: BrainstormState,
): { promotions: PromotionProposal[]; merges: MergeProposal[] } {
  const promotions: PromotionProposal[] = [];
  const merges: MergeProposal[] = [];

  const sections = text.split(/^###\s+/m).filter(Boolean);

  for (const section of sections) {
    const lines = section.split('\n');
    const heading = lines[0]?.trim() ?? '';

    if (heading.toLowerCase().startsWith('promote idea')) {
      const idxMatch = heading.match(/idea\s+(\d+)/i);
      if (!idxMatch) continue;
      const ideaIdx = parseInt(idxMatch[1]!, 10);
      const idea = state.ideas.find(i => i.index === ideaIdx);
      if (!idea) continue;

      const fields = parseFields(lines.slice(1));
      const themeName = fields['theme'] ?? '';
      const theme = themes.find(t =>
        t.name.toLowerCase().includes(themeName.toLowerCase()),
      ) ?? themes[0];

      promotions.push({
        ideaId: idea.id,
        statement: fields['statement'] ?? idea.text,
        type: normalizeType(fields['type']),
        priority: normalizePriority(fields['priority']),
        acceptanceCriteria: parseCriteriaList(lines),
        rationale: fields['rationale'] ?? '',
        themeId: theme?.id ?? '',
      });
    } else if (heading.toLowerCase().startsWith('merge idea')) {
      const idxMatch = heading.match(/idea\s+(\d+)\s+into\s+requirement\s+(\d+)/i);
      if (!idxMatch) continue;
      const ideaIdx = parseInt(idxMatch[1]!, 10);
      const reqIdx = parseInt(idxMatch[2]!, 10);
      const idea = state.ideas.find(i => i.index === ideaIdx);
      const req = state.requirements.find(r => r.index === reqIdx);
      if (!idea || !req) continue;

      const fields = parseFields(lines.slice(1));
      merges.push({
        ideaId: idea.id,
        targetRequirementId: req.id,
        additionalCriteria: parseCriteriaList(lines),
        note: fields['note'] ?? '',
      });
    }
  }

  return { promotions, merges };
}

function parseFields(lines: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^(Statement|Type|Priority|Theme|Rationale|Note):\s*(.+)/i);
    if (m) {
      fields[m[1]!.toLowerCase()] = m[2]!.trim();
    }
  }
  return fields;
}

function parseCriteriaList(lines: string[]): string[] {
  const criteria: string[] = [];
  let inCriteria = false;
  for (const line of lines) {
    if (/acceptance criteria|additional criteria/i.test(line)) {
      inCriteria = true;
      continue;
    }
    if (inCriteria) {
      const m = line.match(/^\s*[-*]\s*(.+)/);
      if (m) {
        criteria.push(m[1]!.trim());
      } else if (line.trim().length === 0) {
        continue;
      } else {
        inCriteria = false;
      }
    }
  }
  return criteria;
}

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

// ---------------------------------------------------------------------------
// Gap analysis
// ---------------------------------------------------------------------------

/**
 * Identify themes with thin coverage (fewer than 2 accepted ideas).
 */
export function identifyGaps(themes: Theme[], ideas: Idea[]): string[] {
  const gaps: string[] = [];
  for (const theme of themes) {
    const activeCount = theme.ideaIds.filter(id => {
      const idea = ideas.find(i => i.id === id);
      return idea && (idea.status === 'accepted' || idea.status === 'promoted');
    }).length;
    if (activeCount < 2) {
      gaps.push(`Theme "${theme.name}" has only ${activeCount} active idea(s)`);
    }
  }
  return gaps;
}
