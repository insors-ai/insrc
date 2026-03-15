import type { LLMProvider, LLMMessage } from '../../../shared/types.js';
import type { DesignerInput, RequirementTodo, ParsedRequirement } from './types.js';
import { DETAIL_SYSTEM, DETAIL_REVIEW_SYSTEM } from './prompts.js';
import { formatSketch } from './sketch.js';
import { compressHistory } from './context.js';

// ---------------------------------------------------------------------------
// Detail Generation — Step 4d/4e of the Designer pipeline
//
// 4d: Local model writes detailed design section for a requirement
// 4e: Claude reviews and fixes the detail
// ---------------------------------------------------------------------------

/**
 * Write the detailed design section for a single requirement using the local model.
 * Uses the approved sketch as input along with codebase context.
 */
export async function writeDetail(
  todo: RequirementTodo,
  allTodos: RequirementTodo[],
  input: DesignerInput,
  localProvider: LLMProvider,
  configContext?: string,
): Promise<string> {
  if (!todo.sketch) {
    throw new Error(`Cannot write detail for requirement ${todo.index}: no approved sketch`);
  }

  const userParts: string[] = [
    `## Requirement ${todo.index}\n${todo.statement}`,
    `## Approved Sketch\n${formatSketch(todo.sketch)}`,
  ];

  if (input.codeContext) {
    userParts.push(`## Code Context\n${input.codeContext}`);
  }

  const history = compressHistory(allTodos);
  if (history) {
    userParts.push(`## Design History\n${history}`);
  }
  if (configContext) {
    userParts.push(configContext);
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: DETAIL_SYSTEM },
    { role: 'user', content: userParts.join('\n\n') },
  ];

  const response = await localProvider.complete(messages, {
    maxTokens: 3000,
    temperature: 0.3,
  });

  return response.text;
}

/**
 * Claude reviews and fixes the detailed section.
 * Validates interfaces, integration points, and cross-requirement consistency.
 */
export async function reviewDetail(
  detail: string,
  todo: RequirementTodo,
  allTodos: RequirementTodo[],
  input: DesignerInput,
  claudeProvider: LLMProvider,
): Promise<string> {
  if (!todo.sketch) {
    return detail; // No sketch to validate against — return as-is
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: DETAIL_REVIEW_SYSTEM },
    { role: 'user', content: `## Requirement\n${todo.statement}` },
    { role: 'user', content: `## Approved Sketch\n${formatSketch(todo.sketch)}` },
    { role: 'user', content: `## Local Detail\n${detail}` },
  ];

  if (input.codeContext) {
    messages.push({ role: 'user', content: `## Code Context\n${input.codeContext}` });
  }

  const history = compressHistory(allTodos);
  if (history) {
    messages.push({ role: 'user', content: `## Design History\n${history}` });
  }

  const response = await claudeProvider.complete(messages, {
    maxTokens: 4096,
    temperature: 0.2,
  });

  return response.text;
}

/**
 * Re-run detail with user feedback injected (for edit rounds).
 */
export async function reDetailWithFeedback(
  previousDetail: string,
  feedback: string,
  todo: RequirementTodo,
  allTodos: RequirementTodo[],
  input: DesignerInput,
  localProvider: LLMProvider,
  claudeProvider: LLMProvider,
  configContext?: string,
): Promise<string> {
  const history = compressHistory(allTodos);

  const messages: LLMMessage[] = [
    { role: 'system', content: DETAIL_SYSTEM },
    {
      role: 'user',
      content: [
        `## Requirement ${todo.index}\n${todo.statement}`,
        todo.sketch ? `## Approved Sketch\n${formatSketch(todo.sketch)}` : '',
        `## Previous Detail\n${previousDetail}`,
        `## User Feedback\n${feedback}`,
        input.codeContext ? `## Code Context\n${input.codeContext}` : '',
        history ? `## Design History\n${history}` : '',
        configContext ?? '',
      ].filter(Boolean).join('\n\n'),
    },
  ];

  const localResponse = await localProvider.complete(messages, {
    maxTokens: 3000,
    temperature: 0.3,
  });

  return reviewDetail(
    localResponse.text, todo, allTodos, input, claudeProvider,
  );
}
