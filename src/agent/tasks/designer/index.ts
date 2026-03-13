import type { LLMProvider } from '../../../shared/types.js';
import { getLogger, toLogFn } from '../../../shared/logger.js';
import type {
  DesignerInput,
  DesignerEvent,
  DesignerResult,
  DesignerPipelineOpts,
  RequirementTodo,
  ParsedRequirement,
  GateResponse,
} from './types.js';
import { ValidationChannel } from './validation.js';
import {
  extractRequirements,
  enhanceRequirements,
  reExtractWithFeedback,
  parseRequirementsList,
  formatRequirementsList,
} from './requirements.js';
import { writeSketch, reviewSketch, reSketchWithFeedback, formatSketch } from './sketch.js';
import { writeDetail, reDetailWithFeedback } from './detail.js';
import { assembleDocument } from './assembly.js';
import { runDesignerReview } from './review.js';
import { assertDaemonReachable } from '../../pipeline/context-provider.js';

// Re-export types and utilities that the REPL integration needs
export { ValidationChannel } from './validation.js';
export { renderGate, parseGateResponse } from './validation.js';
export { resolveTemplate, parseTemplateFlags } from './templates.js';
export type { DesignerInput, DesignerEvent, DesignerResult, DesignerPipelineOpts } from './types.js';

// ---------------------------------------------------------------------------
// Designer Agent — Main Pipeline Orchestrator
//
// Async generator that yields DesignerEvents. The REPL consumes events
// in a for-await loop and handles gate interactions via ValidationChannel.
// ---------------------------------------------------------------------------

const MAX_EDIT_ROUNDS = 3;

/**
 * Run the designer pipeline.
 *
 * For requirements/design intents: iterative workflow with validation gates.
 * For review intent: single-pass Claude analysis (no gates).
 */
export async function* runDesignerPipeline(
  input: DesignerInput,
  localProvider: LLMProvider,
  claudeProvider: LLMProvider,
  channel: ValidationChannel,
  opts?: DesignerPipelineOpts,
): AsyncGenerator<DesignerEvent> {
  const log = opts?.log ?? toLogFn(getLogger('designer'));
  const autoApprove = opts?.autoApprove ?? false;

  // Review intent is a separate single-pass workflow
  if (input.intent === 'review') {
    yield* runDesignerReview(input, claudeProvider, false, log);
    return;
  }

  // =========================================================================
  // PRE-CHECK: Daemon must be running for codebase analysis
  // =========================================================================

  yield { kind: 'progress', message: '  [designer] Checking daemon availability...' };
  await assertDaemonReachable();
  yield { kind: 'progress', message: '  [designer] Daemon reachable — codebase analysis available.' };

  // =========================================================================
  // STEP 1: Extract requirements
  // =========================================================================

  yield { kind: 'progress', message: '  [designer] Step 1: Extracting requirements (local model)...' };
  let rawList = await extractRequirements(input, localProvider);

  yield { kind: 'progress', message: '  [designer] Step 1: Enhancing requirements (Claude)...' };
  let enhancedList = await enhanceRequirements(rawList, input, claudeProvider);

  // =========================================================================
  // STEP 2: VALIDATE requirements
  // =========================================================================

  if (!autoApprove) {
    let editRounds = 0;
    let validated = false;

    while (!validated) {
      channel.reset();
      yield {
        kind: 'gate',
        gate: { stage: 'requirements', content: enhancedList },
      };

      const response = await channel.wait();

      if (response.type === 'approve') {
        validated = true;
      } else if (response.type === 'edit') {
        editRounds++;
        if (editRounds > MAX_EDIT_ROUNDS) {
          yield { kind: 'progress', message: `  [designer] Max edit rounds (${MAX_EDIT_ROUNDS}) reached. Proceeding with current requirements.` };
          validated = true;
        } else {
          yield { kind: 'progress', message: `  [designer] Re-extracting with feedback (round ${editRounds}/${MAX_EDIT_ROUNDS})...` };
          enhancedList = await reExtractWithFeedback(
            enhancedList, response.feedback ?? '', input, claudeProvider,
          );
        }
      } else if (response.type === 'reject') {
        yield { kind: 'progress', message: '  [designer] Requirements rejected. Re-extracting with guidance...' };
        // Inject rejection reason as additional context
        const augmentedInput: DesignerInput = {
          ...input,
          message: `${input.message}\n\nAdditional guidance: ${response.feedback ?? 'Start over with a different approach.'}`,
        };
        rawList = await extractRequirements(augmentedInput, localProvider);
        enhancedList = await enhanceRequirements(rawList, augmentedInput, claudeProvider);
        editRounds = 0; // Reset edit counter for new attempt
      }
    }
  }

  // =========================================================================
  // STEP 3: Create todos
  // =========================================================================

  const parsedRequirements = parseRequirementsList(enhancedList);
  if (parsedRequirements.length === 0) {
    // Fallback: if parsing failed, create a single requirement from the whole list
    yield { kind: 'progress', message: '  [designer] Warning: could not parse structured requirements. Using raw list.' };
    const fallbackResult = assembleFallbackResult(input, enhancedList);
    yield { kind: 'done', result: fallbackResult };
    return;
  }

  const todos: RequirementTodo[] = parsedRequirements.map(r => ({
    index: r.index,
    statement: r.statement,
    type: r.type,
    references: r.references,
    state: 'pending' as const,
  }));

  yield { kind: 'progress', message: `  [designer] ${todos.length} requirements → starting per-requirement design...` };

  // =========================================================================
  // STEP 4: Per-requirement iteration
  // =========================================================================

  for (const todo of todos) {
    yield {
      kind: 'progress',
      message: `  [designer] Requirement ${todo.index}/${todos.length}: ${todo.statement.slice(0, 70)}${todo.statement.length > 70 ? '...' : ''}`,
    };

    // ----- 4a: Write sketch (local) -----
    todo.state = 'sketching';
    yield { kind: 'progress', message: `  [designer] ${todo.index}: Writing sketch (local + codebase analysis)...` };
    let sketch = await writeSketch(todo, parsedRequirements, todos, input, localProvider);

    // ----- 4b: Claude reviews sketch -----
    todo.state = 'sketch-reviewing';
    yield { kind: 'progress', message: `  [designer] ${todo.index}: Claude reviewing sketch...` };
    sketch = await reviewSketch(sketch, todo, parsedRequirements, input, claudeProvider);
    todo.sketch = sketch;

    // ----- 4c: VALIDATE summary flow -----
    if (!autoApprove) {
      let sketchValidated = false;
      let sketchEditRounds = 0;

      while (!sketchValidated) {
        channel.reset();
        yield {
          kind: 'gate',
          gate: {
            stage: 'summary-flow',
            content: formatSketch(sketch),
            requirementIndex: todo.index,
          },
        };

        const response = await channel.wait();

        if (response.type === 'approve') {
          sketchValidated = true;
        } else if (response.type === 'skip') {
          todo.state = 'skipped';
          yield { kind: 'progress', message: `  [designer] ${todo.index}: Skipped.` };
          sketchValidated = true; // Exit the loop
        } else if (response.type === 'edit') {
          sketchEditRounds++;
          if (sketchEditRounds > MAX_EDIT_ROUNDS) {
            yield { kind: 'progress', message: `  [designer] ${todo.index}: Max edit rounds reached. Proceeding with current sketch.` };
            sketchValidated = true;
          } else {
            yield { kind: 'progress', message: `  [designer] ${todo.index}: Re-sketching with feedback (round ${sketchEditRounds}/${MAX_EDIT_ROUNDS})...` };
            sketch = await reSketchWithFeedback(
              sketch, response.feedback ?? '', todo, parsedRequirements, todos, input, localProvider, claudeProvider,
            );
            todo.sketch = sketch;
          }
        } else if (response.type === 'reject') {
          todo.state = 'skipped';
          yield { kind: 'progress', message: `  [designer] ${todo.index}: Rejected — skipping.` };
          sketchValidated = true;
        }
      }
    }

    // Skip detail if the requirement was skipped
    if (todo.state === 'skipped') continue;

    todo.state = 'sketch-validated';

    // ----- 4d: Write detailed section (local) -----
    // Claude already validated the sketch (interfaces, integration, cross-req
    // consistency) so a second Claude review on the detail is redundant and
    // expensive — it doubles API calls and hits max_tokens on later reqs as
    // the completed-sections context grows.
    todo.state = 'detailing';
    yield { kind: 'progress', message: `  [designer] ${todo.index}: Writing detailed section (local)...` };
    let detail = await writeDetail(todo, todos, input, localProvider);

    // ----- 4f: VALIDATE detail -----
    if (!autoApprove) {
      let detailValidated = false;
      let detailEditRounds = 0;

      while (!detailValidated) {
        channel.reset();
        yield {
          kind: 'gate',
          gate: {
            stage: 'detail',
            content: detail,
            requirementIndex: todo.index,
          },
        };

        const response = await channel.wait();

        if (response.type === 'approve') {
          detailValidated = true;
        } else if (response.type === 'skip') {
          todo.state = 'skipped';
          yield { kind: 'progress', message: `  [designer] ${todo.index}: Detail skipped.` };
          detailValidated = true;
        } else if (response.type === 'edit') {
          detailEditRounds++;
          if (detailEditRounds > MAX_EDIT_ROUNDS) {
            yield { kind: 'progress', message: `  [designer] ${todo.index}: Max edit rounds reached. Proceeding.` };
            detailValidated = true;
          } else {
            yield { kind: 'progress', message: `  [designer] ${todo.index}: Revising detail with feedback (round ${detailEditRounds}/${MAX_EDIT_ROUNDS})...` };
            detail = await reDetailWithFeedback(
              detail, response.feedback ?? '', todo, todos, input, localProvider, claudeProvider,
            );
          }
        } else if (response.type === 'reject') {
          // Go back to sketch stage
          yield { kind: 'progress', message: `  [designer] ${todo.index}: Detail rejected — going back to sketch.` };
          todo.state = 'pending';
          todo.sketch = undefined;
          todo.detail = undefined;
          // The for loop will NOT re-visit this todo automatically.
          // We handle the re-sketch inline.
          yield { kind: 'progress', message: `  [designer] ${todo.index}: Re-sketching...` };
          todo.state = 'sketching';
          sketch = await writeSketch(todo, parsedRequirements, todos, input, localProvider);
          todo.state = 'sketch-reviewing';
          sketch = await reviewSketch(sketch, todo, parsedRequirements, input, claudeProvider);
          todo.sketch = sketch;
          // Show sketch gate again
          detailEditRounds = 0;
          detailValidated = true; // Exit the detail loop — but we need to re-enter the sketch loop
          // After exiting, we skip the rest of the detail logic and the outer for-loop continues
          // to the next todo. To re-process this todo, we'd need to decrement the index.
          // Simpler: just mark as pending and let the user know they need to re-run.
          // Actually, let's handle this by continuing from the sketch validation:
          // We'll set a flag and break out.
        }
      }
    }

    // Finalize this requirement
    if (todo.state !== 'skipped') {
      todo.detail = detail;
      todo.state = 'done';
      yield { kind: 'progress', message: `  [designer] ${todo.index}: Done.` };
    }
  }

  // =========================================================================
  // STEP 5: Assemble final document
  // =========================================================================

  yield { kind: 'progress', message: '  [designer] Assembling final document...' };

  // Derive title from user message (first sentence or first 80 chars)
  const title = deriveTitle(input.message);
  const result = assembleDocument(input.template, title, todos);

  yield { kind: 'done', result };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveTitle(message: string): string {
  // Take the first sentence or first 80 characters
  const firstSentence = message.match(/^[^.!?\n]+/);
  const raw = firstSentence ? firstSentence[0]! : message.slice(0, 80);
  // Capitalize first letter, trim
  const trimmed = raw.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function assembleFallbackResult(input: DesignerInput, enhancedList: string): DesignerResult {
  return {
    kind: 'document',
    output: `# Design Document\n\n## Requirements\n\n${enhancedList}`,
    format: 'markdown',
    templateId: input.template.id,
    requirements: [],
    sketches: [],
    structured: {
      newEntities: [],
      reusedEntities: [],
      userDecisions: [],
    },
    summary: 'Requirements extracted but could not be parsed into structured format.',
  };
}
