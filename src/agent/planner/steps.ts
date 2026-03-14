/**
 * Planner agent steps — 8-step pipeline for plan creation.
 *
 * 1. analyze-request   — Parse intent, detect plan type
 * 2. gather-context    — Search codebase via daemon RPC
 * 3. draft-plan        — Local sketch → Claude refine → build Plan<T>
 * 4. validate-plan     — [GATE] User approves plan overview
 * 5. resolve-deps      — Cycle detection, blocked step analysis
 * 6. detail-steps      — Enrich with domain-specific data
 * 7. validate-details  — [GATE] User approves detailed plan
 * 8. serialize         — toMarkdown → artifact → done
 */

import type { LLMMessage, Entity } from '../../shared/types.js';
import type { AgentStep, StepContext, StepResult } from '../framework/types.js';
import type { PlannerState, InferredPlanType } from './agent-state.js';
import type { Plan, Step, ProgressSummary } from './types.js';
import { generateId } from './utils.js';
import { detectCycles, detectBlockedSteps, computePlanStatus } from './engine.js';
import { toMarkdown } from './markdown.js';
import { getProgressSummary } from './progress.js';
import {
  ANALYZE_SYSTEM, DRAFT_SYSTEM, ENHANCE_SYSTEM, CONDENSED_SYSTEM,
  DETAIL_SYSTEM, SEARCH_PLAN_SYSTEM,
} from './prompts.js';
import { createDaemonContextProvider } from '../tools/context-provider.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_EDIT_ROUNDS = 3;

// ---------------------------------------------------------------------------
// Step 1: analyze-request
// ---------------------------------------------------------------------------

export const analyzeRequestStep: AgentStep<PlannerState> = {
  name: 'analyze-request',
  async run(state, ctx): Promise<StepResult<PlannerState>> {
    ctx.progress('Analyzing planning request...');

    const messages: LLMMessage[] = [
      { role: 'system', content: ANALYZE_SYSTEM },
      { role: 'user', content: state.input.message },
    ];

    const response = await ctx.providers.resolve('planner', 'analyze').complete(messages, {
      maxTokens: 1000,
      temperature: 0.3,
    });

    let inferredType: InferredPlanType = state.input.planType || 'generic';
    try {
      const parsed = JSON.parse(extractJson(response.text)) as { planType?: string };
      if (parsed.planType && ['implementation', 'test', 'migration', 'generic'].includes(parsed.planType)) {
        inferredType = parsed.planType as InferredPlanType;
      }
    } catch {
      // Keep default
    }

    return {
      state: {
        ...state,
        analysis: response.text,
        inferredPlanType: inferredType,
      },
      next: 'gather-context',
    };
  },
};

// ---------------------------------------------------------------------------
// Step 2: gather-context
// ---------------------------------------------------------------------------

export const gatherContextStep: AgentStep<PlannerState> = {
  name: 'gather-context',
  async run(state, ctx): Promise<StepResult<PlannerState>> {
    ctx.progress('Searching codebase for relevant entities...');

    const provider = createDaemonContextProvider();

    // Plan searches using LLM
    let searches: Array<{ query: string; filter: string; limit: number }> = [];
    try {
      const planMessages: LLMMessage[] = [
        { role: 'system', content: SEARCH_PLAN_SYSTEM },
        { role: 'user', content: state.input.message },
      ];
      const planResponse = await ctx.providers.resolve('planner', 'search').complete(planMessages, {
        maxTokens: 800,
        temperature: 0.2,
      });
      const parsed = JSON.parse(extractJson(planResponse.text)) as unknown;
      if (Array.isArray(parsed)) {
        searches = parsed.filter(
          (s): s is { query: string; filter: string; limit: number } =>
            typeof s === 'object' && s !== null && 'query' in s,
        );
      }
    } catch {
      // Fallback: single broad search
      searches = [{ query: state.input.message.slice(0, 200), filter: 'all', limit: 15 }];
    }

    // Execute searches in parallel
    const allEntities: Entity[] = [];
    const seenIds = new Set<string>();

    const searchResults = await Promise.all(
      searches.map(s =>
        provider.search(s.query, s.limit || 10, (s.filter as 'all' | 'code' | 'artifact') || 'all')
          .catch(() => [] as Entity[]),
      ),
    );

    for (const entities of searchResults) {
      for (const e of entities) {
        if (!seenIds.has(e.id)) {
          seenIds.add(e.id);
          allEntities.push(e);
        }
      }
    }

    // Expand top entities for neighbors
    const topN = allEntities.slice(0, 5);
    const expansions = await Promise.all(
      topN.map(e => provider.expand(e.id).catch(() => ({ callers: [], callees: [] }))),
    );

    // Format findings
    const findings = formatFindings(allEntities, topN, expansions);

    return {
      state: { ...state, codebaseFindings: findings },
      next: 'draft-plan',
    };
  },
};

// ---------------------------------------------------------------------------
// Step 3: draft-plan
// ---------------------------------------------------------------------------

export const draftPlanStep: AgentStep<PlannerState> = {
  name: 'draft-plan',
  async run(state, ctx): Promise<StepResult<PlannerState>> {
    const hasContext = !!(state.input.codeContext || state.codebaseFindings);

    // Build context
    const contextParts: string[] = [];
    if (state.analysis) contextParts.push(`Analysis:\n${state.analysis}`);
    if (state.codebaseFindings) contextParts.push(`Codebase context:\n${state.codebaseFindings}`);
    if (state.input.codeContext) contextParts.push(`Additional context:\n${state.input.codeContext}`);

    const userContent = contextParts.length > 0
      ? `${contextParts.join('\n\n')}\n\nUser request:\n${state.input.message}`
      : `User request:\n${state.input.message}`;

    // Stage 1 — Draft plan
    ctx.progress('Drafting plan...');
    const sketchMessages: LLMMessage[] = [
      { role: 'system', content: hasContext ? DRAFT_SYSTEM : CONDENSED_SYSTEM },
      { role: 'user', content: userContent },
    ];

    const sketchResponse = await ctx.providers.resolve('planner', 'draft').complete(sketchMessages, {
      maxTokens: 3000,
      temperature: 0.3,
    });

    let enhancedText = sketchResponse.text;

    // Stage 2 — Enhancement
    const enhanceProvider = ctx.providers.resolveOrNull('planner', 'enhance');
    if (enhanceProvider) {
      ctx.progress('Refining plan...');
      const enhanceMessages: LLMMessage[] = [
        { role: 'system', content: ENHANCE_SYSTEM },
        {
          role: 'user',
          content: [
            `Implementation plan to refine:\n\n${sketchResponse.text}`,
            state.codebaseFindings ? `Codebase context:\n${state.codebaseFindings}` : '',
            `Original request:\n${state.input.message}`,
          ].filter(Boolean).join('\n\n'),
        },
      ];

      const enhanced = await enhanceProvider.complete(enhanceMessages, {
        maxTokens: 4000,
        temperature: 0.2,
      });
      enhancedText = enhanced.text;
    }

    // Parse steps and build plan
    const rawSteps = parseStepsJson(enhancedText);
    const plan = buildPlan(state.input.repoPath, state.input.message, rawSteps, state.inferredPlanType);

    return {
      state: {
        ...state,
        draftSteps: enhancedText,
        plan,
      },
      next: 'validate-plan',
    };
  },
};

// ---------------------------------------------------------------------------
// Step 4: validate-plan [GATE]
// ---------------------------------------------------------------------------

export const validatePlanStep: AgentStep<PlannerState> = {
  name: 'validate-plan',
  async run(state, ctx): Promise<StepResult<PlannerState>> {
    if (!state.plan) throw new Error('No plan to validate');

    const summary = formatPlanSummary(state.plan);

    const reply = await ctx.gate({
      stage: 'plan-overview',
      title: 'Plan Validation',
      content: summary,
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'edit', label: 'Edit', hint: '<feedback>', needsInput: true },
        { name: 'reject', label: 'Reject', hint: '<reason>', needsInput: true },
      ],
    });

    if (reply.action === 'approve') {
      return { state, next: 'resolve-deps' };
    }

    if (reply.action === 'reject') {
      // Re-draft with rejection feedback
      const roundKey = 'plan-draft';
      const rounds = (state.editRounds[roundKey] ?? 0) + 1;
      if (rounds >= MAX_EDIT_ROUNDS) {
        ctx.emit('Maximum edit rounds reached. Proceeding with current plan.');
        return { state, next: 'resolve-deps' };
      }
      return {
        state: {
          ...state,
          input: {
            ...state.input,
            message: `${state.input.message}\n\nFeedback: ${reply.feedback ?? ''}`,
          },
          editRounds: { ...state.editRounds, [roundKey]: rounds },
          plan: null,
        },
        next: 'draft-plan',
      };
    }

    // Edit: re-draft with feedback
    if (reply.action === 'edit' && reply.feedback) {
      const roundKey = 'plan-draft';
      const rounds = (state.editRounds[roundKey] ?? 0) + 1;
      if (rounds >= MAX_EDIT_ROUNDS) {
        ctx.emit('Maximum edit rounds reached. Proceeding with current plan.');
        return { state, next: 'resolve-deps' };
      }
      return {
        state: {
          ...state,
          input: {
            ...state.input,
            codeContext: `${state.input.codeContext}\n\nPlan feedback: ${reply.feedback}`,
          },
          editRounds: { ...state.editRounds, [roundKey]: rounds },
          plan: null,
        },
        next: 'draft-plan',
      };
    }

    return { state, next: 'resolve-deps' };
  },
};

// ---------------------------------------------------------------------------
// Step 5: resolve-deps
// ---------------------------------------------------------------------------

export const resolveDepsStep: AgentStep<PlannerState> = {
  name: 'resolve-deps',
  async run(state, ctx): Promise<StepResult<PlannerState>> {
    if (!state.plan) throw new Error('No plan to validate dependencies');

    ctx.progress('Validating dependencies and checking for cycles...');

    const issues: string[] = [];

    // Check for cycles
    const cyclePath = detectCycles(state.plan);
    if (cyclePath) {
      issues.push(`Circular dependency detected: ${cyclePath.join(' → ')}`);
    }

    // Check for blocked steps
    const blocked = detectBlockedSteps(state.plan);
    for (const b of blocked) {
      issues.push(`Step "${b.id}" blocked: ${b.reasons.join(', ')}`);
    }

    if (issues.length > 0) {
      ctx.emit(`Dependency issues found:\n${issues.map(i => `  - ${i}`).join('\n')}`);

      // Loop back to validate-plan so user can fix
      return {
        state: { ...state, dependencyIssues: issues },
        next: 'validate-plan',
      };
    }

    // Recompute plan status
    const updatedPlan = { ...state.plan, status: computePlanStatus(state.plan) };

    return {
      state: { ...state, plan: updatedPlan, dependencyIssues: [] },
      next: 'detail-steps',
    };
  },
};

// ---------------------------------------------------------------------------
// Step 6: detail-steps
// ---------------------------------------------------------------------------

export const detailStepsStep: AgentStep<PlannerState> = {
  name: 'detail-steps',
  async run(state, ctx): Promise<StepResult<PlannerState>> {
    if (!state.plan) throw new Error('No plan to detail');

    ctx.progress('Enriching steps with domain-specific details...');

    const planType = state.inferredPlanType;

    // For generic plans, skip enrichment
    if (planType === 'generic') {
      return { state, next: 'validate-details' };
    }

    // Build step context for LLM
    const stepDescriptions = state.plan.steps.map((s, i) =>
      `Step ${i}: ${s.title}\n${s.description}`,
    ).join('\n\n');

    const messages: LLMMessage[] = [
      { role: 'system', content: DETAIL_SYSTEM },
      {
        role: 'user',
        content: [
          `Plan type: ${planType}`,
          `Steps:\n${stepDescriptions}`,
          state.codebaseFindings ? `Codebase context:\n${state.codebaseFindings}` : '',
        ].filter(Boolean).join('\n\n'),
      },
    ];

    const provider = ctx.providers.resolveOrNull('planner', 'detail') ?? ctx.providers.resolve('planner', 'draft');
    const response = await provider.complete(messages, {
      maxTokens: 3000,
      temperature: 0.2,
    });

    // Parse enrichment data
    try {
      const enrichments = JSON.parse(extractJson(response.text)) as Array<{
        stepIndex: number;
        data: Record<string, unknown>;
      }>;

      const updatedSteps = state.plan.steps.map((step, idx) => {
        const enrichment = enrichments.find(e => e.stepIndex === idx);
        if (!enrichment) return step;
        return { ...step, data: enrichment.data as Step<unknown>['data'] };
      });

      return {
        state: { ...state, plan: { ...state.plan, steps: updatedSteps } },
        next: 'validate-details',
      };
    } catch {
      // Skip enrichment on parse failure
      return { state, next: 'validate-details' };
    }
  },
};

// ---------------------------------------------------------------------------
// Step 7: validate-details [GATE]
// ---------------------------------------------------------------------------

export const validateDetailsStep: AgentStep<PlannerState> = {
  name: 'validate-details',
  async run(state, ctx): Promise<StepResult<PlannerState>> {
    if (!state.plan) throw new Error('No plan to validate');

    const progress = getProgressSummary(state.plan);
    const detail = formatDetailedPlan(state.plan, progress);

    const reply = await ctx.gate({
      stage: 'plan-details',
      title: 'Detailed Plan Review',
      content: detail,
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'edit', label: 'Edit', hint: '<feedback>', needsInput: true },
        { name: 'skip', label: 'Skip details' },
      ],
    });

    if (reply.action === 'approve' || reply.action === 'skip') {
      return { state, next: 'serialize' };
    }

    if (reply.action === 'edit' && reply.feedback) {
      const roundKey = 'plan-detail';
      const rounds = (state.editRounds[roundKey] ?? 0) + 1;
      if (rounds >= MAX_EDIT_ROUNDS) {
        ctx.emit('Maximum edit rounds reached. Proceeding with current plan.');
        return { state, next: 'serialize' };
      }
      return {
        state: {
          ...state,
          editRounds: { ...state.editRounds, [roundKey]: rounds },
        },
        next: 'detail-steps',
      };
    }

    return { state, next: 'serialize' };
  },
};

// ---------------------------------------------------------------------------
// Step 8: serialize
// ---------------------------------------------------------------------------

export const serializeStep: AgentStep<PlannerState> = {
  name: 'serialize',
  async run(state, ctx): Promise<StepResult<PlannerState>> {
    if (!state.plan) throw new Error('No plan to serialize');

    ctx.progress('Serializing plan to Markdown...');

    const markdown = toMarkdown(state.plan);
    const artifactPath = ctx.writeArtifact(`plan-${state.plan.id}.md`, markdown);

    const summary = [
      `[plan:${state.plan.id}]`,
      `Plan: ${state.plan.title}`,
      `Steps: ${state.plan.steps.length}`,
      `Type: ${state.inferredPlanType}`,
    ].join(' | ');

    ctx.emit(`Plan saved to: ${artifactPath}\n\n${markdown}`);

    return {
      state: {
        ...state,
        serializedOutput: markdown,
        outputPath: artifactPath,
        summary,
      },
      next: null, // Done
    };
  },
  artifacts: (state) => state.plan ? [`plan-${state.plan.id}.md`] : [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RawStep {
  title: string;
  description: string;
  checkpoint?: boolean | undefined;
  complexity?: string | undefined;
  dependsOnIdx?: number[] | undefined;
  fileHint?: string | undefined;
}

function parseStepsJson(text: string): RawStep[] {
  let jsonStr = text.trim();

  // Strip markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1]!.trim();
  }

  // Find JSON array
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    jsonStr = arrayMatch[0]!;
  }

  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RawStep =>
        typeof item === 'object' && item !== null && 'title' in item,
    );
  } catch {
    return [{
      title: 'Implementation',
      description: text.slice(0, 500),
      checkpoint: false,
      complexity: 'medium',
      dependsOnIdx: [],
    }];
  }
}

function buildPlan(
  repoPath: string,
  title: string,
  rawSteps: RawStep[],
  planType: InferredPlanType,
): Plan {
  const now = new Date().toISOString();
  const planId = generateId();
  const stepIds = rawSteps.map(() => generateId());

  const steps: Step[] = rawSteps.map((raw, idx) => ({
    id:           stepIds[idx]!,
    title:        raw.title,
    description:  raw.description,
    status:       'pending' as const,
    dependencies: (raw.dependsOnIdx ?? [])
      .filter(i => i >= 0 && i < stepIds.length && i !== idx)
      .map(i => stepIds[i]!),
    notes:        raw.fileHint ? `File: ${raw.fileHint}` : undefined,
    metadata: {
      createdAt: now,
      updatedAt: now,
    },
  }));

  return {
    id:          planId,
    repoPath,
    title:       title.slice(0, 200),
    description: `${planType} plan`,
    status:      'active',
    steps,
    metadata: {
      createdAt: now,
      updatedAt: now,
    },
  };
}

function extractJson(text: string): string {
  // Try to find JSON object or array
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1]!.trim();

  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0]!;

  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) return arrMatch[0]!;

  return text;
}

function formatFindings(
  allEntities: Entity[],
  topEntities: Entity[],
  expansions: Array<{ callers: Entity[]; callees: Entity[] }>,
): string {
  const lines: string[] = [];

  for (let i = 0; i < topEntities.length; i++) {
    const e = topEntities[i]!;
    const exp = expansions[i]!;
    const path = e.file ?? '';
    const body = e.body?.slice(0, 600) ?? '';

    lines.push(`[${e.kind} ${e.name} — ${path}:${e.startLine ?? 0}-${e.endLine ?? 0}]`);
    if (body) lines.push(body);

    if (exp.callers.length > 0) {
      lines.push(`Callers: ${exp.callers.map(c => `${c.name} (${c.file ?? ''}:${c.startLine ?? 0})`).join(', ')}`);
    }
    if (exp.callees.length > 0) {
      lines.push(`Calls: ${exp.callees.map(c => `${c.name} (${c.file ?? ''}:${c.startLine ?? 0})`).join(', ')}`);
    }
    lines.push('');
  }

  // Remaining entities (signatures only)
  const remaining = allEntities.slice(topEntities.length);
  if (remaining.length > 0) {
    lines.push('--- Additional entities ---');
    for (const e of remaining) {
      lines.push(`[${e.kind} ${e.name} — ${e.file ?? ''}:${e.startLine ?? 0}]`);
    }
  }

  return lines.join('\n');
}

function formatPlanSummary(plan: Plan): string {
  const lines: string[] = [
    `# ${plan.title}`,
    `Type: ${plan.description}`,
    `Steps: ${plan.steps.length}`,
    '',
  ];

  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i]!;
    const deps = s.dependencies.length > 0
      ? ` (depends on: ${s.dependencies.map(d => {
          const dep = plan.steps.find(st => st.id === d);
          return dep ? dep.title : d;
        }).join(', ')})`
      : '';
    lines.push(`${i + 1}. ${s.title}${deps}`);
    lines.push(`   ${s.description}`);
    if (s.notes) lines.push(`   ${s.notes}`);
    lines.push('');
  }

  return lines.join('\n');
}

function formatDetailedPlan(plan: Plan, progress: ProgressSummary): string {
  const lines: string[] = [
    `# ${plan.title}`,
    `Progress: ${progress.pctComplete}% complete (${progress.byStatus.done}/${progress.total} done)`,
    '',
  ];

  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i]!;
    lines.push(`## Step ${i + 1}: ${s.title}`);
    lines.push(`Status: ${s.status}`);
    lines.push(s.description);

    if (s.data) {
      lines.push(`Data: ${JSON.stringify(s.data, null, 2)}`);
    }

    if (s.notes) lines.push(`Notes: ${s.notes}`);
    lines.push('');
  }

  return lines.join('\n');
}
