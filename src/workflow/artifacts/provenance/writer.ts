/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (provenance/feedback) — the append-only feedback writer + the FIRST
 * production key-preserving artifact-JSON writer.
 *
 * There is no production writer of the `{ meta, body, citations }` artifact
 * envelope today (the synthesizer emits it and the daemon persists it via other
 * paths; `resolve-comment.ts` re-reads + re-writes only from a review-resolution
 * seam). `writeArtifactJson` is that writer: it serializes the WHOLE object it is
 * handed (every meta/body/citations key preserved byte-for-byte) after guarding
 * the destination is inside the repo artifact tree.
 *
 * `appendFeedback` is the append-only mutation: read → validate → mint an id +
 * timestamp → push onto `body.feedback` (never edit/remove an existing entry) →
 * write back. It NEVER touches any other key.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

import { getLogger } from '../../../shared/logger.js';
import type { FeedbackEntry } from './types.js';

const log = getLogger('artifacts:provenance:writer');

/** A typed error for every feedback/artifact-write rejection (out-of-tree path,
 *  missing/malformed JSON, blank author/comment). */
export class ArtifactFeedbackError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ArtifactFeedbackError';
	}
}

/**
 * The minimal artifact envelope this writer round-trips. `meta` + `citations`
 * are opaque (preserved verbatim); only `body.feedback` is ever grown. Additional
 * body keys are preserved through the index signature.
 */
export interface ArtifactShape {
	readonly meta?:      unknown;
	readonly body:       Record<string, unknown> & { feedback?: FeedbackEntry[] };
	readonly citations?: unknown;
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

/** The path segments that mark the repo artifact tree: canonical JSON lives under
 *  `.insrc/artifacts`, its human mirror under `docs/`. A resolved path must sit
 *  inside one of these to be writable (guards against path-traversal / arbitrary
 *  file writes). */
function assertUnderArtifactRoot(absPath: string): void {
	const parts = absPath.split(sep);
	// `.insrc/artifacts` — two consecutive segments.
	for (let i = 0; i + 1 < parts.length; i += 1) {
		if (parts[i] === '.insrc' && parts[i + 1] === 'artifacts') return;
	}
	// `docs/` mirror — any `docs` segment in the path.
	if (parts.includes('docs')) return;
	throw new ArtifactFeedbackError(
		`refusing to write '${absPath}': not under a repo artifact root (.insrc/artifacts or docs/)`,
	);
}

/**
 * Serialize the WHOLE artifact object to `path` (pretty JSON), after guarding the
 * resolved path is inside the repo artifact tree. Key-preserving: whatever object
 * it is handed is what lands on disk — no field is dropped, reordered, or synthesized.
 */
export function writeArtifactJson(path: string, artifact: ArtifactShape): void {
	const abs = resolve(path);
	assertUnderArtifactRoot(abs);
	writeFileSync(abs, JSON.stringify(artifact, null, 2));
}

function readArtifact(absPath: string): ArtifactShape {
	let raw: string;
	try {
		raw = readFileSync(absPath, 'utf8');
	} catch (err) {
		throw new ArtifactFeedbackError(`cannot read artifact '${absPath}': ${(err as Error).message}`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		throw new ArtifactFeedbackError(`artifact '${absPath}' is not valid JSON: ${(err as Error).message}`);
	}
	if (typeof parsed !== 'object' || parsed === null || typeof (parsed as { body?: unknown }).body !== 'object' || (parsed as { body?: unknown }).body === null) {
		throw new ArtifactFeedbackError(`artifact '${absPath}' is malformed: missing a { body } object`);
	}
	return parsed as ArtifactShape;
}

/**
 * Append one feedback entry to an artifact, append-only. Resolves + guards the
 * path (out-of-tree → throw), reads the envelope (missing/malformed → throw),
 * validates the entry (blank author/comment → throw), mints a stable id +
 * timestamp, pushes onto `body.feedback` (treating a missing field as `[]`), and
 * writes the whole object back key-preserving. Existing entries are never edited
 * or removed.
 */
export function appendFeedback(req: AppendFeedbackRequest): AppendFeedbackResult {
	const abs = resolve(req.artifactPath);
	assertUnderArtifactRoot(abs);

	const author  = typeof req.entry.author === 'string' ? req.entry.author.trim() : '';
	const comment = typeof req.entry.comment === 'string' ? req.entry.comment.trim() : '';
	if (author.length === 0) throw new ArtifactFeedbackError('feedback entry requires a non-empty author');
	if (comment.length === 0) throw new ArtifactFeedbackError('feedback entry requires a non-empty comment');

	const artifact = readArtifact(abs);
	const existing = Array.isArray(artifact.body.feedback) ? artifact.body.feedback : [];

	const entryId = randomUUID().slice(0, 8);
	const timestamp = req.entry.timestamp !== undefined && req.entry.timestamp.length > 0
		? req.entry.timestamp
		: new Date().toISOString();

	const entry: FeedbackEntry = {
		id:      entryId,
		author,
		timestamp,
		target:  req.entry.target,
		comment,
		...(req.entry.kind !== undefined ? { kind: req.entry.kind } : {}),
	};

	const next: ArtifactShape = {
		...artifact,
		body: { ...artifact.body, feedback: [...existing, entry] },
	};
	writeArtifactJson(abs, next);
	log.info({ artifactPath: abs, entryId, total: existing.length + 1 }, 'appended feedback entry');
	return { artifactPath: abs, entryId, total: existing.length + 1 };
}
