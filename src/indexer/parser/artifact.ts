/**
 * Artifact parser — indexes non-code files (docs, configs, plans, etc.)
 *
 * Supported file types:
 *   - Markdown (.md)        → document + section entities (split on headings)
 *   - YAML (.yaml, .yml)    → config entity (whole file)
 *   - JSON (.json)          → config entity (whole file, skip package-lock)
 *   - TOML (.toml)          → config entity (whole file)
 *   - SQL (.sql)            → document entity (whole file)
 *   - Proto (.proto)        → document entity (whole file)
 *   - GraphQL (.graphql, .gql) → document entity (whole file)
 *   - Shell (.sh, .bash)    → config entity (whole file)
 *   - Dockerfile            → config entity (whole file)
 *   - Env (.env.example)    → config entity (whole file)
 *   - CI configs             → config entity (whole file)
 *
 * All entities are flagged with `artifact: true` so they can be filtered
 * separately from code entities in search results.
 */

import { basename, extname } from 'node:path';
import type { Entity, Language, EntityKind } from '../../shared/types.js';
import type { ParseResult, CodeParser } from './base.js';
import { makeEntityId } from './base.js';
import { registerParser } from './registry.js';

// ---------------------------------------------------------------------------
// Extension → language mapping
// ---------------------------------------------------------------------------

const EXT_LANGUAGE: Record<string, Language> = {
  '.md':       'markdown',
  '.mdx':      'markdown',
  '.yaml':     'yaml',
  '.yml':      'yaml',
  '.json':     'json',
  '.jsonc':    'json',
  '.json5':    'json',
  '.toml':     'toml',
  '.sql':      'sql',
  '.proto':    'proto',
  '.graphql':  'graphql',
  '.gql':      'graphql',
  '.sh':       'shell',
  '.bash':     'shell',
  '.zsh':      'shell',
  '.env':      'config',
  '.html':     'html',
  '.htm':      'html',
  '.css':      'css',
  '.svg':      'html',
};

// Files matched by basename (no extension or special names)
const BASENAME_LANGUAGE: Record<string, Language> = {
  'Dockerfile':       'dockerfile',
  'Dockerfile.dev':   'dockerfile',
  'Dockerfile.prod':  'dockerfile',
  'docker-compose.yml': 'yaml',
  'docker-compose.yaml': 'yaml',
  '.env.example':     'config',
  '.env.local':       'config',
  '.env.development': 'config',
  '.env.production':  'config',
  '.dockerignore':    'config',
  '.gitignore':       'config',
  '.editorconfig':    'config',
  'Makefile':         'shell',
  'Justfile':         'shell',
  'LICENSE':          'config',
  'LICENSE.md':       'markdown',
  'LICENSE.txt':      'config',
};

// Large/noisy files to skip entirely
const SKIP_BASENAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'Cargo.lock',
  'go.sum',
  'poetry.lock',
  'Pipfile.lock',
  'composer.lock',
]);

// Max file size to index (256 KB) — skip giant generated files
const MAX_SIZE = 256 * 1024;

// Max body size per entity — truncate to keep embeddings meaningful
const MAX_BODY = 8192;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class ArtifactParser implements CodeParser {
  readonly extensions = [
    '.md', '.mdx',
    '.yaml', '.yml',
    '.json', '.jsonc', '.json5',
    '.toml',
    '.sql',
    '.proto', '.graphql', '.gql',
    '.sh', '.bash', '.zsh',
    '.html', '.htm', '.css', '.svg',
  ];

  // Language is determined per-file, not per-parser
  readonly language = 'config' as Language;

  parse(filePath: string, source: string, repo: string): ParseResult {
    const name = basename(filePath);

    // Skip lock files and oversized files
    if (SKIP_BASENAMES.has(name)) return { entities: [], relations: [] };
    if (source.length > MAX_SIZE) return { entities: [], relations: [] };

    const ext = extname(filePath).toLowerCase();
    const lang = EXT_LANGUAGE[ext] ?? BASENAME_LANGUAGE[name] ?? 'config';
    const now = new Date().toISOString();
    const lines = source.split('\n');

    // File entity (always created)
    const fileEntity: Entity = {
      id:        makeEntityId(repo, filePath, 'file', filePath),
      kind:      'file',
      name,
      language:  lang,
      repo,
      file:      filePath,
      startLine: 1,
      endLine:   lines.length,
      body:      '',  // file entity body is empty, sections carry content
      embedding: [],
      indexedAt:  now,
      artifact:  true,
    };

    const entities: Entity[] = [fileEntity];
    const relations: ParseResult['relations'] = [];

    // File-level DEFINES relation helper
    const define = (child: Entity) => {
      relations.push({
        kind: 'DEFINES' as const,
        from: fileEntity.id,
        to:   child.id,
        resolved: true,
      });
    };

    if (lang === 'markdown') {
      // Split markdown on headings into sections
      const sections = parseMarkdownSections(source, filePath, repo, lang, now);
      if (sections.length > 0) {
        for (const sec of sections) {
          entities.push(sec);
          define(sec);
        }
      } else {
        // No headings — index whole file as a single document entity
        const doc = makeDocEntity(filePath, repo, name, lang, source, 1, lines.length, now);
        entities.push(doc);
        define(doc);
      }
    } else {
      // Non-markdown artifacts: single entity for the whole file
      const kind: EntityKind = isConfigLang(lang) ? 'config' : 'document';
      const entity: Entity = {
        id:        makeEntityId(repo, filePath, kind, name),
        kind,
        name,
        language:  lang,
        repo,
        file:      filePath,
        startLine: 1,
        endLine:   lines.length,
        body:      truncate(source),
        embedding: [],
        indexedAt:  now,
        artifact:  true,
      };
      entities.push(entity);
      define(entity);
    }

    return { entities, relations };
  }
}

// ---------------------------------------------------------------------------
// Markdown section parser
// ---------------------------------------------------------------------------

interface HeadingMark {
  level: number;
  title: string;
  line:  number;  // 1-based
}

function parseMarkdownSections(
  source: string,
  filePath: string,
  repo: string,
  lang: Language,
  now: string,
): Entity[] {
  const lines = source.split('\n');
  const headings: HeadingMark[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      headings.push({
        level: match[1]!.length,
        title: match[2]!.trim(),
        line:  i + 1,
      });
    }
  }

  if (headings.length === 0) return [];

  const entities: Entity[] = [];

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!;
    const startLine = h.line;
    const endLine = i + 1 < headings.length ? headings[i + 1]!.line - 1 : lines.length;
    const body = lines.slice(startLine - 1, endLine).join('\n');

    // Skip tiny sections (just a heading with no content)
    if (body.trim().split('\n').length < 2) continue;

    const entity: Entity = {
      id:        makeEntityId(repo, filePath, 'section', `${h.title}@L${startLine}`),
      kind:      'section',
      name:      h.title,
      language:  lang,
      repo,
      file:      filePath,
      startLine,
      endLine,
      body:      truncate(body),
      embedding: [],
      indexedAt:  now,
      artifact:  true,
      signature: `${'#'.repeat(h.level)} ${h.title}`,
    };
    entities.push(entity);
  }

  return entities;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDocEntity(
  filePath: string,
  repo: string,
  name: string,
  lang: Language,
  source: string,
  startLine: number,
  endLine: number,
  now: string,
): Entity {
  return {
    id:        makeEntityId(repo, filePath, 'document', name),
    kind:      'document',
    name,
    language:  lang,
    repo,
    file:      filePath,
    startLine,
    endLine,
    body:      truncate(source),
    embedding: [],
    indexedAt:  now,
    artifact:  true,
  };
}

function isConfigLang(lang: Language): boolean {
  return ['yaml', 'json', 'toml', 'shell', 'dockerfile', 'config'].includes(lang);
}

function truncate(text: string): string {
  return text.length <= MAX_BODY ? text : text.slice(0, MAX_BODY) + '\n… (truncated)';
}

// ---------------------------------------------------------------------------
// Also handle special filenames without matching extensions
// ---------------------------------------------------------------------------

/**
 * Basename-only parser for files like Dockerfile, Makefile, .env.example
 * that don't have standard extensions handled by the extension-based registry.
 */
class BaseNameArtifactParser implements CodeParser {
  readonly extensions: string[] = [];
  readonly language = 'config' as Language;

  /** Check if we handle this file by basename. */
  handles(filePath: string): boolean {
    return basename(filePath) in BASENAME_LANGUAGE;
  }

  parse(filePath: string, source: string, repo: string): ParseResult {
    const name = basename(filePath);
    if (SKIP_BASENAMES.has(name)) return { entities: [], relations: [] };
    if (source.length > MAX_SIZE) return { entities: [], relations: [] };

    const lang = BASENAME_LANGUAGE[name] ?? 'config';
    const now = new Date().toISOString();
    const lines = source.split('\n');

    const fileEntity: Entity = {
      id:        makeEntityId(repo, filePath, 'file', filePath),
      kind:      'file',
      name,
      language:  lang,
      repo,
      file:      filePath,
      startLine: 1,
      endLine:   lines.length,
      body:      '',
      embedding: [],
      indexedAt:  now,
      artifact:  true,
    };

    const kind: EntityKind = isConfigLang(lang) ? 'config' : 'document';
    const entity: Entity = {
      id:        makeEntityId(repo, filePath, kind, name),
      kind,
      name,
      language:  lang,
      repo,
      file:      filePath,
      startLine: 1,
      endLine:   lines.length,
      body:      truncate(source),
      embedding: [],
      indexedAt:  now,
      artifact:  true,
    };

    return {
      entities: [fileEntity, entity],
      relations: [{
        kind: 'DEFINES',
        from: fileEntity.id,
        to:   entity.id,
        resolved: true,
      }],
    };
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const artifactParser = new ArtifactParser();
const basenameParser = new BaseNameArtifactParser();

registerParser(artifactParser);

// Export for use in the indexer (basename parser needs special handling)
export { artifactParser, basenameParser, SKIP_BASENAMES, BASENAME_LANGUAGE };
