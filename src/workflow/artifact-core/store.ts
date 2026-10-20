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

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ArtifactIds, InvalidArtifactKeyError, isArtifactIdKind } from '../artifact-ids.js';
import type { ArtifactKey } from '../artifact-ids.js';
import { ARTIFACTS_DIR, artifactJsonPath, prepareArtifactWrite, writeAtomic } from '../storage.js';
import { getLogger } from '../../shared/logger.js';
import { codecFor, creationContextProvider } from './codecs.js';
import type { CreationContextProvider, HeadFile, HeadPayload } from './codecs.js';
import { decodeArtifactHead } from './decode.js';
import type { History } from './history.js';
import { createMemoryJournal } from './journal.js';
import type { StagedOperation, WriteJournal } from './journal.js';
import { ArtifactNotFoundError, ArtifactShapeError } from './types.js';
import type { Actor, Artifact, ChangeLogEntry, Feedback, Reference } from './types.js';

const log = getLogger('artifact-store');

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export interface ArtifactStoreDeps {
	readonly repoPath: string;
	readonly history:  History;
	/** Required: a write is staged here before it changes anything. */
	readonly journal:  WriteJournal;
	/** The creation context for an id with no head; defaults to the repository's provider. */
	readonly contexts?: CreationContextProvider | undefined;
	readonly now?:      (() => Date) | undefined;
	/** Replaces the head file; defaults to the atomic writer. Injected by tests to fail a replace. */
	readonly writeHead?: ((path: string, bytes: string) => void) | undefined;
}

/** Sorted-key JSON, so two payloads that differ only in key order compare equal. */
function canonical(v: unknown): string {
	if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
	if (typeof v === 'object' && v !== null) {
		return `{${Object.keys(v).sort().filter(k => (v as Record<string, unknown>)[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
	}
	return JSON.stringify(v) ?? 'null';
}

/** The writes in flight, one queue per repository and artifact, shared by every store instance in the process. */
const WRITE_QUEUES = new Map<string, Promise<unknown>>();

const ACTOR_ID = /^[a-z][a-z0-9-]*:\S+$/;

/** A reference whose type is an artifact type must name a valid artifact id; external targets are allowed. */
function checkReference(r: Reference, where: string): void {
	if (isArtifactIdKind(r.type) && ArtifactIds.parse(r.entityId) === undefined) {
		throw new ArtifactShapeError(`${where} names '${r.entityId}', which is not a valid ${r.type} artifact id`);
	}
}

/** A store whose journal lives in memory and does not survive a restart. For tests only. */
export function createNonDurableStore(deps: Omit<ArtifactStoreDeps, 'journal'>): ArtifactStore {
	return new ArtifactStore({ ...deps, journal: createMemoryJournal() });
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
				if (isObject(parent) && typeof parent['type'] === 'string' && typeof parent['relation'] === 'string' && parent['entityId'] === id) children.push(childId);
			} catch (err) {
				log.warn({ id: childId, err: (err as Error).message }, 'skipped an unreadable head while listing children');
			}
		}
		return children.sort();
	}
	/**
	 * Store the whole envelope. Any operation the journal still holds for this id is completed first. Then the
	 * head is prepared (the revision and exact bytes are known before a file changes), the operation is staged
	 * with its change log entry, the entry is appended, the head replaced and the journal cleared.
	 */
	async write(a: Artifact<HeadPayload>, by: Actor): Promise<void> {
		// One write at a time per artifact in this process: recovery, stage, append and replace must not interleave.
		const lockKey = `${this.deps.repoPath}\0${a.id}`;
		const previous = WRITE_QUEUES.get(lockKey) ?? Promise.resolve();
		const run = previous.then(() => this.writeUnlocked(a, by));
		const tail = run.catch(() => undefined);
		WRITE_QUEUES.set(lockKey, tail);
		try { await run; }
		finally { if (WRITE_QUEUES.get(lockKey) === tail) WRITE_QUEUES.delete(lockKey); }
	}

	private async writeUnlocked(a: Artifact<HeadPayload>, by: Actor): Promise<void> {
		const key = ArtifactIds.parse(a.id);
		if (key === undefined) throw new InvalidArtifactKeyError(`'${a.id}' is not an artifact id`);
		if (typeof by?.id !== 'string' || !ACTOR_ID.test(by.id) || by.id !== by.id.toLowerCase()) {
			throw new ArtifactShapeError(`the actor '${String(by?.id)}' has no namespaced lower-case id such as github:alice`);
		}
		this.checkLinks(a, key);
		const codec = codecFor(key.kind);

		const path = artifactJsonPath(this.deps.repoPath, a.id);
		await this.completePending(a.id, path);

		const priorBytes = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
		const prior = priorBytes === undefined ? undefined : decodeArtifactHead(a.id, priorBytes);
		const contentChanged = prior === undefined
			|| a.description !== prior.artifact.description
			|| canonical(a.payload.body) !== canonical(prior.artifact.payload.body)
			|| canonical(a.payload.citations) !== canonical(prior.artifact.payload.citations);
		const kind = contentChanged ? 'content' : 'meta-only';
		const priorRevision = prior === undefined ? 0 : prior.artifact.lifecycle.revision.number;

		// The base head (and, on a create, its creation context) is built once, so both preparations see the same identity meta.
		const base: HeadFile = prior === undefined
			? codec.encode(a.payload, key, (this.deps.contexts ?? creationContextProvider(this.deps.repoPath, { now: this.deps.now }))(key))
			: { ...prior.head, meta: prior.head.meta, body: a.payload.body, citations: a.payload.citations };
		const build = (revisionNumber: number): HeadFile => {
			const envelope = {
				description: a.description,
				...(a.parent !== undefined ? { parent: a.parent } : {}),
				references:  a.references,
				...(a.binding !== undefined ? { binding: a.binding } : {}),
				attachments: a.attachments,
			};
			const lifecycle = { ...a.lifecycle, revision: { ...a.lifecycle.revision, number: revisionNumber } };
			return { ...base, meta: { ...base.meta, envelope, lifecycle } };
		};
		// The revision depends on the bytes and the bytes carry the revision: prepare once for the number, once with it.
		const first = prepareArtifactWrite(path, build(priorRevision), kind);
		const prepared = prepareArtifactWrite(path, build(first.revision), kind);
		if (priorBytes === prepared.bytes) return;       // nothing changes: no staged operation, no log entry

		const operationId = createHash('sha256').update(`${a.id}\n${priorRevision}\n${prepared.bytes}`).digest('hex').slice(0, 32);
		const entry: ChangeLogEntry = {
			id: operationId,
			actor: by,
			timestamp: (this.deps.now ?? (() => new Date()))().toISOString(),
			operation: prior === undefined ? 'create' : 'update',
			revision: { number: prepared.revision, contentHash: a.lifecycle.revision.contentHash },
		};
		const op: StagedOperation = { operationId, priorRevision, bytes: prepared.bytes, entry };

		await this.deps.journal.stage(a.id, op);
		await this.deps.history.appendLog(a.id, entry);
		try { (this.deps.writeHead ?? writeAtomic)(path, prepared.bytes); }
		catch (err) {
			log.warn({ id: a.id, operationId, err: (err as Error).message }, 'the head replace failed; the staged operation is finished by the next write');
			throw err;
		}
		await this.clearQuietly(a.id, operationId);
	}

	/** Finish the operation the journal holds for `id`: append its entry if the log lacks it, replace the head if it differs, clear. */
	private async completePending(id: string, path: string): Promise<void> {
		const op = await this.deps.journal.pending(id);
		if (op === undefined) return;
		const entries = await this.deps.history.log(id);
		if (!entries.some(e => e.id === op.entry.id)) await this.deps.history.appendLog(id, op.entry);
		const current = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
		if (current !== op.bytes) (this.deps.writeHead ?? writeAtomic)(path, op.bytes);
		await this.clearQuietly(id, op.operationId);
	}

	private async clearQuietly(id: string, operationId: string): Promise<void> {
		try { await this.deps.journal.clear(id, operationId); }
		catch (err) { log.warn({ id, operationId, err: (err as Error).message }, 'clearing the journal failed after the head was replaced; the next write only clears it'); }
	}

	private checkLinks(a: Artifact<HeadPayload>, key: ArtifactKey): void {
		if (a.parent !== undefined) {
			const parentKey = ArtifactIds.parse(a.parent.entityId);
			if (parentKey === undefined) throw new ArtifactShapeError(`the parent of ${a.id} is '${a.parent.entityId}', which is not an artifact id`);
			if (a.parent.relation !== 'derived-from') throw new ArtifactShapeError(`the parent of ${a.id} has relation '${a.parent.relation}', not derived-from`);
			const expected = ArtifactIds.parentOf(key);
			if (expected !== undefined && ArtifactIds.make(expected) !== a.parent.entityId) {
				throw new ArtifactShapeError(`the parent of ${a.id} has to be ${ArtifactIds.make(expected)}, not ${a.parent.entityId}`);
			}
		}
		for (const r of a.references) checkReference(r, `a reference of ${a.id}`);
		for (const t of a.attachments) checkReference(t.target, `an attachment of ${a.id}`);
		if (a.binding !== undefined) {
			checkReference(a.binding.reference, `the binding of ${a.id}`);
			if (a.binding.pendingLink !== undefined) {
				checkReference(a.binding.pendingLink.parent, `the pending link of ${a.id}`);
				if (a.binding.pendingLink.child !== undefined) checkReference(a.binding.pendingLink.child, `the pending link of ${a.id}`);
			}
		}
	}
}
