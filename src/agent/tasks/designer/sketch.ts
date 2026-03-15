import type { LLMProvider, LLMMessage, Entity } from '../../../shared/types.js';
import type {
  DesignerInput,
  RequirementTodo,
  RequirementSketch,
  ReusableEntity,
  ProposedComponent,
  ParsedRequirement,
} from './types.js';
import { SKETCH_SYSTEM, SKETCH_REVIEW_SYSTEM } from './prompts.js';
import { createDaemonContextProvider } from '../../tools/context-provider.js';
import { formatRequirementsList } from './requirements.js';
import { compressHistory } from './context.js';
import { planSearches, type PlannedSearch } from './search-planner.js';

// ---------------------------------------------------------------------------
// Per-requirement Sketch — Step 4a/4b of the Designer pipeline
//
// 4a: Local model writes sketch (codebase analysis + summary flow)
// 4b: Claude reviews and fixes sketch
// ---------------------------------------------------------------------------

/**
 * Write a sketch for a single requirement using the local model.
 * Performs codebase analysis (local + cross-project) and produces
 * a RequirementSketch with reusable modules, proposed components,
 * summary flow, and concerns.
 */
export async function writeSketch(
  todo: RequirementTodo,
  allRequirements: ParsedRequirement[],
  allTodos: RequirementTodo[],
  input: DesignerInput,
  localProvider: LLMProvider,
  configContext?: string,
): Promise<RequirementSketch> {
  // 1. Classify which design concepts this requirement needs
  const { classifyConcepts, runConceptExploration } = await import('./concepts.js');
  type ConceptAnalysis = import('./concepts.js').ConceptAnalysis;
  const classification = await classifyConcepts(todo, localProvider);

  // 2. Generic codebase analysis (always runs — covers code-reuse)
  const searches = await planSearches(todo, localProvider);
  const contextProvider = createDaemonContextProvider();
  const [localEntities, crossEntities] = await Promise.all([
    analyzeLocalCodebase(contextProvider, input.session.repoPath, searches),
    analyzeCrossProject(contextProvider, input.session.closureRepos, input.session.repoPath, searches),
  ]);

  // 3. Concept-specific explorations (parallel, skip code-reuse — covered by generic)
  const nonGenericConcepts = classification.concepts.filter(c => c !== 'code-reuse');
  const conceptAnalyses: ConceptAnalysis[] = nonGenericConcepts.length > 0
    ? await Promise.all(
        nonGenericConcepts.map(concept =>
          runConceptExploration(concept, todo, input.session.repoPath, input.session.closureRepos, localProvider),
        ),
      )
    : [];

  // 4. Build context for the LLM
  const analysisContext = formatAnalysisContext(localEntities, crossEntities);
  const reqListContext = formatRequirementsList(allRequirements);
  const history = compressHistory(allTodos);

  // Format concept exploration findings
  const conceptSection = conceptAnalyses.length > 0
    ? '## Concept Explorations\n\n' + conceptAnalyses
        .map(a => `### ${a.concept}\n${a.findings}`)
        .join('\n\n')
    : '';

  const messages: LLMMessage[] = [
    { role: 'system', content: SKETCH_SYSTEM },
    {
      role: 'user',
      content: [
        `## Requirement ${todo.index}\n${todo.statement}`,
        `## Applicable Concepts: ${classification.concepts.join(', ')}`,
        `## All Requirements\n${reqListContext}`,
        `## Codebase Analysis\n${analysisContext}`,
        conceptSection,
        input.codeContext ? `## Additional Code Context\n${input.codeContext}` : '',
        history ? `## Design History\n${history}` : '',
        configContext ?? '',
      ].filter(Boolean).join('\n\n'),
    },
  ];

  const response = await localProvider.complete(messages, {
    maxTokens: 2500,
    temperature: 0.3,
  });

  const sketch = parseSketch(response.text, todo.index);

  // Enrich sketch with concept metadata
  sketch.conceptsExplored = classification.concepts;
  if (conceptAnalyses.length > 0) {
    sketch.conceptNotes = {};
    for (const a of conceptAnalyses) {
      sketch.conceptNotes[a.concept] = a.findings;
    }
    // Merge concept entities into sketch reusable list
    for (const a of conceptAnalyses) {
      for (const e of a.entities) {
        if (!sketch.reusable.some(r => r.entity === e.entity)) {
          sketch.reusable.push(e);
        }
      }
    }
  }

  return sketch;
}

/**
 * Claude reviews and fixes the sketch.
 * Validates reuse choices, corrects entity references, strengthens summary flow.
 */
export async function reviewSketch(
  sketch: RequirementSketch,
  todo: RequirementTodo,
  allRequirements: ParsedRequirement[],
  input: DesignerInput,
  claudeProvider: LLMProvider,
  configContext?: string,
): Promise<RequirementSketch> {
  const reqListContext = formatRequirementsList(allRequirements);

  const messages: LLMMessage[] = [
    { role: 'system', content: SKETCH_REVIEW_SYSTEM },
    { role: 'user', content: `## Requirement\n${todo.statement}` },
    { role: 'user', content: `## Local Sketch\n${formatSketch(sketch)}` },
    { role: 'user', content: `## All Requirements\n${reqListContext}` },
    ...(input.codeContext
      ? [{ role: 'user' as const, content: `## Code Context\n${input.codeContext}` }]
      : []),
    ...(configContext
      ? [{ role: 'user' as const, content: configContext }]
      : []),
  ];

  const response = await claudeProvider.complete(messages, {
    maxTokens: 2048,
    temperature: 0.2,
  });

  return parseSketch(response.text, todo.index);
}

/**
 * Re-run sketch with user feedback injected (for edit rounds).
 */
export async function reSketchWithFeedback(
  previousSketch: RequirementSketch,
  feedback: string,
  todo: RequirementTodo,
  allRequirements: ParsedRequirement[],
  allTodos: RequirementTodo[],
  input: DesignerInput,
  localProvider: LLMProvider,
  claudeProvider: LLMProvider,
  configContext?: string,
): Promise<RequirementSketch> {
  const reqListContext = formatRequirementsList(allRequirements);
  const history = compressHistory(allTodos);

  const messages: LLMMessage[] = [
    { role: 'system', content: SKETCH_SYSTEM },
    {
      role: 'user',
      content: [
        `## Requirement ${todo.index}\n${todo.statement}`,
        `## Previous Sketch\n${formatSketch(previousSketch)}`,
        `## User Feedback\n${feedback}`,
        `## All Requirements\n${reqListContext}`,
        input.codeContext ? `## Code Context\n${input.codeContext}` : '',
        history ? `## Design History\n${history}` : '',
        configContext ?? '',
      ].filter(Boolean).join('\n\n'),
    },
  ];

  const localResponse = await localProvider.complete(messages, {
    maxTokens: 2000,
    temperature: 0.3,
  });

  const newSketch = parseSketch(localResponse.text, todo.index);
  return reviewSketch(newSketch, todo, allRequirements, input, claudeProvider, configContext);
}

// ---------------------------------------------------------------------------
// Codebase Analysis
// ---------------------------------------------------------------------------

interface AnalysisEntity {
  entity: Entity;
  neighbours: { callers: Entity[]; callees: Entity[] };
}

/**
 * Analyze the local project's knowledge graph for reusable entities.
 * Executes LLM-planned categorized searches + 1-hop expansion for top hits.
 */
async function analyzeLocalCodebase(
  provider: ReturnType<typeof createDaemonContextProvider>,
  currentRepo: string,
  searches: PlannedSearch[],
): Promise<AnalysisEntity[]> {
  // Execute all planned searches in parallel
  const allHits = await Promise.all(
    searches.map(s => provider.search(s.query, s.limit, s.filter)),
  );

  // Deduplicate by entity ID, keep first occurrence (highest relevance)
  const seen = new Set<string>();
  const localHits: Entity[] = [];
  for (const hits of allHits) {
    for (const h of hits) {
      if (h.repo === currentRepo && !seen.has(h.id)) {
        seen.add(h.id);
        localHits.push(h);
      }
    }
  }

  // Expand top 5 for neighbour context (keep budget manageable)
  const toExpand = localHits.slice(0, 5);
  const expanded = await Promise.all(
    toExpand.map(async h => ({
      entity: h,
      neighbours: await provider.expand(h.id),
    })),
  );

  // Include remaining hits without expansion
  const rest = localHits.slice(5).map(h => ({
    entity: h,
    neighbours: { callers: [] as Entity[], callees: [] as Entity[] },
  }));

  return [...expanded, ...rest];
}

/**
 * Analyze cross-project entities in the dependency closure.
 * Uses LLM-planned searches, returns signatures only to keep context budget low.
 */
async function analyzeCrossProject(
  provider: ReturnType<typeof createDaemonContextProvider>,
  closureRepos: string[],
  currentRepo: string,
  searches: PlannedSearch[],
): Promise<AnalysisEntity[]> {
  if (closureRepos.length <= 1) return []; // Only the current repo

  // Execute all planned searches in parallel
  const allHits = await Promise.all(
    searches.map(s => provider.search(s.query, Math.min(s.limit, 8), s.filter)),
  );

  // Deduplicate and filter to cross-project only
  const seen = new Set<string>();
  const crossHits: Entity[] = [];
  for (const hits of allHits) {
    for (const h of hits) {
      if (h.repo !== currentRepo && !seen.has(h.id)) {
        seen.add(h.id);
        crossHits.push(h);
      }
    }
  }

  return crossHits.map(h => ({
    entity: h,
    neighbours: { callers: [], callees: [] },
  }));
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatAnalysisContext(
  local: AnalysisEntity[],
  cross: AnalysisEntity[],
): string {
  const parts: string[] = [];

  if (local.length > 0) {
    parts.push('### Local Project Entities');
    for (const item of local) {
      const e = item.entity;
      const sig = e.signature ? `\nSignature: ${e.signature}` : '';
      const body = e.body && e.body.length < 2000 ? `\n\`\`\`\n${e.body}\n\`\`\`` : '';
      parts.push(`\n**${e.kind} ${e.name}** — ${e.file}:${e.startLine}${sig}${body}`);

      if (item.neighbours.callers.length > 0) {
        parts.push('Callers: ' + item.neighbours.callers.map(c =>
          `${c.name} (${c.kind})`
        ).join(', '));
      }
      if (item.neighbours.callees.length > 0) {
        parts.push('Callees: ' + item.neighbours.callees.map(c =>
          `${c.name} (${c.kind})`
        ).join(', '));
      }
    }
  }

  if (cross.length > 0) {
    parts.push('\n### Cross-Project Entities (signatures only)');
    for (const item of cross) {
      const e = item.entity;
      const sig = e.signature ?? e.name;
      parts.push(`- [${e.repo}] **${e.kind} ${e.name}** — ${sig}`);
    }
  }

  if (parts.length === 0) {
    parts.push('No relevant entities found in the codebase index.');
  }

  return parts.join('\n');
}

/**
 * Format a RequirementSketch into readable text for display and prompt injection.
 */
export function formatSketch(sketch: RequirementSketch): string {
  const parts: string[] = [];

  parts.push('## Reusable Modules');
  if (sketch.reusable.length === 0) {
    parts.push('(none identified)');
  } else {
    for (const r of sketch.reusable) {
      parts.push(`- [${r.project}] ${r.entity} — ${r.relevance}`);
    }
  }

  parts.push('\n## Proposed Components');
  if (sketch.proposed.length === 0) {
    parts.push('(none — fully reusable from existing code)');
  } else {
    for (const p of sketch.proposed) {
      parts.push(`- ${p.name} (${p.kind}) — ${p.file} — ${p.purpose}`);
    }
  }

  parts.push('\n## Summary Flow');
  parts.push(sketch.summaryFlow);

  if (sketch.concerns.length > 0) {
    parts.push('\n## Concerns');
    for (const c of sketch.concerns) {
      parts.push(`- ${c}`);
    }
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse LLM output into a RequirementSketch.
 * Extracts structured sections from the markdown output.
 */
export function parseSketch(text: string, index: number): RequirementSketch {
  const reusable: ReusableEntity[] = [];
  const proposed: ProposedComponent[] = [];
  const concerns: string[] = [];
  let summaryFlow = '';

  // Split into sections
  const sections = text.split(/^##\s+/m).filter(Boolean);

  for (const section of sections) {
    const lines = section.split('\n');
    const heading = (lines[0] ?? '').trim().toLowerCase();
    const body = lines.slice(1).join('\n').trim();

    if (heading.includes('reusable') || heading.includes('reuse')) {
      // Parse reusable entities
      for (const line of body.split('\n')) {
        const match = line.match(/^[-*]\s*(?:\[([^\]]+)\])?\s*(.+?)(?:\s*—\s*(.+))?$/);
        if (match) {
          reusable.push({
            project: match[1] ?? 'local',
            entity: match[2]!.trim(),
            relevance: match[3]?.trim() ?? '',
          });
        }
      }
    } else if (heading.includes('proposed') || heading.includes('new component')) {
      // Parse proposed components
      for (const line of body.split('\n')) {
        const match = line.match(
          /^[-*]\s*(\S+)\s*\((\w+)\)\s*—\s*(\S+)\s*—\s*(.+)$/,
        );
        if (match) {
          proposed.push({
            name: match[1]!,
            kind: match[2] as ProposedComponent['kind'],
            file: match[3]!,
            purpose: match[4]!.trim(),
          });
        }
      }
    } else if (heading.includes('summary') || heading.includes('flow')) {
      summaryFlow = body;
    } else if (heading.includes('concern') || heading.includes('risk')) {
      for (const line of body.split('\n')) {
        const item = line.replace(/^[-*]\s*/, '').trim();
        if (item) concerns.push(item);
      }
    }
  }

  // Fallback: if no structured sections found, treat the whole text as summary flow
  if (!summaryFlow && reusable.length === 0 && proposed.length === 0) {
    summaryFlow = text;
  }

  return { index, reusable, proposed, summaryFlow, concerns };
}
