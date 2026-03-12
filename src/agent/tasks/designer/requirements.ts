import type { LLMProvider, LLMMessage } from '../../../shared/types.js';
import type { DesignerInput, ParsedRequirement } from './types.js';
import { REQ_EXTRACT_SYSTEM, REQ_ENHANCE_SYSTEM } from './prompts.js';

// ---------------------------------------------------------------------------
// Requirements Extraction — Step 1 of the Designer pipeline
//
// Stage 1: Local model extracts numbered requirements list
// Stage 2: Claude enhances — sharpens, fills gaps, deduplicates
// ---------------------------------------------------------------------------

/**
 * Extract requirements from the user's message using the local model.
 * Returns the raw numbered list text (not yet parsed).
 */
export async function extractRequirements(
  input: DesignerInput,
  localProvider: LLMProvider,
): Promise<string> {
  const userParts: string[] = [];

  if (input.requirementsDoc) {
    userParts.push(`Requirements document:\n${input.requirementsDoc}`);
  }
  if (input.codeContext) {
    userParts.push(`Code context:\n${input.codeContext}`);
  }
  userParts.push(`User request:\n${input.message}`);

  const messages: LLMMessage[] = [
    { role: 'system', content: REQ_EXTRACT_SYSTEM },
    { role: 'user', content: userParts.join('\n\n') },
  ];

  const response = await localProvider.complete(messages, {
    maxTokens: 2000,
    temperature: 0.3,
  });

  return response.text;
}

/**
 * Enhance the requirements list using Claude.
 * Takes the raw list from the local model and sharpens it.
 */
export async function enhanceRequirements(
  rawList: string,
  input: DesignerInput,
  claudeProvider: LLMProvider,
): Promise<string> {
  const userParts: string[] = [
    `Requirements list to enhance:\n\n${rawList}`,
  ];

  if (input.codeContext) {
    userParts.push(`Code context:\n${input.codeContext}`);
  }
  userParts.push(`Original user request:\n${input.message}`);

  const messages: LLMMessage[] = [
    { role: 'system', content: REQ_ENHANCE_SYSTEM },
    { role: 'user', content: userParts.join('\n\n') },
  ];

  const response = await claudeProvider.complete(messages, {
    maxTokens: 2500,
    temperature: 0.2,
  });

  return response.text;
}

/**
 * Re-run extraction with user feedback injected (for edit rounds).
 */
export async function reExtractWithFeedback(
  previousList: string,
  feedback: string,
  input: DesignerInput,
  claudeProvider: LLMProvider,
): Promise<string> {
  const messages: LLMMessage[] = [
    { role: 'system', content: REQ_ENHANCE_SYSTEM },
    {
      role: 'user',
      content: [
        `Previous requirements list:\n\n${previousList}`,
        `User feedback:\n${feedback}`,
        input.codeContext ? `Code context:\n${input.codeContext}` : '',
        `Original request:\n${input.message}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];

  const response = await claudeProvider.complete(messages, {
    maxTokens: 2500,
    temperature: 0.2,
  });

  return response.text;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a numbered requirements list into structured ParsedRequirement objects.
 *
 * Handles two output formats:
 *
 * Format A (inline type):
 *   1. [FUNCTIONAL] Statement text — references: entity1, entity2
 *   2. [SYSTEM] Statement text
 *
 * Format B (section headers):
 *   **[FUNCTIONAL]**
 *   1. Statement text — refs: entity1, entity2
 *   2. Statement text
 *
 *   **[SYSTEM]**
 *   3. Statement text
 */
export function parseRequirementsList(text: string): ParsedRequirement[] {
  const requirements: ParsedRequirement[] = [];
  const lines = text.split('\n');

  // Track current section type for header-grouped format
  let currentType: 'functional' | 'system' = 'functional';

  for (const line of lines) {
    // Check for section header: **[FUNCTIONAL]** or [FUNCTIONAL] or **[SYSTEM]** etc.
    const headerMatch = line.match(
      /^\s*\*{0,2}\[?(FUNCTIONAL|SYSTEM)\]?\*{0,2}\s*$/i,
    );
    if (headerMatch) {
      currentType = headerMatch[1]!.toLowerCase() as 'functional' | 'system';
      continue;
    }

    // Format A: "1. [FUNCTIONAL] ..."
    const inlineMatch = line.match(
      /^\s*(\d+)\.\s*\[(FUNCTIONAL|SYSTEM)\]\s*(.+)$/i,
    );
    if (inlineMatch) {
      const index = parseInt(inlineMatch[1]!, 10);
      const type = inlineMatch[2]!.toLowerCase() as 'functional' | 'system';
      const rest = inlineMatch[3]!;
      const { statement, references } = extractReferences(rest);
      requirements.push({ index, statement, type, references });
      continue;
    }

    // Format B: "1. Statement text ..." (uses currentType from section header)
    const numberedMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      const index = parseInt(numberedMatch[1]!, 10);
      const rest = numberedMatch[2]!;
      const { statement, references } = extractReferences(rest);
      requirements.push({ index, statement, type: currentType, references });
      continue;
    }
  }

  // Re-index if parsing produced gaps
  return requirements.map((r, i) => ({ ...r, index: i + 1 }));
}

/**
 * Extract statement and references from the text after the number/type prefix.
 * Accepts both "— references: ..." and "— refs: ..." patterns.
 */
function extractReferences(rest: string): { statement: string; references: string[] } {
  const refMatch = rest.match(/^(.+?)\s*—\s*(?:references?|refs?):\s*(.+)$/i);
  const statement = refMatch ? refMatch[1]!.trim() : rest.trim();
  const references = refMatch
    ? refMatch[2]!.split(',').map(r => r.trim()).filter(Boolean)
    : [];
  return { statement, references };
}

/**
 * Format a parsed requirements list back into display text.
 */
export function formatRequirementsList(reqs: ParsedRequirement[]): string {
  return reqs.map(r => {
    const refs = r.references.length > 0
      ? ` — references: ${r.references.join(', ')}`
      : '';
    return `${r.index}. [${r.type.toUpperCase()}] ${r.statement}${refs}`;
  }).join('\n');
}
