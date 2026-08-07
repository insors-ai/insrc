/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Messaging-endpoint resolution pass (E20260807914cbf5e:S004).
 *
 * The messaging analogue of `resolveExternalEndpoints`. Runs once per repo,
 * turning the UNRESOLVED PUBLISHES_TO / SUBSCRIBES_TO relations the per-language
 * recognizers emitted (`{ from:<code entity>, rawTo:<raw topic expr>, resolved:false }`)
 * into the external-service graph:
 *
 *   1. read the repo's unresolved PUBLISHES_TO + SUBSCRIBES_TO rows;
 *   2. for each DISTINCT raw topic expression, ask sc2
 *      `resolve(repo,'messaging',expr)` once (memoized per distinct expression);
 *   3. mint ONE `externalEndpoint` Entity per distinct deterministic id
 *      (`makeExternalEndpointId(repo,'messaging',...)`, sc1) — the DIRECTION lives
 *      on the edge, so a topic both published and subscribed dedups to ONE node;
 *   4. promote each unresolved row to a RESOLVED edge OF ITS OWN KIND
 *      (`promoteResolvedBatch` preserves the row's kind) and drop the unresolved row.
 *
 * Orphan GC is protocol-scoped (`gcOrphanEndpoints(repo,'messaging',[...])`), so
 * the http and messaging passes never delete each other's endpoints. An
 * un-pinnable topic is still minted (`resolved:false`, carrying the raw
 * expression) rather than dropped (k5).
 */

import type { DbClient } from '../db/client.js';
import type { Entity, ExternalProtocol, ResolvedTarget } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';
import {
	listUnresolvedRelations,
	promoteResolvedBatch,
	type UnresolvedRelation,
} from '../db/relations.js';
import { upsertEntities, entityU64ForId } from '../db/entities.js';
import { lookupRepoId } from '../db/repos.js';
import { makeExternalEndpointId } from './parser/base.js';
import { resolve as sc2Resolve } from './target-resolution/index.js';
import { gcOrphanEndpoints } from './external-endpoints.js';

const log = getLogger('messaging-endpoints');

/** The boundary kinds this pass owns; a topic endpoint stays alive while any of
 *  these in-edges point at it. */
const MESSAGING_KINDS = ['PUBLISHES_TO', 'SUBSCRIBES_TO'] as const;

/** The sc2 resolver, injectable for tests (default = the real memoized sc2). */
export interface ResolveMessagingEndpointsDeps {
	readonly resolve?: (repo: string, protocol: ExternalProtocol, rawExpression: string) => Promise<ResolvedTarget>;
}

export interface ResolveMessagingEndpointsResult {
	/** distinct externalEndpoint (protocol:'messaging') nodes upserted. */
	readonly endpoints: number;
	/** distinct resolved (from,to) boundary edges written. */
	readonly edges: number;
	/** rows skipped (dead `from` entity, empty identity, or unregistered repo). */
	readonly skipped: number;
	/** orphaned messaging endpoints GC'd (zero incident PUBLISHES_TO/SUBSCRIBES_TO in-edges). */
	readonly gcDeleted: number;
}

/**
 * Resolve every unresolved PUBLISHES_TO / SUBSCRIBES_TO relation for `repo` into
 * `externalEndpoint` (protocol:'messaging') nodes + resolved boundary edges.
 * Idempotent: promoting a row deletes it, so a second run is a no-op.
 */
export async function resolveMessagingEndpoints(
	opts: { readonly db: DbClient; readonly repo: string } & ResolveMessagingEndpointsDeps,
): Promise<ResolveMessagingEndpointsResult> {
	const resolveFn = opts.resolve ?? sc2Resolve;

	const rows = (await listUnresolvedRelations(opts.db, opts.repo))
		.filter(r => r.kind === 'PUBLISHES_TO' || r.kind === 'SUBSCRIBES_TO');
	if (rows.length === 0) {
		// No new messaging calls — but endpoints may have been orphaned on
		// re-index, so STILL run the (protocol-scoped) GC (the full-clear case).
		const gcDeleted = await gcOrphanEndpoints(opts.repo, 'messaging', MESSAGING_KINDS);
		return { endpoints: 0, edges: 0, skipped: 0, gcDeleted };
	}

	const repoId = await lookupRepoId(opts.repo);
	if (repoId === undefined) {
		log.debug({ repo: opts.repo, rows: rows.length }, 'resolveMessagingEndpoints: repo not registered; skipping');
		return { endpoints: 0, edges: 0, skipped: rows.length, gcDeleted: 0 };
	}

	const now = new Date().toISOString();
	const resolvedByExpr = new Map<string, ResolvedTarget>();
	const endpointsById = new Map<string, Entity>();
	const promotes: { unresolved: UnresolvedRelation; targetEntityId: string }[] = [];
	let skipped = 0;

	for (const row of rows) {
		// Skip a row whose calling entity no longer exists (mid-reindex race).
		const fromU64 = await entityU64ForId(row.fromEntity);
		if (fromU64 === undefined) { skipped++; continue; }

		let rt = resolvedByExpr.get(row.rawTo);
		if (rt === undefined) {
			rt = await resolveFn(opts.repo, 'messaging', row.rawTo);
			resolvedByExpr.set(row.rawTo, rt);
		}

		const target = rt.resolved ? rt.identity : '';
		const identity = target !== '' ? target : row.rawTo;
		if (identity.trim() === '') { skipped++; continue; }  // never mint an empty-identity node

		// Direction lives on the EDGE (row.kind), so publish + subscribe to the
		// same topic dedup to ONE node (the id excludes kind).
		const id = makeExternalEndpointId(opts.repo, 'messaging', target, row.rawTo);
		if (!endpointsById.has(id)) {
			const base: Entity = {
				id,
				kind:       'externalEndpoint',
				name:       `messaging:${identity}`,
				language:   'config',
				repoId,
				repo:       opts.repo,
				file:       '',
				startLine:  0,
				endLine:    0,
				body:       '',
				embedding:  [],
				indexedAt:  now,
				protocol:   'messaging',
				resolved:   rt.resolved,
				target,
			};
			// `rawExpression` is present ONLY when unresolved (exactOptionalPropertyTypes).
			endpointsById.set(id, rt.resolved ? base : { ...base, rawExpression: row.rawTo });
		}
		promotes.push({ unresolved: row, targetEntityId: id });
	}

	if (endpointsById.size > 0) await upsertEntities(opts.db, [...endpointsById.values()]);
	// promoteResolvedBatch preserves each row's kind, so a PUBLISHES_TO row lands
	// as a resolved PUBLISHES_TO edge and a SUBSCRIBES_TO as a SUBSCRIBES_TO.
	if (promotes.length > 0) await promoteResolvedBatch(opts.db, promotes);

	// edges = DISTINCT (from,to) pairs (the LMDB edge write collapses duplicates).
	const edges = new Set(promotes.map(p => `${p.unresolved.fromEntity}\x00${p.targetEntityId}`)).size;

	// Protocol-scoped orphan GC — never touches http endpoints. Runs strictly
	// AFTER the edge writes so a still-coupled endpoint is not a false orphan.
	const gcDeleted = await gcOrphanEndpoints(opts.repo, 'messaging', MESSAGING_KINDS);

	const result = { endpoints: endpointsById.size, edges, skipped, gcDeleted };
	log.info({ repo: opts.repo, ...result }, 'resolveMessagingEndpoints pass complete');
	return result;
}
