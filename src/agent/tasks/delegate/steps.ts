/**
 * Delegate agent steps — 6 steps implementing plan-driven autonomous execution.
 *
 * invoke-planner → approve-plan-gate → execute-step → advance → failure-gate → report
 *
 * The core loop is: execute-step → advance → (more steps? → execute-step, else → report)
 */

import type { AgentStep, StepContext, StepResult as FrameworkStepResult } from '../../framework/types.js';
import type { LLMMessage } from '../../../shared/types.js';
import type { DelegateState } from './agent-state.js';
import type {
  DelegatePlan, DelegatePlanStep, StepResult, CommitStrategy,
} from './types.js';
import {
  parseProviderMention, resolveStepProvider, consumeOverride, applyOverride,
} from '../../framework/provider-mention.js';
import { runAgent, type RunnerOpts } from '../../framework/runner.js';
import { plannerAgent } from '../../planner/agent.js';
import type { PlannerInput } from '../../planner/agent-state.js';
import type { Plan, Step } from '../../planner/types.js';
import { TestChannel } from '../../framework/test-channel.js';
import { investigate } from '../shared/investigate.js';
import { generateAndValidate, applyApprovedDiff } from '../shared/codegen.js';
import { autoCommit } from './git-ops.js';
import { EXECUTE_SYSTEM, REPORT_SYSTEM } from './prompts.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_STEP_RETRIES = 2;

// ---------------------------------------------------------------------------
// Step: invoke-planner (sub-agent)
// ---------------------------------------------------------------------------

export const invokePlannerStep: AgentStep<DelegateState> = {
  name: 'invoke-planner',
  async run(state, ctx) {
    ctx.progress('Running planner agent...');

    const plannerInput: PlannerInput = {
      message: state.input.message,
      codeContext: state.input.codeContext,
      planType: 'implementation',
      session: {
        repoPath: state.input.repoPath,
        closureRepos: state.input.closureRepos,
      },
    };

    // Run planner as a sub-agent with auto-approve gates
    const subChannel = new TestChannel([
      { action: 'approve' }, // validate-plan gate
      { action: 'approve' }, // validate-details gate
    ]);

    const plannerOpts: RunnerOpts = {
      definition: plannerAgent as unknown as RunnerOpts['definition'],
      channel: subChannel,
      options: { input: plannerInput, repo: state.input.repoPath },
      config: ctx.config,
      providers: ctx.providers,
    };

    const result = await runAgent(plannerOpts);
    const plannerState = result.result as Record<string, unknown>;
    const rawPlan = plannerState['plan'] as Plan | null;

    if (!rawPlan) {
      ctx.progress('Planner did not produce a plan.');
      return {
        state: { ...state, plan: { title: 'Empty Plan', steps: [], commitPoints: [] } },
        next: 'approve-plan-gate',
      };
    }

    // Convert planner Plan to DelegatePlan
    const delegatePlan = convertPlan(rawPlan);

    ctx.progress(`Plan created: "${delegatePlan.title}" with ${delegatePlan.steps.length} steps.`);
    return {
      state: { ...state, plan: delegatePlan },
      next: 'approve-plan-gate',
    };
  },
};

// ---------------------------------------------------------------------------
// Step: approve-plan-gate
// ---------------------------------------------------------------------------

export const approvePlanGateStep: AgentStep<DelegateState> = {
  name: 'approve-plan-gate',
  async run(state, ctx) {
    const plan = state.plan;
    if (!plan) {
      return { state, next: 'report' };
    }

    const content = formatPlanForGate(plan, state);

    const reply = await ctx.gate({
      stage: 'plan-approval',
      title: 'Execution Plan',
      content,
      actions: [
        { name: 'approve', label: 'Approve & execute' },
        { name: 'edit', label: 'Edit plan', hint: '<feedback on plan>' },
        { name: 'abort', label: 'Abort' },
      ],
    });

    const { override, cleanFeedback } = parseProviderMention(reply.feedback ?? '');
    let newState = override ? applyOverride(state, override) : state;

    switch (reply.action) {
      case 'approve':
        return { state: newState, next: 'execute-step' };

      case 'edit': {
        // Parse commit strategy and gate level from feedback if present
        const parsed = parseGateFeedback(cleanFeedback || reply.feedback || '');
        const updatedState = {
          ...newState,
          ...(parsed.commitStrategy ? { commitStrategy: parsed.commitStrategy } : {}),
          ...(parsed.gateLevel ? { gateLevel: parsed.gateLevel as DelegateState['gateLevel'] } : {}),
        };
        // TODO: support plan step editing in future iteration
        ctx.progress('Plan feedback noted. Re-presenting plan...');
        return { state: updatedState, next: 'approve-plan-gate' };
      }

      case 'abort':
      default:
        return { state: newState, next: 'report' };
    }
  },
};

// ---------------------------------------------------------------------------
// Step: execute-step
// ---------------------------------------------------------------------------

export const executeStepStep: AgentStep<DelegateState> = {
  name: 'execute-step',
  async run(state, ctx) {
    const plan = state.plan;
    if (!plan || state.currentStepIndex >= plan.steps.length) {
      return { state, next: 'report' };
    }

    const planStep = plan.steps[state.currentStepIndex]!;
    ctx.progress(`Executing step ${planStep.index + 1}/${plan.steps.length}: ${planStep.title}`);

    // Mark as in_progress
    const updatedPlan = updateStepStatus(plan, state.currentStepIndex, 'in_progress');

    // Investigation phase
    ctx.progress('  Investigating relevant code...');
    const provider = resolveStepProvider(ctx, state, 'delegate', 'execute');
    const investigation = await investigate(
      `For plan step "${planStep.title}": ${planStep.description}\n\nContext: ${state.input.codeContext}`,
      ctx,
      { provider, onProgress: (msg) => ctx.progress(msg) },
    );

    // Code generation
    ctx.progress('  Generating code...');
    const claudeProvider = ctx.providers.resolveOrNull('delegate', 'validate');

    const extraContext: string[] = [];
    if (investigation.summary) extraContext.push(`Investigation:\n${investigation.summary}`);
    if (state.input.designSpec) extraContext.push(`Design spec:\n${state.input.designSpec}`);

    // Include plan context
    const planContext = plan.steps
      .map(s => `${s.index + 1}. [${s.status}] ${s.title}`)
      .join('\n');
    extraContext.push(`Plan:\n${planContext}\n\nCurrent step: ${planStep.index + 1}. ${planStep.title}\n${planStep.description}`);

    const codegenResult = await generateAndValidate({
      userMessage: planStep.description,
      repoPath: state.input.repoPath,
      codeContext: state.input.codeContext,
      generateSystem: EXECUTE_SYSTEM,
      localProvider: provider,
      claudeProvider,
      maxRetries: MAX_STEP_RETRIES,
      extraContext,
      log: (msg) => ctx.progress(msg),
    });

    if (!codegenResult.approved) {
      // Generation/validation failed
      const stepResult: StepResult = {
        status: 'failed',
        diff: codegenResult.diff,
        filesChanged: [],
        error: codegenResult.feedback || 'Code generation failed validation',
      };

      const failedPlan = updateStepStatus(updatedPlan, state.currentStepIndex, 'failed');

      return {
        state: {
          ...state,
          plan: failedPlan,
          stepResults: [...state.stepResults, stepResult],
        },
        next: 'failure-gate',
      };
    }

    // Apply diff
    ctx.progress('  Applying changes...');
    const applyResult = await applyApprovedDiff(
      codegenResult.diff,
      state.input.repoPath,
      (msg) => ctx.progress(msg),
    );

    if (!applyResult.success) {
      const stepResult: StepResult = {
        status: 'failed',
        diff: codegenResult.diff,
        filesChanged: [],
        error: applyResult.error ?? 'Diff apply failed',
      };

      const failedPlan = updateStepStatus(updatedPlan, state.currentStepIndex, 'failed');
      return {
        state: {
          ...state,
          plan: failedPlan,
          stepResults: [...state.stepResults, stepResult],
        },
        next: 'failure-gate',
      };
    }

    // Success
    const stepResult: StepResult = {
      status: 'success',
      diff: codegenResult.diff,
      filesChanged: applyResult.filesWritten,
    };

    const donePlan = updateStepStatus(updatedPlan, state.currentStepIndex, 'done');

    const newState = consumeOverride({
      ...state,
      plan: donePlan,
      stepResults: [...state.stepResults, stepResult],
      filesChanged: [...state.filesChanged, ...applyResult.filesWritten],
      pendingCommitFiles: [...state.pendingCommitFiles, ...applyResult.filesWritten],
    });

    ctx.progress(`  Step ${planStep.index + 1} complete (${applyResult.filesWritten.length} files).`);
    return { state: newState, next: 'advance' };
  },
};

// ---------------------------------------------------------------------------
// Step: advance
// ---------------------------------------------------------------------------

export const advanceStep: AgentStep<DelegateState> = {
  name: 'advance',
  async run(state, ctx) {
    const plan = state.plan;
    if (!plan) return { state, next: 'report' };

    // Check if we should commit
    const shouldCommit = shouldCommitNow(state);
    let newState = state;

    if (shouldCommit && state.pendingCommitFiles.length > 0) {
      const currentStep = plan.steps[state.currentStepIndex];
      const title = currentStep?.title ?? `Step ${state.currentStepIndex + 1}`;

      ctx.progress(`Committing changes for: ${title}`);
      const commitResult = await autoCommit(
        state.pendingCommitFiles,
        title,
        state.input.repoPath,
      );

      if (commitResult.success) {
        ctx.progress(`Committed: ${commitResult.commitHash ?? 'ok'}`);
        newState = {
          ...state,
          pendingCommitFiles: [],
          commits: [...state.commits, commitResult.message],
        };
      } else {
        ctx.progress(`Commit failed: ${commitResult.error ?? 'unknown'}`);
        newState = state;
      }
    }

    // Advance to next step
    const nextIndex = state.currentStepIndex + 1;

    if (nextIndex >= plan.steps.length) {
      return { state: { ...newState, currentStepIndex: nextIndex }, next: 'report' };
    }

    return {
      state: { ...newState, currentStepIndex: nextIndex },
      next: 'execute-step',
    };
  },
};

// ---------------------------------------------------------------------------
// Step: failure-gate
// ---------------------------------------------------------------------------

export const failureGateStep: AgentStep<DelegateState> = {
  name: 'failure-gate',
  async run(state, ctx) {
    const plan = state.plan;
    if (!plan) return { state, next: 'report' };

    const failedStep = plan.steps[state.currentStepIndex];
    const lastResult = state.stepResults[state.stepResults.length - 1];

    const remaining = plan.steps.filter(s => s.status === 'pending');

    const content = [
      `## Step Failed: ${failedStep?.title ?? 'Unknown'}`,
      '',
      `**Error:** ${lastResult?.error ?? 'Unknown error'}`,
      '',
      `**Remaining steps:** ${remaining.length}`,
      ...remaining.map(s => `- ${s.index + 1}. ${s.title}`),
    ].join('\n');

    const reply = await ctx.gate({
      stage: 'failure',
      title: 'Step Execution Failed',
      content,
      actions: [
        { name: 'retry', label: 'Retry', hint: '<feedback>' },
        { name: 'skip', label: 'Skip step' },
        { name: 'abort', label: 'Abort remaining' },
      ],
    });

    const { override, cleanFeedback } = parseProviderMention(reply.feedback ?? '');
    let newState = override ? applyOverride(state, override) : state;

    switch (reply.action) {
      case 'retry': {
        // Reset step status to pending and retry
        const retryPlan = updateStepStatus(plan, state.currentStepIndex, 'pending');
        return {
          state: {
            ...newState,
            plan: retryPlan,
            currentFocus: cleanFeedback || reply.feedback,
          } as DelegateState,
          next: 'execute-step',
        };
      }

      case 'skip': {
        const skippedPlan = updateStepStatus(plan, state.currentStepIndex, 'skipped');
        const skipResult: StepResult = {
          status: 'skipped',
          filesChanged: [],
        };
        return {
          state: {
            ...newState,
            plan: skippedPlan,
            stepResults: [...newState.stepResults.slice(0, -1), skipResult],
          },
          next: 'advance',
        };
      }

      case 'abort':
      default:
        return { state: newState, next: 'report' };
    }
  },
};

// ---------------------------------------------------------------------------
// Step: report
// ---------------------------------------------------------------------------

export const reportStep: AgentStep<DelegateState> = {
  name: 'report',
  async run(state, ctx) {
    ctx.progress('Generating execution report...');

    const plan = state.plan;
    const provider = resolveStepProvider(ctx, state, 'delegate', 'report');

    // Final commit if pending
    if (state.pendingCommitFiles.length > 0) {
      ctx.progress('Committing remaining changes...');
      const commitResult = await autoCommit(
        state.pendingCommitFiles,
        'final changes',
        state.input.repoPath,
      );
      if (commitResult.success) {
        state = {
          ...state,
          pendingCommitFiles: [],
          commits: [...state.commits, commitResult.message],
        };
      }
    }

    // Build report context
    const parts: string[] = [];
    parts.push(`Request: ${state.input.message}`);

    if (plan) {
      parts.push(`\nPlan: ${plan.title}`);
      for (const step of plan.steps) {
        parts.push(`  ${step.index + 1}. [${step.status}] ${step.title}`);
      }
    }

    if (state.stepResults.length > 0) {
      parts.push('\nStep Results:');
      for (let i = 0; i < state.stepResults.length; i++) {
        const r = state.stepResults[i]!;
        const step = plan?.steps[i];
        parts.push(`  ${i + 1}. ${step?.title ?? 'Unknown'}: ${r.status} (${r.filesChanged.length} files)`);
        if (r.error) parts.push(`     Error: ${r.error}`);
      }
    }

    if (state.filesChanged.length > 0) {
      parts.push(`\nTotal files changed: ${state.filesChanged.length}`);
      for (const f of [...new Set(state.filesChanged)]) {
        parts.push(`  - ${f}`);
      }
    }

    if (state.commits.length > 0) {
      parts.push(`\nCommits (${state.commits.length}):`);
      for (const c of state.commits) parts.push(`  - ${c}`);
    }

    const messages: LLMMessage[] = [
      { role: 'system', content: REPORT_SYSTEM },
      { role: 'user', content: parts.join('\n') },
    ];

    const response = await provider.complete(messages, {
      maxTokens: 2000,
      temperature: 0.2,
    });

    const report = response.text.trim();
    ctx.writeArtifact('delegate-report.md', report);
    ctx.emit(report);

    return { state, next: null };
  },
  artifacts: () => ['delegate-report.md'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert planner's Plan to DelegatePlan. */
function convertPlan(plan: Plan): DelegatePlan {
  const steps: DelegatePlanStep[] = plan.steps.map((step, i) => ({
    index: i,
    title: step.title,
    description: step.description,
    status: 'pending',
    commitAfter: false,
  }));

  // Suggest commit points: after every 3 steps and at the end
  const commitPoints: number[] = [];
  for (let i = 2; i < steps.length; i += 3) {
    commitPoints.push(i);
    steps[i]!.commitAfter = true;
  }
  if (steps.length > 0) {
    const lastIdx = steps.length - 1;
    if (!commitPoints.includes(lastIdx)) {
      commitPoints.push(lastIdx);
      steps[lastIdx]!.commitAfter = true;
    }
  }

  return {
    title: plan.title,
    steps,
    commitPoints,
  };
}

/** Update a step's status in the plan. */
function updateStepStatus(
  plan: DelegatePlan,
  stepIndex: number,
  status: DelegatePlanStep['status'],
): DelegatePlan {
  return {
    ...plan,
    steps: plan.steps.map((s, i) =>
      i === stepIndex ? { ...s, status } : s,
    ),
  };
}

/** Format the plan for the approval gate. */
function formatPlanForGate(plan: DelegatePlan, state: DelegateState): string {
  const parts: string[] = [];

  parts.push(`## ${plan.title}`);
  parts.push(`\n**Steps:** ${plan.steps.length}`);
  parts.push(`**Commit strategy:** ${formatCommitStrategy(state.commitStrategy)}`);
  parts.push(`**Gate level:** ${state.gateLevel}`);

  parts.push('\n## Steps');
  for (const step of plan.steps) {
    const commit = step.commitAfter ? ' [commit]' : '';
    parts.push(`${step.index + 1}. **${step.title}**${commit}`);
    parts.push(`   ${step.description}`);
  }

  parts.push('\n---');
  parts.push('*You can adjust commit strategy (e.g. "commit: per-step") and gate level (e.g. "gate: cautious") in your feedback.*');

  return parts.join('\n');
}

function formatCommitStrategy(strategy: CommitStrategy): string {
  switch (strategy.kind) {
    case 'per-step': return 'per-step';
    case 'at-end': return 'at end';
    case 'at-points': return `at steps ${strategy.points.map(p => p + 1).join(', ')}`;
  }
}

/** Parse user feedback for commit strategy and gate level overrides. */
function parseGateFeedback(feedback: string): {
  commitStrategy?: CommitStrategy | undefined;
  gateLevel?: string | undefined;
} {
  const result: { commitStrategy?: CommitStrategy; gateLevel?: string } = {};

  const commitMatch = feedback.match(/commit:\s*(per-step|at-end|at-points)/i);
  if (commitMatch) {
    const kind = commitMatch[1]!.toLowerCase();
    if (kind === 'per-step') result.commitStrategy = { kind: 'per-step' };
    else if (kind === 'at-end') result.commitStrategy = { kind: 'at-end' };
  }

  const gateMatch = feedback.match(/gate:\s*(minimal|normal|cautious)/i);
  if (gateMatch) {
    result.gateLevel = gateMatch[1]!.toLowerCase();
  }

  return result;
}

/** Check if we should commit based on the current strategy and step. */
function shouldCommitNow(state: DelegateState): boolean {
  const plan = state.plan;
  if (!plan) return false;

  switch (state.commitStrategy.kind) {
    case 'per-step':
      return true;
    case 'at-end':
      return state.currentStepIndex >= plan.steps.length - 1;
    case 'at-points':
      return state.commitStrategy.points.includes(state.currentStepIndex);
  }
}
