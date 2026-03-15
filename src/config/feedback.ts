/**
 * Feedback recording — LLM-driven generalization and storage.
 *
 * Records agent feedback as config entries, classifies scope (global vs project),
 * generalizes via LLM, deduplicates, and triggers immediate re-indexing.
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type {
  ConfigNamespace,
  ConfigScope,
  Language,
  LLMProvider,
  RecordFeedbackOpts,
} from '../shared/types.js';
import { PATHS } from '../shared/paths.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('config-feedback');

// ---------------------------------------------------------------------------
// System prompt for feedback generalization
// ---------------------------------------------------------------------------

const GENERALIZE_FEEDBACK_SYSTEM = `You are a feedback generalizer for a coding agent.

Given raw feedback from a user, generalize it into a reusable guideline.
Rules:
- Remove project-specific names, paths, or variable names
- Keep the core lesson or pattern
- Write as an imperative rule (e.g., "Always...", "Never...", "Prefer...")
- One clear sentence, optionally followed by a brief explanation
- If the feedback is already general enough, return it as-is
- If this feedback duplicates existing guidelines, respond with exactly: DUPLICATE

Current guidelines for context:
{existing}

Raw feedback to generalize:
{feedback}`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RecordFeedbackFullOpts extends RecordFeedbackOpts {
  rpcFn?: (<T>(method: string, params?: unknown) => Promise<T>) | undefined;
}

/**
 * Record agent feedback — generalize, deduplicate, persist, and re-index.
 *
 * 1. Classify scope (project vs global)
 * 2. Determine file path
 * 3. Read existing feedback for dedup context
 * 4. LLM-generalize the feedback
 * 5. Check for DUPLICATE response
 * 6. Append to feedback file
 * 7. Enqueue re-index via IPC
 */
export async function recordFeedback(opts: RecordFeedbackFullOpts): Promise<void> {
  const { content, namespace, language, repoPath, provider, rpcFn } = opts;

  // 1. Classify scope
  const isProjectSpecific = classifyFeedbackScope(content, repoPath);
  const scope: ConfigScope = isProjectSpecific
    ? { kind: 'project', repoPath }
    : { kind: 'global' };

  // 2. Determine file path
  const baseDir = isProjectSpecific
    ? join(repoPath, '.insrc', 'feedback', namespace)
    : join(PATHS.feedback, namespace);
  const filePath = join(baseDir, `${language}.md`);

  // 3. Read existing feedback for dedup context
  let existing = '';
  if (existsSync(filePath)) {
    try { existing = readFileSync(filePath, 'utf8'); }
    catch { /* ignore */ }
  }

  // 4. LLM-generalize
  const prompt = GENERALIZE_FEEDBACK_SYSTEM
    .replace('{existing}', existing || '(none)')
    .replace('{feedback}', content);

  let generalized: string;
  try {
    const response = await provider.complete([
      { role: 'system', content: prompt },
      { role: 'user', content: 'Generalize the feedback above.' },
    ], { maxTokens: 256, temperature: 0.3 });
    generalized = response.text.trim();
  } catch (err) {
    log.warn({ err: String(err) }, 'LLM generalization failed, using raw feedback');
    generalized = content;
  }

  // 5. Check for DUPLICATE
  if (generalized === 'DUPLICATE') {
    log.debug({ content: content.slice(0, 60) }, 'feedback duplicate, skipping');
    return;
  }

  // 6. Append to file
  mkdirSync(dirname(filePath), { recursive: true });

  // Ensure frontmatter exists if file is new
  if (!existsSync(filePath)) {
    const frontmatter = [
      '---',
      `category: feedback`,
      `namespace: ${namespace}`,
      `language: ${language}`,
      `name: ${namespace}-${language}-feedback`,
      `tags: [feedback, ${namespace}]`,
      '---',
      '',
    ].join('\n');
    appendFileSync(filePath, frontmatter);
  }

  const entry = `\n- ${generalized}\n`;
  appendFileSync(filePath, entry);

  log.info({ file: filePath, scope: scope.kind }, 'feedback recorded');

  // 7. Enqueue re-index
  if (rpcFn) {
    try {
      await rpcFn('config.enqueue', { filePath, scope, event: 'update' });
    } catch (err) {
      log.warn({ err: String(err) }, 'failed to enqueue config re-index');
    }
  }
}

// ---------------------------------------------------------------------------
// Scope classification
// ---------------------------------------------------------------------------

/**
 * Heuristic to determine if feedback is project-specific.
 * Returns true if the content references project-specific patterns.
 */
export function classifyFeedbackScope(content: string, repoPath: string): boolean {
  // Check if content references paths within the repo
  const repoName = repoPath.split('/').pop() ?? '';
  if (repoName && content.includes(repoName)) return true;

  // Check for absolute paths from the repo
  if (content.includes(repoPath)) return true;

  // Check for common project-specific indicators
  const projectIndicators = [
    'this project', 'this repo', 'this codebase',
    'our codebase', 'in this',
  ];
  const lower = content.toLowerCase();
  return projectIndicators.some(ind => lower.includes(ind));
}
