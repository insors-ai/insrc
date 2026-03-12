import type { LLMProvider, LLMMessage } from '../../shared/types.js';
import { getLogger, toLogFn } from '../../shared/logger.js';
import { mcpCall } from '../tools/mcp-client.js';
import {
  createSearchProvider, formatSearchResults,
  type SearchProvider, type SearchResult,
} from '../search/provider.js';

// ---------------------------------------------------------------------------
// Research Pipeline — graph + web + combined sources
//
// From design doc (Phase 9):
//   - Source selection: graph-only, web-only, or both
//   - Graph research: local model narrates entities and relations
//   - Web research: local model generates 1-3 queries, synthesises results
//   - Combined: graph query + web search, local model synthesises both
//   - Escalation to Claude: cross-repo, @claude prefix, low confidence
// ---------------------------------------------------------------------------

export interface ResearchResult {
  /** The research answer */
  answer: string;
  /** Source type used */
  source: 'graph' | 'web' | 'combined';
  /** Search queries used (for web research) */
  searchQueries: string[];
  /** Web search results (for citation) */
  webResults: SearchResult[];
  /** Whether Claude was used for escalation */
  escalated: boolean;
}

// ---------------------------------------------------------------------------
// Source selection
// ---------------------------------------------------------------------------

export type ResearchSource = 'graph' | 'web' | 'combined';

/**
 * Determine the research source based on the question.
 * Uses keyword heuristics — no LLM needed for this step.
 */
export function selectResearchSource(message: string): ResearchSource {
  const lower = message.toLowerCase();

  // Web-only signals
  const webSignals = [
    'documentation', 'changelog', 'release notes', 'known issue', 'bug in',
    'how to use', 'example of', 'best practice', 'tutorial',
    'what changed in', 'version', 'npm', 'pip', 'crate',
    'library', 'framework', 'package',
  ];
  const hasWebSignal = webSignals.some(s => lower.includes(s));

  // Graph-only signals
  const graphSignals = [
    'who calls', 'what calls', 'callers of', 'callees of',
    'what does', 'call', 'depends on', 'dependency',
    'show me the', 'find the', 'this function', 'this class',
    'this method', 'how does this', 'explain this',
    'in this repo', 'in the codebase', 'in our code',
  ];
  const hasGraphSignal = graphSignals.some(s => lower.includes(s));

  // Combined signals — mentions external + codebase
  const combinedSignals = [
    'integrate', 'add .* to', 'how .* works with',
    'compare .* with', 'migrate',
  ];
  const hasCombinedSignal = combinedSignals.some(s => new RegExp(s).test(lower));

  if (hasCombinedSignal) return 'combined';
  if (hasWebSignal && !hasGraphSignal) return 'web';
  if (hasGraphSignal && !hasWebSignal) return 'graph';

  // If both or neither, default to combined (safest)
  if (hasWebSignal && hasGraphSignal) return 'combined';

  // Default: graph (most research about own codebase)
  return 'graph';
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const QUERY_GEN_SYSTEM = `You are a search query generator. Given a user's research question, produce 1-3 targeted web search queries.

Rules:
- Output ONLY the queries, one per line
- Make queries specific and targeted
- Include version numbers if mentioned
- No numbering, no bullets, no explanation`;

const GRAPH_NARRATE_SYSTEM = `You are a software engineer explaining code structure. Given entity bodies and their relationships from the knowledge graph, produce a clear explanation.

Rules:
- Reference specific entity names and file locations
- Describe relationships (calls, imports, inherits)
- Be concise but thorough
- Include relevant code snippets from the entities provided`;

const WEB_SYNTHESISE_SYSTEM = `You are a research synthesiser. Given web search results about a programming topic, produce a concise, accurate answer grounded in the search findings.

Rules:
- Cite sources inline using [N] notation matching result numbers
- Be specific — include code examples from results when relevant
- If results are conflicting, note the discrepancy
- Focus on answering the user's specific question`;

const COMBINED_SYSTEM = `You are a software engineer answering a question that requires both codebase knowledge and external information. You've been given:
1. Graph data — entities and relationships from the local codebase
2. Web results — documentation and examples from the web

Synthesise both into a unified answer that explains how external concepts map onto the existing codebase structure.

Rules:
- Reference specific entity names from the graph data
- Cite web sources using [N] notation
- Be specific about integration points`;

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

/**
 * Run the research pipeline.
 *
 * @param userMessage - The user's research question
 * @param codeContext - Assembled code context from L4
 * @param localProvider - Local LLM for narration and synthesis
 * @param claudeProvider - Claude for escalation (null = skip)
 * @param braveApiKey - Brave API key (undefined = use Claude fallback for web)
 * @param log - Logger function
 */
/**
 * Check whether research should escalate to Claude.
 *
 * Escalation triggers (from design doc):
 *   - @claude prefix (handled by caller — explicit provider)
 *   - Question spans more than 2 repos
 *   - Local model signals low confidence (detected post-synthesis)
 */
export function shouldEscalateResearch(
  message: string,
  closureRepos: string[],
  forceEscalate: boolean,
): boolean {
  if (forceEscalate) return true;
  if (closureRepos.length > 2) return true;
  return false;
}

export async function runResearchPipeline(
  userMessage: string,
  codeContext: string,
  localProvider: LLMProvider,
  claudeProvider: LLMProvider | null,
  braveApiKey: string | undefined,
  log: (msg: string) => void = toLogFn(getLogger('research')),
  closureRepos: string[] = [],
  forceEscalate = false,
): Promise<ResearchResult> {
  const source = selectResearchSource(userMessage);
  const escalate = shouldEscalateResearch(userMessage, closureRepos, forceEscalate);
  log(`  [research] Source: ${source}${escalate ? ' (escalated to Claude)' : ''}`);

  // If escalated, use Claude as the synthesis provider instead of local
  const synthesisProvider = (escalate && claudeProvider) ? claudeProvider : localProvider;

  switch (source) {
    case 'graph':
      return runGraphResearch(userMessage, codeContext, synthesisProvider, log, escalate);
    case 'web':
      return runWebResearch(userMessage, synthesisProvider, claudeProvider, braveApiKey, log, escalate);
    case 'combined':
      return runCombinedResearch(userMessage, codeContext, synthesisProvider, claudeProvider, braveApiKey, log, escalate);
  }
}

// ---------------------------------------------------------------------------
// Graph research — local model narrates entities
// ---------------------------------------------------------------------------

async function runGraphResearch(
  message: string,
  codeContext: string,
  synthesisProvider: LLMProvider,
  log: (msg: string) => void,
  escalated = false,
): Promise<ResearchResult> {
  log('  [research] Querying graph...');

  // Search graph for relevant entities
  const searchResult = await mcpCall('graph_search', { query: message, limit: 5 });
  const graphData = searchResult.isError ? '' : searchResult.content;

  // Local model narrates
  const contextParts: string[] = [];
  if (graphData) contextParts.push(`Graph entities:\n${graphData}`);
  if (codeContext) contextParts.push(`Code context:\n${codeContext}`);

  const messages: LLMMessage[] = [
    { role: 'system', content: GRAPH_NARRATE_SYSTEM },
    { role: 'user', content: `${contextParts.join('\n\n')}\n\nQuestion: ${message}` },
  ];

  const response = await synthesisProvider.complete(messages, {
    maxTokens: 2000,
    temperature: 0.2,
  });

  return {
    answer: response.text,
    source: 'graph',
    searchQueries: [],
    webResults: [],
    escalated,
  };
}

// ---------------------------------------------------------------------------
// Web research — search + synthesise
// ---------------------------------------------------------------------------

async function runWebResearch(
  message: string,
  synthesisProvider: LLMProvider,
  claudeProvider: LLMProvider | null,
  braveApiKey: string | undefined,
  log: (msg: string) => void,
  escalated = false,
): Promise<ResearchResult> {
  // Step 1: Generate search queries
  log('  [research] Generating search queries...');
  const queryMessages: LLMMessage[] = [
    { role: 'system', content: QUERY_GEN_SYSTEM },
    { role: 'user', content: message },
  ];

  const queryResponse = await synthesisProvider.complete(queryMessages, {
    maxTokens: 200,
    temperature: 0.3,
  });

  const searchQueries = queryResponse.text
    .split('\n')
    .map(q => q.trim())
    .filter(q => q.length > 0)
    .slice(0, 3);

  if (searchQueries.length === 0) {
    searchQueries.push(message); // fallback: use the question itself
  }

  log(`  [research] ${searchQueries.length} search queries generated`);

  // Step 2: Execute searches
  const searchProvider = createSearchProvider(braveApiKey, claudeProvider);
  if (!searchProvider) {
    return {
      answer: 'Web search unavailable: no Brave API key and no Claude provider configured.',
      source: 'web',
      searchQueries,
      webResults: [],
      escalated: false,
    };
  }

  log(`  [research] Searching via ${searchProvider.name}...`);
  const allResults: SearchResult[] = [];
  for (const query of searchQueries) {
    try {
      const results = await searchProvider.search(query, 3);
      allResults.push(...results);
    } catch (err) {
      log(`  [research] Search error: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const uniqueResults = allResults.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  if (uniqueResults.length === 0) {
    return {
      answer: 'No web search results found for this query.',
      source: 'web',
      searchQueries,
      webResults: [],
      escalated: false,
    };
  }

  log(`  [research] ${uniqueResults.length} unique results found`);

  // Step 3: Synthesise results
  const formattedResults = formatSearchResults(uniqueResults);
  const synthMessages: LLMMessage[] = [
    { role: 'system', content: WEB_SYNTHESISE_SYSTEM },
    { role: 'user', content: `Search results:\n${formattedResults}\n\nQuestion: ${message}` },
  ];

  const synthResponse = await synthesisProvider.complete(synthMessages, {
    maxTokens: 2000,
    temperature: 0.2,
  });

  return {
    answer: synthResponse.text,
    source: 'web',
    searchQueries,
    webResults: uniqueResults,
    escalated,
  };
}

// ---------------------------------------------------------------------------
// Combined research — graph + web
// ---------------------------------------------------------------------------

async function runCombinedResearch(
  message: string,
  codeContext: string,
  synthesisProvider: LLMProvider,
  claudeProvider: LLMProvider | null,
  braveApiKey: string | undefined,
  log: (msg: string) => void,
  escalated = false,
): Promise<ResearchResult> {
  log('  [research] Running combined graph + web research...');

  // Run graph and web in parallel
  const [graphResult, webResult] = await Promise.all([
    runGraphResearch(message, codeContext, synthesisProvider, log, escalated),
    runWebResearch(message, synthesisProvider, claudeProvider, braveApiKey, log, escalated),
  ]);

  // Synthesise both
  const combinedMessages: LLMMessage[] = [
    { role: 'system', content: COMBINED_SYSTEM },
    {
      role: 'user',
      content: [
        `Graph analysis:\n${graphResult.answer}`,
        webResult.webResults.length > 0
          ? `Web research:\n${webResult.answer}`
          : '',
        `\nQuestion: ${message}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];

  const combinedResponse = await synthesisProvider.complete(combinedMessages, {
    maxTokens: 2500,
    temperature: 0.2,
  });

  return {
    answer: combinedResponse.text,
    source: 'combined',
    searchQueries: webResult.searchQueries,
    webResults: webResult.webResults,
    escalated,
  };
}
