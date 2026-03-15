/**
 * Config file frontmatter parser.
 *
 * Config entries are markdown files with YAML frontmatter:
 * ```
 * ---
 * category: template
 * namespace: tester
 * language: typescript
 * name: vitest-unit
 * tags: [unit, vitest]
 * ---
 * Body content here...
 * ```
 *
 * Uses regex-based parsing — no external YAML dependency.
 */

import type { ConfigCategory, ConfigNamespace, Language } from '../shared/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfigFrontmatter {
  category:  ConfigCategory;
  namespace: ConfigNamespace;
  language:  Language | 'all';
  name:      string;
  tags:      string[];
}

// ---------------------------------------------------------------------------
// Valid values for validation
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = new Set<string>(['template', 'feedback', 'convention']);
const VALID_NAMESPACES = new Set<string>([
  'tester', 'pair', 'delegate', 'designer', 'planner', 'common',
]);
const VALID_LANGUAGES = new Set<string>([
  'python', 'go', 'typescript', 'javascript',
  'markdown', 'html', 'css', 'yaml', 'json', 'toml', 'shell',
  'sql', 'proto', 'graphql', 'dockerfile', 'config', 'all',
]);

// ---------------------------------------------------------------------------
// Frontmatter regex
// ---------------------------------------------------------------------------

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from a config markdown file.
 * Throws if frontmatter is missing or contains invalid values.
 */
export function parseConfigFrontmatter(content: string): ConfigFrontmatter {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error('Config file missing YAML frontmatter (--- delimiters)');
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const yamlBlock = match[1]!;
  const fields = parseYamlBlock(yamlBlock);

  const category = fields['category'];
  if (!category || !VALID_CATEGORIES.has(category)) {
    throw new Error(`Invalid or missing category: '${category ?? ''}'`);
  }

  const namespace = fields['namespace'];
  if (!namespace || !VALID_NAMESPACES.has(namespace)) {
    throw new Error(`Invalid or missing namespace: '${namespace ?? ''}'`);
  }

  const language = fields['language'];
  if (!language || !VALID_LANGUAGES.has(language)) {
    throw new Error(`Invalid or missing language: '${language ?? ''}'`);
  }

  const name = fields['name'];
  if (!name) {
    throw new Error('Missing required frontmatter field: name');
  }

  const tagsRaw = fields['tags'] ?? '';
  const tags = parseTags(tagsRaw);

  return {
    category:  category  as ConfigCategory,
    namespace: namespace as ConfigNamespace,
    language:  language  as Language | 'all',
    name,
    tags,
  };
}

/**
 * Strip YAML frontmatter and return the body content.
 */
export function stripFrontmatter(content: string): string {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return content;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return match[2]!.trim();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Parse a simple YAML block into key-value pairs (single-level only). */
function parseYamlBlock(yaml: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of yaml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key   = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

/** Parse tags from `[item, item]` or `- item` YAML format. */
function parseTags(raw: string): string[] {
  if (!raw) return [];

  // Inline array: [tag1, tag2, tag3]
  const inlineMatch = raw.match(/^\[(.*)\]$/);
  if (inlineMatch) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return inlineMatch[1]!
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
  }

  // Bare value (single tag)
  return [raw.trim()].filter(Boolean);
}
