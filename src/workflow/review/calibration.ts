/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Calibration eval harness (R5b) — certifies the severity rubric against a
 * FIXED, hand-curated claim+evidence set drawn from the streaming-progress
 * plan audit (docs/reviews/2026-07-20-plan-audit-streaming.md).
 *
 * Why fixed: a full `runReview` varies run-to-run because `extractClaims` is
 * non-deterministic (different claim sets each time), so its HIGH/MED counts
 * can't certify the rubric. Here the claim AND the evidence are frozen, so the
 * only variable is `verifyClaim`'s judgment — exactly what the rubric controls.
 * Run it N rounds to measure both correctness (vs `expected`) and stability.
 *
 * This calls a real LLM per case, so it runs on demand / behind
 * `INSRC_LIVE_TESTS`, never in the fast unit sweep.
 */

import type { LLMProvider } from '../../shared/types.js';
import { verifyClaim } from './verify.js';
import type { Claim, Evidence, Severity } from './types.js';

export interface CalibrationCase {
	readonly claim:     Claim;
	readonly evidence:  Evidence;
	/** Ground-truth severity, per the manual audit + a materiality judgment. */
	readonly expected:  Severity;
	readonly rationale: string;
}

const SEV_RANK: Record<Severity, number> = { HIGH: 2, MED: 1, LOW: 0 };

function ev(claimId: string, grepResults: Evidence['grepResults'], reads: Evidence['reads']): Evidence {
	return { claimId, grepResults, reads };
}

/**
 * The frozen ground-truth set. Each case pairs a real premise from the
 * streaming plans with the evidence a deterministic probe would have gathered,
 * and the severity a correct rubric must assign.
 */
export const CALIBRATION_FIXTURES: readonly CalibrationCase[] = [
	// --- HIGH: the defect makes the task target something nonexistent/wrong ---
	{
		claim: {
			id: 'build-step-producer', ref: 's2/t8', kind: 'external-contract',
			text: 'build-step is a long-running streaming operation whose progress frames are forwarded to the MCP client.',
			anchors: ['ProgressOperation'], probe: { greps: ['build\\.run', 'ProgressOperation'] },
		},
		evidence: ev('build-step-producer',
			[{ pattern: 'build\\.run', matches: [], truncated: false },
			 { pattern: 'ProgressOperation', matches: ["src/shared/types.ts:759:export type ProgressOperation = 'workflow.run' | 'analyze.run';"], truncated: false }],
			[]),
		expected: 'HIGH',
		rationale: 'build.run has no producer and is absent from the closed ProgressOperation union — wiring progress to build-step targets nothing.',
	},
	{
		claim: {
			id: 'phantom-stream-anchor', ref: 's1/t9', kind: 'citation',
			text: 'The workflow.run conformance test reuses the existing stream harness at workflow-rpc.test.ts:42.',
			anchors: ['src/daemon/__tests__/workflow-rpc.test.ts:42'], probe: { reads: ['src/daemon/__tests__/workflow-rpc.test.ts:42'] },
		},
		evidence: ev('phantom-stream-anchor', [],
			[{ anchor: 'src/daemon/__tests__/workflow-rpc.test.ts:42', found: true, line: "\tasync *stream(): AsyncIterable<string> { throw new Error('unused'); }" }]),
		expected: 'HIGH',
		rationale: 'The cited anchor exists but is an unused throwing stub, not a stream harness — a wrong-referent citation the task builds on.',
	},
	{
		claim: {
			id: 'progresstoken-envelope', ref: 's2/t6', kind: 'external-contract',
			text: 'The inbound MCP progressToken is read from the tool result envelope _meta field.',
			anchors: ['src/mcp/server.ts:419'], probe: { reads: ['src/mcp/server.ts:419'] },
		},
		evidence: ev('progresstoken-envelope', [],
			[{ anchor: 'src/mcp/server.ts:419', found: true, line: '\t\tasync (rawArgs, _extra) => handleWorkflowStep(rawArgs),' }]),
		expected: 'HIGH',
		rationale: 'The registration discards `_extra` (where the SDK carries progressToken); reading it from the result envelope means it is always absent.',
	},

	// --- MED: wrong/unverifiable but the prescribed change still holds ---
	{
		claim: {
			id: 'four-producers', ref: 's1/t1', kind: 'inventory',
			text: 'There are exactly four IpcStreamMessage producers.',
			anchors: [], probe: { greps: ['send: \\(msg: IpcStreamMessage\\)'] },
		},
		evidence: ev('four-producers',
			[{ pattern: 'send: \\(msg: IpcStreamMessage\\)', matches: [
				'src/daemon/analyze-rpc.ts:481', 'src/daemon/server.ts:19',
				'src/daemon/tools/types.ts:56', 'src/daemon/todos-rpc.ts:1146', 'src/daemon/workflow-rpc.ts:206',
			], truncated: false }], []),
		expected: 'MED',
		rationale: 'The count is off by one (a fifth producer exists), but it is workflow.run — already in the union — so the prescribed closed union is still correct.',
	},
	{
		claim: {
			id: 'fork-mirror', ref: 's1/t2', kind: 'cross-artifact',
			text: 'The IDE fork mirrors the ProgressEvent declarations byte-identically.',
			anchors: [], probe: { greps: ['ProgressEvent'] },
		},
		evidence: ev('fork-mirror', [{ pattern: 'ProgressEvent', matches: ['src/shared/types.ts:762:export type ProgressEvent = StageProgressEvent | TokenProgressEvent;'], truncated: false }], []),
		expected: 'MED',
		rationale: 'The fork is a separate repo not present here — the claim is unverifiable from this evidence, not demonstrably wrong.',
	},

	// --- LOW: the evidence confirms the premise ---
	{
		claim: {
			id: 'ipcstreamkind-members', ref: 's3/t4', kind: 'citation',
			text: "IpcStreamKind at types.ts:732 already contains 'progress' and 'delta'.",
			anchors: ['src/shared/types.ts:732'], probe: { reads: ['src/shared/types.ts:732'] },
		},
		evidence: ev('ipcstreamkind-members', [],
			[{ anchor: 'src/shared/types.ts:732', found: true, line: "export type IpcStreamKind = 'delta' | 'progress' | 'gate' | 'checkpoint' | 'done' | 'error' | 'qna.update' | 'liveStep' | 'todos' | 'handoff' | 'meta-task' | 'assertion-confirm' | 'analyze.result';" }]),
		expected: 'LOW',
		rationale: "The read confirms both 'progress' and 'delta' are present — the premise holds.",
	},
	{
		claim: {
			id: 'analyze-producer-site', ref: 's1/t4', kind: 'citation',
			text: "analyze.run's progress producer is the onEvent closure at analyze-rpc.ts:521.",
			anchors: ['src/daemon/analyze-rpc.ts:521'], probe: { reads: ['src/daemon/analyze-rpc.ts:521'] },
		},
		evidence: ev('analyze-producer-site', [],
			[{ anchor: 'src/daemon/analyze-rpc.ts:521', found: true, line: "\t\tsend({ id: 0, stream: 'progress', data: eventToProgressData(event) });" }]),
		expected: 'LOW',
		rationale: 'The read confirms the producer at the cited line — verified sound.',
	},
];

export interface CalibrationCaseResult {
	readonly claimId:   string;
	readonly expected:  Severity;
	readonly actuals:   readonly Severity[];
	readonly matchRate: number;   // fraction of rounds where actual === expected
}

export interface CalibrationReport {
	readonly rounds:        number;
	readonly cases:         number;
	readonly agreementRate: number;   // overall fraction of (case×round) matching expected
	/** Over-blocking: expected MED/LOW but judged HIGH. */
	readonly falseHighs:    number;
	/** Under-blocking: expected HIGH but judged below HIGH. */
	readonly missedHighs:   number;
	readonly perCase:       readonly CalibrationCaseResult[];
}

export interface RunCalibrationOpts {
	readonly rounds?:     number | undefined;
	readonly signal?:     AbortSignal | undefined;
	readonly onProgress?: ((msg: string) => void) | undefined;
}

/**
 * Run every fixture through `verifyClaim` `rounds` times (SERIAL — never
 * `Promise.all` a provider) and score the rubric against the frozen ground
 * truth. Returns overall agreement plus the two directional error rates the
 * "block on HIGH+MED" gate cares about: false-highs (over-block) and
 * missed-highs (under-block).
 */
export async function runCalibration(provider: LLMProvider, opts?: RunCalibrationOpts): Promise<CalibrationReport> {
	const rounds = Math.max(1, opts?.rounds ?? 1);
	const perCase: CalibrationCaseResult[] = [];
	let agreements = 0;
	let falseHighs = 0;
	let missedHighs = 0;

	for (const c of CALIBRATION_FIXTURES) {
		const actuals: Severity[] = [];
		for (let r = 0; r < rounds; r += 1) {
			if (opts?.signal?.aborted) throw new Error('runCalibration: aborted');
			opts?.onProgress?.(`verify ${c.claim.id} (round ${r + 1}/${rounds})`);
			const finding = await verifyClaim(c.claim, c.evidence, provider, opts?.signal);
			actuals.push(finding.severity);
			if (finding.severity === c.expected) agreements += 1;
			if (SEV_RANK[finding.severity] > SEV_RANK[c.expected] && finding.severity === 'HIGH') falseHighs += 1;
			if (c.expected === 'HIGH' && finding.severity !== 'HIGH') missedHighs += 1;
		}
		const matches = actuals.filter(s => s === c.expected).length;
		perCase.push({ claimId: c.claim.id, expected: c.expected, actuals, matchRate: matches / rounds });
	}

	const totalTrials = CALIBRATION_FIXTURES.length * rounds;
	return {
		rounds,
		cases: CALIBRATION_FIXTURES.length,
		agreementRate: totalTrials > 0 ? agreements / totalTrials : 0,
		falseHighs,
		missedHighs,
		perCase,
	};
}

/** Render a calibration report as a human-readable block. */
export function renderCalibrationReport(r: CalibrationReport): string {
	const lines = [
		`calibration: ${(r.agreementRate * 100).toFixed(0)}% agreement over ${r.cases} cases × ${r.rounds} round(s)`,
		`  false-highs (over-block): ${r.falseHighs}   missed-highs (under-block): ${r.missedHighs}`,
		'',
	];
	for (const c of r.perCase) {
		const flag = c.matchRate === 1 ? '✓' : c.matchRate === 0 ? '✗' : '~';
		lines.push(`  ${flag} ${c.claimId.padEnd(24)} expected ${c.expected.padEnd(4)} got ${c.actuals.join(',')}`);
	}
	return lines.join('\n');
}
