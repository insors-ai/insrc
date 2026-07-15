/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tracker runners — Phase F.
 *
 * Three workflows, three runners each:
 *   tracker.push:
 *     s1: context.assemble  — deterministic (Epic + gh config)
 *     s2: execute           — LLM turn (invokes `gh` directly)
 *     s3: checklist.verify  — LLM turn (audits refs against conventions)
 *   tracker.sync:
 *     s1: context.assemble  — deterministic (existing tracker refs)
 *     s2: execute           — LLM turn (reads issue states)
 *     s3: checklist.verify  — LLM turn (status mapping cross-check)
 *   tracker.post:
 *     s1: context.assemble  — deterministic (target artifact + comment body)
 *     s2: execute           — LLM turn (posts the comment)
 *     s3: checklist.verify  — LLM turn (confirms the comment landed)
 *
 * The framework does NOT wrap `gh`. Every real interaction is in
 * the LLM's execute step; the framework supplies structure +
 * verification.
 */

import { registerRunner } from '../../executor.js';
import type { StepRunner, WorkflowName } from '../../types.js';

import {
	assemblePostContext,
	assemblePushContext,
	assembleSyncContext,
} from './context.js';
import {
	trackerChecklistSchema,
	trackerPostExecuteSchema,
	trackerPushExecuteSchema,
	trackerSyncExecuteSchema,
} from './schemas.js';

// ---------------------------------------------------------------------------
// tracker.push
// ---------------------------------------------------------------------------

const pushContextRunner: StepRunner = {
	id:       'context.assemble',
	workflow: 'tracker.push',
	async run(ctx) {
		const bundle = assemblePushContext(ctx);
		return { type: 'output', output: bundle, summary: `push context assembled for ${bundle.epicSlug}` };
	},
};

const pushExecuteRunner: StepRunner = {
	id:       'execute',
	workflow: 'tracker.push',
	async run(ctx) {
		const c = ctx.stepOutputs['s1'] as ReturnType<typeof assemblePushContext>;
		return {
			type: 'llm-pause',
			prompt: pushPrompt(c),
			userTurn: [
				`Invoke \`gh\` to push the Epic + Stories to \`${c.gh.owner}/${c.gh.repo}\`.`,
				`Return the refs JSON matching the schema.`,
			].join('\n'),
			schema: trackerPushExecuteSchema,
			preparedBlob: { stepId: 'execute' },
		};
	},
	async finalize(llmResponse) {
		return { type: 'output', output: llmResponse };
	},
};

const pushVerifyRunner: StepRunner = {
	id:       'checklist.verify',
	workflow: 'tracker.push',
	async run(ctx) {
		const c = ctx.stepOutputs['s1'] as ReturnType<typeof assemblePushContext>;
		const refs = ctx.stepOutputs['s2'] as Record<string, unknown>;
		return {
			type: 'llm-pause',
			prompt: pushVerifyPrompt(c),
			userTurn: [
				`Verify the refs you emitted match the conventions.`,
				`Refs:`,
				'```json',
				JSON.stringify(refs, null, 2),
				'```',
				'',
				`Confirm each item by inspecting the issues on GitHub (\`gh issue view\`).`,
			].join('\n'),
			schema: trackerChecklistSchema,
			preparedBlob: { stepId: 'checklist.verify' },
		};
	},
	async finalize(llmResponse) {
		return { type: 'output', output: llmResponse };
	},
};

// ---------------------------------------------------------------------------
// tracker.sync
// ---------------------------------------------------------------------------

const syncContextRunner: StepRunner = {
	id:       'context.assemble',
	workflow: 'tracker.sync',
	async run(ctx) {
		const bundle = assembleSyncContext(ctx);
		return { type: 'output', output: bundle, summary: `sync context assembled for ${bundle.epicSlug}` };
	},
};

const syncExecuteRunner: StepRunner = {
	id:       'execute',
	workflow: 'tracker.sync',
	async run(ctx) {
		const c = ctx.stepOutputs['s1'] as ReturnType<typeof assembleSyncContext>;
		return {
			type: 'llm-pause',
			prompt: syncPrompt(c),
			userTurn: [
				`Read the current state of Epic issue \`${c.refs.epicRef}\` and every Story issue.`,
				`Return the sync JSON matching the schema.`,
			].join('\n'),
			schema: trackerSyncExecuteSchema,
			preparedBlob: { stepId: 'execute' },
		};
	},
	async finalize(llmResponse) {
		return { type: 'output', output: llmResponse };
	},
};

const syncVerifyRunner: StepRunner = {
	id:       'checklist.verify',
	workflow: 'tracker.sync',
	async run(ctx) {
		const c = ctx.stepOutputs['s1'] as ReturnType<typeof assembleSyncContext>;
		const refs = ctx.stepOutputs['s2'] as Record<string, unknown>;
		return {
			type: 'llm-pause',
			prompt: syncVerifyPrompt(c),
			userTurn: [
				`Sync payload:`,
				'```json',
				JSON.stringify(refs, null, 2),
				'```',
				'',
				`Re-check each status by cross-referencing the labels + state on GitHub.`,
			].join('\n'),
			schema: trackerChecklistSchema,
			preparedBlob: { stepId: 'checklist.verify' },
		};
	},
	async finalize(llmResponse) {
		return { type: 'output', output: llmResponse };
	},
};

// ---------------------------------------------------------------------------
// tracker.post
// ---------------------------------------------------------------------------

const postContextRunner: StepRunner = {
	id:       'context.assemble',
	workflow: 'tracker.post',
	async run(ctx) {
		const bundle = assemblePostContext(ctx);
		return { type: 'output', output: bundle, summary: `post context assembled (${bundle.target.kind})` };
	},
};

const postExecuteRunner: StepRunner = {
	id:       'execute',
	workflow: 'tracker.post',
	async run(ctx) {
		const c = ctx.stepOutputs['s1'] as ReturnType<typeof assemblePostContext>;
		return {
			type: 'llm-pause',
			prompt: postPrompt(c),
			userTurn: [
				`Post a comment on \`${c.target.issueRef}\` with the summary body below.`,
				`Return the post JSON matching the schema.`,
				'',
				`Summary body (VERBATIM — post as-is):`,
				'```markdown',
				c.target.summaryMd,
				'```',
			].join('\n'),
			schema: trackerPostExecuteSchema,
			preparedBlob: { stepId: 'execute' },
		};
	},
	async finalize(llmResponse) {
		return { type: 'output', output: llmResponse };
	},
};

const postVerifyRunner: StepRunner = {
	id:       'checklist.verify',
	workflow: 'tracker.post',
	async run(ctx) {
		const refs = ctx.stepOutputs['s2'] as Record<string, unknown>;
		return {
			type: 'llm-pause',
			prompt: postVerifyPrompt(),
			userTurn: [
				`Post payload:`,
				'```json',
				JSON.stringify(refs, null, 2),
				'```',
				'',
				`Confirm the comment exists (\`gh issue view --comments\`).`,
			].join('\n'),
			schema: trackerChecklistSchema,
			preparedBlob: { stepId: 'checklist.verify' },
		};
	},
	async finalize(llmResponse) {
		return { type: 'output', output: llmResponse };
	},
};

// ---------------------------------------------------------------------------
// Prompts — the load-bearing content. Everything about GitHub
// conventions the LLM needs lives here.
// ---------------------------------------------------------------------------

const CONVENTIONS_BLOCK = [
	'ARTIFICIAL EPIC / STORY HIERARCHY ON TOP OF GITHUB ISSUES',
	'  1. Labels identify type + Epic membership:',
	'     - `<epicLabel>` on the Epic issue only (default: `insrc:epic`)',
	'     - `<storyLabel>` on every Story issue (default: `insrc:story`)',
	'     - `epic:<slug>` on the Epic and every Story',
	'  2. Task-list linkage: the Epic issue body contains a `## Stories` section',
	'     with GitHub task-list items linking to each Story issue.',
	'  3. Back-reference: every Story body starts with `**Epic:** #<epicIssueNumber>`.',
	'  4. Doc links: the Epic body links to `docs/defines/DEF-<slug>.md` and',
	'     `docs/designs/HLD-<slug>.md`; each Story body links to',
	'     `docs/designs/LLD-<slug>-<storyId>.md`. (The Epic issue body is pre-rendered',
	'     for you in `epicBodyMd` — use it verbatim.)',
	'  5. Optional milestone: when `useMilestones=true`, create a milestone named',
	'     `<epic-slug>` and attach both the Epic and Story issues to it.',
	'',
	'STATUS MAPPING (sync only):',
	'  - open + no status labels        → open',
	'  - open + `insrc:in-progress`     → in-progress',
	'  - open + `insrc:blocked`         → blocked',
	'  - closed (any labels)            → closed',
	'',
	'TOOLS: use YOUR GitHub tools — the `gh` CLI, a GitHub MCP server, whatever you',
	'have. The framework does NOT run them for you. If you use `gh`, preflight with',
	'`gh auth status` and abort cleanly if unauthenticated.',
	'',
	'HARD RULES:',
	'  - Never delete or rename existing labels or milestones you did not create.',
	'  - Never fabricate issue numbers. Every ref you return must come from a real GitHub response.',
	'  - Reference issues in the shape `<owner>/<repo>#<N>`.',
	'  - Do not commit to files or open PRs. GitHub issues/labels/milestones are your only surface.',
	'  - The framework writes the doc→issue links locally after you return the refs — you don\'t.',
].join('\n');

function pushPrompt(c: ReturnType<typeof assemblePushContext>): string {
	return [
		'You are running the `execute` step of `tracker.push`.',
		'',
		`Push Epic \`${c.epicSlug}\` + Stories to \`${c.gh.owner}/${c.gh.repo}\`.`,
		'',
		CONVENTIONS_BLOCK,
		'',
		'ORDER OF OPERATIONS:',
		`  1. Ensure the labels \`${c.gh.epicLabel}\`, \`${c.gh.storyLabel}\`, \`epic:${c.epicSlug}\`, ` +
		'`insrc:in-progress`, `insrc:blocked` exist. Create the missing ones idempotently ' +
		'(`gh label create --force` is fine for labels you own).',
		'  2. Create ONE Story issue at a time (Epic body needs their #numbers).',
		'  3. Create the Epic issue with a body containing the `## Stories` task list.',
		`  4. ${c.gh.useMilestones ? `Create milestone \`${c.epicSlug}\` and attach every issue.` : 'Skip milestone creation (useMilestones=false).'}`,
		`  5. ${c.force ? 'FORCE MODE: edit existing issues (do not create duplicates); overwrite bodies to match.' : 'If existing refs are present in `existingRefs`, treat as an error unless the user re-runs with --force.'}`,
		'',
		'DELIBERATELY NOT USED (per plan):',
		'  - Sub-issues (Projects-only, 100-child cap).',
		'  - Projects v2 (workspace scope + OAuth surface).',
		'  - Issue types (inconsistent across orgs).',
		'  - Cross-repo Epics.',
		'',
		'RETURN:',
		'  Emit the refs JSON matching the schema. `epicRef` = `<owner>/<repo>#<N>`; `storyRefs` = { storyId: ref }.',
		'  Do not print anything else.',
	].join('\n');
}

function pushVerifyPrompt(c: ReturnType<typeof assemblePushContext>): string {
	return [
		'You are running the `checklist.verify` step of `tracker.push`.',
		'',
		`Verify the just-pushed refs against the conventions on \`${c.gh.owner}/${c.gh.repo}\`.`,
		'',
		'CHECKLIST ITEMS (grade each pass/fail; use `gh issue view --json labels,body,state` for each):',
		`  epicLabelled:    Epic issue has \`${c.gh.epicLabel}\` and \`epic:${c.epicSlug}\` labels.`,
		`  storyLabelled:   Every Story issue has \`${c.gh.storyLabel}\` and \`epic:${c.epicSlug}\` labels.`,
		`  taskList:        Epic body contains a \`## Stories\` task list referencing every Story issue.`,
		`  backRef:         Every Story body starts with \`**Epic:** #\` referencing the Epic.`,
		`  ${c.gh.useMilestones ? `milestone:       Milestone \`${c.epicSlug}\` exists and every issue is attached.` : 'milestone:       (skipped — useMilestones=false)'}`,
		'',
		'RETURN:',
		'  Emit `{ items: [{ itemId, verdict, notes? }], failedCount }`.',
	].join('\n');
}

function syncPrompt(c: ReturnType<typeof assembleSyncContext>): string {
	return [
		'You are running the `execute` step of `tracker.sync`.',
		'',
		`Read current state + labels for Epic issue \`${c.refs.epicRef}\` and every Story issue.`,
		'',
		CONVENTIONS_BLOCK,
		'',
		'READ-ONLY: do NOT edit issues. This step only pulls state.',
		'',
		'Use `gh issue view --json state,labels` for each ref.',
		'',
		'RETURN:',
		'  Emit `{ storyStatus: {storyId: status}, epicStatus, syncedAt, notes? }`.',
	].join('\n');
}

function syncVerifyPrompt(c: ReturnType<typeof assembleSyncContext>): string {
	return [
		'You are running the `checklist.verify` step of `tracker.sync`.',
		'',
		'CHECKLIST ITEMS:',
		'  storyMapping: Every Story status derives from issue state + status labels per the STATUS MAPPING.',
		'  epicMapping:  Epic status derives from issue state + labels.',
		`  freshness:    \`syncedAt\` is within the last minute (server clock).`,
		'  storyKeys:    `storyStatus` keys equal the Epic\'s Story ids exactly (no orphans, no extras).',
		'',
		'RETURN:',
		'  Emit `{ items: [{ itemId, verdict, notes? }], failedCount }`.',
	].join('\n');
	void c;
}

function postPrompt(c: ReturnType<typeof assemblePostContext>): string {
	return [
		'You are running the `execute` step of `tracker.post`.',
		'',
		`Post a comment on \`${c.target.issueRef}\` (target kind: ${c.target.kind}).`,
		'',
		CONVENTIONS_BLOCK,
		'',
		'Use `gh issue comment <ref> --body-file -` and pipe in the summary body VERBATIM.',
		'Do NOT reshape or paraphrase the summary body.',
		'',
		'RETURN:',
		'  Emit `{ targetKind, targetIssue, commentId, commentUrl?, notes? }`.',
	].join('\n');
}

function postVerifyPrompt(): string {
	return [
		'You are running the `checklist.verify` step of `tracker.post`.',
		'',
		'CHECKLIST ITEMS:',
		'  commentExists: `gh issue view --comments` shows the just-created comment id.',
		'  bodyMatch:     Comment body matches the summary body verbatim (no reshaping).',
		'  targetKind:    `targetKind` matches the target you posted to.',
		'',
		'RETURN:',
		'  Emit `{ items: [{ itemId, verdict, notes? }], failedCount }`.',
	].join('\n');
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let registered = false;

export function registerTrackerRunners(): void {
	if (registered) return;
	registerRunner(pushContextRunner);
	registerRunner(pushExecuteRunner);
	registerRunner(pushVerifyRunner);
	registerRunner(syncContextRunner);
	registerRunner(syncExecuteRunner);
	registerRunner(syncVerifyRunner);
	registerRunner(postContextRunner);
	registerRunner(postExecuteRunner);
	registerRunner(postVerifyRunner);
	registered = true;
}

// Kept as a silence-fixup — surfaced for future runner registration
// filters that want to key by WorkflowName.
export type _TrackerNames = Extract<WorkflowName, 'tracker.push' | 'tracker.sync' | 'tracker.post'>;
