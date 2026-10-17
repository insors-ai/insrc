/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Policy file parser (Story s2).
 *
 * Validates `.insrc/policy.json` against the authored-fields schema and builds
 * the derived `TeamPolicy`. `claimUnits` and `forceTaskIssues` are fixed by the
 * daemon and `source` is derived by the reader, so a file that carries any of
 * them is invalid: the file can never override them.
 */

import { SIGNOFF_STAGES } from './types.js';
import type { PolicyAnchor, PolicyFile, PolicyResult, SignoffStage, TeamPolicy } from './types.js';

const AUTHORED_FIELDS = ['teamMode', 'signoffStages', 'claimsEnforced', 'administrators'] as const;
const DAEMON_FIXED_FIELDS = ['claimUnits', 'forceTaskIssues', 'source'] as const;

function fail(reason: string): { ok: false; reason: string } {
	return { ok: false, reason };
}

export function parsePolicyFile(text: string): PolicyResult<PolicyFile> {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (err) {
		return fail(`policy file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
	}
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		return fail('policy file must be a JSON object');
	}
	const obj = raw as Record<string, unknown>;

	for (const name of DAEMON_FIXED_FIELDS) {
		if (name in obj) return fail(`policy file must not set '${name}': it is fixed or derived by the daemon`);
	}
	for (const name of Object.keys(obj)) {
		if (!(AUTHORED_FIELDS as readonly string[]).includes(name)) return fail(`policy file has unknown field '${name}'`);
	}

	const { teamMode, claimsEnforced, signoffStages, administrators } = obj;
	if (typeof teamMode !== 'boolean') return fail("policy field 'teamMode' must be a boolean");
	if (typeof claimsEnforced !== 'boolean') return fail("policy field 'claimsEnforced' must be a boolean");
	if (!Array.isArray(signoffStages)) return fail("policy field 'signoffStages' must be an array");
	const stages: SignoffStage[] = [];
	for (const stage of signoffStages) {
		if (typeof stage !== 'string' || !(SIGNOFF_STAGES as readonly string[]).includes(stage)) {
			return fail(`policy field 'signoffStages' has invalid stage ${JSON.stringify(stage)} (allowed: ${SIGNOFF_STAGES.join(', ')})`);
		}
		if (stages.includes(stage as SignoffStage)) return fail(`policy field 'signoffStages' repeats stage '${stage}'`);
		stages.push(stage as SignoffStage);
	}
	if (!Array.isArray(administrators) || administrators.some(a => typeof a !== 'string' || a.length === 0)) {
		return fail("policy field 'administrators' must be an array of non-empty strings");
	}

	return { ok: true, value: { teamMode, signoffStages: stages, claimsEnforced, administrators: administrators as string[] } };
}

/** Build the full policy: the daemon fixes `claimUnits`/`forceTaskIssues`; `source` is derived. */
export function buildTeamPolicy(file: PolicyFile, source: { ref: string; fetchedAt: string; anchor: PolicyAnchor }): TeamPolicy {
	return {
		...file,
		claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] },
		forceTaskIssues: true,
		source: {
			ref:             source.ref,
			fetchedAt:       source.fetchedAt,
			firstCommit:     source.anchor.known ? source.anchor.firstCommit : '',
			firstCommitTime: source.anchor.known ? source.anchor.firstCommitTime : '',
			anchorKnown:     source.anchor.known,
		},
	};
}
