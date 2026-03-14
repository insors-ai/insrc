/**
 * Brainstorm agent steps — thin orchestration wrappers around pure LLM functions.
 *
 * 10 steps: seed → validate-seed → diverge → react → converge →
 *   validate-convergence → update-spec → review-spec → iterate → finalize
 *
 * Each LLM step: resolveStepProvider → buildStepContext → LLM call → consumeOverride.
 * Each gate step: parseProviderMention → applyOverride → track editRounds.
 */

import type { AgentStep, StepContext, StepResult } from '../../framework/types.js';
import type { LLMProvider, Entity } from '../../../shared/types.js';
import type { BrainstormState } from './agent-state.js';
import type { BrainstormInput, PromotionProposal, MergeProposal } from './types.js';
import { assertDaemonReachable } from '../../pipeline/context-provider.js';
import { planSearches, type PlannedSearch } from '../designer/search-planner.js';
import { generateSeedIdeas, generateDivergeIdeas, applyIdeaSelections } from './ideas.js';
import { clusterIdeas, proposePromotions, identifyGaps } from './convergence.js';
import { updateSpec, applySpecEdits, detectConflicts, renderSpecMarkdown } from './spec-builder.js';
import { formatIdeasForContext, formatThemesForContext, formatGaps, compressRound } from './context-builder.js';
import { parseProviderMention, resolveStepProvider, consumeOverride, applyOverride } from './provider-mention.js';
import { assembleDocument } from './assembly.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_EDIT_ROUNDS = 3;
const AUTO_CONVERGE_THRESHOLD = 8;
const AUTO_CONVERGE_ROUNDS = 2;

// ---------------------------------------------------------------------------
// Helper: execute planned searches via daemon RPC
// ---------------------------------------------------------------------------

async function executeSearches(
  searches: PlannedSearch[],
  ctx: StepContext,
): Promise<string> {
  const findings: string[] = [];

  for (const s of searches) {
    const results = await ctx.rpc<Entity[]>('search.query', {
      text: s.query,
      limit: s.limit,
      filter: s.filter,
    });
    if (results && results.length > 0) {
      findings.push(`### ${s.category} (${s.query})`);
      for (const e of results) {
        findings.push(`- ${e.kind}: ${e.name} (${e.file}:${e.startLine})`);
      }
    }
  }

  return findings.length > 0 ? findings.join('\n') : '';
}

// ---------------------------------------------------------------------------
// Step: seed
// ---------------------------------------------------------------------------

export const seedStep: AgentStep<BrainstormState> = {
  name: 'seed',
  async run(state, ctx) {
    ctx.progress('Checking daemon availability...');
    await assertDaemonReachable();
    ctx.progress('Daemon reachable — codebase analysis available.');

    // Plan and execute codebase searches based on the problem statement
    ctx.progress('Planning codebase searches...');
    const searchRequirement = { index: 0, statement: state.input.message, type: 'functional' as const, references: [], state: 'pending' as const };
    const localProvider = ctx.providers.local;
    const searches = await planSearches(searchRequirement, localProvider);

    ctx.progress(`Searching codebase (${searches.length} queries)...`);
    const codebaseFindings = await executeSearches(searches, ctx);

    // Generate seed ideas
    ctx.progress('Generating seed ideas...');
    const provider = resolveStepProvider(ctx, state, 'seed');
    const input: BrainstormInput = {
      message: state.input.message,
      codeContext: state.input.codeContext,
      existingSpec: state.input.existingSpec,
      session: {
        repoPath: state.input.repoPath,
        closureRepos: state.input.closureRepos,
      },
    };
    const { analysis, ideas } = await generateSeedIdeas(input, codebaseFindings, provider);

    const newState = consumeOverride({
      ...state,
      codebaseFindings,
      seedAnalysis: analysis,
      ideas,
      nextIdeaIndex: ideas.length + 1,
    });

    ctx.progress(`Generated ${ideas.length} seed ideas.`);
    return { state: newState, next: 'validate-seed' };
  },
};

// ---------------------------------------------------------------------------
// Step: validate-seed
// ---------------------------------------------------------------------------

export const validateSeedStep: AgentStep<BrainstormState> = {
  name: 'validate-seed',
  async run(state, ctx) {
    const ideaList = formatIdeasForContext(state.ideas);

    const reply = await ctx.gate({
      stage: 'seed',
      title: 'Seed Ideas',
      content: `## Problem Analysis\n${state.seedAnalysis}\n\n## Ideas\n${ideaList}`,
      actions: [
        { name: 'approve', label: 'Approve all' },
        { name: 'select', label: 'Select', hint: 'accept 1,3,5 reject 2 park 4' },
        { name: 'reframe', label: 'Reframe', hint: '<direction>' },
      ],
    });

    const { override, cleanFeedback } = parseProviderMention(reply.feedback ?? '');
    let newState = override ? applyOverride(state, override) : state;

    if (reply.action === 'approve') {
      // Accept all proposed ideas
      const ideas = state.ideas.map(i =>
        i.status === 'proposed' ? { ...i, status: 'accepted' as const } : i,
      );
      return { state: { ...newState, ideas }, next: 'diverge' };
    }

    if (reply.action === 'reframe') {
      const key = 'seed';
      const rounds = (state.editRounds[key] ?? 0) + 1;
      if (rounds > MAX_EDIT_ROUNDS) {
        ctx.progress(`Max edit rounds (${MAX_EDIT_ROUNDS}) reached. Proceeding.`);
        const ideas = state.ideas.map(i =>
          i.status === 'proposed' ? { ...i, status: 'accepted' as const } : i,
        );
        return { state: { ...newState, ideas }, next: 'diverge' };
      }

      ctx.progress(`Reframing with direction (round ${rounds}/${MAX_EDIT_ROUNDS})...`);
      newState = {
        ...newState,
        recentFeedback: cleanFeedback || reply.feedback,
        editRounds: { ...newState.editRounds, [key]: rounds },
        ideas: [],
        nextIdeaIndex: 1,
        seedAnalysis: '',
      };
      return { state: newState, next: 'seed' };
    }

    // Select — apply per-idea selections
    const { ideas, newIdeas } = applyIdeaSelections(
      state.ideas, cleanFeedback || reply.feedback || '',
      state.round, state.nextIdeaIndex, state.input.repoPath,
    );

    return {
      state: {
        ...newState,
        ideas: [...ideas, ...newIdeas],
        nextIdeaIndex: state.nextIdeaIndex + newIdeas.length,
      },
      next: 'diverge',
    };
  },
};

// ---------------------------------------------------------------------------
// Step: diverge
// ---------------------------------------------------------------------------

export const divergeStep: AgentStep<BrainstormState> = {
  name: 'diverge',
  async run(state, ctx) {
    ctx.progress(`Round ${state.round}: Generating new ideas (diverge)...`);
    const provider = resolveStepProvider(ctx, state, 'diverge');
    const config = ctx.config;

    const newIdeas = await generateDivergeIdeas(state, provider, config);
    const allIdeas = [...state.ideas, ...newIdeas];

    const newState = consumeOverride({
      ...state,
      ideas: allIdeas,
      nextIdeaIndex: state.nextIdeaIndex + newIdeas.length,
      mode: 'diverge' as const,
    });

    ctx.progress(`Generated ${newIdeas.length} new ideas (total: ${allIdeas.length}).`);
    return { state: newState, next: 'react' };
  },
};

// ---------------------------------------------------------------------------
// Step: react (gate)
// ---------------------------------------------------------------------------

export const reactStep: AgentStep<BrainstormState> = {
  name: 'react',
  async run(state, ctx) {
    const proposed = state.ideas.filter(i => i.status === 'proposed');
    const accepted = state.ideas.filter(i => i.status === 'accepted');

    const content = [
      `## Round ${state.round} Ideas`,
      `Proposed: ${proposed.length} | Accepted: ${accepted.length}`,
      '',
      '### New Ideas This Round',
      formatIdeasForContext(proposed),
      '',
      '### Previously Accepted',
      formatIdeasForContext(accepted),
    ].join('\n');

    // Auto-converge check
    const shouldAutoConverge = accepted.length >= AUTO_CONVERGE_THRESHOLD
      || state.round >= AUTO_CONVERGE_ROUNDS;

    const reply = await ctx.gate({
      stage: 'react',
      title: `Idea Review (Round ${state.round})`,
      content: content + (shouldAutoConverge ? '\n\n*Auto-converge suggested — enough ideas gathered.*' : ''),
      actions: [
        { name: 'approve', label: 'Accept all & continue' },
        { name: 'select', label: 'Select', hint: 'accept 1,3 reject 2 park 4' },
        { name: 'focus', label: 'Focus', hint: '<direction for next round>' },
        { name: 'converge', label: 'Converge now' },
      ],
    });

    const { override, cleanFeedback } = parseProviderMention(reply.feedback ?? '');
    let newState = override ? applyOverride(state, override) : state;

    if (reply.action === 'converge') {
      // Accept all proposed, move to converge
      const ideas = newState.ideas.map(i =>
        i.status === 'proposed' ? { ...i, status: 'accepted' as const } : i,
      );
      return {
        state: { ...newState, ideas, mode: 'converge' as const },
        next: 'converge',
      };
    }

    if (reply.action === 'approve') {
      const ideas = newState.ideas.map(i =>
        i.status === 'proposed' ? { ...i, status: 'accepted' as const } : i,
      );

      // If auto-converge threshold reached, go to converge
      if (shouldAutoConverge) {
        return {
          state: { ...newState, ideas, mode: 'converge' as const },
          next: 'converge',
        };
      }
      // Otherwise another diverge round
      return {
        state: { ...newState, ideas, round: newState.round + 1 },
        next: 'diverge',
      };
    }

    if (reply.action === 'focus') {
      // Accept all proposed but steer next round
      const ideas = newState.ideas.map(i =>
        i.status === 'proposed' ? { ...i, status: 'accepted' as const } : i,
      );
      return {
        state: {
          ...newState,
          ideas,
          recentFeedback: cleanFeedback || reply.feedback,
          round: newState.round + 1,
        },
        next: 'diverge',
      };
    }

    // Select — apply per-idea selections
    const { ideas, newIdeas } = applyIdeaSelections(
      newState.ideas, cleanFeedback || reply.feedback || '',
      newState.round, newState.nextIdeaIndex, newState.input.repoPath,
    );
    const updatedIdeas = [...ideas, ...newIdeas];
    const totalAccepted = updatedIdeas.filter(i => i.status === 'accepted').length;

    // If enough accepted after selection, auto-converge
    if (totalAccepted >= AUTO_CONVERGE_THRESHOLD || newState.round >= AUTO_CONVERGE_ROUNDS) {
      return {
        state: {
          ...newState,
          ideas: updatedIdeas,
          nextIdeaIndex: newState.nextIdeaIndex + newIdeas.length,
          mode: 'converge' as const,
        },
        next: 'converge',
      };
    }

    return {
      state: {
        ...newState,
        ideas: updatedIdeas,
        nextIdeaIndex: newState.nextIdeaIndex + newIdeas.length,
        round: newState.round + 1,
      },
      next: 'diverge',
    };
  },
};

// ---------------------------------------------------------------------------
// Step: converge (two LLM calls: cluster + promote)
// ---------------------------------------------------------------------------

export const convergeStep: AgentStep<BrainstormState> = {
  name: 'converge',
  async run(state, ctx) {
    const config = ctx.config;

    // 1. Cluster ideas into themes (local model)
    ctx.progress('Clustering ideas into themes (local)...');
    const localProvider = ctx.providers.local;
    const { themes } = await clusterIdeas(state, localProvider, config);

    ctx.progress(`Found ${themes.length} themes. Evaluating promotions...`);

    // 2. Propose promotions (Claude or override)
    const promotionProvider = resolveStepProvider(ctx, state, 'promote');
    const { promotions, merges } = await proposePromotions(state, themes, promotionProvider, config);

    const newState = consumeOverride({
      ...state,
      themes,
      pendingPromotions: promotions,
      pendingMerges: merges,
      mode: 'converge' as const,
    });

    ctx.progress(`${promotions.length} promotion(s), ${merges.length} merge proposal(s).`);
    return { state: newState, next: 'validate-convergence' };
  },
};

// ---------------------------------------------------------------------------
// Step: validate-convergence (gate)
// ---------------------------------------------------------------------------

export const validateConvergenceStep: AgentStep<BrainstormState> = {
  name: 'validate-convergence',
  async run(state, ctx) {
    const gaps = identifyGaps(state.themes, state.ideas);

    const content = [
      '## Themes',
      formatThemesForContext(state.themes),
      '',
      '## Promotion Proposals',
      ...state.pendingPromotions.map((p, i) =>
        `${i + 1}. **${p.statement.slice(0, 80)}** [${p.type}, ${p.priority}]`,
      ),
      '',
      '## Merge Proposals',
      ...state.pendingMerges.map((m, i) =>
        `${i + 1}. Idea → Req ${m.targetRequirementId.slice(0, 8)}: ${m.note || '(no note)'}`,
      ),
      '',
      '## Gaps',
      gaps.length > 0 ? gaps.join('\n') : 'No gaps identified.',
    ].join('\n');

    const reply = await ctx.gate({
      stage: 'convergence',
      title: 'Convergence Review',
      content,
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'edit', label: 'Edit', hint: '<feedback on promotions>' },
        { name: 'diverge', label: 'Back to diverge', hint: '<focus area>' },
      ],
    });

    const { override, cleanFeedback } = parseProviderMention(reply.feedback ?? '');
    let newState = override ? applyOverride(state, override) : state;

    if (reply.action === 'approve') {
      return { state: newState, next: 'update-spec' };
    }

    if (reply.action === 'diverge') {
      return {
        state: {
          ...newState,
          pendingPromotions: [],
          pendingMerges: [],
          recentFeedback: cleanFeedback || reply.feedback,
          mode: 'diverge' as const,
          round: newState.round + 1,
        },
        next: 'diverge',
      };
    }

    // Edit — re-run convergence with feedback
    const key = `convergence-${state.round}`;
    const rounds = (state.editRounds[key] ?? 0) + 1;
    if (rounds > MAX_EDIT_ROUNDS) {
      ctx.progress(`Max edit rounds (${MAX_EDIT_ROUNDS}) reached. Proceeding.`);
      return { state: newState, next: 'update-spec' };
    }

    ctx.progress(`Re-evaluating convergence with feedback (round ${rounds}/${MAX_EDIT_ROUNDS})...`);
    return {
      state: {
        ...newState,
        recentFeedback: cleanFeedback || reply.feedback,
        pendingPromotions: [],
        pendingMerges: [],
        editRounds: { ...newState.editRounds, [key]: rounds },
      },
      next: 'converge',
    };
  },
};

// ---------------------------------------------------------------------------
// Step: update-spec (LLM)
// ---------------------------------------------------------------------------

export const updateSpecStep: AgentStep<BrainstormState> = {
  name: 'update-spec',
  async run(state, ctx) {
    ctx.progress('Updating requirements spec...');
    const provider = resolveStepProvider(ctx, state, 'update-spec');
    const config = ctx.config;

    const { requirements, revisions } = await updateSpec(state, provider, config);

    // Mark promoted ideas
    const promotedIdeaIds = new Set(state.pendingPromotions.map(p => p.ideaId));
    const mergedIdeaIds = new Set(state.pendingMerges.map(m => m.ideaId));
    const ideas = state.ideas.map(i => {
      if (promotedIdeaIds.has(i.id)) return { ...i, status: 'promoted' as const };
      if (mergedIdeaIds.has(i.id)) return { ...i, status: 'merged' as const };
      return i;
    });

    // Detect conflicts
    const conflicts = detectConflicts(requirements);
    if (conflicts.length > 0) {
      ctx.progress(`Warning: ${conflicts.length} potential conflict(s) detected.`);
      for (const c of conflicts) {
        ctx.progress(`  ${c}`);
      }
    }

    // Write spec artifact
    const specContent = renderSpecMarkdown({
      ...state,
      requirements,
      revisions: [...state.revisions, ...revisions],
    });
    ctx.writeArtifact(`spec-${state.round}.md`, specContent);

    const newState = consumeOverride({
      ...state,
      requirements,
      nextReqIndex: requirements.length + 1,
      revisions: [...state.revisions, ...revisions],
      ideas,
      pendingPromotions: [],
      pendingMerges: [],
    });

    ctx.progress(`Spec updated: ${requirements.length} requirement(s).`);
    return { state: newState, next: 'review-spec' };
  },
  artifacts: (state) => [`spec-${state.round}.md`],
};

// ---------------------------------------------------------------------------
// Step: review-spec (gate)
// ---------------------------------------------------------------------------

export const reviewSpecStep: AgentStep<BrainstormState> = {
  name: 'review-spec',
  async run(state, ctx) {
    const specContent = renderSpecMarkdown(state);
    const gapInfo = formatGaps(state);

    const content = [
      specContent,
      '',
      '---',
      '## Coverage Gaps',
      gapInfo,
    ].join('\n');

    const reply = await ctx.gate({
      stage: 'review-spec',
      title: `Spec Review (Round ${state.round})`,
      content,
      actions: [
        { name: 'approve', label: 'Finalize' },
        { name: 'edit', label: 'Edit', hint: 'N: revised statement' },
        { name: 'continue', label: 'Continue brainstorming' },
      ],
    });

    const { override, cleanFeedback } = parseProviderMention(reply.feedback ?? '');
    let newState = override ? applyOverride(state, override) : state;

    if (reply.action === 'approve') {
      return {
        state: { ...newState, userRequestedContinue: false },
        next: 'finalize',
      };
    }

    if (reply.action === 'continue') {
      return {
        state: {
          ...newState,
          userRequestedContinue: true,
          recentFeedback: cleanFeedback || reply.feedback,
        },
        next: 'iterate',
      };
    }

    // Edit — direct spec edits
    const key = `spec-${state.round}`;
    const rounds = (state.editRounds[key] ?? 0) + 1;
    if (rounds > MAX_EDIT_ROUNDS) {
      ctx.progress(`Max edit rounds (${MAX_EDIT_ROUNDS}) reached. Proceeding.`);
      return { state: newState, next: 'iterate' };
    }

    const updatedReqs = applySpecEdits(
      newState.requirements,
      cleanFeedback || reply.feedback || '',
    );

    const updatedSpecContent = renderSpecMarkdown({ ...newState, requirements: updatedReqs });
    ctx.writeArtifact(`spec-${state.round}.md`, updatedSpecContent);

    return {
      state: {
        ...newState,
        requirements: updatedReqs,
        editRounds: { ...newState.editRounds, [key]: rounds },
      },
      next: 'review-spec',
    };
  },
};

// ---------------------------------------------------------------------------
// Step: iterate (logic — decides loop or finalize)
// ---------------------------------------------------------------------------

export const iterateStep: AgentStep<BrainstormState> = {
  name: 'iterate',
  async run(state, ctx) {
    // Compress current round
    const roundSummary = compressRound(state, state.round);
    const compressedHistory = state.compressedHistory
      ? `${state.compressedHistory}\n\n${roundSummary}`
      : roundSummary;

    const parkedCount = state.ideas.filter(i => i.status === 'parked').length;
    const gaps = identifyGaps(state.themes, state.ideas);

    const shouldContinue = state.userRequestedContinue
      || (state.round < state.maxRounds && (parkedCount > 0 || gaps.length > 0));

    if (shouldContinue) {
      ctx.progress(`Starting round ${state.round + 1}...`);
      return {
        state: {
          ...state,
          compressedHistory,
          round: state.round + 1,
          mode: 'diverge' as const,
          userRequestedContinue: false,
        },
        next: 'diverge',
      };
    }

    ctx.progress('No more rounds needed. Finalizing...');
    return {
      state: { ...state, compressedHistory },
      next: 'finalize',
    };
  },
};

// ---------------------------------------------------------------------------
// Step: finalize (LLM + assembly)
// ---------------------------------------------------------------------------

export const finalizeStep: AgentStep<BrainstormState> = {
  name: 'finalize',
  async run(state, ctx) {
    ctx.progress('Assembling final brainstorm output...');

    const result = assembleDocument(state);

    const ext = 'html';
    ctx.writeArtifact(`brainstorm.${ext}`, result.output);

    ctx.emit(result.output);

    return {
      state: {
        ...state,
        assembledOutput: result.output,
        summary: result.summary,
      },
      next: null,
    };
  },
  artifacts: () => ['brainstorm.html'],
};
