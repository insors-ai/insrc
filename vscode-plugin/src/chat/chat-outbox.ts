/**
 * Epic E20261014613abdb3 Story S002 — the chat's outbox (HLD sc5).
 *
 * What the chat webview shows for the shown chat: its messages still in the repository's queue
 * (waiting, with their place in line, and failed or undelivered, with the reason), how many
 * messages of other chats are ahead, which chat is running, and whether that chat waits on an
 * approval or a choice. Projected from the queue's rows alone, so every window shows the same.
 * Pure and vscode-free.
 */

import type { QueuedMessage } from './chat-queue-store.js';

export interface OutboxRow {
  readonly seq: number;
  /** 1-based place among every waiting (queued or retrying) message of the repository; 1 runs next. */
  readonly position?: number | undefined;
  /** A message being processed is in the transcript, not the outbox. */
  readonly state: 'queued' | 'retrying' | 'failed' | 'not-delivered';
  readonly text: string;
  /** How many files go with it (the refs stay in the queue). */
  readonly attachments: number;
  readonly origin: 'typed' | 'review-pane';
  readonly error?: string | undefined;
  /** Infrastructure retries made (Story S004). */
  readonly attempt?: number | undefined;
  readonly nextAttemptAt?: number | undefined;
}

export interface OutboxView {
  readonly sessionId: string;
  readonly rows: readonly OutboxRow[];
  /** Other chats' waiting messages that run before this chat's first waiting one. */
  readonly aheadFromOtherChats: number;
  /** Another chat whose message is being processed; `here` when this window runs it. */
  readonly runningChat?: { readonly title: string; readonly here: boolean } | undefined;
  /** That chat's message waits on a card, so the queue waits for it. */
  readonly blockedBy?: { readonly chatTitle: string; readonly reason: 'approval' | 'selection' } | undefined;
  /** A one-off sentence, e.g. why an action was refused. */
  readonly note?: string | undefined;
}

/** The webview's request on one row. 'outbox-retry-now' is Story S004's. */
export type OutboxAction = { readonly type: 'outbox-cancel' | 'outbox-dismiss' | 'outbox-resend' | 'outbox-retry-now'; readonly seq: number };

export interface OutboxContext {
  /** A chat's title, from the session store. */
  readonly titleOf: (sessionId: string) => string | undefined;
  /** Whether a row is this window's (its window key). */
  readonly here?: ((m: QueuedMessage) => boolean) | undefined;
  readonly note?: string | undefined;
}

const isWaiting = (m: QueuedMessage): boolean => m.state === 'queued' || m.state === 'retrying';
const UNTITLED = 'another chat';

/** The outbox for `sessionId` from every live row of the queue, in seq order. */
export function projectOutbox(rows: readonly QueuedMessage[], sessionId: string, ctx: OutboxContext): OutboxView {
  const waiting = rows.filter(isWaiting);
  const place = new Map(waiting.map((m, i) => [m.seq, i + 1] as const));
  const firstMine = waiting.find((m) => m.sessionId === sessionId);
  const ahead = waiting.filter((m) => m.sessionId !== sessionId && (firstMine === undefined || m.seq < firstMine.seq)).length;

  const out: OutboxRow[] = [];
  for (const m of rows) {
    if (m.sessionId !== sessionId || m.state === 'processing' || m.state === 'done') continue;
    out.push({
      seq: m.seq,
      ...(place.has(m.seq) ? { position: place.get(m.seq) } : {}),
      state: m.state,
      text: m.text,
      attachments: m.attachments.length,
      origin: m.origin,
      ...(m.error !== undefined ? { error: m.error } : {}),
      ...(m.attempts > 0 ? { attempt: m.attempts } : {}),
      ...(m.nextAttemptAt !== undefined ? { nextAttemptAt: m.nextAttemptAt } : {}),
    });
  }

  const running = rows.find((m) => m.state === 'processing');
  const other = running !== undefined && running.sessionId !== sessionId ? running : undefined;
  const title = other === undefined ? undefined : (ctx.titleOf(other.sessionId) ?? UNTITLED);
  return {
    sessionId,
    rows: out,
    aheadFromOtherChats: ahead,
    ...(other !== undefined && title !== undefined ? { runningChat: { title, here: ctx.here?.(other) === true } } : {}),
    ...(other?.waitingOn !== undefined && title !== undefined ? { blockedBy: { chatTitle: title, reason: other.waitingOn } } : {}),
    ...(ctx.note !== undefined ? { note: ctx.note } : {}),
  };
}
