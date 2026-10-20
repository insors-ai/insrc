/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ArtifactStore (sc2): the one reader of an artifact's envelope and, with its
 * history, of its change log and feedback. It is the asynchronous wrapper over
 * the shared decoder; children are derived from each head's parent link and are
 * never stored on the parent.
 */

import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ArtifactIds, InvalidArtifactKeyError } from '../artifact-ids.js';
import { ARTIFACTS_DIR, artifactJsonPath } from '../storage.js';
import { getLogger } from '../../shared/logger.js';
import type { HeadPayload } from './codecs.js';
import { decodeArtifactHead } from './decode.js';
import type { History } from './history.js';
import { ArtifactNotFoundError, ArtifactShapeError } from './types.js';
import type { Artifact, ChangeLogEntry, Feedback } from './types.js';

const log = getLogger('artifact-store');

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export interface ArtifactStoreDeps {
	readonly repoPath: string;
	readonly history:  History;
}

export class ArtifactStore {
	constructor(private readonly deps: ArtifactStoreDeps) {}

	/** The envelope of one artifact, every part filled from its head. Writes nothing and calls no History method. */
	async read(id: string): Promise<Artifact<HeadPayload>> {
		if (ArtifactIds.parse(id) === undefined) throw new InvalidArtifactKeyError(`'${id}' is not an artifact id`);
		const path = artifactJsonPath(this.deps.repoPath, id);
		let raw: string;
		try { raw = await readFile(path, 'utf8'); }
		catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new ArtifactNotFoundError(`no head for ${id} at ${path}`);
			throw err;
		}
		return decodeArtifactHead(id, raw).artifact;
	}

	/** The envelope plus the change log and all feedback, in reader order. */
	async readWithHistory(id: string): Promise<Artifact<HeadPayload> & { readonly changeLog: ChangeLogEntry[]; readonly feedback: Feedback[] }> {
		const artifact = await this.read(id);
		const changeLog = await this.deps.history.log(id);
		const feedback = await this.deps.history.feedback(id);
		return { ...artifact, changeLog, feedback };
	}

	/** The ids of every artifact whose parent link names `id`, sorted. An unreadable head is skipped and logged. */
	async childrenOf(id: string): Promise<string[]> {
		if (ArtifactIds.parse(id) === undefined) throw new InvalidArtifactKeyError(`'${id}' is not an artifact id`);
		const dir = join(this.deps.repoPath, ARTIFACTS_DIR);
		if (!existsSync(dir)) return [];
		const children: string[] = [];
		for (const name of readdirSync(dir).sort()) {
			if (!name.endsWith('.json')) continue;
			const childId = name.slice(0, -'.json'.length);
			if (childId === id || ArtifactIds.parse(childId) === undefined) continue;
			try {
				// Only the parent link is needed, so a kind with no codec yet (a Task) still counts as a child.
				const head: unknown = JSON.parse(await readFile(join(dir, name), 'utf8'));
				if (!isObject(head) || !isObject(head['meta']) || !isObject(head['body'])) throw new ArtifactShapeError(`the head of ${childId} has no meta and body objects`);
				const envelope = head['meta']['envelope'];
				const parent = isObject(envelope) ? envelope['parent'] : undefined;
				if (isObject(parent) && parent['entityId'] === id) children.push(childId);
			} catch (err) {
				log.warn({ id: childId, err: (err as Error).message }, 'skipped an unreadable head while listing children');
			}
		}
		return children.sort();
	}
}
