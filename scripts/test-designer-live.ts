#!/usr/bin/env tsx
/**
 * Live Designer Agent test — runs the full iterative pipeline using the new
 * agent framework with auto-approve gates.
 *
 * Designs a generic planning module with:
 *   - Data structures for creating/maintaining plans
 *   - Progress tracking and updating
 *   - Reading/writing plans in MD format
 *
 * Run with: npx tsx scripts/test-designer-live.ts
 *
 * Uses ANTHROPIC_API_KEY from env or ~/.insrc/config.json for Claude steps.
 * If neither is set, falls back to Ollama for both local and Claude roles.
 */

const CYAN   = '\x1b[36m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const DIM    = '\x1b[2m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

function section(title: string) {
  console.log(`\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${CYAN}  ${title}${RESET}`);
  console.log(`${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
}

function progress(msg: string) {
  console.log(`${DIM}${msg}${RESET}`);
}

function ok(msg: string) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

function fail(msg: string) {
  console.log(`${RED}✗${RESET} ${msg}`);
}

function warn(msg: string) {
  console.log(`${YELLOW}⚠${RESET} ${msg}`);
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { OllamaProvider } from '../src/agent/providers/ollama.js';
import { ClaudeProvider } from '../src/agent/providers/claude.js';
import { loadConfig } from '../src/agent/config.js';
import { resolveTemplate } from '../src/agent/tasks/designer/index.js';
import { designerAgent } from '../src/agent/tasks/designer/agent.js';
import type { DesignerState } from '../src/agent/tasks/designer/agent-state.js';
import type { DesignerInput, DesignerResult } from '../src/agent/tasks/designer/types.js';
import { runAgent } from '../src/agent/framework/runner.js';
import type { AgentDefinition } from '../src/agent/framework/types.js';
import { TestChannel, type ScriptedReply } from '../src/agent/framework/test-channel.js';
import { assembleDocument } from '../src/agent/tasks/designer/assembly.js';

// ---------------------------------------------------------------------------
// Setup providers
// ---------------------------------------------------------------------------

section('Provider Setup');

const ollama = new OllamaProvider();
const alive = await ollama.ping();
if (!alive) {
  console.error(`${RED}Ollama is not running. Start it with: ollama serve${RESET}`);
  process.exit(1);
}
ok('Ollama reachable');

let claudeProvider: InstanceType<typeof ClaudeProvider> | OllamaProvider;
const config = loadConfig();
const anthropicKey = process.env.ANTHROPIC_API_KEY ?? config.keys.anthropic;

if (anthropicKey) {
  claudeProvider = new ClaudeProvider({ apiKey: anthropicKey });
  ok(`Claude provider initialized (key from ${process.env.ANTHROPIC_API_KEY ? 'env' : '~/.insrc/config.json'})`);
} else {
  warn('No Anthropic API key found (env or config) — using Ollama for both local and Claude roles');
  claudeProvider = new OllamaProvider();
}

// ---------------------------------------------------------------------------
// Build designer input
// ---------------------------------------------------------------------------

section('Designer Pipeline — Planning Module Design');

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

const template = resolveTemplate({ format: 'html' });

const input: DesignerInput = {
  message: DESIGN_PROMPT,
  codeContext: '', // No specific code context — we're designing from scratch
  template,
  intent: 'design',
  session: {
    repoPath: process.cwd(),
    closureRepos: [process.cwd()],
  },
};

// ---------------------------------------------------------------------------
// Create auto-approve channel
//
// The TestChannel is pre-loaded with enough 'approve' replies to cover
// all possible gates (requirements + sketch + detail per requirement).
// Generous count — unused replies are fine.
// ---------------------------------------------------------------------------

const MAX_GATES = 50;
const replies: ScriptedReply[] = Array.from({ length: MAX_GATES }, () => ({ action: 'approve' }));
const channel = new TestChannel(replies);

// Wire progress/emit messages to console
const origSend = channel.send.bind(channel);
channel.send = (msg) => {
  origSend(msg);
  if (msg.kind === 'progress') {
    progress((msg.payload as { message: string }).message);
  } else if (msg.kind === 'emit') {
    // Don't print full emit during the run (we print the result at the end)
  } else if (msg.kind === 'checkpoint') {
    progress(`  checkpoint: ${(msg.payload as { label: string }).label}`);
  }
};

// ---------------------------------------------------------------------------
// Run the agent
// ---------------------------------------------------------------------------

const startTime = Date.now();

console.log(`\n${BOLD}Running designer agent (auto-approve via TestChannel)...${RESET}\n`);

let finalState: DesignerState | null = null;

try {
  const runResult = await runAgent({
    definition: designerAgent as unknown as AgentDefinition,
    channel,
    options: { input, repo: process.cwd() },
    config,
    providers: { local: ollama, claude: claudeProvider },
  });

  finalState = runResult.result as DesignerState;
  ok(`Agent completed in ${runResult.steps} steps (runId: ${runResult.runId})`);
} catch (err) {
  console.error(`\n${RED}Agent error:${RESET}`, err);
  process.exit(1);
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

// ---------------------------------------------------------------------------
// Build the DesignerResult from final state for validation
// ---------------------------------------------------------------------------

const result: DesignerResult = assembleDocument(template, 'Planning Module Design', finalState.todos);

// ---------------------------------------------------------------------------
// Validate results
// ---------------------------------------------------------------------------

section('Results Validation');

const gateCount = channel.getGates().length;
const progressCount = channel.getProgress().length;
const checkpointCount = channel.getCheckpoints().length;

console.log(`${DIM}Pipeline completed in ${elapsed}s${RESET}`);
console.log(`${DIM}Messages: ${channel.messages.length} total (${progressCount} progress, ${gateCount} gates, ${checkpointCount} checkpoints)${RESET}\n`);

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    ok(label);
  } else {
    failed++;
    fail(label);
  }
  if (detail) console.log(`${DIM}  → ${detail}${RESET}`);
}

check('Final state is present', !!finalState);
check('Result kind is "document"', result.kind === 'document', `got: ${result.kind}`);
check('Output format is "html"', result.format === 'html', `got: ${result.format}`);
check('Template ID is "default-html"', result.templateId === 'default-html', `got: ${result.templateId}`);
check('Output is non-empty', result.output.length > 100, `length: ${result.output.length}`);

// Requirements checks
check(
  'Requirements list is non-empty',
  result.requirements.length > 0,
  `count: ${result.requirements.length}`,
);

const doneReqs = result.requirements.filter(r => r.state === 'done');
check(
  'At least one requirement completed',
  doneReqs.length > 0,
  `done: ${doneReqs.length}, skipped: ${result.requirements.length - doneReqs.length}`,
);

// Check that requirements cover the expected topics
const allStatements = result.requirements.map(r => r.statement.toLowerCase()).join(' ');
check(
  'Requirements mention data structures / plan types',
  /plan|struct|type|interface|data/i.test(allStatements),
  'Looking for plan/struct/type/interface keywords',
);
check(
  'Requirements mention progress or tracking',
  /progress|track|status|transition/i.test(allStatements),
  'Looking for progress/track/status keywords',
);
check(
  'Requirements mention markdown or serialization',
  /markdown|md|serial|parse|write|read|format/i.test(allStatements),
  'Looking for markdown/serialize/parse keywords',
);

// Sketches
check(
  'Sketches array is non-empty',
  result.sketches.length > 0,
  `count: ${result.sketches.length}`,
);

// Structured extraction
check(
  'Structured extraction has newEntities',
  result.structured.newEntities.length > 0,
  `count: ${result.structured.newEntities.length}`,
);

if (result.structured.newEntities.length > 0) {
  const entityNames = result.structured.newEntities.map(e => e.name).join(', ');
  console.log(`${DIM}  New entities: ${entityNames}${RESET}`);
}

if (result.structured.reusedEntities.length > 0) {
  const reused = result.structured.reusedEntities.map(e => e.entity).join(', ');
  console.log(`${DIM}  Reused entities: ${reused}${RESET}`);
}

check(
  'Summary is non-empty',
  result.summary.length > 0,
  `"${result.summary.slice(0, 100)}..."`,
);

// Output content checks (HTML)
check(
  'Output contains <h1> heading',
  /<h1[\s>]/i.test(result.output),
  'HTML h1 heading present',
);
check(
  'Output contains <h2> subheadings',
  (result.output.match(/<h2[\s>]/gi) ?? []).length >= 2,
  `h2 count: ${(result.output.match(/<h2[\s>]/gi) ?? []).length}`,
);
check(
  'Output contains <!DOCTYPE html> or <html>',
  /<!doctype html>|<html/i.test(result.output),
  'Valid HTML document',
);

// Agent framework-specific checks
check(
  'Done message was sent',
  !!channel.getDone(),
  'Channel received done message',
);
check(
  'Checkpoints were written',
  checkpointCount > 0,
  `${checkpointCount} checkpoint(s)`,
);
check(
  'All scripted replies were not exhausted',
  channel.remainingReplies > 0,
  `${channel.remainingReplies} unused replies (out of ${MAX_GATES})`,
);

// ---------------------------------------------------------------------------
// Print the output document
// ---------------------------------------------------------------------------

section('Generated Design Document');

// Write HTML output to design/
import { writeFileSync } from 'node:fs';
const outPath = new URL('../design/planner-module.html', import.meta.url).pathname;
writeFileSync(outPath, result.output, 'utf-8');
ok(`Written to ${outPath}`);

console.log(result.output.slice(0, 2000));
console.log(`${DIM}... (${result.output.length} chars total, full output written to file)${RESET}`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

section('Test Summary');

console.log(`${GREEN}Passed: ${passed}${RESET}`);
if (failed > 0) {
  console.log(`${RED}Failed: ${failed}${RESET}`);
} else {
  console.log(`${DIM}Failed: 0${RESET}`);
}
console.log(`${DIM}Total time: ${elapsed}s${RESET}`);
console.log('');

process.exit(failed > 0 ? 1 : 0);
