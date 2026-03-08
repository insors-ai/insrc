import type { LLMProvider, LLMMessage } from '../../shared/types.js';
import {
  parseDiff, applyDiff, extractDiffFromResponse,
} from './diff-utils.js';
import { mcpCall, searchByFile } from '../tools/mcp-client.js';
import { requestReindex } from './reindex.js';

// ---------------------------------------------------------------------------
// Document Pipeline — local generation + opt-in Claude review
//
// From design doc (Phase 9):
//   - Stage 1: Local model generates documentation as unified diff
//     - Matches existing comment style in the file
//     - Types: inline comments/docstrings, module README, API docs, ADR, changelog
//   - Stage 2: Claude review (opt-in via --review flag or "review" reply)
//     - Claude/Haiku checks accuracy, completeness, clarity
//     - Single round, no retry loop
//   - Cross-cutting docs (ADRs, changelogs) can escalate to Sonnet
// ---------------------------------------------------------------------------

export interface DocumentResult {
  /** The generated documentation diff */
  diff: string;
  /** Whether the diff was applied to disk */
  applied: boolean;
  /** Files written */
  filesWritten: string[];
  /** Whether Claude reviewed the docs */
  claudeReviewed: boolean;
  /** Claude review verdict (if reviewed) */
  reviewVerdict: string;
  /** Whether this is cross-cutting (ADR, changelog) */
  isCrossCutting: boolean;
  /** User-facing message */
  message: string;
}

export type DocType = 'inline' | 'module' | 'api' | 'adr' | 'changelog';

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const DOC_INLINE_SYSTEM = `Generate a docstring for the following function/class/method.
Match the comment style used in the file shown.
Describe the contract only: inputs, outputs, side effects, throws. Not the implementation.

Output a unified diff only — no explanation outside the diff block.`;

const DOC_MODULE_SYSTEM = `Generate module-level documentation for the following file.
Include: purpose, key exports, usage examples.
Match the existing documentation style if any is present.

Output a unified diff only.`;

const DOC_API_SYSTEM = `Generate API documentation for the following exported entities.
Include: description, parameters, return types, usage examples.
Follow the existing documentation conventions in the codebase.

Output a unified diff only.`;

const DOC_ADR_SYSTEM = `Generate an Architecture Decision Record (ADR) based on the following context.
Follow the template:
# ADR-NNN: Title
## Status: Proposed
## Context: [Why this decision is needed]
## Decision: [What was decided]
## Consequences: [What changes as a result]

Output a unified diff that creates the ADR file.`;

const DOC_CHANGELOG_SYSTEM = `Generate a changelog entry based on the following git history and entity changes.
Follow the Keep a Changelog format:
## [Version] - Date
### Added / Changed / Fixed / Removed

Output a unified diff only.`;

const DOC_REVIEW_SYSTEM = `Review this generated documentation for accuracy and completeness.

Check:
1. **Accuracy** — Does the documentation correctly describe the code's behavior?
2. **Completeness** — Are all parameters, return values, and side effects documented?
3. **Clarity** — Is the documentation clear and understandable?

Respond with EXACTLY one of:
- "APPROVED" — if the documentation is accurate and complete
- "CHANGES_NEEDED" followed by specific issues`;

// ---------------------------------------------------------------------------
// Doc type detection
// ---------------------------------------------------------------------------

/**
 * Detect the documentation type from the user's message.
 */
export function detectDocType(message: string): DocType {
  const lower = message.toLowerCase();

  if (/\badr\b/.test(lower) || /architecture\s+decision/.test(lower)) return 'adr';
  if (/\bchangelog\b/.test(lower) || /\brelease\s+notes\b/.test(lower)) return 'changelog';
  if (/\bmodule\b/.test(lower) || /\breadme\b/.test(lower) || /\bfile\s+doc/.test(lower)) return 'module';
  if (/\bapi\b/.test(lower) || /\bexport/.test(lower) || /\bpublic\s+api/.test(lower)) return 'api';

  // Default: inline docstring
  return 'inline';
}

/**
 * Check if a doc type is cross-cutting (may escalate to Sonnet).
 */
export function isCrossCuttingDoc(docType: DocType): boolean {
  return docType === 'adr' || docType === 'changelog';
}

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

/**
 * Run the document pipeline.
 *
 * @param userMessage - The user's documentation request
 * @param repoPath - Absolute path to the repo root
 * @param codeContext - Assembled code context
 * @param localProvider - Local LLM for generation
 * @param claudeProvider - Claude for opt-in review (null = skip)
 * @param requestReview - Whether Claude review was requested (--review flag)
 * @param log - Logger function
 */
export async function runDocumentPipeline(
  userMessage: string,
  repoPath: string,
  codeContext: string,
  localProvider: LLMProvider,
  claudeProvider: LLMProvider | null,
  requestReview = false,
  log: (msg: string) => void = console.log,
  sonnetProvider: LLMProvider | null = null,
): Promise<DocumentResult> {
  const docType = detectDocType(userMessage);
  const crossCutting = isCrossCuttingDoc(docType);

  log(`  [document] Type: ${docType}${crossCutting ? ' (cross-cutting)' : ''}`);

  // Stage 1: Local generation
  log('  [document] Stage 1: generating documentation...');

  const systemPrompt = getSystemPrompt(docType);
  const contextParts: string[] = [];

  // Add existing comment style sample for inline docs
  if (docType === 'inline' && codeContext) {
    const styleSample = extractCommentStyle(codeContext);
    if (styleSample) {
      contextParts.push(`Existing comment style in this file:\n${styleSample}`);
    }
  }

  if (codeContext) contextParts.push(`Code context:\n${codeContext}`);
  contextParts.push(`Documentation request:\n${userMessage}`);

  const stage1Messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: contextParts.join('\n\n') },
  ];

  const stage1Response = await localProvider.complete(stage1Messages, {
    maxTokens: 3000,
    temperature: 0.2,
  });

  let diff = extractDiffFromResponse(stage1Response.text);

  if (!diff || !diff.includes('---')) {
    return {
      diff: '',
      applied: false,
      filesWritten: [],
      claudeReviewed: false,
      reviewVerdict: '',
      isCrossCutting: crossCutting,
      message: 'Failed to generate documentation diff. The local model did not produce a valid unified diff.',
    };
  }

  // Stage 2: Claude review (opt-in) — single round, no retry loop
  let reviewVerdict = '';
  let claudeReviewed = false;

  if (requestReview && claudeProvider) {
    // For cross-cutting docs, escalate to Sonnet if available
    const reviewLLM = (crossCutting && sonnetProvider) ? sonnetProvider : claudeProvider;
    const tierLabel = (crossCutting && sonnetProvider) ? 'Sonnet (cross-cutting)' : 'Haiku';
    log(`  [document] Stage 2: Claude review (${tierLabel})...`);
    claudeReviewed = true;

    const reviewMessages: LLMMessage[] = [
      { role: 'system', content: DOC_REVIEW_SYSTEM },
      {
        role: 'user',
        content: `Generated doc diff:\n\`\`\`diff\n${diff}\n\`\`\`\n\nCode context:\n${codeContext}`,
      },
    ];

    const reviewResponse = await reviewLLM.complete(reviewMessages, {
      maxTokens: 1500,
      temperature: 0.1,
    });

    reviewVerdict = reviewResponse.text.trim();

    if (reviewVerdict.startsWith('APPROVED')) {
      log('  [document] Review: APPROVED');
    } else {
      log('  [document] Review: CHANGES_NEEDED');
      // Single round — surface feedback to user, do NOT retry
    }
  }

  // Apply the diff
  log('  [document] Applying diff...');
  const parsedDiffs = parseDiff(diff);

  const dryResult = await applyDiff(parsedDiffs, repoPath, true);
  if (!dryResult.success) {
    const errors = [...dryResult.errors.entries()]
      .map(([f, e]) => `  ${f}: ${e}`)
      .join('\n');
    return {
      diff,
      applied: false,
      filesWritten: [],
      claudeReviewed,
      reviewVerdict,
      isCrossCutting: crossCutting,
      message: `Documentation diff could not be applied:\n${errors}`,
    };
  }

  const applyResult = await applyDiff(parsedDiffs, repoPath, false);

  if (applyResult.success) {
    void requestReindex(applyResult.filesWritten, log);
  }

  return {
    diff,
    applied: applyResult.success,
    filesWritten: applyResult.filesWritten,
    claudeReviewed,
    reviewVerdict,
    isCrossCutting: crossCutting,
    message: applyResult.success
      ? `Documentation applied (${applyResult.filesWritten.length} file(s) written).${claudeReviewed ? ` Claude review: ${reviewVerdict.startsWith('APPROVED') ? 'APPROVED' : 'CHANGES_NEEDED'}` : ''}${reviewVerdict.startsWith('CHANGES_NEEDED') ? `\n\nReview feedback:\n${reviewVerdict.slice('CHANGES_NEEDED'.length).trim()}` : ''}`
      : `Documentation could not be applied: ${[...applyResult.errors.values()].join('\n')}`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSystemPrompt(docType: DocType): string {
  switch (docType) {
    case 'inline':   return DOC_INLINE_SYSTEM;
    case 'module':   return DOC_MODULE_SYSTEM;
    case 'api':      return DOC_API_SYSTEM;
    case 'adr':      return DOC_ADR_SYSTEM;
    case 'changelog': return DOC_CHANGELOG_SYSTEM;
  }
}

/**
 * Extract a sample of existing comment style from code context.
 * Looks for JSDoc, Python docstrings, Go comments, etc.
 */
export function extractCommentStyle(codeContext: string): string | null {
  // Look for JSDoc-style comments
  const jsdocMatch = codeContext.match(/\/\*\*[\s\S]*?\*\//);
  if (jsdocMatch) return jsdocMatch[0];

  // Look for # comments block (Python/Ruby)
  const hashBlockMatch = codeContext.match(/(?:^#.*\n){2,}/m);
  if (hashBlockMatch) return hashBlockMatch[0];

  // Look for // comments block
  const slashBlockMatch = codeContext.match(/(?:^\/\/.*\n){2,}/m);
  if (slashBlockMatch) return slashBlockMatch[0];

  // Look for Python docstrings
  const docstringMatch = codeContext.match(/"""[\s\S]*?"""/);
  if (docstringMatch) return docstringMatch[0];

  return null;
}
