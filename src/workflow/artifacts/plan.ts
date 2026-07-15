/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * PlanArtifact — the `plan` workflow (4th in the chain).
 *
 * One artifact per Story: the approved LLD in → N ordered, sized,
 * dependency-labelled Tasks out. The atomic unit `build` consumes one
 * Task at a time. Renders to `docs/plans/PLAN-<epic-slug>-<story-id>.md`;
 * canonical JSON at `.insrc/artifacts/PLAN-<epic-hash>-<story-id>.json`.
 *
 * Mirrors `artifacts/lld.ts` in shape. Combines three shared HLD
 * contracts:
 *   - sc1 `PlanTask`          (owned by Story s1)
 *   - sc4 `TaskTestPlan`      (owned by Story s4): TestLevel / TaskTestRef /
 *                             TestStrategyCoverage + checkTestStrategyCoverage
 *   - sc2 `PlanArtifact`      (owned by Story s3): PlanMeta / PlanBody +
 *                             renderPlanMarkdown
 *
 * The deterministic validators (`checkPlanTaskGraph`,
 * `checkTestStrategyCoverage`) are the plan peers of the LLD's
 * cross-artifact checks — they run in `finalizePlan` and fail synthesize
 * (retryable) on violation, never mutating anything.
 */

import { artifactIdMarker, planArtifactId } from '../storage.js';
import type { TestStrategy as LldTestStrategy } from './lld.js';
import type { ArtifactMetaBase, Citation } from '../types.js';

// ---------------------------------------------------------------------------
// sc4 — TaskTestPlan
// ---------------------------------------------------------------------------

export type TestLevel = 'unit' | 'integration' | 'live' | 'smoke';

export interface TaskTestRef {
	readonly level: TestLevel;
	readonly name:  string;                          // human-readable test subject
}

export interface TestStrategyCoverage {
	readonly lldStrategyItem:  string;               // a verbatim item from the LLD testStrategy
	readonly coveredByTaskIds: readonly string[];    // PlanTask ids whose tests[] cover it
}

const TEST_LEVELS: ReadonlySet<string> = new Set<TestLevel>(['unit', 'integration', 'live', 'smoke']);

// ---------------------------------------------------------------------------
// sc1 — PlanTask
// ---------------------------------------------------------------------------

export interface PlanTask {
	readonly id:               string;               // 't1','t2',... scoped to the Story
	readonly title:            string;
	readonly summary:          string;
	readonly size:             'S' | 'M' | 'L';
	readonly order:            number;               // 1-based execution position
	readonly dependsOn:        readonly string[];    // other PlanTask ids in this Story
	readonly acceptanceChecks: readonly string[];    // per-Task done conditions
	readonly derivedFrom:      readonly string[];    // citation ids grounding this Task
	readonly tests:            readonly TaskTestRef[];// named tests (owned by s4 / sc4)
}

// ---------------------------------------------------------------------------
// sc2 — PlanArtifact
// ---------------------------------------------------------------------------

export interface PlanMeta extends ArtifactMetaBase {
	readonly epicHash:         string;
	readonly epicSlug:         string;
	readonly storyId:          string;
	readonly lldRunId:         string;               // the LLD this plan was authored against
	readonly lldEffectiveHash: string;               // for staleness of the plan vs its LLD/HLD
}

export interface PlanBody {
	readonly tasks:                readonly PlanTask[];
	readonly testStrategyCoverage: readonly TestStrategyCoverage[];
}

export interface PlanArtifact {
	readonly meta:      PlanMeta;
	readonly body:      PlanBody;
	readonly citations: readonly Citation[];
}

export const PLAN_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderPlanMarkdown(artifact: PlanArtifact): string {
	const { body, meta } = artifact;
	const lines: string[] = [];
	lines.push(artifactIdMarker(planArtifactId(meta.epicHash, meta.storyId)));
	lines.push('');
	lines.push(`# Plan: ${meta.storyId}`);
	lines.push('');
	lines.push(`**Epic:** \`${meta.epicSlug}\``);
	lines.push(`**LLD run:** \`${meta.lldRunId}\``);
	lines.push(`**LLD effective hash:** \`${meta.lldEffectiveHash.slice(0, 12)}...\``);
	lines.push('');

	lines.push('## Tasks');
	lines.push('');
	lines.push('| # | Task | Size | Depends on | Tests | Derived from |');
	lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');
	for (const t of [...body.tasks].sort((a, b) => a.order - b.order)) {
		const deps  = t.dependsOn.length > 0 ? t.dependsOn.map(d => `\`${d}\``).join(', ') : '—';
		const tests = t.tests.length > 0 ? t.tests.map(x => `${x.level}: ${escapePipes(x.name)}`).join('; ') : '—';
		const cites = t.derivedFrom.map(c => `[[${c}]]`).join(' ');
		lines.push(`| ${t.order} | **\`${t.id}\`** ${escapePipes(t.title)} | ${t.size} | ${deps} | ${escapePipes(tests)} | ${cites} |`);
	}
	lines.push('');

	for (const t of [...body.tasks].sort((a, b) => a.order - b.order)) {
		lines.push(`### \`${t.id}\` — ${t.title}`);
		lines.push('');
		lines.push(t.summary);
		lines.push('');
		if (t.acceptanceChecks.length > 0) {
			lines.push('**Acceptance checks:**');
			for (const ac of t.acceptanceChecks) lines.push(`- ${ac}`);
			lines.push('');
		}
	}

	if (body.testStrategyCoverage.length > 0) {
		lines.push('## Test-strategy coverage');
		lines.push('');
		lines.push('| LLD strategy item | Covered by |');
		lines.push('| :--- | :--- |');
		for (const c of body.testStrategyCoverage) {
			const by = c.coveredByTaskIds.map(id => `\`${id}\``).join(', ');
			lines.push(`| ${escapePipes(c.lldStrategyItem)} | ${by} |`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

function escapePipes(s: string): string { return s.replace(/\|/g, '\\|'); }

// ---------------------------------------------------------------------------
// Runtime type guards
// ---------------------------------------------------------------------------

export function isPlanBody(v: unknown): v is PlanBody {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	if (!Array.isArray(r['tasks'])) return false;
	if (!Array.isArray(r['testStrategyCoverage'])) return false;
	return true;
}

export function isCitationArray(v: unknown): v is Citation[] {
	if (!Array.isArray(v)) return false;
	for (const c of v) {
		if (typeof c !== 'object' || c === null) return false;
		const r = c as Record<string, unknown>;
		if (typeof r['id'] !== 'string' || typeof r['kind'] !== 'string' || typeof r['ref'] !== 'string') return false;
	}
	return true;
}

// ---------------------------------------------------------------------------
// sc1 — PlanTask graph validation (deterministic, run in finalizePlan)
// ---------------------------------------------------------------------------

/** Validate the finalized `PlanTask[]`:
 *   - every id is unique and matches `/^t\d+$/`
 *   - every `dependsOn` id resolves to a real Task (no dangling edge)
 *   - the `dependsOn` graph is acyclic
 *   - `order` is a valid topological order (a Task never precedes one it
 *     depends on)
 *   - `derivedFrom` is non-empty and every id resolves to a `citations[]` id
 *   - design coverage: every citation is referenced by at least one Task's
 *     `derivedFrom` (a grounding item with no covering Task is under-coverage)
 *  Returns a list of issues (empty = ok). Mirrors the define/LLD
 *  cross-artifact-invariant checks. */
export function checkPlanTaskGraph(
	tasks:     readonly PlanTask[],
	citations: readonly Citation[],
): readonly string[] {
	const issues: string[] = [];
	const ids = new Set<string>();
	for (const t of tasks) {
		if (!/^t\d+$/.test(t.id)) issues.push(`Task id '${t.id}' does not match /^t\\d+$/`);
		if (ids.has(t.id)) issues.push(`duplicate Task id '${t.id}'`);
		ids.add(t.id);
		if (t.derivedFrom.length === 0) issues.push(`Task '${t.id}' has empty derivedFrom (every Task must be grounded)`);
	}
	const citationIds = new Set(citations.map(c => c.id));
	for (const t of tasks) {
		for (const dep of t.dependsOn) {
			if (!ids.has(dep)) issues.push(`Task '${t.id}' dependsOn unknown Task id '${dep}'`);
		}
		for (const df of t.derivedFrom) {
			if (!citationIds.has(df)) issues.push(`Task '${t.id}' derivedFrom '${df}' does not resolve to a citation id`);
		}
	}
	// Order must be a valid topological order over dependsOn edges: for
	// A dependsOn B, B.order < A.order.
	const orderOf = new Map(tasks.map(t => [t.id, t.order] as const));
	for (const t of tasks) {
		for (const dep of t.dependsOn) {
			const depOrder = orderOf.get(dep);
			if (depOrder !== undefined && depOrder >= t.order) {
				issues.push(`Task '${t.id}' (order ${t.order}) depends on '${dep}' (order ${depOrder}) — order is not a valid topological order`);
			}
		}
	}
	// Acyclicity via Kahn's algorithm (independent of the declared order).
	const cycle = firstCycle(tasks, ids);
	if (cycle.length > 0) issues.push(`Task dependency graph has a cycle: ${cycle.join(' -> ')}`);
	// Design coverage: every citation must be referenced by some Task.
	const referenced = new Set<string>();
	for (const t of tasks) for (const df of t.derivedFrom) referenced.add(df);
	for (const c of citations) {
		if (!referenced.has(c.id)) issues.push(`design under-coverage: citation '${c.id}' is not derivedFrom by any Task`);
	}
	return issues;
}

/** Return the members of the first detected cycle, or [] if acyclic.
 *  Only considers edges to known ids (dangling edges are reported
 *  separately by the caller). */
function firstCycle(tasks: readonly PlanTask[], ids: ReadonlySet<string>): readonly string[] {
	const indeg = new Map<string, number>();
	const adj = new Map<string, string[]>();
	for (const t of tasks) { indeg.set(t.id, 0); adj.set(t.id, []); }
	for (const t of tasks) {
		for (const dep of t.dependsOn) {
			if (!ids.has(dep)) continue;              // dangling — skip
			adj.get(dep)!.push(t.id);                 // dep -> t
			indeg.set(t.id, (indeg.get(t.id) ?? 0) + 1);
		}
	}
	const queue: string[] = [];
	for (const [id, d] of indeg) if (d === 0) queue.push(id);
	let visited = 0;
	while (queue.length > 0) {
		const n = queue.shift()!;
		visited += 1;
		for (const m of adj.get(n) ?? []) {
			indeg.set(m, (indeg.get(m) ?? 0) - 1);
			if (indeg.get(m) === 0) queue.push(m);
		}
	}
	if (visited === tasks.length) return [];
	// Cycle exists — collect the still-unresolved nodes.
	return [...indeg.entries()].filter(([, d]) => d > 0).map(([id]) => id);
}

// ---------------------------------------------------------------------------
// sc4 — TaskTestPlan coverage validation (deterministic, run in finalizePlan)
// ---------------------------------------------------------------------------

/** Prove the LLD's test strategy is collectively covered by the Tasks'
 *  named tests. Returns a list of issues (empty = ok):
 *   - a Task with an empty `tests[]` (ac1)
 *   - a coverage row referencing an unknown Task id
 *   - a coverage row whose claimed Task carries no matching test
 *   - an LLD strategy item with no covering coverage row (ac2)
 *  The set of LLD strategy items is the union of `testLevels[].subjects`.
 *  Mirrors the existing constraint/acceptance coverage checks. */
export function checkTestStrategyCoverage(
	tasks:          readonly PlanTask[],
	coverage:       readonly TestStrategyCoverage[],
	lldTestStrategy: LldTestStrategy,
): readonly string[] {
	const issues: string[] = [];
	const taskIds = new Set(tasks.map(t => t.id));
	// ac1 — every Task names at least one test.
	for (const t of tasks) {
		if (t.tests.length === 0) issues.push(`Task '${t.id}' has an empty tests[] (every Task must name >=1 test)`);
		for (const tr of t.tests) {
			if (!TEST_LEVELS.has(tr.level)) issues.push(`Task '${t.id}' test '${tr.name}' has invalid level '${tr.level}'`);
		}
	}
	// Coverage rows must reference real Tasks that actually carry a test.
	const covered = new Set<string>();
	for (const row of coverage) {
		covered.add(row.lldStrategyItem);
		if (row.coveredByTaskIds.length === 0) {
			issues.push(`coverage for '${row.lldStrategyItem}' lists no covering Task`);
		}
		for (const id of row.coveredByTaskIds) {
			if (!taskIds.has(id)) {
				issues.push(`coverage for '${row.lldStrategyItem}' references unknown Task id '${id}'`);
				continue;
			}
			const task = tasks.find(t => t.id === id)!;
			if (task.tests.length === 0) {
				issues.push(`coverage for '${row.lldStrategyItem}' claims Task '${id}' but it names no tests`);
			}
		}
	}
	// ac2 — every LLD strategy item is covered.
	const strategyItems = new Set<string>();
	for (const tl of lldTestStrategy.testLevels) for (const s of tl.subjects) strategyItems.add(s);
	for (const item of strategyItems) {
		if (!covered.has(item)) issues.push(`LLD test-strategy item is uncovered by any Task: '${item}'`);
	}
	return issues;
}
