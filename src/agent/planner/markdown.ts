// ---------------------------------------------------------------------------
// Planner Module — Markdown Serialization
//
// Serialize Plan<T> to Markdown with YAML frontmatter and checkbox lists.
// Parse back with round-trip fidelity.
// ---------------------------------------------------------------------------

import type { Plan, Step, StepStatus, PlanMetadata } from './types.js';
import { generateId } from './utils.js';

// ---------------------------------------------------------------------------
// Checkbox mapping
// ---------------------------------------------------------------------------

const STATUS_TO_CHECKBOX: Record<StepStatus, string> = {
  pending:     '[ ]',
  in_progress: '[>]',
  done:        '[x]',
  blocked:     '[-]',
  failed:      '[!]',
  skipped:     '[~]',
};

const CHECKBOX_TO_STATUS: Record<string, StepStatus> = {
  '[ ]': 'pending',
  '[>]': 'in_progress',
  '[x]': 'done',
  '[-]': 'blocked',
  '[!]': 'failed',
  '[~]': 'skipped',
};

// ---------------------------------------------------------------------------
// toMarkdown
// ---------------------------------------------------------------------------

/**
 * Serialize a Plan<T> to Markdown with YAML frontmatter.
 */
export function toMarkdown<T>(plan: Plan<T>): string {
  const lines: string[] = [];

  // YAML frontmatter
  lines.push('---');
  lines.push(`title: ${yamlEscape(plan.title)}`);
  lines.push(`id: ${plan.id}`);
  lines.push(`repoPath: ${plan.repoPath}`);
  lines.push(`status: ${plan.status}`);
  if (plan.metadata.author) lines.push(`author: ${yamlEscape(plan.metadata.author)}`);
  lines.push(`created: ${plan.metadata.createdAt}`);
  lines.push(`updated: ${plan.metadata.updatedAt}`);
  lines.push('---');
  lines.push('');

  if (plan.description) {
    lines.push(plan.description);
    lines.push('');
  }

  // Steps
  for (const step of plan.steps) {
    renderStep(step, 0, lines);
  }

  return lines.join('\n');
}

function renderStep<T>(step: Step<T>, depth: number, lines: string[]): void {
  const indent = '  '.repeat(depth);
  const checkbox = STATUS_TO_CHECKBOX[step.status];

  lines.push(`${indent}- ${checkbox} ${step.title}`);
  lines.push(`${indent}  <!-- id: ${step.id} -->`);

  if (step.description) {
    lines.push(`${indent}  ${step.description}`);
  }

  if (step.notes) {
    lines.push(`${indent}  > ${step.notes}`);
  }

  lines.push('');

  if (step.subSteps) {
    for (const sub of step.subSteps) {
      renderStep(sub, depth + 1, lines);
    }
  }
}

// ---------------------------------------------------------------------------
// fromMarkdown
// ---------------------------------------------------------------------------

/**
 * Parse a Markdown string back into a Plan<T>.
 * Reconstructs the step tree from indentation depth.
 */
export function fromMarkdown<T>(markdown: string): Plan<T> {
  const { frontmatter, body } = parseFrontmatter(markdown);

  const metadata: PlanMetadata = {
    createdAt: (frontmatter['created'] as string) || new Date().toISOString(),
    updatedAt: (frontmatter['updated'] as string) || new Date().toISOString(),
    author:    (frontmatter['author'] as string) || undefined,
  };

  const plan: Plan<T> = {
    id:          (frontmatter['id'] as string) || generateId(),
    repoPath:    (frontmatter['repoPath'] as string) || '',
    title:       (frontmatter['title'] as string) || 'Untitled Plan',
    description: '',
    status:      ((frontmatter['status'] as string) || 'active') as Plan<T>['status'],
    steps:       [],
    metadata,
  };

  // Parse body into steps
  const bodyLines = body.split('\n');
  const { steps, descriptionLines } = parseStepLines<T>(bodyLines);
  plan.steps = steps;
  plan.description = descriptionLines.join('\n').trim();

  return plan;
}

interface ParsedStepBlock<T> {
  step: Step<T>;
  depth: number;
}

function parseStepLines<T>(lines: string[]): { steps: Step<T>[]; descriptionLines: string[] } {
  const descriptionLines: string[] = [];
  const stepBlocks: ParsedStepBlock<T>[] = [];
  let currentBlock: ParsedStepBlock<T> | null = null;
  let seenStep = false;

  for (const line of lines) {
    const stepMatch = line.match(/^(\s*)- \[(.)\] (.+)$/);
    if (stepMatch) {
      seenStep = true;
      const indent = stepMatch[1]!.length;
      const depth  = Math.floor(indent / 2);
      const checkboxChar = stepMatch[2]!;
      const title  = stepMatch[3]!.trim();
      const status = CHECKBOX_TO_STATUS[`[${checkboxChar}]`] ?? 'pending';

      currentBlock = {
        depth,
        step: {
          id:           generateId(),
          title,
          description:  '',
          status,
          dependencies: [],
          metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        } as Step<T>,
      };
      stepBlocks.push(currentBlock);
      continue;
    }

    // ID comment
    const idMatch = line.match(/<!--\s*id:\s*(\S+)\s*-->/);
    if (idMatch && currentBlock) {
      currentBlock.step.id = idMatch[1]!;
      continue;
    }

    // Note (blockquote)
    const noteMatch = line.match(/^\s*>\s*(.+)$/);
    if (noteMatch && currentBlock) {
      currentBlock.step.notes = (currentBlock.step.notes ? currentBlock.step.notes + '\n' : '') + noteMatch[1]!;
      continue;
    }

    // Description line (belongs to current step)
    if (currentBlock && line.trim() && !line.match(/^\s*$/)) {
      const desc = line.trim();
      currentBlock.step.description = currentBlock.step.description
        ? `${currentBlock.step.description}\n${desc}` : desc;
      continue;
    }

    // Pre-step content = plan description
    if (!seenStep && line.trim()) {
      descriptionLines.push(line);
    }
  }

  // Build tree from flat list using depth
  const rootSteps: Step<T>[] = [];
  const depthStack: Array<{ step: Step<T>; depth: number }> = [];

  for (const block of stepBlocks) {
    // Pop stack until we find a parent at lower depth
    while (depthStack.length > 0 && depthStack[depthStack.length - 1]!.depth >= block.depth) {
      depthStack.pop();
    }

    if (depthStack.length === 0) {
      rootSteps.push(block.step);
    } else {
      const parent = depthStack[depthStack.length - 1]!.step;
      if (!parent.subSteps) parent.subSteps = [];
      parent.subSteps.push(block.step);
    }

    depthStack.push(block);
  }

  return { steps: rootSteps, descriptionLines };
}

// ---------------------------------------------------------------------------
// updateStepInMarkdown
// ---------------------------------------------------------------------------

/**
 * Update the checkbox status of a specific step in Markdown (in-place).
 * Preserves all other content.
 */
export function updateStepInMarkdown(
  markdown: string,
  stepId: string,
  newStatus: StepStatus,
): string {
  const lines = markdown.split('\n');
  const newCheckbox = STATUS_TO_CHECKBOX[newStatus];

  for (let i = 0; i < lines.length; i++) {
    // Look for the ID comment on the next line
    if (i + 1 < lines.length) {
      const idMatch = lines[i + 1]!.match(/<!--\s*id:\s*(\S+)\s*-->/);
      if (idMatch && idMatch[1] === stepId) {
        // Update the checkbox on the current line
        lines[i] = lines[i]!.replace(/\[.\]/, newCheckbox);
      }
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

function parseFrontmatter(text: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const frontmatter: Record<string, string> = {};

  if (!text.startsWith('---')) return { frontmatter, body: text };

  const endIdx = text.indexOf('\n---', 3);
  if (endIdx === -1) return { frontmatter, body: text };

  const fmBlock = text.slice(4, endIdx);
  const body    = text.slice(endIdx + 4).trimStart();

  for (const line of fmBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key   = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

function yamlEscape(value: string): string {
  if (value.includes(':') || value.includes('#') || value.includes('"')) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}
