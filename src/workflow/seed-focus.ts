/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Spec-seeded stage focus (Epic `frame-epic-new-pre-workflow-brainstorm`, S008).
 *
 * The read-side seam by which `define` (S008) and standalone `design.story`
 * (S009) accept an APPROVED brainstorm SpecArtifact as their focus instead of a
 * plain string. Both stage entry points (the controller-driven
 * `insrc_workflow_step` start handler and the daemon-driven `workflow.run`
 * runner) call `resolveStageFocus` just before building the WorkflowIntent:
 *
 *   - when the start params carry a `specHash`, the approved spec is resolved
 *     (via the sc4 reader `requireApprovedSpec`, S007) and its body is composed
 *     into a deterministic framing focus string, so `scope.assess` proceeds FROM
 *     the settled intent/scope/non-goals/decisions rather than re-deriving them
 *     from one line (ac1) and does not re-ask or contradict a recorded decision
 *     (ac2); the source specHash is returned so `finalizeDefine` can stamp
 *     `meta.seededFromSpec` (ac3);
 *   - otherwise the plain focus is returned verbatim — a pure passthrough, so
 *     the plain-focus path is byte-identical (ac4, c30).
 *
 * The helper is stage-neutral (k1): the SpecArtifact is consumed the same way by
 * both seeding stages, not specialised to either. Resolution is a read-only,
 * in-process gate read (like `preflightUpstreamQuestions`); an unapproved or
 * missing spec throws the sc4 error (`SpecNotApprovedError` /
 * `SpecArtifactNotFoundError`), aborting the seeded start so no stage ever frames
 * from an unapproved spec (k12).
 */

import { requireApprovedSpec } from './gates.js';
import type { SpecArtifact } from './artifacts/spec.js';

/** The result of resolving a stage's focus: the (possibly composed) focus text
 *  plus, when seeded, the source spec's identity for provenance stamping. */
export interface StageFocusResult {
	readonly focus: string;
	/** The 16-char specHash the focus was seeded from; omitted on the plain path. */
	readonly seededFromSpec?: string;
}

/** Render an approved SpecArtifact's body into a deterministic framing focus
 *  string. States the intent, scope boundary, explicit non-goals, and each
 *  resolved decision (chosen + ruled-out alternatives + reason), so a stage that
 *  reads `intent.focus` frames from the settled spec. Pure + deterministic: the
 *  same spec always yields the same string. */
export function composeSpecFocus(spec: SpecArtifact): string {
	const b = spec.body;
	const lines: string[] = [];
	lines.push('This work is framed by an approved spec — proceed from the settled framing below; do NOT re-derive or re-ask what it already records.');
	lines.push('');
	lines.push(`Intent: ${b.intent}`);
	lines.push(`Scope boundary: ${b.scopeBoundary}`);
	if (b.nonGoals.length > 0) {
		lines.push('Non-goals (explicit exclusions — do not reintroduce):');
		for (const ng of b.nonGoals) lines.push(`- ${ng}`);
	}
	if (b.decisions.length > 0) {
		lines.push('Decisions already settled (do not re-ask):');
		for (const d of b.decisions) {
			const ruled = d.ruledOut.length > 0 ? ` (ruled out: ${d.ruledOut.join('; ')})` : '';
			lines.push(`- ${d.chosen}${ruled} — ${d.reason}`);
		}
	}
	return lines.join('\n');
}

/** Resolve a stage's focus, seeding it from an approved spec when the start
 *  params carry a `specHash`. Read-only. Throws the sc4 error when the named
 *  spec is unapproved or missing (never frames from an unapproved spec, k12). */
export function resolveStageFocus(
	repoPath: string,
	focus:    string,
	params:   Record<string, unknown>,
): StageFocusResult {
	const raw = params['specHash'];
	if (typeof raw !== 'string' || raw.length === 0) {
		return { focus };   // plain-focus passthrough — byte-identical (ac4)
	}
	const spec = requireApprovedSpec(repoPath, raw);   // refuses unapproved/missing
	return { focus: composeSpecFocus(spec), seededFromSpec: raw };
}
