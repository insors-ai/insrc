/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The snapshot step (E1 s5, sc7): joins the work-item graph and the stage, gate
 * and currency annotations into the one published DeliverySnapshot.
 *
 * Every graph item becomes one DeliveryItem, sorted by id, carrying its stage,
 * evidence entries, task results, amendments and every notice that names it. A
 * story whose route needs a plan (full-chain, feature, sized-bugfix) and that
 * holds a BUILD but no PLAN gets an incomplete-evidence notice; no other route
 * does. An item needs attention when it has a gate attention reason or a notice
 * whose code is marked for attention; each reason is listed once. Notices that
 * name no item are the snapshot's own. Each item also carries its description, read
 * from its own records (describe.ts). Pure and deterministic; plain JSON out.
 */

import { describeItem } from './describe.js';
import { makeNotice, sortNotices } from './notice.js';
import type {
	ArtifactRecord,
	ArtifactRecordSet,
	AttentionReason,
	CurrencyPassResult,
	DeliveryEvidenceEntry,
	DeliveryItem,
	DeliveryItemKind,
	DeliveryMarkdownPort,
	DeliveryNotice,
	DeliveryRoute,
	DeliverySnapshot,
	DeliveryStage,
	GatePassResult,
	NoticeCode,
	StagePassResult,
	WorkItemGraph,
	WorkItemNode,
} from './types.js';

const ITEM_KINDS: readonly DeliveryItemKind[] = ['epic', 'story', 'task', 'issue'];
const STAGES: readonly DeliveryStage[] = ['scoped', 'design-plan', 'ready-design-approved', 'ready-plan-approved', 'build-recorded', 'complete'];

/** Routes whose ready gate is an approved plan, so a build without one is incomplete evidence. */
const PLAN_ROUTES: ReadonlySet<DeliveryRoute> = new Set(['full-chain', 'feature', 'sized-bugfix']);

export const ATTENTION_RULE = 'An item needs attention when it has a gate attention reason (a pending decision, a rejection, '
	+ 'a blocking review, a failed validation or a validation conflict; a pending record stops counting once a later gate on '
	+ 'its item is approved) or a notice whose code is marked for attention.';

/** Code-unit order, independent of locale. */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The build-without-plan notices for stories whose route requires a plan. */
function completenessNotices(graph: WorkItemGraph, byId: ReadonlyMap<string, ArtifactRecord>, stages: StagePassResult): DeliveryNotice[] {
	const notices: DeliveryNotice[] = [];
	for (const item of graph.items.values()) {
		if (item.kind !== 'story') continue;
		const route = stages.stages.get(item.id)?.route;
		if (route === undefined || !PLAN_ROUTES.has(route)) continue;
		const kinds = item.evidenceArtifactIds.map(id => ({ id, kind: byId.get(id)?.kind }));
		const builds = kinds.filter(k => k.kind === 'BUILD').map(k => k.id);
		if (builds.length === 0 || kinds.some(k => k.kind === 'PLAN')) continue;
		notices.push(makeNotice('incomplete-evidence',
			`${item.id} has a build record but no plan, which its ${route} route requires`,
			{ itemIds: [item.id], artifactIds: builds }));
	}
	return notices;
}

/** Assemble the published snapshot from one record set, its graph and the three annotations. */
export function assembleSnapshot(
	recordSet: ArtifactRecordSet,
	graph: WorkItemGraph,
	stages: StagePassResult,
	gates: GatePassResult,
	currency: CurrencyPassResult,
	markdown: DeliveryMarkdownPort,
): DeliverySnapshot {
	const byId = new Map(recordSet.records.map(r => [r.artifactId, r] as const));
	const allNotices = sortNotices([
		...graph.notices, ...stages.notices, ...gates.notices, ...currency.notices,
		...completenessNotices(graph, byId, stages),
	]);
	const noticesByItem = new Map<string, DeliveryNotice[]>();
	for (const n of allNotices) {
		for (const itemId of n.itemIds) {
			const list = noticesByItem.get(itemId);
			if (list === undefined) noticesByItem.set(itemId, [n]);
			else list.push(n);
		}
	}

	const entries = new Map<string, DeliveryEvidenceEntry>();
	const entryOf = (record: ArtifactRecord): DeliveryEvidenceEntry => {
		const cached = entries.get(record.artifactId);
		if (cached !== undefined) return cached;
		const gate = gates.artifacts.get(record.artifactId);
		const md = markdown.markdownOf(record);
		const entry: DeliveryEvidenceEntry = {
			artifactId:     record.artifactId,
			kind:           record.kind,
			mdPath:         md?.mdPath ?? null,
			openWith:       md?.hasMarker === true ? 'review-view' : 'evidence-read',
			approval:       gate?.approval ?? { state: record.approval.state, at: null },
			review:         gate?.review ?? null,
			reviewCurrency: currency.artifacts.get(record.artifactId)?.reviewCurrency ?? null,
		};
		entries.set(record.artifactId, entry);
		return entry;
	};

	const itemOf = (node: WorkItemNode): DeliveryItem => {
		const annotation = node.kind === 'story' || node.kind === 'issue' ? stages.stages.get(node.id) : undefined;
		const itemGates = gates.items.get(node.id);
		const story = node.kind === 'story' ? itemGates : undefined;
		const notices = noticesByItem.get(node.id) ?? [];
		const reasons: (AttentionReason | NoticeCode)[] = [...(itemGates?.attentionReasons ?? [])];
		const noticeCodes = [...new Set(notices.filter(n => n.attention).map(n => n.code))].sort(byText);
		for (const code of noticeCodes) if (!reasons.includes(code)) reasons.push(code);
		return {
			id:               node.id,
			kind:             node.kind,
			title:            node.title,
			standalone:       node.standalone,
			sourceIds:        [...node.sourceIds],
			parentId:         node.parentId,
			childIds:         [...node.childIds],
			stage:            annotation === undefined ? null : {
				stage:  annotation.stage,
				route:  annotation.route,
				reason: { text: annotation.reason.text, artifactIds: [...annotation.reason.artifactIds] },
			},
			evidence:         node.evidenceArtifactIds
				.map(id => byId.get(id))
				.filter((r): r is ArtifactRecord => r !== undefined)
				.map(entryOf)
				.sort((a, b) => byText(a.artifactId, b.artifactId)),
			tasks:            story === undefined ? [] : [...story.tasks],
			validation:       story === undefined ? null : story.validation,
			storyLevelResult: story === undefined ? null : story.storyLevelResult,
			conflict:         story === undefined ? null : story.conflict,
			correctsRef:      node.correctsRef,
			amendments:       node.kind === 'epic' ? [...(currency.amendments.get(node.id) ?? [])] : [],
			notices,
			needsAttention:   reasons.length > 0,
			attentionReasons: reasons,
			description:      describeItem(node, graph, byId),
		};
	};

	const items = [...graph.items.keys()].sort(byText)
		.map(id => graph.items.get(id))
		.filter((n): n is WorkItemNode => n !== undefined)
		.map(itemOf);

	const itemCounts = Object.fromEntries(ITEM_KINDS.map(k => [k, 0])) as Record<DeliveryItemKind, number>;
	const stageCounts = Object.fromEntries(STAGES.map(s => [s, 0])) as Record<DeliveryStage, number>;
	for (const item of items) {
		itemCounts[item.kind] += 1;
		if (item.stage !== null) stageCounts[item.stage.stage] += 1;
	}

	return {
		schemaVersion:   1,
		repo:            recordSet.repo,
		takenAt:         recordSet.readAt,
		recordCount:     recordSet.records.length,
		unreadableCount: recordSet.failures.length,
		items,
		rootIds:         [...graph.rootIds],
		notices:         allNotices.filter(n => n.itemIds.length === 0),
		counts:          { items: itemCounts, byStage: stageCounts, needsAttention: items.filter(i => i.needsAttention).length },
		attentionRule:   ATTENTION_RULE,
	};
}
