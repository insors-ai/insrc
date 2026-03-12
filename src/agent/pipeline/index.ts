import type { AssemblyResult, PipelineConfig, PipelineRunOpts } from './types.js';
import { runAnalyze } from './analyze.js';
import { runPlan } from './plan-steps.js';
import { runExecute } from './execute.js';
import { runAssemble } from './assemble.js';

// ---------------------------------------------------------------------------
// Pipeline V2 — 4-stage incremental runner
//
// Analyze → Plan → Execute (per-step) → Assemble
//
// When a ContextProvider is supplied in opts, the pipeline uses the
// vector index and code knowledge graph to fetch per-step context:
//   - Analyze: vector search enriches referenced entities
//   - Execute: each step gets its own graph-fetched code context
//              with progressive disclosure across steps
//
// Falls back gracefully to the flat codeContext string when no provider.
//
// Usage:
//   const provider = createDaemonContextProvider();
//   const result = await runPipeline(designConfig, { ...opts, contextProvider: provider });
// ---------------------------------------------------------------------------

export { shimLogger } from './types.js';
export type { PipelineRunOpts, PipelineConfig, AssemblyResult, ContextProvider } from './types.js';
export type { AnalysisResult, ExecutionPlan, StepResult } from './types.js';
export { createDaemonContextProvider, createNullContextProvider } from './context-provider.js';

/**
 * Run the full 4-stage pipeline.
 *
 * @param config - Pipeline-specific configuration (prompts, assembly strategy)
 * @param opts   - Runtime options (input, providers, context config, logger)
 * @returns AssemblyResult with final output and metadata
 */
export async function runPipeline(
  config: PipelineConfig,
  opts: PipelineRunOpts,
): Promise<AssemblyResult> {
  const {
    userMessage, codeContext, localProvider, claudeProvider,
    contextConfig, onEvent, contextProvider,
  } = opts;
  const priorContext = opts.priorContext ?? '';

  // Stage 1: Analyze — understand input, extract requirements, enrich with graph
  const analysis = await runAnalyze(
    userMessage, codeContext, priorContext,
    localProvider, contextConfig, onEvent, contextProvider,
  );

  // Stage 2: Plan — decompose into independent execution steps
  const plan = await runPlan(
    analysis, config, localProvider, contextConfig, onEvent,
  );

  // Stage 3: Execute — per-step context fetch + sketch + enhance
  const results = await runExecute(
    plan, config, localProvider, claudeProvider, contextConfig, onEvent, contextProvider,
  );

  // Stage 4: Assemble — combine step outputs into final artifact
  const assembled = runAssemble(plan, results, onEvent);

  return assembled;
}
