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
import { getLogger } from '../../../shared/logger.js';
import { renderValidatePrompt, resolveRepoPath, resolveTaskRef } from '../render.js';
import type { BuildStepDone, BuildStepError, BuildStepInputValidate } from '../types.js';

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

export async function handleValidate(input: BuildStepInputValidate): Promise<BuildStepDone | BuildStepError> {
	const repoPath = resolveRepoPath(input.repo);
	if (repoPath === undefined) {
		return err('no-repo', `insrc_build_step[validate]: no repo. Pass \`repo\` or set INSRC_REPO.`);
	}
	const resolved = resolveTaskRef(repoPath, input.target);
	if (!resolved.ok) return err('unresolved-target', resolved.message);

	const prompt = renderValidatePrompt(repoPath, resolved.ref);
	const provider: ValidateProvider = providerOverride ?? new CliProvider({ kind: 'claude' });

	log.info({ taskId: resolved.ref.taskId, storyId: resolved.ref.storyId }, 'insrc_build_step[validate]: running verdict session');
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
	return { next: 'done', verdict, passed };
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
