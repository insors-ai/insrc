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
import { definitionHeadJsonPath, readDefinitionHead } from '../../gates.js';
import { readTrackerMeta } from '../../tracker/refs.js';
import { unitIssueOf } from '../../tracker/unit-head.js';
import type { IssueArtifact } from '../../artifacts/issue.js';
import { IMPLIED_ISSUE_STORY_ID, issueArtifactId } from '../../storage.js';
import { acquireClaimMutex, CLAIM_VERSION, claimCreateIntent, markClaimCreatedFence, markClaimDispatched, pendingCreatePath, quarantineDeadClaim, readClaim, reconcileClaim, takeoverAbandonedClaim } from '../../tracker/pending-create-claim.js';

import {
	assemblePostContext,
	assemblePushContext,
	assembleSyncContext,
} from './context.js';
import { epicMembershipLabel } from '../../tracker/conventions.js';
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
		const bundle = await assemblePushContext(ctx);
		return { type: 'output', output: bundle, summary: `push context assembled for ${bundle.epicSlug}` };
	},
};

export const pushExecuteRunner: StepRunner = {
	id:       'execute',
	workflow: 'tracker.push',
	async run(ctx) {
		const c = ctx.stepOutputs['s1'] as Awaited<ReturnType<typeof assemblePushContext>>;
		// ISSUE-5f9d4ab4c90c0b4c s1/t6: for an ISSUE head, claim the create intent
		// atomically BEFORE dispatching the mutating execute step. Only the run
		// that got claimed:true dispatches; a claimed:false run refuses to create
		// and instead RECONCILES the existing claim: abandoned claims are taken
		// over under the mutex (fence++), dead holders reclaimed via the guard
		// quarantine, and the remote issue is verified by marker+target before
		// any adoption — 0 duplicate creates.
		if (c.headKind === 'issue') {
			const head = readDefinitionHead(ctx.intent.repoPath, c.epicHash);
			const issue = head?.kind === 'issue' ? (head.artifact as IssueArtifact) : undefined;
			// REVIEW round-4 HIGH-1: the durable-ref recheck and the create-if-absent
			// claim decision are ONE critical section under the claim mutex — the
			// same serialization boundary finalization uses — so another process
			// cannot complete publication between our recheck and our wx write.
			const mutex = await acquireClaimMutex(ctx.intent.repoPath, c.epicHash);
			let durableRef: string | undefined;
			let claim: ReturnType<typeof claimCreateIntent> | undefined;
			try {
				durableRef = unitIssueOf(ctx.intent.repoPath, c.epicHash)
					?? (head?.kind === 'issue' ? readTrackerMeta(definitionHeadJsonPath(ctx.intent.repoPath, c.epicHash))?.issueRef : undefined);
				if (issue !== undefined && durableRef === undefined && c.existingRefs?.epicRef === undefined) {
					const marker = `<!-- insrc:artifact ${issueArtifactId(c.epicHash)} -->`;
					claim = claimCreateIntent(ctx.intent.repoPath, c.epicHash, ctx.runId, {
						title: issue.body.title,
						marker,
						// round-6 MED: persist the GitHub target on the claim so recovery
						// verifies candidates against the actual owner/repo, not the
						// local checkout path.
						ghOwner: c.gh.owner,
						ghRepo: c.gh.repo,
					});
				}
			} finally {
				mutex.release();
			}
			// REVIEW round-6 HIGH-1: a fence is carried ONLY when this run actually
			// acquired claim ownership (a successful takeover writes OUR runId).
			// A live foreign claim's fence is never carried or advanced.
			// REVIEW round-7 HIGH-3: the fence and the carrying run id travel
			// TOGETHER — finalization checks both under the mutex, so a replacement
			// claim that reaches the same fence number cannot be persisted into.
			const setFence = (fence: number | undefined): void => {
				if (fence !== undefined) {
					const s1o = ctx.stepOutputs['s1'] as Record<string, unknown>;
					s1o['claimFence'] = fence;
					s1o['claimRunId'] = ctx.runId;
				}
			};
			const adoptionPause = (ref: string, how: string) => ({
				type: 'llm-pause' as const,
				prompt: pushPrompt({ ...c, existingRefs: { ...c.existingRefs, epicRef: ref, storyRefs: { ...c.existingRefs?.storyRefs, [IMPLIED_ISSUE_STORY_ID]: ref } } }),
				userTurn: [
					`ADOPT the ${how} issue \`${ref}\` (do NOT create a duplicate).`,
					`Perform the required non-create mutations (labels, milestone, ${c.force ? 'forced body overwrite' : 'no body edit'}), then return the refs JSON.`,
				].join('\n'),
				schema: trackerPushExecuteSchema,
				preparedBlob: { stepId: 'execute' as const },
			});
			const refused = (reason: string) => ({
				type: 'output' as const,
				output: { refused: true, reason },
				summary: `tracker.push: unresolved pending-create claim — ${reason}`,
			});
			if (issue !== undefined && durableRef !== undefined) {
				// already durably published under the mutex: adopt (round-4 MED: run
				// the adoption prompt so labels/milestone/force-body still happen).
				// Carry a fence only if THIS run took over the retained claim
				// (round-3 MED-3 + round-6 HIGH-1: never copy a live owner's fence).
				const existing = readClaim(ctx.intent.repoPath, c.epicHash);
				if (existing !== undefined) {
					const took = await takeoverAbandonedClaim(ctx.intent.repoPath, c.epicHash, ctx.runId, Date.now());
					if (took !== undefined && took.runId === ctx.runId) setFence(took.fence);
				}
				return adoptionPause(durableRef, 'already-persisted');
			}
			const claimResult = claim;
			if (issue !== undefined && claimResult !== undefined) {
				if (!claimResult.claimed) {
					// loser: reclaim a dead holder's guard, then try to take over an
					// ABANDONED claim. Only a successful takeover (runId === ours)
					// may advance the fence or carry it (round-6 HIGH-1).
					quarantineDeadClaim(ctx.intent.repoPath, c.epicHash);
					const took = await takeoverAbandonedClaim(ctx.intent.repoPath, c.epicHash, ctx.runId, Date.now());
					if (took === undefined) {
						// LIVE foreign claim: read-only reconcile + adoption prompt.
						// No fence carried, no claim mutation — finalization refuses
						// while the claim is present without a carried fence (fail
						// closed) and proceeds plainly once the owner released it.
						const reconciled = reconcileClaim(claimResult.claim, c.remoteCandidates ?? []);
						if (!reconciled.ok) return refused(reconciled.reason);
						return adoptionPause(reconciled.ref, 'marker-verified');
					}
					// we own the taken-over claim
					const reconciled = reconcileClaim(took, c.remoteCandidates ?? []);
					if (!reconciled.ok) {
						// REVIEW round-6 HIGH-2: a 'pending' v2 claim that was NEVER
						// dispatched (no dispatchedAt) with ZERO marker-verified remote
						// candidates is a CONFIRMED pre-dispatch failure — the session
						// stopped before `gh issue create`. This run owns the claim, so
						// recover by dispatching the create now (duplicate protection
						// holds: nothing was dispatched and no verified remote issue
						// exists). Fall through to the normal create dispatch below with
						// our own committed fence.
						// REVIEW round-7 HIGH-1: only a v2 claim (CLAIM_VERSION) proves
						// pre-dispatch — a LEGACY claim (no version field) has UNKNOWN
						// dispatch history (an older runner may have created the remote
						// issue without recording dispatchedAt), so it must take the
						// refusal path, never the create path.
						if (reconciled.verifiedCount === 0 && took.state === 'pending' && took.dispatchedAt === undefined && took.version === CLAIM_VERSION) {
							const committedFence = await markClaimDispatched(ctx.intent.repoPath, c.epicHash, took.fence, ctx.runId);
							setFence(committedFence);
						} else {
							// ambiguous remote outcome (create dispatched but the response
							// was lost, legacy claim with unknown dispatch history, or >1
							// verified candidates): explicit resolution path — refuse,
							// retain the claim, and never instruct claim deletion as a way
							// to force a create (REVIEW round-7 HIGH-2: deletion is for
							// CONFIRMED absence only; a confirmed remote ref is adopted by
							// recording it on the work item, and the next run's durable-ref
							// branch adopts with 0 creates). Duplicate protection preserved.
							return refused(`${reconciled.reason} — claim ${pendingCreatePath(ctx.intent.repoPath, c.epicHash)} retained (state ${took.state}, dispatched ${took.dispatchedAt !== undefined}, version ${took.version ?? 'legacy'}). Resolution: if the remote issue is CONFIRMED on GitHub, record its ref on the work item (ISSUE meta.tracker.issueRef / head binding) and retry — the next run adopts it with 0 creates; delete the claim file ONLY after confirming NO remote issue exists (confirmed absence)`);
						}
					} else {
						// reconciled to exactly one marker+target-verified candidate:
						// mark the claim 'created' under the mutex (fence- + run-checked)
						// and carry the COMMITTED fence for finalization (round-2
						// HIGH-1). The claim is RETAINED until the ref is durably
						// persisted and the heads bound — finalize releases it.
						const markedFence = await markClaimCreatedFence(ctx.intent.repoPath, c.epicHash, took.fence, reconciled.ref, undefined, ctx.runId);
						setFence(markedFence);
						return adoptionPause(reconciled.ref, 'marker-verified');
					}
				} else {
					// winner: record dispatch + heartbeat under the mutex (fence- +
					// run-checked), then dispatch. The COMMITTED fence rides in the
					// context so finalization can fence the whole persistence op
					// (round-2 HIGH-1: carry the token the op actually committed).
					const committedFence = await markClaimDispatched(ctx.intent.repoPath, c.epicHash, claimResult.claim.fence, ctx.runId);
					setFence(committedFence);
				}
			}
			if (issue !== undefined && claimResult === undefined) {
				// existingRefs seeded by the context: reconcile any retained claim
				// toward adoption — carry a fence only on a successful takeover.
				const existing = readClaim(ctx.intent.repoPath, c.epicHash);
				if (existing !== undefined) {
					const took = await takeoverAbandonedClaim(ctx.intent.repoPath, c.epicHash, ctx.runId, Date.now());
					if (took !== undefined && took.runId === ctx.runId) setFence(took.fence);
				}
			}
		}
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
		const c = ctx.stepOutputs['s1'] as Awaited<ReturnType<typeof assemblePushContext>>;
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
		const bundle = await assembleSyncContext(ctx);
		return { type: 'output', output: bundle, summary: `sync context assembled for ${bundle.epicSlug}` };
	},
};

const syncExecuteRunner: StepRunner = {
	id:       'execute',
	workflow: 'tracker.sync',
	async run(ctx) {
		const c = ctx.stepOutputs['s1'] as Awaited<ReturnType<typeof assembleSyncContext>>;
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
		const c = ctx.stepOutputs['s1'] as Awaited<ReturnType<typeof assembleSyncContext>>;
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
		const bundle = await assemblePostContext(ctx);
		return { type: 'output', output: bundle, summary: `post context assembled (${bundle.target.kind})` };
	},
};

const postExecuteRunner: StepRunner = {
	id:       'execute',
	workflow: 'tracker.post',
	async run(ctx) {
		const c = ctx.stepOutputs['s1'] as Awaited<ReturnType<typeof assemblePostContext>>;
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
	'  4. Doc links: the Epic body links to its nested DEF/HLD under',
	'     `docs/epics/<slug>-E<date><hash8>/`; each Story body links to that work',
	'     item\'s `S<nnn>/LLD.md`. (The Epic issue body is pre-rendered',
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

/** ISSUE-5f9d4ab4c90c0b4c s1/t3: the conventions block for an ISSUE-anchored
 *  work item. The DEF hierarchy rules (story labels, `## Stories` task-list
 *  linkage, `**Epic:**` back-reference) do NOT apply — the single issue is
 *  its own root, so those instructions are explicitly retracted here instead
 *  of being left in a shared block the LLM could follow. */
const ISSUE_CONVENTIONS_BLOCK = [
	'SINGLE-ISSUE WORK ITEM (an ISSUE-anchored bugfix) — NO Epic/Story hierarchy:',
	'  1. Labels identify the work item:',
	'     - `<epicLabel>` on the single issue (default: `insrc:epic`)',
	'     - `epic:<slug>` on the single issue',
	'     - NO `<storyLabel>`: there are no Story issues.',
	'  2. NO `## Stories` task-list rewrite and NO `**Epic:**` back-reference —',
	'     the DEF hierarchy rules do not apply; they would self-reference this one issue.',
	'  3. The issue body is pre-rendered for you in `epicBodyMd` — use it verbatim.',
	'  4. Optional milestone: when `useMilestones=true`, create a milestone named',
	'     `<epic-slug>` and attach the issue to it.',
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

/** ISSUE-5f9d4ab4c90c0b4c s1/t3: the single-issue push prompt for an
 *  ISSUE-anchored work item (headKind 'issue'). ONE issue, the prerendered
 *  ISSUE markdown as the single authoritative body, labels epicLabel +
 *  epicMembershipLabel(slug) (the canonical length-bounded `epic:<slug>`) —
 *  no story label, no sub-issues, no `## Stories`
 *  task-list rewrite, no `**Epic:**` back-reference (those are DEF-only and
 *  would self-reference the single issue). Adoption of an existing
 *  `existingRefs.epicRef` is allowed WITHOUT --force: labels are additive via
 *  the singular `--add-label` (gh_issue_edit maps addLabels to it), only body
 *  edits need --force. */
function pushPromptIssue(c: Awaited<ReturnType<typeof assemblePushContext>>): string {
	// REVIEW round-5 MED: the membership label must be the canonical
	// epicMembershipLabel(slug) (length-bounded + hashed for long slugs) — the
	// same identity the deterministic create and registry queries use.
	const membership = epicMembershipLabel(c.epicSlug);
	return [
		'You are running the `execute` step of `tracker.push` for an ISSUE-anchored work item.',
		'',
		`Push the SINGLE issue \`${c.epicSlug}\` (${c.epicHash}) to \`${c.gh.owner}/${c.gh.repo}\`.`,
		'',
		ISSUE_CONVENTIONS_BLOCK,
		'',
		'ORDER OF OPERATIONS:',
		`  1. Ensure the labels \`${c.gh.epicLabel}\` and \`${membership}\` exist (create missing ones idempotently, e.g. \`gh label create --force\`).`,
		...(c.existingRefs?.epicRef !== undefined ? [
			`  2. ADOPT the existing issue ${c.existingRefs.epicRef} — do NOT create a duplicate.`,
			`     Add the labels idempotently: \`gh issue edit <N> --add-label "${c.gh.epicLabel},${membership}"\` (the singular --add-label flag; the plural --add-labels is rejected by gh). Labels are additive and need no --force.`,
			// REVIEW-5f9d4ab4c90c0b4c MED-2: the ISSUE adoption path must vary with
			// c.force exactly like the DEF branch does.
			...(c.force
				? ['     FORCE MODE: also overwrite the body to match the authoritative markdown below (\`gh issue edit <N> --body ...\` requires --force).']
				: ['     Do NOT edit the body — preserve it as-is (body edits require --force). The authoritative markdown below is for reference only.']),
		] : [
			'  2. Create exactly ONE issue for this work item.',
			`     Title: ${JSON.stringify(c.epicTitle)}`,
			'     Body: the prerendered markdown below, VERBATIM (it is the single authoritative body).',
			`     Labels on create: \`${c.gh.epicLabel}\`, \`${membership}\`.`,
		]),
		`  ${c.existingRefs?.epicRef !== undefined ? '3' : '3'}. ${c.gh.useMilestones ? `Create milestone \`${c.epicSlug}\` and attach the issue.` : 'Skip milestone creation (useMilestones=false).'}`,
		'',
		'PRERENDERED ISSUE BODY (use verbatim):',
		'```markdown',
		c.epicBodyMd,
		'```',
		'',
		'DELIBERATELY NOT USED for an ISSUE work item:',
		'  - Story sub-issues, story labels, the `## Stories` task list, `**Epic:**` back-references (this item has no Epic/Story split; the single issue IS both).',
		'  - Task sub-issues + issue types.',
		'  - Projects v2, cross-repo Epics.',
		'',
		'RETURN:',
		'  Emit the refs JSON matching the schema: `epicRef` = the single issue `<owner>/<repo>#<N>`; `storyRefs` = { s1: <the SAME ref> } (the implied story shares the work-item issue).',
		'  Do not print anything else.',
	].join('\n');
}

export function pushPrompt(c: Awaited<ReturnType<typeof assemblePushContext>>): string {
	if (c.headKind === 'issue') return pushPromptIssue(c);
	const tasksOn = c.gh.pushTasks && c.plans !== undefined && c.plans.length > 0;
	const notUsed = [
		'DELIBERATELY NOT USED (per plan):',
		'  - Projects v2 (workspace scope + OAuth surface).',
		...(tasksOn ? [] : ['  - Sub-issues + issue types (enable with `pushTasks` in the github config).']),
		'  - Cross-repo Epics.',
	];
	return [
		'You are running the `execute` step of `tracker.push`.',
		'',
		`Push Epic \`${c.epicSlug}\` + Stories${tasksOn ? ' + Tasks' : ''} to \`${c.gh.owner}/${c.gh.repo}\`.`,
		'',
		CONVENTIONS_BLOCK,
		'',
		'ORDER OF OPERATIONS:',
		`  1. Ensure the labels \`${c.gh.epicLabel}\`, \`${c.gh.storyLabel}\`, ${tasksOn ? `\`${c.gh.taskLabel}\`, ` : ''}\`epic:${c.epicSlug}\`, ` +
		'`insrc:in-progress`, `insrc:blocked` exist. Create the missing ones idempotently ' +
		'(`gh label create --force` is fine for labels you own).',
		'  2. Create ONE Story issue at a time (Epic body needs their #numbers).',
		'  3. Create the Epic issue with a body containing the `## Stories` task list.',
		`  4. ${c.gh.useMilestones ? `Create milestone \`${c.epicSlug}\` and attach every issue.` : 'Skip milestone creation (useMilestones=false).'}`,
		...(tasksOn ? [`  5. ${taskPushBlock(c)}`] : []),
		`  ${tasksOn ? '6' : '5'}. ${c.force ? 'FORCE MODE: edit existing issues (do not create duplicates); overwrite bodies to match.' : 'If existing refs are present in `existingRefs`, treat as an error unless the user re-runs with --force.'}`,
		'',
		...notUsed,
		'',
		'RETURN:',
		'  Emit the refs JSON matching the schema. `epicRef` = `<owner>/<repo>#<N>`; `storyRefs` = { storyId: ref }.' +
		(tasksOn ? ' `taskRefs` = { storyId: { taskId: ref } } for every Task you created or adopted.' : ''),
		'  Do not print anything else.',
	].join('\n');
}

/** The Task-tier instructions for the push execute step — only emitted
 *  when `pushTasks` is on and at least one Story has an approved plan.
 *  Spells out the exact `gh api` calls for a typed Task sub-issue. */
function taskPushBlock(c: Awaited<ReturnType<typeof assemblePushContext>>): string {
	const plans = c.plans ?? [];
	const lines: string[] = [
		'TASK TIER — for each Story that has an entry in `plans` below, after its Story issue exists,',
		'   create ONE issue per Task, typed and linked as a sub-issue of the Story:',
		'     a. Create via the REST API (so you get the numeric id needed for sub-issue linking) and set the type:',
		`          gh api -X POST repos/${c.gh.owner}/${c.gh.repo}/issues \\`,
		`            -f 'title=<storyId>/<taskId>: <task title>' -f 'body=<task body>' \\`,
		`            -f 'labels[]=${c.gh.taskLabel}' -f 'labels[]=epic:${c.epicSlug}' -f 'type=${c.gh.taskIssueType}'`,
		'        The response JSON has `.number` (issue number) and `.id` (database id).',
		`        If the org has no \`${c.gh.taskIssueType}\` issue type (HTTP 422), retry WITHOUT \`-f 'type=...'\` — the issue is still created, untyped.`,
		'     b. Link it as a sub-issue of the Story issue (skip cleanly if sub-issues are unavailable):',
		`          gh api -X POST repos/${c.gh.owner}/${c.gh.repo}/issues/<storyIssueNumber>/sub_issues -F sub_issue_id=<task database id>`,
		'     Task body: `**Story:** #<storyIssueNumber> (<storyId>)`, `**Size:** <size>`, `## Summary` + summary,',
		'       `## Acceptance checks` (as `- [ ]` items), `## Tests` (`- **<level>:** <name>`), and `## Design references` → the plan doc (`planDocRel`).',
		'     Idempotency: if `existingRefs.taskRefs[storyId][taskId]` is present, ADOPT it — do not create a duplicate.',
		'   Plans:',
		'```json',
		JSON.stringify(plans, null, 2),
		'```',
	];
	return lines.join('\n');
}

/** ISSUE-5f9d4ab4c90c0b4c s1/t3: the verify checklist for an ISSUE-anchored
 *  push — issueLabelled + bodyMatches + singleIssue. The DEF-only items
 *  (storyLabelled, taskList, backRef, task*, subIssue, taskCoverage) pass by
 *  construction: there are no stories/tasks/back-references to check. */
function pushVerifyPromptIssue(c: Awaited<ReturnType<typeof assemblePushContext>>): string {
	const membership = epicMembershipLabel(c.epicSlug);   // round-5 MED: canonical label
	return [
		'You are running the `checklist.verify` step of `tracker.push` for an ISSUE-anchored work item.',
		'',
		`Verify the single issue on \`${c.gh.owner}/${c.gh.repo}\` (use \`gh issue view --json labels,body,state\`).`,
		'',
		'CHECKLIST ITEMS (grade each pass/fail):',
		`  issueLabelled: The issue has \`${c.gh.epicLabel}\` and \`${membership}\` labels.`,
		'  bodyMatches:   The issue body matches the prerendered markdown given in the execute step VERBATIM (or was left untouched on adoption).',
		'  singleIssue:   Exactly ONE issue exists for this work item — no duplicates were created (the returned epicRef and storyRefs.s1 are the same ref).',
		...(c.gh.useMilestones ? [`  milestone:     Milestone \`${c.epicSlug}\` exists and the issue is attached.`] : ['  milestone:     (skipped — useMilestones=false)']),
		'',
		'RETURN:',
		'  Emit `{ items: [{ itemId, verdict, notes? }], failedCount }`.',
	].join('\n');
}

export function pushVerifyPrompt(c: Awaited<ReturnType<typeof assemblePushContext>>): string {
	if (c.headKind === 'issue') return pushVerifyPromptIssue(c);
	const tasksOn = c.gh.pushTasks && c.plans !== undefined && c.plans.length > 0;
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
		...(tasksOn ? [
			`  taskLabelled:    Every Task issue in \`taskRefs\` has \`${c.gh.taskLabel}\` and \`epic:${c.epicSlug}\` labels.`,
			`  subIssue:        Every Task issue is a sub-issue of its Story issue (\`gh api repos/${c.gh.owner}/${c.gh.repo}/issues/<storyN>/sub_issues\` lists it). Grade PASS if the org has sub-issues disabled and you skipped linking.`,
			`  taskCoverage:    \`taskRefs[storyId]\` has an entry for every Task in that Story's plan (from the \`plans\` context).`,
		] : []),
		'',
		'RETURN:',
		'  Emit `{ items: [{ itemId, verdict, notes? }], failedCount }`.',
	].join('\n');
}

function syncPrompt(c: Awaited<ReturnType<typeof assembleSyncContext>>): string {
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

function syncVerifyPrompt(c: Awaited<ReturnType<typeof assembleSyncContext>>): string {
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

function postPrompt(c: Awaited<ReturnType<typeof assemblePostContext>>): string {
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
