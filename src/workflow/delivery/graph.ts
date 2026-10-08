/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Delivery read model — work-item graph (E1 / S001, HLD-2ff0dfda sc2).
 *
 * A pure function of the ArtifactRecordSet: every epic, story, task and issue
 * once, under the framework's canonical identity, with membership, evidence,
 * corrected-parent and seeding links, and the identity notices. Ids are minted
 * exactly as the folder writers mint them (buildRecordFolderArgs' anchor order,
 * safeCanonical over the WorkflowId minters), so a board id always equals the
 * work item's folder segment. A mint that cannot succeed falls back to the
 * 'H<hash>', ':R(<raw>)' or '<story id>:T<nnn>' form; nothing here throws for
 * a malformed record.
 */

import {
	epicWorkflowId,
	parseWorkflowId,
	safeCanonical,
	storyWorkflowId,
	taskWorkflowId,
} from '../id.js';
import { makeNotice, sortNotices } from './notice.js';
import { asObject, asString, storyOrdinalOf, taskOrdinalOf } from './read.js';
import type {
	ArtifactRecord,
	ArtifactRecordSet,
	CorrectsRef,
	DeliveryNotice,
	WorkItemGraph,
	WorkItemNode,
} from './types.js';

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

/** A non-empty string, else null: an empty id or title names nothing. */
function str(v: unknown): string | null {
	const s = asString(v);
	return s === null || s.length === 0 ? null : s;
}

function obj(v: unknown): Readonly<Record<string, unknown>> {
	return asObject(v) ?? {};
}

function arr(v: unknown): readonly unknown[] {
	return Array.isArray(v) ? v : [];
}

function pad(n: number): string {
	return String(n).padStart(3, '0');
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

/** Task ids in plan order, t2 before t10; any non-t<n> id sorts after, by text. */
function byTaskOrdinal(a: string, b: string): number {
	const oa = taskOrdinalOf(a);
	const ob = taskOrdinalOf(b);
	if (oa !== null && ob !== null) return oa - ob || a.localeCompare(b);
	if (oa !== null) return -1;
	if (ob !== null) return 1;
	return a.localeCompare(b);
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
	plannedTaskIds: string[];
	correctsRef: CorrectsRef | null;
	seededFromSpecId: string | null;
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
		plannedTaskIds:      [...new Set(d.plannedTaskIds)].sort(byTaskOrdinal),
		correctsRef:         d.correctsRef,
		seededFromSpecId:    d.seededFromSpecId,
	};
}

function draftOf(fields: Pick<Draft, 'id' | 'kind' | 'title' | 'workItemHash' | 'standalone'> & Partial<Draft>): Draft {
	return {
		sourceIds: [], parentId: null, childIds: [], evidenceArtifactIds: [], plannedTaskIds: [],
		correctsRef: null, seededFromSpecId: null,
		...fields,
	};
}

/** Everything the later passes need about one story, kept while the hashes are walked. */
interface StoryInfo {
	readonly draft: Draft;
	readonly hash: string;
	readonly ordinal: number | null;
	readonly anchor: string | null;
	readonly records: readonly ArtifactRecord[];
}

/** Everything the later passes need about one work-item hash. */
interface HashInfo {
	readonly head: ArtifactRecord | null;
	readonly headDraft: Draft | null;
	readonly stories: readonly StoryInfo[];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/** Build the work-item graph from one record set. Pure and order-stable; never throws. */
export function buildWorkItemGraph(recordSet: ArtifactRecordSet): WorkItemGraph {
	const groups = groupRecordsByWorkItem(recordSet);
	const notices: DeliveryNotice[] = [];
	const drafts = new Map<string, Draft>();
	const hashes = new Map<string, HashInfo>();

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
			headDraft = draftOf({
				id,
				kind:                head.kind === 'DEF' ? 'epic' : 'issue',
				title:               head.kind === 'DEF' ? str(head.meta['epicSlug']) : str(obj(head.body)['title']),
				workItemHash:        hash,
				standalone:          head.meta['standalone'] === true,
				evidenceArtifactIds: epicLevel.map(r => r.artifactId),
			});
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
			for (const entry of arr(obj(def.body)['stories'])) {
				const id = str(obj(entry)['id']);
				if (id === null) continue;
				const ord = storyOrdinalOf(id);
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
		const stories: StoryInfo[] = [];
		const rawStories: StoryInfo[] = [];
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

			const isRaw = storyKey.startsWith('R(');
			const ordinal = isRaw ? null : Number(storyKey);
			let id: string;
			if (ordinal === null) {
				const base = headDraft?.id
					?? (anchor === null ? undefined : safeCanonical(() => epicWorkflowId(hash, anchor)))
					?? `H${hash}`;
				id = `${base}:${storyKey}`;
			} else {
				const minted = anchor === null ? undefined : safeCanonical(() => storyWorkflowId(hash, anchor, `s${ordinal}`));
				id = minted ?? `H${hash}:S${pad(ordinal)}`;
				if (minted === undefined) {
					notices.push(makeNotice('identity-anchor-missing',
						`story ${storyKey} of work item ${hash} has no usable anchor date or hash to mint its id; using ${id}`,
						{ itemIds: [id], artifactIds: records.map(r => r.artifactId) }));
				}
			}

			const label = str(head?.meta['epicSlug']) ?? str(lld?.meta['epicSlug']);
			const draft = draftOf({
				id,
				kind:                'story',
				title:               s.title ?? (standalone ? label : null),
				workItemHash:        hash,
				standalone,
				sourceIds:           s.sourceIds,
				// A DEF's stories are its members; an issue's are its fix stories.
				parentId:            headDraft?.id ?? null,
				evidenceArtifactIds: records.map(r => r.artifactId),
			});
			drafts.set(id, draft);
			const info: StoryInfo = { draft, hash, ordinal, anchor, records };
			stories.push(info);
			if (ordinal === null) rawStories.push(info);
			if (head === null && !standalone) {
				notices.push(makeNotice('unresolved-parent',
					`story ${id} belongs to work item ${hash}, which has no Define or issue record in the store`,
					{ itemIds: [id], artifactIds: records.map(r => r.artifactId) }));
			}
		}

		if (headDraft !== null) headDraft.childIds.push(...stories.map(s => s.draft.id));
		for (const raw of rawStories) {
			const siblings = stories.filter(s => s !== raw).map(s => s.draft.id);
			const rawId = raw.draft.id.slice(raw.draft.id.lastIndexOf(':R(') + 3, -1);
			notices.push(makeNotice('identity-ambiguous',
				`story id '${rawId}' under work item ${hash} is not an s<n> id, so it cannot be matched to the work item's other stories`,
				{ itemIds: [raw.draft.id, ...siblings], artifactIds: raw.draft.evidenceArtifactIds }));
		}
		hashes.set(hash, { head, headDraft, stories });
	}

	for (const info of hashes.values()) {
		for (const story of info.stories) addTasks(story, drafts);
	}
	resolveCorrectedParents(recordSet, hashes, notices);
	attachSpecs(recordSet, drafts, notices);

	const items = new Map<string, WorkItemNode>();
	for (const id of [...drafts.keys()].sort()) {
		const d = drafts.get(id);
		if (d !== undefined) items.set(id, freeze(d));
	}
	const rootIds = [...items.values()].filter(n => n.parentId === null).map(n => n.id).sort();
	return { items, rootIds, notices: sortNotices(notices) };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/**
 * Task items from the story's PLAN tasks and BUILD task ids of the form t<n>.
 * A BUILD id equal to the story's own id (the story-level result of a small
 * or trivial build) is not a task but the story-level result the gate pass
 * reads; any other non-t<n> id is ignored there too.
 */
function addTasks(story: StoryInfo, drafts: Map<string, Draft>): void {
	const tasks = new Map<string, { title: string | null; evidence: string[] }>();
	const planned: string[] = [];
	const note = (taskId: string, title: string | null, artifactId: string): void => {
		const t = tasks.get(taskId) ?? { title: null, evidence: [] };
		if (t.title === null && title !== null) t.title = title;
		t.evidence.push(artifactId);
		tasks.set(taskId, t);
	};
	for (const r of story.records) {
		if (r.kind !== 'PLAN' && r.kind !== 'BUILD') continue;
		for (const entry of arr(obj(r.body)['tasks'])) {
			const taskId = str(obj(entry)['id']);
			if (taskId === null || taskOrdinalOf(taskId) === null) continue;
			if (r.kind === 'PLAN') planned.push(taskId);
			note(taskId, r.kind === 'PLAN' ? str(obj(entry)['title']) : null, r.artifactId);
		}
	}
	story.draft.plannedTaskIds.push(...planned);

	for (const taskId of [...tasks.keys()].sort(byTaskOrdinal)) {
		const t = tasks.get(taskId);
		const taskOrdinal = taskOrdinalOf(taskId);
		if (t === undefined || taskOrdinal === null) continue;
		const { ordinal, anchor } = story;
		const minted = ordinal === null || anchor === null ? undefined
			: safeCanonical(() => taskWorkflowId(story.hash, anchor, `s${ordinal}`, taskId));
		const id = minted ?? `${story.draft.id}:T${pad(taskOrdinal)}`;
		const existing = drafts.get(id);
		if (existing !== undefined) {
			existing.sourceIds.push(taskId);
			existing.evidenceArtifactIds.push(...t.evidence);
			continue;
		}
		drafts.set(id, draftOf({
			id,
			kind:                'task',
			title:               t.title,
			workItemHash:        story.hash,
			standalone:          story.draft.standalone,
			sourceIds:           [taskId],
			parentId:            story.draft.id,
			evidenceArtifactIds: t.evidence,
		}));
		story.draft.childIds.push(id);
	}
}

// ---------------------------------------------------------------------------
// Corrected parents (ISSUE meta.parentRef)
// ---------------------------------------------------------------------------

const BARE_HASH_RE = /^[0-9a-f]{16}$/;

/** The work-item hashes a parentRef slug names, by each stored form; the issue's own hash excluded. */
function hashesForSlug(
	slug: string,
	ownHash: string,
	recordSet: ArtifactRecordSet,
	hashes: ReadonlyMap<string, HashInfo>,
): { readonly matched: readonly string[]; readonly storyOrdinal: number | null } {
	if (BARE_HASH_RE.test(slug)) {
		return { matched: slug !== ownHash && hashes.has(slug) ? [slug] : [], storyOrdinal: null };
	}
	const parsed = parseWorkflowId(slug);
	if (parsed !== null) {
		const prefix = `E${parsed.date}${parsed.hash8}`;
		const matched = [...hashes.entries()]
			.filter(([h, info]) => h !== ownHash && h.startsWith(parsed.hash8)
				&& [info.headDraft?.id, ...info.stories.map(s => s.draft.id)].some(id => id !== undefined && (id === prefix || id.startsWith(`${prefix}:`))))
			.map(([h]) => h);
		return { matched, storyOrdinal: parsed.story ?? null };
	}
	const matched = new Set<string>();
	for (const r of recordSet.records) {
		if (r.workItemHash !== null && r.workItemHash !== ownHash && r.meta['epicSlug'] === slug && hashes.has(r.workItemHash)) {
			matched.add(r.workItemHash);
		}
	}
	return { matched: [...matched].sort(), storyOrdinal: null };
}

/** The item a single matched hash resolves to, honouring a story ordinal. */
function itemForHash(info: HashInfo, storyOrdinal: number | null): { readonly id: string | null; readonly missingStory: boolean } {
	if (storyOrdinal !== null) {
		const story = info.stories.find(s => s.ordinal === storyOrdinal);
		if (story !== undefined) return { id: story.draft.id, missingStory: false };
		return { id: info.headDraft?.id ?? null, missingStory: true };
	}
	if (info.headDraft !== null) return { id: info.headDraft.id, missingStory: false };
	// A head-less work item (a standalone or trivial story) is its one story.
	const only = info.stories.length === 1 ? info.stories[0] : undefined;
	return { id: only?.draft.id ?? null, missingStory: false };
}

function resolveCorrectedParents(
	recordSet: ArtifactRecordSet,
	hashes: ReadonlyMap<string, HashInfo>,
	notices: DeliveryNotice[],
): void {
	for (const [ownHash, info] of hashes) {
		if (info.head === null || info.head.kind !== 'ISSUE' || info.headDraft === null) continue;
		const issueDraft = info.headDraft;
		const ref = obj(info.head.meta['parentRef']);
		const epicHash = str(ref['epicHash']);
		const slug = str(ref['slug']);
		const storyId = str(ref['storyId']);
		const ownSlug = str(info.head.meta['epicSlug']);

		// A parentRef that names only the issue itself corrects nothing.
		const namesSelf = (epicHash === null || epicHash === ownHash)
			&& (slug === null || slug === ownSlug || slug === ownHash);
		if (namesSelf) continue;

		let matched: readonly string[];
		let storyOrdinal = storyId === null ? null : storyOrdinalOf(storyId);
		if (epicHash !== null && epicHash !== ownHash) {
			matched = hashes.has(epicHash) ? [epicHash] : [];
		} else {
			const bySlug = hashesForSlug(slug ?? '', ownHash, recordSet, hashes);
			matched = bySlug.matched;
			storyOrdinal = bySlug.storyOrdinal ?? storyOrdinal;
		}

		let resolvedItemId: string | null = null;
		const named = slug ?? epicHash ?? '';
		if (matched.length > 1) {
			const candidates = matched.map(h => itemForHash(hashes.get(h) ?? { head: null, headDraft: null, stories: [] }, null).id)
				.filter((id): id is string => id !== null);
			notices.push(makeNotice('identity-ambiguous',
				`issue ${issueDraft.id} names '${named}', which matches ${matched.length} work items; none is chosen`,
				{ itemIds: [issueDraft.id, ...candidates], artifactIds: [info.head.artifactId] }));
		} else if (matched.length === 1) {
			const target = hashes.get(matched[0] ?? '');
			const found = target === undefined ? { id: null, missingStory: false } : itemForHash(target, storyOrdinal);
			resolvedItemId = found.id;
			if (found.missingStory) {
				notices.push(makeNotice('unresolved-parent',
					`issue ${issueDraft.id} corrects story ${storyId ?? ''} of '${named}', which that work item does not have`,
					{ itemIds: [issueDraft.id, ...(found.id === null ? [] : [found.id])], artifactIds: [info.head.artifactId] }));
			} else if (found.id === null) {
				notices.push(makeNotice('unresolved-parent',
					`issue ${issueDraft.id} names '${named}', which has no single work item to attach to`,
					{ itemIds: [issueDraft.id], artifactIds: [info.head.artifactId] }));
			}
		} else {
			notices.push(makeNotice('unresolved-parent',
				`issue ${issueDraft.id} corrects '${named}', which is not in the store`,
				{ itemIds: [issueDraft.id], artifactIds: [info.head.artifactId] }));
		}

		issueDraft.correctsRef = {
			...(epicHash !== null ? { epicHash } : {}),
			...(storyId !== null ? { storyId } : {}),
			...(slug !== null ? { slug } : {}),
			resolvedItemId,
		};
	}
}

// ---------------------------------------------------------------------------
// SPECs
// ---------------------------------------------------------------------------

/** Attach each SPEC to the items whose records name it in meta.seededFromSpec. */
function attachSpecs(
	recordSet: ArtifactRecordSet,
	drafts: ReadonlyMap<string, Draft>,
	notices: DeliveryNotice[],
): void {
	// The item each record is evidence of, and the spec hash it names.
	const itemOfRecord = new Map<string, Draft>();
	for (const d of drafts.values()) {
		for (const artifactId of d.evidenceArtifactIds) itemOfRecord.set(artifactId, d);
	}
	const seededItems = new Map<string, Set<Draft>>();
	for (const r of recordSet.records) {
		const spec = str(r.meta['seededFromSpec']);
		const item = itemOfRecord.get(r.artifactId);
		if (spec === null || item === undefined) continue;
		item.seededFromSpecId = `SPEC-${spec}`;
		const set = seededItems.get(spec) ?? new Set<Draft>();
		set.add(item);
		seededItems.set(spec, set);
	}
	for (const r of recordSet.records) {
		if (r.kind !== 'SPEC') continue;
		const items = r.workItemHash === null ? undefined : seededItems.get(r.workItemHash);
		if (items === undefined || items.size === 0) {
			notices.push(makeNotice('unattached-spec',
				`${r.artifactId} is not named as the seed of any work item`,
				{ artifactIds: [r.artifactId] }));
			continue;
		}
		for (const item of items) item.evidenceArtifactIds.push(r.artifactId);
	}
}
