/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_build_step` phase='implement'.
 *
 * Resolve the task, run the admission gate, then return the rendered implement
 * prompt. The CONTROLLER runs the returned prompt — the daemon does NOT edit
 * code here.
 *
 * There is NO open-question gate at build: open questions are resolved at the
 * START of each consuming stage on its immediate-upstream artifact (see
 * `workflow/questions.ts` + `insrc_workflow_step`). Build's upstream is the
 * PLAN, which carries no open questions. The decisions made at plan-start —
 * recorded on the Story LLD's `meta.questionResolutions` — are still surfaced
 * to the implementer via the prompt's "## Resolved design decisions" section.
 */

import { getLogger } from '../../../shared/logger.js';
import { readLldArtifact } from '../../../workflow/gates.js';
import { lldMdRel } from '../../../workflow/storage.js';
import { renderResolvedDecisions } from '../../../workflow/questions.js';
import { admitBuild, admitStandaloneBuild } from '../../../workflow/runners/build/admission.js';
import {
	persistStandaloneBuildRecord,
	standaloneEpicHashFromFocus,
} from '../../../workflow/runners/build/standalone-record.js';
import { renderImplementPrompt, renderStandaloneImplementPrompt, resolveRepoPath, resolveTaskRef } from '../render.js';
import type {
	BuildStandaloneContext,
	BuildStepError,
	BuildStepImplement,
	BuildStepInputImplement,
	BuildStepRefused,
} from '../types.js';

const log = getLogger('mcp:build-step:implement');

export async function handleImplement(
	input: BuildStepInputImplement,
): Promise<BuildStepImplement | BuildStepRefused | BuildStepError> {
	const repoPath = await resolveRepoPath(input.repo);
	if (repoPath === undefined) {
		return err('no-repo', `insrc_build_step[implement]: no repo. Pass \`repo\` or set INSRC_REPO.`);
	}

	// Standalone (no-plan) build — a triage-routed Small (LLD → build) or Trivial
	// (build only) feature. Bypasses task/tracker resolution; the spec is the
	// standalone LLD or the scope statement. See `plans/feature-triage-router.md`.
	if (input.standalone?.standalone === true) {
		return handleStandaloneImplement(repoPath, input.standalone);
	}

	const resolved = resolveTaskRef(repoPath, input.target);
	if (!resolved.ok) return err('unresolved-target', resolved.message);
	const ref = resolved.ref;

	// Admission gate — refuse when the Story's plan is missing / unapproved /
	// stale. Read-only; the tree is untouched.
	const verdict = admitBuild(repoPath, ref.epicHash, ref.storyId);
	if (!verdict.admitted) {
		log.info(
			{ taskId: ref.taskId, storyId: ref.storyId, reason: verdict.refusal.reason },
			'insrc_build_step[implement]: admission refused',
		);
		return { next: 'refused', refusal: verdict.refusal };
	}

	// Surface the design decisions made at plan-start (recorded on the Story
	// LLD's meta.questionResolutions) into the template's "## Resolved design
	// decisions" section. Best-effort — a missing LLD just leaves it empty.
	let resolvedDecisions = '';
	try {
		const lld = readLldArtifact(repoPath, ref.epicHash, ref.storyId);
		resolvedDecisions = renderResolvedDecisions(lld.meta.questionResolutions);
	} catch (e) {
		log.info({ storyId: ref.storyId, err: e instanceof Error ? e.message : String(e) }, 'insrc_build_step[implement]: LLD unreadable for resolved decisions');
	}

	const prompt = renderImplementPrompt(repoPath, ref, resolvedDecisions);
	log.info({ taskId: ref.taskId, storyId: ref.storyId, workflowId: ref.workflowId }, 'insrc_build_step[implement]: emitting prompt');
	return {
		next:       'implement',
		taskId:     ref.taskId,
		workflowId: ref.workflowId,
		issueRef:   ref.issueRef,
		prompt,
	};
}

/** The no-plan standalone implement path. Small implements the approved
 *  standalone LLD directly; Trivial implements the scope statement and persists
 *  a standalone BUILD tracking record (its only ledger entry). */
function handleStandaloneImplement(
	repoPath: string,
	ctx:      BuildStandaloneContext,
): BuildStepImplement | BuildStepRefused | BuildStepError {
	const sizeClass   = ctx.sizeClass ?? 'small';
	const producesLld = sizeClass !== 'trivial';
	const focus       = (ctx.focus ?? '').trim();

	if (!producesLld && focus.length === 0) {
		return err('no-scope', `insrc_build_step[implement]: a standalone trivial build requires \`standalone.focus\` (the scope statement).`);
	}

	// Identity: Small must carry the approved-LLD identity; Trivial derives a
	// stable hash from its scope when none is provided.
	const epicHash = ctx.epicHash ?? (producesLld ? undefined : standaloneEpicHashFromFocus(focus));
	if (epicHash === undefined) {
		return err('no-identity', `insrc_build_step[implement]: a standalone Small build requires \`standalone.epicHash\` + \`storyId\` (the approved LLD identity).`);
	}
	const storyId = ctx.storyId ?? 'S001';

	const verdict = admitStandaloneBuild(repoPath, epicHash, storyId, producesLld);
	if (!verdict.admitted) {
		log.info({ storyId, sizeClass, reason: verdict.refusal.reason }, 'insrc_build_step[implement]: standalone admission refused');
		return { next: 'refused', refusal: verdict.refusal };
	}

	let lldMdRelPath: string | undefined;
	let resolvedDecisions = '';
	let specFocus = focus.length > 0 ? focus : `Implement the approved standalone LLD for Story ${storyId}.`;

	if (producesLld) {
		const lld = readLldArtifact(repoPath, epicHash, storyId);
		resolvedDecisions = renderResolvedDecisions(lld.meta.questionResolutions);
		lldMdRelPath = lldMdRel(lld.meta.epicSlug ?? epicHash, storyId);
	} else {
		// Trivial — no upstream artifact; persist the tracking record so the
		// change is on the ledger.
		persistStandaloneBuildRecord(repoPath, {
			meta: {
				workflow: 'build', standalone: true, sizeClass, epicHash, storyId,
				createdAt: new Date().toISOString(),
				...(ctx.triageRationale !== undefined ? { triageRationale: ctx.triageRationale } : {}),
			},
			body: { focus: specFocus, producesLld: false },
		});
	}

	const prompt = renderStandaloneImplementPrompt({
		storyId, sizeClass, producesLld, focus: specFocus,
		lldMdRel: lldMdRelPath, resolvedDecisions,
	});
	log.info({ storyId, sizeClass, standalone: true, producesLld }, 'insrc_build_step[implement]: emitting standalone prompt');
	return { next: 'implement', taskId: storyId, workflowId: epicHash, issueRef: undefined, prompt };
}

function err(code: string, message: string): BuildStepError {
	return { next: 'error', error: { code, message, retryable: false } };
}
