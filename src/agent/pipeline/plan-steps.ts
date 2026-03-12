import type { LLMMessage, LLMProvider, ModelContextConfig } from '../../shared/types.js';
import type {
  AnalysisResult, ExecutionPlan, ExecutionStep,
  PipelineConfig, PipelineLogger,
} from './types.js';

// ---------------------------------------------------------------------------
// Stage 2: Plan — produce a modular execution plan
//
// Takes the AnalysisResult and produces ordered ExecutionSteps.
// Each step is scoped to produce a self-contained output fragment.
// For small inputs (scope: small), produces a single step (short-circuit).
// ---------------------------------------------------------------------------

const PLAN_SYSTEM = `You are a task planner. Given an analysis of a user request, produce a list of independent execution steps.

Each step should:
- Be self-contained — its output should not depend on other steps' outputs
- Have a clear, focused scope (one section, one file, one logical unit)
- Include a specific, detailed prompt describing exactly what to produce
- Map to one or more requirement indices from the analysis

Output a JSON array of steps:
[
  {
    "title": "short title",
    "prompt": "detailed prompt for what this step should produce — include specific content items, sub-sections, tables, code examples, and formatting instructions",
    "requirementIndices": [0, 1],
    "needsEnhance": true
  }
]

Step decomposition rules by output format:

Document (markdown, html, text):
- One step per major section or topic area
- Each step's prompt must list the specific sub-sections, tables, code blocks, and callouts to include
- Include formatting instructions (e.g. "use a table with columns X, Y, Z" or "include a code block showing...")
- Every requirement must be covered by at least one step

Diff / Code (diff, code):
- One step per file or tightly-coupled file group
- Each step's prompt must specify: file path, what to add/modify/remove, function signatures, imports needed
- Include context about how the change integrates with existing code
- Set needsEnhance=true for complex logic; false for boilerplate/config changes

JSON:
- One step per logical object or feature area
- Each step's prompt must specify the schema/structure of the JSON fragment to produce

Plan:
- One step per feature area or work stream
- Each step's prompt must specify deliverables, dependencies, and acceptance criteria

General rules:
- Produce at least one step per requirement — do NOT collapse multiple requirements into a single step
- Keep steps independent — no cross-step references or dependencies on other steps' outputs
- Step prompts should be detailed enough that a developer could execute them without seeing the original request
- Set needsEnhance=true for steps that benefit from quality review (complex logic, user-facing content)

Output ONLY the JSON array, no other text.`;

/**
 * Run the plan stage.
 *
 * Small scope (≤3 requirements): creates a single step (no LLM call).
 * Medium/large scope: uses LLM to decompose into independent steps.
 */
export async function runPlan(
  analysis: AnalysisResult,
  pipelineConfig: PipelineConfig,
  localProvider: LLMProvider,
  contextConfig: ModelContextConfig,
  onEvent?: PipelineLogger,
): Promise<ExecutionPlan> {
  onEvent?.({ stage: 'plan', status: 'start' });

  let steps: ExecutionStep[];

  if (analysis.scope === 'small') {
    // Short-circuit: single step covers everything
    steps = [{
      index: 0,
      title: 'Complete output',
      prompt: buildSingleStepPrompt(analysis, pipelineConfig),
      requirementIndices: analysis.requirements.map((_, i) => i),
      maxTokens: contextConfig.localMaxOutput,
      needsEnhance: pipelineConfig.alwaysEnhance ?? true,
    }];
  } else {
    // LLM-generated multi-step plan
    steps = await generateSteps(analysis, pipelineConfig, localProvider, contextConfig);
  }

  const plan: ExecutionPlan = {
    pipeline: pipelineConfig.type,
    analysis,
    steps,
    sharedContext: buildSharedContext(analysis, pipelineConfig),
    assemblyStrategy: pipelineConfig.assemblyStrategy,
    template: pipelineConfig.buildTemplate?.(analysis),
  };

  onEvent?.({ stage: 'plan', status: 'done', stepCount: steps.length });
  return plan;
}

// ---------------------------------------------------------------------------
// Step generation via LLM
// ---------------------------------------------------------------------------

async function generateSteps(
  analysis: AnalysisResult,
  pipelineConfig: PipelineConfig,
  provider: LLMProvider,
  contextConfig: ModelContextConfig,
): Promise<ExecutionStep[]> {
  // Prefer elements (structured) over flat requirements
  const elementCount = analysis.elements.length;
  const hasElements = elementCount > 0;

  const contextParts = [
    `Pipeline type: ${pipelineConfig.type}`,
    `Output format: ${analysis.outputFormat}`,
    `Scope: ${analysis.scope} (${hasElements ? elementCount + ' elements' : analysis.requirements.length + ' requirements'})`,
    `IMPORTANT: You MUST produce at least one step per ${hasElements ? 'element' : 'requirement'}.`,
    '',
  ];

  if (hasElements) {
    contextParts.push('Input elements (each should become at least one step):');
    for (let i = 0; i < analysis.elements.length; i++) {
      const el = analysis.elements[i]!;
      contextParts.push(`  ${i}. [${el.kind}] ${el.title}`);
      contextParts.push(`     ${el.content}`);
    }
  } else {
    contextParts.push('Requirements:');
    contextParts.push(...analysis.requirements.map((r, i) => `  ${i}. ${r}`));
  }

  if (analysis.referencedEntities.length > 0) {
    contextParts.push('', 'Referenced entities:');
    contextParts.push(...analysis.referencedEntities.map(e => `  - ${e}`));
  }

  contextParts.push('', 'Summary:', analysis.condensed);

  const analysisContext = contextParts.join('\n');

  const messages: LLMMessage[] = [
    { role: 'system', content: pipelineConfig.planPrompt || PLAN_SYSTEM },
    { role: 'user', content: analysisContext },
  ];

  const response = await provider.complete(messages, {
    maxTokens: contextConfig.localMaxOutput,
    temperature: 0.2,
  });

  const rawSteps = parseStepArray(response.text);

  // Minimum step threshold: for medium/large scope, if the LLM collapsed to too few
  // steps, fall back to one step per element/requirement
  const itemCount = hasElements ? elementCount : analysis.requirements.length;
  const minSteps = analysis.scope === 'large' ? Math.min(itemCount, 8)
    : analysis.scope === 'medium' ? 3
    : 1;

  if (rawSteps.length < minSteps) {
    return fallbackStepsFromElements(analysis, pipelineConfig, contextConfig);
  }

  return rawSteps.map((raw, i) => ({
    index: i,
    title: raw.title || `Step ${i + 1}`,
    prompt: raw.prompt || '',
    requirementIndices: Array.isArray(raw.requirementIndices) ? raw.requirementIndices : [],
    maxTokens: Math.min(contextConfig.localMaxOutput, 4000),
    needsEnhance: pipelineConfig.alwaysEnhance ?? raw.needsEnhance ?? true,
  }));
}

/**
 * Fallback: create one step per element (or per requirement if no elements).
 * Preserves the full detail from the analyze stage.
 */
function fallbackStepsFromElements(
  analysis: AnalysisResult,
  config: PipelineConfig,
  contextConfig: ModelContextConfig,
): ExecutionStep[] {
  if (analysis.elements.length > 0) {
    return analysis.elements.map((el, i) => ({
      index: i,
      title: el.title || `Step ${i + 1}`,
      prompt: el.content,
      requirementIndices: [i],
      maxTokens: Math.min(contextConfig.localMaxOutput, 4000),
      needsEnhance: config.alwaysEnhance ?? true,
    }));
  }

  // No elements — fall back to flat requirements
  return analysis.requirements.map((req, i) => ({
    index: i,
    title: extractTitle(req),
    prompt: req,
    requirementIndices: [i],
    maxTokens: Math.min(contextConfig.localMaxOutput, 4000),
    needsEnhance: config.alwaysEnhance ?? true,
  }));
}

/**
 * Extract a short title from a requirement string.
 */
function extractTitle(requirement: string): string {
  const labelMatch = requirement.match(/^([A-Z][A-Z\s&]+)\s*[—–-]/);
  if (labelMatch) return labelMatch[1]!.trim();
  const sentenceEnd = requirement.indexOf('. ');
  if (sentenceEnd > 0 && sentenceEnd < 60) return requirement.slice(0, sentenceEnd);
  return requirement.length > 60 ? requirement.slice(0, 57) + '...' : requirement;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSingleStepPrompt(analysis: AnalysisResult, config: PipelineConfig): string {
  const parts = [
    `Requirements:\n${analysis.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
  ];
  if (analysis.condensed) parts.push(`Context:\n${analysis.condensed}`);
  return parts.join('\n\n');
}

function buildSharedContext(analysis: AnalysisResult, config: PipelineConfig): string {
  const parts: string[] = [];
  if (analysis.referencedEntities.length > 0) {
    parts.push(`Referenced entities: ${analysis.referencedEntities.join(', ')}`);
  }
  if (analysis.outputFormat !== 'text') {
    parts.push(`Output format: ${analysis.outputFormat}`);
  }
  return parts.join('\n');
}

interface RawStep {
  title?: string;
  prompt?: string;
  requirementIndices?: number[];
  needsEnhance?: boolean;
}

function parseStepArray(text: string): RawStep[] {
  let jsonStr = text.trim();

  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) jsonStr = fenceMatch[1]!.trim();

  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (arrayMatch) jsonStr = arrayMatch[0]!;

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [{ title: 'Complete output', prompt: text }];
    return parsed.filter(
      (item): item is RawStep => typeof item === 'object' && item !== null,
    );
  } catch {
    return [{ title: 'Complete output', prompt: text.slice(0, 1000) }];
  }
}
