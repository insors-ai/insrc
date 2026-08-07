/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * External-endpoint resolution pass (E20260807914cbf5e:S003 — t1).
 *
 * Runs once per repo after `runCrossFileResolver`, inside `fullIndex`. It turns
 * the UNRESOLVED CALLS_HTTP relations the per-language recognizers emitted
 * (`{ from: <code entity>, rawTo: <raw URL expr>, resolved:false }`) into the
 * external-service graph:
 *
 *   1. read the repo's unresolved CALLS_HTTP rows (`listUnresolvedRelations`);
 *   2. for each DISTINCT raw URL expression, ask sc2 `resolve(repo,'http',expr)`
 *      once (sc2 memoizes the per-repo ConfigSourceMap; we additionally memoize
 *      per distinct expression so each is resolved a single time);
 *   3. mint ONE `externalEndpoint` Entity per distinct deterministic id
 *      (`makeExternalEndpointId`, sc1) — resolved endpoints key on the resolved
 *      identity, unresolved ones key on (and carry) the raw expression;
 *   4. promote each unresolved row to a RESOLVED CALLS_HTTP edge
 *      (`caller -> endpoint`) and drop the unresolved row (`promoteResolvedBatch`).
 *
 * Determinism gives dedup + idempotency for free: N call-sites reaching one
 * target in one repo hash to one id -> one node with N edges; the same target in
 * two repos yields two nodes (repo is in the id); re-running over identical
 * sources reproduces the identical node/edge set. A row whose `from` entity no
 * longer exists (a mid-reindex race) is skipped rather than minting a dangling
 * edge or an orphan node. sc2 never throws — an un-pinnable URL is a value
 * (`resolved:false`), so it still mints an (unresolved) node carrying the raw
 * expression rather than being dropped.
 */

import type { DbClient } from '../db/client.js';
import type { Entity, ExternalProtocol, RelationKind, ResolvedTarget } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';
import {
	listUnresolvedRelations,
	promoteResolvedBatch,
	type UnresolvedRelation,
} from '../db/relations.js';
import { upsertEntities, entityU64ForId, listEntitiesByKind, deleteEntitiesById } from '../db/entities.js';
import { inNeighbors } from '../db/graph/edges.js';
import { lookupRepoId } from '../db/repos.js';
import { makeExternalEndpointId } from './parser/base.js';
import { resolve as sc2Resolve } from './target-resolution/index.js';

const log = getLogger('external-endpoints');

/** The sc2 resolver, injectable for tests (default = the real memoized sc2). */
export interface ResolveExternalEndpointsDeps {
	readonly resolve?: (repo: string, protocol: ExternalProtocol, rawExpression: string) => Promise<ResolvedTarget>;
}

export interface ResolveExternalEndpointsResult {
	/** distinct externalEndpoint nodes upserted. */
	readonly endpoints: number;
	/** distinct resolved CALLS_HTTP edges written (distinct (from,to) pairs). */
	readonly edges: number;
	/** rows skipped (dead `from` entity or empty identity). */
	readonly skipped: number;
	/** orphaned externalEndpoint nodes GC'd (zero incident CALLS_HTTP in-edges). */
	readonly gcDeleted: number;
}

/**
 * Resolve every unresolved CALLS_HTTP relation for `repo` into
 * `externalEndpoint` nodes + resolved CALLS_HTTP edges. Idempotent: promoting a
 * row deletes it, so a second run over the same graph is a no-op.
 */
export async function resolveExternalEndpoints(
	opts: { readonly db: DbClient; readonly repo: string } & ResolveExternalEndpointsDeps,
): Promise<ResolveExternalEndpointsResult> {
	const resolveFn = opts.resolve ?? sc2Resolve;

	const rows = (await listUnresolvedRelations(opts.db, opts.repo))
		.filter(r => r.kind === 'CALLS_HTTP');
	if (rows.length === 0) {
		// No new HTTP calls — but endpoints may have been orphaned (all callers
		// removed on re-index), so STILL run GC (the full-clear case).
		const gcDeleted = await gcOrphanEndpoints(opts.repo, 'http', ['CALLS_HTTP']);
		return { endpoints: 0, edges: 0, skipped: 0, gcDeleted };
	}

	const repoId = await lookupRepoId(opts.repo);
	if (repoId === undefined) {
		// Not registered — the strict-contract upsert would reject anyway.
		log.debug({ repo: opts.repo, rows: rows.length }, 'resolveExternalEndpoints: repo not registered; skipping');
		return { endpoints: 0, edges: 0, skipped: rows.length, gcDeleted: 0 };
	}

	const now = new Date().toISOString();
	const resolvedByExpr = new Map<string, ResolvedTarget>();
	const endpointsById = new Map<string, Entity>();
	const promotes: { unresolved: UnresolvedRelation; targetEntityId: string }[] = [];
	let skipped = 0;

	for (const row of rows) {
		// Skip a row whose calling entity no longer exists (a file deleted /
		// re-indexed between parse and this pass) — never write a dangling edge.
		const fromU64 = await entityU64ForId(row.fromEntity);
		if (fromU64 === undefined) { skipped++; continue; }

		let rt = resolvedByExpr.get(row.rawTo);
		if (rt === undefined) {
			rt = await resolveFn(opts.repo, 'http', row.rawTo);
			resolvedByExpr.set(row.rawTo, rt);
		}

		const target = rt.resolved ? rt.identity : '';
		const identity = target !== '' ? target : row.rawTo;
		if (identity.trim() === '') { skipped++; continue; }  // never mint an empty-identity node

		const id = makeExternalEndpointId(opts.repo, 'http', target, row.rawTo);
		if (!endpointsById.has(id)) {
			const base: Entity = {
				id,
				kind:       'externalEndpoint',
				name:       `http:${identity}`,
				// endpoints are language-agnostic; the id excludes language, so a
				// fixed sentinel keeps cross-language call-sites on one node.
				language:   'config',
				repoId,
				repo:       opts.repo,
				file:       '',
				startLine:  0,
				endLine:    0,
				body:       '',
				embedding:  [],
				indexedAt:  now,
				protocol:   'http',
				resolved:   rt.resolved,
				target,
			};
			// `rawExpression` is present ONLY when unresolved (exactOptionalPropertyTypes).
			endpointsById.set(id, rt.resolved ? base : { ...base, rawExpression: row.rawTo });
		}
		promotes.push({ unresolved: row, targetEntityId: id });
	}

	if (endpointsById.size > 0) await upsertEntities(opts.db, [...endpointsById.values()]);
	if (promotes.length > 0) await promoteResolvedBatch(opts.db, promotes);

	// edges = DISTINCT (from,to) pairs (the LMDB edge write collapses duplicates:
	// one caller reaching one identity via two raw exprs is a single edge).
	const edges = new Set(promotes.map(p => `${p.unresolved.fromEntity}\x00${p.targetEntityId}`)).size;

	// GC (item 2): after the current edges are written above, delete this repo's
	// externalEndpoint nodes that now have ZERO incident CALLS_HTTP in-edges —
	// orphans left when a source HTTP call was removed/changed and its edge
	// cascaded away on file re-index. Runs strictly AFTER promoteResolvedBatch so
	// a still-called endpoint's just-written edge is visible (never a false orphan).
	// No-op when nothing is orphaned, so re-index stays idempotent.
	const gcDeleted = await gcOrphanEndpoints(opts.repo, 'http', ['CALLS_HTTP']);

	const result = { endpoints: endpointsById.size, edges, skipped, gcDeleted };
	log.info({ repo: opts.repo, ...result }, 'resolveExternalEndpoints pass complete');
	return result;
}

/**
 * Delete externalEndpoint nodes in `repo` of protocol `protocol` with no
 * incident boundary in-edge of any kind in `kinds`. Returns the count deleted.
 * PROTOCOL-SCOPED (S004): the sweep only considers endpoints of this protocol,
 * so the http and messaging resolution passes never GC each other's nodes — a
 * messaging endpoint has zero CALLS_HTTP in-edges and MUST NOT be deleted by the
 * http pass, and vice-versa. Exported so the messaging pass reuses it.
 */
export async function gcOrphanEndpoints(
	repo: string,
	protocol: ExternalProtocol,
	kinds: readonly RelationKind[],
): Promise<number> {
	const endpoints = (await listEntitiesByKind(null, 'externalEndpoint'))
		.filter(e => e.repo === repo && e.protocol === protocol);
	if (endpoints.length === 0) return 0;

	const orphanIds: string[] = [];
	for (const ep of endpoints) {
		const u64 = await entityU64ForId(ep.id);
		if (u64 === undefined) continue;  // already gone
		const callers = await inNeighbors(u64, { kindFilter: kinds });
		if (callers.length === 0) orphanIds.push(ep.id);
	}
	if (orphanIds.length > 0) await deleteEntitiesById(null, orphanIds);
	return orphanIds.length;
}
