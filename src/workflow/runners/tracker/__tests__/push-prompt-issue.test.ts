/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-5f9d4ab4c90c0b4c s1/t3 unit tests: pushPrompt/pushVerifyPrompt branch
 * on the context's headKind. headKind 'issue' yields the single-issue ISSUE
 * block (ONE issue, body = prerendered epicBodyMd verbatim, labels epicLabel +
 * epic:<slug>, adoption without --force via singular --add-label, no
 * 'error unless' / task-list / backRef / sub-issue text); headKind 'def'
 * (or absent) is byte-identical to the pre-change DEF prompt.
 *
 * Run: npx tsx --test src/workflow/runners/tracker/__tests__/push-prompt-issue.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pushPrompt, pushVerifyPrompt } from '../index.js';
import type { PushContext } from '../schemas.js';

const GH = { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' };

function defContext(): PushContext {
	return {
		kind: 'push', epicHash: 'aaaa1111bbbb2222', epicSlug: 'def-item',
		gh: GH,
		epicTitle: 'DEF title.',
		epicBodyMd: '## Problem\n\nx',
		stories: [{ id: 's1', title: 'Story', bodyMd: '## User value\n\nuv' }],
		force: false,
	};
}

function issueContext(): PushContext {
	return {
		kind: 'push', epicHash: '5f9d4ab4c90c0b4c', epicSlug: 'issue-item', headKind: 'issue',
		gh: GH,
		epicTitle: 'ISSUE title verbatim',
		epicBodyMd: '# ISSUE title verbatim\n\n## Reproduction\n\nsteps',
		stories: [{ id: 's1', title: 'ISSUE title verbatim', bodyMd: '## User value\n\nISSUE title verbatim\n' }],
		force: false,
	};
}

test('src/workflow/runners/tracker/index.ts pushPrompt/pushVerifyPrompt — headKind \'issue\' contains ISSUE block, NOT \'error unless\'/task-list/backRef/sub-issue; headKind \'def\' byte-identical to baseline', () => {
	// DEF prompt: BYTE-IDENTICAL to the pre-change (pre-t3) baseline — a full
	// string equality against the exact pre-change prompt text, not substrings.
	const def = pushPrompt(defContext());
	const defVerify = pushVerifyPrompt(defContext());
	const C = defContext();
	const baselinePush = [
		'You are running the `execute` step of `tracker.push`.',
		'',
		`Push Epic \`${C.epicSlug}\` + Stories to \`${C.gh.owner}/${C.gh.repo}\`.`,
		'',
		// CONVENTIONS_BLOCK — captured verbatim from the pre-t3 source
		'ARTIFICIAL EPIC / STORY HIERARCHY ON TOP OF GITHUB ISSUES',
		'  1. Labels identify type + Epic membership:',
		'     - `<epicLabel>` on the Epic issue only (default: `insrc:epic`)',
		'     - `<storyLabel>` on every Story issue (default: `insrc:story`)',
		'     - `epic:<slug>` on the Epic and every Story',
		'  2. Task-list linkage: the Epic issue body contains a `## Stories` section',
		'     with GitHub task-list items linking to each Story issue.',
		'  3. Back-reference: every Story body starts with `**Epic:** #<epicIssueNumber>`.',
		'  4. Doc links: the Epic body links to its nested DEF/HLD under',
		'     `docs/epics/<slug>-E<date><hash8>/`; each Story body links to that work',
		"     item's `S<nnn>/LLD.md`. (The Epic issue body is pre-rendered",
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
		"  - The framework writes the doc→issue links locally after you return the refs — you don't.",
		'',
		'ORDER OF OPERATIONS:',
		`  1. Ensure the labels \`${C.gh.epicLabel}\`, \`${C.gh.storyLabel}\`, \`epic:${C.epicSlug}\`, ` +
		'`insrc:in-progress`, `insrc:blocked` exist. Create the missing ones idempotently ' +
		'(`gh label create --force` is fine for labels you own).',
		'  2. Create ONE Story issue at a time (Epic body needs their #numbers).',
		'  3. Create the Epic issue with a body containing the `## Stories` task list.',
		'  4. Skip milestone creation (useMilestones=false).',
		'  5. If existing refs are present in `existingRefs`, treat as an error unless the user re-runs with --force.',
		'',
		'DELIBERATELY NOT USED (per plan):',
		'  - Projects v2 (workspace scope + OAuth surface).',
		'  - Sub-issues + issue types (enable with `pushTasks` in the github config).',
		'  - Cross-repo Epics.',
		'',
		'RETURN:',
		'  Emit the refs JSON matching the schema. `epicRef` = `<owner>/<repo>#<N>`; `storyRefs` = { storyId: ref }.',
		'  Do not print anything else.',
	].join('\n');
	const baselineVerify = [
		'You are running the `checklist.verify` step of `tracker.push`.',
		'',
		`Verify the just-pushed refs against the conventions on \`${C.gh.owner}/${C.gh.repo}\`.`,
		'',
		'CHECKLIST ITEMS (grade each pass/fail; use `gh issue view --json labels,body,state` for each):',
		`  epicLabelled:    Epic issue has \`${C.gh.epicLabel}\` and \`epic:${C.epicSlug}\` labels.`,
		`  storyLabelled:   Every Story issue has \`${C.gh.storyLabel}\` and \`epic:${C.epicSlug}\` labels.`,
		'  taskList:        Epic body contains a `## Stories` task list referencing every Story issue.',
		'  backRef:         Every Story body starts with `**Epic:** #` referencing the Epic.',
		'  milestone:       (skipped — useMilestones=false)',
		'',
		'RETURN:',
		'  Emit `{ items: [{ itemId, verdict, notes? }], failedCount }`.',
	].join('\n');
	assert.equal(def, baselinePush, 'DEF pushPrompt must equal the pre-t3 baseline byte-for-byte');
	assert.equal(defVerify, baselineVerify, 'DEF pushVerifyPrompt must equal the pre-t3 baseline byte-for-byte');
	assert.ok(!def.includes('ISSUE-anchored'), 'DEF prompt has no ISSUE block');
	assert.ok(!def.includes('PRERENDERED ISSUE BODY'), 'DEF prompt has no prerendered ISSUE body block');

	// ISSUE prompt: single issue, authoritative prerendered body, adoption
	// without --force, and NONE of the DEF-only instructions.
	const iss = pushPrompt(issueContext());
	assert.ok(iss.includes('ISSUE-anchored work item'));
	assert.ok(iss.includes('SINGLE issue'), iss.slice(0, 400));
	assert.ok(iss.includes('PRERENDERED ISSUE BODY (use verbatim):'));
	assert.ok(iss.includes('# ISSUE title verbatim\n\n## Reproduction\n\nsteps'), 'body embedded verbatim');
	assert.ok(iss.includes('`insrc:epic`, `epic:issue-item`'), 'labels are epicLabel + epic:<slug> only');
	// the WHOLE ISSUE execute prompt must carry no active DEF-hierarchy
	// instruction: no story label, no task-list, no back-ref, no sub-issues,
	// no 'error unless' — the ISSUE conventions block retracts them explicitly.
	for (const banned of ['`insrc:story`', 'Task-list linkage', '## Stories` section', 'Back-reference: every Story body', 'Create ONE Story issue', 'error unless']) {
		assert.ok(!iss.includes(banned), `ISSUE prompt must not contain DEF-hierarchy '${banned}'`);
	}
	// the retraction lines themselves name the concepts with a NO prefix — assert on those
	assert.ok(iss.includes('NO `## Stories` task-list rewrite and NO `**Epic:**` back-reference'), 'retraction line present');
	assert.ok(iss.includes('NO `<storyLabel>`'), 'story label retracted');
	// and the raw DEF convention lines must be absent (only the NO-prefixed retraction may mention them)
	assert.ok(!iss.includes('     - `<storyLabel>` on every Story issue'), 'DEF story-label convention line absent');
	// the NOT-USED list names the DEF-only pieces
	assert.ok(iss.includes('Story sub-issues, story labels'), 'names story labels as not used');
	assert.ok(!iss.includes('error unless'), 'the existing-refs error rule does NOT apply');
	assert.ok(!def.includes('ADOPT the existing issue'));
	// adoption variant: existing epicRef present -> adopt without --force
	const issAdopt = pushPrompt({ ...issueContext(), existingRefs: { epicRef: 'acme/demo#42', storyRefs: { s1: 'acme/demo#42' } }, force: false });
	assert.ok(issAdopt.includes('ADOPT the existing issue acme/demo#42'), issAdopt);
	assert.ok(issAdopt.includes('--add-label "insrc:epic,epic:issue-item"'), 'singular --add-label on adoption');
	assert.ok(issAdopt.includes('do NOT create a duplicate'));
	assert.ok(!issAdopt.includes('error unless'), 'adoption is not an error without --force');

	// ISSUE verify: exactly issueLabelled + bodyMatches + singleIssue (+ milestone note)
	const issVerify = pushVerifyPrompt(issueContext());
	assert.ok(issVerify.includes('issueLabelled'));
	assert.ok(issVerify.includes('bodyMatches'));
	assert.ok(issVerify.includes('singleIssue'));
	for (const banned of ['storyLabelled', 'taskList', 'backRef', 'taskLabelled', 'subIssue', 'taskCoverage']) {
		assert.ok(!issVerify.includes(banned), `ISSUE verify must not grade DEF-only '${banned}'`);
	}
	// DEF prompts are unchanged when headKind is absent (byte-identical above)
	// and when explicitly 'def':
	assert.equal(pushPrompt({ ...defContext(), headKind: 'def' }), def, 'headKind def === absent (byte-identical)');
	assert.equal(pushVerifyPrompt({ ...defContext(), headKind: 'def' }), defVerify);
});
