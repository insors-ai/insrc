import type { Entity, LLMProvider, ModelContextConfig } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Pipeline V2 — 4-stage incremental architecture types
//
// Analyze → Plan → Execute (per-step, streaming) → Assemble
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Context provider — abstracts vector index + code graph access
// ---------------------------------------------------------------------------

/**
 * Abstraction over the vector index and code knowledge graph.
 *
 * The pipeline calls these methods to fetch relevant code context:
 *   - search(): vector similarity search over indexed entities
 *   - expand(): 1-hop graph expansion (callers + callees)
 *   - byFile(): all entities in a specific file
 *
 * Implementations may use the daemon RPC, or provide stubs for testing.
 * All methods are gracefully degradable — they return empty results on failure.
 */
export interface ContextProvider {
  /** Vector similarity search — returns entities ranked by relevance. */
  search(query: string, limit?: number, filter?: 'all' | 'code' | 'artifact'): Promise<Entity[]>;

  /** 1-hop graph expansion: callers and callees of an entity. */
  expand(entityId: string): Promise<{ callers: Entity[]; callees: Entity[] }>;

  /** All entities in a specific file. */
  byFile(filePath: string): Promise<Entity[]>;

  /** N-hop caller traversal (for refactor-style deep impact analysis). */
  callersNhop?(entityId: string, hops: number): Promise<Entity[]>;
}

// ---------------------------------------------------------------------------
// Stage 1: Analyze
// ---------------------------------------------------------------------------

export interface ChunkSummary {
  index: number;
  summary: string;
  keyPoints: string[];
  tokens: number;
}

/**
 * A discrete element extracted from the user's input.
 *
 * Preserves the input's natural structure — each element is a self-contained
 * unit (a section, module, file, feature, requirement) with its full detail
 * intact. The plan stage uses these directly to build execution steps.
 */
export interface InputElement {
  /** Short label (section title, file path, feature name) */
  title: string;
  /** Full content/description — preserves the user's original detail */
  content: string;
  /** Element type hint for the plan stage */
  kind: 'section' | 'module' | 'file' | 'feature' | 'requirement' | 'task';
  /** Indices of other elements this one depends on (if any) */
  dependsOn?: number[] | undefined;
}

export interface AnalysisResult {
  /**
   * Discrete elements decomposed from the input.
   * Preserves the input's natural structure and detail.
   * This is the primary input for the plan stage.
   */
  elements: InputElement[];
  /** Flat requirement strings (derived from elements, for backward compat) */
  requirements: string[];
  /** Referenced entities from the codebase */
  referencedEntities: string[];
  /** Expected output format */
  outputFormat: OutputFormat;
  /** Scope estimate based on input complexity */
  scope: 'small' | 'medium' | 'large';
  /** Chunk summaries (if input was split) */
  chunks: ChunkSummary[];
  /** Token count of the original input */
  inputTokens: number;
  /** Condensed version of the input (for passing to later stages) */
  condensed: string;
}

export type OutputFormat = 'markdown' | 'html' | 'diff' | 'code' | 'json' | 'text';

// ---------------------------------------------------------------------------
// Stage 2: Plan
// ---------------------------------------------------------------------------

export interface ExecutionStep {
  index: number;
  title: string;
  /** Focused prompt — only the requirements/section this step addresses */
  prompt: string;
  /** Indices into AnalysisResult.requirements this step covers */
  requirementIndices: number[];
  /** Output token budget for this step */
  maxTokens: number;
  /** Whether Claude enhancement is needed for this step */
  needsEnhance: boolean;
  /**
   * Per-step code context fetched from the graph during execution.
   * Populated by the execute stage when a ContextProvider is available.
   */
  graphContext?: string | undefined;
}

export interface ExecutionPlan {
  pipeline: PipelineType;
  analysis: AnalysisResult;
  steps: ExecutionStep[];
  /** Context shared across all steps (system prompt fragments, code context) */
  sharedContext: string;
  /** How to combine step outputs into the final artifact */
  assemblyStrategy: AssemblyStrategy;
  /** Template/boilerplate to wrap assembled output (e.g. HTML head/CSS) */
  template?: string;
}

export type PipelineType = 'requirements' | 'design' | 'plan' | 'implement' | 'refactor';
export type AssemblyStrategy = 'concatenate' | 'merge-diff' | 'json-combine';

// ---------------------------------------------------------------------------
// Stage 3: Execute
// ---------------------------------------------------------------------------

export interface StepResult {
  index: number;
  title: string;
  output: string;
  enhanced: boolean;
  durationMs: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Stage 4: Assemble
// ---------------------------------------------------------------------------

export interface AssemblyResult {
  output: string;
  format: OutputFormat;
  steps: StepResult[];
  totalDurationMs: number;
  warnings: string[];
  filesWritten?: string[];
}

// ---------------------------------------------------------------------------
// Pipeline configuration (per-pipeline customization)
// ---------------------------------------------------------------------------

export interface PipelineConfig {
  type: PipelineType;
  /** System prompt for analyze stage */
  analyzePrompt: string;
  /** System prompt for plan stage */
  planPrompt: string;
  /** System prompt for step sketch (Stage 3a — local) */
  sketchPrompt: string;
  /** System prompt for step enhance (Stage 3b — Claude) */
  enhancePrompt: string;
  /** Assembly strategy */
  assemblyStrategy: AssemblyStrategy;
  /** Template builder — returns HTML/Markdown wrapper given step count */
  buildTemplate?: (analysis: AnalysisResult) => string;
  /** Whether all steps need Claude enhancement (default: scope-dependent) */
  alwaysEnhance?: boolean;
}

// ---------------------------------------------------------------------------
// Streaming events
// ---------------------------------------------------------------------------

export type PipelineEvent =
  | { stage: 'analyze'; status: 'start' }
  | { stage: 'analyze'; status: 'chunk'; chunkIndex: number; totalChunks: number }
  | { stage: 'analyze'; status: 'done'; result: AnalysisResult }
  | { stage: 'context'; status: 'search'; query: string; resultCount: number }
  | { stage: 'context'; status: 'expand'; entityName: string; callers: number; callees: number }
  | { stage: 'plan'; status: 'start' }
  | { stage: 'plan'; status: 'done'; stepCount: number }
  | { stage: 'execute'; status: 'step-start'; step: number; total: number; title: string }
  | { stage: 'execute'; status: 'step-context'; step: number; entityCount: number }
  | { stage: 'execute'; status: 'step-done'; step: number; total: number; title: string; durationMs: number }
  | { stage: 'execute'; status: 'step-error'; step: number; total: number; title: string; error: string }
  | { stage: 'assemble'; status: 'start' }
  | { stage: 'assemble'; status: 'done'; outputSize: number };

export type PipelineLogger = (event: PipelineEvent) => void;

/** Simple string logger shim — adapts old (msg: string) => void to PipelineLogger. */
export function shimLogger(log: (msg: string) => void): PipelineLogger {
  return (event: PipelineEvent) => {
    switch (event.stage) {
      case 'analyze':
        if (event.status === 'start') log('  [analyze] Reading input...');
        else if (event.status === 'chunk') log(`  [analyze] Chunk ${event.chunkIndex + 1}/${event.totalChunks}`);
        else if (event.status === 'done') log(`  [analyze] ${event.result.requirements.length} requirements, scope: ${event.result.scope}, output: ${event.result.outputFormat}`);
        break;
      case 'context':
        if (event.status === 'search') log(`  [context] Vector search: "${event.query.slice(0, 60)}" → ${event.resultCount} entities`);
        else if (event.status === 'expand') log(`  [context] ${event.entityName}: ${event.callers} callers, ${event.callees} callees`);
        break;
      case 'plan':
        if (event.status === 'start') log('  [plan] Generating execution plan...');
        else if (event.status === 'done') log(`  [plan] ${event.stepCount} steps planned`);
        break;
      case 'execute':
        if (event.status === 'step-start') log(`  [execute] [${event.step + 1}/${event.total}] ${event.title}...`);
        else if (event.status === 'step-context') log(`  [execute] [${event.step + 1}] Fetched ${event.entityCount} entities from graph`);
        else if (event.status === 'step-done') log(`  [execute] [${event.step + 1}/${event.total}] ${event.title} ✓ (${(event.durationMs / 1000).toFixed(1)}s)`);
        else if (event.status === 'step-error') log(`  [execute] [${event.step + 1}/${event.total}] ${event.title} ✗ ${event.error}`);
        break;
      case 'assemble':
        if (event.status === 'start') log('  [assemble] Combining outputs...');
        else if (event.status === 'done') log(`  [assemble] ${(event.outputSize / 1024).toFixed(0)}KB assembled`);
        break;
    }
  };
}

// ---------------------------------------------------------------------------
// Pipeline runner options
// ---------------------------------------------------------------------------

export interface PipelineRunOpts {
  /** User's original message / prompt */
  userMessage: string;
  /** Pre-built code context string (fallback when no contextProvider) */
  codeContext: string;
  /** Additional context (e.g. requirements for design, design for plan) */
  priorContext?: string;
  /** Repo path */
  repoPath: string;
  /** Local LLM provider (Ollama) */
  localProvider: LLMProvider;
  /** Claude provider (null = local-only, skip enhancement) */
  claudeProvider: LLMProvider | null;
  /** Model context window config */
  contextConfig: ModelContextConfig;
  /**
   * Graph + vector index provider. When set, the pipeline fetches
   * per-step context from the graph instead of using the flat codeContext string.
   * Falls back to codeContext if null/undefined.
   */
  contextProvider?: ContextProvider | undefined;
  /** Event logger */
  onEvent?: PipelineLogger;
}
