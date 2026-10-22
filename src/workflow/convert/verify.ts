/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Verification, run by the apply after the marker is written and by nothing else: the before-snapshot the planner computed from the
 * legacy stamps against the snapshot the real delivery reader builds from the converted repository. Each unit whose approval, revision
 * number, review or open feedback differs is reported with the reason; nothing is corrected and nothing is written. A content hash
 * is expected to differ (the converted content is hashed anew) and is not compared.
 *
 * Open feedback is compared for the records whose feedback the delivery shows (DEF, HLD, LLD, PLAN). A review is compared as the
 * delivery gate reports it: the recorded verdict, the effective verdict, whether it blocks and the counts.
 */

import { loadArtifactRecordSet } from '../delivery/load.js';
import { deriveGates } from '../delivery/gate.js';
import { buildWorkItemGraph } from '../delivery/graph.js';
import type { ArtifactRecord } from '../delivery/types.js';
import { rewriteString } from './rename.js';
import type { UnitView, VerifyReport, ViewDifference } from './types.js';

const FEEDBACK_KINDS: ReadonlySet<string> = new Set(['DEF', 'HLD', 'LLD', 'PLAN']);

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function reviewOf(gate: { readonly review: { readonly verdict: string; readonly effectiveVerdict: string; readonly blocking: boolean; readonly counts: unknown } | null } | undefined): unknown {
	const r = gate?.review;
	return r === null || r === undefined ? null : { verdict: r.verdict, effectiveVerdict: r.effectiveVerdict, blocking: r.blocking, counts: r.counts };
}

export function verifyConversion(repo: string, before: readonly UnitView[]): VerifyReport {
	const set = loadArtifactRecordSet(repo);
	const graph = buildWorkItemGraph(set);
	const gates = deriveGates(graph, set);
	const records = new Map<string, ArtifactRecord>(set.records.map(r => [r.artifactId, r]));
	const differences: ViewDifference[] = [];

	for (const unit of before) {
		const artifactId = rewriteString(unit.artifactId);
		const record = records.get(artifactId);
		const gate = gates.artifacts.get(artifactId);
		if (record === undefined || gate === undefined) {
			differences.push({ artifactId, field: 'missing', before: unit.approval, after: null, reason: 'the delivery reader finds no such record in the converted repository' });
			continue;
		}
		if (gate.approval.state !== unit.approval) {
			differences.push({ artifactId, field: 'approval', before: unit.approval, after: gate.approval.state, reason: `read as ${unit.approval} from the legacy stamps and as ${gate.approval.state} from the lifecycle` });
		}
		const revision = (record.meta['lifecycle'] as { revision?: { number?: unknown } } | undefined)?.revision?.number;
		if (unit.revision !== null && revision !== unit.revision) {
			differences.push({ artifactId, field: 'revision', before: unit.revision, after: revision ?? null, reason: `meta.revision was ${unit.revision} and the lifecycle revision is ${String(revision)}` });
		}
		const was = unit.review === null ? null : { verdict: unit.review.verdict, effectiveVerdict: unit.review.effectiveVerdict, blocking: unit.review.blocking, counts: unit.review.counts };
		const now = reviewOf(gate);
		if (!same(was, now)) {
			differences.push({ artifactId, field: 'review', before: was, after: now, reason: 'the review the delivery gate reports differs from the one the legacy stamps gave' });
		}
		if (FEEDBACK_KINDS.has(record.kind)) {
			const lines = record.feedback?.lines.length ?? 0;
			if (lines !== unit.openFeedback) {
				differences.push({ artifactId, field: 'openFeedback', before: unit.openFeedback, after: lines, reason: `${unit.openFeedback} feedback entries were stored in the body and ${lines} lines are in the feedback file` });
			}
		}
	}
	return { differences };
}
