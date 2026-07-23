/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared helpers for the `insrc_build_step` phases: repo resolution, task-ref
 * resolution, and the implement/validate prompt renderers.
 *
 * The renderers fill the `src/prompts/build/{implement,validate}-task.md`
 * templates from the resolved `PlanTask` + its Story/Epic anchors. The daemon
 * only ASSEMBLES the prompt here; the controller (implement) or a read-only
 * daemon session (validate) executes it.
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hldMdRel, lldMdRel, planMdRel } from '../../workflow/storage.js';
import { resolveWorkflowRef, type ResolvedRef } from '../../workflow/tracker/resolve.js';
import type { PlanTask } from '../../workflow/artifacts/plan.js';

const IMPLEMENT_TEMPLATE_REL = 'prompts/build/implement-task.md';
const VALIDATE_TEMPLATE_REL  = 'prompts/build/validate-task.md';

/** Repo-standard commands the templates cite (CLAUDE.md conventions). */
const TYPECHECK_CMD = 'npx tsc --noEmit';
const TEST_CMD      = `npx tsx --test 'src/**/__tests__/*.test.ts'`;

// ---------------------------------------------------------------------------
// Repo + task resolution
// ---------------------------------------------------------------------------

/** Session-aware repo resolution: explicit > CWD-contained registered repo >
 *  INSRC_REPO > undefined. Re-exported from the single shared resolver so the
 *  build-step phase handlers keep importing it from here. */
export { resolveRepoPath } from '../resolve-repo.js';

/** A resolved, task-level ref (guaranteed `task !== undefined`). */
export interface ResolvedTask extends ResolvedRef {
	readonly storyId: string;
	readonly taskId:  string;
	readonly task:    PlanTask;
}

export type TaskResolution =
	| { readonly ok: true;  readonly ref: ResolvedTask }
	| { readonly ok: false; readonly message: string };

/** Resolve a target identifier to a TASK-level ref. Returns a typed error
 *  when the target is unknown or resolves to a non-task node. */
export function resolveTaskRef(repoPath: string, target: string): TaskResolution {
	const ref = resolveWorkflowRef(repoPath, target);
	if (ref === null) {
		return {
			ok: false,
			message:
				`insrc_build_step: could not resolve target '${target}'. Pass a task issue ` +
				`(#N / owner/repo#N), a hierarchical task id, or a structural label (s1/t3).`,
		};
	}
	if (ref.level !== 'task' || ref.task === undefined || ref.storyId === undefined || ref.taskId === undefined) {
		return {
			ok: false,
			message:
				`insrc_build_step: target '${target}' resolved to a ${ref.level}, not a task. ` +
				`build operates on a single Task — pass a task-level identifier.`,
		};
	}
	return { ok: true, ref: ref as ResolvedTask };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Fill every `{{key}}` occurrence from `vars` (unknown keys are left as-is). */
function fill(template: string, vars: Readonly<Record<string, string>>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
		Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : whole,
	);
}

/** Common placeholder values shared by both templates. */
function baseVars(repoPath: string, ref: ResolvedTask): Record<string, string> {
	const task = ref.task;
	const acceptanceChecks = task.acceptanceChecks.length > 0
		? task.acceptanceChecks.map(c => `- ${c}`).join('\n')
		: '- (none stated)';
	const tests = task.tests.length > 0
		? task.tests.map(t => `- ${t.level}: ${t.name}`).join('\n')
		: '- (none stated)';
	const dependsOn = task.dependsOn.length > 0 ? task.dependsOn.join(', ') : 'none';
	void repoPath;
	return {
		taskId:           ref.taskId,
		storyId:          ref.storyId,
		epicSlug:         ref.epicSlug,
		issueRef:         ref.issueRef ?? '(no issue)',
		storyRef:         ref.storyRef ?? '(no story issue)',
		taskTitle:        task.title,
		taskSummary:      task.summary,
		size:             task.size,
		dependsOn,
		acceptanceChecks,
		tests,
		lldPath:          lldMdRel(ref.epicSlug, ref.storyId),
		hldPath:          hldMdRel(ref.epicSlug),
		planPath:         planMdRel(ref.epicSlug, ref.storyId),
		typecheckCmd:     TYPECHECK_CMD,
		testCmd:          TEST_CMD,
	};
}

/** Render the implement-task prompt. `resolvedDecisions` fills the
 *  "## Resolved design decisions" section (empty until the open-question gate
 *  populates it in stage 3). */
export function renderImplementPrompt(repoPath: string, ref: ResolvedTask, resolvedDecisions: string): string {
	const template = loadTemplate(IMPLEMENT_TEMPLATE_REL);
	const decisions = resolvedDecisions.trim().length > 0
		? resolvedDecisions
		: '_No design decisions were resolved for this Task; use your judgment within the stated scope._';
	return fill(template, { ...baseVars(repoPath, ref), resolvedDecisions: decisions });
}

/** Render the validate-task prompt (read-only inspect + run tests + emit a
 *  JSON verdict). */
export function renderValidatePrompt(repoPath: string, ref: ResolvedTask): string {
	const template = loadTemplate(VALIDATE_TEMPLATE_REL);
	return fill(template, baseVars(repoPath, ref));
}

/** The spec a standalone (no-plan) build implements. */
export interface StandaloneBuildSpec {
	readonly storyId:     string;
	readonly sizeClass:   string;
	/** true ⇒ Small (implement the approved LLD); false ⇒ Trivial (implement the scope). */
	readonly producesLld: boolean;
	/** Scope statement — the LLD's focus (Small) or the trivial-change scope. */
	readonly focus:       string;
	/** Relative LLD md path to read (Small only). */
	readonly lldMdRel?:   string | undefined;
	readonly resolvedDecisions: string;
}

/** Render the implement prompt for a triage-routed no-plan build. There is no
 *  PlanTask: a Small build implements the approved LLD directly; a Trivial
 *  build implements the scope statement directly. Built inline (no template
 *  asset) — the shape differs enough from the task template to not share it. */
export function renderStandaloneImplementPrompt(spec: StandaloneBuildSpec): string {
	const decisions = spec.resolvedDecisions.trim().length > 0
		? spec.resolvedDecisions
		: '_No design decisions were resolved; use your judgment within the stated scope._';
	const lines: string[] = [
		`# Implement — standalone ${spec.sizeClass} feature (Story \`${spec.storyId}\`)`,
		'',
		spec.producesLld
			? `Implement the approved standalone LLD directly. The LLD is the spec — its ` +
			  `contract, error paths, and test strategy define what to build. There is no ` +
			  `separate plan; treat the LLD as the single unit of work.`
			: `Implement this trivial change directly. It is mechanical and needs no design ` +
			  `artifact — make the smallest correct edit that satisfies the scope, with a ` +
			  `test if one is warranted.`,
		'',
		'## Scope',
		'',
		spec.focus,
	];
	if (spec.lldMdRel !== undefined) {
		lines.push('', '## Design (LLD)', '', `Read \`${spec.lldMdRel}\` and implement its contract + test strategy.`);
	}
	lines.push(
		'', '## Resolved design decisions', '', decisions,
		'', '## Definition of done', '',
		`- \`${TYPECHECK_CMD}\` is clean.`,
		`- \`${TEST_CMD}\` passes (add or extend tests for the change).`,
		'- The edit is minimal and matches the surrounding conventions.',
	);
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Template loading (relative to the insrc root where copy-assets drops prompts)
// ---------------------------------------------------------------------------

function loadTemplate(rel: string): string {
	const abs = isAbsolute(rel) ? rel : resolveRelativeToInsrcRoot(rel);
	return readFileSync(abs, 'utf8');
}

function resolveRelativeToInsrcRoot(relativePath: string): string {
	const thisFile = fileURLToPath(import.meta.url);
	// .../mcp/build-step/render.js -> .../build-step -> .../mcp -> .../insrc-root
	const insrcRoot = resolve(thisFile, '..', '..', '..');
	return resolve(insrcRoot, relativePath);
}
