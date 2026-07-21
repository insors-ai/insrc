/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_review_step` phase='start' handler.
 *
 * 1. Resolve the repo path (explicit param > INSRC_REPO env).
 * 2. Resolve the artifact's md + json paths (`jsonPathForMd`).
 * 3. Read the artifact markdown; read `meta.workflow` as the review stage.
 * 4. Seed the run state under an opaque token.
 * 5. Return emit_claims — the controller extracts the load-bearing premises.
 */

import { existsSync, readFileSync } from 'node:fs';

import { getLogger } from '../../../shared/logger.js';
import { jsonPathForMd } from '../../../workflow/gates.js';
import { buildExtractPrompt, EXTRACT_SCHEMA } from '../../../workflow/review/index.js';
import { saveState } from '../state-store.js';
import type { ReviewStepEmitClaims, ReviewStepInputStart, ReviewStepStatePayload } from '../types.js';

const log = getLogger('mcp:review-step:start');

export function handleStart(input: ReviewStepInputStart): ReviewStepEmitClaims {
	const repo = resolveRepoPath(input.repo);
	if (repo === undefined) {
		throw new Error(
			`insrc_review_step[start]: no repo. Pass \`repo\` explicitly or set INSRC_REPO ` +
			`in the MCP server's environment.`,
		);
	}
	if (typeof input.artifact !== 'string' || input.artifact.length === 0) {
		throw new Error(`insrc_review_step[start]: \`artifact\` (a .md / .html / .json path) is required.`);
	}

	const { mdPath, jsonPath } = resolvePaths(input.artifact);
	if (!existsSync(jsonPath)) throw new Error(`insrc_review_step[start]: no artifact json at ${jsonPath}`);
	if (!existsSync(mdPath))   throw new Error(`insrc_review_step[start]: no artifact md at ${mdPath}`);

	const artifact = JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: Record<string, unknown> };
	const stage = typeof artifact.meta?.['workflow'] === 'string' ? (artifact.meta['workflow'] as string) : 'unknown';
	const markdown = readFileSync(mdPath, 'utf8');

	const state: ReviewStepStatePayload = {
		runId:       `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		startedAtMs: Date.now(),
		mdPath,
		jsonPath,
		repo,
		stage,
		markdown,
	};
	const token = saveState(state);

	const prompt = buildExtractPrompt(markdown, stage);
	log.info({ runId: state.runId, stage, mdPath }, 'insrc_review_step[start]: emitting extract prompt');

	return {
		next:     'emit_claims',
		guidance:
			`Extract the artifact's load-bearing premises as a claims JSON matching the ` +
			`schema below, then call insrc_review_step with phase="claims", ` +
			`claims=<your JSON>, state=<the state field verbatim>.`,
		stage,
		prompt,
		schema:   EXTRACT_SCHEMA as Record<string, unknown>,
		state:    token,
	};
}

function resolveRepoPath(explicit: string | undefined): string | undefined {
	if (explicit !== undefined && explicit.length > 0) return explicit;
	const env = process.env['INSRC_REPO'];
	if (env !== undefined && env.length > 0) return env;
	return undefined;
}

/** Resolve the artifact's (md, json) pair. Given a `.md`/`.html` path the
 *  canonical json is found via `jsonPathForMd`; given a `.json` path its
 *  `.md` sibling is derived by extension swap. */
function resolvePaths(artifact: string): { mdPath: string; jsonPath: string } {
	if (artifact.endsWith('.json')) {
		return { jsonPath: artifact, mdPath: artifact.replace(/\.json$/, '.md') };
	}
	return { mdPath: artifact, jsonPath: jsonPathForMd(artifact) };
}
