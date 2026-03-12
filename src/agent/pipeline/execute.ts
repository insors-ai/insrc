import type { LLMMessage, LLMProvider, ModelContextConfig } from '../../shared/types.js';
import type {
  ContextProvider, ExecutionPlan, ExecutionStep, PipelineConfig,
  PipelineLogger, StepResult,
} from './types.js';
import { fetchStepContext } from './context-fetch.js';

// ---------------------------------------------------------------------------
// Stage 3: Execute — run each step (local sketch + optional Claude enhance)
//
// Iterates through the execution plan's steps sequentially.
// For each step:
//   1. Fetch per-step context from the code graph (if ContextProvider available)
//   2. Local model produces a draft (sketch)
//   3. Optionally Claude enhances the output for quality/accuracy
// Progress is streamed via PipelineLogger events.
// ---------------------------------------------------------------------------

/**
 * Execute all steps in the plan.
 *
 * Each step goes through:
 *   3a. Context fetch — vector search + graph expansion for step-specific code
 *   3b. Local sketch — fast draft using the local model
 *   3c. Claude enhance (optional) — refine via Claude if needsEnhance=true
 *
 * Returns ordered StepResults ready for assembly.
 */
export async function runExecute(
  plan: ExecutionPlan,
  pipelineConfig: PipelineConfig,
  localProvider: LLMProvider,
  claudeProvider: LLMProvider | null,
  contextConfig: ModelContextConfig,
  onEvent?: PipelineLogger,
  contextProvider?: ContextProvider | undefined,
): Promise<StepResult[]> {
  const results: StepResult[] = [];

  // Track entities seen across steps for progressive disclosure
  const seenEntityIds = new Set<string>();

  for (const step of plan.steps) {
    onEvent?.({
      stage: 'execute',
      status: 'step-start',
      step: step.index,
      total: plan.steps.length,
      title: step.title,
    });

    const start = Date.now();

    try {
      // Fetch per-step graph context
      const graphContext = await fetchStepContext(
        step, contextProvider, seenEntityIds, onEvent,
      );
      // Attach to step so sketch/enhance can use it
      step.graphContext = graphContext || undefined;

      const result = await executeStep(
        step, plan, pipelineConfig, localProvider, claudeProvider, contextConfig,
      );
      const durationMs = Date.now() - start;

      results.push({
        index: step.index,
        title: step.title,
        output: result.output,
        enhanced: result.enhanced,
        durationMs,
      });

      onEvent?.({
        stage: 'execute',
        status: 'step-done',
        step: step.index,
        total: plan.steps.length,
        title: step.title,
        durationMs,
      });
    } catch (err) {
      const durationMs = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);

      results.push({
        index: step.index,
        title: step.title,
        output: '',
        enhanced: false,
        durationMs,
        error: errorMsg,
      });

      onEvent?.({
        stage: 'execute',
        status: 'step-error',
        step: step.index,
        total: plan.steps.length,
        title: step.title,
        error: errorMsg,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Per-step execution
// ---------------------------------------------------------------------------

interface StepOutput {
  output: string;
  enhanced: boolean;
}

async function executeStep(
  step: ExecutionStep,
  plan: ExecutionPlan,
  config: PipelineConfig,
  localProvider: LLMProvider,
  claudeProvider: LLMProvider | null,
  contextConfig: ModelContextConfig,
): Promise<StepOutput> {
  // Stage 3b: Local sketch
  const sketch = await runSketch(step, plan, config, localProvider, contextConfig);

  // Stage 3c: Claude enhance (if needed and available)
  if (step.needsEnhance && claudeProvider) {
    const enhanced = await runEnhance(step, sketch, plan, config, claudeProvider, contextConfig);
    return { output: enhanced, enhanced: true };
  }

  return { output: sketch, enhanced: false };
}

// ---------------------------------------------------------------------------
// Stage 3b: Local sketch
// ---------------------------------------------------------------------------

async function runSketch(
  step: ExecutionStep,
  plan: ExecutionPlan,
  config: PipelineConfig,
  provider: LLMProvider,
  contextConfig: ModelContextConfig,
): Promise<string> {
  const userContent = buildStepInput(step, plan);

  const messages: LLMMessage[] = [
    { role: 'system', content: config.sketchPrompt },
    { role: 'user', content: userContent },
  ];

  const response = await provider.complete(messages, {
    maxTokens: step.maxTokens,
    temperature: 0.3,
  });

  return response.text;
}

// ---------------------------------------------------------------------------
// Stage 3c: Claude enhance
// ---------------------------------------------------------------------------

async function runEnhance(
  step: ExecutionStep,
  sketch: string,
  plan: ExecutionPlan,
  config: PipelineConfig,
  provider: LLMProvider,
  contextConfig: ModelContextConfig,
): Promise<string> {
  const parts: string[] = [
    `Draft to enhance:\n\n${sketch}`,
  ];

  // Include the step's specific requirements
  if (step.requirementIndices.length > 0) {
    const reqs = step.requirementIndices
      .map(i => plan.analysis.requirements[i])
      .filter(Boolean)
      .map((r, i) => `${i + 1}. ${r}`)
      .join('\n');
    if (reqs) parts.push(`Requirements this section must address:\n${reqs}`);
  }

  // Include graph context for the enhance step too
  if (step.graphContext) {
    parts.push(`Relevant code from the codebase:\n${step.graphContext}`);
  }

  // Include shared context
  if (plan.sharedContext) {
    parts.push(`Context:\n${plan.sharedContext}`);
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: config.enhancePrompt },
    { role: 'user', content: parts.join('\n\n') },
  ];

  const response = await provider.complete(messages, {
    maxTokens: Math.min(contextConfig.claudeMaxOutput, step.maxTokens * 2),
    temperature: 0.2,
  });

  return response.text;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the user input for a step's local sketch call.
 * Includes: step prompt, graph context, relevant requirements, shared context.
 */
function buildStepInput(step: ExecutionStep, plan: ExecutionPlan): string {
  const parts: string[] = [];

  // Step-specific prompt
  parts.push(step.prompt);

  // Graph-fetched code context (per-step, from vector search + graph expansion)
  if (step.graphContext) {
    parts.push(`Relevant code from the codebase:\n${step.graphContext}`);
  }

  // Relevant requirements
  if (step.requirementIndices.length > 0) {
    const reqs = step.requirementIndices
      .map(i => plan.analysis.requirements[i])
      .filter(Boolean)
      .map((r, i) => `${i + 1}. ${r}`)
      .join('\n');
    if (reqs) parts.push(`Requirements:\n${reqs}`);
  }

  // Shared context (referenced entities, output format hints)
  if (plan.sharedContext) {
    parts.push(`Context:\n${plan.sharedContext}`);
  }

  // Template hint (so the step knows what wrapper format to expect)
  if (plan.template) {
    parts.push(`Output will be assembled into this template format — produce content that fits within it.`);
  }

  return parts.join('\n\n');
}
