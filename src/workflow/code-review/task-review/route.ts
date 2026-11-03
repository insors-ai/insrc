/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { ReviewPacket } from './contracts.js';

/** A document role in a review packet. */
export type DocumentRole = keyof ReviewPacket['documents'];
export const DOCUMENT_ROLES: readonly DocumentRole[] = ['story', 'lld', 'plan', 'issue'];

/**
 * What the Story's route produced, read by the daemon from the Story's stored artifacts and never taken from the
 * submitted packet. `build` is the Story's BUILD record: its task ids and its focus.
 */
export interface StoryRoute {
	readonly epicHash: string;
	readonly storyId: string;
	readonly plan: boolean;
	readonly lld: boolean;
	readonly issue: boolean;
	readonly def: boolean;
	readonly build: { readonly taskIds: readonly string[]; readonly focus: string | undefined };
}

/** The documents a review of this route must pin: exactly what the route produced (the issue only when nothing later exists). */
export function requiredDocumentRoles(route: StoryRoute): readonly DocumentRole[] {
	if (route.plan) return route.def ? ['story', 'lld', 'plan'] : ['lld', 'plan'];
	if (route.lld) return ['lld'];
	if (route.issue) return ['issue'];
	return [];
}
