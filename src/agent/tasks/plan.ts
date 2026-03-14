// ---------------------------------------------------------------------------
// DEPRECATED — use src/agent/planner/ instead.
//
// This module is kept for backward compatibility. The planner agent pipeline
// replaces the old two-stage plan flow with an iterative, agent-framework
// workflow including validation gates, cycle detection, and markdown serialization.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import type { LLMProvider, LLMMessage, Plan, PlanStep, PlanStepComplexity } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Plan Pipeline — two-stage: local sketch -> Claude refine -> persist to Kuzu
//
// Pre-flight: checks L2 for [requirements] and [design] tags.
// If missing, runs condensed local-only version.
// Always escalated when Claude is available.
// ---------------------------------------------------------------------------

export interface PlanResult {
  sketch: string;
  enhanced: string;
  plan: Plan;
  tag: string; // '[plan:<id>]'
}

const SKETCH_SYSTEM = `You are a project planner. Given the user's request, requirements, and design context, produce an ordered implementation checklist.

Output a JSON array of steps. Each step has:
- "title": short action title (imperative, e.g. "Create user model")
- "description": detailed description of what to do
- "checkpoint": true if this step should pause for testing before continuing
- "complexity": "low" | "medium" | "high"
- "dependsOnIdx": array of step indices (0-based) this step depends on

Example:
[
  {"title": "Create database schema", "description": "Add User table with email, name, passwordHash fields", "checkpoint": false, "complexity": "low", "dependsOnIdx": []},
  {"title": "Implement user registration", "description": "POST /api/register endpoint with validation", "checkpoint": true, "complexity": "medium", "dependsOnIdx": [0]}
]

Output ONLY the JSON array, no other text.`;

const ENHANCE_SYSTEM = `You are a senior engineer refining an implementation plan. Your job is to:

1. **Fill underspecified steps** — Add concrete details (file names, function signatures)
2. **Reorder** based on dependencies — ensure correct build order
3. **Add rollback/migration steps** where needed
4. **Label complexity** accurately (low: <30 min, medium: 30-120 min, high: 2+ hours)
5. **Add test checkpoints** at integration boundaries

Return the refined plan as a JSON array with the same schema:
[{"title": "...", "description": "...", "checkpoint": true/false, "complexity": "low|medium|high", "dependsOnIdx": []}]

Output ONLY the JSON array, no other text.`;

const CONDENSED_SYSTEM = `You are a project planner. The user wants an implementation plan but has not gone through requirements/design phases. Produce a pragmatic implementation checklist directly.

Output a JSON array of steps:
[{"title": "...", "description": "...", "checkpoint": true/false, "complexity": "low|medium|high", "dependsOnIdx": []}]

Output ONLY the JSON array, no other text.`;

/**
 * @deprecated Use plannerAgent from '../planner/agent.js' instead.
 *
 * Run the plan pipeline.
 *
 * Pre-flight: checks for [requirements] and [design] in L2.
 * Stage 1: Local model produces ordered implementation checklist.
 * Stage 2: Claude refines — fills gaps, reorders, adds checkpoints.
 * Returns a Plan object ready for Kuzu persistence.
 */
export async function runPlanPipeline(
  userMessage: string,
  repoPath: string,
  codeContext: string,
  requirementsContext: string,
  designContext: string,
  localProvider: LLMProvider,
  claudeProvider: LLMProvider | null,
): Promise<PlanResult> {
  const hasContext = !!(requirementsContext || designContext);

  // Build context parts
  const contextParts: string[] = [];
  if (requirementsContext) contextParts.push(`Requirements:\n${requirementsContext}`);
  if (designContext) contextParts.push(`Design:\n${designContext}`);
  if (codeContext) contextParts.push(`Code context:\n${codeContext}`);

  const userContent = contextParts.length > 0
    ? `${contextParts.join('\n\n')}\n\nUser request:\n${userMessage}`
    : `User request:\n${userMessage}`;

  // Stage 1 — Local sketch
  const sketchMessages: LLMMessage[] = [
    { role: 'system', content: hasContext ? SKETCH_SYSTEM : CONDENSED_SYSTEM },
    { role: 'user', content: userContent },
  ];

  const sketchResponse = await localProvider.complete(sketchMessages, {
    maxTokens: 3000,
    temperature: 0.3,
  });

  let enhancedText = sketchResponse.text;

  // Stage 2 — Claude enhancement (if available)
  if (claudeProvider) {
    const enhanceParts: string[] = [
      `Implementation plan to refine:\n\n${sketchResponse.text}`,
    ];
    if (requirementsContext) enhanceParts.push(`Requirements:\n${requirementsContext}`);
    if (designContext) enhanceParts.push(`Design:\n${designContext}`);
    enhanceParts.push(`Original request:\n${userMessage}`);

    const enhanceMessages: LLMMessage[] = [
      { role: 'system', content: ENHANCE_SYSTEM },
      { role: 'user', content: enhanceParts.join('\n\n') },
    ];

    const enhancedResponse = await claudeProvider.complete(enhanceMessages, {
      maxTokens: 4000,
      temperature: 0.2,
    });
    enhancedText = enhancedResponse.text;
  }

  // Parse steps from the enhanced output
  const steps = parseStepsJson(enhancedText);
  const planId = randomUUID();

  const plan = buildPlan(planId, repoPath, userMessage, steps);

  return {
    sketch: sketchResponse.text,
    enhanced: enhancedText,
    plan,
    tag: `[plan:${planId}]`,
  };
}

// ---------------------------------------------------------------------------
// Step JSON parsing
// ---------------------------------------------------------------------------

interface RawStep {
  title: string;
  description: string;
  checkpoint?: boolean;
  complexity?: string;
  dependsOnIdx?: number[];
}

function parseStepsJson(text: string): RawStep[] {
  // Extract JSON array from text (may be wrapped in markdown code block)
  let jsonStr = text.trim();

  // Strip markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1]!.trim();
  }

  // Try to find a JSON array
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
    // Fallback: create a single step from the text
    return [{
      title: 'Implementation',
      description: text.slice(0, 500),
      checkpoint: false,
      complexity: 'medium',
      dependsOnIdx: [],
    }];
  }
}

function buildPlan(planId: string, repoPath: string, title: string, rawSteps: RawStep[]): Plan {
  const now = new Date().toISOString();

  // Create step IDs first so we can map dependsOnIdx to step IDs
  const stepIds = rawSteps.map(() => randomUUID());

  const steps: PlanStep[] = rawSteps.map((raw, idx) => ({
    id:          stepIds[idx]!,
    planId,
    idx,
    title:       raw.title,
    description: raw.description,
    checkpoint:  raw.checkpoint ?? false,
    status:      'pending' as const,
    complexity:  (raw.complexity as PlanStepComplexity) || 'medium',
    fileHint:    (raw as unknown as Record<string, unknown>)['fileHint'] as string || '',
    notes:       '',
    dependsOn:   (raw.dependsOnIdx ?? [])
      .filter(i => i >= 0 && i < stepIds.length && i !== idx)
      .map(i => stepIds[i]!),
    createdAt:   now,
    updatedAt:   now,
  }));

  return {
    id: planId,
    repoPath,
    title: title.slice(0, 200),
    status: 'active',
    steps,
    createdAt: now,
    updatedAt: now,
  };
}
