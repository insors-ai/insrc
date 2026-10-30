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

import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ArtifactIds, InvalidArtifactKeyError, isArtifactIdKind } from '../artifact-ids.js';
import type { ArtifactKey } from '../artifact-ids.js';
import { ARTIFACTS_DIR, artifactJsonPath, prepareArtifactWrite, writeAtomic } from '../storage.js';
import { getLogger } from '../../shared/logger.js';
import { codecFor, creationContextProvider } from './codecs.js';
import type { CreationContextProvider, HeadFile, HeadPayload } from './codecs.js';
import { decodeArtifactHead, isActor, isAttachment, isBinding } from './decode.js';
import { validateLogEntry } from './history.js';
import { checkSidecarEntrySize } from './sidecar.js';
import type { History } from './history.js';
import { createMemoryJournal, headHashOf } from './journal.js';
import type { StagedOperation, WriteJournal } from './journal.js';
import { TERMINAL, assertLegalStatusChange, checkHeadIntegrity, checkIntegrity, isLifecycleOperation } from './lifecycle.js';
import { ArtifactNotFoundError, ArtifactShapeError, HistoryEntryError, IllegalTransitionError, LifecycleConflictError } from './types.js';
import type { Actor, Artifact, ChangeLogEntry, Feedback, Operation, Reference } from './types.js';

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

/** What `update`'s mutate hands back: the artifact to store and the options of its log entry. */
export interface UpdateResult {
	readonly next:     Artifact<HeadPayload>;
	readonly options?: WriteOptions | undefined;
}

/** The prepared head text with its lifecycle status set to completed. */
function completedBytes(bytes: string): string {
	const head = JSON.parse(bytes) as { meta: { lifecycle: Record<string, unknown> } };
	head.meta.lifecycle['status'] = 'completed';
	return JSON.stringify(head, null, 2) + '\n';
}

/** The head text with its revision (the file's and the lifecycle's) set to `number`: a conflict resolution moves the head past the log. */
function revisedBytes(bytes: string, number: number): string {
	const head = JSON.parse(bytes) as { meta: { revision?: number; lifecycle: { revision: Record<string, unknown> } } };
	head.meta.revision = number;
	head.meta.lifecycle.revision['number'] = number;
	return JSON.stringify(head, null, 2) + '\n';
}

/** What a caller can say about the change log entry of a write. */
export interface WriteOptions {
	/** The log operation; create or update when absent. A lifecycle operation must match the status change it makes. */
	readonly operation?:  Operation | undefined;
	readonly outcome?:    ChangeLogEntry['outcome'] | undefined;
	readonly references?: readonly Reference[] | undefined;
	readonly addresses?:  'all' | readonly string[] | undefined;
	/** Lets `complete` start from any non-terminal status: a unit's completion freezes its dependent records. */
	readonly cascade?:    boolean | undefined;
}

/** The writes in flight, one queue per repository and artifact, shared by every store instance in the process. */
const WRITE_QUEUES = new Map<string, Promise<unknown>>();

const ACTOR_ID = /^[a-z][a-z0-9-]*:\S+$/;

/** A reference whose type is an artifact type must name a valid artifact id; external targets are allowed. */
function checkReference(r: Reference, where: string): void {
	if (!isArtifactIdKind(r.type)) return;
	if (ArtifactIds.parse(r.entityId)?.kind !== r.type) {
		throw new ArtifactShapeError(`${where} names '${r.entityId}', which is not a valid ${r.type} artifact id`);
	}
}

/** A store whose journal lives in memory and does not survive a restart. For tests only. */
export function createNonDurableStore(deps: Omit<ArtifactStoreDeps, 'journal'>): ArtifactStore {
	return new ArtifactStore({ ...deps, journal: createMemoryJournal() });
}

export class ArtifactStore {
	constructor(private readonly deps: ArtifactStoreDeps) {}

	/** The history this store writes its log entries through, for a writer that appends a revision-less entry of its own under {@link exclusive}. */
	get history(): History { return this.deps.history; }

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
		return (await this.scanChildren(id)).children;
	}

	/** The readable children of `id` and every head that could not be read, so a roll-up can refuse instead of counting it as absent. */
	async childrenOfStrict(id: string): Promise<{ children: string[]; unreadable: string[] }> {
		return this.scanChildren(id);
	}

	private async scanChildren(id: string): Promise<{ children: string[]; unreadable: string[] }> {
		if (ArtifactIds.parse(id) === undefined) throw new InvalidArtifactKeyError(`'${id}' is not an artifact id`);
		const dir = join(this.deps.repoPath, ARTIFACTS_DIR);
		if (!existsSync(dir)) return { children: [], unreadable: [] };
		const children: string[] = [];
		const unreadable: string[] = [];
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
				unreadable.push(childId);
				log.warn({ id: childId, err: (err as Error).message }, 'skipped an unreadable head while listing children');
			}
		}
		return { children: children.sort(), unreadable: unreadable.sort() };
	}

	/**
	 * Store the whole envelope. Any operation the journal still holds for this id is completed first. Then the
	 * head is prepared (the revision and exact bytes are known before a file changes), the operation is staged
	 * with its change log entry, the entry is appended, the head replaced and the journal cleared.
	 */
	async write(a: Artifact<HeadPayload>, by: Actor, options: WriteOptions = {}): Promise<void> {
		await this.enqueue(a.id, () => this.writeUnlocked(a, by, options));
	}

	/**
	 * Read, change and write one artifact with no other write to it in between. The per-artifact queue is held across the
	 * read, the (possibly asynchronous) `mutate` and the write; an operation the journal still holds is finished before
	 * the head or the history is read. `mutate` returns the artifact to store (with the options of its log entry), or
	 * undefined when there is nothing to do; when it throws, nothing is written. Answers whether a write was made.
	 */
	async update(
		id: string, by: Actor,
		mutate: (current: Artifact<HeadPayload> & { readonly changeLog: ChangeLogEntry[] }) => Promise<UpdateResult | undefined> | UpdateResult | undefined,
		options: WriteOptions = {},
	): Promise<boolean> {
		return (await this.updateAndLog(id, by, mutate, options)).wrote;
	}

	/** {@link update}, answering also the change log entry the write appended (undefined when it appended none), captured under the queue. */
	async updateAndLog(
		id: string, by: Actor,
		mutate: (current: Artifact<HeadPayload> & { readonly changeLog: ChangeLogEntry[] }) => Promise<UpdateResult | undefined> | UpdateResult | undefined,
		options: WriteOptions = {},
	): Promise<{ readonly wrote: boolean; readonly entry?: ChangeLogEntry | undefined }> {
		if (ArtifactIds.parse(id) === undefined) throw new InvalidArtifactKeyError(`'${id}' is not an artifact id`);
		return this.enqueue(id, async () => {
			await this.completePending(id, artifactJsonPath(this.deps.repoPath, id));
			const current = { ...(await this.read(id)), changeLog: await this.deps.history.log(id) };
			const result = await mutate(current);
			if (result === undefined) return { wrote: false };
			if (result.next.id !== id) throw new ArtifactShapeError(`update of ${id} was given the artifact ${result.next.id}`);
			const entry = await this.writeUnlocked(result.next, by, { ...options, ...(result.options ?? {}) });
			return { wrote: true, entry };
		});
	}

	/**
	 * Finish the operation the journal still holds for `id`, under the artifact's queue. For a reader that has to see the
	 * head and the log agree (a crash between the log append and the head replace leaves them apart). Refuses with
	 * LifecycleConflictError when the head moved on after the write was staged.
	 */
	async finishPending(id: string): Promise<void> {
		if (ArtifactIds.parse(id) === undefined) throw new InvalidArtifactKeyError(`'${id}' is not an artifact id`);
		await this.enqueue(id, () => this.completePending(id, artifactJsonPath(this.deps.repoPath, id)));
	}

	/**
	 * Run `run` with no write to `id` in between, on the same per-artifact queue as write, update and finishPending. For a
	 * check-then-append on the artifact's history that has to be atomic within the process. `run` must not call write or
	 * update on the same artifact: it would wait for itself.
	 */
	async exclusive<T>(id: string, run: () => Promise<T>): Promise<T> {
		if (ArtifactIds.parse(id) === undefined) throw new InvalidArtifactKeyError(`'${id}' is not an artifact id`);
		return this.enqueue(id, run);
	}

	/** One write at a time per artifact in this process: recovery, stage, append and replace must not interleave. */
	private async enqueue<T>(id: string, run: () => Promise<T>): Promise<T> {
		const lockKey = `${this.deps.repoPath}\0${id}`;
		const previous = WRITE_QUEUES.get(lockKey) ?? Promise.resolve();
		const next = previous.then(run);
		const tail = next.catch(() => undefined);
		WRITE_QUEUES.set(lockKey, tail);
		try { return await next; }
		finally { if (WRITE_QUEUES.get(lockKey) === tail) WRITE_QUEUES.delete(lockKey); }
	}

	private async writeUnlocked(a: Artifact<HeadPayload>, by: Actor, options: WriteOptions): Promise<ChangeLogEntry | undefined> {
		const key = ArtifactIds.parse(a.id);
		if (key === undefined) throw new InvalidArtifactKeyError(`'${a.id}' is not an artifact id`);
		if (typeof by?.id !== 'string' || !ACTOR_ID.test(by.id) || by.id !== by.id.toLowerCase()) {
			throw new ArtifactShapeError(`the actor '${String(by?.id)}' has no namespaced lower-case id such as github:alice`);
		}
		if (!isActor(by)) throw new ArtifactShapeError(`the actor '${by.id}' needs a kind (person, agent or system) and a properties object`);
		this.checkLinks(a, key);
		if (typeof a.payload?.body !== 'object' || a.payload.body === null || Array.isArray(a.payload.body) || !Array.isArray(a.payload.citations)) {
			throw new ArtifactShapeError(`the payload of ${a.id} needs a body object and a citations list`);
		}
		const codec = codecFor(key.kind);

		const path = artifactJsonPath(this.deps.repoPath, a.id);
		await this.completePending(a.id, path, options.outcome?.result === 'conflict-resolved');

		const priorBytes = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
		const prior = priorBytes === undefined ? undefined : decodeArtifactHead(a.id, priorBytes);
		const priorRevision = prior === undefined ? 0 : prior.artifact.lifecycle.revision.number;

		const operation = options.operation ?? (prior === undefined ? 'create' : 'update');
		if (options.operation !== undefined && options.operation !== 'create' && options.operation !== 'update' && !isLifecycleOperation(options.operation)) {
			throw new ArtifactShapeError(`'${options.operation}' is a content operation that a write cannot log; use create, update or a lifecycle operation`);
		}
		// An ordinary write on a head whose stored hash differs from its content is refused; a conflict-resolved write adopts the head's content.
		const resolving = options.outcome?.result === 'conflict-resolved';
		// After a merge the union of both clones' log lines can be ahead of the head git kept; only an explicit conflict
		// resolution may write over that, because a matching head hash does not show the log was reconciled. The
		// resolution moves the head's revision past the log's, so the head and the log agree again afterwards.
		let revisionFloor: number | undefined;
		if (prior !== undefined) {
			const view = { description: prior.artifact.description, payload: prior.artifact.payload, lifecycle: prior.artifact.lifecycle };
			const log = await this.deps.history.log(a.id);
			const tail = [...log].reverse().find(e => e.revision !== undefined);
			if (!resolving) {
				const integrity = checkIntegrity(view, log);
				if (!integrity.ok && integrity.reason !== 'head-ahead-of-log') throw new LifecycleConflictError(a.id, integrity.reason);
			} else if (tail?.revision !== undefined && tail.revision.number > prior.artifact.lifecycle.revision.number) {
				revisionFloor = tail.revision.number + 1;
			}
		}
		const source = resolving && prior !== undefined ? { ...a, description: prior.artifact.description, payload: prior.artifact.payload } : a;

		// The base head (and, on a create, its creation context) is built once, so the preparation sees the identity meta.
		const base: HeadFile = prior === undefined
			? codec.encode(source.payload, key, (this.deps.contexts ?? creationContextProvider(this.deps.repoPath, { now: this.deps.now }))(key))
			: { ...prior.head, meta: prior.head.meta, body: source.payload.body, citations: source.payload.citations };
		const envelope = {
			description: source.description,
			...(source.parent !== undefined ? { parent: source.parent } : {}),
			references:  source.references,
			...(source.binding !== undefined ? { binding: source.binding } : {}),
			attachments: source.attachments,
		};
		const timestamp = (this.deps.now ?? (() => new Date()))().toISOString();
		// prepareArtifactWrite reconciles meta.lifecycle: the hash and number follow the content, and a content change returns the head to draft.
		// A cascading complete is prepared at the status the head already has (the closed table has no step into completed from every
		// status) and given its completed status afterwards, once everything else has been reconciled.
		const cascadeFrom = options.cascade === true && operation === 'complete' && prior !== undefined && !TERMINAL.includes(prior.artifact.lifecycle.status)
			? prior.artifact.lifecycle.status : undefined;
		const lifecycle = cascadeFrom === undefined ? source.lifecycle : { ...source.lifecycle, status: cascadeFrom };
		const reconciled = prepareArtifactWrite(path, { ...base, meta: { ...base.meta, envelope, lifecycle } }, 'content', { by, at: timestamp });
		// A cascading complete freezes a member as it is: it may not carry a content change, which would have returned the head to draft.
		if (cascadeFrom !== undefined && reconciled.contentChanged && prior !== undefined) {
			throw new IllegalTransitionError(`${a.id} cannot be completed with a content change`);
		}
		const completed = cascadeFrom === undefined ? reconciled : { ...reconciled, bytes: completedBytes(reconciled.bytes) };
		const prepared = revisionFloor !== undefined && completed.revision < revisionFloor
			? { ...completed, bytes: revisedBytes(completed.bytes, revisionFloor), revision: revisionFloor } : completed;
		const stored = decodeArtifactHead(a.id, prepared.bytes).artifact.lifecycle;
		const from = prior?.artifact.lifecycle.status;
		if (from !== undefined && isLifecycleOperation(operation)) assertLegalStatusChange(from, stored.status, operation, options.cascade === true);
		if (priorBytes === prepared.bytes) return undefined;       // nothing changes: no staged operation, no log entry

		// The addresses rule: a revision (an update that moves the revision number) addresses all open feedback unless the writer
		// lists some; a list may name only open roots; an update that moves no revision and a lifecycle operation address nothing.
		const addresses = options.addresses !== undefined ? options.addresses
			: operation === 'update' && prior !== undefined && prepared.revision > priorRevision ? 'all' as const : undefined;
		if (Array.isArray(addresses)) await this.checkAddresses(a.id, addresses);
		// A fresh id per staged operation, so the same transition made twice (references A to B, back to A, to B again)
		// is logged twice. A retry does not mint another: it finds the staged operation in the journal and reuses its id.
		const operationId = randomUUID().replace(/-/g, '');
		const entry: ChangeLogEntry = {
			id: operationId,
			actor: by,
			timestamp,
			operation,
			revision: { number: prepared.revision, contentHash: stored.revision.contentHash },
			...(from !== undefined && from !== stored.status ? { status: { from, to: stored.status } } : {}),
			...(options.outcome !== undefined ? { outcome: options.outcome } : {}),
			...(options.references !== undefined ? { references: options.references } : {}),
			...(addresses !== undefined ? { addresses } : {}),
		};
		// Never stage what a later read or append would refuse: it would block every later write of this artifact.
		validateLogEntry(entry);
		checkSidecarEntrySize({ artifactId: a.id, entry });
		decodeArtifactHead(a.id, prepared.bytes);
		const op: StagedOperation = { operationId, priorRevision, priorHeadHash: headHashOf(priorBytes), bytes: prepared.bytes, entry };

		await this.deps.journal.stage(a.id, op);
		await this.deps.history.appendLog(a.id, entry);
		try { (this.deps.writeHead ?? writeAtomic)(path, prepared.bytes); }
		catch (err) {
			log.warn({ id: a.id, operationId, err: (err as Error).message }, 'the head replace failed; the staged operation is finished by the next write');
			throw err;
		}
		await this.clearQuietly(a.id, operationId);
		return entry;
	}

	/** Refuse a list of feedback ids that are not open roots of this artifact (unknown, a reply, or already addressed by an earlier revision). */
	private async checkAddresses(id: string, listed: readonly string[]): Promise<void> {
		const open = new Set((await this.deps.history.openFeedback(id)).filter(f => f.inReplyTo === undefined).map(f => f.id));
		const bad = [...new Set(listed.filter(x => !open.has(x)))];
		if (bad.length > 0) throw new HistoryEntryError(`${id}: addresses names feedback that is not open at the root of this artifact: ${bad.join(', ')}`);
	}

	/**
	 * Finish the operation the journal holds for `id`: append its entry if the log lacks it, replace the head if it differs, clear.
	 * The head is replaced only while it still hashes to the head the write started from; a head that moved on is never
	 * overwritten and the journal file is kept. A staged entry the log would refuse is discarded, or it would block every later write.
	 */
	private async completePending(id: string, path: string, resolving = false): Promise<void> {
		const op = await this.deps.journal.pending(id);
		if (op === undefined) return;
		try {
			validateLogEntry(op.entry);
			checkSidecarEntrySize({ artifactId: id, entry: op.entry });
		} catch (err) {
			log.warn({ id, operationId: op.operationId, err: (err as Error).message }, 'discarding a staged operation whose entry is invalid');
			await this.deps.journal.clear(id, op.operationId);
			return;
		}
		const current = existsSync(path) ? readFileSync(path, 'utf8') : undefined;
		const replace = current !== op.bytes;
		if (replace && headHashOf(current) !== op.priorHeadHash) {
			log.warn({ id, operationId: op.operationId, priorHeadHash: op.priorHeadHash, stagedHeadHash: headHashOf(op.bytes), currentHeadHash: headHashOf(current) },
				'the head moved on after the write was staged; it is not overwritten');
			if (resolving) {
				// A person has resolved the conflict: the staged write is dropped (never applied) so the artifact is not blocked for good.
				log.warn({ id, operationId: op.operationId }, 'discarding a staged write over a head that moved on: the write is a conflict resolution');
				await this.deps.journal.clear(id, op.operationId);
				return;
			}
			throw new LifecycleConflictError(id, 'head-changed-after-stage', `${id} changed after a write was staged (operation ${op.operationId}); the staged write was not applied and a person has to resolve it`);
		}
		const entries = await this.deps.history.log(id);
		if (!entries.some(e => e.id === op.entry.id)) await this.deps.history.appendLog(id, op.entry);
		if (replace) (this.deps.writeHead ?? writeAtomic)(path, op.bytes);
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
		// A store write of an existing head keeps the binding and attachments already on disk (carryBinding), so a malformed one
		// is refused here rather than silently dropped.
		if (!a.attachments.every(isAttachment)) throw new ArtifactShapeError(`an attachment of ${a.id} is malformed`);
		if (a.binding !== undefined && !isBinding(a.binding)) throw new ArtifactShapeError(`the binding of ${a.id} is malformed`);
		if (a.binding !== undefined) {
			checkReference(a.binding.reference, `the binding of ${a.id}`);
			if (a.binding.pendingLink !== undefined) {
				checkReference(a.binding.pendingLink.parent, `the pending link of ${a.id}`);
				if (a.binding.pendingLink.child !== undefined) checkReference(a.binding.pendingLink.child, `the pending link of ${a.id}`);
			}
		}
	}
}
