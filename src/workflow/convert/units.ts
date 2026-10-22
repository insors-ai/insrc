/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * EPIC and STORY heads. One EPIC head per Define and one STORY head per Story the Define lists, created as drafts with the
 * pass-through codecs (the parent chain is Epic, Story, LLD). The Epic's tracker binding and attachments move from the Define to
 * the EPIC head and a Story's from its LLD to the STORY head, with `bindArtifact`. A move copies first and strips the source
 * second, so a crash between the two leaves both and the rerun finishes; a repeat finds nothing to move.
 *
 * A unit's status after the move is the roll-up of its Tasks, which exist only once the Task heads are created; the applier settles
 * it after that step. A Story the Define lists but nobody designed gets a head with no binding, and a Define with no Story
 * binding gets a head with none.
 */

import { existsSync } from 'node:fs';

import { ArtifactIds } from '../artifact-ids.js';
import { emptyLifecycle } from '../artifact-core/decode.js';
import type { Attachment, TrackerBinding } from '../artifact-core/types.js';
import { artifactJsonPath, writeArtifact } from '../storage.js';
import { bindArtifact, isObject, readHead, recordPosted, setPendingLink } from '../tracker/binding.js';
import type { Head } from '../tracker/binding.js';
import type { PlanRule, RulePlan } from './plan.js';
import { readRawHeads } from './raw-heads.js';
import { ConversionIncomplete } from './types.js';
import type { ConversionChange, ConversionDeps, RawHead } from './types.js';

const text = (v: unknown): string | undefined => typeof v === 'string' && v.length > 0 ? v : undefined;
const storyOf = (id: string): string => `s${Number(/\d+/.exec(id)?.[0] ?? '0')}`;

/** A Story a Define lists: its lower-case id and title. */
export interface ListedStory { readonly id: string; readonly title: string }
export interface Epic { readonly hash: string; readonly stories: readonly ListedStory[] }

export function epicsOf(heads: readonly RawHead[]): Epic[] {
	const epics: Epic[] = [];
	for (const head of heads) {
		const m = /^DEF-([0-9a-f]{16})$/.exec(head.artifactId);
		const body = isObject(head.json) ? (head.json as Record<string, unknown>)['body'] : undefined;
		if (m === null || !isObject(body)) continue;
		const listed = Array.isArray(body['stories']) ? body['stories'] : [];
		const stories = listed.flatMap(s => isObject(s) && text(s['id']) !== undefined ? [{ id: storyOf(s['id'] as string), title: text(s['title']) ?? '' }] : []);
		epics.push({ hash: m[1]!, stories });
	}
	return epics.sort((a, b) => (a.hash < b.hash ? -1 : 1));
}

/** The id of the LLD of a Story as stored, or undefined: either id form (S001 before the rename, s1 after) matches. */
export function lldOf(heads: readonly RawHead[], hash: string, story: string): RawHead | undefined {
	return heads.find(h => { const m = /^LLD-([0-9a-f]{16})-([sS]\d+)$/.exec(h.artifactId); return m !== null && m[1] === hash && storyOf(m[2]!) === story; });
}

const envelopeOf = (head: RawHead): Record<string, unknown> => {
	const meta = isObject(head.json) ? (head.json as Record<string, unknown>)['meta'] : undefined;
	const envelope = isObject(meta) ? meta['envelope'] : undefined;
	return isObject(envelope) ? envelope : {};
};
const holdsBinding = (head: RawHead | undefined): boolean => {
	if (head === undefined) return false;
	const e = envelopeOf(head);
	return e['binding'] !== undefined || (Array.isArray(e['attachments']) && e['attachments'].length > 0);
};

export const epicId = (hash: string): string => ArtifactIds.make({ kind: 'EPIC', epicHash: hash });
export const storyId = (hash: string, story: string): string => ArtifactIds.make({ kind: 'STORY', epicHash: hash, story });

/** The plan rule: which EPIC and STORY heads are missing and which bindings would move. */
export const unitsRule: PlanRule = (ctx): RulePlan => {
	const have = new Set(ctx.heads.map(h => h.artifactId));
	const changes: ConversionChange[] = [];
	for (const epic of epicsOf(ctx.heads)) {
		const def = ctx.heads.find(h => h.artifactId === `DEF-${epic.hash}`);
		if (!have.has(epicId(epic.hash))) changes.push({ rule: 'create-epic', artifactId: epicId(epic.hash), detail: `from DEF-${epic.hash}, ${epic.stories.length} stories` });
		if (holdsBinding(def)) changes.push({ rule: 'move-binding', artifactId: `DEF-${epic.hash}`, detail: `to ${epicId(epic.hash)}` });
		for (const story of epic.stories) {
			const id = storyId(epic.hash, story.id);
			if (!have.has(id)) changes.push({ rule: 'create-story', artifactId: id, detail: `from DEF-${epic.hash}` });
			const lld = lldOf(ctx.heads, epic.hash, story.id);
			if (holdsBinding(lld)) changes.push({ rule: 'move-binding', artifactId: lld!.artifactId, detail: `to ${id}` });
		}
	}
	return { changes };
};

export interface UnitsResult {
	/** The heads created, in creation order. */
	readonly created: readonly string[];
	/** The bindings and attachment lists moved: source and target. */
	readonly moved:   readonly { readonly from: string; readonly to: string }[];
}

/** Patch the envelope of an existing head with a meta-only write, so no revision, hash or log entry moves. */
function patchEnvelope(repo: string, id: string, change: (envelope: Record<string, unknown>) => Record<string, unknown>): void {
	const read = readHead(repo, id);
	if (read === undefined) throw new ConversionIncomplete(`${id} has no head to patch`, [{ artifactId: id, reason: 'no head' }]);
	const envelope = isObject(read.head.meta['envelope']) ? read.head.meta['envelope'] : {};
	const next: Head = { ...read.head, meta: { ...read.head.meta, envelope: change({ ...envelope }) } };
	writeArtifact(read.path, next, 'meta-only');
}

/** Move the binding and attachments of `from` to `to`. Answers whether anything moved. */
function moveBinding(repo: string, from: string, to: string): boolean {
	const source = readHead(repo, from);
	if (source === undefined) return false;
	const envelope = isObject(source.head.meta['envelope']) ? source.head.meta['envelope'] : {};
	const binding = envelope['binding'] as TrackerBinding | undefined;
	const attachments = (Array.isArray(envelope['attachments']) ? envelope['attachments'] : []) as Attachment[];
	if (binding === undefined && attachments.length === 0) return false;

	if (binding !== undefined) {
		const bound = bindArtifact(repo, to, binding.reference.entityId);
		if (!bound.ok) throw new ConversionIncomplete(`the binding of ${from} could not move to ${to}: ${bound.reason}`, [{ artifactId: from, reason: bound.reason }]);
		for (const p of binding.posted) recordPosted(repo, to, p.kind, (p as { externalId?: string }).externalId, () => p.at);
		if (binding.pendingLink !== undefined && !setPendingLink(repo, to, binding.pendingLink)) {
			throw new ConversionIncomplete(`the pending link of ${from} could not move to ${to}`, [{ artifactId: from, reason: 'pending link' }]);
		}
	}
	if (attachments.length > 0) {
		patchEnvelope(repo, to, env => {
			const have = Array.isArray(env['attachments']) ? env['attachments'] as Attachment[] : [];
			const fresh = attachments.filter(a => !have.some(h => JSON.stringify(h) === JSON.stringify(a)));
			return fresh.length === 0 ? env : { ...env, attachments: [...have, ...fresh] };
		});
	}
	patchEnvelope(repo, from, env => { const { binding: _b, attachments: _a, ...rest } = env; return rest; });
	return true;
}

/** Create the EPIC and STORY heads, point each LLD at its STORY, and move the bindings. Safe to run again. */
export async function applyUnits(repo: string, deps: ConversionDeps): Promise<UnitsResult> {
	const created: string[] = [];
	const moved: { from: string; to: string }[] = [];
	const ensure = async (id: string, description: string, parent?: string): Promise<void> => {
		if (existsSync(artifactJsonPath(repo, id))) return;
		await deps.store.write({
			id, description, references: [], attachments: [], lifecycle: emptyLifecycle(0), payload: { body: {}, citations: [] },
			...(parent !== undefined ? { parent: { entityId: parent, type: ArtifactIds.parse(parent)?.kind ?? 'EPIC', relation: 'derived-from' } } : {}),
		}, deps.actor, { operation: 'create' });
		created.push(id);
	};
	const heads = readRawHeads(repo).heads;
	for (const epic of epicsOf(heads)) {
		const eid = epicId(epic.hash);
		await ensure(eid, '');
		if (moveBinding(repo, `DEF-${epic.hash}`, eid)) moved.push({ from: `DEF-${epic.hash}`, to: eid });
		for (const story of epic.stories) {
			const sid = storyId(epic.hash, story.id);
			await ensure(sid, story.title, eid);
			const lld = lldOf(heads, epic.hash, story.id);
			if (lld === undefined) continue;
			if (moveBinding(repo, lld.artifactId, sid)) moved.push({ from: lld.artifactId, to: sid });
			patchEnvelope(repo, lld.artifactId, env => ({ ...env, parent: { entityId: sid, type: 'STORY', relation: 'derived-from' } }));
		}
	}
	return { created, moved };
}
