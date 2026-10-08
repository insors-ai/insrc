/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The stage pass (E1 s2, sc4): each story's and issue's delivery stage, the
 * route that decided its ready gate, and the reason naming the evidence.
 *
 * The route comes only from recorded fields, first match wins: the ISSUE's
 * magnitude for an issue and its fix stories; the story's LLD sizeClass; the
 * sizeClass its standalone BUILD records agree on; full-chain for a story under
 * a non-standalone epic; otherwise 'unknown'. A non-standalone BUILD's
 * sizeClass is never read, and nothing is guessed.
 *
 * The stage is the first rule that matches: an approved BUILD (complete); any
 * BUILD (build-recorded); the route's ready gate (an approved PLAN for the
 * full-chain, feature and sized-bugfix routes; an approved LLD for small; an
 * approved ISSUE for small-bugfix); any LLD or PLAN (design-plan); else scoped.
 * Approval is read only from ArtifactRecord.approval; task results, review
 * verdicts and the other passes' annotations are never consulted. Pure: no I/O.
 */

import { makeNotice, sortNotices } from './notice.js';
import type {
	ArtifactRecord,
	DeliveryNotice,
	ArtifactRecordSet,
	DeliveryRoute,
	DeliveryStage,
	StageAnnotation,
	StagePassResult,
	WorkItemGraph,
	WorkItemNode,
} from './types.js';

/** Stage order, least advanced first: an issue takes its least advanced fix story's stage. */
const STAGE_ORDER: readonly DeliveryStage[] = ['scoped', 'design-plan', 'ready-design-approved', 'ready-plan-approved', 'build-recorded', 'complete'];

/** Routes whose ready gate is an approved plan. */
const PLAN_ROUTES: ReadonlySet<DeliveryRoute> = new Set(['full-chain', 'feature', 'sized-bugfix']);

/** The gate each route needs, as reasons phrase it; trivial and unknown have none. */
const READY_GATE: Readonly<Partial<Record<DeliveryRoute, string>>> = {
	'full-chain':   'an approved plan',
	'feature':      'an approved plan',
	'sized-bugfix': 'an approved plan',
	'small':        'an approved design',
	'small-bugfix': 'an approved issue',
};

/** A SizeClass value that names a story route; any other value is not a route. */
function routeOfSizeClass(value: string): DeliveryRoute | null {
	return value === 'feature' || value === 'small' || value === 'trivial' ? value : null;
}

/** An ISSUE's magnitude as a route; anything else is unknown. */
function routeOfMagnitude(issue: ArtifactRecord): DeliveryRoute {
	const magnitude = issue.meta['magnitude'];
	return magnitude === 'small' ? 'small-bugfix' : magnitude === 'sized' ? 'sized-bugfix' : 'unknown';
}

function stringField(record: ArtifactRecord, key: string): string | undefined {
	const value = record.meta[key];
	return typeof value === 'string' ? value : undefined;
}

const sorted = (ids: readonly string[]): string[] => [...new Set(ids)].sort();
const isApproved = (r: ArtifactRecord): boolean => r.approval.state === 'approved';

/** What the pass knows across the whole record set. */
interface PassContext {
	readonly graph:       WorkItemGraph;
	readonly byId:        ReadonlyMap<string, ArtifactRecord>;
	readonly issueByHash: ReadonlyMap<string, ArtifactRecord>;
}

function evidenceOf(ctx: PassContext, item: WorkItemNode): ArtifactRecord[] {
	return item.evidenceArtifactIds.flatMap(id => {
		const r = ctx.byId.get(id);
		return r !== undefined ? [r] : [];
	});
}

/** The story's route, by the precedence in the module comment. */
function storyRoute(ctx: PassContext, story: WorkItemNode, evidence: readonly ArtifactRecord[]): DeliveryRoute {
	const issue = story.workItemHash !== null ? ctx.issueByHash.get(story.workItemHash) : undefined;
	if (issue !== undefined) return routeOfMagnitude(issue);

	const lld = evidence.find(r => r.kind === 'LLD');
	const lldClass = lld !== undefined ? stringField(lld, 'sizeClass') : undefined;
	if (lldClass !== undefined) return routeOfSizeClass(lldClass) ?? 'unknown';

	const buildClasses = evidence
		.filter(r => r.kind === 'BUILD' && r.meta['standalone'] === true)
		.flatMap(r => { const c = stringField(r, 'sizeClass'); return c !== undefined ? [c] : []; });
	if (buildClasses.length > 0) {
		const distinct = new Set(buildClasses);
		const only = distinct.size === 1 ? [...distinct][0] : undefined;
		return only !== undefined ? routeOfSizeClass(only) ?? 'unknown' : 'unknown';
	}

	const parent = story.parentId !== null ? ctx.graph.items.get(story.parentId) : undefined;
	if (!story.standalone && parent?.kind === 'epic') return 'full-chain';
	return 'unknown';
}

/** The first matching stage rule for a story, with the records it used. */
function storyStage(
	route: DeliveryRoute,
	evidence: readonly ArtifactRecord[],
	issue: ArtifactRecord | undefined,
): { stage: DeliveryStage; text: string; artifactIds: string[] } {
	const of = (kind: ArtifactRecord['kind']): ArtifactRecord[] => evidence.filter(r => r.kind === kind);
	const ids = (records: readonly ArtifactRecord[]): string[] => sorted(records.map(r => r.artifactId));
	const builds = of('BUILD');

	const approvedBuilds = builds.filter(isApproved);
	if (approvedBuilds.length > 0) {
		const a = ids(approvedBuilds);
		return { stage: 'complete', text: `${a.join(', ')} approved`, artifactIds: a };
	}
	if (builds.length > 0) {
		const a = ids(builds);
		return { stage: 'build-recorded', text: `${a.join(', ')} recorded and not approved`, artifactIds: a };
	}

	if (PLAN_ROUTES.has(route)) {
		const plans = of('PLAN').filter(isApproved);
		if (plans.length > 0) {
			const a = ids(plans);
			return { stage: 'ready-plan-approved', text: `${a.join(', ')} approved; the ${route} route is ready once its plan is approved`, artifactIds: a };
		}
	} else if (route === 'small') {
		const llds = of('LLD').filter(isApproved);
		if (llds.length > 0) {
			const a = ids(llds);
			return { stage: 'ready-design-approved', text: `${a.join(', ')} approved; the small route needs no plan`, artifactIds: a };
		}
	} else if (route === 'small-bugfix' && issue !== undefined && isApproved(issue)) {
		return { stage: 'ready-design-approved', text: `${issue.artifactId} approved; the small-bugfix route needs no design or plan`, artifactIds: [issue.artifactId] };
	}

	const designs = [...of('LLD'), ...of('PLAN')];
	if (designs.length > 0) {
		const a = ids(designs);
		const gate = READY_GATE[route];
		const waiting = gate !== undefined ? `; the ${route} route is ready once it has ${gate}` : '';
		return { stage: 'design-plan', text: `${a.join(', ')} recorded${waiting}`, artifactIds: a };
	}
	if (route === 'sized-bugfix' && issue !== undefined && isApproved(issue)) {
		return { stage: 'design-plan', text: `${issue.artifactId} approved; the sized-bugfix route needs a design and an approved plan`, artifactIds: [issue.artifactId] };
	}
	return { stage: 'scoped', text: 'no design, plan or build record', artifactIds: [] };
}

function storyAnnotation(ctx: PassContext, story: WorkItemNode): StageAnnotation {
	const evidence = evidenceOf(ctx, story);
	const route = storyRoute(ctx, story, evidence);
	const issue = story.workItemHash !== null ? ctx.issueByHash.get(story.workItemHash) : undefined;
	const { stage, text, artifactIds } = storyStage(route, evidence, issue);
	const suffix = route === 'unknown' ? ' (route unknown, so no ready gate applies)' : '';
	return { itemId: story.id, stage, route, reason: { text: `${text}${suffix}`, artifactIds } };
}

/** An issue: its least advanced fix story's stage, or, with none, the rules over its own ISSUE. */
function issueAnnotation(ctx: PassContext, issueItem: WorkItemNode, stories: ReadonlyMap<string, StageAnnotation>): StageAnnotation {
	const issue = issueItem.workItemHash !== null ? ctx.issueByHash.get(issueItem.workItemHash) : undefined;
	const route = issue !== undefined ? routeOfMagnitude(issue) : 'unknown';
	const suffix = route === 'unknown' ? ' (route unknown, so no ready gate applies)' : '';

	const children = issueItem.childIds.flatMap(id => { const a = stories.get(id); return a !== undefined ? [a] : []; });
	if (children.length > 0) {
		const least = children.reduce((a, b) => STAGE_ORDER.indexOf(b.stage) < STAGE_ORDER.indexOf(a.stage) ? b : a);
		return {
			itemId: issueItem.id, stage: least.stage, route,
			reason: { text: `least advanced fix story ${least.itemId}: ${least.reason.text}`, artifactIds: least.reason.artifactIds },
		};
	}
	const { stage, text, artifactIds } = storyStage(route, [], issue);
	return { itemId: issueItem.id, stage, route, reason: { text: `${text}${suffix}`, artifactIds } };
}

/** The pass's notices for one item: an unknown route, and a code review with no build. */
function noticesFor(ctx: PassContext, item: WorkItemNode, annotation: StageAnnotation): DeliveryNotice[] {
	const evidence = evidenceOf(ctx, item);
	const notices: DeliveryNotice[] = [];
	if (annotation.route === 'unknown') {
		const routeFields = evidence.filter(r => r.kind === 'ISSUE' || r.kind === 'LLD' || r.kind === 'BUILD').map(r => r.artifactId);
		notices.push(makeNotice('unknown-route',
			`${item.id} has no recorded route; its stage comes from its records alone`,
			{ itemIds: [item.id], artifactIds: routeFields }));
	}
	if (item.kind === 'story') {
		const reviews = evidence.filter(r => r.kind === 'CR');
		if (reviews.length > 0 && !evidence.some(r => r.kind === 'BUILD')) {
			notices.push(makeNotice('review-without-build',
				`${item.id} has a code review but no build record`,
				{ itemIds: [item.id], artifactIds: reviews.map(r => r.artifactId) }));
		}
	}
	return notices;
}

/**
 * Annotate every story and issue in the graph with its stage, route and reason.
 * Never throws: a missing record or a field of the wrong type falls through its rule.
 */
export function deriveStages(graph: WorkItemGraph, recordSet: ArtifactRecordSet): StagePassResult {
	const byId = new Map(recordSet.records.map(r => [r.artifactId, r] as const));
	const issueByHash = new Map<string, ArtifactRecord>();
	for (const r of recordSet.records) {
		if (r.kind === 'ISSUE' && r.workItemHash !== null && !issueByHash.has(r.workItemHash)) issueByHash.set(r.workItemHash, r);
	}
	const ctx: PassContext = { graph, byId, issueByHash };

	const ids = [...graph.items.keys()].sort();
	const stories = new Map<string, StageAnnotation>();
	for (const id of ids) {
		const item = graph.items.get(id);
		if (item?.kind === 'story') stories.set(id, storyAnnotation(ctx, item));
	}

	const stages = new Map<string, StageAnnotation>();
	const notices: DeliveryNotice[] = [];
	for (const id of ids) {
		const item = graph.items.get(id);
		if (item === undefined || (item.kind !== 'story' && item.kind !== 'issue')) continue;
		const annotation = item.kind === 'story' ? stories.get(id) : issueAnnotation(ctx, item, stories);
		if (annotation === undefined) continue;
		stages.set(id, annotation);
		notices.push(...noticesFor(ctx, item, annotation));
	}
	return { stages, notices: sortNotices(notices) };
}
