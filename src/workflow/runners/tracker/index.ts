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
import { acquireClaimMutex, CLAIM_VERSION, claimCreateIntent, markClaimCreatedFence, markClaimDispatched, pendingCreatePath, quarantineDeadClaim, readClaim, reconcileClaim, takeoverAbandonedClaim, updateClaimTarget, type PendingCreateClaim } from '../../tracker/pending-create-claim.js';

import {
	assemblePostContext,
	assemblePushContext,
	assembleSyncContext,
	lookupIssueCandidates,
} from './context.js';
import type { PushContext } from './schemas.js';
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
			// REVIEW round-14 HIGH: the push context was assembled for an ISSUE
			// head; if the durable head is now missing or changed, the context is
			// stale — refuse instead of falling through to a generic create/adopt
			// prompt with no claim and no live lookup.
			if (issue === undefined) {
				return {
					type: 'error' as const,
					code: 'issue-head-missing',
					message: `tracker.push: ISSUE head ${issueArtifactId(c.epicHash)} is missing or changed since the push context was assembled (readDefinitionHead returned ${head === undefined ? 'no head' : `kind '${head.kind}'`}) — re-run tracker.push so the context and head agree`,
					retryable: false,
				};
			}
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
				// REVIEW round-14 HIGH: the claim decision is made from the DURABLE
				// reread only — a stale context ref (existingRefs.epicRef with no
				// durable backing) must NOT suppress claim acquisition.
				if (durableRef === undefined) {
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
			// REVIEW round-14 HIGH: the durable reread is authoritative — a context
			// ref with no durable backing is stale; scrub it so the generic prompt
			// below cannot instruct adopting a ref the durable state does not have.
			if (durableRef === undefined && c.existingRefs?.epicRef !== undefined) {
				delete (ctx.stepOutputs['s1'] as Record<string, unknown>)['existingRefs'];
			}
			// the currently configured gh target — confirms candidates for legacy
			// claims whose own persisted target is unknown (round-8 MED)
			const ghTarget = `${c.gh.owner}/${c.gh.repo}`;
			// REVIEW round-12: a saved ref is only adoptable if it targets BOTH
			// the claim's recorded gh target (when present) and the currently
			// configured one — validated BEFORE any mutation prompt is emitted.
			const refTargetsRepo = (ref: string, target: string): boolean => ref.startsWith(`${target}#`);
			const savedRefTargetsOk = (saved: string, cl: PendingCreateClaim): boolean => {
				const claimTarget = cl.ghOwner !== undefined && cl.ghRepo !== undefined ? `${cl.ghOwner}/${cl.ghRepo}` : undefined;
				if (claimTarget !== undefined && !refTargetsRepo(saved, claimTarget)) return false;
				return refTargetsRepo(saved, ghTarget);
			};
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
			// REVIEW round-13 HIGH: canonical issue-ref parsing + configured-repo
			// validation live at THIS common ISSUE adoption boundary — every ISSUE
			// adoption path (durable ref, snapshot candidate, saved claim ref)
			// funnels through here, so a ref from another repo (e.g. a durable
			// meta.tracker.issueRef 'old/repo#41' with config acme/demo) is refused
			// BEFORE any mutation prompt is emitted, not only at finalize.
			const adoptionPause = (ref: string, how: string) => {
				const m = /^([^/#\s]+)\/([^/#\s]+)#(\d+)$/.exec(ref);
				if (m === null || m[1] !== c.gh.owner || m[2] !== c.gh.repo) {
					return refused(`adoption ref '${ref}' does not target the configured GitHub repository ${ghTarget} — refusing before any mutation prompt`);
				}
				// where a claim is retained, its recorded target and saved ref must
				// also agree with the adopted ref before proceeding.
				const retained = readClaim(ctx.intent.repoPath, c.epicHash);
				if (retained !== undefined) {
					const claimTarget = retained.ghOwner !== undefined && retained.ghRepo !== undefined ? `${retained.ghOwner}/${retained.ghRepo}` : undefined;
					if (claimTarget !== undefined && !refTargetsRepo(ref, claimTarget)) {
						return refused(`adoption ref '${ref}' does not target the retained claim's recorded repository ${claimTarget} — claim preserved; human resolves`);
					}
					if (retained.state === 'created' && retained.issueRef !== undefined && retained.issueRef !== ref) {
						return refused(`adoption ref '${ref}' conflicts with the retained created claim's recorded ref ${retained.issueRef} — claim preserved; human resolves`);
					}
				}
				return {
					type: 'llm-pause' as const,
					prompt: pushPrompt({ ...c, existingRefs: { ...c.existingRefs, epicRef: ref, storyRefs: { ...c.existingRefs?.storyRefs, [IMPLIED_ISSUE_STORY_ID]: ref } } }),
					userTurn: [
						`ADOPT the ${how} issue \`${ref}\` (do NOT create a duplicate).`,
						`Perform the required non-create mutations (labels, milestone, ${c.force ? 'forced body overwrite' : 'no body edit'}), then return the refs JSON.`,
					].join('\n'),
					schema: trackerPushExecuteSchema,
					preparedBlob: { stepId: 'execute' as const },
				};
			};
			// REVIEW round-8 MED: an unresolved claim is a TERMINAL error, not a
			// step output — an 'output' would flow into checklist.verify as refs
			// and be masked by a schema failure at finalize. `type:'error'`
			// aborts the run with the actionable resolution text intact.
			const refused = (reason: string, code = 'pending-create-unresolved') => ({
				type: 'error' as const,
				code,
				message: `tracker.push: unresolved pending-create claim — ${reason}`,
				retryable: false,
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
			// REVIEW round-9/10: discovery at the create decision. The context
			// snapshot is used ONLY for read-only adoption paths; it is NEVER
			// trusted to authorize a create (round-10 HIGH-1: an earlier empty
			// snapshot could hide an existing issue). Every create branch takes
			// a FRESH, COMPLETE live lookup after claim acquisition.
			const liveLookup = (): ReturnType<typeof lookupIssueCandidates> =>
				lookupIssueCandidates(ctx.intent.repoPath, c.gh.owner, c.gh.repo, c.epicHash, c.epicTitle);
			const resolveCandidates = async (): Promise<{ complete: true; candidates: NonNullable<PushContext['remoteCandidates']> } | { complete: false; reason: string }> => {
				if (c.remoteCandidates !== undefined) return { complete: true, candidates: c.remoteCandidates };
				const disc = await liveLookup();
				if (disc.ok) return { complete: true, candidates: disc.candidates };
				return { complete: false, reason: disc.reason };
			};
			// REVIEW round-9 HIGH-2 + round-10 HIGH-2: if the gh config changed
			// after the claim was written, retarget the claim under the mutex
			// (fence+runId checked) BEFORE reconciling — but ONLY a confirmed
			// pre-dispatch claim (pending + never dispatched + v2). Dispatched,
			// created and legacy claims keep their original target until their
			// outcome is resolved — retargeting them would erase the destination
			// of an unresolved create.
			const isConfirmedPreDispatch = (cl: PendingCreateClaim): boolean =>
				cl.state === 'pending' && cl.dispatchedAt === undefined && cl.version === CLAIM_VERSION;
			const retargetIfNeeded = async (active: PendingCreateClaim, fence: number): Promise<{ claim: PendingCreateClaim; fence: number }> => {
				if (!isConfirmedPreDispatch(active)) return { claim: active, fence };
				if (active.ghOwner === undefined || active.ghRepo === undefined) return { claim: active, fence };
				if (`${active.ghOwner}/${active.ghRepo}` === ghTarget) return { claim: active, fence };
				const committed = await updateClaimTarget(ctx.intent.repoPath, c.epicHash, fence, ctx.runId, c.gh.owner, c.gh.repo);
				const fresh = readClaim(ctx.intent.repoPath, c.epicHash);
				return { claim: fresh ?? { ...active, ghOwner: c.gh.owner, ghRepo: c.gh.repo, fence: committed }, fence: committed };
			};
			const claimResult = claim;
			if (issue !== undefined && claimResult !== undefined) {
				if (!claimResult.claimed) {
					// loser: reclaim a dead holder's guard, then try to take over an
					// ABANDONED claim. Only a successful takeover (runId === ours)
					// may advance the fence or carry it (round-6 HIGH-1).
					quarantineDeadClaim(ctx.intent.repoPath, c.epicHash);
					const took = await takeoverAbandonedClaim(ctx.intent.repoPath, c.epicHash, ctx.runId, Date.now());
					const disc = await resolveCandidates();
					if (took === undefined) {
						// LIVE foreign claim: read-only reconcile + adoption prompt.
						// No fence carried, no claim mutation — finalization refuses
						// while the claim is present without a carried fence (fail
						// closed) and proceeds plainly once the owner released it.
						if (!disc.complete) return refused(`remote discovery failed (${disc.reason}) — cannot verify adoption without a complete lookup; claim left untouched`, 'pending-create-discovery-failed');
						const reconciled = reconcileClaim(claimResult.claim, disc.candidates, ghTarget);
						// REVIEW round-11 HIGH: a 'created' claim's saved issueRef IS the
						// recovery identity — adopt it; a conflicting discovery refuses.
						const saved = claimResult.claim.state === 'created' ? claimResult.claim.issueRef : undefined;
						if (saved !== undefined) {
							// REVIEW round-12 HIGH: validate the saved ref against the claim's
							// recorded target AND the configured target before any prompt.
							if (!savedRefTargetsOk(saved, claimResult.claim)) {
								return refused(`saved ref ${saved} does not target the recorded/configured repository (configured ${ghTarget}) — claim left untouched; human resolves`);
							}
							// REVIEW round-12 MED: ambiguity refuses BEFORE remote work (LLD
							// multiple-match rule), even when a saved ref exists.
							if (!reconciled.ok && reconciled.verifiedCount > 1) return refused(reconciled.reason);
							if (reconciled.ok && reconciled.ref !== saved) {
								return refused(`discovered ${reconciled.ref} conflicts with the created claim's recorded ref ${saved} — claim left untouched; human resolves`);
							}
							return adoptionPause(saved, 'recorded on the created claim');
						}
						if (!reconciled.ok) return refused(reconciled.reason);
						return adoptionPause(reconciled.ref, 'marker-verified');
					}
					// we own the taken-over claim — retarget first if the gh config
					// changed AND the claim is confirmed pre-dispatch (round-9/10
					// HIGH-2), then reconcile under a FRESH live lookup (round-10
					// HIGH-1: the snapshot may only adopt, never authorize create).
					const rt = await retargetIfNeeded(took, took.fence);
					const fresh = await liveLookup();
					if (!fresh.ok && c.remoteCandidates === undefined) return refused(`remote discovery failed (${fresh.reason}) — claim retained; neither reconciliation nor a create is authorized without a complete lookup`, 'pending-create-discovery-failed');
					const candidates = fresh.ok ? fresh.candidates : c.remoteCandidates!;
					// REVIEW round-11 HIGH: a 'created' claim's saved issueRef IS the
					// recovery identity (LLD created-claim rule) — adopt it directly
					// with the fence we already own (no write needed); a conflicting
					// discovery result refuses while preserving the claim.
					if (rt.claim.state === 'created' && rt.claim.issueRef !== undefined) {
						const saved = rt.claim.issueRef;
						// REVIEW round-12 HIGH: validate the saved ref against the claim's
						// recorded target AND the configured target BEFORE emitting any
						// mutation prompt — a cross-repo saved ref refuses here, not at
						// finalize after the execution turn.
						if (!savedRefTargetsOk(saved, rt.claim)) {
							return refused(`saved ref ${saved} does not target the recorded claim target / configured ${ghTarget} — claim ${pendingCreatePath(ctx.intent.repoPath, c.epicHash)} preserved; human resolves`);
						}
						const discovered = reconcileClaim(rt.claim, candidates, ghTarget);
						// REVIEW round-12 MED: multiple verified matches refuse BEFORE any
						// remote work (LLD multiple-match rule), even with a saved ref.
						if (!discovered.ok && discovered.verifiedCount > 1) {
							return refused(`${discovered.reason} — ambiguous discovery with a saved ref ${saved}; claim preserved; human resolves`);
						}
						if (discovered.ok && discovered.ref !== saved) {
							return refused(`discovered ${discovered.ref} conflicts with the created claim's recorded ref ${saved} — claim ${pendingCreatePath(ctx.intent.repoPath, c.epicHash)} preserved; human resolves`);
						}
						setFence(rt.fence);
						return adoptionPause(saved, 'recorded on the created claim');
					}
					const reconciled = reconcileClaim(rt.claim, candidates, ghTarget);
					if (reconciled.ok) {
						// exactly one marker+target-verified candidate: mark the claim
						// 'created' under the mutex (fence- + run-checked) and carry
						// the COMMITTED fence (round-2 HIGH-1). The claim is RETAINED
						// until the ref is durably persisted — finalize releases it.
						const markedFence = await markClaimCreatedFence(ctx.intent.repoPath, c.epicHash, rt.fence, reconciled.ref, undefined, ctx.runId);
						setFence(markedFence);
						return adoptionPause(reconciled.ref, 'marker-verified');
					}
					if (!reconciled.ok) {
						// REVIEW round-6 HIGH-2: a 'pending' v2 claim that was NEVER
						// dispatched (no dispatchedAt) with ZERO marker-verified remote
						// candidates — under a COMPLETE lookup — is a CONFIRMED
						// pre-dispatch failure: the session stopped before
						// `gh issue create`. This run owns the claim, so recover by
						// dispatching the create now (duplicate protection holds:
						// nothing was dispatched and no verified remote issue exists).
						// REVIEW round-7 HIGH-1: only a v2 claim (CLAIM_VERSION) proves
						// pre-dispatch — a LEGACY claim (no version) has UNKNOWN
						// dispatch history, so it takes the refusal path, never create.
						if (reconciled.verifiedCount === 0 && isConfirmedPreDispatch(rt.claim)) {
								// round-10 HIGH-1: create is authorized ONLY by the fresh complete lookup taken after claim acquisition
								if (!fresh.ok) return refused(`remote discovery failed (${fresh.reason}) — an empty earlier snapshot is not absence; no create dispatched`, 'pending-create-discovery-failed');
							const committedFence = await markClaimDispatched(ctx.intent.repoPath, c.epicHash, rt.fence, ctx.runId);
							setFence(committedFence);
							// fall through to the normal create dispatch below
						} else {
							// ambiguous remote outcome (create dispatched but the response
							// was lost, legacy claim with unknown dispatch history, or >1
							// verified candidates): explicit resolution path — refuse,
							// retain the claim, and never instruct claim deletion as a way
							// to force a create (REVIEW round-7 HIGH-2: deletion is for
							// CONFIRMED absence only; a confirmed remote ref is adopted by
							// recording it on the work item, and the next run's durable-ref
							// branch adopts with 0 creates). Duplicate protection preserved.
							return refused(`${reconciled.reason} — claim ${pendingCreatePath(ctx.intent.repoPath, c.epicHash)} retained (state ${rt.claim.state}, dispatched ${rt.claim.dispatchedAt !== undefined}, version ${rt.claim.version ?? 'legacy'}). Resolution: if the remote issue is CONFIRMED on GitHub, record its ref on the work item (ISSUE meta.tracker.issueRef / head binding) and retry — the next run adopts it with 0 creates; delete the claim file ONLY after confirming NO remote issue exists (confirmed absence)`);
						}
					}
				} else {
					// winner — REVIEW round-8 HIGH-1 + round-10 HIGH-1: BEFORE
					// dispatching a create, retarget the claim if the gh config changed
					// AND the claim is confirmed pre-dispatch (round-9/10 HIGH-2), then
					// take a FRESH live lookup after claim acquisition and reconcile
					// against it. The context snapshot may only ADOPT — an earlier
					// empty snapshot never authorizes a create. An existing
					// marker+target-verified issue means ADOPT; >1 verified refuses;
					// only 0 verified under the fresh COMPLETE lookup authorizes create.
					const rt = await retargetIfNeeded(claimResult.claim, claimResult.claim.fence);
					const fresh = await liveLookup();
					const candidates = fresh.ok ? fresh.candidates : (c.remoteCandidates ?? []);
					const pre = reconcileClaim(rt.claim, candidates, ghTarget);
					if (pre.ok) {
						const markedFence = await markClaimCreatedFence(ctx.intent.repoPath, c.epicHash, rt.fence, pre.ref, undefined, ctx.runId);
						setFence(markedFence);
						return adoptionPause(pre.ref, 'marker-verified');
					}
					if (pre.verifiedCount > 1) return refused(pre.reason);
					if (!fresh.ok) return refused(`remote discovery failed (${fresh.reason}) — a failed lookup is not absence and an earlier snapshot cannot authorize a create; no create dispatched`, 'pending-create-discovery-failed');
					// 0 verified under the fresh COMPLETE lookup: record dispatch +
					// heartbeat under the mutex (fence- + run-checked), then dispatch.
					// The COMMITTED fence rides in the context so finalization can
					// fence the whole persistence op (round-2 HIGH-1).
					const committedFence = await markClaimDispatched(ctx.intent.repoPath, c.epicHash, rt.fence, ctx.runId);
					setFence(committedFence);
				}
			}
			if (claimResult === undefined) {
				// existingRefs seeded by the context: reconcile any retained claim
				// toward adoption — carry a fence only on a successful takeover.
				const existing = readClaim(ctx.intent.repoPath, c.epicHash);
				if (existing !== undefined) {
					const took = await takeoverAbandonedClaim(ctx.intent.repoPath, c.epicHash, ctx.runId, Date.now());
					if (took !== undefined && took.runId === ctx.runId) setFence(took.fence);
				}
			}
			// REVIEW round-14 HIGH: the ISSUE execute branch is EXHAUSTIVE — the
			// generic mutation prompt below is reachable ONLY after recording
			// dispatch under an OWNED claim this run (claimFence + claimRunId
			// carried together). Every adoption path returned above through the
			// validated adoptionPause boundary; any other fall-through refuses.
			const s1o = ctx.stepOutputs['s1'] as Record<string, unknown>;
			if (s1o['claimFence'] === undefined || s1o['claimRunId'] !== ctx.runId) {
				return refused('reached the generic ISSUE mutation prompt without a validated adoption or a dispatched owned claim — the durable reread decides; re-run tracker.push', 'issue-fallthrough-refused');
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
