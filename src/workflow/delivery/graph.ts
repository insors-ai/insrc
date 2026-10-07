/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Delivery read model — work-item graph (E1 / S001, HLD-2ff0dfda sc2).
 *
 * A pure function of the ArtifactRecordSet: every epic, story and issue once,
 * under the framework's canonical identity, with membership, evidence and the
 * identity notices. Ids are minted exactly as the folder writers mint them
 * (buildRecordFolderArgs' anchor order, safeCanonical over the WorkflowId
 * minters), so a board id always equals the work item's folder segment. A
 * mint that cannot succeed falls back to the 'H<hash>' or ':R(<raw>)' form
 * with a notice; nothing here throws for a malformed record.
 */

import { epicWorkflowId, safeCanonical, storyIdToOrdinal, storyWorkflowId } from '../id.js';
import { makeNotice, sortNotices } from './notice.js';
import type { ArtifactRecord, ArtifactRecordSet, DeliveryNotice, WorkItemGraph, WorkItemNode } from './types.js';

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/** The '<hash>|<key>' group a record belongs to, or null when it has none. */
function groupKeyOf(r: ArtifactRecord): string | null {
	// A SPEC attaches by the seededFromSpec link, not by its own hash.
	if (r.kind === 'SPEC' || r.workItemHash === null) return null;
	// A pending or rejected extension adds no story; it is its epic's evidence.
	if (r.kind === 'EXT' && r.approval.state !== 'approved') return `${r.workItemHash}|`;
	if (r.storyIdRaw === null) return `${r.workItemHash}|`;
	if (r.storyOrdinal !== null) return `${r.workItemHash}|${r.storyOrdinal}`;
	return `${r.workItemHash}|R(${r.storyIdRaw})`;
}

/**
 * Records keyed by '<workItemHash>|<key>': the story ordinal, 'R(<raw>)' for an
 * unparseable story id, or empty for epic-level records. Keys and each list are
 * sorted; records with no hash, and SPECs, are omitted.
 */
export function groupRecordsByWorkItem(recordSet: ArtifactRecordSet): ReadonlyMap<string, readonly ArtifactRecord[]> {
	const groups = new Map<string, ArtifactRecord[]>();
	for (const r of recordSet.records) {
		const key = groupKeyOf(r);
		if (key === null) continue;
		const list = groups.get(key);
		if (list === undefined) groups.set(key, [r]);
		else list.push(r);
	}
	const sorted = new Map<string, readonly ArtifactRecord[]>();
	for (const key of [...groups.keys()].sort()) {
		sorted.set(key, [...(groups.get(key) ?? [])].sort((a, b) => a.artifactId.localeCompare(b.artifactId)));
	}
	return sorted;
}

function splitKey(key: string): { readonly hash: string; readonly storyKey: string } {
	const bar = key.lastIndexOf('|');
	return { hash: key.slice(0, bar), storyKey: key.slice(bar + 1) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string | null {
	return typeof v === 'string' && v.length > 0 ? v : null;
}

function obj(v: unknown): Readonly<Record<string, unknown>> {
	return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

function pad(n: number): string {
	return String(n).padStart(3, '0');
}

function ordinalOf(storyId: string): number | null {
	try {
		return storyIdToOrdinal(storyId);
	} catch {
		return null;
	}
}

function earliestCreatedAt(records: readonly ArtifactRecord[]): string | null {
	let best: string | null = null;
	for (const r of records) {
		if (r.createdAt !== null && (best === null || r.createdAt < best)) best = r.createdAt;
	}
	return best;
}

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort();
}

/** A story named by an epic's records: by DEF entry, approved EXT or its own group. */
interface StorySeed {
	readonly storyKey: string;
	sourceIds: string[];
	title: string | null;
}

/** Mutable node while the graph is assembled; frozen into WorkItemNode at the end. */
interface Draft {
	id: string;
	kind: WorkItemNode['kind'];
	title: string | null;
	workItemHash: string | null;
	standalone: boolean;
	sourceIds: string[];
	parentId: string | null;
	childIds: string[];
	evidenceArtifactIds: string[];
}

function freeze(d: Draft): WorkItemNode {
	return {
		id:                  d.id,
		kind:                d.kind,
		title:               d.title,
		workItemHash:        d.workItemHash,
		standalone:          d.standalone,
		sourceIds:           sortedUnique(d.sourceIds),
		parentId:            d.parentId,
		childIds:            sortedUnique(d.childIds),
		evidenceArtifactIds: sortedUnique(d.evidenceArtifactIds),
		plannedTaskIds:      [],
		correctsRef:         null,
		seededFromSpecId:    null,
	};
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/** Build the work-item graph from one record set. Pure and order-stable; never throws. */
export function buildWorkItemGraph(recordSet: ArtifactRecordSet): WorkItemGraph {
	const groups = groupRecordsByWorkItem(recordSet);
	const notices: DeliveryNotice[] = [];
	const drafts = new Map<string, Draft>();

	// Index groups by hash: the epic-level records and each story key.
	const byHash = new Map<string, { epicLevel: readonly ArtifactRecord[]; storyKeys: string[] }>();
	for (const [key, records] of groups) {
		const { hash, storyKey } = splitKey(key);
		const entry = byHash.get(hash) ?? { epicLevel: [], storyKeys: [] };
		if (storyKey === '') entry.epicLevel = records;
		else entry.storyKeys.push(storyKey);
		byHash.set(hash, entry);
	}

	for (const hash of [...byHash.keys()].sort()) {
		const { epicLevel, storyKeys } = byHash.get(hash) ?? { epicLevel: [], storyKeys: [] };
		const def = epicLevel.find(r => r.kind === 'DEF') ?? null;
		const issue = epicLevel.find(r => r.kind === 'ISSUE') ?? null;
		const head = def ?? issue;

		// --- the definition head: an epic (DEF) or an issue (ISSUE) node -------
		let headDraft: Draft | null = null;
		if (head !== null) {
			const minted = head.createdAt === null ? undefined : safeCanonical(() => epicWorkflowId(hash, head.createdAt ?? ''));
			const id = minted ?? `H${hash}`;
			if (minted === undefined) {
				notices.push(makeNotice('identity-anchor-missing',
					`${head.artifactId} has no usable createdAt or hash to mint its work-item id; using ${id}`,
					{ itemIds: [id], artifactIds: [head.artifactId] }));
			}
			headDraft = {
				id,
				kind:                head.kind === 'DEF' ? 'epic' : 'issue',
				title:               head.kind === 'DEF' ? str(head.meta['epicSlug']) : str(obj(head.body)['title']),
				workItemHash:        hash,
				standalone:          head.meta['standalone'] === true,
				sourceIds:           [],
				parentId:            null,
				childIds:            [],
				evidenceArtifactIds: epicLevel.map(r => r.artifactId),
			};
			drafts.set(id, headDraft);
			if (def !== null && issue !== null) {
				notices.push(makeNotice('identity-ambiguous',
					`work-item hash ${hash} has both a Define and an issue record; the Define is used as the work item`,
					{ itemIds: [id], artifactIds: [def.artifactId, issue.artifactId] }));
			}
		} else if (epicLevel.length > 0) {
			notices.push(makeNotice('unresolved-parent',
				`records under work-item hash ${hash} name a work item with no Define or issue record in the store`,
				{ artifactIds: epicLevel.map(r => r.artifactId) }));
		}

		// --- the stories this hash names ----------------------------------------
		const seeds = new Map<string, StorySeed>();
		const seed = (storyKey: string, sourceId: string | null, title: string | null): void => {
			const s = seeds.get(storyKey) ?? { storyKey, sourceIds: [], title: null };
			if (sourceId !== null) s.sourceIds.push(sourceId);
			if (s.title === null && title !== null) s.title = title;
			seeds.set(storyKey, s);
		};
		if (def !== null) {
			const stories = obj(def.body)['stories'];
			for (const entry of Array.isArray(stories) ? stories : []) {
				const id = str(obj(entry)['id']);
				if (id === null) continue;
				const ord = ordinalOf(id);
				seed(ord === null ? `R(${id})` : String(ord), id, str(obj(entry)['title']));
			}
		}
		for (const storyKey of storyKeys) {
			for (const r of groups.get(`${hash}|${storyKey}`) ?? []) {
				const added = r.kind === 'EXT' ? obj(obj(r.body)['addedStory']) : {};
				seed(storyKey, r.storyIdRaw, str(added['title']));
			}
		}

		const lldAnchorOf = (lld: ArtifactRecord | null): string | null => lld === null ? null : lld.epicCreatedAt ?? lld.createdAt;
		const storyDrafts: Draft[] = [];
		const rawStories: { draft: Draft; storyKey: string }[] = [];
		for (const storyKey of [...seeds.keys()].sort()) {
			const s = seeds.get(storyKey);
			if (s === undefined) continue;
			const records = groups.get(`${hash}|${storyKey}`) ?? [];
			const lld = records.find(r => r.kind === 'LLD') ?? null;
			const builds = records.filter(r => r.kind === 'BUILD');

			// Placement follows inheritedStoryStandalone: the head, else the LLD, and the
			// BUILD's own flag only on the trivial route (no head and no LLD), because a
			// BUILD written beside a head or LLD can carry a wrong flag.
			const standalone = head !== null ? head.meta['standalone'] === true
				: lld !== null ? lld.meta['standalone'] === true
				: builds.some(b => b.meta['standalone'] === true);

			// Anchor follows buildRecordFolderArgs: an epic story is dated by its head; a
			// standalone story by its LLD, else its head, else its earliest BUILD.
			const anchor = standalone
				? lldAnchorOf(lld) ?? head?.createdAt ?? earliestCreatedAt(builds) ?? earliestCreatedAt(records)
				: head?.createdAt ?? lldAnchorOf(lld) ?? earliestCreatedAt(builds) ?? earliestCreatedAt(records);

			let id: string;
			const isRaw = storyKey.startsWith('R(');
			if (isRaw) {
				const base = headDraft?.id
					?? (anchor === null ? undefined : safeCanonical(() => epicWorkflowId(hash, anchor)))
					?? `H${hash}`;
				id = `${base}:${storyKey}`;
			} else {
				const ordinal = Number(storyKey);
				const minted = anchor === null ? undefined : safeCanonical(() => storyWorkflowId(hash, anchor, `s${ordinal}`));
				id = minted ?? `H${hash}:S${pad(ordinal)}`;
				if (minted === undefined) {
					notices.push(makeNotice('identity-anchor-missing',
						`story ${storyKey} of work item ${hash} has no usable anchor date or hash to mint its id; using ${id}`,
						{ itemIds: [id], artifactIds: records.map(r => r.artifactId) }));
				}
			}

			const label = str(head?.meta['epicSlug']) ?? str(lld?.meta['epicSlug']);
			const draft: Draft = {
				id,
				kind:                'story',
				title:               s.title ?? (standalone ? label : null),
				workItemHash:        hash,
				standalone,
				sourceIds:           s.sourceIds,
				parentId:            def !== null && headDraft !== null ? headDraft.id : null,
				childIds:            [],
				evidenceArtifactIds: records.map(r => r.artifactId),
			};
			drafts.set(id, draft);
			storyDrafts.push(draft);
			if (isRaw) rawStories.push({ draft, storyKey });
			if (head === null && !standalone) {
				notices.push(makeNotice('unresolved-parent',
					`story ${id} belongs to work item ${hash}, which has no Define or issue record in the store`,
					{ itemIds: [id], artifactIds: records.map(r => r.artifactId) }));
			}
		}

		if (def !== null && headDraft !== null) {
			headDraft.childIds.push(...storyDrafts.map(d => d.id));
		}
		for (const { draft, storyKey } of rawStories) {
			const siblings = storyDrafts.filter(d => d !== draft).map(d => d.id);
			notices.push(makeNotice('identity-ambiguous',
				`story id '${storyKey.slice(2, -1)}' under work item ${hash} is not an s<n> id, so it cannot be matched to the work item's other stories`,
				{ itemIds: [draft.id, ...siblings], artifactIds: draft.evidenceArtifactIds }));
		}
	}

	const items = new Map<string, WorkItemNode>();
	for (const id of [...drafts.keys()].sort()) {
		const d = drafts.get(id);
		if (d !== undefined) items.set(id, freeze(d));
	}
	const rootIds = [...items.values()].filter(n => n.parentId === null).map(n => n.id).sort();
	return { items, rootIds, notices: sortNotices(notices) };
}
