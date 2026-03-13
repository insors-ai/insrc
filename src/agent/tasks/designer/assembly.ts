import { marked } from 'marked';
import type {
  DesignTemplate,
  RequirementTodo,
  DesignerResult,
  RequirementSketch,
} from './types.js';

// ---------------------------------------------------------------------------
// Document Assembly — Step 5 of the Designer pipeline
//
// Takes the template skeleton + all validated detail sections and produces
// the final design document.
// ---------------------------------------------------------------------------

/**
 * Assemble the final design document from the template and completed sections.
 */
export function assembleDocument(
  template: DesignTemplate,
  title: string,
  todos: RequirementTodo[],
): DesignerResult {
  const doneTodos = todos.filter(t => t.state === 'done');
  const skippedTodos = todos.filter(t => t.state === 'skipped');
  const sketches = doneTodos.map(t => t.sketch).filter((s): s is RequirementSketch => s != null);

  // Build section content
  const requirementsSummary = buildRequirementsSummary(todos);
  const requirementSections = buildRequirementSections(doneTodos);
  const architectureSummary = buildArchitectureSummary(sketches);
  const risks = buildRisks(sketches);
  const overview = buildOverview(title, doneTodos.length, skippedTodos.length);

  // Convert markdown sections to HTML when outputting an HTML template
  const md = (s: string) => template.format === 'html' ? marked.parse(s) as string : s;

  // Fill template
  let output = template.skeleton;
  output = output.replace(/\{\{title\}\}/g, title);
  output = output.replace(/\{\{overview\}\}/g, md(overview));
  output = output.replace(/\{\{requirements_summary\}\}/g, md(requirementsSummary));
  output = output.replace(/\{\{requirement_sections\}\}/g, md(requirementSections));
  output = output.replace(/\{\{architecture_summary\}\}/g, md(architectureSummary));
  output = output.replace(/\{\{risks\}\}/g, md(risks));
  if (template.css) {
    output = output.replace(/\{\{css\}\}/g, template.css);
  }

  // Build structured extraction
  const structured = buildStructuredExtraction(sketches);

  // Build L2 summary
  const summary = compressForL2(todos, structured);

  return {
    kind: 'document',
    output,
    format: template.format,
    templateId: template.id,
    requirements: todos.map(t => ({
      index: t.index,
      statement: t.statement,
      type: t.type,
      state: t.state === 'done' ? 'done' as const : 'skipped' as const,
    })),
    sketches,
    structured,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildOverview(title: string, done: number, skipped: number): string {
  const total = done + skipped;
  return `Design document for **${title}**. ${done} of ${total} requirements addressed${skipped > 0 ? `, ${skipped} skipped` : ''}.`;
}

function buildRequirementsSummary(todos: RequirementTodo[]): string {
  return todos.map(t => {
    const status = t.state === 'done' ? 'DONE' : t.state === 'skipped' ? 'SKIPPED' : t.state.toUpperCase();
    return `${t.index}. [${t.type.toUpperCase()}] ${t.statement} — **${status}**`;
  }).join('\n');
}

function buildRequirementSections(doneTodos: RequirementTodo[]): string {
  return doneTodos.map(t => {
    const heading = `### Requirement ${t.index}: ${t.statement}`;
    const detail = t.detail ?? '(no detail generated)';
    return `${heading}\n\n${detail}`;
  }).join('\n\n---\n\n');
}

function buildArchitectureSummary(sketches: RequirementSketch[]): string {
  const allReusable = sketches.flatMap(s => s.reusable);
  const allProposed = sketches.flatMap(s => s.proposed);

  const parts: string[] = [];

  if (allReusable.length > 0) {
    parts.push('**Reused Entities:**');
    // Deduplicate by entity name
    const seen = new Set<string>();
    for (const r of allReusable) {
      const key = `${r.project}:${r.entity}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(`- [${r.project}] ${r.entity} — ${r.relevance}`);
    }
  }

  if (allProposed.length > 0) {
    parts.push('\n**Proposed New Entities:**');
    const seen = new Set<string>();
    for (const p of allProposed) {
      if (seen.has(p.name)) continue;
      seen.add(p.name);
      parts.push(`- ${p.name} (${p.kind}) — ${p.file} — ${p.purpose}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : 'No architectural changes proposed.';
}

function buildRisks(sketches: RequirementSketch[]): string {
  const allConcerns = sketches.flatMap(s =>
    s.concerns.map(c => ({ reqIndex: s.index, concern: c })),
  );

  if (allConcerns.length === 0) return 'No significant risks identified.';

  return allConcerns.map(c =>
    `- **Req ${c.reqIndex}**: ${c.concern}`
  ).join('\n');
}

// ---------------------------------------------------------------------------
// Structured extraction
// ---------------------------------------------------------------------------

function buildStructuredExtraction(sketches: RequirementSketch[]): DesignerResult['structured'] {
  const newEntities = sketches.flatMap(s =>
    s.proposed.map(p => ({ name: p.name, file: p.file, kind: p.kind })),
  );

  const reusedEntities = sketches.flatMap(s =>
    s.reusable.map(r => ({ entity: r.entity, project: r.project, modification: r.relevance })),
  );

  // Deduplicate
  const seenNew = new Set<string>();
  const uniqueNew = newEntities.filter(e => {
    if (seenNew.has(e.name)) return false;
    seenNew.add(e.name);
    return true;
  });

  const seenReused = new Set<string>();
  const uniqueReused = reusedEntities.filter(e => {
    const key = `${e.project}:${e.entity}`;
    if (seenReused.has(key)) return false;
    seenReused.add(key);
    return true;
  });

  // Collect unresolved concerns as user decisions
  const userDecisions = sketches
    .flatMap(s => s.concerns)
    .filter(c => c.toLowerCase().includes('decision') || c.toLowerCase().includes('ambigui'));

  return {
    newEntities: uniqueNew,
    reusedEntities: uniqueReused,
    userDecisions,
  };
}

// ---------------------------------------------------------------------------
// L2 compression
// ---------------------------------------------------------------------------

/**
 * Compress the designer result into a concise summary for L2 tag storage.
 */
function compressForL2(
  todos: RequirementTodo[],
  structured: DesignerResult['structured'],
): string {
  const done = todos.filter(t => t.state === 'done').length;
  const skipped = todos.filter(t => t.state === 'skipped').length;

  return [
    `${done} requirements validated, ${skipped} skipped.`,
    `${structured.newEntities.length} new entities proposed.`,
    `${structured.reusedEntities.length} existing entities reused.`,
    structured.userDecisions.length > 0
      ? `${structured.userDecisions.length} decisions pending.`
      : '',
  ].filter(Boolean).join(' ');
}
