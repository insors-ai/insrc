import { cleanupDesignArtifact } from '../review/design-review/cleanup.js';
import type { CleanupResult } from '../code-review/task-review/cleanup.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LifecycleService (sc4, owned by s3): applies one lifecycle operation at a time to a stored artifact and walks a finished
 * Task or Story up to the Story and Epic it completes. Every change goes through `ArtifactStore.update`, so the read of the
 * head and its log, the checks and the write cannot be interleaved with another writer of the same artifact.
 */

import { randomUUID } from 'node:crypto';
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
import { withDesignArtifactFence } from '../review/design-review/fence.js';
import { requireCurrentDesignApproval } from '../review/design-review/approval.js';

const log = getLogger('lifecycle-service');

/** The actor of an entry the service writes on nobody's behalf: the adoption of a raw content write. */
const SYSTEM_ACTOR: Actor = { id: 'insrc:system', kind: 'system', properties: {} };

/** What one call knows that the service does not: the override reason the approval in hand carries. */
export interface EvidenceContext {
	readonly overrideReview?: string | undefined;
	/**
	 * Says whether a unit's completion is held for now (signoff the policy requires is still to come). The completion walk asks it
	 * for every unit whose roll-up holds and stops at one it holds, so the units above it are not completed either. Absent, nothing is held.
	 */
	readonly holds?: ((unitId: string) => boolean | Promise<boolean>) | undefined;
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
 readonly cleanup?: CleanupResult;
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
  const kind=ArtifactIds.parse(id)?.kind;
  if(op==='approve'&&kind&&['DEF','HLD','LLD'].includes(kind)){
   const result=await withDesignArtifactFence(this.deps.store.repoPath,id,()=>this.applyInQueue(id,op,by,detail,ctx));
   const cleanup=await cleanupDesignArtifact(this.deps.store.repoPath,id,{store:this.deps.store});return {...result,cleanup};
  }
  return this.applyInQueue(id,op,by,detail,ctx);
 }
 private async applyInQueue(id:string,op:Operation,by:Actor,detail:TransitionDetail,ctx:EvidenceContext):Promise<ApplyResult>{
		const evidence = this.evidenceFor(ctx);
		if (!isLifecycleOperation(op)) throw new IllegalTransitionError(`'${op}' is a content operation, not a lifecycle operation`);
		const store = this.deps.store;
		const key = ArtifactIds.parse(id);
		const isUnit = key !== undefined && (UNITS as readonly string[]).includes(key.kind);
		let standing: { lifecycle: Lifecycle; entry: ChangeLogEntry } | undefined;
		let written: Lifecycle | undefined;

		const { entry } = await store.updateAndLog(id, by, async current => {
			const { changeLog, ...head } = current;

			// A head one content change past its log (a raw writer changed it) is adopted: logged once the operation is known to be legal.
			let adoption: ChangeLogEntry | undefined;
			if (INTEGRITY_CHECKED.includes(op)) {
				const integrity = checkIntegrity({ description: head.description, payload: head.payload, lifecycle: head.lifecycle }, changeLog);
				if (!integrity.ok) {
					adoption = integrity.reason === 'head-ahead-of-log' ? this.adoptionOf(head, changeLog) : undefined;
					if (adoption === undefined) throw new LifecycleConflictError(id, integrity.reason);
				}
			}

			if (op === 'complete') {
				const done = this.standingCompletion(changeLog);
				if (done !== undefined && head.lifecycle.status === 'completed') { standing = { lifecycle: head.lifecycle, entry: done }; return undefined; }
				if (isUnit && (await rollUp(id, this.reader, evidence)) !== 'completed') {
					throw new IllegalTransitionError(`${id} cannot be completed: its completion condition is not met`);
				}
			}
			if (op === 'reopen' && isUnit) await this.checkParentOpen(id);
   let expectedHeadHash:string|undefined;
   if(op==='approve'&&key&&['DEF','HLD','LLD'].includes(key.kind)){
    if(['approved','in-signoff','signed-off','completed'].includes(head.lifecycle.status)&&head.lifecycle.approval?.revision===head.lifecycle.revision.number){
     const prior=[...changeLog].reverse().find(e=>e.operation==='approve'&&e.revision?.number===head.lifecycle.revision.number);
     if(prior){standing={lifecycle:head.lifecycle,entry:prior};return undefined;}
    }
    expectedHeadHash=await requireCurrentDesignApproval(store.repoPath,head,changeLog,detail.override?.reason);
   }

			// The unit's own transition is validated before any member is touched, so a refusal leaves everything as it was.
			// A unit is completed by its roll-up, which stands in for the approval a record needs, so it may start from any open status.
			const cascade = op === 'complete' && isUnit;
			const lifecycle = nextLifecycle(head, op, by, this.at(), cascade ? { ...detail, cascade } : detail);
			if (adoption !== undefined) await this.adopt(id, adoption);

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
     ...(expectedHeadHash!==undefined?{expectedHeadHash}:{}),
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
				if ((await ctx.holds?.(next)) === true) break;
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
	 * undefined when there is no head. With `adoptable`, a head that apply would adopt (see adoptionOf) counts as agreeing.
	 */
	async inspect(id: string, opts: { readonly adoptable?: boolean | undefined } = {}): Promise<{ readonly status: Status; readonly integrity: Integrity; readonly lifecycle: Lifecycle } | undefined> {
		try {
			await this.deps.store.finishPending(id);
			const stored = await this.deps.store.readWithHistory(id);
			let integrity = checkIntegrity({ description: stored.description, payload: stored.payload, lifecycle: stored.lifecycle }, stored.changeLog);
			// For a caller that is about to approve, review or complete: a head a raw writer moved past its log is not a conflict,
			// because apply logs it first. Nothing is logged here; a reader that does not ask keeps the strict answer.
			if (opts.adoptable === true && !integrity.ok && integrity.reason === 'head-ahead-of-log' && this.adoptionOf(stored, stored.changeLog) !== undefined) integrity = { ok: true };
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

	/**
	 * The entry that logs a head a raw writer moved past its log, or undefined when the head is not such a head. The check of
	 * the head's own hash has passed by the time this is asked (checkIntegrity answers hash-mismatch first), so the head is
	 * adopted only when its content differs from the last logged revision: a revision number raised by hand, or content put
	 * back to what was logged, is not a raw write and stays refused.
	 */
	private adoptionOf(head: { readonly lifecycle: Lifecycle }, changeLog: readonly ChangeLogEntry[]): ChangeLogEntry | undefined {
		const tail = [...changeLog].reverse().find(e => e.revision !== undefined);
		const revision = head.lifecycle.revision;
		if (tail?.revision === undefined || tail.revision.contentHash === revision.contentHash) return undefined;
		// The log is ordered by timestamp, then id, and the operation is stamped after this call: so the entry is dated a
		// millisecond before now but never before the entry it follows, and its id sorts ahead of any other entry of the same instant.
		const now = Date.parse(this.at());
		const after = Date.parse(tail.timestamp);
		const timestamp = new Date(Number.isNaN(after) ? now : Math.max(after + 1, now - 1)).toISOString();
		return {
			id: `0000${randomUUID().replace(/-/g, '').slice(4)}`,
			actor: SYSTEM_ACTOR,
			timestamp,
			operation: 'update',
			revision: { number: revision.number, contentHash: revision.contentHash },
			outcome: { result: 'adopted', summary: 'a content change written outside the store was logged when the head was approved, reviewed or completed' },
		};
	}

	/** Append the adopted entry; the caller holds the artifact's queue, so no write of the store comes between it and the operation. */
	private async adopt(id: string, entry: ChangeLogEntry): Promise<void> {
		await this.deps.store.history.appendLog(id, entry);
		log.info({ id, revision: entry.revision?.number }, 'adopted a content change written outside the store');
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
		await this.deps.store.update(member, by, async current => {
			if (['completed', 'withdrawn', 'superseded'].includes(current.lifecycle.status)) return undefined;
			const { changeLog, ...head } = current;
			// A member is held to the same check as the unit: its head and its log have to agree before it is frozen.
			const integrity = checkIntegrity({ description: head.description, payload: head.payload, lifecycle: head.lifecycle }, changeLog);
			const adoption = !integrity.ok && integrity.reason === 'head-ahead-of-log' ? this.adoptionOf(head, changeLog) : undefined;
			if (!integrity.ok && adoption === undefined) throw new LifecycleConflictError(member, integrity.reason);
			const lifecycle = nextLifecycle(head, 'complete', by, this.at(), { cascade: true });
			if (adoption !== undefined) await this.adopt(member, adoption);
			return {
				next: { ...head, lifecycle },
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
