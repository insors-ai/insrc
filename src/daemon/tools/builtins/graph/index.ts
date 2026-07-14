/**
 * Graph tools -- entity / search / callers / callees / query.
 *
 * Calls into the DuckDB storage layer directly; no legacy MCP
 * round-trip. Session.closureRepos scopes every search to the
 * active repo's dependency closure so results stay relevant.
 */

import { getDb } from '../../../../db/client.js';
import {
  searchEntities, findCallers, findCallees,
  findDefinedIn, findImports,
  closureEntities, unreachableEntities, sccEntities,
} from '../../../../db/search.js';
import { getEntity } from '../../../../db/entities.js';
import { embedQuery } from '../../../../indexer/embedder.js';
import { registerTool } from '../../registry.js';
import type { Entity, EntityKind } from '../../../../shared/types.js';
import type { RelationKind } from '../../../../db/graph/keys.js';
import type { TraversalOpts } from '../../../../db/graph/traversal.js';
import type { Tool, ToolDeps, ToolInput, ToolResult } from '../../types.js';

function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(input: ToolInput, key: string): number | undefined {
  const v = input[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function bool(input: ToolInput, key: string): boolean | undefined {
  const v = input[key];
  return typeof v === 'boolean' ? v : undefined;
}

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

function shortEntity(e: Entity): Record<string, unknown> {
  return {
    id: e.id,
    name: e.name,
    kind: e.kind,
    file: e.file,
    startLine: e.startLine,
    endLine: e.endLine,
    repo: e.repo,
    signature: e.signature,
  };
}

function renderEntity(e: Entity, includeBody: boolean): string {
  const loc = `${e.file}:${e.startLine}${e.endLine > e.startLine ? '-' + e.endLine : ''}`;
  const header = `**${e.kind}** \`${e.name}\`  (${loc})`;
  if (!includeBody) { return header + (e.signature ? `\n  \`${e.signature}\`` : ''); }
  return [
    header,
    e.signature ? `  \`${e.signature}\`` : '',
    e.body ? '```\n' + e.body.slice(0, 2000) + (e.body.length > 2000 ? '\n... (truncated)' : '') + '\n```' : '',
  ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// graph:entity -- getEntity(id)
// ---------------------------------------------------------------------------

interface GraphEntityData { entity: Entity | null }

export const graphEntityTool: Tool = {
  id: 'graph_entity',
  description: 'Fetch a single entity by ID from the code knowledge graph.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Entity ID (sha256 hex).' },
    },
    required: ['id'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const id = str(input, 'id');
    if (!id) { return fail('graph_entity', 'id required'); }
    const db = await getDb();
    const entity = await getEntity(db, id);
    const data: GraphEntityData = { entity };
    if (!entity) {
      return { output: `No entity with id \`${id}\`.`, format: 'markdown', success: false, error: 'not found', data };
    }
    return {
      output: renderEntity(entity, true),
      format: 'markdown', success: true, data,
    };
  },
};

// ---------------------------------------------------------------------------
// graph:search -- vector ANN over closure repos
// ---------------------------------------------------------------------------

interface GraphSearchData {
  query: string;
  limit: number;
  closureRepos: readonly string[];
  results: ReturnType<typeof shortEntity>[];
}

export const graphSearchTool: Tool = {
  id: 'graph_search',
  description: 'Vector similarity search over indexed code entities, scoped to the session repo closure.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number', minimum: 1, maximum: 100 },
      kind: { type: 'string', description: 'Restrict to entity kind (e.g. function, class). Currently informational only.' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
    const query = str(input, 'query');
    if (!query) { return fail('graph_search', 'query required'); }
    const limit = num(input, 'limit') ?? 10;
    const closure = [...(deps.closureRepos ?? [])];
    if (closure.length === 0) {
      return fail('graph_search', 'session has no closure repos initialized');
    }
    const db = await getDb();
    const vec = await embedQuery(query);
    if (vec.length === 0) {
      return fail('graph_search', 'failed to embed query (Ollama unavailable?)');
    }
    const hits = await searchEntities(db, vec, closure, limit);
    const data: GraphSearchData = {
      query, limit,
      closureRepos: closure,
      results: hits.map(shortEntity),
    };
    const rendered = hits.length === 0
      ? '_no matches_'
      : hits.map((e, i) => `${i + 1}. ${renderEntity(e, false)}`).join('\n\n');
    return {
      output: `**${hits.length}** hit(s) for \`${query}\` across ${closure.length} repo(s).\n\n${rendered}`,
      format: 'markdown', success: true, data,
    };
  },
};

// ---------------------------------------------------------------------------
// graph_callers / graph_callees
// ---------------------------------------------------------------------------

interface GraphNeighborsData {
  entityId: string;
  direction: 'callers' | 'callees';
  results: ReturnType<typeof shortEntity>[];
}

function buildNeighborsTool(direction: 'callers' | 'callees'): Tool {
  const id = `graph_${direction}`;
  const label = direction === 'callers' ? 'Entities that call' : 'Entities called by';
  const fn = direction === 'callers' ? findCallers : findCallees;
  return {
    id,
    description: `${label} a given entity (1-hop).`,
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        fullBody: { type: 'boolean', description: 'Include full body text in output (default false -- signatures only).' },
      },
      required: ['entityId'],
      additionalProperties: false,
    },
    requiresApproval: false,

    async execute(input: ToolInput): Promise<ToolResult> {
      const entityId = str(input, 'entityId');
      if (!entityId) { return fail(id, 'entityId required'); }
      const includeBody = bool(input, 'fullBody') === true;
      const db = await getDb();
      const results = await fn(db, entityId);
      const data: GraphNeighborsData = { entityId, direction, results: results.map(shortEntity) };
      const rendered = results.length === 0
        ? '_none_'
        : results.map(e => renderEntity(e, includeBody)).join('\n\n');
      return {
        output: `**${results.length}** ${direction} of \`${entityId}\`.\n\n${rendered}`,
        format: 'markdown', success: true, data,
      };
    },
  };
}

export const graphCallersTool = buildNeighborsTool('callers');
export const graphCalleesTool = buildNeighborsTool('callees');

// ---------------------------------------------------------------------------
// graph_query -- typed code-knowledge-graph queries.
//
// Replaces the prior `graph_sql` (raw DuckDB SQL) with a discriminated
// `op` API that maps directly onto the LMDB graph layer's typed JS
// surface. CLAUDE.md: "No Cypher / GQL / SQL exposed for graph
// traversal -- internal callers and the LLM-facing graph_query tool
// both go through the typed API."
//
// Ops:
//   defined_in   -- entities defined in a file (DEFINES out from a file entity)
//   imports      -- files/modules a file imports (IMPORTS out)
//   closure      -- transitive closure of edges from one or more roots
//   unreachable  -- entities NOT in closure of roots (dead-code precondition)
//   scc          -- strongly connected components reachable from roots
//
// Caps:
//   limit:    ≤ 500 rows in the rendered output (full count returned in `total`)
//   maxDepth: ≤ 20 hops on the underlying BFS
// ---------------------------------------------------------------------------

const MAX_QUERY_ROWS = 500;
const MAX_DEPTH      = 20;

const RELATION_KINDS: ReadonlySet<RelationKind> = new Set<RelationKind>([
  'DEFINES', 'IMPORTS', 'CALLS', 'INHERITS', 'IMPLEMENTS',
  'DEPENDS_ON', 'EXPORTS', 'REFERENCES', 'CONTAINS', 'STEP_DEPENDS_ON',
  'READS', 'WRITES',
]);
const ENTITY_KINDS: ReadonlySet<EntityKind> = new Set([
  'repo', 'file', 'module', 'function', 'method',
  'class', 'interface', 'type', 'variable',
  'document', 'section', 'config',
]);

type GraphQueryOp = 'defined_in' | 'imports' | 'closure' | 'unreachable' | 'scc';

interface GraphQueryData {
  op:           GraphQueryOp;
  total:        number;
  entities?:    ReturnType<typeof shortEntity>[];
  components?:  ReturnType<typeof shortEntity>[][];
}

function strArr(input: ToolInput, key: string): string[] | undefined {
  const v = input[key];
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && x.length > 0) out.push(x);
  }
  return out.length > 0 ? out : undefined;
}

function clampDepth(input: ToolInput): number | undefined {
  const v = num(input, 'maxDepth');
  if (v === undefined) return undefined;
  if (v < 0) return 0;
  return Math.min(v, MAX_DEPTH);
}

function clampLimit(input: ToolInput): number {
  const v = num(input, 'limit');
  if (v === undefined) return MAX_QUERY_ROWS;
  if (v <= 0) return MAX_QUERY_ROWS;
  return Math.min(v, MAX_QUERY_ROWS);
}

function parseRelationKinds(input: ToolInput): RelationKind[] | undefined {
  const arr = strArr(input, 'kindFilter');
  if (arr === undefined) return undefined;
  const out: RelationKind[] = [];
  for (const k of arr) {
    if (RELATION_KINDS.has(k as RelationKind)) out.push(k as RelationKind);
  }
  return out.length > 0 ? out : undefined;
}

function parseEntityKinds(input: ToolInput): EntityKind[] | undefined {
  const arr = strArr(input, 'candidateKinds');
  if (arr === undefined) return undefined;
  const out: EntityKind[] = [];
  for (const k of arr) {
    if (ENTITY_KINDS.has(k as EntityKind)) out.push(k as EntityKind);
  }
  return out.length > 0 ? out : undefined;
}

function parseDirection(input: ToolInput): 'in' | 'out' | undefined {
  const d = str(input, 'direction');
  return d === 'in' || d === 'out' ? d : undefined;
}

function renderEntitiesBlock(label: string, entities: readonly Entity[], total: number, limit: number): string {
  const cappedNote = total > limit ? ` (showing first ${limit})` : '';
  const head = `**${total}** ${label}${cappedNote}.`;
  const body = entities.length === 0
    ? '_none_'
    : entities.slice(0, limit).map(e => renderEntity(e, false)).join('\n\n');
  return `${head}\n\n${body}`;
}

export const graphQueryTool: Tool = {
  id: 'graph_query',
  description:
    'Typed query over the code knowledge graph (no SQL). Specify `op` to choose the operation: ' +
    '`defined_in` (entities a file defines, DEFINES out), `imports` (files/modules a file imports, IMPORTS out), ' +
    '`closure` (BFS-reachable entities from roots), `unreachable` (entities not reachable from roots, dead-code precondition), ' +
    '`scc` (strongly connected components reachable from roots). ' +
    'Relation kinds available for kindFilter: DEFINES | IMPORTS | CALLS | INHERITS | IMPLEMENTS | DEPENDS_ON | EXPORTS | REFERENCES | CONTAINS | READS | WRITES | STEP_DEPENDS_ON. ' +
    'Entity kinds for candidateKinds: repo | file | module | function | method | class | interface | type | variable | document | section | config. ' +
    'Direction is `out` (default) or `in`. maxDepth caps at 20; limit caps at 500.',
  inputSchema: {
    type: 'object',
    properties: {
      op:             { type: 'string', enum: ['defined_in', 'imports', 'closure', 'unreachable', 'scc'] },
      fileEntityId:   { type: 'string', description: 'Required for `defined_in` / `imports`.' },
      roots:          { type: 'array',  items: { type: 'string' }, description: 'Required for `closure` / `unreachable` / `scc`.' },
      kindFilter:     { type: 'array',  items: { type: 'string' }, description: 'Restrict relation kinds traversed.' },
      candidateKinds: { type: 'array',  items: { type: 'string' }, description: 'Required for `unreachable`: entity kinds to consider.' },
      direction:      { type: 'string', enum: ['in', 'out'] },
      maxDepth:       { type: 'number', minimum: 0, maximum: MAX_DEPTH },
      limit:          { type: 'number', minimum: 1, maximum: MAX_QUERY_ROWS },
    },
    required: ['op'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const op = str(input, 'op');
    if (op === undefined) return fail('graph_query', 'op required');

    const db = await getDb();
    const limit = clampLimit(input);
    const direction = parseDirection(input);
    const kindFilter = parseRelationKinds(input);
    const maxDepth = clampDepth(input);

    const opts: TraversalOpts = {};
    if (kindFilter !== undefined) opts.kindFilter = kindFilter;
    if (direction  !== undefined) opts.direction  = direction;
    if (maxDepth   !== undefined) opts.maxDepth   = maxDepth;

    try {
      switch (op) {
        case 'defined_in': {
          const fileId = str(input, 'fileEntityId');
          if (!fileId) return fail('graph_query', 'fileEntityId required for op=defined_in');
          const entities = await findDefinedIn(db, fileId);
          const data: GraphQueryData = {
            op: 'defined_in', total: entities.length,
            entities: entities.slice(0, limit).map(shortEntity),
          };
          return {
            output: renderEntitiesBlock(`entit${entities.length === 1 ? 'y' : 'ies'} defined in \`${fileId}\``, entities, entities.length, limit),
            format: 'markdown', success: true, data,
          };
        }

        case 'imports': {
          const fileId = str(input, 'fileEntityId');
          if (!fileId) return fail('graph_query', 'fileEntityId required for op=imports');
          const entities = await findImports(db, fileId);
          const data: GraphQueryData = {
            op: 'imports', total: entities.length,
            entities: entities.slice(0, limit).map(shortEntity),
          };
          return {
            output: renderEntitiesBlock(`import${entities.length === 1 ? '' : 's'} from \`${fileId}\``, entities, entities.length, limit),
            format: 'markdown', success: true, data,
          };
        }

        case 'closure': {
          const roots = strArr(input, 'roots');
          if (roots === undefined) return fail('graph_query', 'roots required for op=closure');
          const entities = await closureEntities(db, roots, opts);
          const data: GraphQueryData = {
            op: 'closure', total: entities.length,
            entities: entities.slice(0, limit).map(shortEntity),
          };
          return {
            output: renderEntitiesBlock(`entit${entities.length === 1 ? 'y' : 'ies'} reachable from ${roots.length} root(s)`, entities, entities.length, limit),
            format: 'markdown', success: true, data,
          };
        }

        case 'unreachable': {
          const roots = strArr(input, 'roots') ?? [];
          const candidateKinds = parseEntityKinds(input);
          if (candidateKinds === undefined) return fail('graph_query', 'candidateKinds required for op=unreachable');
          const entities = await unreachableEntities(db, roots, candidateKinds, opts);
          const data: GraphQueryData = {
            op: 'unreachable', total: entities.length,
            entities: entities.slice(0, limit).map(shortEntity),
          };
          return {
            output: renderEntitiesBlock(`entit${entities.length === 1 ? 'y' : 'ies'} unreachable from ${roots.length} root(s) (kinds: ${candidateKinds.join(', ')})`, entities, entities.length, limit),
            format: 'markdown', success: true, data,
          };
        }

        case 'scc': {
          const roots = strArr(input, 'roots');
          if (roots === undefined) return fail('graph_query', 'roots required for op=scc');
          const components = await sccEntities(db, roots, opts);
          // Cap by component count, not by total entity count, so each
          // component stays internally complete.
          const cappedComponents = components.slice(0, limit);
          const data: GraphQueryData = {
            op: 'scc', total: components.length,
            components: cappedComponents.map(c => c.map(shortEntity)),
          };
          const cappedNote = components.length > limit ? ` (showing first ${limit})` : '';
          const lines: string[] = [`**${components.length}** component(s)${cappedNote}.`];
          if (cappedComponents.length === 0) {
            lines.push('_none_');
          } else {
            cappedComponents.forEach((comp, i) => {
              lines.push(`\n**Component ${i + 1}** (${comp.length} entit${comp.length === 1 ? 'y' : 'ies'}):`);
              for (const e of comp) lines.push(renderEntity(e, false));
            });
          }
          return {
            output: lines.join('\n'),
            format: 'markdown', success: true, data,
          };
        }

        default:
          return fail('graph_query', `unknown op: ${op}`);
      }
    } catch (err: unknown) {
      return fail('graph_query', `query failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerGraphTools(): void {
  registerTool(graphEntityTool);
  registerTool(graphSearchTool);
  registerTool(graphCallersTool);
  registerTool(graphCalleesTool);
  registerTool(graphQueryTool);
}
