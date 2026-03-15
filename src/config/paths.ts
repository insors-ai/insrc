/**
 * Config directory path helpers.
 *
 * Resolves config scopes, infers namespaces from directory layout,
 * and generates deterministic entry IDs.
 */

import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { PATHS } from '../shared/paths.js';
import type { ConfigNamespace, ConfigScope } from '../shared/types.js';

// ---------------------------------------------------------------------------
// Config directory listing
// ---------------------------------------------------------------------------

/** Global config directories under ~/.insrc/. */
export function globalConfigDirs(): string[] {
  return [PATHS.templates, PATHS.feedback, PATHS.conventions];
}

/** Project config directories under <repoPath>/.insrc/. */
export function projectConfigDirs(repoPath: string): string[] {
  const base = join(repoPath, '.insrc');
  return [
    join(base, 'templates'),
    join(base, 'feedback'),
    join(base, 'conventions'),
  ];
}

/** Project config base directory. */
export function projectConfigBase(repoPath: string): string {
  return join(repoPath, '.insrc');
}

// ---------------------------------------------------------------------------
// Namespace inference
// ---------------------------------------------------------------------------

/**
 * Infer the config namespace from a file path's directory structure.
 *
 * Convention:  `<category>/<namespace>/file.md`
 * Files directly under a category dir (no namespace subdir) default to `'common'`.
 *
 * Example: `~/.insrc/templates/tester/vitest-unit.md` → `'tester'`
 *          `~/.insrc/conventions/naming.md`           → `'common'`
 */
export function inferNamespaceFromPath(filePath: string): ConfigNamespace {
  const KNOWN: Set<string> = new Set([
    'tester', 'pair', 'delegate', 'designer', 'planner', 'common',
  ]);

  // Walk path segments looking for a known namespace after a category dir
  const segments = filePath.split('/');
  const categoryDirs = new Set(['templates', 'feedback', 'conventions']);

  for (let i = 0; i < segments.length - 1; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (categoryDirs.has(segments[i]!)) {
      const next = segments[i + 1];
      if (next && KNOWN.has(next)) {
        return next as ConfigNamespace;
      }
      // File is directly under category dir — default to common
      return 'common';
    }
  }

  return 'common';
}

// ---------------------------------------------------------------------------
// Scope classification
// ---------------------------------------------------------------------------

/**
 * Determine if a file path is a config file (global or project) or code.
 * Returns the appropriate ConfigScope, or null if not a config file.
 */
export function classifyConfigPath(filePath: string): ConfigScope | null {
  // Check global config dirs
  for (const dir of globalConfigDirs()) {
    if (filePath.startsWith(dir + '/') || filePath === dir) {
      return { kind: 'global' };
    }
  }

  // Check if path matches <something>/.insrc/<category>/...
  const insrcMatch = filePath.match(/^(.+?)\/\.insrc\/(templates|feedback|conventions)\//);
  if (insrcMatch) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return { kind: 'project', repoPath: insrcMatch[1]! };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Entry ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic config entry ID.
 * Uses SHA256(scope + namespace + filePath), hex-32 (same length as entity IDs).
 */
export function configEntryId(scope: ConfigScope, namespace: string, filePath: string): string {
  const scopeKey = formatScope(scope);
  const input = `${scopeKey}|${namespace}|${filePath}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

// ---------------------------------------------------------------------------
// Scope formatting
// ---------------------------------------------------------------------------

/** Format a ConfigScope for display or storage. */
export function formatScope(scope: ConfigScope): string {
  return scope.kind === 'global' ? 'global' : `project:${scope.repoPath}`;
}

/** Parse a formatted scope string back to ConfigScope. */
export function parseScope(scope: string): ConfigScope {
  if (scope === 'global') return { kind: 'global' };
  if (scope.startsWith('project:')) {
    return { kind: 'project', repoPath: scope.slice('project:'.length) };
  }
  throw new Error(`Invalid scope string: '${scope}'`);
}
