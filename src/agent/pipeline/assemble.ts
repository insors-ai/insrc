import type {
  AssemblyResult, AssemblyStrategy, ExecutionPlan,
  OutputFormat, PipelineLogger, StepResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Stage 4: Assemble — combine step outputs into the final artifact
//
// Three strategies:
//   concatenate  — join outputs in order (docs, design, requirements)
//   merge-diff   — combine diff hunks per file (implement, refactor)
//   json-combine — merge JSON objects/arrays (plans)
// ---------------------------------------------------------------------------

/**
 * Assemble step results into the final output.
 */
export function runAssemble(
  plan: ExecutionPlan,
  results: StepResult[],
  onEvent?: PipelineLogger,
): AssemblyResult {
  onEvent?.({ stage: 'assemble', status: 'start' });

  const startMs = Date.now();

  // Filter to successful results, keep order
  const successful = results
    .filter(r => !r.error)
    .sort((a, b) => a.index - b.index);

  const warnings: string[] = [];
  const failed = results.filter(r => r.error);
  for (const f of failed) {
    warnings.push(`Step "${f.title}" failed: ${f.error}`);
  }

  let output: string;

  switch (plan.assemblyStrategy) {
    case 'merge-diff':
      output = assembleMergeDiff(successful);
      break;
    case 'json-combine':
      output = assembleJsonCombine(successful, warnings);
      break;
    case 'concatenate':
    default:
      output = assembleConcatenate(successful, plan);
      break;
  }

  // Wrap in template if provided
  if (plan.template) {
    output = applyTemplate(plan.template, output);
  }

  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  const result: AssemblyResult = {
    output,
    format: plan.analysis.outputFormat,
    steps: results,
    totalDurationMs,
    warnings,
  };

  onEvent?.({ stage: 'assemble', status: 'done', outputSize: output.length });
  return result;
}

// ---------------------------------------------------------------------------
// Strategy: concatenate
// ---------------------------------------------------------------------------

function assembleConcatenate(results: StepResult[], plan: ExecutionPlan): string {
  const sections = results.map(r => r.output.trim());

  // For markdown/text, join with double newlines
  if (plan.analysis.outputFormat === 'markdown' || plan.analysis.outputFormat === 'text') {
    return sections.join('\n\n');
  }

  // For HTML, join sections directly (they should be self-contained HTML blocks)
  if (plan.analysis.outputFormat === 'html') {
    return sections.join('\n\n');
  }

  // For code, join with single newline
  if (plan.analysis.outputFormat === 'code') {
    return sections.join('\n');
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Strategy: merge-diff
// ---------------------------------------------------------------------------

/**
 * Merge diff outputs by grouping hunks per file path.
 * Each step may produce diffs for one or more files.
 * We deduplicate and order by file path.
 */
function assembleMergeDiff(results: StepResult[]): string {
  const fileHunks = new Map<string, string[]>();

  for (const result of results) {
    const parsed = parseDiffBlocks(result.output);
    for (const block of parsed) {
      const existing = fileHunks.get(block.file) ?? [];
      existing.push(block.content);
      fileHunks.set(block.file, existing);
    }
  }

  // If no structured diffs found, fall back to concatenation
  if (fileHunks.size === 0) {
    return results.map(r => r.output.trim()).join('\n\n');
  }

  // Reassemble ordered by file path
  const sortedFiles = Array.from(fileHunks.keys()).sort();
  return sortedFiles
    .map(file => {
      const hunks = fileHunks.get(file)!;
      return `--- ${file}\n${hunks.join('\n')}`;
    })
    .join('\n\n');
}

interface DiffBlock {
  file: string;
  content: string;
}

/**
 * Parse diff output into per-file blocks.
 * Handles both unified diff (--- a/file) and code-fence diff formats.
 */
function parseDiffBlocks(text: string): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  const lines = text.split('\n');

  let currentFile = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    // Unified diff header: --- a/path or --- path
    const diffMatch = line.match(/^---\s+(?:a\/)?(.+)/);
    if (diffMatch) {
      if (currentFile && currentLines.length > 0) {
        blocks.push({ file: currentFile, content: currentLines.join('\n') });
      }
      currentFile = diffMatch[1]!;
      currentLines = [];
      continue;
    }

    if (currentFile) {
      // Skip +++ line (we already have the file from ---)
      if (line.startsWith('+++ ')) continue;
      currentLines.push(line);
    }
  }

  // Flush last block
  if (currentFile && currentLines.length > 0) {
    blocks.push({ file: currentFile, content: currentLines.join('\n') });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Strategy: json-combine
// ---------------------------------------------------------------------------

/**
 * Combine JSON outputs from multiple steps.
 * If all outputs are arrays, concatenate them.
 * If all outputs are objects, merge them (later keys win).
 */
function assembleJsonCombine(results: StepResult[], warnings: string[]): string {
  const parsed: unknown[] = [];

  for (const result of results) {
    try {
      let jsonStr = result.output.trim();
      // Strip code fences
      const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (fenceMatch) jsonStr = fenceMatch[1]!.trim();

      parsed.push(JSON.parse(jsonStr));
    } catch {
      warnings.push(`Step "${result.title}" produced non-JSON output, included as-is`);
      parsed.push(result.output);
    }
  }

  // All arrays → concatenate
  if (parsed.every(p => Array.isArray(p))) {
    const combined = (parsed as unknown[][]).flat();
    return JSON.stringify(combined, null, 2);
  }

  // All objects → merge
  if (parsed.every(p => typeof p === 'object' && p !== null && !Array.isArray(p))) {
    const merged = Object.assign({}, ...parsed as Record<string, unknown>[]);
    return JSON.stringify(merged, null, 2);
  }

  // Mixed — wrap in array
  return JSON.stringify(parsed, null, 2);
}

// ---------------------------------------------------------------------------
// Template application
// ---------------------------------------------------------------------------

/**
 * Insert assembled content into a template.
 * Template should contain {{content}} placeholder.
 * If no placeholder found, append content after template.
 */
function applyTemplate(template: string, content: string): string {
  if (template.includes('{{content}}')) {
    return template.replace('{{content}}', content);
  }
  // No placeholder — append
  return template + '\n' + content;
}
