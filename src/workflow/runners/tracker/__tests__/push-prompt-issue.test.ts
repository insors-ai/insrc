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
import { renderIssueEpicBody } from '../../../tracker/conventions.js';
import { issueArtifactId } from '../../../storage.js';
import type { PushContext } from '../schemas.js';
import { deriveSlug } from '../../../slug.js';
import { epicMembershipLabel } from '../../../tracker/conventions.js';
import { afterEach } from 'node:test';
import { setIssueCandidateLookupForTests } from '../context.js';

afterEach(() => { setIssueCandidateLookupForTests(undefined); });

const GH = { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' };

// REVIEW round-15: the runner revalidates the live ISSUE head against the
// assembled context's epicBodyMd, so runner fixtures must carry the REAL
// rendered body for the fixture issue (title 'T', repro 'r', cause 'c',
// intent 'f', slug 's', hash 5f9d4ab4c90c0b4c) — not a placeholder.
const RENDERED_ISSUE_BODY = renderIssueEpicBody({ body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' } } as never, 's', undefined, issueArtifactId('5f9d4ab4c90c0b4c'));

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

	// REVIEW-5f9d4ab4c90c0b4c MED-2: the ISSUE adoption prompt varies with force —
	// force:true instructs body overwrite, force:false instructs preservation.
	const adoptBase = { ...issueContext(), existingRefs: { epicRef: 'acme/demo#42', storyRefs: { s1: 'acme/demo#42' } } };
	const forced = pushPrompt({ ...adoptBase, force: true });
	const unforced = pushPrompt({ ...adoptBase, force: false });
	assert.ok(forced.includes('FORCE MODE') && forced.includes('overwrite the body'), 'force:true overwrites the body');
	assert.ok(unforced.includes('Do NOT edit the body') && unforced.includes('preserve it as-is'), 'force:false preserves the body');
	assert.notEqual(forced, unforced, 'the two prompts differ');
});

test('REVIEW round-5 MED — ISSUE execute/verify use the canonical epicMembershipLabel for a long slug; raw epic:<slug> (over the 50-char cap) appears nowhere in the ISSUE prompts', () => {
	// Real slug derivation, as the review reproduced offline.
	const focus = 'interoperability synchronization configuration reconciliation authorization tracking';
	const slug = deriveSlug(focus);
	assert.equal(slug, 'interoperability-synchronization-configuration-reconciliatio');
	assert.equal(slug.length, 60, 'valid slug permitted by deriveSlug');
	const canonical = epicMembershipLabel(slug);
	assert.equal(canonical, 'epic:interoperability-synchronization-confi-b51a1b', 'pinned canonical label (readable prefix + sha256 tail)');
	assert.ok(canonical.length <= 50, 'canonical label fits the GitHub 50-char cap');
	const raw = `epic:${slug}`;
	assert.ok(raw.length > 50, 'the raw label would overflow the cap — this is the bug');

	const long = { ...issueContext(), epicSlug: slug };

	// execute, create path: ensure-labels + labels-on-create
	const create = pushPrompt(long);
	assert.ok(create.includes(`Ensure the labels \`${GH.epicLabel}\` and \`${canonical}\` exist`), 'ensure-labels carries the canonical label');
	assert.ok(create.includes(`Labels on create: \`${GH.epicLabel}\`, \`${canonical}\`.`), 'create-labels carries the canonical label');
	assert.ok(!create.includes(raw), 'raw over-cap label absent from the ISSUE execute (create) prompt');

	// execute, adoption path: singular --add-label
	const adopt = pushPrompt({ ...long, existingRefs: { epicRef: 'acme/demo#42', storyRefs: { s1: 'acme/demo#42' } }, force: false });
	assert.ok(adopt.includes(`--add-label "${GH.epicLabel},${canonical}"`), 'adoption adds the canonical label');
	assert.ok(!adopt.includes(raw), 'raw over-cap label absent from the ISSUE execute (adopt) prompt');

	// verify: issueLabelled checklist item
	const verify = pushVerifyPrompt(long);
	assert.ok(verify.includes(`issueLabelled: The issue has \`${GH.epicLabel}\` and \`${canonical}\` labels.`), 'verify grades the canonical label');
	assert.ok(!verify.includes(raw), 'raw over-cap label absent from the ISSUE verify prompt');

	// short slugs are unchanged by the canonical helper (identity for <=50)
	assert.equal(epicMembershipLabel('issue-item'), 'epic:issue-item');

	// DEF branch is preserved as-is: its baseline still emits the raw
	// epic:<slug> (byte-identity requirement covers the DEF prompt only).
	const defLong = pushPrompt({ ...defContext(), epicSlug: slug });
	assert.ok(defLong.includes(`\`epic:${slug}\``), 'DEF prompt baseline keeps the raw epic:<slug>');
});

test('REVIEW round-6 HIGH-1 — a fresh competing owner (live claim) cannot advance or carry the fence: read-only reconcile + adoption prompt, claim untouched, no claimFence', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	const { claimCreateIntent, readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const MARKER = `<!-- insrc:artifact ISSUE-${H} -->`;
	const repo = mkdtempSync(join(tmpdir(), 'insrc-r6-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		const issue = artifactJsonPath(repo, issueArtifactId(H));
		writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
		markApprovedSync(issue);
		// run-A holds a LIVE claim (fresh heartbeat) and the remote issue exists
		claimCreateIntent(repo, H, 'run-A', { title: 'T', marker: MARKER, ghOwner: 'acme', ghRepo: 'demo' });
		const s1 = { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, remoteCandidates: [{ title: `ISSUE-${H} — T`, body: `${MARKER}\n# T`, target: 'acme/demo', ref: 'acme/demo#42' }] };
		const ctx = { intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } }, runId: 'run-B', stepOutputs: { s1 } } as never;
		const out = await pushExecuteRunner.run(ctx) as { type: string; prompt?: string; userTurn?: string };
		assert.equal(out.type, 'llm-pause', 'live foreign claim -> read-only adoption prompt, not a refusal and not a create');
		assert.ok(out.userTurn!.includes('ADOPT the marker-verified issue `acme/demo#42`'), out.userTurn!);
		assert.ok(out.prompt!.includes('ADOPT the existing issue acme/demo#42'), 'the prompt itself carries the adoption instruction');
		assert.ok(!out.prompt!.includes('Create exactly ONE issue'), 'no create dispatched');
		const after = readClaim(repo, H);
		assert.equal(after?.runId, 'run-A', 'live claim still owned by run-A');
		assert.equal(after?.fence, 1, 'fence NOT advanced by the losing run (round-6 HIGH-1)');
		assert.equal((ctx.stepOutputs as { s1: Record<string, unknown> }).s1['claimFence'], undefined, 'no foreign fence carried into finalization');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('REVIEW round-6 HIGH-2 — confirmed pre-dispatch failure recovers: stale never-dispatched claim + 0 verified candidates -> the new owner dispatches the create; runner-to-finalizer persists and releases the claim', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [] }));   // round-10: fresh complete lookup authorizes the recovery create
	const { claimCreateIntent, readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { readTrackerMeta } = await import('../../../tracker/refs.js');
	const { _finalizeTracker } = await import('../../../orchestrator.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const MARKER = `<!-- insrc:artifact ISSUE-${H} -->`;
	const repo = mkdtempSync(join(tmpdir(), 'insrc-r6b-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		const issue = artifactJsonPath(repo, issueArtifactId(H));
		writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
		markApprovedSync(issue);
		// run-A claimed long ago and died BEFORE dispatching the create (stale heartbeat, no dispatchedAt)
		claimCreateIntent(repo, H, 'run-A', { title: 'T', marker: MARKER, ghOwner: 'acme', ghRepo: 'demo', now: () => '2020-01-01T00:00:00.000Z' });
		const s1 = { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, remoteCandidates: [] as unknown[] };
		const ctx = { intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } }, runId: 'run-B', stepOutputs: { s1 } } as never;
		const out = await pushExecuteRunner.run(ctx) as { type: string; prompt?: string };
		assert.equal(out.type, 'llm-pause');
		assert.ok(out.prompt!.includes('Create exactly ONE issue'), 'pre-dispatch failure recovers by dispatching the create: ' + out.prompt!.slice(0, 300));
		const claim = readClaim(repo, H);
		assert.equal(claim?.runId, 'run-B', 'takeover ownership recorded');
		assert.ok(claim?.dispatchedAt !== undefined, 'dispatch recorded on the claim');
		const carried = (ctx.stepOutputs as { s1: Record<string, unknown> }).s1['claimFence'];
		assert.equal(carried, claim?.fence, 'the carried fence is this run\'s own committed fence');
		assert.equal((ctx.stepOutputs as { s1: Record<string, unknown> }).s1['claimRunId'], 'run-B', 'round-7 HIGH-3: the fence travels together with the carrying run id');
		// runner -> finalizer: the create returns refs; finalize persists issueRef + bindings and releases the claim
		const intent = { workflow: 'tracker.push', focus: 'push', repoPath: repo, repoIndexedAt: null, params: { epicHash: H } } as never;
		const res = await _finalizeTracker(intent, { s1: (ctx.stepOutputs as { s1: unknown }).s1 } as never, 'run-B', 5, {
			refs: { epicRef: 'acme/demo#42', storyRefs: { s1: 'acme/demo#42' }, labelsCreated: [] },
			checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 },
		}, 'm');
		assert.equal(res.ok, true, JSON.stringify(res));
		assert.equal(readTrackerMeta(issue)?.issueRef, 'acme/demo#42', 'issueRef persisted through the recovered create');
		assert.equal(readClaim(repo, H), undefined, 'claim released by finalize after persistence');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('REVIEW round-6 HIGH-2 — ambiguous outcome (dispatched but response lost, 0 candidates) refuses with an explicit resolution path, retains the claim, dispatches no create', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [] }));
	const { claimCreateIntent, markClaimDispatched, readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const MARKER = `<!-- insrc:artifact ISSUE-${H} -->`;
	const repo = mkdtempSync(join(tmpdir(), 'insrc-r6c-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		const issue = artifactJsonPath(repo, issueArtifactId(H));
		writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
		markApprovedSync(issue);
		// run-A claimed, DISPATCHED the create, then died with the response lost (stale heartbeat)
		const a = claimCreateIntent(repo, H, 'run-A', { title: 'T', marker: MARKER, ghOwner: 'acme', ghRepo: 'demo', now: () => '2020-01-01T00:00:00.000Z' });
		await markClaimDispatched(repo, H, a.claim.fence, 'run-A', () => '2020-01-01T00:01:00.000Z');
		const s1 = { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, remoteCandidates: [] as unknown[] };
		const ctx = { intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } }, runId: 'run-B', stepOutputs: { s1 } } as never;
		const out = await pushExecuteRunner.run(ctx) as { type: string; code?: string; message?: string; prompt?: string };
		assert.equal(out.type, 'error', 'ambiguous outcome is a TERMINAL error (round-8 MED: never a step output that flows into verify)');
		assert.equal(out.code, 'pending-create-unresolved');
		assert.match(out.message ?? '', /retained/, 'the error message carries the retained claim for human resolution');
		assert.ok(!out.prompt, 'no create prompt dispatched');
		const claim = readClaim(repo, H);
		assert.ok(claim !== undefined, 'claim retained as recovery evidence');
		assert.equal(claim?.runId, 'run-B', 'takeover ownership recorded for the reconciler');
		assert.equal((ctx.stepOutputs as { s1: Record<string, unknown> }).s1['claimFence'], undefined, 'no fence carried into a refused run');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('REVIEW round-7 HIGH-1/HIGH-2 — a LEGACY claim (no version, unknown dispatch history) with 0 candidates is NEVER treated as pre-dispatch: refused with an adoption-first resolution path, no create dispatched', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [] }));
	const { readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const MARKER = `<!-- insrc:artifact ISSUE-${H} -->`;
	const repo = mkdtempSync(join(tmpdir(), 'insrc-r7-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		const issue = artifactJsonPath(repo, issueArtifactId(H));
		writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
		markApprovedSync(issue);
		// LEGACY claim: written by an older runner — no version, no dispatchedAt,
		// stale heartbeat. Its dispatch history is UNKNOWN (the old runner may
		// have created the remote issue without recording it).
		writeFileSync(join(repo, '.insrc', 'artifacts', `PENDING-CREATE-${H}.json`), JSON.stringify({
			epicHash: H, runId: 'run-OLD', owner: 'run:run-OLD', repo, ghOwner: 'acme', ghRepo: 'demo',
			title: 'T', marker: MARKER, state: 'pending', fence: 1,
			createdAt: '2020-01-01T00:00:00.000Z', heartbeatAt: '2020-01-01T00:00:00.000Z',
		}));
		const s1 = { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, remoteCandidates: [] as unknown[] };
		const ctx = { intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } }, runId: 'run-B', stepOutputs: { s1 } } as never;
		const out = await pushExecuteRunner.run(ctx) as { type: string; code?: string; message?: string; prompt?: string };
		assert.equal(out.type, 'error', 'legacy claim with unknown dispatch history is a terminal error — no create');
		assert.equal(out.code, 'pending-create-unresolved');
		assert.match(out.message ?? '', /version legacy/, 'the error names the legacy claim shape');
		// HIGH-2: the resolution path leads with ADOPTION of a confirmed ref and
		// reserves claim deletion for confirmed absence — it must not instruct
		// delete-and-retry as a way to force a create
		assert.match(out.message ?? '', /record its ref on the work item.*retry — the next run adopts it with 0 creates/s);
		assert.match(out.message ?? '', /delete the claim file ONLY after confirming NO remote issue exists/);
		assert.ok(!out.prompt, 'no create prompt dispatched');
		const claim = readClaim(repo, H);
		assert.ok(claim !== undefined, 'claim retained');
		assert.equal(claim?.runId, 'run-B', 'takeover recorded for the reconciler, but no create');
		const s1o = (ctx.stepOutputs as { s1: Record<string, unknown> }).s1;
		assert.equal(s1o['claimFence'], undefined, 'no fence carried into a refused run');
		assert.equal(s1o['claimRunId'], undefined);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('REVIEW round-8 HIGH-1 — a FRESH winner with an existing marker-verified remote issue ADOPTS instead of creating (reconcile under the create decision)', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [{ title: `ISSUE-${H} — T`, body: `${MARKER}\n# T`, target: 'acme/demo', ref: 'acme/demo#42' }] }));
	const { readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const MARKER = `<!-- insrc:artifact ISSUE-${H} -->`;
	const repo = mkdtempSync(join(tmpdir(), 'insrc-r8-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		const issue = artifactJsonPath(repo, issueArtifactId(H));
		writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
		markApprovedSync(issue);
		// no claim, no local binding — but the remote issue ALREADY exists (e.g.
		// after claim removal / loss of local tracker state), surfaced in context
		const s1 = { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, remoteCandidates: [{ title: `ISSUE-${H} — T`, body: `${MARKER}\n# T`, target: 'acme/demo', ref: 'acme/demo#42' }] };
		const ctx = { intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } }, runId: 'run-W', stepOutputs: { s1 } } as never;
		const out = await pushExecuteRunner.run(ctx) as { type: string; prompt?: string; userTurn?: string; code?: string };
		assert.equal(out.type, 'llm-pause', 'fresh winner adopts — no create dispatched');
		assert.ok(!out.prompt!.includes('Create exactly ONE issue'), 'no create prompt');
		assert.ok(out.userTurn!.includes('ADOPT the marker-verified issue `acme/demo#42`'), out.userTurn!);
		const claim = readClaim(repo, H);
		assert.equal(claim?.state, 'created', 'the fresh claim is marked created with the adopted ref');
		assert.equal(claim?.issueRef, 'acme/demo#42');
		assert.equal(claim?.runId, 'run-W');
		const s1o = (ctx.stepOutputs as { s1: Record<string, unknown> }).s1;
		assert.equal(s1o['claimFence'], claim?.fence, 'fence+runId carried for finalize');
		assert.equal(s1o['claimRunId'], 'run-W');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('REVIEW round-9 HIGH-1 — a FAILED discovery never authorizes a create: no remoteCandidates in context + live recheck fails -> terminal error, no create prompt, claim not dispatched; a complete EMPTY recheck -> create; a verified candidate -> adopt', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	const { readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { setIssueCandidateLookupForTests } = await import('../context.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const MARKER = `<!-- insrc:artifact ISSUE-${H} -->`;
	const mk = () => {
		const repo = mkdtempSync(join(tmpdir(), 'insrc-r9-'));
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		const issue = artifactJsonPath(repo, issueArtifactId(H));
		writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
		markApprovedSync(issue);
		return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
	};
	const ctxOf = (repo: string, s1extra: Record<string, unknown>) => ({
		intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } },
		runId: 'run-W',
		stepOutputs: { s1: { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, ...s1extra } },
	}) as never;

	// (a) discovery failed in context AND the live recheck fails -> terminal error, NO create
	{
		const fx = mk();
		try {
			setIssueCandidateLookupForTests(async () => ({ ok: false, reason: 'gh unavailable' }));
			const ctx = ctxOf(fx.repo, {});   // no remoteCandidates -> live recheck at the decision
			const out = await pushExecuteRunner.run(ctx) as { type: string; code?: string; message?: string; prompt?: string };
			assert.equal(out.type, 'error', 'failed discovery is terminal — never a create');
			assert.equal(out.code, 'pending-create-discovery-failed');
			assert.match(out.message ?? '', /gh unavailable/);
			assert.ok(!out.prompt, 'no create prompt dispatched');
			const claim = readClaim(fx.repo, H);
			assert.ok(claim !== undefined, 'the fresh claim exists');
			assert.equal(claim?.dispatchedAt, undefined, 'create NOT dispatched — no duplicate risk during lookup failure');
			assert.equal((ctx.stepOutputs as { s1: Record<string, unknown> }).s1['claimFence'], undefined, 'no fence carried');
		} finally { setIssueCandidateLookupForTests(undefined); fx.cleanup(); }
	}
	// (b) live recheck succeeds EMPTY -> absence established -> create dispatched
	{
		const fx = mk();
		try {
			setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [] }));
			const out = await pushExecuteRunner.run(ctxOf(fx.repo, {})) as { type: string; prompt?: string };
			assert.equal(out.type, 'llm-pause');
			assert.ok(out.prompt!.includes('Create exactly ONE issue'), 'complete empty lookup authorizes create');
			assert.ok(readClaim(fx.repo, H)?.dispatchedAt !== undefined, 'dispatch recorded');
		} finally { setIssueCandidateLookupForTests(undefined); fx.cleanup(); }
	}
	// (c) live recheck finds one marker-verified candidate -> adopt, no create
	{
		const fx = mk();
		try {
			setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [{ title: `ISSUE-${H} — T`, body: `${MARKER}\n# T`, target: 'acme/demo', ref: 'acme/demo#42' }] }));
			const ctx = ctxOf(fx.repo, {});
			const out = await pushExecuteRunner.run(ctx) as { type: string; prompt?: string; userTurn?: string };
			assert.equal(out.type, 'llm-pause');
			assert.ok(!out.prompt!.includes('Create exactly ONE issue'), 'no create — the existing issue is adopted');
			assert.ok(out.userTurn!.includes('ADOPT the marker-verified issue `acme/demo#42`'));
			assert.equal(readClaim(fx.repo, H)?.issueRef, 'acme/demo#42');
		} finally { setIssueCandidateLookupForTests(undefined); fx.cleanup(); }
	}
});

test('REVIEW round-9 HIGH-2 — gh config changed after an undispatched v2 claim was written: the claim is retargeted under the mutex and reconciled against the NEW repo before any create (no cross-repo create)', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [{ title: `ISSUE-${H} — T`, body: `${MARKER}\n# T`, target: 'acme/demo', ref: 'acme/demo#42' }] }));
	const { readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const MARKER = `<!-- insrc:artifact ISSUE-${H} -->`;
	const repo = mkdtempSync(join(tmpdir(), 'insrc-r9b-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		const issue = artifactJsonPath(repo, issueArtifactId(H));
		writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
		markApprovedSync(issue);
		// a v2 pending claim recorded when the repo was configured as old/repo; it
		// was never dispatched and is now stale
		writeFileSync(join(repo, '.insrc', 'artifacts', `PENDING-CREATE-${H}.json`), JSON.stringify({
			epicHash: H, runId: 'run-OLD', owner: 'run:run-OLD', repo, version: 2, ghOwner: 'old', ghRepo: 'repo',
			title: 'T', marker: MARKER, state: 'pending', fence: 1,
			createdAt: '2020-01-01T00:00:00.000Z', heartbeatAt: '2020-01-01T00:00:00.000Z',
		}));
		// the marker-verified issue already exists in the NEW configured repo
		const s1 = { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, remoteCandidates: [{ title: `ISSUE-${H} — T`, body: `${MARKER}\n# T`, target: 'acme/demo', ref: 'acme/demo#42' }] };
		const ctx = { intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } }, runId: 'run-B', stepOutputs: { s1 } } as never;
		const out = await pushExecuteRunner.run(ctx) as { type: string; prompt?: string; userTurn?: string };
		assert.equal(out.type, 'llm-pause', 'adopts in the new repo — no create');
		assert.ok(!out.prompt!.includes('Create exactly ONE issue'), 'no create prompt dispatched into the new repo');
		assert.ok(out.userTurn!.includes('ADOPT the marker-verified issue `acme/demo#42`'), out.userTurn!);
		const claim = readClaim(repo, H);
		assert.equal(claim?.ghOwner, 'acme', 'the claim was retargeted under the mutex');
		assert.equal(claim?.ghRepo, 'demo');
		assert.equal(claim?.issueRef, 'acme/demo#42', 'the adopted ref recorded on the claim');
		assert.equal(claim?.runId, 'run-B');
		assert.equal((ctx.stepOutputs as { s1: Record<string, unknown> }).s1['claimRunId'], 'run-B');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('REVIEW round-10 HIGH-1 — an earlier EMPTY snapshot never authorizes a create: the fresh live lookup after claim acquisition finds the marker-verified issue -> adopt, no create prompt', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	const { readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const MARKER = `<!-- insrc:artifact ISSUE-${H} -->`;
	const repo = mkdtempSync(join(tmpdir(), 'insrc-r10-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		const issue = artifactJsonPath(repo, issueArtifactId(H));
		writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
		markApprovedSync(issue);
		// the context snapshot is EMPTY (stale assembly) — but the fresh live
		// lookup at the create decision finds the existing marker-verified issue
		setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [{ title: `ISSUE-${H} — T`, body: `${MARKER}\n# T`, target: 'acme/demo', ref: 'acme/demo#42' }] }));
		const s1 = { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, remoteCandidates: [] as unknown[] };
		const ctx = { intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } }, runId: 'run-W', stepOutputs: { s1 } } as never;
		const out = await pushExecuteRunner.run(ctx) as { type: string; prompt?: string; userTurn?: string };
		assert.equal(out.type, 'llm-pause');
		assert.ok(!out.prompt!.includes('Create exactly ONE issue'), 'the empty snapshot did NOT authorize a duplicate create');
		assert.ok(out.userTurn!.includes('ADOPT the marker-verified issue `acme/demo#42`'), out.userTurn!);
		assert.equal(readClaim(repo, H)?.issueRef, 'acme/demo#42');
		assert.equal(readClaim(repo, H)?.dispatchedAt, undefined, 'no create dispatched');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('REVIEW round-10 HIGH-2 — retargeting is restricted to confirmed pre-dispatch claims: a DISPATCHED v2 claim keeps its original target on gh-config change (no erasing the destination of an unresolved create)', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	const { readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const MARKER = `<!-- insrc:artifact ISSUE-${H} -->`;
	const repo = mkdtempSync(join(tmpdir(), 'insrc-r10b-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		const issue = artifactJsonPath(repo, issueArtifactId(H));
		writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
		markApprovedSync(issue);
		// a v2 claim for old/repo that WAS dispatched (unresolved create in the
		// old repo), now stale
		writeFileSync(join(repo, '.insrc', 'artifacts', `PENDING-CREATE-${H}.json`), JSON.stringify({
			epicHash: H, runId: 'run-OLD', owner: 'run:run-OLD', repo, version: 2, ghOwner: 'old', ghRepo: 'repo',
			title: 'T', marker: MARKER, state: 'pending', fence: 1, dispatchedAt: '2020-01-01T00:01:00.000Z',
			createdAt: '2020-01-01T00:00:00.000Z', heartbeatAt: '2020-01-01T00:01:00.000Z',
		}));
		setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [{ title: `ISSUE-${H} — T`, body: `${MARKER}\n# T`, target: 'acme/demo', ref: 'acme/demo#42' }] }));
		const s1 = { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, remoteCandidates: [{ title: `ISSUE-${H} — T`, body: `${MARKER}\n# T`, target: 'acme/demo', ref: 'acme/demo#42' }] };
		const ctx = { intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } }, runId: 'run-B', stepOutputs: { s1 } } as never;
		const out = await pushExecuteRunner.run(ctx) as { type: string; code?: string; prompt?: string };
		assert.equal(out.type, 'error', 'dispatched claim in old repo + new config -> refuse, no create, no retarget');
		assert.ok(!out.prompt, 'no create prompt dispatched');
		const claim = readClaim(repo, H);
		assert.equal(claim?.ghOwner, 'old', 'the original target is PRESERVED — not erased by retargeting');
		assert.equal(claim?.ghRepo, 'repo');
		assert.equal(claim?.dispatchedAt, '2020-01-01T00:01:00.000Z', 'dispatch history intact');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('REVIEW round-11 HIGH — a created claim\'s saved issueRef is the recovery identity: a conflicting discovered candidate refuses (claim preserved); a matching/empty discovery adopts the SAVED ref; finalize then persists and releases', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	const { readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { readTrackerMeta } = await import('../../../tracker/refs.js');
	const { _finalizeTracker } = await import('../../../orchestrator.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const MARKER = `<!-- insrc:artifact ISSUE-${H} -->`;
	const mk = () => {
		const repo = mkdtempSync(join(tmpdir(), 'insrc-r11-'));
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		const issue = artifactJsonPath(repo, issueArtifactId(H));
		writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
		markApprovedSync(issue);
		// a CREATED v2 claim recording acme/demo#41, now stale (owner abandoned)
		writeFileSync(join(repo, '.insrc', 'artifacts', `PENDING-CREATE-${H}.json`), JSON.stringify({
			epicHash: H, runId: 'run-OLD', owner: 'run:run-OLD', repo, version: 2, ghOwner: 'acme', ghRepo: 'demo',
			title: 'T', marker: MARKER, state: 'created', issueRef: 'acme/demo#41', fence: 1,
			createdAt: '2020-01-01T00:00:00.000Z', heartbeatAt: '2020-01-01T00:00:00.000Z',
		}));
		return { repo, issue, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
	};
	const ctxOf = (repo: string, candidates: unknown[]) => ({
		intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } },
		runId: 'run-B',
		stepOutputs: { s1: { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, remoteCandidates: candidates } },
	}) as never;

	// (a) discovery returns a CONFLICTING ref #42 -> refuse, claim keeps #41
	{
		const fx = mk();
		try {
			setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [{ title: `ISSUE-${H} — T`, body: `${MARKER}\n# T`, target: 'acme/demo', ref: 'acme/demo#42' }] }));
			const out = await pushExecuteRunner.run(ctxOf(fx.repo, [])) as { type: string; code?: string; message?: string; prompt?: string };
			assert.equal(out.type, 'error', 'conflicting discovery on a created claim refuses');
			assert.match(out.message ?? '', /conflicts with the created claim's recorded ref acme\/demo#41/);
			assert.ok(!out.prompt, 'no create dispatched');
			const claim = readClaim(fx.repo, H);
			assert.equal(claim?.issueRef, 'acme/demo#41', 'the recorded ref is NOT overwritten');
			assert.equal(claim?.runId, 'run-B', 'takeover recorded, but no ref mutation');
		} finally { fx.cleanup(); }
	}
	// (b) discovery returns nothing (or the same ref) -> adopt the SAVED #41, then finalize persists + releases
	{
		const fx = mk();
		try {
			setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [] }));
			const ctx = ctxOf(fx.repo, []);
			const out = await pushExecuteRunner.run(ctx) as { type: string; userTurn?: string; prompt?: string };
			assert.equal(out.type, 'llm-pause');
			assert.ok(out.userTurn!.includes('ADOPT the recorded on the created claim issue `acme/demo#41`'), out.userTurn!);
			assert.ok(!out.prompt!.includes('Create exactly ONE issue'), 'no create');
			assert.equal(readClaim(fx.repo, H)?.issueRef, 'acme/demo#41', 'saved ref untouched');
			assert.equal((ctx.stepOutputs as { s1: Record<string, unknown> }).s1['claimRunId'], 'run-B');
			// runner -> finalizer: adoption of the saved ref persists and releases
			const intent = { workflow: 'tracker.push', focus: 'push', repoPath: fx.repo, repoIndexedAt: null, params: { epicHash: H } } as never;
			const res = await _finalizeTracker(intent, { s1: (ctx.stepOutputs as { s1: unknown }).s1 } as never, 'run-B', 5, {
				refs: { epicRef: 'acme/demo#41', storyRefs: { s1: 'acme/demo#41' }, labelsCreated: [] },
				checklist: { items: [{ itemId: 'singleIssue', verdict: 'passed' }], failedCount: 0 },
			}, 'm');
			assert.equal(res.ok, true, JSON.stringify(res));
			assert.equal(readTrackerMeta(fx.issue)?.issueRef, 'acme/demo#41');
			assert.equal(readClaim(fx.repo, H), undefined, 'claim released after persistence');
		} finally { fx.cleanup(); }
	}
});

test('REVIEW round-12 — saved-ref adoption validates the target repo before any prompt (HIGH) and refuses ambiguous discovery before remote work (MED)', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	const { readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const MARKER = `<!-- insrc:artifact ISSUE-${H} -->`;
	const mk = (claimTarget: { ghOwner: string; ghRepo: string }, issueRef: string) => {
		const repo = mkdtempSync(join(tmpdir(), 'insrc-r12-'));
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		const issue = artifactJsonPath(repo, issueArtifactId(H));
		writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
		markApprovedSync(issue);
		writeFileSync(join(repo, '.insrc', 'artifacts', `PENDING-CREATE-${H}.json`), JSON.stringify({
			epicHash: H, runId: 'run-OLD', owner: 'run:run-OLD', repo, version: 2, ...claimTarget,
			title: 'T', marker: MARKER, state: 'created', issueRef, fence: 1,
			createdAt: '2020-01-01T00:00:00.000Z', heartbeatAt: '2020-01-01T00:00:00.000Z',
		}));
		return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
	};
	const ctxOf = (repo: string) => ({
		intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } },
		runId: 'run-B',
		stepOutputs: { s1: { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, remoteCandidates: [] as unknown[] } },
	}) as never;

	// HIGH: created claim recorded old/repo#41, config is acme/demo -> refuse BEFORE any prompt
	{
		const fx = mk({ ghOwner: 'old', ghRepo: 'repo' }, 'old/repo#41');
		try {
			setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [] }));
			const out = await pushExecuteRunner.run(ctxOf(fx.repo)) as { type: string; message?: string; prompt?: string };
			assert.equal(out.type, 'error', 'cross-repo saved ref refuses before the mutation prompt');
			assert.match(out.message ?? '', /does not target the recorded claim target \/ configured acme\/demo/);
			assert.ok(!out.prompt, 'no prompt emitted — finalize never sees the mismatch after an execution turn');
			const claim = readClaim(fx.repo, H);
			assert.equal(claim?.issueRef, 'old/repo#41', 'claim preserved');
			assert.equal(claim?.ghOwner, 'old');
		} finally { fx.cleanup(); }
	}
	// MED: created claim acme/demo#41, discovery finds TWO verified matches (#41 + #42) -> refuse ambiguity before remote work
	{
		const fx = mk({ ghOwner: 'acme', ghRepo: 'demo' }, 'acme/demo#41');
		try {
			setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [
				{ title: `ISSUE-${H} — T`, body: `${MARKER}\n# T`, target: 'acme/demo', ref: 'acme/demo#41' },
				{ title: `ISSUE-${H} — T`, body: `${MARKER}\n# T (dup)`, target: 'acme/demo', ref: 'acme/demo#42' },
			] }));
			const out = await pushExecuteRunner.run(ctxOf(fx.repo)) as { type: string; message?: string; prompt?: string };
			assert.equal(out.type, 'error', 'ambiguous discovery with a saved ref refuses (LLD multiple-match rule)');
			assert.match(out.message ?? '', /2 marker-verified candidates/);
			assert.ok(!out.prompt, 'no mutation prompt dispatched');
			assert.equal(readClaim(fx.repo, H)?.issueRef, 'acme/demo#41', 'saved ref preserved');
		} finally { fx.cleanup(); }
	}
	// positive: created claim acme/demo#41, discovery finds the SAME ref -> adopt #41
	{
		const fx = mk({ ghOwner: 'acme', ghRepo: 'demo' }, 'acme/demo#41');
		try {
			setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [{ title: `ISSUE-${H} — T`, body: `${MARKER}\n# T`, target: 'acme/demo', ref: 'acme/demo#41' }] }));
			const out = await pushExecuteRunner.run(ctxOf(fx.repo)) as { type: string; userTurn?: string; prompt?: string };
			assert.equal(out.type, 'llm-pause');
			assert.ok(out.userTurn!.includes('ADOPT the recorded on the created claim issue `acme/demo#41`'), out.userTurn!);
			assert.ok(!out.prompt!.includes('Create exactly ONE issue'));
			assert.equal(readClaim(fx.repo, H)?.issueRef, 'acme/demo#41');
		} finally { fx.cleanup(); }
	}
});

test('REVIEW round-4 — HIGH-1: durable-ref recheck + claim create are one mutex hold; MED: adoption runs the adoption prompt (llm-pause), not a bare refs output', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [] }));   // round-10: create decisions take a fresh live lookup
	const { readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { bindUnitIssue } = await import('../../../tracker/link.js');
	const { patchTrackerMeta } = await import('../../../tracker/refs.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const mk = () => {
		const repo = mkdtempSync(join(tmpdir(), 'insrc-r4-'));
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		const issue = artifactJsonPath(repo, issueArtifactId(H));
		writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
		markApprovedSync(issue);
		return { repo, issue, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
	};
	const ctxOf = (repo: string) => ({
		intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } },
		runId: 'run-T',
		stepOutputs: { s1: { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: true, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, remoteCandidates: [] as unknown[] } },
	}) as never;

	{
		const fx = mk();
		try {
			bindUnitIssue({ unit: 'epic', repoPath: fx.repo, epicHash: H }, 'acme/demo#42');
			patchTrackerMeta(fx.issue, { issueRef: 'acme/demo#42' });
			const out = await pushExecuteRunner.run(ctxOf(fx.repo) as never) as { type: string; prompt?: string };
			assert.equal(readClaim(fx.repo, H), undefined, 'no claim created when a durable ref exists (mutex-held recheck)');
			assert.equal(out.type, 'llm-pause', 'MED: adoption goes through the adoption prompt, not a bare refs output');
			assert.ok(out.prompt!.includes('ADOPT the existing issue acme/demo#42'), out.prompt!.slice(0, 200));
		} finally { fx.cleanup(); }
	}
	{
		const fx = mk();
		try {
			const out = await pushExecuteRunner.run(ctxOf(fx.repo) as never) as { type: string; prompt?: string };
			const claim = readClaim(fx.repo, H);
			assert.ok(claim !== undefined && claim.runId === 'run-T', 'winner claimed under the mutex-held decision');
			assert.equal(out.type, 'llm-pause');
			assert.ok(out.prompt!.includes('Create exactly ONE issue'), out.prompt!.slice(0, 200));
		} finally { fx.cleanup(); }
	}
});

test('REVIEW round-13 HIGH — canonical ref parsing + configured-repo validation at the common ISSUE adoption boundary (adoptionPause): a durable meta.tracker.issueRef from another repo refuses BEFORE any mutation prompt; a retained created claim\'s saved ref must also agree', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [] }));
	const { readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { patchTrackerMeta } = await import('../../../tracker/refs.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const MARKER = `<!-- insrc:artifact ISSUE-${H} -->`;
	const mk = () => {
		const repo = mkdtempSync(join(tmpdir(), 'insrc-r13-'));
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		const issue = artifactJsonPath(repo, issueArtifactId(H));
		writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
		markApprovedSync(issue);
		return { repo, issue, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
	};
	const ctxOf = (repo: string) => ({
		intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } },
		runId: 'run-B',
		stepOutputs: { s1: { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, remoteCandidates: [] as unknown[] } },
	}) as never;

	// (a) durable meta.tracker.issueRef 'old/repo#41' with config acme/demo, no claim -> terminal error, NO prompt
	{
		const fx = mk();
		try {
			patchTrackerMeta(fx.issue, { issueRef: 'old/repo#41' });
			const out = await pushExecuteRunner.run(ctxOf(fx.repo)) as { type: string; code?: string; message?: string; prompt?: string };
			assert.equal(out.type, 'error', 'cross-repo durable ref refuses at the adoption boundary');
			assert.equal(out.code, 'pending-create-unresolved');
			assert.match(out.message ?? '', /does not target the configured GitHub repository acme\/demo/);
			assert.ok(!out.prompt, 'no mutation prompt emitted for a foreign-repo ref');
			assert.equal(readClaim(fx.repo, H), undefined, 'no claim written');
		} finally { fx.cleanup(); }
	}
	// (b) durable ref acme/demo#42 + retained created claim saved acme/demo#41 -> conflict refusal, claim preserved
	{
		const fx = mk();
		try {
			patchTrackerMeta(fx.issue, { issueRef: 'acme/demo#42' });
			writeFileSync(join(fx.repo, '.insrc', 'artifacts', `PENDING-CREATE-${H}.json`), JSON.stringify({
				epicHash: H, runId: 'run-OLD', owner: 'run:run-OLD', repo: fx.repo, version: 2, ghOwner: 'acme', ghRepo: 'demo',
				title: 'T', marker: MARKER, state: 'created', issueRef: 'acme/demo#41', fence: 1,
				createdAt: '2020-01-01T00:00:00.000Z', heartbeatAt: '2020-01-01T00:00:00.000Z',
			}));
			const out = await pushExecuteRunner.run(ctxOf(fx.repo)) as { type: string; message?: string; prompt?: string };
			assert.equal(out.type, 'error', 'durable ref conflicting with the created claim\'s saved ref refuses');
			assert.match(out.message ?? '', /conflicts with the retained created claim's recorded ref acme\/demo#41/);
			assert.ok(!out.prompt, 'no mutation prompt emitted');
			const claim = readClaim(fx.repo, H);
			assert.equal(claim?.issueRef, 'acme/demo#41', 'claim preserved with its recorded ref');
		} finally { fx.cleanup(); }
	}
	// (c) positive: durable ref acme/demo#42 with NO claim -> adoption prompt still emitted (round-4 behavior preserved)
	{
		const fx = mk();
		try {
			patchTrackerMeta(fx.issue, { issueRef: 'acme/demo#42' });
			const out = await pushExecuteRunner.run(ctxOf(fx.repo)) as { type: string; userTurn?: string; prompt?: string };
			assert.equal(out.type, 'llm-pause', 'in-repo durable ref still adopts via the prompt');
			assert.ok(out.userTurn!.includes('ADOPT the already-persisted issue `acme/demo#42`'), out.userTurn!);
		} finally { fx.cleanup(); }
	}
});

test('REVIEW round-14 HIGH — the ISSUE execute branch is exhaustive: a missing/changed head refuses; a stale context ref no longer suppresses claim acquisition (the durable reread decides) and is scrubbed so the create prompt never names it; the generic prompt is reachable only after dispatch under an owned claim', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	const { readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const mk = (withIssue = true) => {
		const repo = mkdtempSync(join(tmpdir(), 'insrc-r14-'));
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		let issue: string | undefined;
		if (withIssue) {
			issue = artifactJsonPath(repo, issueArtifactId(H));
			writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
			markApprovedSync(issue);
		}
		return { repo, issue, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
	};
	const ctxOf = (repo: string, existingRefs?: unknown) => ({
		intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } },
		runId: 'run-B',
		stepOutputs: { s1: { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, remoteCandidates: [] as unknown[], ...(existingRefs !== undefined ? { existingRefs } : {}) } },
	}) as never;

	// (a) stale context ref old/repo#41, NO durable ref, empty live discovery -> claim IS acquired (durable reread decides), dispatch recorded, create prompt WITHOUT the stale ref
	{
		const fx = mk();
		try {
			setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [] }));
			const ctx = ctxOf(fx.repo, { epicRef: 'old/repo#41', storyRefs: { s1: 'old/repo#41' } });
			const out = await pushExecuteRunner.run(ctx) as { type: string; prompt?: string; userTurn?: string };
			assert.equal(out.type, 'llm-pause', 'falls through to the create prompt only because dispatch was recorded under an owned claim');
			assert.ok(out.prompt!.includes('Create exactly ONE issue'), out.prompt!.slice(0, 200));
			assert.ok(!out.prompt!.includes('old/repo#41'), 'the stale context ref is scrubbed from the prompt');
			const claim = readClaim(fx.repo, H);
			assert.ok(claim !== undefined && claim.runId === 'run-B', 'claim acquired despite the stale context ref');
			assert.ok(claim!.dispatchedAt !== undefined, 'dispatch recorded before the create prompt');
			const s1 = (ctx.stepOutputs as { s1: Record<string, unknown> }).s1;
			assert.equal(s1['claimRunId'], 'run-B');
			assert.ok(s1['claimFence'] !== undefined, 'owned fence carried for finalize');
			assert.equal(s1['existingRefs'], undefined, 'stale existingRefs scrubbed from the step output');
		} finally { fx.cleanup(); }
	}
	// (b) stale context ref + discovery finds acme/demo#42 -> validated adoption, not the stale ref
	{
		const fx = mk();
		try {
			const MARKER = `<!-- insrc:artifact ISSUE-${H} -->`;
			setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [{ title: `ISSUE-${H} — T`, body: `${MARKER}\n# T`, target: 'acme/demo', ref: 'acme/demo#42' }] }));
			const out = await pushExecuteRunner.run(ctxOf(fx.repo, { epicRef: 'old/repo#41', storyRefs: { s1: 'old/repo#41' } })) as { type: string; userTurn?: string; prompt?: string };
			assert.equal(out.type, 'llm-pause');
			assert.ok(out.userTurn!.includes('ADOPT the marker-verified issue `acme/demo#42`'), out.userTurn!);
			assert.ok(!out.userTurn!.includes('old/repo#41'));
		} finally { fx.cleanup(); }
	}
	// (c) ISSUE head missing after context assembly -> terminal error, no prompt, no claim
	{
		const fx = mk(false);
		try {
			setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [] }));
			const out = await pushExecuteRunner.run(ctxOf(fx.repo)) as { type: string; code?: string; message?: string; prompt?: string };
			assert.equal(out.type, 'error');
			assert.equal(out.code, 'issue-head-missing');
			assert.match(out.message ?? '', /missing or changed since the push context was assembled/);
			assert.ok(!out.prompt, 'no mutation prompt without a head');
			assert.equal(readClaim(fx.repo, H), undefined, 'no claim written');
			assert.ok(!existsSync(join(fx.repo, '.insrc', 'artifacts', `PENDING-CREATE-${H}.json`)));
		} finally { fx.cleanup(); }
	}
});

test('REVIEW round-15 HIGH — execute revalidates the LIVE head approval + content before any claim or prompt: an unapproved replacement under the same ISSUE id refuses; changed approved content refuses; the unchanged approved head proceeds', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	const { readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const mk = () => {
		const repo = mkdtempSync(join(tmpdir(), 'insrc-r15-'));
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		const issue = artifactJsonPath(repo, issueArtifactId(H));
		writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
		markApprovedSync(issue);
		return { repo, issue, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
	};
	const ctxOf = (repo: string) => ({
		intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } },
		runId: 'run-B',
		stepOutputs: { s1: { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, remoteCandidates: [] as unknown[] } },
	}) as never;

	// (a) approved head replaced by a readable UNAPPROVED revision (same ISSUE id, changed body) -> terminal error, no claim, no prompt
	{
		const fx = mk();
		try {
			setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [] }));
			const j = JSON.parse(readFileSync(fx.issue!, 'utf8')) as { meta: Record<string, unknown>; body: unknown };
			delete j.meta['lifecycle'];
			j.body = { title: 'T2', reproduction: 'r2', rootCause: 'c2', fixIntent: 'f2' };
			writeFileSync(fx.issue!, JSON.stringify(j));
			const out = await pushExecuteRunner.run(ctxOf(fx.repo)) as { type: string; code?: string; message?: string; prompt?: string };
			assert.equal(out.type, 'error');
			assert.equal(out.code, 'issue-head-not-approved', out.message);
			assert.match(out.message ?? '', /is pending .*was approved when the push context was assembled/);
			assert.ok(!out.prompt, 'no mutation prompt after the head lost approval');
			assert.equal(readClaim(fx.repo, H), undefined, 'no claim written');
		} finally { fx.cleanup(); }
	}
	// (b) head still approved but content CHANGED since context assembly -> terminal error, no claim, no prompt
	{
		const fx = mk();
		try {
			setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [] }));
			const j = JSON.parse(readFileSync(fx.issue!, 'utf8')) as { body: unknown };
			j.body = { title: 'T2', reproduction: 'r2', rootCause: 'c2', fixIntent: 'f2' };
			writeFileSync(fx.issue!, JSON.stringify(j));
			const out = await pushExecuteRunner.run(ctxOf(fx.repo)) as { type: string; code?: string; message?: string; prompt?: string };
			assert.equal(out.type, 'error');
			assert.equal(out.code, 'issue-head-changed', out.message);
			assert.match(out.message ?? '', /changed since the push context was assembled/);
			assert.ok(!out.prompt, 'no prompt against stale context content');
			assert.equal(readClaim(fx.repo, H), undefined, 'no claim written');
		} finally { fx.cleanup(); }
	}
	// (c) positive: unchanged approved head proceeds to the claim decision (covered in depth by round-4/13/14 blocks; here assert the guard passes and a create prompt is reached)
	{
		const fx = mk();
		try {
			setIssueCandidateLookupForTests(async () => ({ ok: true, candidates: [] }));
			const out = await pushExecuteRunner.run(ctxOf(fx.repo)) as { type: string; prompt?: string };
			assert.equal(out.type, 'llm-pause');
			assert.ok(out.prompt!.includes('Create exactly ONE issue'), out.prompt!.slice(0, 200));
			assert.ok(readClaim(fx.repo, H) !== undefined, 'claim acquired for the unchanged approved head');
		} finally { fx.cleanup(); }
	}
});

test('SELF-REVIEW round-16 — fail closed: a FAILED fresh live lookup never drives the winner path (no adoption from a stale context snapshot, no create); claim retained, not dispatched, no fence carried', async () => {
	const { pushExecuteRunner } = await import('../index.js');
	const { readClaim } = await import('../../../tracker/pending-create-claim.js');
	const { artifactJsonPath, issueArtifactId } = await import('../../../storage.js');
	const { markApprovedSync } = await import('../../../__tests__/lifecycle-fixtures.js');
	const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const H = '5f9d4ab4c90c0b4c';
	const MARKER = `<!-- insrc:artifact ISSUE-${H} -->`;
	const repo = mkdtempSync(join(tmpdir(), 'insrc-r16-'));
	try {
		mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'repo-config.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		process.env['INSRC_REPO_CONFIG'] = join(repo, 'repo-config.json');
		const issue = artifactJsonPath(repo, issueArtifactId(H));
		writeFileSync(issue, JSON.stringify({ meta: { workflow: 'issue', runId: 'i', schemaVersion: 1, issueHash: H, epicHash: H, epicSlug: 's', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', standalone: true }, body: { title: 'T', reproduction: 'r', rootCause: 'c', fixIntent: 'f' }, citations: [] }));
		markApprovedSync(issue);
		// the context snapshot carries a marker-verified candidate, but the FRESH live lookup fails
		setIssueCandidateLookupForTests(async () => ({ ok: false, reason: 'gh down' }));
		const s1 = { kind: 'push', epicHash: H, epicSlug: 's', headKind: 'issue', gh: { owner: 'acme', repo: 'demo', epicLabel: 'insrc:epic', storyLabel: 'insrc:story', taskLabel: 'insrc:task', useMilestones: false, pushTasks: false, taskIssueType: 'Task' }, epicTitle: 'T', epicBodyMd: RENDERED_ISSUE_BODY, stories: [{ id: 's1', title: 'T', bodyMd: '' }], force: false, remoteCandidates: [{ title: `ISSUE-${H} — T`, body: `${MARKER}\n# T`, target: 'acme/demo', ref: 'acme/demo#42' }] };
		const ctx = { intent: { repoPath: repo, workflow: 'tracker.push', params: { epicHash: H } }, runId: 'run-W', stepOutputs: { s1 } } as never;
		const out = await pushExecuteRunner.run(ctx) as { type: string; code?: string; message?: string; prompt?: string };
		assert.equal(out.type, 'error', 'a failed fresh lookup refuses — the stale snapshot cannot drive adoption or create');
		assert.equal(out.code, 'pending-create-discovery-failed');
		assert.match(out.message ?? '', /gh down/);
		assert.ok(!out.prompt, 'no prompt dispatched');
		const claim = readClaim(repo, H);
		assert.ok(claim !== undefined && claim.runId === 'run-W', 'winner claim exists');
		assert.equal(claim!.dispatchedAt, undefined, 'not dispatched');
		assert.equal(claim!.issueRef, undefined, 'not marked created from the stale snapshot');
		const s1o = (ctx.stepOutputs as { s1: Record<string, unknown> }).s1;
		assert.equal(s1o['claimFence'], undefined, 'no fence carried');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
