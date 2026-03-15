/**
 * Concept-driven exploration for the designer's sketch step.
 *
 * Each requirement is classified into applicable design concepts (persistence,
 * integrations, deployment, etc.). Each concept triggers specialized search
 * queries and analysis prompts tailored to that domain.
 */

import type { LLMProvider, LLMMessage, Entity } from '../../../shared/types.js';
import type { RequirementTodo, ReusableEntity } from './types.js';
import type { PlannedSearch } from './search-planner.js';
import { parseSearchPlan, fallbackSearch } from './search-planner.js';
import { createDaemonContextProvider } from '../../tools/context-provider.js';
import { getLogger } from '../../../shared/logger.js';

const log = getLogger('concepts');

// ---------------------------------------------------------------------------
// Concept taxonomy
// ---------------------------------------------------------------------------

export type DesignConcept =
  | 'code-reuse'
  | 'messaging'
  | 'ui'
  | 'persistence-db'
  | 'persistence-vector'
  | 'persistence-fs'
  | 'auth'
  | 'integration'
  | 'logging'
  | 'deployment'
  | 'error-handling'
  | 'security';

const VALID_CONCEPTS = new Set<string>([
  'code-reuse', 'messaging', 'ui',
  'persistence-db', 'persistence-vector', 'persistence-fs',
  'auth', 'integration', 'logging', 'deployment',
  'error-handling', 'security',
]);

export interface ConceptClassification {
  concepts: DesignConcept[];
  reasoning: string;
}

export interface ConceptAnalysis {
  concept: DesignConcept;
  findings: string;
  entities: ReusableEntity[];
}

// ---------------------------------------------------------------------------
// Concept classification
// ---------------------------------------------------------------------------

const CLASSIFY_CONCEPTS_SYSTEM = `You are classifying a software requirement to determine which design exploration areas are relevant.

Given a requirement, output ONLY a JSON object:
{
  "concepts": ["code-reuse", "persistence-db", ...],
  "reasoning": "Brief explanation"
}

Available concepts:
- code-reuse: always include — search for existing modules, frameworks, utilities, caching layers
- messaging: requirement involves IPC, events, queues, pub/sub, message passing
- ui: requirement involves UI components, styling, frontend, user interface
- persistence-db: requirement involves database storage, schemas, queries, migrations
- persistence-vector: requirement involves vector search, embeddings, graph queries
- persistence-fs: requirement involves file system, uploads, cloud storage (S3, etc.)
- auth: requirement involves authentication, authorization, tokens, permissions
- integration: requirement involves external APIs, third-party services
- logging: requirement involves logging, metrics, tracing, monitoring, observability
- deployment: requirement involves Docker, Kubernetes, CI/CD, cloud deployment
- error-handling: requirement involves error types, retry strategies, circuit breakers, graceful degradation
- security: requirement involves input validation, sanitization, CORS, rate limiting, secrets management

Rules:
- Always include "code-reuse"
- Include only concepts clearly relevant to the requirement
- Typically 2-4 concepts per requirement`;

/**
 * Classify which design concepts a requirement needs explored.
 * Returns at least ['code-reuse'].
 */
export async function classifyConcepts(
  requirement: RequirementTodo,
  provider: LLMProvider,
): Promise<ConceptClassification> {
  const messages: LLMMessage[] = [
    { role: 'system', content: CLASSIFY_CONCEPTS_SYSTEM },
    { role: 'user', content: requirement.statement },
  ];

  try {
    const response = await provider.complete(messages, {
      maxTokens: 300,
      temperature: 0.1,
    });

    return parseClassification(response.text);
  } catch {
    return { concepts: ['code-reuse'], reasoning: 'Classification failed — defaulting to code-reuse' };
  }
}

function parseClassification(text: string): ConceptClassification {
  let jsonStr = text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) jsonStr = fenceMatch[1]!.trim();
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) jsonStr = objMatch[0]!;

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const rawConcepts = parsed['concepts'];
    if (!Array.isArray(rawConcepts)) throw new Error('No concepts array');

    const concepts = rawConcepts
      .filter((c): c is string => typeof c === 'string' && VALID_CONCEPTS.has(c)) as DesignConcept[];

    // Ensure code-reuse is always present
    if (!concepts.includes('code-reuse')) {
      concepts.unshift('code-reuse');
    }

    return {
      concepts,
      reasoning: typeof parsed['reasoning'] === 'string' ? parsed['reasoning'] : '',
    };
  } catch {
    return { concepts: ['code-reuse'], reasoning: 'Parse failed — defaulting to code-reuse' };
  }
}

// ---------------------------------------------------------------------------
// Concept profiles — per-concept search planning + analysis prompts
// ---------------------------------------------------------------------------

interface ConceptProfile {
  searchPlanPrompt: string;
  analysisPrompt: string;
  defaultFilter: 'all' | 'code' | 'artifact';
  maxSearches: number;
}

const PROFILES: Record<DesignConcept, ConceptProfile> = {
  'code-reuse': {
    searchPlanPrompt: `Generate 3-5 search queries to find existing modules, classes, functions,
utilities, frameworks, and caching layers in the codebase that could be reused for this requirement.
Look for specific function names, class names, module paths, and third-party library usage patterns.`,
    analysisPrompt: `Identify existing modules, classes, functions, and utilities that can be reused
or extended. For each: name, file path, and how it's relevant. Also note caching patterns if applicable.`,
    defaultFilter: 'code',
    maxSearches: 5,
  },

  'messaging': {
    searchPlanPrompt: `Generate 2-3 search queries to find event systems, message queues, IPC
mechanisms, pub/sub patterns, and event emitter usage relevant to this requirement.`,
    analysisPrompt: `Identify existing messaging/IPC patterns. What event systems, queues, or
pub/sub mechanisms exist? How should this requirement integrate with them?`,
    defaultFilter: 'code',
    maxSearches: 3,
  },

  'ui': {
    searchPlanPrompt: `Generate 2-3 search queries to find UI components, styling patterns,
CSS frameworks, template systems, and frontend rendering relevant to this requirement.`,
    analysisPrompt: `Identify existing UI patterns. What component library, styling approach,
and rendering patterns are used? What can be reused for this requirement?`,
    defaultFilter: 'code',
    maxSearches: 3,
  },

  'persistence-db': {
    searchPlanPrompt: `Generate 2-4 search queries to find database schemas, tables, models,
migrations, and query patterns relevant to this requirement. Search for specific table names,
model definitions, and ORM/query builder usage that might need extension.`,
    analysisPrompt: `Analyze existing database schemas and data models. For this requirement:
- Which existing tables/models can be extended?
- What new tables/models are needed?
- What migration strategy is appropriate (additive vs breaking)?
- What query patterns exist that should be followed?`,
    defaultFilter: 'code',
    maxSearches: 4,
  },

  'persistence-vector': {
    searchPlanPrompt: `Generate 2-3 search queries to find vector store schemas, embedding usage,
graph database queries (Cypher), LanceDB tables, and search/retrieval patterns relevant to this requirement.`,
    analysisPrompt: `Analyze existing vector/graph DB usage. For this requirement:
- What existing vector tables or graph nodes/edges are relevant?
- What embedding model and dimensions are used?
- What search patterns (ANN, FTS, Cypher traversal) apply?
- Should this extend an existing store or create a new one?`,
    defaultFilter: 'code',
    maxSearches: 3,
  },

  'persistence-fs': {
    searchPlanPrompt: `Generate 2-3 search queries to find file system operations, cloud storage
usage (S3, GCS), file upload/download patterns, and path management relevant to this requirement.`,
    analysisPrompt: `Identify existing file system patterns. What file operations, storage backends,
and path conventions are used? Local vs cloud? What can be reused?`,
    defaultFilter: 'code',
    maxSearches: 3,
  },

  'auth': {
    searchPlanPrompt: `Generate 2-3 search queries to find authentication, authorization, token
management, permission checks, and session handling relevant to this requirement.`,
    analysisPrompt: `Identify existing auth patterns. What authentication method is used (JWT, session,
API key)? What authorization checks exist? How should this requirement handle permissions?`,
    defaultFilter: 'code',
    maxSearches: 3,
  },

  'integration': {
    searchPlanPrompt: `Generate 2-3 search queries to find external API clients, third-party service
integrations, HTTP clients, and API contract definitions relevant to this requirement.`,
    analysisPrompt: `Identify existing integration patterns. What external services are already
integrated? What HTTP client patterns are used? What API contracts exist?`,
    defaultFilter: 'code',
    maxSearches: 3,
  },

  'logging': {
    searchPlanPrompt: `Generate 2-3 search queries to find logging setup, metric collection,
tracing instrumentation, and monitoring patterns relevant to this requirement.`,
    analysisPrompt: `Identify existing logging/monitoring patterns. What logger is used? What metrics
are collected? What should be instrumented for this requirement?`,
    defaultFilter: 'code',
    maxSearches: 3,
  },

  'deployment': {
    searchPlanPrompt: `Generate 2-3 search queries to find Dockerfiles, docker-compose configs,
Kubernetes manifests, helm charts, CI/CD pipelines, and deployment scripts relevant to this requirement.`,
    analysisPrompt: `Identify existing deployment infrastructure. For this requirement:
- What container/orchestration changes are needed?
- What CI/CD pipeline modifications are required?
- What environment variables or secrets need adding?`,
    defaultFilter: 'artifact',
    maxSearches: 3,
  },

  'error-handling': {
    searchPlanPrompt: `Generate 2-3 search queries to find error types, error handling patterns,
retry logic, circuit breakers, and graceful degradation strategies relevant to this requirement.`,
    analysisPrompt: `Identify existing error handling patterns. What custom error types exist?
What retry/backoff strategies are in place? What error boundaries or fallback patterns apply?`,
    defaultFilter: 'code',
    maxSearches: 3,
  },

  'security': {
    searchPlanPrompt: `Generate 2-3 search queries to find input validation, sanitization,
CORS config, rate limiting, and secrets management patterns relevant to this requirement.`,
    analysisPrompt: `Identify existing security patterns. What input validation is used?
What rate limiting or abuse prevention exists? What secrets management approach is in place?`,
    defaultFilter: 'code',
    maxSearches: 3,
  },
};

// ---------------------------------------------------------------------------
// Concept-specific search planning
// ---------------------------------------------------------------------------

const CONCEPT_SEARCH_PLAN_SYSTEM = `You are generating targeted search queries for a specific design exploration area.
Given a requirement and an exploration focus, generate 2-5 search queries to find
relevant entities in an indexed codebase.

Output ONLY a JSON array — no markdown fences, no explanation:
[{"query": "specific search text", "filter": "code", "category": "label", "limit": 8}]

Rules:
- Queries should be SPECIFIC to the requirement, not generic
- Use actual names, patterns, and terms from the requirement
- filter: "code" for source entities, "artifact" for config/docs, "all" for broad
- limit should be 5-10 per query`;

/**
 * Generate requirement-specific search queries for a concept.
 */
export async function planConceptSearches(
  concept: DesignConcept,
  requirement: RequirementTodo,
  provider: LLMProvider,
): Promise<PlannedSearch[]> {
  const profile = PROFILES[concept];

  const messages: LLMMessage[] = [
    { role: 'system', content: `${CONCEPT_SEARCH_PLAN_SYSTEM}\n\n## Exploration Focus\n${profile.searchPlanPrompt}` },
    { role: 'user', content: requirement.statement },
  ];

  try {
    const response = await provider.complete(messages, {
      maxTokens: 400,
      temperature: 0.1,
    });

    const searches = parseSearchPlan(response.text, requirement.statement);
    // Apply default filter and cap
    return searches.slice(0, profile.maxSearches).map(s => ({
      ...s,
      filter: s.filter || profile.defaultFilter,
    }));
  } catch {
    return [fallbackSearch(requirement.statement)];
  }
}

// ---------------------------------------------------------------------------
// Concept exploration — search + analyze
// ---------------------------------------------------------------------------

/**
 * Run a full concept exploration: plan searches → execute → analyze results.
 */
export async function runConceptExploration(
  concept: DesignConcept,
  requirement: RequirementTodo,
  repoPath: string,
  closureRepos: string[],
  provider: LLMProvider,
): Promise<ConceptAnalysis> {
  const profile = PROFILES[concept];

  // 1. Plan concept-specific searches
  const searches = await planConceptSearches(concept, requirement, provider);

  // 2. Execute searches
  const contextProvider = createDaemonContextProvider();
  const allEntities: Entity[] = [];
  const seenIds = new Set<string>();

  const searchResults = await Promise.all(
    searches.map(s =>
      contextProvider.search(s.query, s.limit, s.filter)
        .catch(() => [] as Entity[]),
    ),
  );

  for (const entities of searchResults) {
    for (const e of entities) {
      if (!seenIds.has(e.id)) {
        seenIds.add(e.id);
        allEntities.push(e);
      }
    }
  }

  // 3. Format search results
  const resultText = allEntities.length > 0
    ? allEntities.slice(0, 10).map(e =>
        `- ${e.kind}: ${e.name} — ${e.file ?? ''}:${e.startLine ?? 0} — ${(e.signature ?? e.body.slice(0, 100))}`,
      ).join('\n')
    : '(no results found)';

  // 4. Analyze results with concept-specific prompt
  const analysisMessages: LLMMessage[] = [
    { role: 'system', content: profile.analysisPrompt },
    {
      role: 'user',
      content: [
        `## Requirement\n${requirement.statement}`,
        `## Search Results (${concept})\n${resultText}`,
      ].join('\n\n'),
    },
  ];

  let findings = '';
  try {
    const response = await provider.complete(analysisMessages, {
      maxTokens: 800,
      temperature: 0.2,
    });
    findings = response.text.trim();
  } catch {
    findings = `(analysis failed for ${concept})`;
  }

  // 5. Extract reusable entities
  const entities: ReusableEntity[] = allEntities
    .filter(e => e.repo === repoPath || closureRepos.includes(e.repo))
    .slice(0, 5)
    .map(e => ({
      entity: e.name,
      project: e.repo === repoPath ? 'local' : e.repo,
      relevance: e.signature ?? e.body.slice(0, 80),
    }));

  log.debug({ concept, searches: searches.length, entities: entities.length }, 'concept exploration');

  return { concept, findings, entities };
}
