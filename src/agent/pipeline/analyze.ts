import type { LLMMessage, LLMProvider, ModelContextConfig } from '../../shared/types.js';
import type { AnalysisResult, ChunkSummary, ContextProvider, InputElement, OutputFormat, PipelineLogger } from './types.js';
import { chunkText, countTokens, needsChunking } from './chunker.js';
import { fetchAnalyzeContext } from './context-fetch.js';

// ---------------------------------------------------------------------------
// Stage 1: Analyze — understand and chunk the input
//
// - Estimate token count of user input + context
// - If input > context window, chunk into overlapping segments
// - Run a fast local LLM pass on each chunk to extract requirements
// - Merge chunk analyses into a single AnalysisResult
// ---------------------------------------------------------------------------

const ANALYZE_SYSTEM = `You are an input analyzer. Given a user request (possibly with attached file content and code context), decompose it into discrete, actionable elements.

Your primary job is to produce a structured breakdown of what needs to be built or done. The input may take several forms — handle each:

1. DETAILED REQUIREMENTS — The user provides a numbered/structured list of what they want.
   → Preserve each item as an element with its FULL original detail intact.

2. REFERENCE + SHORT PROMPT — The user provides a reference document (e.g. an existing design) and asks to create something similar for a different target.
   → Analyze the reference document's structure (sections, patterns, depth).
   → Generate elements for the NEW target, using the reference as a template.
   → Each element should describe what to produce for the target, informed by the corresponding part of the reference.

3. BRIEF PROMPT ONLY — The user gives a short request with no detailed structure.
   → Infer the logical breakdown based on the task type and domain knowledge.
   → Generate elements covering the expected scope.

Output a JSON object with these fields:
- "elements": array of objects, each with:
  - "title": short label (section title, file path, feature name)
  - "content": detailed description of what this element should contain or produce. For case 1, preserve the user's original text. For cases 2 and 3, write specific, actionable content describing tables, code blocks, examples, and sub-sections to include.
  - "kind": one of "section", "module", "file", "feature", "requirement", "task"
  - "dependsOn": optional array of element indices this depends on
- "referencedEntities": array of file paths, function names, class names mentioned
- "outputFormat": one of "markdown", "html", "diff", "code", "json", "text" — the expected output format
- "scope": "small" (1-2 elements), "medium" (3-8 elements), or "large" (8+ elements)
- "summary": a condensed 2-3 paragraph summary of what the user wants

IMPORTANT: Each element's content must be detailed enough that someone could execute it independently without seeing the original request. Do not produce vague one-liners — specify exactly what tables, code blocks, diagrams, and sub-sections each element should include.

Output ONLY the JSON object, no other text.`;

const CHUNK_ANALYZE_SYSTEM = `You are analyzing a chunk of a larger input. Extract key information from this chunk.

Output a JSON object with:
- "summary": condensed summary of this chunk's content
- "keyPoints": array of key requirements or constraints mentioned
- "referencedEntities": array of file paths, function names, class names mentioned

Output ONLY the JSON object, no other text.`;

const MERGE_SYSTEM = `You are merging analyses from multiple chunks of a single input into a unified analysis.

You will receive summaries and key points from each chunk. Produce a single merged analysis.

Output a JSON object with:
- "elements": array of objects, each with:
  - "title": short label
  - "content": full original text/detail for this element — preserve detail from chunks
  - "kind": one of "section", "module", "file", "feature", "requirement", "task"
- "referencedEntities": deduplicated array of all referenced entities
- "outputFormat": one of "markdown", "html", "diff", "code", "json", "text"
- "scope": "small", "medium", or "large"
- "summary": unified 2-3 paragraph summary

IMPORTANT: Preserve the original detail in each element's content. Do not summarize.

Output ONLY the JSON object, no other text.`;

/**
 * Run the analyze stage.
 *
 * For small inputs: single LLM call to extract requirements and metadata.
 * For large inputs: chunk, analyze each chunk, merge results.
 */
export async function runAnalyze(
  userMessage: string,
  codeContext: string,
  priorContext: string,
  localProvider: LLMProvider,
  contextConfig: ModelContextConfig,
  onEvent?: PipelineLogger,
  contextProvider?: ContextProvider | undefined,
): Promise<AnalysisResult> {
  onEvent?.({ stage: 'analyze', status: 'start' });

  // Fetch graph context to enrich the analysis input
  const graphResult = await fetchAnalyzeContext(userMessage, contextProvider, onEvent);
  const graphContext = graphResult.context;

  // Combine all input text for token estimation
  const fullInput = [priorContext, codeContext, graphContext, userMessage].filter(Boolean).join('\n\n');
  const inputTokens = countTokens(fullInput, contextConfig.charsPerToken);

  // Reserve tokens for system prompt (~500) and output (~1000)
  const systemReserve = 500;
  const outputReserve = 1000;

  if (!needsChunking(fullInput, contextConfig, systemReserve, outputReserve)) {
    // Single-pass analysis
    const result = await analyzeSingle(fullInput, localProvider, contextConfig);
    result.inputTokens = inputTokens;
    // Merge graph-discovered entities into referenced entities
    enrichEntities(result, graphResult.entityNames);
    onEvent?.({ stage: 'analyze', status: 'done', result });
    return result;
  }

  // Chunked analysis
  const maxPerChunk = Math.floor(
    (contextConfig.local - systemReserve - outputReserve) * 0.9,
  );
  const chunks = chunkText(fullInput, maxPerChunk, contextConfig.charsPerToken);

  const chunkSummaries: ChunkSummary[] = [];

  for (const chunk of chunks) {
    onEvent?.({ stage: 'analyze', status: 'chunk', chunkIndex: chunk.index, totalChunks: chunks.length });

    const messages: LLMMessage[] = [
      { role: 'system', content: CHUNK_ANALYZE_SYSTEM },
      { role: 'user', content: chunk.text },
    ];

    const response = await localProvider.complete(messages, {
      maxTokens: 1000,
      temperature: 0.1,
    });

    const parsed = parseJson(response.text);
    chunkSummaries.push({
      index: chunk.index,
      summary: (parsed.summary as string | undefined) ?? '',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      tokens: chunk.tokens,
    });
  }

  // Merge chunk analyses
  const mergeInput = chunkSummaries.map((cs, i) =>
    `Chunk ${i + 1}:\nSummary: ${cs.summary}\nKey points:\n${cs.keyPoints.map(p => `- ${p}`).join('\n')}`,
  ).join('\n\n');

  const mergeMessages: LLMMessage[] = [
    { role: 'system', content: MERGE_SYSTEM },
    { role: 'user', content: `Original user request: ${userMessage}\n\nChunk analyses:\n${mergeInput}` },
  ];

  const mergeResponse = await localProvider.complete(mergeMessages, {
    maxTokens: 1500,
    temperature: 0.1,
  });

  const merged = parseJson(mergeResponse.text);
  const elements = toElements(merged.elements);
  const requirements = elements.length > 0
    ? elements.map(e => e.title + (e.content ? ': ' + e.content.slice(0, 200) : ''))
    : toStringArray(merged.requirements);
  const result: AnalysisResult = {
    elements,
    requirements,
    referencedEntities: toStringArray(merged.referencedEntities),
    outputFormat: toOutputFormat(merged.outputFormat),
    scope: toScope(merged.scope, Math.max(elements.length, requirements.length)),
    chunks: chunkSummaries,
    inputTokens,
    condensed: (merged.summary as string | undefined) ?? chunkSummaries.map(cs => cs.summary).join('\n'),
  };

  // Merge graph-discovered entities
  enrichEntities(result, graphResult.entityNames);

  onEvent?.({ stage: 'analyze', status: 'done', result });
  return result;
}

// ---------------------------------------------------------------------------
// Single-pass analysis (input fits in context)
// ---------------------------------------------------------------------------

async function analyzeSingle(
  input: string,
  provider: LLMProvider,
  contextConfig: ModelContextConfig,
): Promise<AnalysisResult> {
  const messages: LLMMessage[] = [
    { role: 'system', content: ANALYZE_SYSTEM },
    { role: 'user', content: input },
  ];

  // Elements can be large — the LLM must preserve full content per element.
  // Scale output budget: the response needs to contain the original detail.
  const inputTokens = countTokens(input, contextConfig.charsPerToken);
  const maxOutputTokens = Math.min(contextConfig.localMaxOutput, Math.max(2000, inputTokens));

  const response = await provider.complete(messages, {
    maxTokens: maxOutputTokens,
    temperature: 0.1,
  });

  const parsed = parseJson(response.text);
  const elements = toElements(parsed.elements);
  // Derive flat requirements from elements for backward compat
  const requirements = elements.length > 0
    ? elements.map(e => e.title + (e.content ? ': ' + e.content.slice(0, 200) : ''))
    : toStringArray(parsed.requirements);

  return {
    elements,
    requirements,
    referencedEntities: toStringArray(parsed.referencedEntities),
    outputFormat: toOutputFormat(parsed.outputFormat),
    scope: toScope(parsed.scope, Math.max(elements.length, requirements.length)),
    chunks: [],
    inputTokens,
    condensed: (parsed.summary as string | undefined) ?? input.slice(0, 2000),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJson(text: string): Record<string, unknown> {
  let jsonStr = text.trim();

  // Strip markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) jsonStr = fenceMatch[1]!.trim();

  // Find JSON object
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) jsonStr = objMatch[0]!;

  try {
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function toStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is string => typeof v === 'string');
}

const VALID_FORMATS = new Set<OutputFormat>(['markdown', 'html', 'diff', 'code', 'json', 'text']);

function toOutputFormat(val: unknown): OutputFormat {
  if (typeof val === 'string' && VALID_FORMATS.has(val as OutputFormat)) return val as OutputFormat;
  return 'text';
}

function toScope(val: unknown, requirementCount: number): 'small' | 'medium' | 'large' {
  if (val === 'small' || val === 'medium' || val === 'large') return val;
  // Infer from requirement count
  if (requirementCount <= 3) return 'small';
  if (requirementCount <= 8) return 'medium';
  return 'large';
}

const VALID_KINDS = new Set(['section', 'module', 'file', 'feature', 'requirement', 'task']);

function toElements(val: unknown): InputElement[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map(item => ({
      title: typeof item.title === 'string' ? item.title : '',
      content: typeof item.content === 'string' ? item.content : '',
      kind: (typeof item.kind === 'string' && VALID_KINDS.has(item.kind)
        ? item.kind
        : 'requirement') as InputElement['kind'],
      dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn.filter((n): n is number => typeof n === 'number') : undefined,
    }));
}

/**
 * Merge graph-discovered entity names into the analysis result.
 * Deduplicates against entities already found by the LLM.
 */
function enrichEntities(result: AnalysisResult, graphEntityNames: string[]): void {
  if (graphEntityNames.length === 0) return;
  const existing = new Set(result.referencedEntities.map(e => e.toLowerCase()));
  for (const name of graphEntityNames) {
    if (!existing.has(name.toLowerCase())) {
      result.referencedEntities.push(name);
      existing.add(name.toLowerCase());
    }
  }
}
