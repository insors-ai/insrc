/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_build_step` phase='validate'.
 *
 * The daemon runs the validation ITSELF as a read-only agentic CLI session
 * against the actual repo: the rendered `validate-task.md` prompt inspects the
 * working tree, runs the tests + typecheck, and emits a JSON verdict. The
 * daemon parses that verdict and returns it — it is the sole authority for
 * `passed`, never a controller self-report.
 */

import { CliProvider } from '../../../agent/providers/cli-provider.js';
import { createRoleRouter } from '../../../analyze/context/role-router.js';
import { runWithRoutingContext, currentRoutingContext } from '../../../analyze/context/shaper-provider.js';
import { loadAnalyzeConfig } from '../../../config/analyze.js';
import { getLogger } from '../../../shared/logger.js';
import { renderValidatePrompt, renderStandaloneValidatePrompt, resolveRepoPath, resolveTaskRef } from '../render.js';
import { persistBuildRecord, standaloneEpicHashFromFocus } from '../../../workflow/runners/build/standalone-record.js';
import { collectBuildChangeLog } from '../../../workflow/runners/build/changed-files.js';
import { readLldArtifact } from '../../../workflow/gates.js';
import { lldMdRel, workItemAnchorCreatedAt, workItemKindOf } from '../../../workflow/storage.js';
import type { BuildStandaloneContext, BuildStepDone, BuildStepError, BuildStepInputValidate } from '../types.js';

const log = getLogger('mcp:build-step:validate');

/** The minimal provider surface validate drives (one agentic edit-permission
 *  session; the prompt is read-only-inspect + run-tests + emit JSON). */
export interface ValidateProvider {
	runEditSession(prompt: string, opts: { cwd: string; timeoutMs?: number | undefined }): Promise<{ text: string }>;
}

/** Test seam: inject a fake provider whose `runEditSession` returns a canned
 *  verdict, so the handler is exercised without spawning the live CLI. */
let providerOverride: ValidateProvider | undefined;
export function _setBuildValidateProviderForTests(p: ValidateProvider | undefined): void {
	providerOverride = p;
}

/** Resolve the edit-session provider for build validation. Validation is a
 *  critical (`build`) role → resolves the HIGH (core) tier via the RoleRouter
 *  (default: claude opus; codex `gpt-5.5` for a Codex install, or whatever the
 *  operator pinned core to). Edit sessions require a CLI (`runEditSession`), so a
 *  non-CLI resolution (an operator who pinned core→ollama) falls back to claude. */
function resolveValidateProvider(repoPath: string): ValidateProvider {
	// Reuse the ambient sc6 router when a routing seam is established (handleValidate
	// sets one), else construct one — either way the 'build' tier decides the model.
	const router = currentRoutingContext()?.router ?? createRoleRouter({});
	const { resolution } = router.resolveProviderForRole('build', loadAnalyzeConfig(), repoPath);
	if (resolution.runner === 'cli-claude' || resolution.runner === 'cli-codex') {
		const kind = resolution.runner === 'cli-codex' ? 'codex' : 'claude';
		return new CliProvider({ kind, ...(resolution.model !== '' ? { model: resolution.model } : {}) });
	}
	log.warn({ runner: resolution.runner }, "build-step[validate]: 'build' tier resolved to a non-CLI runner; edit sessions require a CLI — falling back to claude");
	return new CliProvider({ kind: 'claude' });
}

export async function handleValidate(input: BuildStepInputValidate): Promise<BuildStepDone | BuildStepError> {
	const repoPath = await resolveRepoPath(input.repo);
	if (repoPath === undefined) {
		return err('no-repo', `insrc_build_step[validate]: no repo. Pass \`repo\` or set INSRC_REPO.`);
	}

	// S002: standalone (no-plan) validate — a triage-routed Small story. Resolve the
	// story identity from the standalone context (mirroring handleStandaloneImplement)
	// instead of the plan-driven resolveTaskRef, so a small standalone story reaches
	// the SAME verdict session + persist-on-verdict path and lands a BUILD record for
	// the completion gate to approve. The plan-driven path below is untouched.
	if (input.standalone !== undefined) {
		return handleStandaloneValidate(repoPath, input.standalone);
	}

	const resolved = resolveTaskRef(repoPath, input.target, input.epicHash);
	if (!resolved.ok) return err('unresolved-target', resolved.message);

	const prompt = renderValidatePrompt(repoPath, resolved.ref);
	return runValidateSession(repoPath, prompt, {
		epicHash: resolved.ref.epicHash,
		storyId:  resolved.ref.storyId,
		taskId:   resolved.ref.taskId,
	});
}

/** S002: the standalone (no-plan) validate branch. Resolves the Story identity
 *  from the standalone context (mirroring handleStandaloneImplement), reads the
 *  standalone LLD (best-effort) for the verdict prompt, then runs the SAME verdict
 *  session + persist path as the plan-driven branch. */
async function handleStandaloneValidate(
	repoPath: string,
	ctx:      BuildStandaloneContext,
): Promise<BuildStepDone | BuildStepError> {
	const sizeClass = ctx.sizeClass ?? 'small';
	const producesLld = sizeClass !== 'trivial';
	const epicHash = ctx.epicHash ?? (producesLld ? undefined : standaloneEpicHashFromFocus(ctx.focus ?? ''));
	if (epicHash === undefined) {
		return err('no-identity', `insrc_build_step[validate]: a standalone Small validate requires \`standalone.epicHash\` + \`storyId\` (the approved LLD identity).`);
	}
	const storyId = ctx.storyId ?? 'S001';

	// Point the verdict gate at the standalone LLD when one exists (Small). A missing
	// / unreadable LLD just omits the reference — the gate still runs the tests + typecheck.
	let lldMdRelPath: string | undefined;
	if (producesLld) {
		try {
			const lld = readLldArtifact(repoPath, epicHash, storyId);
			lldMdRelPath = lldMdRel(epicHash, workItemAnchorCreatedAt(lld.meta), workItemKindOf(lld.meta), lld.meta.epicSlug ?? epicHash, storyId);
		} catch (e) {
			log.info({ storyId, err: e instanceof Error ? e.message : String(e) }, 'insrc_build_step[validate]: standalone LLD unreadable for the verdict prompt');
		}
	}

	const prompt = renderStandaloneValidatePrompt({ storyId, sizeClass, lldMdRel: lldMdRelPath });
	return runValidateSession(repoPath, prompt, { epicHash, storyId, taskId: storyId });
}

/** Shared: run the read-only verdict session under the sc6 routing seam, parse the
 *  verdict, and persist the BUILD ledger record as a fail-open SIDE EFFECT. Used by
 *  BOTH the plan-driven and the standalone (S002) branches so the verdict + persist
 *  behaviour is identical. */
async function runValidateSession(
	repoPath: string,
	prompt:   string,
	ident:    { readonly epicHash: string; readonly storyId: string; readonly taskId: string },
): Promise<BuildStepDone | BuildStepError> {
	// Establish the sc6 routing seam so the edit-session provider resolves through
	// the same choke point as the workflow runner (the 'build' tier), unifying the
	// pattern and tiering any deep reasoning the session triggers.
	const router = createRoleRouter({});
	return runWithRoutingContext({ router, repoPath }, async () => {
		const provider: ValidateProvider = providerOverride ?? resolveValidateProvider(repoPath);

		log.info({ taskId: ident.taskId, storyId: ident.storyId }, 'insrc_build_step[validate]: running verdict session');
		const response = await provider.runEditSession(prompt, { cwd: repoPath });

		const verdict = parseVerdict(response.text);
		if (verdict === undefined) {
			return err(
				'unparseable-verdict',
				`insrc_build_step[validate]: the validation session did not emit a parseable JSON verdict. ` +
				`Raw tail: ${response.text.slice(-600)}`,
			);
		}
		const passed = (verdict as { passed?: unknown }).passed === true;

		// Persist the BUILD ledger record as a SIDE EFFECT of the verdict, so story
		// completion has a real BUILD-<epicHash>-<storyId> record to approve without a
		// hand-back-fill. Gated on a resolvable epic+story identity (never write a
		// BUILD-undefined path); a persistence failure is swallowed so it can never
		// convert a real verdict into an error (k5, fail-open).
		const { epicHash, storyId, taskId } = ident;
		if (epicHash.length > 0 && storyId.length > 0) {
			try {
				const now = new Date().toISOString();
				// Collect the file-level change-log of the build's changed set. A git
				// failure is swallowed inside collectBuildChangeLog (→ []), and an empty
				// change-log is omitted from the body (omit-slot) so a no-change build
				// stays byte-identical (k4).
				const changeLog = await collectBuildChangeLog(repoPath, { author: 'insrc-build', timestamp: now });
				persistBuildRecord(repoPath, {
					meta: { workflow: 'build', standalone: false, epicHash, storyId, createdAt: now, updatedAt: now },
					body: { tasks: [{ id: taskId, passed }], ...(changeLog.length > 0 ? { changeLog } : {}) },
				});
			} catch (err) {
				log.warn(
					{ storyId, taskId, err: err instanceof Error ? err.message : String(err) },
					'insrc_build_step[validate]: BUILD ledger persist failed; returning the verdict unchanged',
				);
			}
		}
		return { next: 'done', verdict, passed };
	});
}

/** Extract the verdict object from the session's free-form text — the LAST
 *  fenced ```json block, else the LAST balanced trailing `{...}` object.
 *  Returns undefined when nothing parses. */
export function parseVerdict(text: string): unknown {
	// 1) Prefer the last ```json fenced block.
	const fenceRe = /```json\s*([\s\S]*?)```/gi;
	let lastFenced: string | undefined;
	for (let m = fenceRe.exec(text); m !== null; m = fenceRe.exec(text)) {
		lastFenced = m[1];
	}
	if (lastFenced !== undefined) {
		const parsed = tryParse(lastFenced);
		if (parsed !== undefined) return parsed;
	}
	// 2) Fall back to the last balanced top-level `{...}` in the text.
	const obj = lastBalancedObject(text);
	if (obj !== undefined) return tryParse(obj);
	return undefined;
}

function tryParse(s: string): unknown {
	try {
		const v = JSON.parse(s.trim()) as unknown;
		return typeof v === 'object' && v !== null ? v : undefined;
	} catch {
		return undefined;
	}
}

/** Scan for the last balanced `{...}` region (brace-depth walk, ignoring
 *  braces inside double-quoted strings). */
function lastBalancedObject(text: string): string | undefined {
	let best: string | undefined;
	for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
		let depth = 0;
		let inStr = false;
		let escaped = false;
		for (let i = start; i < text.length; i++) {
			const ch = text[i]!;
			if (inStr) {
				if (escaped) escaped = false;
				else if (ch === '\\') escaped = true;
				else if (ch === '"') inStr = false;
				continue;
			}
			if (ch === '"') inStr = true;
			else if (ch === '{') depth++;
			else if (ch === '}') {
				depth--;
				if (depth === 0) { best = text.slice(start, i + 1); break; }
			}
		}
	}
	return best;
}

function err(code: string, message: string): BuildStepError {
	return { next: 'error', error: { code, message, retryable: false } };
}
