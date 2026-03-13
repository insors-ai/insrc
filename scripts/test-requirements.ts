#!/usr/bin/env tsx
/**
 * Quick test — runs ONLY the requirements extraction + enhancement phase.
 * Prints Ollama's raw list, Claude's enhanced list, and the parsed count.
 *
 * Run with: INSRC_LOG_LEVEL=debug npx tsx scripts/test-requirements.ts
 */

import { OllamaProvider } from '../src/agent/providers/ollama.js';
import { ClaudeProvider } from '../src/agent/providers/claude.js';
import { loadConfig } from '../src/agent/config.js';
import {
  extractRequirements,
  enhanceRequirements,
  parseRequirementsList,
} from '../src/agent/tasks/designer/requirements.js';
import type { DesignerInput } from '../src/agent/tasks/designer/types.js';

const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const DIM   = '\x1b[2m';
const BOLD  = '\x1b[1m';
const RESET = '\x1b[0m';

// --- Providers ---
const ollama = new OllamaProvider();
if (!(await ollama.ping())) {
  console.error('Ollama not running');
  process.exit(1);
}

const config = loadConfig();
const apiKey = process.env.ANTHROPIC_API_KEY ?? config.keys.anthropic;
const claude = apiKey ? new ClaudeProvider({ apiKey }) : ollama;

// --- Input ---
const DESIGN_PROMPT = `Design a generic planning module for the insrc agent framework.

The module should support:

1. **Generic Plan Data Structures**
   - A base Plan type that holds a title, description, list of steps/tasks, metadata (created, updated timestamps, author)
   - Each Step/Task should have: id, title, description, status (pending/in-progress/done/blocked/skipped), dependencies (other step ids), optional assignee, optional notes
   - Support for nested sub-steps (tree structure)
   - Plan-level status derived from step statuses
   - **Extensible design**: the base Plan and Step types should be generic/extensible so that specific plan types (e.g., ImplementationPlan, TestPlan, MigrationPlan, DesignPlan) can add domain-specific fields while inheriting the common structure and behavior

2. **Progress Tracking & Updating**
   - Functions to transition step status with validation (e.g., can't mark done if dependencies aren't done)
   - Progress summary: count of steps by status, percentage complete
   - History/changelog: track when each status transition happened
   - Blocking detection: identify which steps are blocked and why

3. **Markdown Serialization**
   - Write a Plan to a well-formatted MD file with checkboxes, nested lists, metadata frontmatter
   - Parse an MD file back into the Plan data structure (round-trip fidelity)
   - Support for partial updates (update a single step's status in-place without rewriting the whole file)
   - Frontmatter with YAML metadata (title, author, created, updated)

4. **Extensibility for Specific Plan Types**
   - ImplementationPlan: adds file paths, code references, estimated complexity per step
   - TestPlan: adds test categories (unit/integration/e2e), coverage targets, fixtures
   - MigrationPlan: adds rollback steps, data validation checkpoints
   - Each specialization should reuse the core plan engine (status transitions, progress tracking, MD serialization) without duplication

The module should be designed as a standalone TypeScript library within src/agent/planner/ that other agents can import.
Consider error handling, edge cases (circular dependencies, empty plans), and testability.`;

const input: DesignerInput = {
  message: DESIGN_PROMPT,
  codeContext: '',
  template: { id: 'default-md', format: 'markdown', sections: [], css: '' },
  intent: 'design',
  session: { repoPath: process.cwd(), closureRepos: [process.cwd()] },
};

// --- Run ---
console.log(`${BOLD}Step 1: Ollama extracting requirements...${RESET}`);
const rawList = await extractRequirements(input, ollama);
const ollamaParsed = parseRequirementsList(rawList);
console.log(`\n${CYAN}--- Ollama raw (${ollamaParsed.length} items) ---${RESET}`);
console.log(rawList);

console.log(`\n${BOLD}Step 2: Claude enhancing...${RESET}`);
const enhanced = await enhanceRequirements(rawList, input, claude);
const claudeParsed = parseRequirementsList(enhanced);
console.log(`\n${CYAN}--- Claude enhanced (${claudeParsed.length} items) ---${RESET}`);
console.log(enhanced);

console.log(`\n${GREEN}Ollama: ${ollamaParsed.length} requirements${RESET}`);
console.log(`${GREEN}Claude: ${claudeParsed.length} requirements${RESET}`);
console.log(`${DIM}Delta: ${claudeParsed.length - ollamaParsed.length > 0 ? '+' : ''}${claudeParsed.length - ollamaParsed.length}${RESET}`);
