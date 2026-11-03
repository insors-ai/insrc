/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The file commit (Epic c2ba6fa6 sc2): the one write for a file's rows.
 *
 * A RelationWrite is mapped onto the Relation shape the store's relationship
 * writers already take, so the commit applies Story s1's rule unchanged and no
 * stored form changes: a { stored } target is a resolved relationship (an
 * edge, or a pending row awaiting the id when the target is not stored), a
 * { pending } target a name/path reference kept for the cross-file pass. The
 * evidence rides along to the writers, which store it as the edge's byte or on
 * the pending row (Story s7); 'unknown' is not carried, so it is stored empty.
 */

import type { Relation, RelationWrite } from '../shared/types.js';

export function relationOfWrite(w: RelationWrite): Relation {
	const evidence = w.evidence === 'unknown' ? {} : { evidence: w.evidence };
	if ('stored' in w.target) {
		return { kind: w.kind, from: w.from, to: w.target.stored, resolved: true, ...(w.target.meta !== undefined ? { meta: w.target.meta } : {}), ...evidence };
	}
	return { kind: w.kind, from: w.from, to: w.target.pending.to, resolved: false, meta: w.target.pending.meta, ...evidence };
}

/** The inverse: a resolver Relation as a file commit's RelationWrite (its meta kept as it is). */
export function writeOfRelation(r: Relation): RelationWrite {
	const target: RelationWrite['target'] = r.resolved
		? { stored: r.to, ...(r.meta !== undefined ? { meta: r.meta } : {}) }
		: { pending: { to: r.to, meta: r.meta ?? {} } };
	return { from: r.from, kind: r.kind, target, evidence: r.evidence ?? 'unknown' };
}

