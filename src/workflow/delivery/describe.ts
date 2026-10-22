/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * What each work item is about (ISSUE-7224d0d4): the descriptive values its own records state, read beside the
 * work-item graph without changing it. An epic's problem and summary come from its head DEF (the first DEF of its
 * evidence by artifactId, the one the graph chose); a story's purpose and size from that DEF's entry with the
 * story's ordinal, else its purpose from an extension's added story; an issue's reproduction, root cause and fix
 * intent from its ISSUE record. A value is recorded only when it is a non-empty string (a size only when it is one
 * of S, M, L, XL) and is published exactly as stored, with the record it came from; nothing is generated. The
 * feedback is the entries recorded on the item's own design records (an epic's DEF and HLD, a story's LLD and PLAN),
 * never a parent's or child's; an entry that is not well formed is left out and named in a notice. Pure.
 */

import type { Feedback } from '../artifact-core/types.js';
import { makeNotice } from './notice.js';
import { asObject, byText, storyOrdinalOf } from './read.js';
import type {
	ArtifactRecord, DeliveryArtifactKind, DeliveryFeedback, DeliveryItemDescription, DeliveryItemKind, DeliveryNotice, DeliveryRecorded, DeliverySize,
	WorkItemGraph, WorkItemNode,
} from './types.js';

const SIZES: ReadonlySet<string> = new Set<DeliverySize>(['S', 'M', 'L', 'XL']);
const NOT_RECORDED = { state: 'not-recorded' } as const;

/** A non-empty string from a record, exactly as stored; not recorded otherwise. */
function recordedText(value: unknown, record: ArtifactRecord | null): DeliveryRecorded<string> {
	return record !== null && typeof value === 'string' && value.trim().length > 0
		? { state: 'recorded', value, artifactId: record.artifactId }
		: NOT_RECORDED;
}

/** The first record of this kind among an item's evidence, which is sorted by artifactId. */
function firstOfKind(node: WorkItemNode | undefined, byId: ReadonlyMap<string, ArtifactRecord>, kind: DeliveryArtifactKind): ArtifactRecord | null {
	for (const id of node?.evidenceArtifactIds ?? []) {
		const record = byId.get(id);
		if (record?.kind === kind) return record;
	}
	return null;
}

/** The DEF story entry with the story's ordinal, matched as the graph matches it. */
function defStoryEntry(def: ArtifactRecord | null, node: WorkItemNode): Readonly<Record<string, unknown>> | null {
	if (def === null) return null;
	const ordinals = new Set(node.sourceIds.map(storyOrdinalOf).filter((o): o is number => o !== null));
	const stories = asObject(def.body)?.['stories'];
	for (const entry of Array.isArray(stories) ? stories : []) {
		const e = asObject(entry);
		const id = e?.['id'];
		const ordinal = typeof id === 'string' ? storyOrdinalOf(id) : null;
		if (e !== null && ordinal !== null && ordinals.has(ordinal)) return e;
	}
	return null;
}

/** The item's description, by its kind. */
export function describeItem(node: WorkItemNode, graph: WorkItemGraph, byId: ReadonlyMap<string, ArtifactRecord>): DeliveryItemDescription {
	switch (node.kind) {
		case 'epic': {
			const def = firstOfKind(node, byId, 'DEF');
			const body = asObject(def?.body);
			return { kind: 'epic', problem: recordedText(body?.['problem'], def), summary: recordedText(asObject(body?.['summary'])?.['prose'], def) };
		}
		case 'story': {
			const parent = node.parentId === null ? undefined : graph.items.get(node.parentId);
			const def = parent?.kind === 'epic' ? firstOfKind(parent, byId, 'DEF') : null;
			const entry = defStoryEntry(def, node);
			const size = entry?.['sizeEstimate'];
			let purpose = recordedText(entry?.['userValue'], def);
			if (purpose.state === 'not-recorded') {
				const ext = firstOfKind(node, byId, 'EXT');
				purpose = recordedText(asObject(asObject(ext?.body)?.['addedStory'])?.['userValue'], ext);
			}
			return {
				kind: 'story', purpose,
				size: def !== null && typeof size === 'string' && SIZES.has(size) ? { state: 'recorded', value: size as DeliverySize, artifactId: def.artifactId } : NOT_RECORDED,
			};
		}
		case 'issue': {
			const issue = firstOfKind(node, byId, 'ISSUE');
			const body = asObject(issue?.body);
			return {
				kind: 'issue',
				reproduction: recordedText(body?.['reproduction'], issue),
				rootCause: recordedText(body?.['rootCause'], issue),
				fixIntent: recordedText(body?.['fixIntent'], issue),
			};
		}
		case 'task':
			return { kind: 'task' };
	}
}

/** The design records whose feedback is an item's own, by the item's kind. */
const FEEDBACK_KINDS: Readonly<Record<DeliveryItemKind, ReadonlySet<DeliveryArtifactKind>>> = {
	epic:  new Set(['DEF', 'HLD']),
	story: new Set(['LLD', 'PLAN']),
	issue: new Set(),
	task:  new Set(),
};
/** One feedback line as the delivery snapshot shows it. The author is the name the line records, else the actor's id; a revision request shows as feedback. */
function deliveryFeedback(artifactId: string, f: Feedback): DeliveryFeedback {
	const name = f.actor.properties['name'];
	const lines = f.anchor?.lines;
	return {
		artifactId, id: f.id, author: typeof name === 'string' && name.length > 0 ? name : f.actor.id, timestamp: f.timestamp,
		kind: f.kind === 'revision-request' ? 'feedback' : f.kind,
		comment: f.text,
		target: {
			file: f.anchor?.section ?? '',
			version: f.revision !== undefined ? String(f.revision) : null,
			segment: lines !== undefined ? { startLine: lines[0], endLine: lines[1] } : null,
		},
	};
}

/**
 * The feedback recorded on the item's own design records, in timestamp, artifactId, id order, and an
 * incomplete-evidence notice for each record whose feedback holds entries that are not well formed.
 */
export function feedbackOf(node: WorkItemNode, byId: ReadonlyMap<string, ArtifactRecord>): { readonly feedback: readonly DeliveryFeedback[]; readonly notices: readonly DeliveryNotice[] } {
	const kinds = FEEDBACK_KINDS[node.kind];
	const feedback: DeliveryFeedback[] = [];
	const notices: DeliveryNotice[] = [];
	for (const artifactId of node.evidenceArtifactIds) {
		const record = byId.get(artifactId);
		if (record === undefined || !kinds.has(record.kind)) continue;
		const facts = record.feedback;
		if (facts === undefined) continue;
		for (const line of facts.lines) feedback.push(deliveryFeedback(artifactId, line));
		if (facts.dropped > 0) {
			notices.push(makeNotice('incomplete-evidence',
				`${artifactId} has ${facts.dropped} feedback ${facts.dropped === 1 ? 'entry' : 'entries'} that could not be read; the readable feedback is shown`,
				{ itemIds: [node.id], artifactIds: [artifactId] }));
		}
	}
	feedback.sort((a, b) => byText(a.timestamp, b.timestamp) || byText(a.artifactId, b.artifactId) || byText(a.id, b.id));
	return { feedback, notices };
}
