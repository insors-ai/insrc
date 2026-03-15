/**
 * Shared helper for loading config context (conventions, feedback, templates)
 * into agent prompts via the config management system.
 *
 * Cap: ~2,000 tokens (~6,000 chars). Priority order:
 *   1. Conventions (highest)
 *   2. Feedback (learnings from past runs)
 *   3. Templates (lowest)
 */

import type { StepContext } from '../../framework/types.js';
import type { ConfigNamespace, Language } from '../../../shared/types.js';

const MAX_CONFIG_CHARS = 6000;

/**
 * Load config context for an agent step. Returns a formatted markdown section
 * or empty string if no config entries are found or daemon is unavailable.
 */
export async function loadConfigContext(
  ctx: StepContext,
  namespace: ConfigNamespace,
  language: Language | 'all',
  repoPath: string,
): Promise<string> {
  if (!ctx.searchConfig) return '';

  const parts: string[] = [];
  let totalChars = 0;

  // 1. Conventions (highest priority)
  try {
    const conventions = await ctx.searchConfig({
      query: `${namespace} coding conventions`,
      namespace: [namespace, 'common'],
      category: 'convention',
      language,
      limit: 5,
      boostProject: true,
    });
    for (const c of conventions) {
      if (totalChars + c.entry.body.length > MAX_CONFIG_CHARS) break;
      parts.push(`### Convention: ${c.entry.name}\n${c.entry.body}`);
      totalChars += c.entry.body.length;
    }
  } catch {
    // Config search unavailable — continue without conventions
  }

  // 2. Feedback (learnings from past runs)
  try {
    const feedback = await ctx.searchConfig({
      query: `${namespace} feedback learnings`,
      namespace: [namespace, 'common'],
      category: 'feedback',
      language,
      limit: 5,
      boostProject: true,
    });
    for (const f of feedback) {
      if (totalChars + f.entry.body.length > MAX_CONFIG_CHARS) break;
      parts.push(`### Learning: ${f.entry.name}\n${f.entry.body}`);
      totalChars += f.entry.body.length;
    }
  } catch {
    // Config search unavailable — continue without feedback
  }

  // 3. Templates (lowest priority, only if space remains)
  try {
    const templates = await ctx.searchConfig({
      query: `${namespace} templates`,
      namespace: [namespace, 'common'],
      category: 'template',
      language,
      limit: 3,
      boostProject: true,
    });
    for (const t of templates) {
      if (totalChars + t.entry.body.length > MAX_CONFIG_CHARS) break;
      parts.push(`### Template: ${t.entry.name}\n${t.entry.body}`);
      totalChars += t.entry.body.length;
    }
  } catch {
    // Config search unavailable — continue without templates
  }

  if (parts.length === 0) return '';
  return `## Project conventions and learnings\n\n${parts.join('\n\n')}`;
}
