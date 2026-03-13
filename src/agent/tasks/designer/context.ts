import type { RequirementTodo } from './types.js';

// ---------------------------------------------------------------------------
// Context Compression — keeps LLM input within token budget
//
// Instead of dumping all completed sections as raw text (~8K per req),
// we extract a compressed summary: statement + TypeScript type signatures
// (with field shapes) + key design decisions.
//
// Budget: ~500-800 chars per completed requirement.
// ---------------------------------------------------------------------------

/**
 * Compress completed todos into a concise design history string.
 * Extracts TypeScript type signatures (with fields) and key decisions
 * from the detail text so that later sections can build on earlier types
 * instead of reinventing them.
 *
 * Returns empty string if no todos are done.
 */
export function compressHistory(todos: RequirementTodo[]): string {
  const doneTodos = todos.filter(t => t.state === 'done' && t.detail);
  if (doneTodos.length === 0) return '';

  return doneTodos.map(t => {
    const stmt = t.statement.length > 80
      ? t.statement.slice(0, 80) + '...'
      : t.statement;

    const typeSignatures = extractTypeSignatures(t.detail!);
    const fnSignatures = extractFunctionSignatures(t.detail!);
    const decisions = extractDecisions(t.detail!);

    const parts = [`### Req ${t.index}: ${stmt}`];
    if (typeSignatures.length > 0) {
      parts.push('Types:\n' + typeSignatures.map(s => '  ' + s).join('\n'));
    }
    if (fnSignatures.length > 0) {
      parts.push('Functions:\n' + fnSignatures.map(s => '  ' + s).join('\n'));
    }
    if (decisions) {
      parts.push(`Key: ${decisions}`);
    }
    return parts.join('\n');
  }).join('\n\n');
}

/**
 * Extract type/interface/enum definitions with their field shapes from code blocks.
 *
 * Produces compact one-line signatures like:
 *   interface PlanStep { id, title, status: StepStatus, dependencies: string[], subSteps?: PlanStep[] }
 *   type StepStatus = 'pending' | 'in-progress' | 'done' | 'blocked' | 'skipped'
 */
function extractTypeSignatures(detail: string): string[] {
  const codeBlocks = detail.match(/```[\s\S]*?```/g) ?? [];
  const codeText = codeBlocks.join('\n');
  const signatures: string[] = [];
  const seen = new Set<string>();

  // Match type aliases: type Foo = ...
  for (const m of codeText.matchAll(/(?:export\s+)?type\s+(\w+)\s*=\s*([^;]+)/g)) {
    const name = m[1]!;
    if (seen.has(name)) continue;
    seen.add(name);
    const value = m[2]!.trim();
    // Keep short type aliases inline (union types, etc.)
    if (value.length < 120) {
      signatures.push(`type ${name} = ${value}`);
    } else {
      signatures.push(`type ${name} = ${value.slice(0, 100)}...`);
    }
  }

  // Match interface/enum blocks: interface Foo { ... }
  for (const m of codeText.matchAll(
    /(?:export\s+)?(?:interface|enum)\s+(\w+)(?:\s+extends\s+\w+)?\s*\{([^}]*)\}/g,
  )) {
    const kind = codeText.slice(m.index!).match(/^(?:export\s+)?(interface|enum)/)![1];
    const name = m[1]!;
    if (seen.has(name)) continue;
    seen.add(name);
    const body = m[2]!;

    if (kind === 'enum') {
      // Enum: extract members
      const members = body.match(/\w+/g) ?? [];
      signatures.push(`enum ${name} { ${members.join(', ')} }`);
    } else {
      // Interface: extract field names with types
      const fields = extractFields(body);
      signatures.push(`interface ${name} { ${fields} }`);
    }
  }

  return signatures;
}

/**
 * Extract fields and method signatures from an interface body into a compact representation.
 * Fields:  "id: string; status: StepStatus" → "id, status: StepStatus"
 * Methods: "derivePlanStatus(plan: Plan): StepStatus" → "derivePlanStatus(Plan): StepStatus"
 */
function extractFields(body: string): string {
  const members: string[] = [];
  for (const line of body.split('\n')) {
    // Skip empty lines and comments
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    // Method signatures: name(params): ReturnType
    const mm = trimmed.match(/^(\w+)\s*\(([^)]*)\)(?:\s*:\s*(.+?))?(?:;|$)/);
    if (mm) {
      const name = mm[1]!;
      // Compact params: just types, not names
      const params = mm[2]!.split(',').map(p => {
        const tp = p.trim().match(/\w+(?:\?)?:\s*(.+)/);
        return tp ? tp[1]!.trim() : p.trim();
      }).filter(Boolean).join(', ');
      const ret = mm[3]?.trim() ?? 'void';
      members.push(`${name}(${params}): ${ret}`);
      continue;
    }

    // Field declarations: name?: Type
    const fm = trimmed.match(/^(\w+)(\?)?:\s*(.+?)(?:;|\/\/|$)/);
    if (!fm) continue;
    const name = fm[1]!;
    const optional = fm[2] ?? '';
    const type = fm[3]!.trim();

    // Skip nested object literals (e.g., metadata: {) — too complex to inline
    if (type === '{') continue;

    // For simple types (string, number, boolean, Date), just show the name
    if (/^(?:string|number|boolean|Date)$/.test(type)) {
      members.push(name + optional);
    } else {
      members.push(`${name}${optional}: ${type}`);
    }
  }
  return members.join(', ');
}

/**
 * Extract function signatures from code blocks.
 * Produces compact one-line signatures like:
 *   function updateStepStatus(plan: Plan, stepId: string, newStatus: StepStatus): Result<Plan, TransitionError>
 */
function extractFunctionSignatures(detail: string): string[] {
  const codeBlocks = detail.match(/```[\s\S]*?```/g) ?? [];
  const codeText = codeBlocks.join('\n');
  const signatures: string[] = [];
  const seen = new Set<string>();

  // Match function declarations with their full signature
  for (const m of codeText.matchAll(
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^\n{;]+))?/g,
  )) {
    const name = m[1]!;
    if (seen.has(name)) continue;
    seen.add(name);
    const params = m[2]!.replace(/\s+/g, ' ').trim();
    const ret = m[3]?.trim() ?? 'void';
    signatures.push(`${name}(${params}): ${ret}`);
  }

  return signatures;
}

/**
 * Extract key design decisions from the detail text.
 * Looks for decision-related headings, then falls back to the first
 * substantive sentence of the detail.
 */
function extractDecisions(detail: string): string {
  // Look for lines after headings containing "decision", "design choice", "approach"
  const decisionPattern = /^##?\s+.*(?:decision|design choice|approach|rationale)/im;
  const match = detail.match(decisionPattern);
  if (match) {
    const idx = detail.indexOf(match[0]) + match[0].length;
    const after = detail.slice(idx).trim();
    const firstLine = after.split('\n').find(l => l.trim().length > 10);
    if (firstLine) {
      return firstLine.replace(/^[-*]\s*/, '').trim().slice(0, 150);
    }
  }

  // Fallback: first non-heading, non-empty line (likely the opening statement)
  const lines = detail.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 15 && !trimmed.startsWith('#') && !trimmed.startsWith('```')) {
      return trimmed.replace(/^[-*]\s*/, '').slice(0, 150);
    }
  }

  return '';
}
