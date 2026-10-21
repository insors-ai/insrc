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

/** True when `jsonPath` holds a head the store can read. */
export function hasReadableHead(id: string, jsonPath: string): boolean {
	if (!existsSync(jsonPath)) return false;
	try { decodeArtifactHead(id, readFileSync(jsonPath, 'utf8')); return true; } catch { return false; }
}

/**
 * A round record is regenerable, so a head with nothing in it to keep (not JSON at all, or an object with no meta and no body)
 * is replaced by the round, as the raw writers replaced it: it is removed here, and the store then creates the head anew.
 * A head with git conflict markers, or one that parses and holds a meta or body the store cannot decode, may carry stamps
 * (approval, rejection, override) that a person has to resolve, so the round is refused instead.
 */
function discardUnreadableHead(id: string, jsonPath: string): boolean {
	if (!existsSync(jsonPath)) return false;
	const text = readFileSync(jsonPath, 'utf8');
	try { decodeArtifactHead(id, text); return false; }
	catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		if (/^(<{7}|={7}|>{7})/m.test(text)) throw new Error(`the stored round record ${id} has unresolved merge conflict markers; resolve it before this round can be recorded`);
		let parsed: unknown;
		try { parsed = JSON.parse(text); } catch { parsed = undefined; }
		const hasContent = typeof parsed === 'object' && parsed !== null && ('meta' in parsed || 'body' in parsed);
		if (hasContent) throw new Error(`the stored round record ${id} cannot be read (${reason}); resolve it before this round can be recorded`);
		log.warn({ id, jsonPath, err: reason }, 'the stored round record has nothing readable in it; this round replaces it');
		rmSync(jsonPath, { force: true });
		return true;
	}
}

/**
 * Store one round's body as the artifact's content, creating the artifact through the store when it has no head yet, with
 * `outcome` on the change log entry. A round is recorded by the build or the review, not written in answer to a person's feedback, so it
 * addresses none (`addresses: []`). A failed store throws: the round is not recorded and the persist fails with it.
 */
export function storeRound(through: RoundWriter, id: string, jsonPath: string, body: unknown, outcome: ChangeLogEntry['outcome']): Promise<boolean> {
	discardUnreadableHead(id, jsonPath);
	return through.writer.updateContent(id, through.actor, { body: body as HeadPayload['body'], citations: [] }, { create: true, outcome, addresses: [] });
}

/**
 * `record` (a {meta, body} head being refreshed) with the envelope and lifecycle the store holds for it, and its citations, so the
 * raw refresh of a round record leaves what the store wrote as it was. Without a stored head the record is returned as it is.
 */
export function withStoredModel<T extends { readonly meta: object }>(jsonPath: string, record: T): T {
	try {
		const head = JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: Record<string, unknown>; citations?: unknown };
		const kept = Object.fromEntries(['envelope', 'lifecycle'].filter(k => head.meta !== undefined && k in head.meta).map(k => [k, head.meta![k]]));
		return { ...record, ...(head.citations !== undefined ? { citations: head.citations } : {}), meta: { ...kept, ...record.meta } };
	} catch { return record; }
}
