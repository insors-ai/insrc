/**
 * Two-tier config resolution — global + project.
 *
 * Resolution order: defaults → global (~/.insrc/config.json) → project (<repo>/.insrc/config.json).
 * Project values win for all primitive and object fields.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentConfig } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';
import { loadConfig } from '../agent/config.js';

const log = getLogger('config-loader');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the project-level config override from `<repoPath>/.insrc/config.json`.
 * Returns null if no project config exists.
 */
export function loadProjectConfig(repoPath: string): Partial<Record<string, unknown>> | null {
  const configPath = join(repoPath, '.insrc', 'config.json');
  if (!existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    log.debug({ path: configPath }, 'loaded project config');
    return raw;
  } catch (err) {
    log.warn({ err, path: configPath }, 'failed to parse project config');
    return null;
  }
}

/**
 * Resolve the fully merged config for a repo.
 * Order: defaults → global → project (project wins).
 */
export function resolveConfig(repoPath?: string | undefined): AgentConfig {
  const global = loadConfig();
  if (!repoPath) return global;

  const project = loadProjectConfig(repoPath);
  if (!project) return global;

  return deepMerge(global as unknown as Record<string, unknown>, project) as unknown as AgentConfig;
}

// ---------------------------------------------------------------------------
// Deep merge utility
// ---------------------------------------------------------------------------

/**
 * Recursively deep-merge `override` into `base`.
 * - Primitives: override wins.
 * - Objects: recurse.
 * - Arrays: override replaces (no concat).
 * - null/undefined in override: skipped (base preserved).
 */
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Partial<Record<string, unknown>>,
): T {
  const result = { ...base };

  for (const key of Object.keys(override)) {
    const overrideVal = override[key];
    if (overrideVal === undefined || overrideVal === null) continue;

    const baseVal = (base as Record<string, unknown>)[key];

    if (
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal) &&
      typeof baseVal === 'object' &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      // Both are objects — recurse
      (result as Record<string, unknown>)[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      );
    } else {
      // Primitive, array, or type mismatch — override wins
      (result as Record<string, unknown>)[key] = overrideVal;
    }
  }

  return result;
}
