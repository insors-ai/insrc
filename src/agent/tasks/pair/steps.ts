/**
 * Pair agent steps — 7 steps implementing the collaborative coding loop.
 *
 * check-context → analyze → propose → review-gate → apply → validate → summarize
 *
 * The core loop is: propose → review-gate → apply → validate → (next TODO or review-gate)
 */

import type { AgentStep, StepContext, StepResult } from '../../framework/types.js';
import type { LLMMessage } from '../../../shared/types.js';
import type { PairState } from './agent-state.js';
import type { Proposal, TodoItem, DiffEntry } from './types.js';
import {
  parseProviderMention, resolveStepProvider, consumeOverride, applyOverride,
} from '../../framework/provider-mention.js';
import { investigate } from '../shared/investigate.js';
import { generateAndValidate, applyApprovedDiff } from '../shared/codegen.js';
import {
  ANALYZE_SYSTEM,
  PROPOSE_IMPLEMENT_SYSTEM,
  PROPOSE_REFACTOR_SYSTEM,
  PROPOSE_DEBUG_SYSTEM,
  PROPOSE_EXPLORE_SYSTEM,
  SUMMARIZE_SYSTEM,
} from './prompts.js';
import { extractDiffFromResponse } from '../diff-utils.js';
import { loadConfigContext } from '../shared/config-context.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_EDIT_ROUNDS = 5;
const MAX_VALIDATION_RETRIES = 2;

// ---------------------------------------------------------------------------
// Step: check-context
// ---------------------------------------------------------------------------

export const checkContextStep: AgentStep<PairState> = {
  name: 'check-context',
  async run(state, ctx) {
    ctx.progress('Checking for design context...');

    let hasDesign = false;

    // Check input designSpec
    if (state.input.designSpec) {
      hasDesign = true;
      ctx.progress('Design spec found in input.');
    }

    // Check artifact store for recent design
    if (!hasDesign) {
      const artifact = ctx.readArtifact('design-spec.md');
      if (artifact) {
        hasDesign = true;
        ctx.progress('Design spec found in artifact store.');
      }
    }

    const newState: PairState = {
      ...state,
      hasDesignContext: hasDesign,
    };

    // If we have design context or the mode is implement/refactor, skip analysis
    // and go straight to propose. For debug/explore, always analyze first.
    if (hasDesign && (state.mode === 'implement' || state.mode === 'refactor')) {
      return { state: newState, next: 'propose' };
    }

    return { state: newState, next: 'analyze' };
  },
};

// ---------------------------------------------------------------------------
// Step: analyze (tool-calling investigation)
// ---------------------------------------------------------------------------

export const analyzeStep: AgentStep<PairState> = {
  name: 'analyze',
  async run(state, ctx) {
    ctx.progress('Investigating codebase...');

    const query = buildAnalyzeQuery(state);
    const provider = resolveStepProvider(ctx, state, 'pair', 'analyze');

    const result = await investigate(query, ctx, {
      provider,
      onProgress: (msg) => ctx.progress(msg),
    });

    const newState = consumeOverride({
      ...state,
      investigationSummary: result.summary,
    });

    ctx.progress(`Investigation complete (${result.toolCallCount} tool calls).`);
    return { state: newState, next: 'propose' };
  },
};

// ---------------------------------------------------------------------------
// Step: propose (LLM generates proposal)
// ---------------------------------------------------------------------------

export const proposeStep: AgentStep<PairState> = {
  name: 'propose',
  async run(state, ctx) {
    ctx.progress(`Generating proposal (${state.mode} mode)...`);

    const provider = resolveStepProvider(ctx, state, 'pair', 'propose');
    const systemPrompt = getProposalSystemPrompt(state.mode);

    // Build context
    const userParts: string[] = [];
    if (state.input.codeContext) userParts.push(`Code context:\n${state.input.codeContext}`);
    if (state.input.designSpec) userParts.push(`Design spec:\n${state.input.designSpec}`);
    if (state.investigationSummary) userParts.push(`Investigation findings:\n${state.investigationSummary}`);
    if (state.conversationSummary) userParts.push(`Session context:\n${state.conversationSummary}`);
    if (state.currentFocus) userParts.push(`Current focus: ${state.currentFocus}`);

    // If working on a TODO, include it
    if (state.activeTodos && state.currentTodoIndex < state.activeTodos.length) {
      const todo = state.activeTodos[state.currentTodoIndex]!;
      userParts.push(`Current TODO (${state.currentTodoIndex + 1}/${state.activeTodos.length}): ${todo.description}`);
    }

    // Include prior changes for context
    if (state.changesApplied.length > 0) {
      const changesSummary = state.changesApplied
        .map(c => `- ${c.file}`)
        .join('\n');
      userParts.push(`Files already changed this session:\n${changesSummary}`);
    }

    // Load config context (conventions + feedback + templates)
    const configContext = await loadConfigContext(ctx, 'pair', 'all', state.input.repoPath);
    if (configContext) userParts.push(configContext);

    userParts.push(`User request:\n${state.input.message}`);

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userParts.join('\n\n') },
    ];

    const response = await provider.complete(messages, {
      maxTokens: 4000,
      temperature: 0.3,
    });

    const proposal = parseProposal(response.text, state.mode);

    const newState = consumeOverride({
      ...state,
      pendingProposal: proposal,
      activeTodos: proposal.todos ?? state.activeTodos,
      iterationCount: state.iterationCount + 1,
    });

    return { state: newState, next: 'review-gate' };
  },
};

// ---------------------------------------------------------------------------
// Step: review-gate
// ---------------------------------------------------------------------------

export const reviewGateStep: AgentStep<PairState> = {
  name: 'review-gate',
  async run(state, ctx) {
    const proposal = state.pendingProposal;
    if (!proposal) {
      return { state, next: 'summarize' };
    }

    // Build display content
    const content = formatProposalForGate(proposal, state);

    const actions = [
      { name: 'approve', label: 'Approve' },
      { name: 'edit', label: 'Edit', hint: '<feedback>' },
      { name: 'reject', label: 'Reject', hint: 'try a different approach' },
      ...(state.mode !== 'explore' ? [{ name: 'expand', label: 'Expand', hint: '<also do...>' }] : []),
      { name: 'done', label: 'Done' },
    ];

    const reply = await ctx.gate({
      stage: 'review',
      title: `${capitalise(state.mode)} Proposal`,
      content,
      actions,
    });

    const { override, cleanFeedback } = parseProviderMention(reply.feedback ?? '');
    let newState = override ? applyOverride(state, override) : state;

    switch (reply.action) {
      case 'approve': {
        if (!proposal.diff) {
          // Explore mode or question — just proceed
          return {
            state: {
              ...newState,
              pendingProposal: null,
              conversationSummary: appendSummary(
                newState.conversationSummary,
                `Explored: ${proposal.summary}`,
              ),
            },
            next: 'review-gate',
          };
        }
        return { state: newState, next: 'apply' };
      }

      case 'edit': {
        const key = `propose-${newState.iterationCount}`;
        const rounds = (newState.editRounds[key] ?? 0) + 1;
        if (rounds > MAX_EDIT_ROUNDS) {
          const exhaustedReply = await ctx.gate({
            stage: 'edit-exhausted',
            title: 'Edit Rounds Exhausted',
            content: `Maximum edit rounds (${MAX_EDIT_ROUNDS}) reached. The current proposal is the best available.`,
            actions: [
              { name: 'approve', label: 'Approve current proposal' },
              { name: 'done', label: 'Done (discard)' },
            ],
          });
          if (exhaustedReply.action === 'approve') {
            return { state: newState, next: 'apply' };
          }
          return { state: { ...newState, pendingProposal: null }, next: 'summarize' };
        }
        return {
          state: {
            ...newState,
            pendingProposal: null,
            currentFocus: cleanFeedback || reply.feedback || newState.currentFocus,
            editRounds: { ...newState.editRounds, [key]: rounds },
          },
          next: 'propose',
        };
      }

      case 'reject': {
        return {
          state: {
            ...newState,
            pendingProposal: null,
            currentFocus: cleanFeedback || reply.feedback || 'try a different approach',
          },
          next: 'propose',
        };
      }

      case 'expand': {
        return {
          state: {
            ...newState,
            pendingProposal: null,
            currentFocus: cleanFeedback || reply.feedback || newState.currentFocus,
            input: {
              ...newState.input,
              message: `${newState.input.message}\n\nAdditional: ${cleanFeedback || reply.feedback || ''}`,
            },
          },
          next: 'propose',
        };
      }

      case 'done':
      default:
        return {
          state: { ...newState, pendingProposal: null },
          next: 'summarize',
        };
    }
  },
};

// ---------------------------------------------------------------------------
// Step: apply
// ---------------------------------------------------------------------------

export const applyStep: AgentStep<PairState> = {
  name: 'apply',
  async run(state, ctx) {
    const proposal = state.pendingProposal;
    if (!proposal?.diff) {
      ctx.progress('No diff to apply.');
      return { state: { ...state, pendingProposal: null }, next: 'review-gate' };
    }

    ctx.progress('Applying diff...');
    const result = await applyApprovedDiff(
      proposal.diff,
      state.input.repoPath,
      (msg) => ctx.progress(msg),
    );

    if (!result.success) {
      ctx.progress(`Apply failed: ${result.error ?? 'unknown error'}`);
      return {
        state: {
          ...state,
          pendingProposal: null,
          currentFocus: `Fix apply failure: ${result.error}`,
        },
        next: 'propose',
      };
    }

    const entry: DiffEntry = {
      file: result.filesWritten.join(', '),
      diff: proposal.diff,
      appliedAt: new Date().toISOString(),
    };

    // Update TODO status if applicable
    let activeTodos = state.activeTodos;
    let currentTodoIndex = state.currentTodoIndex;
    if (activeTodos && currentTodoIndex < activeTodos.length) {
      activeTodos = activeTodos.map((t, i) =>
        i === currentTodoIndex ? { ...t, status: 'done' as const, diff: proposal.diff } : t,
      );
      currentTodoIndex++;
    }

    const newState: PairState = {
      ...state,
      pendingProposal: null,
      changesApplied: [...state.changesApplied, entry],
      filesInScope: [...new Set([...state.filesInScope, ...result.filesWritten])],
      activeTodos,
      currentTodoIndex,
    };

    ctx.progress(`Applied to ${result.filesWritten.length} file(s).`);
    return { state: newState, next: 'validate' };
  },
};

// ---------------------------------------------------------------------------
// Step: validate (Claude reviews applied diff)
// ---------------------------------------------------------------------------

export const validateStep: AgentStep<PairState> = {
  name: 'validate',
  async run(state, ctx) {
    const lastChange = state.changesApplied[state.changesApplied.length - 1];
    if (!lastChange) {
      return { state, next: nextAfterValidation(state) };
    }

    const claudeProvider = ctx.providers.resolveOrNull('pair', 'validate');
    if (!claudeProvider) {
      ctx.progress('No Claude provider — skipping validation.');
      return { state, next: nextAfterValidation(state) };
    }

    ctx.progress('Validating changes with Claude...');

    // Use generateAndValidate in validation-only mode
    const result = await generateAndValidate({
      userMessage: state.input.message,
      repoPath: state.input.repoPath,
      codeContext: state.input.codeContext,
      generateSystem: '', // Not used — we already have a diff
      localProvider: ctx.providers.local,
      claudeProvider,
      maxRetries: 0, // Just validate, don't retry here
      extraContext: [lastChange.diff],
      log: (msg) => ctx.progress(msg),
    });

    if (result.approved) {
      ctx.progress('Validation: APPROVED');
      return { state, next: nextAfterValidation(state) };
    }

    // Validation failed — feed back to propose
    const key = `validate-${state.iterationCount}`;
    const rounds = (state.editRounds[key] ?? 0) + 1;
    if (rounds > MAX_VALIDATION_RETRIES) {
      const valReply = await ctx.gate({
        stage: 'validation-exhausted',
        title: 'Validation Failed',
        content: `Validation failed after ${MAX_VALIDATION_RETRIES} retries.\n\nFeedback: ${result.feedback ?? 'none'}`,
        actions: [
          { name: 'proceed', label: 'Proceed anyway' },
          { name: 'reject', label: 'Reject changes' },
        ],
      });
      if (valReply.action === 'proceed') {
        return { state, next: nextAfterValidation(state) };
      }
      return {
        state: {
          ...state,
          pendingProposal: null,
          currentFocus: 'Validation rejected. Try a different approach.',
        },
        next: 'propose',
      };
    }

    ctx.progress(`Validation: CHANGES_NEEDED — re-proposing (round ${rounds}).`);
    return {
      state: {
        ...state,
        currentFocus: `Address validation feedback: ${result.feedback}`,
        editRounds: { ...state.editRounds, [key]: rounds },
      },
      next: 'propose',
    };
  },
};

// ---------------------------------------------------------------------------
// Step: summarize
// ---------------------------------------------------------------------------

export const summarizeStep: AgentStep<PairState> = {
  name: 'summarize',
  async run(state, ctx) {
    ctx.progress('Summarising session...');

    const provider = resolveStepProvider(ctx, state, 'pair', 'summarize');

    const parts: string[] = [];
    parts.push(`Mode: ${state.mode}`);
    parts.push(`Request: ${state.input.message}`);

    if (state.changesApplied.length > 0) {
      parts.push(`\nFiles changed (${state.changesApplied.length}):`);
      for (const c of state.changesApplied) {
        parts.push(`- ${c.file}`);
      }
    }

    if (state.findings.length > 0) {
      parts.push(`\nFindings (${state.findings.length}):`);
      for (const f of state.findings) {
        parts.push(`- ${f.description}`);
      }
    }

    if (state.conversationSummary) {
      parts.push(`\nSession notes:\n${state.conversationSummary}`);
    }

    const messages: LLMMessage[] = [
      { role: 'system', content: SUMMARIZE_SYSTEM },
      { role: 'user', content: parts.join('\n') },
    ];

    const response = await provider.complete(messages, {
      maxTokens: 1000,
      temperature: 0.2,
    });

    const summary = response.text.trim();

    ctx.writeArtifact('pair-summary.md', summary);
    ctx.emit(summary);

    return {
      state: {
        ...state,
        conversationSummary: summary,
      },
      next: null,
    };
  },
  artifacts: () => ['pair-summary.md'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAnalyzeQuery(state: PairState): string {
  const parts: string[] = [state.input.message];
  if (state.input.codeContext) {
    parts.push(`\nExisting code context:\n${state.input.codeContext}`);
  }
  if (state.mode === 'debug') {
    parts.push('\nFocus on: identifying potential root causes, checking recent changes, examining error handling paths.');
  }
  return parts.join('\n');
}

function getProposalSystemPrompt(mode: string): string {
  switch (mode) {
    case 'implement': return PROPOSE_IMPLEMENT_SYSTEM;
    case 'refactor': return PROPOSE_REFACTOR_SYSTEM;
    case 'debug': return PROPOSE_DEBUG_SYSTEM;
    case 'explore': return PROPOSE_EXPLORE_SYSTEM;
    default: return PROPOSE_IMPLEMENT_SYSTEM;
  }
}

function parseProposal(text: string, mode: string): Proposal {
  const sections = text.split(/^##\s+/m).filter(Boolean);
  let summary = '';
  let diff: string | undefined;
  const todos: TodoItem[] = [];
  const findings: Array<{ description: string; evidence: string; file?: string; line?: number }> = [];

  for (const section of sections) {
    const lines = section.split('\n');
    const heading = (lines[0] ?? '').trim().toLowerCase();
    const body = lines.slice(1).join('\n').trim();

    if (heading.includes('summary') || heading.includes('hypothesis')) {
      summary = body;
    } else if (heading.includes('diff')) {
      diff = extractDiffFromResponse(body);
    } else if (heading.includes('todo')) {
      const todoLines = body.split('\n');
      let idx = 0;
      for (const line of todoLines) {
        const match = line.match(/^\d+\.\s+(.+)/);
        if (match) {
          todos.push({ index: idx++, description: match[1]!.trim(), status: 'pending' });
        }
      }
    } else if (heading.includes('evidence') || heading.includes('finding')) {
      for (const line of body.split('\n')) {
        const item = line.replace(/^[-*]\s*/, '').trim();
        if (item) findings.push({ description: item, evidence: item });
      }
    }
  }

  // Fallback
  if (!summary && !diff) {
    summary = text.slice(0, 200);
    diff = extractDiffFromResponse(text) || undefined;
  }

  return {
    summary,
    diff: diff || undefined,
    todos: todos.length > 0 ? todos : undefined,
    findings: findings.length > 0 ? findings : undefined,
  };
}

function formatProposalForGate(proposal: Proposal, state: PairState): string {
  const parts: string[] = [];

  parts.push(`## Summary\n${proposal.summary}`);

  if (proposal.diff) {
    parts.push(`\n## Diff\n\`\`\`diff\n${proposal.diff}\n\`\`\``);
  }

  if (proposal.todos && proposal.todos.length > 0) {
    parts.push('\n## TODOs');
    for (const todo of proposal.todos) {
      const marker = todo.status === 'done' ? '✓' : todo.status === 'in_progress' ? '→' : '○';
      parts.push(`${marker} ${todo.index + 1}. ${todo.description}`);
    }
  }

  if (proposal.findings && proposal.findings.length > 0) {
    parts.push('\n## Findings');
    for (const f of proposal.findings) {
      parts.push(`- ${f.description}`);
    }
  }

  if (proposal.question) {
    parts.push(`\n## Question\n${proposal.question}`);
  }

  if (state.changesApplied.length > 0) {
    parts.push(`\n---\n*Session: ${state.changesApplied.length} change(s) applied, iteration ${state.iterationCount}*`);
  }

  return parts.join('\n');
}

function nextAfterValidation(state: PairState): string {
  // If there are more TODOs, continue proposing
  if (state.activeTodos) {
    const remaining = state.activeTodos.filter(t => t.status === 'pending');
    if (remaining.length > 0) {
      return 'propose';
    }
  }
  // Otherwise go back to review gate for the user to continue or done
  return 'review-gate';
}

function appendSummary(existing: string, addition: string): string {
  return existing ? `${existing}\n${addition}` : addition;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
