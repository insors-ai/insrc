/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S003, artifact-companion-wiring) — the authored SequenceDefinition body
 * element + its deterministic validation/visualization. The sequence peer of the
 * ErDefinition / UxDefinition set.
 *
 * The SequenceDefinition is a behaviour sketch (the stakeholder-directed source of
 * truth): ordered `participants` (the actors) and ordered `messages` (the calls
 * between them, optionally `recurse`-marked or `note`-annotated), plus optional
 * `truncations` (a "depth truncated here" marker on a participant). The JSON
 * element is validated (a light structural + referential-integrity check) and
 * visualized (sequenceDefinitionToIr → docgen assembleShell, which already renders
 * a `call-sequence` DocumentIR as a mermaid sequenceDiagram); the companion is
 * DERIVED from it, never the reverse. Validation runs against the JSON element
 * ONLY — it never reads a rendered companion file (k2).
 *
 * Deterministic + provider-free. Mirrors ./er.ts.
 */

import type { DocumentIR, IrEdge, IrNode } from '../../../docgen/types.js';
import type { DimensionFinding } from '../../code-review/types.js';

// ---------------------------------------------------------------------------
// t1 — SequenceDefinition types
// ---------------------------------------------------------------------------

/** One participant (actor) in the sequence. */
export interface SequenceParticipant {
	readonly id:     string;
	readonly label?: string | undefined;
}

/** One ordered message (call) between two participants. */
export interface SequenceMessage {
	readonly from:  string;
	readonly to:    string;
	readonly label: string;
	/** 'recurse' marks a self/cycle repeat (rendered as a recursion note). */
	readonly kind?: 'call' | 'return' | 'recurse' | undefined;
	readonly note?: string | undefined;
}

/** A "depth truncated here" marker attached to a participant. */
export interface SequenceTruncation {
	readonly atParticipant: string;
	readonly note:          string;
}

/** The authored sequence (behaviour) — the source of truth for the sequence companion. */
export interface SequenceDefinition {
	readonly id?:           string | undefined;
	readonly participants:  readonly SequenceParticipant[];
	readonly messages:      readonly SequenceMessage[];
	readonly truncations?:  readonly SequenceTruncation[] | undefined;
}

/** Thrown by sequenceDefinitionToIr when a message endpoint (or a truncation's
 *  participant) names a participant absent from `participants` — a dangling
 *  reference (referential integrity), enforced as defense-in-depth after
 *  validateSequenceDefinition. Mirrors ErDefinitionError. */
export class SequenceDefinitionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SequenceDefinitionError';
	}
}

const DIMENSION = 'diagram' as const;

// ---------------------------------------------------------------------------
// t1 — validateSequenceDefinition (JSON element only; never the rendered doc)
// ---------------------------------------------------------------------------

/**
 * Validate the authored SequenceDefinition JSON element. Light structural +
 * referential-integrity check, deterministic and provider-free, operating on the
 * JSON element ONLY (never the rendered file):
 *
 *   1. Structural shape: `participants` and `messages` are arrays; each
 *      participant has a non-empty `id`; each message has non-empty `from`/`to`/
 *      `label`. Participant ids are unique.
 *   2. Referential integrity: every message `from`/`to` (and every truncation's
 *      `atParticipant`) resolves to a declared participant; a dangling endpoint is
 *      a HIGH breach.
 *
 * Returns an EMPTY array when sound. A HIGH 'breach' folds to `block` through the
 * un-forked verdict/enforce gate (mirrors validateErDefinition / validateUxDefinition).
 */
export function validateSequenceDefinition(seqDef: unknown): readonly DimensionFinding[] {
	const findings: DimensionFinding[] = [];
	if (typeof seqDef !== 'object' || seqDef === null) {
		return [breach('sequenceDefinition', 'sequenceDefinition is not an object')];
	}
	const def = seqDef as { participants?: unknown; messages?: unknown; truncations?: unknown };

	if (!Array.isArray(def.participants)) {
		findings.push(breach('sequenceDefinition:participants', 'participants is not an array'));
	}
	if (!Array.isArray(def.messages)) {
		findings.push(breach('sequenceDefinition:messages', 'messages is not an array'));
	}
	if (findings.length > 0) return findings;

	const participants = def.participants as unknown[];
	const messages = def.messages as unknown[];

	const ids = new Set<string>();
	participants.forEach((p, i) => {
		const id = (p as { id?: unknown }).id;
		if (typeof id !== 'string' || id.length === 0) {
			findings.push(breach(`sequenceDefinition:participants[${i}]`, `participant at index ${i} has no non-empty id`));
			return;
		}
		if (ids.has(id)) findings.push(breach(`sequenceDefinition:participants.${id}`, `participant id '${id}' is declared more than once`));
		ids.add(id);
	});

	messages.forEach((m, i) => {
		const msg = m as { from?: unknown; to?: unknown; label?: unknown };
		for (const field of ['from', 'to', 'label'] as const) {
			const v = msg[field];
			if (typeof v !== 'string' || v.length === 0) {
				findings.push(breach(`sequenceDefinition:messages[${i}]`, `message at index ${i} has no non-empty '${field}'`));
			}
		}
		for (const endpoint of ['from', 'to'] as const) {
			const v = msg[endpoint];
			if (typeof v === 'string' && v.length > 0 && !ids.has(v)) {
				findings.push(breach(
					`sequenceDefinition:messages[${i}].${endpoint}`,
					`message at index ${i} references '${endpoint}' participant '${v}', which is not declared in participants (dangling reference)`,
				));
			}
		}
	});

	if (Array.isArray(def.truncations)) {
		(def.truncations as unknown[]).forEach((t, i) => {
			const at = (t as { atParticipant?: unknown }).atParticipant;
			if (typeof at === 'string' && at.length > 0 && !ids.has(at)) {
				findings.push(breach(
					`sequenceDefinition:truncations[${i}].atParticipant`,
					`truncation at index ${i} references participant '${at}', which is not declared (dangling reference)`,
				));
			}
		});
	}

	return findings;
}

/** A HIGH 'breach' diagram finding. */
function breach(location: string, message: string): DimensionFinding {
	return { dimension: DIMENSION, severity: 'HIGH', location, message, confidence: 'breach' };
}

// ---------------------------------------------------------------------------
// t1 — sequenceDefinitionToIr (deterministic; feeds docgen assembleShell)
// ---------------------------------------------------------------------------

/** The docType stamped on the sequence IR. Consumed by assembleShell's mermaid
 *  emitter, which renders a `call-sequence` DocumentIR as a sequenceDiagram
 *  (one participant per 'call-frame' node, one message per edge, a recursion Note
 *  for a ':repeat'-suffixed edge id, a Note over the cited frame for a
 *  'truncation' node). */
export const SEQUENCE_DOC_TYPE = 'call-sequence';

/**
 * Transform a SequenceDefinition into a docgen DocumentIR: each participant → a
 * 'call-frame' IrNode; each message → an IrEdge (a 'recurse'-kind message's edge
 * id carries the ':repeat' suffix the sequenceDiagram emitter turns into a
 * recursion Note); each truncation → a 'truncation' IrNode whose citation.entityId
 * names the frame the Note attaches to. Pure + deterministic: participant + message
 * order is preserved verbatim (the ordered message list IS the call order), so the
 * same seqDef always yields byte-identical IR (no graph, no provider).
 *
 * @throws SequenceDefinitionError when a message endpoint (or a truncation's
 *   participant) names a participant absent from `participants` (referential
 *   integrity — should have been caught by validateSequenceDefinition; enforced
 *   here as defense-in-depth, mirroring erDefinitionToIr).
 */
export function sequenceDefinitionToIr(seqDef: SequenceDefinition): DocumentIR {
	const ids = new Set(seqDef.participants.map(p => p.id));
	const nodes: IrNode[] = [];
	const edges: IrEdge[] = [];

	for (const p of seqDef.participants) {
		nodes.push({
			id:    p.id,
			label: p.label !== undefined && p.label.length > 0 ? p.label : p.id,
			kind:  'call-frame',
		});
	}

	seqDef.messages.forEach((m, i) => {
		if (!ids.has(m.from)) {
			throw new SequenceDefinitionError(`sequenceDefinitionToIr: message ${i} 'from' names undeclared participant '${m.from}'`);
		}
		if (!ids.has(m.to)) {
			throw new SequenceDefinitionError(`sequenceDefinitionToIr: message ${i} 'to' names undeclared participant '${m.to}'`);
		}
		const suffix = m.kind === 'recurse' ? ':repeat' : '';
		edges.push({
			id:   `${m.from}->${m.to}#${i}${suffix}`,
			from: m.from,
			to:   m.to,
			kind: 'calls',
		});
	});

	for (const t of seqDef.truncations ?? []) {
		if (!ids.has(t.atParticipant)) {
			throw new SequenceDefinitionError(`sequenceDefinitionToIr: truncation names undeclared participant '${t.atParticipant}'`);
		}
		nodes.push({
			id:       `truncation@${t.atParticipant}`,
			label:    t.note,
			kind:     'truncation',
			citation: { entityId: t.atParticipant },
		});
	}

	return {
		docType:             SEQUENCE_DOC_TYPE,
		scopeDescription:    seqDef.id !== undefined && seqDef.id.length > 0 ? `Sequence: ${seqDef.id}` : 'Sequence diagram',
		derived:             { nodes, edges },
		narrated:            { sections: [] },
		generatedAtRevision: 'authored-sequence',
	};
}
