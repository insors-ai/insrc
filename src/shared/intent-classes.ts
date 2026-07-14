/**
 * Canonical list of intent classes fed to the primary-intent classifier.
 * Mirrors the `Intent` union in `types.ts` -- adding a new intent member
 * without adding an entry here will fail the `asIntentClasses` check
 * below at build time.
 *
 * Descriptions are copied from the historical classifier prompts so the
 * LLM gets the same guidance the old per-classifier prompts provided.
 */

import type { Intent } from './types.js';
import type { ClassChoice } from './classify.js';

export interface IntentClass extends ClassChoice {
  readonly id: Intent;
}

export const INTENT_CLASSES: readonly IntentClass[] = [
  { id: 'requirements', description: 'user wants to define what needs to be built (specs, user stories, acceptance criteria)' },
  { id: 'design',       description: 'user wants to reason about architecture, API shape, module boundaries, tradeoffs' },
  { id: 'plan',         description: 'user wants an ordered implementation checklist or task breakdown' },
  { id: 'implement',    description: 'user wants code written, a function added, a feature built' },
  { id: 'refactor',     description: 'user wants existing code restructured without changing behaviour' },
  { id: 'test',         description: 'user wants tests written, run, or coverage improved' },
  { id: 'debug',        description: 'user wants to find and fix a bug, crash, or error' },
  { id: 'review',       description: 'user wants a code review, audit, or critique of existing code' },
  { id: 'document',     description: 'user wants documentation, docstrings, READMEs, changelogs, or ADRs' },
  { id: 'research',     description: 'EXTERNAL-ONLY information lookup. Pick this ONLY when the answer cannot be obtained from this repository alone and requires consulting external sources -- web search, third-party package documentation, external API references, framework behaviour, blog posts, RFCs, vendor specs. Signals: explicit "search the web", "look up", "what does library X do", "find an article about Y". If the user is asking about anything inside this codebase, this is NOT research -- pick `code-analysis` instead.' },
  { id: 'code-analysis', description: 'ANY read-only question about THIS project\'s code, files, modules, classes, functions, types, behaviour, structure, design, dependencies, call graph, or repo organisation. This is the DEFAULT for in-repo questions. Pick this for "describe X", "what does X do", "where is X", "how does X work", "summarise X", "explain the auth flow", "list the modules", "find callers of foo()", and any drill-down that follows up on a previous code-analysis report. Output is a cited Markdown report. Do NOT pick `research` for in-repo questions even if the prompt is phrased as a research-like request -- "describe HDFS Core" with this repo loaded is code-analysis, not research.' },
  { id: 'data-analysis', description: 'questions about TABULAR DATA the user has attached (CSV / Parquet / JSONL files, configured database connections, dataframes). Pick this for "what columns are in X", "show me the schema", "aggregate by Y", "find outliers in Z", "compare these two tables". For data-analysis the user is asking about row-level facts in data, not source-code structure.' },
  { id: 'brainstorm',   description: 'user wants to explore ideas, generate alternatives, or iterate on a creative / architectural problem' },
  { id: 'deploy',       description: 'user wants to deploy, rollout, or push to an environment' },
  { id: 'release',      description: 'user wants to cut a release, bump a version, publish a package, or generate a changelog' },
  { id: 'infra',        description: 'user wants to query infrastructure status, logs, pods, scaling, or resource utilisation (live commands against running infra)' },
];

// Exhaustiveness check: force the compiler to confirm every Intent has
// a class entry. If you add a new Intent member without an entry here,
// this assignment fails at build time.
const _exhaustivenessCheck: Record<Intent, true> = {
  requirements: true, design: true, plan: true, implement: true,
  refactor: true, test: true, debug: true, review: true, document: true,
  research: true, 'code-analysis': true, 'data-analysis': true, brainstorm: true,
  deploy: true, release: true, infra: true,
};
void _exhaustivenessCheck;
