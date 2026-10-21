/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** The actor an approval records: the person the request names, or the approval gate itself. */

import type { Actor } from './types.js';

/** The actor the approval gate records when the request names no person. */
export const APPROVAL_ACTOR: Actor = { id: 'insrc:approval', kind: 'system', properties: {} };

const ACTOR_ID = /^[a-z][a-z0-9-]*:\S+$/;

/**
 * The actor of an approval: the person the request names, or the gate's own `insrc:approval`. A named actor has to be a
 * namespaced lower-case id such as `github:alice`; one that is not is refused rather than replaced.
 */
export function approvalActorOf(raw: unknown): Actor {
	if (raw === undefined || raw === null) return APPROVAL_ACTOR;
	const o = typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : undefined;
	const id = typeof raw === 'string' ? raw : o?.['id'];
	if (typeof id !== 'string' || !ACTOR_ID.test(id) || id !== id.toLowerCase()) {
		throw new Error(`\`actor\` has to be a namespaced lower-case id such as github:alice (got ${JSON.stringify(id)})`);
	}
	const properties = o !== undefined && typeof o['properties'] === 'object' && o['properties'] !== null && !Array.isArray(o['properties'])
		? o['properties'] as Record<string, unknown> : {};
	return { id, kind: 'person', properties };
}

