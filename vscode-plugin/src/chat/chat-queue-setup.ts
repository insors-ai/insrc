/**
 * Epic E20261014613abdb3 Story S001 — setting up the repository's chat queue for a window.
 *
 * The pieces extension.ts needs, kept vscode-free so they are tested directly: the window key
 * (stable across reloads, kept in the workspace's state), the repository key (the real path of
 * the chat folder's git top-level, so windows on one working tree share a queue), the process
 * check, and the factory that opens the store and builds the window's worker. Epic
 * E20261014613abdb3 Story S005: when the queue cannot be opened the chat is disabled in that
 * window (there is no direct path), and the notice says so and names the cause.
 */

import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { ChatPanelLogger } from './chat-panel.js';
import { createChatQueueStore, StoreUnavailable, type LeaseClaim, type SqliteDatabase } from './chat-queue-store.js';
import { createChatQueueWorker, type ChatQueueWorker, type QueuedTurnRunner } from './chat-queue-worker.js';

/** The workspace-state key of this window's queue key. */
export const WINDOW_KEY_STATE = 'insrc.chat.windowKey';

/** Why the chat queue could not be opened. */
export type QueueOpenFailure = 'no-sqlite' | 'newer-plugin' | 'other';

/** Said once when the queue cannot be used: the chat is disabled in this window. */
export const CHAT_DISABLED_NO_SQLITE_NOTICE = 'The chat is disabled in this window: this VS Code cannot load node:sqlite, which the chat queue needs.';
export const CHAT_DISABLED_NEWER_PLUGIN_NOTICE = 'The chat is disabled in this window: its queue was made by a newer insrc plugin; reload this window.';
export const chatDisabledOtherNotice = (reason: string): string => `The chat is disabled in this window: its queue could not be opened (${reason}).`;

/** Whether the chat is offered in a window: only when its queue could be created. */
export const chatIsOffered = (queue: unknown): boolean => queue !== undefined;

/** The cause of a failure to open the queue: a newer plugin's file, a runtime without node:sqlite, or anything else. */
export function classifyOpenFailure(err: unknown): QueueOpenFailure {
  const reason = err instanceof Error ? err.message : String(err);
  if (err instanceof StoreUnavailable && /newer plugin/.test(reason)) return 'newer-plugin';
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 'ERR_UNKNOWN_BUILTIN_MODULE' || /node:sqlite/.test(reason)) return 'no-sqlite';
  return 'other';
}

export interface KeyValueState {
  get(key: string): string | undefined;
  update(key: string, value: string): unknown;
}

/** This window's key: created once and kept in the workspace's state, so a reload keeps it. */
export function windowKeyOf(state: KeyValueState, newId: () => string): string {
  const kept = state.get(WINDOW_KEY_STATE);
  if (typeof kept === 'string' && kept !== '') return kept;
  const id = newId();
  void state.update(WINDOW_KEY_STATE, id);
  return id;
}

/**
 * The repository's key: the first 16 hex of the sha256 of the real path of the chat folder's git
 * top-level, else of the folder itself (outside git, or when git fails).
 */
export function repoKeyOf(folder: string, deps: { readonly gitTopLevel: (cwd: string) => string | undefined; readonly realpath: (p: string) => string }): string {
  let base = folder;
  try {
    const top = deps.gitTopLevel(folder);
    if (top !== undefined && top.trim() !== '') base = top.trim();
  } catch {
    /* not a git folder: the folder itself */
  }
  let real = base;
  try {
    real = deps.realpath(base);
  } catch {
    /* keep the path as given */
  }
  return createHash('sha256').update(real).digest('hex').slice(0, 16);
}

/** The repository's queue file under the insrc home. */
export const queuePathOf = (insrcHome: string, repoKey: string): string => join(insrcHome, 'chat-queue', `${repoKey}.sqlite`);

/** The pid is alive and, when a start time is given, it is the same process (not a reused pid). */
export function processAliveCheck(isAlive: (pid: number) => boolean, startTimeOf: (pid: number) => number | undefined): (pid: number, startedAt?: number) => boolean {
  return (pid, startedAt) => isAlive(pid) && (startedAt === undefined || startTimeOf(pid) === startedAt);
}

export interface QueueFactoryDeps {
  readonly path: string;
  readonly openDatabase: (path: string) => SqliteDatabase;
  readonly now: () => number;
  readonly pluginVersion: string;
  readonly claim: LeaseClaim;
  readonly isAlive: (pid: number, startedAt?: number) => boolean;
  readonly log: ChatPanelLogger;
  /** Shows a notice to the user (once per window). */
  readonly notify: (message: string) => void;
}

/**
 * Opens the repository's queue and returns the factory the chat host builds its worker with, or
 * undefined (with the notice shown once) when the queue cannot be used: the chat is then disabled.
 */
export function createQueueFactory(deps: QueueFactoryDeps): ((runner: QueuedTurnRunner) => ChatQueueWorker) | undefined {
  try {
    const store = createChatQueueStore({ path: deps.path, openDatabase: deps.openDatabase, now: deps.now, pluginVersion: deps.pluginVersion, log: deps.log });
    return (runner) => createChatQueueWorker({ store, claim: deps.claim, runner, isAlive: deps.isAlive, now: deps.now, log: deps.log });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    deps.log.warn(`[chat-queue] not available, the chat is disabled in this window: ${reason}`);
    const cause = classifyOpenFailure(err);
    deps.notify(cause === 'newer-plugin' ? CHAT_DISABLED_NEWER_PLUGIN_NOTICE : cause === 'no-sqlite' ? CHAT_DISABLED_NO_SQLITE_NOTICE : chatDisabledOtherNotice(reason.replace(/^the chat queue could not be (?:opened|prepared): /, '')));
    return undefined;
  }
}
