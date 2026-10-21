/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * How a round record (BUILD, TESTS, code review) reaches the artifact store (s4). A persister given a {@link RoundWriter}
 * stores the round's content through the lifecycle service first, so the replacement is staged, logged with its outcome and
 * revisioned and the earlier round stays readable in the change log. The raw writers then only refresh the meta and the
 * rendered markdown.
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';

import { getLogger } from '../../../shared/logger.js';
import type { HeadPayload } from '../../artifact-core/codecs.js';
import { decodeArtifactHead } from '../../artifact-core/decode.js';
import type { ContentWriteOptions } from '../../artifact-core/lifecycle-service.js';
import type { Actor, ChangeLogEntry } from '../../artifact-core/types.js';

/** Where a round's content goes first when a lifecycle service is in play: its artifact store, so the change log stays in step. */
export interface BuildContentWriter {
	updateContent(id: string, by: Actor, payload: HeadPayload, opts?: ContentWriteOptions): Promise<boolean>;
}

/** What a round persister (BUILD, TESTS, code review) takes to store its content through the lifecycle service: the writer and who is acting. */
export interface RoundWriter {
	readonly writer: BuildContentWriter;
	readonly actor:  Actor;
}

const log = getLogger('workflow:build:round-writer');

/**
 * A round record is regenerable, so a head the store cannot read (not JSON, not an envelope) is replaced by the round, as the
 * raw writers did: it is removed here, and the store then creates the head anew. Returns true when one was removed.
 */
function discardUnreadableHead(id: string, jsonPath: string): boolean {
	if (!existsSync(jsonPath)) return false;
	try { decodeArtifactHead(id, readFileSync(jsonPath, 'utf8')); return false; }
	catch (err) {
		log.warn({ id, jsonPath, err: err instanceof Error ? err.message : String(err) }, 'the stored round record cannot be read; this round replaces it');
		rmSync(jsonPath, { force: true });
		return true;
	}
}

/**
 * Store one round's body as the artifact's content, creating the artifact through the store when it has no head yet, with
 * `outcome` on the change log entry. A failed store throws: the round is not recorded and the persist fails with it.
 */
export function storeRound(through: RoundWriter, id: string, jsonPath: string, body: unknown, outcome: ChangeLogEntry['outcome']): Promise<boolean> {
	discardUnreadableHead(id, jsonPath);
	return through.writer.updateContent(id, through.actor, { body: body as HeadPayload['body'], citations: [] }, { create: true, outcome });
}

/** The `citations` key of the head the store holds, so the raw refresh of a round record leaves the head as the store wrote it (an absent key is not the same bytes as an empty list). */
export function storedCitations(jsonPath: string): { readonly citations?: unknown } {
	try {
		const head = JSON.parse(readFileSync(jsonPath, 'utf8')) as { citations?: unknown };
		return head.citations !== undefined ? { citations: head.citations } : {};
	} catch { return {}; }
}
