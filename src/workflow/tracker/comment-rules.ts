/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The pure rules of the comment sync (s8): what kind of feedback a tracker comment is, whether the framework posted it, who
 * wrote it and which feedback entry id it is recorded under. Nothing here reads or writes anything.
 */

import { isNamespacedActorId } from '../artifact-core/decode.js';
import type { Actor, Feedback } from '../artifact-core/types.js';

/** The first line asks for a revision (`/revise` or `revision:`) or offers a suggestion (`/suggest` or `suggestion:`), in any case. */
const REVISION = /^(?:\/revise\b|revision:)/i;
const SUGGESTION = /^(?:\/suggest\b|suggestion:)/i;

/** The feedback kind a comment's first line asks for; only the first line decides, and any other comment is a plain comment. */
export function classifyComment(text: string): Feedback['kind'] {
	const first = text.trimStart().split('\n', 1)[0] ?? '';
	if (REVISION.test(first)) return 'revision-request';
	if (SUGGESTION.test(first)) return 'suggestion';
	return 'comment';
}

/** Any insrc marker comment (`<!-- insrc:post:... -->`, `insrc:review`, `insrc:handoff`, `insrc:attach:...`, `insrc:feedback:...`). */
const MARKER = /<!--\s*insrc:[a-z][a-z-]*/i;

/**
 * True when the framework posted the comment: it carries an insrc marker. Every comment the framework posts is made from the
 * user's own tracker login, so the author cannot tell them apart; only the marker can. A comment posted before markers
 * existed is not recognised (the conversion hands those over).
 */
export function isFrameworkComment(text: string): boolean {
	return MARKER.test(text);
}

/** The actor of a tracker login: `github:<lower-cased login>` (logins are case-insensitive), `github:unknown` for an empty or deleted author. */
export function actorOfLogin(login: string): Actor {
	const name = login.trim();
	const id = `github:${name.toLowerCase()}`;
	if (name === '' || !isNamespacedActorId(id)) return { id: 'github:unknown', kind: 'person', properties: {} };
	return { id, kind: 'person', name, properties: {} };
}

/** The feedback entry id a tracker comment is recorded under: the same comment always gets the same id, so recording it twice is a repeat. */
export function feedbackIdOfComment(commentId: string): string {
	return `tracker:${commentId}`;
}
