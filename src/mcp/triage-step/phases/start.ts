/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_triage` phase='start'. Resolve the repo + focus, hand the controller
 * the classification prompt + schema, and instruct it to GROUND the sizing on
 * `insrc_analyze_step` passes before emitting. State (focus + repo) rides an
 * opaque base64 token to the `classify` turn.
 */

import { getLogger } from '../../../shared/logger.js';
import { buildClassifyPrompt, CLASSIFY_SCHEMA } from '../../../workflow/triage/classify.js';
import { encodeState } from '../state.js';
import type { TriageEmitClassification, TriageInputStart, TriageState } from '../types.js';

const log = getLogger('mcp:triage-step:start');

export function handleStart(input: TriageInputStart): TriageEmitClassification {
	const repo = resolveRepoPath(input.repo);
	if (repo === undefined) {
		throw new Error(
			`insrc_triage[start]: no repo. Pass \`repo\` explicitly or set INSRC_REPO ` +
			`in the MCP server's environment.`,
		);
	}
	if (typeof input.focus !== 'string' || input.focus.trim().length === 0) {
		throw new Error(`insrc_triage[start]: \`focus\` (the feature request) is required.`);
	}

	const state: TriageState = {
		runId: `tri-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		focus: input.focus,
		repo,
	};

	// Grounding is the controller's own analyze passes — the prompt tells it to
	// size against the real graph and cite the paths it finds.
	const prompt = buildClassifyPrompt({
		focus: input.focus,
		grounding:
			'Run `insrc_analyze_step` passes FIRST to size this against the real graph ' +
			'(which modules/files it touches, caller counts, new-vs-reuse), then classify. ' +
			'Every `signals[].evidence` entry must be a real path/entity you found — do not invent.',
	});

	log.info({ runId: state.runId, repo, focus: input.focus.slice(0, 80) }, 'insrc_triage[start]: emitting classify prompt');

	return {
		next:     'emit_classification',
		guidance:
			`Ground the sizing on \`insrc_analyze_step\` passes, then emit a TriageResult JSON ` +
			`matching the schema below and call insrc_triage again with phase="classify", ` +
			`result=<your JSON>, state=<the state field verbatim>.`,
		prompt,
		schema:   CLASSIFY_SCHEMA as Record<string, unknown>,
		state:    encodeState(state),
	};
}

function resolveRepoPath(explicit: string | undefined): string | undefined {
	if (explicit !== undefined && explicit.length > 0) return explicit;
	const env = process.env['INSRC_REPO'];
	if (env !== undefined && env.length > 0) return env;
	return undefined;
}
