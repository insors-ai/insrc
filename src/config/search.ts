/**
 * Config search layer — vector search with namespace/category filtering
 * and project-scope boosting.
 *
 * Follows the pattern from src/db/search.ts but operates on
 * ConfigStore instead of the code entity store.
 */

import type {
  ConfigEntry,
  ConfigSearchOpts,
  ConfigSearchResult,
  ConfigScope,
  TemplateQuery,
} from '../shared/types.js';
import { formatScope } from './paths.js';
import type { ConfigStore } from './store.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('config-search');

/** Project-scope results get their score multiplied by this factor. */
const PROJECT_BOOST = 1.5;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search config entries by vector similarity with optional filters.
 *
 * Results can be boosted for project-scope entries when `boostProject` is true,
 * which re-ranks project entries higher in the result list.
 */
export async function searchConfig(
  store:    ConfigStore,
  queryVec: number[],
  opts:     ConfigSearchOpts,
): Promise<ConfigSearchResult[]> {
  if (queryVec.length === 0) {
    log.debug('searchConfig: empty query vector');
    return [];
  }

  const where = buildWhereClause(opts);
  const limit = opts.limit ?? 10;

  const t0 = Date.now();
  const raw = await store.vectorSearch(queryVec, where, limit);

  const results: ConfigSearchResult[] = raw.map(({ entry, distance }) => {
    // Convert distance to similarity score (cosine distance → 1 - distance)
    const baseScore = Math.max(0, 1 - distance);
    const isProject = entry.scope.kind === 'project';
    const boosted = !!(opts.boostProject && isProject);
    const score = boosted ? baseScore * PROJECT_BOOST : baseScore;
    return { entry, score, boosted };
  });

  // Re-sort by boosted score
  if (opts.boostProject) {
    results.sort((a, b) => b.score - a.score);
  }

  const elapsed = `${Date.now() - t0}ms`;
  log.info({ hits: results.length, limit, elapsed }, 'config search');
  return results;
}

/**
 * Resolve a template by exact match first, then semantic fallback.
 *
 * Resolution order:
 * 1. Exact match in project scope (if repoPath provided)
 * 2. Exact match in global scope
 * 3. Semantic fallback via vector search
 */
export async function resolveTemplate(
  store:    ConfigStore,
  queryVec: number[],
  opts:     TemplateQuery,
): Promise<ConfigEntry | null> {
  // Try exact match — project scope first
  if (opts.repoPath) {
    const projectScope = formatScope({ kind: 'project', repoPath: opts.repoPath });
    const projectEntries = await store.listEntries({
      namespace: opts.namespace,
      category: 'template',
      scope: projectScope,
    });
    const exact = projectEntries.find(
      e => e.name === opts.name && (e.language === opts.language || e.language === 'all'),
    );
    if (exact) {
      log.debug({ name: opts.name, scope: 'project' }, 'template resolved (exact)');
      return exact;
    }
  }

  // Try exact match — global scope
  const globalEntries = await store.listEntries({
    namespace: opts.namespace,
    category: 'template',
    scope: 'global',
  });
  const exact = globalEntries.find(
    e => e.name === opts.name && (e.language === opts.language || e.language === 'all'),
  );
  if (exact) {
    log.debug({ name: opts.name, scope: 'global' }, 'template resolved (exact)');
    return exact;
  }

  // Semantic fallback
  if (queryVec.length === 0) return null;

  const conditions: string[] = [
    "category = 'template'",
    `namespace = '${opts.namespace}'`,
  ];
  if (opts.language !== 'all') {
    conditions.push(`(language = '${opts.language}' OR language = 'all')`);
  }
  const where = conditions.join(' AND ');

  const results = await store.vectorSearch(queryVec, where, 1);
  if (results.length > 0 && results[0]) {
    log.debug({ name: opts.name, matched: results[0].entry.name }, 'template resolved (semantic)');
    return results[0].entry;
  }

  log.debug({ name: opts.name }, 'template not found');
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a SQL WHERE clause from search options. */
function buildWhereClause(opts: ConfigSearchOpts): string | undefined {
  const conditions: string[] = [];

  // Namespace filter — supports single or array
  if (opts.namespace) {
    if (Array.isArray(opts.namespace)) {
      const namespaces = opts.namespace.map(n => `'${n.replace(/'/g, "''")}'`).join(', ');
      conditions.push(`namespace IN (${namespaces})`);
    } else {
      conditions.push(`namespace = '${opts.namespace.replace(/'/g, "''")}'`);
    }
  }

  // Category filter
  if (opts.category) {
    conditions.push(`category = '${opts.category.replace(/'/g, "''")}'`);
  }

  // Language filter
  if (opts.language) {
    if (opts.language === 'all') {
      conditions.push("language = 'all'");
    } else {
      // Include 'all' language entries alongside the specific language
      conditions.push(`(language = '${opts.language.replace(/'/g, "''")}' OR language = 'all')`);
    }
  }

  // Scope filter
  if (opts.scope) {
    const scopeStr = formatScope(opts.scope);
    conditions.push(`scope = '${scopeStr.replace(/'/g, "''")}'`);
  }

  return conditions.length > 0 ? conditions.join(' AND ') : undefined;
}
