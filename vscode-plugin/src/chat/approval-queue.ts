/**
 * ISSUE-6a811b8a S001 — the chat's approval queue: permission requests are asked one at a time.
 *
 * A vscode-free module. A turn may raise several approval requests at once (claude reports each
 * refused tool call and then ends the turn; codex and the control protocol wait inside the turn
 * for each answer). The queue keeps them in arrival order and only the oldest undecided one, the
 * head, can be decided; a decision for any other request is refused.
 *
 * Requests from a turn that ENDED on refusal ('turn-ended') are decided as a batch: the decisions
 * are collected per originating turn, and the batch is complete once that turn has ended and every
 * request it raised is decided. The panel then runs ONE follow-up for the whole batch, so no
 * approval can start a turn that supersedes another approval's follow-up. Requests answered inside
 * the turn ('in-turn') are relayed one at a time by the panel and never join a batch.
 *
 * The grant chain is every tool approved since the queue was last cleared (a typed message clears
 * it): a follow-up is allowed every tool approved so far, so a later follow-up keeps what an
 * earlier one was granted. A directory block is never a grant.
 *
 * The queue posts nothing and starts nothing; the panel drives it.
 */

/** Where a request is answered: a turn that ended on refusal, or the running turn. */
export type ApprovalResolution = 'turn-ended' | 'in-turn';

/** A tool-permission gate (grantable) or a working-directory block (not grantable). */
export type ApprovalBlockKind = 'tool-gate' | 'dir-block';

/** One undecided approval request, as the panel enqueued it. */
export interface QueuedApproval {
  readonly requestId: string;
  readonly turnId: string;
  readonly title: string;
  readonly detail: string;
  readonly toolName?: string | undefined;
  readonly command?: string | undefined;
  readonly blockKind: ApprovalBlockKind;
  readonly resolution: ApprovalResolution;
}

/** A decided request of a turn-ended batch. */
export interface ApprovalDecision {
  readonly request: QueuedApproval;
  readonly decision: 'approve' | 'deny';
}

/** The actionable request and its place in the queue ('1 of N'). */
export interface ApprovalHead {
  readonly request: QueuedApproval;
  readonly position: number;
  readonly total: number;
}

/** A turn-ended batch whose turn has ended and whose requests are all decided. */
export interface CompletedBatch {
  readonly turnId: string;
  readonly decisions: readonly ApprovalDecision[];
}

export type DecideResult =
  | { readonly ok: true; readonly decided: QueuedApproval }
  | { readonly ok: false; readonly reason: 'not-head' | 'unknown' };

export interface ApprovalQueue {
  /** Adds a request at the back. A requestId already queued is ignored. */
  enqueue(request: QueuedApproval): void;
  /** The actionable request, or undefined when nothing is waiting. */
  head(): ApprovalHead | undefined;
  /** Whether the request is waiting (head or behind it). */
  has(requestId: string): boolean;
  /**
   * Decides the head. Any other id is refused and changes nothing: 'not-head' for a request
   * still waiting behind the head, 'unknown' for one that is not queued.
   */
  decide(requestId: string, decision: 'approve' | 'deny'): DecideResult;
  /** The turn has ended (done or error): its batch can complete. */
  endTurn(turnId: string): void;
  /** Removes and returns a batch that is complete, oldest first; undefined when none is. */
  takeCompletedBatch(): CompletedBatch | undefined;
  /** Every tool approved since the last clear(), once each, in approval order. */
  grantChain(): readonly string[];
  /** Drops every waiting request and batch and resets the grant chain; returns the waiting requests. */
  clear(): readonly QueuedApproval[];
}

export function createApprovalQueue(): ApprovalQueue {
  let waiting: QueuedApproval[] = [];
  // Per originating turn: the decisions of its turn-ended requests, in decision order.
  let batches = new Map<string, ApprovalDecision[]>();
  let ended = new Set<string>();
  let grants: string[] = [];

  const batchFor = (turnId: string): ApprovalDecision[] => {
    let b = batches.get(turnId);
    if (b === undefined) {
      b = [];
      batches.set(turnId, b);
    }
    return b;
  };

  return {
    enqueue(request) {
      if (waiting.some((r) => r.requestId === request.requestId)) return;
      waiting.push(request);
      // A turn-ended request opens (or joins) its turn's batch, so the batch exists before it is decided.
      if (request.resolution === 'turn-ended') batchFor(request.turnId);
    },

    head() {
      const first = waiting[0];
      return first === undefined ? undefined : { request: first, position: 1, total: waiting.length };
    },

    has(requestId) {
      return waiting.some((r) => r.requestId === requestId);
    },

    decide(requestId, decision) {
      const first = waiting[0];
      if (first === undefined || first.requestId !== requestId) {
        return { ok: false, reason: waiting.some((r) => r.requestId === requestId) ? 'not-head' : 'unknown' };
      }
      waiting = waiting.slice(1);
      if (first.resolution === 'turn-ended') {
        batchFor(first.turnId).push({ request: first, decision });
        const tool = first.toolName;
        if (decision === 'approve' && first.blockKind === 'tool-gate' && tool !== undefined && tool !== '' && !grants.includes(tool)) {
          grants = [...grants, tool];
        }
      }
      return { ok: true, decided: first };
    },

    endTurn(turnId) {
      ended.add(turnId);
    },

    takeCompletedBatch() {
      for (const [turnId, decisions] of batches) {
        if (!ended.has(turnId) || decisions.length === 0) continue;
        if (waiting.some((r) => r.turnId === turnId && r.resolution === 'turn-ended')) continue;
        batches.delete(turnId);
        ended.delete(turnId);
        return { turnId, decisions };
      }
      return undefined;
    },

    grantChain() {
      return grants;
    },

    clear() {
      const dropped = waiting;
      waiting = [];
      batches = new Map();
      ended = new Set();
      grants = [];
      return dropped;
    },
  };
}
