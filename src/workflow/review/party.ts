/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Which PARTY authored a piece of work and which party reviewed it: the
 * controller (the MCP client session) or the daemon.
 *
 * New artifacts, BUILD records and reviews carry the party as an explicit
 * field. Older ones do not, so each reader falls back to the model label that
 * was already stored: the label `client` has always meant "the controller
 * produced this". When nothing decides it the party is `unknown`, and an
 * unknown party never decides anything by itself.
 */

export type Party = 'controller' | 'daemon';
export type PartyOrUnknown = Party | 'unknown';

/** The model label every controller-driven writer has stamped. */
const CONTROLLER_LABEL = 'client';

function explicitParty(value: unknown): Party | undefined {
	return value === 'controller' || value === 'daemon' ? value : undefined;
}

/** The record under `key` when it is a plain object; otherwise undefined. */
function objectAt(value: unknown, key: string): Record<string, unknown> | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const inner = (value as Record<string, unknown>)[key];
	return typeof inner === 'object' && inner !== null ? (inner as Record<string, unknown>) : undefined;
}

/**
 * The party that authored an artifact or a BUILD record, read from its `meta`.
 *
 * `meta.authoredBy` wins. Without it, the per-output attribution decides: every
 * output labelled `client` reads as the controller, none as the daemon, and a
 * mixture or no outputs as unknown. A BUILD record carries no attribution, so
 * an older one reads as unknown.
 */
export function authorPartyOf(meta: unknown): PartyOrUnknown {
	if (typeof meta !== 'object' || meta === null) return 'unknown';
	const explicit = explicitParty((meta as Record<string, unknown>)['authoredBy']);
	if (explicit !== undefined) return explicit;

	const outputs = objectAt(meta, 'attribution')?.['outputs'];
	if (!Array.isArray(outputs) || outputs.length === 0) return 'unknown';
	const labels = outputs.map(o => (typeof o === 'object' && o !== null ? (o as Record<string, unknown>)['model'] : undefined));
	if (labels.every(l => l === CONTROLLER_LABEL)) return 'controller';
	if (labels.every(l => typeof l === 'string' && l.length > 0 && l !== CONTROLLER_LABEL)) return 'daemon';
	return 'unknown';
}

/**
 * The party that ran a review, read from the review stamp (`meta.review` of a
 * design artifact) or from a code-review record's `meta`.
 *
 * `reviewedBy` wins. Without it the stored `model` label decides: `client`
 * reads as the controller and any other label as the daemon. With neither the
 * party is unknown.
 */
export function reviewerPartyOf(review: unknown): PartyOrUnknown {
	if (typeof review !== 'object' || review === null) return 'unknown';
	const rec = review as Record<string, unknown>;
	const explicit = explicitParty(rec['reviewedBy']);
	if (explicit !== undefined) return explicit;
	const model = rec['model'];
	if (typeof model !== 'string' || model.length === 0) return 'unknown';
	return model === CONTROLLER_LABEL ? 'controller' : 'daemon';
}

/** The party that must review work authored by `author`. */
export function otherParty(author: Party): Party {
	return author === 'controller' ? 'daemon' : 'controller';
}
