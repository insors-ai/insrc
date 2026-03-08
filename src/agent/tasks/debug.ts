import type { LLMProvider, LLMMessage, ToolCall, ToolDefinition } from '../../shared/types.js';
import {
  parseDiff, applyDiff, splitByFile, extractDiffFromResponse,
  formatDiffForValidation, type FileDiff,
} from './diff-utils.js';
import { enrichValidationContext } from './graph-context.js';
import { requestReindex } from './reindex.js';
import { planStepUpdate, planNextStep, planGet } from '../tools/mcp-client.js';
import {
  StuckDetector, buildEscalationPrompt, STUCK_ESCALATION_SYSTEM,
} from './stuck-detector.js';
import { runToolLoop, type ToolLoopResult } from '../tools/loop.js';
import { getToolDefinitions } from '../tools/registry.js';

// ---------------------------------------------------------------------------
// Debug Pipeline — tool-loop driven diagnosis with stuck escalation
//
// From design doc (Phase 8):
//   - Tool loop: local model drives read-only tools freely
//     (kubectl get/logs/describe, git log/diff, Read, Grep, graph_*)
//   - Stuck escalation: after 2 turns with evidence, local model writes
//     ≤200-token summary → Claude/Haiku responds with direction
//   - Fix validation: same Stage 2 as implement — diff + touched entities
//   - Plan step lifecycle: plan_get at session start,
//     plan_step_update(done) on fix, in_progress on unresolved
// ---------------------------------------------------------------------------

export interface DebugResult {
  /** Whether a fix was produced and applied */
  fixed: boolean;
  /** The fix diff (if any) */
  diff: string;
  /** Files written to disk */
  filesWritten: string[];
  /** Evidence gathered during debugging */
  evidence: string[];
  /** Number of tool loop iterations */
  iterations: number;
  /** Number of stuck escalations triggered */
  escalations: number;
  /** Whether the user needs to decide */
  needsUserDecision: boolean;
  /** User-facing message */
  message: string;
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const DEBUG_SYSTEM = `You are a senior software engineer debugging an issue. Use the available tools to gather evidence, identify the root cause, and produce a fix.

Approach:
1. **Gather evidence**: Use Read, Grep, Glob, graph_search, graph_callers, graph_callees to understand the code
2. **Inspect runtime**: Use Bash for git log/diff/blame, test runners, build tools, linters
3. **Identify root cause**: Analyze the evidence to pinpoint the issue
4. **Produce fix**: When you've identified the root cause, produce a unified diff

Rules:
- Start with evidence gathering — don't guess at fixes
- Use graph tools to understand entity relationships
- When you've identified the root cause, output a unified diff in a code block:
  \`\`\`diff
  --- a/path/to/file
  +++ b/path/to/file
  @@ -N,M +N,M @@
  ...
  \`\`\`
- If you cannot identify the root cause, describe what you've found so far`;

const DEBUG_VALIDATE_SYSTEM = `You are a senior code reviewer validating a debug fix. Check:

1. **Root cause** — Does the fix address the actual root cause (not just symptoms)?
2. **Correctness** — Is the fix correct? Any edge cases?
3. **Regression risk** — Could this fix break something else?
4. **Completeness** — Are all affected code paths fixed?

Respond with EXACTLY one of:
- "APPROVED" — if the fix is correct and complete
- "CHANGES_NEEDED" followed by bullet list of issues`;

const SUMMARY_SYSTEM = `You are a local AI model that has been debugging an issue and is now stuck. Produce a concise summary (≤200 tokens) of:

1. **Found**: What evidence you have gathered so far
2. **Need**: What specific direction or insight you need to proceed

Be specific about file names, error messages, and code paths examined.`;

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

/**
 * Run the debug pipeline.
 *
 * @param userMessage - The user's debug request (bug description, error, etc.)
 * @param repoPath - Absolute path to repo root
 * @param codeContext - Assembled code context
 * @param planStepContext - Active plan step description (or empty)
 * @param localProvider - Local LLM for tool loop and fix generation
 * @param claudeProvider - Claude for validation and stuck escalation — null skips
 * @param log - Logger function
 * @param permissionMode - Tool permission mode
 * @param mcpAvailable - Whether MCP daemon is available
 */
export async function runDebugPipeline(
  userMessage: string,
  repoPath: string,
  codeContext: string,
  planStepContext: string,
  localProvider: LLMProvider,
  claudeProvider: LLMProvider | null,
  log: (msg: string) => void = console.log,
  permissionMode: 'validate' | 'auto-accept' = 'validate',
  mcpAvailable = false,
): Promise<DebugResult> {
  const result: DebugResult = {
    fixed: false,
    diff: '',
    filesWritten: [],
    evidence: [],
    iterations: 0,
    escalations: 0,
    needsUserDecision: false,
    message: '',
  };

  const stuckDetector = new StuckDetector();
  const tools = getToolDefinitions({ mcpAvailable });

  // Build initial messages with debug context
  const contextParts: string[] = [];
  if (codeContext) contextParts.push(`Code context:\n${codeContext}`);
  if (planStepContext) contextParts.push(`Active plan step:\n${planStepContext}`);
  contextParts.push(`Debug request:\n${userMessage}`);

  const messages: LLMMessage[] = [
    { role: 'system', content: DEBUG_SYSTEM },
    { role: 'user', content: contextParts.join('\n\n') },
  ];

  // -------------------------------------------------------------------------
  // Tool loop — local model drives tools, we check for stuck and diffs
  // -------------------------------------------------------------------------
  const MAX_DEBUG_ITERATIONS = 15;
  let iteration = 0;

  log('  [debug] Starting tool loop...');

  while (iteration < MAX_DEBUG_ITERATIONS) {
    iteration++;
    log(`  [debug] Iteration ${iteration}/${MAX_DEBUG_ITERATIONS}...`);

    // Run one turn of the tool loop
    const loopResult = await runToolLoop(messages, {
      provider: localProvider,
      tools,
      intent: 'debug',
      permissionMode,
      validator: claudeProvider ?? undefined,
      onToolCall: (call, validation) => {
        const status = validation.action === 'rejected'
          ? `rejected: ${validation.reason}`
          : validation.action;
        log(`    [tool] ${call.name} → ${status}`);
      },
      onToolResult: (call, toolResult) => {
        const preview = toolResult.content.slice(0, 100).replace(/\n/g, ' ');
        log(`    [result] ${call.name}: ${preview}...`);
        // Track evidence
        result.evidence.push(`${call.name}: ${toolResult.content.slice(0, 500)}`);
      },
    });

    result.iterations = iteration;

    // Check if the model produced a diff in its response
    const diff = extractDiffFromResponse(loopResult.response);
    if (diff && diff.includes('---')) {
      log('  [debug] Fix diff detected — validating...');

      // Validate the fix with Claude (Stage 2)
      const validationResult = await validateDebugFix(diff, claudeProvider, log);

      if (validationResult.approved) {
        // Apply the fix
        const applyResult = await applyDebugFix(diff, repoPath, log);
        if (applyResult.success) {
          result.fixed = true;
          result.diff = diff;
          result.filesWritten = applyResult.filesWritten;
          result.message = `Debug fix applied (${applyResult.filesWritten.length} file(s) written).`;

          // Non-blocking re-index
          void requestReindex(applyResult.filesWritten, log);

          // Advance plan step
          await maybeAdvancePlanStep(repoPath, log, 'done');

          return result;
        } else {
          log(`  [debug] Fix could not be applied: ${applyResult.error}`);
          // Add feedback and continue
          messages.push(
            { role: 'assistant', content: loopResult.response },
            { role: 'user', content: `The fix diff could not be applied: ${applyResult.error}\nPlease investigate further and try a different approach.` },
          );
        }
      } else {
        // Validation rejected — feed back
        log('  [debug] Fix rejected by validation');
        messages.push(
          { role: 'assistant', content: loopResult.response },
          { role: 'user', content: `Your fix was rejected:\n${validationResult.feedback}\nPlease revise your approach.` },
        );
      }

      continue;
    }

    // No diff — check for stuck
    const toolCalls = extractToolCalls(loopResult);
    const stuckCheck = stuckDetector.recordTurn(
      toolCalls,
      false,
      loopResult.response.slice(0, 500),
    );

    if (stuckCheck.isStuck && claudeProvider) {
      log(`  [debug] Stuck detected (${stuckCheck.turnsWithoutProgress} turns) — escalating...`);
      result.escalations++;

      // Get local model to produce a summary
      const summaryMessages: LLMMessage[] = [
        { role: 'system', content: SUMMARY_SYSTEM },
        { role: 'user', content: `Evidence gathered:\n${stuckCheck.evidenceSummary}\n\nProduce a ≤200-token summary of what you've found and what direction you need.` },
      ];

      const summaryResponse = await localProvider.complete(summaryMessages, {
        maxTokens: 300,
        temperature: 0.1,
      });

      // Escalate to Claude — only the local model's summary, NOT raw tool output
      const escalationPrompt = buildEscalationPrompt(
        summaryResponse.text,
      );

      const escalationMessages: LLMMessage[] = [
        { role: 'system', content: STUCK_ESCALATION_SYSTEM },
        { role: 'user', content: escalationPrompt },
      ];

      const escalationResponse = await claudeProvider.complete(escalationMessages, {
        maxTokens: 500,
        temperature: 0.1,
      });

      log(`  [debug] Claude direction: ${escalationResponse.text.slice(0, 100)}...`);

      // Feed Claude's direction back to the local model
      messages.push(
        { role: 'assistant', content: loopResult.response },
        { role: 'user', content: `Direction from senior engineer:\n${escalationResponse.text}\n\nContinue debugging based on this guidance.` },
      );

      stuckDetector.handleEscalation();
      continue;
    }

    // Not stuck, no diff — continue tool loop
    messages.push(
      { role: 'assistant', content: loopResult.response },
      { role: 'user', content: 'Continue investigating. Use tools to gather more evidence or produce a fix diff when ready.' },
    );

    // If tool loop hit its internal limit, break
    if (loopResult.hitLimit) {
      log('  [debug] Tool loop hit internal iteration limit');
      break;
    }
  }

  // Max iterations reached without fix
  log('  [debug] Max iterations reached without fix');

  // Mark plan step as in_progress (unresolved) and get step ID for resume guidance
  const stepId = await maybeAdvancePlanStep(repoPath, log, 'in_progress');

  result.needsUserDecision = true;
  let msg = `Debug session completed without producing a fix after ${iteration} iterations and ${result.escalations} escalation(s).`;
  msg += `\n\nEvidence gathered:\n${result.evidence.slice(-5).map(e => `  - ${e.slice(0, 200)}`).join('\n')}`;
  if (stepId) {
    msg += `\n\nPlan step remains in_progress (step ID: ${stepId}). You can resume debugging in a new session.`;
  }
  result.message = msg;

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validate a debug fix diff with Claude (same as implement Stage 2). */
async function validateDebugFix(
  diff: string,
  claudeProvider: LLMProvider | null,
  log: (msg: string) => void,
): Promise<{ approved: boolean; feedback: string }> {
  if (!claudeProvider) {
    return { approved: true, feedback: '' };
  }

  const parsedDiffs = parseDiff(diff);
  const fileRounds = splitByFile(parsedDiffs);
  const allFeedback: string[] = [];

  for (const round of fileRounds) {
    const roundDiff = reconstructDiff(round);
    const validationCtx = await enrichValidationContext(round, roundDiff);

    const messages: LLMMessage[] = [
      { role: 'system', content: DEBUG_VALIDATE_SYSTEM },
      { role: 'user', content: formatDiffForValidation(validationCtx) },
    ];

    const response = await claudeProvider.complete(messages, {
      maxTokens: 1500,
      temperature: 0.1,
    });

    const verdict = response.text.trim();
    if (!verdict.startsWith('APPROVED')) {
      const issues = verdict.startsWith('CHANGES_NEEDED')
        ? verdict.slice('CHANGES_NEEDED'.length).trim()
        : verdict;
      allFeedback.push(issues);
    }
  }

  if (allFeedback.length > 0) {
    return { approved: false, feedback: allFeedback.join('\n') };
  }

  return { approved: true, feedback: '' };
}

/** Apply a debug fix diff to disk. */
async function applyDebugFix(
  diff: string,
  repoPath: string,
  log: (msg: string) => void,
): Promise<{ success: boolean; filesWritten: string[]; error?: string }> {
  const parsedDiffs = parseDiff(diff);

  // Dry-run
  const dryResult = await applyDiff(parsedDiffs, repoPath, true);
  if (!dryResult.success) {
    const errors = [...dryResult.errors.entries()]
      .map(([f, e]) => `  ${f}: ${e}`)
      .join('\n');
    return { success: false, filesWritten: [], error: errors };
  }

  // Apply
  const applyResult = await applyDiff(parsedDiffs, repoPath, false);
  if (applyResult.success) {
    return { success: true, filesWritten: applyResult.filesWritten };
  }
  return {
    success: false,
    filesWritten: applyResult.filesWritten,
    error: [...applyResult.errors.values()].join('\n'),
  };
}

/** Reconstruct unified diff text from parsed FileDiff objects. */
function reconstructDiff(diffs: FileDiff[]): string {
  const parts: string[] = [];
  for (const fd of diffs) {
    const oldPrefix = fd.isNew ? '' : 'a/';
    const newPrefix = fd.isDelete ? '' : 'b/';
    parts.push(`--- ${fd.isNew ? '/dev/null' : oldPrefix + fd.oldPath}`);
    parts.push(`+++ ${fd.isDelete ? '/dev/null' : newPrefix + fd.newPath}`);
    for (const hunk of fd.hunks) {
      parts.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
      parts.push(...hunk.lines);
    }
  }
  return parts.join('\n');
}

/** Extract tool calls from a ToolLoopResult for stuck detection. */
function extractToolCalls(loopResult: ToolLoopResult): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const msg of loopResult.messages) {
    const tc = (msg as { toolCalls?: ToolCall[] }).toolCalls;
    if (msg.role === 'assistant' && tc) {
      calls.push(...tc);
    }
  }
  return calls;
}

/** Advance plan step after debug outcome. Returns step ID if unresolved. */
async function maybeAdvancePlanStep(
  repoPath: string,
  log: (msg: string) => void,
  targetStatus: 'done' | 'in_progress',
): Promise<string | null> {
  try {
    const plan = await planGet({ repoPath });
    if (!plan || plan.status !== 'active') return null;

    const current = plan.steps.find(s => s.status === 'in_progress')
      ?? plan.steps.find(s => s.status === 'pending');
    if (!current) return null;

    if (current.status === 'pending') {
      await planStepUpdate(current.id, 'in_progress', 'auto-started by debug pipeline');
    }

    if (targetStatus === 'done') {
      const stepResult = await planStepUpdate(current.id, 'done', 'completed by debug pipeline');
      if (stepResult.ok) {
        log(`  [plan] Step ${current.idx + 1} "${current.title}" → done`);
        const next = await planNextStep(plan.id);
        if (next) {
          log(`  [plan] Next: Step ${next.idx + 1} "${next.title}" (${next.complexity})`);
        } else {
          log('  [plan] All steps complete!');
        }
      }
      return null;
    }

    // If targetStatus is 'in_progress', the step stays in_progress (unresolved)
    // Return the step ID so the user can resume in a new session
    return current.id;
  } catch {
    // Plan operations are best-effort
    return null;
  }
}
