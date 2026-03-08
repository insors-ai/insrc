import { mcpCall } from '../tools/mcp-client.js';

// ---------------------------------------------------------------------------
// Graph Handler — zero LLM, pure structural queries
//
// From design doc (Phase 9):
//   - Pattern-match user message to query type using regex + keyword rules
//   - Execute graph_* MCP tool calls directly (no LLM at any stage)
//   - Format result as table or tree and return to user
//   - Re-route to research for interpretive questions
// ---------------------------------------------------------------------------

export interface GraphResult {
  /** Formatted response text for the user */
  response: string;
  /** Whether the query was handled (false = should re-route to research) */
  handled: boolean;
  /** The query type that was matched */
  queryType: GraphQueryType;
  /** Raw data from graph query (for context tracking) */
  rawData: unknown;
}

export type GraphQueryType =
  | 'callers'     // "who calls X" / "what calls X"
  | 'callees'     // "what does X call" / "callees of X"
  | 'depends_on'  // "what depends on X" / "dependencies of X"
  | 'search'      // "find X" / "search for X"
  | 'entity'      // "show X" / "what is X"
  | 'query'       // "graph query ..." (raw Cypher)
  | 'interpretive' // questions needing LLM (re-route to research)
  | 'unknown';

// ---------------------------------------------------------------------------
// Query type classification (regex + keyword rules, no LLM)
// ---------------------------------------------------------------------------

interface QueryMatch {
  type: GraphQueryType;
  entityName: string;
  hops: number;
}

/**
 * Classify a user message into a graph query type.
 * Uses regex pattern matching — no LLM involved.
 */
export function classifyGraphQuery(message: string): QueryMatch {
  const msg = message.trim();
  const lower = msg.toLowerCase();

  // Interpretive questions — re-route to research
  if (/^why\s+/i.test(msg) || /^how\s+should/i.test(msg) || /^is\s+(this|that|it)\s+/i.test(msg)) {
    return { type: 'interpretive', entityName: '', hops: 0 };
  }
  if (/\b(explain|reason|purpose|intentional|good idea|best practice)\b/i.test(msg)) {
    return { type: 'interpretive', entityName: '', hops: 0 };
  }

  // Raw Cypher query
  if (/^(?:graph\s+)?query\s+/i.test(msg) || /^MATCH\s+/i.test(msg)) {
    const cypher = msg.replace(/^(?:graph\s+)?query\s+/i, '').trim();
    return { type: 'query', entityName: cypher, hops: 0 };
  }

  // "who/what calls X" → callers
  const callerMatch = msg.match(/(?:who|what)\s+calls?\s+(.+?)(?:\s*\?)?$/i)
    ?? msg.match(/callers?\s+(?:of\s+)?(.+?)(?:\s*\?)?$/i);
  if (callerMatch) {
    const entity = callerMatch[1]!.trim().replace(/^['"`]|['"`]$/g, '');
    return { type: 'callers', entityName: entity, hops: 2 };
  }

  // "what depends on X" → callers with more hops
  const dependsMatch = msg.match(/(?:what|who)\s+depends\s+on\s+(.+?)(?:\s*\?)?$/i)
    ?? msg.match(/dependenc(?:ies|y)\s+(?:of\s+)?(.+?)(?:\s*\?)?$/i)
    ?? msg.match(/dependents?\s+(?:of\s+)?(.+?)(?:\s*\?)?$/i);
  if (dependsMatch) {
    const entity = dependsMatch[1]!.trim().replace(/^['"`]|['"`]$/g, '');
    return { type: 'depends_on', entityName: entity, hops: 5 };
  }

  // "what does X call" → callees
  const calleeMatch = msg.match(/what\s+does\s+(.+?)\s+call(?:\s*\?)?$/i)
    ?? msg.match(/callees?\s+(?:of\s+)?(.+?)(?:\s*\?)?$/i);
  if (calleeMatch) {
    const entity = calleeMatch[1]!.trim().replace(/^['"`]|['"`]$/g, '');
    return { type: 'callees', entityName: entity, hops: 1 };
  }

  // "show X" / "what is X" → entity lookup
  const entityMatch = msg.match(/^show\s+(.+?)(?:\s*\?)?$/i)
    ?? msg.match(/^what\s+is\s+(.+?)(?:\s*\?)?$/i)
    ?? msg.match(/^describe\s+(.+?)(?:\s*\?)?$/i);
  if (entityMatch) {
    const entity = entityMatch[1]!.trim().replace(/^['"`]|['"`]$/g, '');
    return { type: 'entity', entityName: entity, hops: 0 };
  }

  // "find X" / "search for X" → vector search
  const searchMatch = msg.match(/^(?:find|search(?:\s+for)?|look\s+(?:up|for))\s+(.+?)(?:\s*\?)?$/i);
  if (searchMatch) {
    const entity = searchMatch[1]!.trim().replace(/^['"`]|['"`]$/g, '');
    return { type: 'search', entityName: entity, hops: 0 };
  }

  // Fallback: if it mentions specific entity-like names (Foo.bar, FooService),
  // treat as entity search
  if (/[A-Z]\w+\.\w+/.test(msg) || /[A-Z]\w+(?:Service|Controller|Handler|Manager|Provider)/.test(msg)) {
    // Extract the entity-like name
    const nameMatch = msg.match(/([A-Z]\w+(?:\.\w+)?)/);
    if (nameMatch) {
      return { type: 'search', entityName: nameMatch[1]!, hops: 0 };
    }
  }

  return { type: 'unknown', entityName: msg, hops: 0 };
}

// ---------------------------------------------------------------------------
// Graph query execution
// ---------------------------------------------------------------------------

/**
 * Execute a graph query and return formatted results.
 * No LLM is used at any stage.
 */
export async function runGraphQuery(message: string): Promise<GraphResult> {
  const match = classifyGraphQuery(message);

  // Interpretive questions → re-route to research
  if (match.type === 'interpretive') {
    return {
      response: '',
      handled: false,
      queryType: 'interpretive',
      rawData: null,
    };
  }

  // Unknown → try search as fallback
  if (match.type === 'unknown') {
    return executeSearch(match.entityName);
  }

  switch (match.type) {
    case 'callers':
    case 'depends_on':
      return executeCallers(match.entityName, match.hops);
    case 'callees':
      return executeCallees(match.entityName);
    case 'search':
      return executeSearch(match.entityName);
    case 'entity':
      return executeEntityLookup(match.entityName);
    case 'query':
      return executeCypherQuery(match.entityName);
    default:
      return {
        response: 'Could not determine graph query type.',
        handled: false,
        queryType: match.type,
        rawData: null,
      };
  }
}

// ---------------------------------------------------------------------------
// Query executors
// ---------------------------------------------------------------------------

async function executeCallers(entityName: string, hops: number): Promise<GraphResult> {
  // First, search for the entity to get its ID
  const entityResult = await mcpCall('graph_search', { query: entityName, limit: 1 });
  if (entityResult.isError) {
    return {
      response: `Graph error: ${entityResult.content}`,
      handled: true,
      queryType: 'callers',
      rawData: null,
    };
  }

  const entities = parseEntities(entityResult.content);
  if (entities.length === 0) {
    return {
      response: `No entity found matching "${entityName}".`,
      handled: true,
      queryType: 'callers',
      rawData: null,
    };
  }

  const entity = entities[0]!;
  const callersResult = await mcpCall('graph_callers', { entityId: entity.id, hops });
  if (callersResult.isError) {
    return {
      response: `Graph error: ${callersResult.content}`,
      handled: true,
      queryType: 'callers',
      rawData: null,
    };
  }

  const callers = parseEntities(callersResult.content);
  if (callers.length === 0) {
    return {
      response: `No callers found for "${entity.name}".`,
      handled: true,
      queryType: 'callers',
      rawData: callers,
    };
  }

  const formatted = formatEntityTable(callers, `Callers of ${entity.name} (${hops}-hop)`);
  return {
    response: formatted,
    handled: true,
    queryType: 'callers',
    rawData: callers,
  };
}

async function executeCallees(entityName: string): Promise<GraphResult> {
  const entityResult = await mcpCall('graph_search', { query: entityName, limit: 1 });
  if (entityResult.isError) {
    return { response: `Graph error: ${entityResult.content}`, handled: true, queryType: 'callees', rawData: null };
  }

  const entities = parseEntities(entityResult.content);
  if (entities.length === 0) {
    return { response: `No entity found matching "${entityName}".`, handled: true, queryType: 'callees', rawData: null };
  }

  const entity = entities[0]!;
  const calleesResult = await mcpCall('graph_callees', { entityId: entity.id });
  if (calleesResult.isError) {
    return { response: `Graph error: ${calleesResult.content}`, handled: true, queryType: 'callees', rawData: null };
  }

  const callees = parseEntities(calleesResult.content);
  if (callees.length === 0) {
    return { response: `No callees found for "${entity.name}".`, handled: true, queryType: 'callees', rawData: callees };
  }

  const formatted = formatEntityTable(callees, `Callees of ${entity.name}`);
  return { response: formatted, handled: true, queryType: 'callees', rawData: callees };
}

async function executeSearch(query: string): Promise<GraphResult> {
  const result = await mcpCall('graph_search', { query, limit: 10 });
  if (result.isError) {
    return { response: `Graph error: ${result.content}`, handled: true, queryType: 'search', rawData: null };
  }

  const entities = parseEntities(result.content);
  if (entities.length === 0) {
    return { response: `No entities found matching "${query}".`, handled: true, queryType: 'search', rawData: null };
  }

  const formatted = formatEntityTable(entities, `Search results for "${query}"`);
  return { response: formatted, handled: true, queryType: 'search', rawData: entities };
}

async function executeEntityLookup(entityName: string): Promise<GraphResult> {
  const searchResult = await mcpCall('graph_search', { query: entityName, limit: 1 });
  if (searchResult.isError) {
    return { response: `Graph error: ${searchResult.content}`, handled: true, queryType: 'entity', rawData: null };
  }

  const entities = parseEntities(searchResult.content);
  if (entities.length === 0) {
    return { response: `No entity found matching "${entityName}".`, handled: true, queryType: 'entity', rawData: null };
  }

  const entity = entities[0]!;
  const formatted = formatEntityDetail(entity);
  return { response: formatted, handled: true, queryType: 'entity', rawData: entity };
}

async function executeCypherQuery(cypher: string): Promise<GraphResult> {
  const result = await mcpCall('graph_query', { cypher });
  if (result.isError) {
    return { response: `Graph error: ${result.content}`, handled: true, queryType: 'query', rawData: null };
  }

  return {
    response: `Query results:\n${result.content}`,
    handled: true,
    queryType: 'query',
    rawData: result.content,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

interface ParsedEntity {
  id: string;
  name: string;
  kind: string;
  file: string;
  startLine: number;
  endLine: number;
  signature?: string;
  body?: string;
}

function parseEntities(content: string): ParsedEntity[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed as ParsedEntity[];
    if (parsed && typeof parsed === 'object' && 'id' in parsed) return [parsed as ParsedEntity];
    return [];
  } catch {
    return [];
  }
}

function formatEntityTable(entities: ParsedEntity[], title: string): string {
  const lines: string[] = [title, '─'.repeat(Math.min(title.length + 10, 70))];

  for (const e of entities) {
    const loc = e.file ? `${shortenPath(e.file)}:${e.startLine}` : '';
    const sig = e.signature ? `  ${e.signature}` : '';
    lines.push(`  ${e.name}  ${e.kind}  ${loc}${sig}`);
  }

  lines.push(`\n${entities.length} result(s)`);
  return lines.join('\n');
}

function formatEntityDetail(entity: ParsedEntity): string {
  const lines: string[] = [
    `${entity.name} (${entity.kind})`,
    '─'.repeat(40),
    `  File: ${entity.file ?? 'unknown'}`,
    `  Lines: ${entity.startLine ?? '?'}–${entity.endLine ?? '?'}`,
  ];

  if (entity.signature) {
    lines.push(`  Signature: ${entity.signature}`);
  }

  if (entity.body) {
    lines.push('', 'Body:', entity.body);
  }

  return lines.join('\n');
}

function shortenPath(filePath: string): string {
  // Show last 3 path segments
  const parts = filePath.split('/');
  if (parts.length <= 3) return filePath;
  return '.../' + parts.slice(-3).join('/');
}
