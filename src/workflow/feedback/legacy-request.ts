/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The request of the IPC method `artifact.feedback.append`, in the shape its callers have always sent: an artifact path and an
 * entry with an author, a comment and a target file. The daemon stores it as a Feedback line through the repository's
 * FeedbackService (see daemon/feedback-handlers.ts); nothing here writes. The artifact body never holds feedback.
 */

import type { FeedbackAnchor, FeedbackEntry, ProvenanceTarget } from '../artifacts/provenance/types.js';

/** A typed error for every rejection of a feedback request (an out-of-tree path, a blank author or comment). */
export class ArtifactFeedbackError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ArtifactFeedbackError';
	}
}

export interface AppendFeedbackRequest {
	readonly artifactPath: string;
	readonly entry: Omit<FeedbackEntry, 'id' | 'timestamp'> & { readonly timestamp?: string | undefined };
}

export interface AppendFeedbackResult {
	readonly artifactPath: string;
	readonly entryId:      string;
	readonly total:        number;
}

/** Shape the loosely-typed request into a validated AppendFeedbackRequest. Throws ArtifactFeedbackError on a missing required field. */
export function coerceRequest(input: Readonly<Record<string, unknown>>): AppendFeedbackRequest {
	const artifactPath = typeof input['artifactPath'] === 'string' ? input['artifactPath'] : '';
	if (artifactPath.length === 0) throw new ArtifactFeedbackError('artifact.feedback.append requires `artifactPath`');
	const targetIn = input['target'];
	if (typeof targetIn !== 'object' || targetIn === null || typeof (targetIn as { file?: unknown }).file !== 'string') {
		throw new ArtifactFeedbackError('artifact.feedback.append requires `target.file`');
	}
	const t = targetIn as { file: string; version?: unknown; segment?: unknown };
	const target: ProvenanceTarget = {
		file: t.file,
		...(typeof t.version === 'string' ? { version: t.version } : {}),
		...(isSegment(t.segment) ? { segment: t.segment } : {}),
	};
	const kind = input['kind'];
	const entry: AppendFeedbackRequest['entry'] = {
		author:  typeof input['author'] === 'string' ? input['author'] : '',
		comment: typeof input['comment'] === 'string' ? input['comment'] : '',
		target,
		...(typeof input['timestamp'] === 'string' ? { timestamp: input['timestamp'] } : {}),
		...(kind === 'feedback' || kind === 'suggestion' || kind === 'comment' ? { kind } : {}),
		...reviewFields(input),
	};
	return { artifactPath, entry };
}

/** The optional anchor / decision / batchId of a request, each kept only when well-formed. */
function reviewFields(input: Readonly<Record<string, unknown>>): Pick<AppendFeedbackRequest['entry'], 'anchor' | 'decision' | 'batchId'> {
	const a = input['anchor'];
	const str = (v: unknown): v is string => typeof v === 'string';
	const anchor: FeedbackAnchor | undefined = typeof a === 'object' && a !== null && str((a as { quote?: unknown }).quote)
		? {
			quote: (a as { quote: string }).quote,
			...(str((a as { sectionSlug?: unknown }).sectionSlug) ? { sectionSlug: (a as { sectionSlug: string }).sectionSlug } : {}),
			...(str((a as { prefix?: unknown }).prefix) ? { prefix: (a as { prefix: string }).prefix } : {}),
			...(str((a as { suffix?: unknown }).suffix) ? { suffix: (a as { suffix: string }).suffix } : {}),
		}
		: undefined;
	const decision = input['decision'];
	const batchId = input['batchId'];
	return {
		...(anchor !== undefined ? { anchor } : {}),
		...(decision === 'approve' || decision === 'reject' || decision === 'feedback' ? { decision } : {}),
		...(str(batchId) && batchId.length > 0 ? { batchId } : {}),
	};
}

function isSegment(v: unknown): v is NonNullable<FeedbackEntry['target']['segment']> {
	return typeof v === 'object' && v !== null
		&& typeof (v as { startLine?: unknown }).startLine === 'number'
		&& typeof (v as { endLine?: unknown }).endLine === 'number';
}
