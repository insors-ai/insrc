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
 * exactly as the folder writers name them (buildRecordFolderArgs' anchor order,
 * workItemBoardId over the folder segment), so a board id always equals the
 * work item's folder segment. A mint that cannot succeed falls back to the
 * 'H<hash>', ':R(<raw>)' or '<story id>:T<nnn>' form; nothing here throws for
 * a malformed record.
 */

import { ArtifactIds } from '../artifact-ids.js';
import { workItemBoardId, workItemRowBoardId, type WorkItemKey } from '../path-scheme.js';
import { makeNotice, sortNotices } from './notice.js';
import { asObject, asString, storyOrdinalOf, taskOrdinalOf } from './read.js';
import type {
	ArtifactRecord,
	ArtifactRecordSet,
	CorrectsRef,
	DeliveryNotice,
	UnitStatus,
	WorkItemGraph,
	WorkItemNode,
	WorkItemUnit,
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

/** The board id of a node, or undefined when its key cannot name a folder. */
function safeBoardId(key: WorkItemKey, task?: string): string | undefined {
	try { return workItemBoardId(key, task); } catch { return undefined; }
}

function safeRowBoardId(key: WorkItemKey, row: string): string | undefined {
	try { return workItemRowBoardId(key, row); } catch { return undefined; }
}

function pad(n: number): string {
	return String(n).padStart(3, '0');
}

function earliestStamp(records: readonly ArtifactRecord[]): string | null {
	let best: string | null = null;
	for (const r of records) {
		if (r.epicCreatedAt !== null && (best === null || r.epicCreatedAt < best)) best = r.epicCreatedAt;
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

/** The records that describe a unit rather than decide it: no one approves one, none is a work item's head, and none is evidence. */
const UNIT_KINDS: ReadonlySet<ArtifactRecord['kind']> = new Set(['EPIC', 'STORY', 'TASK', 'TASKS', 'DIAG']);

/** A record a person reads as evidence of a work item; a unit's own head is shown as its status instead. */
const isEvidence = (r: ArtifactRecord): boolean => !UNIT_KINDS.has(r.kind);

/** The unit whose head is `id`: its status, `unmigrated` when the head has no lifecycle, null when there is no head. */
function unitOf(byId: ReadonlyMap<string, ArtifactRecord>, id: string): WorkItemUnit {
	const head = byId.get(id);
	if (head === undefined) return null;
	const status = asString(asObject(head.meta['lifecycle'])?.['status']);
	return { artifactId: id, status: (status ?? 'unmigrated') as UnitStatus };
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
	unit: WorkItemUnit;
	planRowId: string | null;
	taskOrder: number | null;
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
		unit:                d.unit,
		planRowId:           d.planRowId,
		taskOrder:           d.taskOrder,
	};
}

function draftOf(fields: Pick<Draft, 'id' | 'kind' | 'title' | 'workItemHash' | 'standalone'> & Partial<Draft>): Draft {
	return {
		sourceIds: [], parentId: null, childIds: [], evidenceArtifactIds: [], plannedTaskIds: [],
		correctsRef: null, seededFromSpecId: null, unit: null, planRowId: null, taskOrder: null,
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
	const byId = new Map(recordSet.records.map(r => [r.artifactId, r] as const));
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
			const minted = head.createdAt === null ? undefined : safeBoardId({ epicHash: hash, epicCreatedAt: head.createdAt ?? '' });
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
				evidenceArtifactIds: epicLevel.filter(isEvidence).map(r => r.artifactId),
			});
			if (head.kind === 'DEF') headDraft.unit = unitOf(byId, `EPIC-${hash}`);
			drafts.set(id, headDraft);
			if (def !== null && issue !== null) {
				notices.push(makeNotice('identity-ambiguous',
					`work-item hash ${hash} has both a Define and an issue record; the Define is used as the work item`,
					{ itemIds: [id], artifactIds: [def.artifactId, issue.artifactId] }));
			}
		} else if (epicLevel.some(r => !UNIT_KINDS.has(r.kind))) {
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

		// A record's own createdAt is the day it was written, not the Epic's: only a stamp anchors.
		const lldAnchorOf = (lld: ArtifactRecord | null): string | null => lld === null ? null : lld.epicCreatedAt;
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

			// The anchor is the one the folder resolver uses (buildRecordFolderArgs): a persisted BUILD
			// record's stamp, then the work item's head (a DEF or ISSUE's own createdAt, or the stamp of
			// a standalone LLD head), then the Story's own LLD stamp, then any record's stamp. A record's
			// own createdAt is never an anchor, so the reader and the writers cannot disagree.
			const anchor = earliestStamp(builds) ?? head?.createdAt ?? lldAnchorOf(lld) ?? earliestStamp(records);

			const isRaw = storyKey.startsWith('R(');
			const ordinal = isRaw ? null : Number(storyKey);
			let id: string;
			if (ordinal === null) {
				const base = headDraft?.id
					?? (anchor === null ? undefined : safeBoardId({ epicHash: hash, epicCreatedAt: anchor }))
					?? `H${hash}`;
				id = `${base}:${storyKey}`;
			} else {
				const minted = anchor === null ? undefined : safeBoardId({ epicHash: hash, epicCreatedAt: anchor, story: `s${ordinal}` });
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
				evidenceArtifactIds: records.filter(isEvidence).map(r => r.artifactId),
			});
			draft.unit = ordinal === null ? null : unitOf(byId, `STORY-${hash}-s${ordinal}`);
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
		for (const story of info.stories) addTasks(story, drafts, byId);
	}
	resolveCorrectedParents(recordSet, hashes, notices);
	attachSpecs(recordSet, drafts, notices);
	for (const failure of recordSet.failures) {
		notices.push(makeNotice('record-unreadable',
			`store file ${failure.fileName} could not be loaded (${failure.reason}): ${failure.detail}`,
			{ fileNames: [failure.fileName] }));
	}

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

/** One task item before its board id is settled. */
interface TaskSlot {
	/** The real Task this item is: the head and its number; both null for a row or result with no Task. */
	readonly head:      ArtifactRecord | null;
	readonly number:    string | null;
	/** The plan row or BUILD result id the item is joined on: what the gate pass reads. */
	readonly rowId:     string;
	readonly planRowId: string | null;
	readonly order:     number | null;
	readonly title:     string | null;
}

const GONE: readonly unknown[] = ['withdrawn', 'superseded'];
const isGone = (head: ArtifactRecord): boolean => GONE.includes(asString(obj(head.meta['lifecycle'])['status']));
const orderOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The active Tasks of a story: its TASKS head made from the current plan revision, else its plan's rows matched to Task heads, else its Task heads. */
function activeTasks(story: StoryInfo, byId: ReadonlyMap<string, ArtifactRecord>, rows: readonly { id: string; title: string | null; order: number | null }[]): { slots: TaskSlot[]; goneRows: Set<string> } {
	const heads = story.records.filter(r => r.kind === 'TASK');
	const gone = new Set<ArtifactRecord>(heads.filter(isGone));
	const rowOf = (head: ArtifactRecord): string | null => str(obj(head.body)['planTaskId']);
	const numberOf = (head: ArtifactRecord): string | null => ArtifactIds.parse(head.artifactId)?.task ?? null;
	const goneRows = new Set([...gone].flatMap(h => { const row = rowOf(h); return row === null ? [] : [row]; }));
	const live = heads.filter(h => !gone.has(h));
	const titleOf = (head: ArtifactRecord): string | null => str(obj(head.body)['title']) ?? str(obj(head.meta['envelope'])['description']);
	const slotOf = (head: ArtifactRecord): TaskSlot => {
		const number = numberOf(head) ?? head.artifactId;
		const row = rowOf(head) ?? number;
		return { head, number, rowId: row, planRowId: row, order: orderOf(obj(head.body)['order']), title: titleOf(head) };
	};

	const plan = story.records.find(r => r.kind === 'PLAN');
	const listingHead = story.ordinal === null ? undefined : byId.get(`TASKS-${story.hash}-s${story.ordinal}`);
	const listing = arr(obj(listingHead?.body)['taskIds']).filter((t): t is string => typeof t === 'string');
	const planRevision = plan === undefined ? null : Math.max(1, Number(obj(obj(plan.meta['lifecycle'])['revision'])['number'] ?? 0));
	if (listing.length > 0 && (planRevision === null || obj(listingHead?.body)['planRevision'] === planRevision)) {
		const slots = listing.flatMap((task): TaskSlot[] => {
			const head = byId.get(`TASK-${story.hash}-s${story.ordinal}-${task}`);
			if (head === undefined) return [{ head: null, number: null, rowId: task, planRowId: task, order: null, title: null }];
			return isGone(head) ? [] : [slotOf(head)];
		});
		return { slots, goneRows };
	}
	if (plan !== undefined) {
		const byRow = new Map(live.flatMap(h => { const row = rowOf(h); return row === null ? [] : [[row, h] as const]; }));
		const slots = rows.map((row): TaskSlot => {
			const head = byRow.get(row.id);
			// an interrupted re-plan: the order is the plan's, even when the Task head still carries an older one
			return head === undefined
				? { head: null, number: null, rowId: row.id, planRowId: row.id, order: row.order, title: row.title }
				: { ...slotOf(head), order: row.order, title: row.title ?? titleOf(head) };
		});
		return { slots, goneRows };
	}
	return { slots: live.map(slotOf), goneRows };
}

/**
 * Task items of a story: its active Tasks, then every BUILD result of the form t<n> that matches none of them (a BUILD id equal to the story's
 * own id is the story-level result the gate pass reads, and any other id is ignored). A real Task takes the board id of its own number; a
 * row or a result with no Task keeps the id of its row number unless a real Task holds it, and then takes the :R form, so no two items share an id.
 */
function addTasks(story: StoryInfo, drafts: Map<string, Draft>, byId: ReadonlyMap<string, ArtifactRecord>): void {
	const plan = story.records.find(r => r.kind === 'PLAN');
	const rows = arr(obj(plan?.body)['tasks']).flatMap((entry, index) => {
		const id = str(obj(entry)['id']);
		return id === null || taskOrdinalOf(id) === null ? [] : [{ id, title: str(obj(entry)['title']), order: orderOf(obj(entry)['order']) ?? index + 1 }];
	});
	story.draft.plannedTaskIds.push(...rows.map(r => r.id));
	const results = new Map<string, string[]>();
	for (const build of story.records.filter(r => r.kind === 'BUILD')) {
		for (const entry of arr(obj(build.body)['tasks'])) {
			const id = str(obj(entry)['id']);
			if (id === null || taskOrdinalOf(id) === null) continue;
			results.set(id, [...(results.get(id) ?? []), build.artifactId]);
		}
	}

	const { slots, goneRows } = activeTasks(story, byId, rows);
	const matched = new Set(slots.map(s => s.rowId));
	const unmatched = [...results.keys()].sort(byTaskOrdinal).filter(id => !matched.has(id) && !goneRows.has(id));
	const all: TaskSlot[] = [...slots, ...unmatched.map((id): TaskSlot => ({ head: null, number: null, rowId: id, planRowId: null, order: null, title: null }))];

	const held = new Set(all.flatMap(s => (s.number !== null ? [s.number] : [])));
	const key = story.ordinal === null || story.anchor === null ? undefined : { epicHash: story.hash, epicCreatedAt: story.anchor, story: `s${story.ordinal}` };
	const planEvidence = plan === undefined ? [] : [plan.artifactId];
	for (const slot of all) {
		const number = slot.number ?? slot.rowId;
		const ordinal = taskOrdinalOf(number);
		if (ordinal === null) continue;
		const asRow = slot.head === null && held.has(number);
		const minted = key === undefined ? undefined : asRow ? safeRowBoardId(key, number) : safeBoardId(key, number);
		const id = minted ?? `${story.draft.id}:${asRow ? 'R' : 'T'}${pad(ordinal)}`;
		const evidence = [...(rows.some(r => r.id === slot.rowId) ? planEvidence : []), ...(results.get(slot.rowId) ?? [])];
		const title = slot.title ?? rows.find(r => r.id === slot.rowId)?.title ?? null;
		drafts.set(id, draftOf({
			id,
			kind:                'task',
			title,
			workItemHash:        story.hash,
			standalone:          story.draft.standalone,
			sourceIds:           [slot.rowId],
			parentId:            story.draft.id,
			evidenceArtifactIds: evidence,
			unit:                slot.head === null ? null : unitOf(byId, slot.head.artifactId),
			planRowId:           slot.planRowId,
			taskOrder:           slot.order,
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
	const parsed = ArtifactIds.parse(slug);
	if (parsed !== undefined) {
		const matched = [...hashes.keys()].filter(h => h !== ownHash && (h === parsed.epicHash || (parsed.epicHash.length < 16 && h.startsWith(parsed.epicHash))));
		return { matched, storyOrdinal: parsed.story !== undefined ? ArtifactIds.storyOrdinal(parsed.story) : null };
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
