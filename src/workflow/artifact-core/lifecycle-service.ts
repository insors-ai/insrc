/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LifecycleService (sc4, owned by s3): applies one lifecycle operation at a time to a stored artifact and walks a finished
 * Task or Story up to the Story and Epic it completes. Every change goes through `ArtifactStore.update`, so the read of the
 * head and its log, the checks and the write cannot be interleaved with another writer of the same artifact.
 */

import { ArtifactIds } from '../artifact-ids.js';
import { getLogger } from '../../shared/logger.js';
import { checkIntegrity, isLifecycleOperation, nextLifecycle, rollUp, unitMembers } from './lifecycle.js';
import type { ChildStatusReader, CompletionEvidence, Integrity, TransitionDetail } from './lifecycle.js';
import type { HeadPayload } from './codecs.js';
import type { ArtifactStore, WriteOptions } from './store.js';
import {
	ArtifactNotFoundError, IllegalTransitionError, LifecycleConflictError,
} from './types.js';
import type { Actor, ChangeLogEntry, Lifecycle, Operation, Reference, Status } from './types.js';
import { emptyLifecycle } from './decode.js';

const log = getLogger('lifecycle-service');

/** What one call knows that the service does not: the override reason the approval in hand carries. */
export interface EvidenceContext {
	readonly overrideReview?: string | undefined;
}

export interface LifecycleServiceDeps {
	readonly store:    ArtifactStore;
	/** The evidence, or a factory that builds it per call from the call's context (the approval's override reason). */
	readonly evidence: CompletionEvidence | ((ctx: EvidenceContext) => CompletionEvidence);
	readonly now?:     (() => Date) | undefined;
}

/** What a content write can say about its change log entry, and whether it may create the head. */
export interface ContentWriteOptions {
	readonly outcome?:    ChangeLogEntry['outcome'] | undefined;
	readonly references?: readonly Reference[] | undefined;
	/** Create the artifact through the store when it has no head yet. */
	readonly create?:     boolean | undefined;
	/** The feedback roots this revision addresses; absent means all of them when the revision moves. */
	readonly addresses?:  'all' | readonly string[] | undefined;
}

export interface ApplyResult {
	readonly lifecycle: Lifecycle;
	readonly entry:     ChangeLogEntry;
	/** False when the operation was `complete` and a complete entry already stands. */
	readonly recorded:  boolean;
}

/** Operations whose result is only trusted when the head and its log agree. */
const INTEGRITY_CHECKED: readonly Operation[] = ['approve', 'review', 'complete'];

const UNITS = ['TASK', 'STORY', 'EPIC'] as const;

export class LifecycleService {
	private readonly reader: ChildStatusReader;

	/** The store every operation goes through. */
	get store(): ArtifactStore { return this.deps.store; }

	constructor(private readonly deps: LifecycleServiceDeps) {
		const store = deps.store;
		this.reader = {
			childrenOfStrict: id => store.childrenOfStrict(id),
			statusOf: async id => {
				try { return (await store.read(id)).lifecycle.status; }
				catch (err) { if (err instanceof ArtifactNotFoundError) return undefined; throw err; }
			},
		};
	}

	/** Apply one lifecycle operation. Writes and logs nothing when it throws before the write. */
	async apply(id: string, op: Operation, by: Actor, detail: TransitionDetail = {}, ctx: EvidenceContext = {}): Promise<ApplyResult> {
		const evidence = this.evidenceFor(ctx);
		if (!isLifecycleOperation(op)) throw new IllegalTransitionError(`'${op}' is a content operation, not a lifecycle operation`);
		const store = this.deps.store;
		const key = ArtifactIds.parse(id);
		const isUnit = key !== undefined && (UNITS as readonly string[]).includes(key.kind);
		let standing: { lifecycle: Lifecycle; entry: ChangeLogEntry } | undefined;
		let written: Lifecycle | undefined;

		const { entry } = await store.updateAndLog(id, by, async current => {
			const { changeLog, ...head } = current;

			if (INTEGRITY_CHECKED.includes(op)) {
				const integrity = checkIntegrity({ description: head.description, payload: head.payload, lifecycle: head.lifecycle }, changeLog);
				if (!integrity.ok) throw new LifecycleConflictError(id, integrity.reason);
			}

			if (op === 'complete') {
				const done = this.standingCompletion(changeLog);
				if (done !== undefined && head.lifecycle.status === 'completed') { standing = { lifecycle: head.lifecycle, entry: done }; return undefined; }
				if (isUnit && (await rollUp(id, this.reader, evidence)) !== 'completed') {
					throw new IllegalTransitionError(`${id} cannot be completed: its completion condition is not met`);
				}
			}
			if (op === 'reopen' && isUnit) await this.checkParentOpen(id);

			// The unit's own transition is validated before any member is touched, so a refusal leaves everything as it was.
			// A unit is completed by its roll-up, which stands in for the approval a record needs, so it may start from any open status.
			const cascade = op === 'complete' && isUnit;
			const lifecycle = nextLifecycle(head, op, by, this.at(), cascade ? { ...detail, cascade } : detail);

			let members: string[] = [];
			if (isUnit && key !== undefined && key.kind !== 'TASK' && (op === 'complete' || op === 'reopen')) {
				members = await unitMembers(id, this.reader);
			}
			let outcome: WriteOptions['outcome'];
			if (op === 'complete') {
				for (const member of members) await this.completeMember(member, id, by);
				outcome = await this.completionOutcome(id, evidence);
			} else if (op === 'reopen') {
				for (const member of members) await this.reopenMember(member, id, by);
			} else if (op === 'approve' && detail.override !== undefined) {
				outcome = { result: 'override', summary: detail.override.reason };
			} else if ((op === 'reject' || op === 'ack-stale' || op === 'withdraw') && detail.reason !== undefined) {
				// the reason is the whole point of the entry: the head keeps no copy of it
				outcome = { result: op === 'reject' ? 'rejected' : op === 'ack-stale' ? 'acknowledged' : 'withdrawn', summary: detail.reason };
			} else if (op === 'review' && detail.review !== undefined) {
				const counts = detail.review.counts;
				outcome = { result: detail.review.verdict, summary: `reviewed by the ${detail.review.party}: ${detail.review.verdict}`, data: { counts } };
			}

			written = lifecycle;
			return {
				next: { ...head, lifecycle },
				options: {
					operation: op,
					...(cascade ? { cascade } : {}),
					...(outcome !== undefined ? { outcome } : {}),
					...(detail.request !== undefined ? { references: [detail.request] } : {}),
				},
			};
		});

		if (standing !== undefined) return { ...standing, recorded: false };
		if (entry !== undefined && written !== undefined) {
			// the store reconciles the revision on the way in; the entry carries the number and hash it stored
			const stored = entry.revision === undefined ? written : { ...written, revision: { ...written.revision, ...entry.revision } };
			return { lifecycle: stored, entry, recorded: true };
		}
		// the write appended nothing (the head already was what the operation makes it): answer from the stored head and log
		const stored = await store.readWithHistory(id);
		const last = stored.changeLog[stored.changeLog.length - 1];
		if (last === undefined) throw new IllegalTransitionError(`${id} has no change log entry after ${op}`);
		return { lifecycle: stored.lifecycle, entry: last, recorded: true };
	}

	/**
	 * Starting at `id`, complete every unit whose roll-up is true: a Task, then its Story, then its Epic. A unit whose roll-up is
	 * not true is left alone and stops the walk; so does a unit with no head. Answers the ids completed by this call.
	 */
	async completeIfRolledUp(id: string, by: Actor, ctx: EvidenceContext = {}): Promise<{ completed: string[] }> {
		const evidence = this.evidenceFor(ctx);
		const completed: string[] = [];
		let next: string | undefined = id;
		while (next !== undefined) {
			const key = ArtifactIds.parse(next);
			if (key === undefined) throw new IllegalTransitionError(`'${next}' is not an artifact id`);
			if ((await rollUp(next, this.reader, evidence)) !== 'completed') break;
			const status = await this.reader.statusOf(next);
			if (status === undefined || status === 'withdrawn' || status === 'superseded') break;
			if (status !== 'completed') {
				const result = await this.apply(next, 'complete', by, {}, ctx);
				if (result.recorded) completed.push(next);
			}
			const parent = ArtifactIds.parentOf(key);
			next = parent === undefined ? undefined : ArtifactIds.make(parent);
		}
		return { completed };
	}

	/**
	 * The status of a head and whether it and its log agree (the full check, against the last revision-bearing entry);
	 * undefined when there is no head.
	 */
	async inspect(id: string): Promise<{ readonly status: Status; readonly integrity: Integrity; readonly lifecycle: Lifecycle } | undefined> {
		try {
			await this.deps.store.finishPending(id);
			const stored = await this.deps.store.readWithHistory(id);
			const integrity = checkIntegrity({ description: stored.description, payload: stored.payload, lifecycle: stored.lifecycle }, stored.changeLog);
			return { status: stored.lifecycle.status, integrity, lifecycle: stored.lifecycle };
		} catch (err) {
			if (err instanceof ArtifactNotFoundError) return undefined;
			throw err;
		}
	}

	/**
	 * Replace the content (body and citations) of a stored artifact, through the store: the change is staged, logged with its
	 * revision and applied under the per-artifact queue, and a content change returns a non-terminal head to draft. For the
	 * writers (the BUILD record hook, the review auto-fix, the round records) that used to rewrite a head behind the store's back.
	 * `outcome` and `references` ride on the change log entry. With `create`, a missing head is created through the store, so the
	 * first round of a record is logged like every later one.
	 */
	async updateContent(id: string, by: Actor, payload: HeadPayload, opts: ContentWriteOptions = {}): Promise<boolean> {
		const options = { operation: 'update' as const, ...(opts.outcome !== undefined ? { outcome: opts.outcome } : {}), ...(opts.references !== undefined ? { references: opts.references } : {}), ...(opts.addresses !== undefined ? { addresses: opts.addresses } : {}) };
		try {
			return await this.deps.store.update(id, by, current => {
				const { changeLog: _log, ...head } = current;
				return { next: { ...head, payload }, options };
			});
		} catch (err) {
			if (!(err instanceof ArtifactNotFoundError) || opts.create !== true) throw err;
		}
		await this.deps.store.write(
			{ id, description: '', references: [], attachments: [], lifecycle: emptyLifecycle(0), payload },
			by,
			{ ...(opts.outcome !== undefined ? { outcome: opts.outcome } : {}), ...(opts.references !== undefined ? { references: opts.references } : {}) },
		);
		return true;
	}

	private evidenceFor(ctx: EvidenceContext): CompletionEvidence {
		return typeof this.deps.evidence === 'function' ? this.deps.evidence(ctx) : this.deps.evidence;
	}

	private at(): string { return (this.deps.now ?? (() => new Date()))().toISOString(); }

	/** The last complete entry that no later reopen undid. */
	private standingCompletion(changeLog: readonly ChangeLogEntry[]): ChangeLogEntry | undefined {
		for (let i = changeLog.length - 1; i >= 0; i--) {
			const e = changeLog[i];
			if (e?.operation === 'reopen') return undefined;
			if (e?.operation === 'complete') return e;
		}
		return undefined;
	}

	/** The outcome of a unit's complete entry; it carries the code-review override reason when the review was overridden. */
	private async completionOutcome(id: string, evidence: CompletionEvidence): Promise<NonNullable<WriteOptions['outcome']>> {
		const key = ArtifactIds.parse(id);
		if (key?.kind === 'STORY' && key.story !== undefined) {
			const review = await evidence.storyCodeReview(key.epicHash, key.story);
			if (review.kind === 'overridden') {
				return { result: 'completed', summary: `completed with a code-review override: ${review.overrideReason ?? ''}`, data: { codeReviewOverride: review.overrideReason ?? '' } };
			}
		}
		return { result: 'completed', summary: 'completed' };
	}

	/** Complete one member with its unit; a member with no head or already terminal is skipped. */
	private async completeMember(member: string, unit: string, by: Actor): Promise<void> {
		await this.deps.store.update(member, by, current => {
			if (['completed', 'withdrawn', 'superseded'].includes(current.lifecycle.status)) return undefined;
			const { changeLog, ...head } = current;
			// A member is held to the same check as the unit: its head and its log have to agree before it is frozen.
			const integrity = checkIntegrity({ description: head.description, payload: head.payload, lifecycle: head.lifecycle }, changeLog);
			if (!integrity.ok) throw new LifecycleConflictError(member, integrity.reason);
			return {
				next: { ...head, lifecycle: nextLifecycle(head, 'complete', by, this.at(), { cascade: true }) },
				options: { operation: 'complete', cascade: true, outcome: { result: 'completed', summary: `completed with ${unit}`, data: { frozenBy: unit } } },
			};
		}).catch(err => { if (err instanceof ArtifactNotFoundError) return false; throw err; });
	}

	/** Reopen a member that the completion of `unit` froze. */
	private async reopenMember(member: string, unit: string, by: Actor): Promise<void> {
		await this.deps.store.update(member, by, current => {
			if (current.lifecycle.status !== 'completed') return undefined;
			const last = [...current.changeLog].reverse().find(e => e.operation === 'complete' || e.operation === 'reopen');
			const data = last?.operation === 'complete' ? last.outcome?.data : undefined;
			if (typeof data !== 'object' || data === null || (data as { frozenBy?: unknown }).frozenBy !== unit) return undefined;
			const { changeLog: _log, ...head } = current;
			return {
				next: { ...head, lifecycle: nextLifecycle(head, 'reopen', by, this.at()) },
				options: { operation: 'reopen', outcome: { result: 'reopened', summary: `reopened with ${unit}` } },
			};
		}).catch(err => { if (err instanceof ArtifactNotFoundError) return false; throw err; });
	}

	/** A unit cannot be reopened while the unit above it is completed. */
	private async checkParentOpen(id: string): Promise<void> {
		const key = ArtifactIds.parse(id);
		const parent = key === undefined ? undefined : ArtifactIds.parentOf(key);
		if (parent === undefined) return;
		const parentId = ArtifactIds.make(parent);
		if ((await this.reader.statusOf(parentId)) === 'completed') {
			log.warn({ id, parent: parentId }, 'reopen refused: the parent is completed');
			throw new IllegalTransitionError(`${id} cannot be reopened while ${parentId} is completed`);
		}
	}
}
