/**
 * Story E20260925edb76e2e:S003 / sc4 — the extension-local chat/session store.
 *
 * The persisted ChatSession record + the store interface every chat surface reads
 * (S005 history/provider, S006 edit-mode). Chat history is kept EXTENSION-LOCAL
 * (k3), never in the daemon graph/config store. The extension keeps it in files under
 * ~/.insrc/chat-sessions (session-file-store.ts); the Memento binding below is the store the
 * tests build on, and its keys are what the one-time migration out of globalState reads.
 * A missing/corrupt entry degrades to empty rather than throwing (durability NFR).
 *
 * vscode-free: the store depends only on the structural {@link MementoLike} shape,
 * so the real vscode.Memento passes directly and tests inject an in-memory double.
 */
import type { ProviderId } from './cli-adapter.js';
import type { PermissionMode } from './protocol.js';
import type { AttachmentRef } from './attachment-store.js';

/**
 * A durable transcript row. A discriminated union over `role`:
 * - `user` / `assistant` — a plain message row carrying `text` (a user row may carry `attachments`).
 * - `marker` — a lifecycle marker row (S008) carrying `text` + an optional sc1 `cssClass`.
 * - `tool-result` — S001 (dev-chat ux polish): a structured tool-output row carrying the tool
 *   `output` and an optional correlated `command` (NO `text`). Plain-serialisable, so it round-trips
 *   through the Memento with no per-row migration (isSession does no per-row check).
 * - `permission-outcome` — S003 (dev-chat ux polish): the RESOLVED decision of a permission card
 *   (approve/deny), carrying the `toolName` + `decision`, so a restored session shows a decided,
 *   non-actionable chip in place of the live-only approval card. Plain-serialisable (same as above).
 *
 * Every variant carries `at`. Existing user/assistant/marker rows keep their exact shape (k1).
 */
export type TranscriptEntry =
  | {
      readonly role: 'user' | 'assistant' | 'marker';
      readonly text: string;
      /** sc1 marker class for a role:'marker' row (S008); absent on user/assistant + pre-S008 rows. */
      readonly cssClass?: string;
      readonly at: string;
      /**
       * Story E2026101259da3204:S001: the files a role:'user' message carried; absent when it had
       * none (so every other row keeps its exact shape). `text` stays the user's own words.
       */
      readonly attachments?: readonly AttachmentRef[];
    }
  | {
      readonly role: 'tool-result';
      /** The command the tool ran, when the adapter could correlate it back; absent otherwise. */
      readonly command?: string;
      /** The tool's output text (may be empty). */
      readonly output: string;
      readonly at: string;
    }
  | {
      readonly role: 'permission-outcome';
      /** The tool the approval card gated (e.g. 'Bash', 'Write'). */
      readonly toolName: string;
      /** The user's decision on the card. */
      readonly decision: 'approved' | 'rejected';
      readonly at: string;
    }
  | {
      /**
       * S004 (dev-chat ux polish): the RESOLVED choice of a selection widget (the user confirmed
       * one or more chips), so a restored session shows a decided, non-actionable chip listing the
       * chosen label(s) in place of the live-only widget. Plain-serialisable (same as tool-result /
       * permission-outcome above). `at` is the ISO timestamp, matching every other variant's style.
       */
      readonly role: 'selection-outcome';
      /** The chosen option labels (in confirm order). */
      readonly chosen: readonly string[];
      readonly at: string;
    }
  | {
      /**
       * Story E20261013b2e8109f:S001: one section of the diff of what a turn changed, drawn as a
       * widget. Rows are only ever pushed, so a section that changes again is saved as a NEW row:
       * the section's first row carries `sid`, unique in the transcript, and each later version
       * carries `replaces` with that sid (and no sid of its own). A row with `replaces` is never
       * drawn at its own place; the window cut (transcript-window.ts) gives the latest version at
       * the first row's place. The link is by id, never by position: another window's rows can sit
       * before this window's new rows in the file.
       */
      readonly role: 'diff';
      readonly sid?: string;
      readonly replaces?: string;
      /** As git names it: relative to the workspace folder, with forward slashes. */
      readonly path: string;
      readonly oldStart: number;
      readonly oldLines: number;
      readonly newStart: number;
      readonly newLines: number;
      /** Added and removed lines of the whole section, also when `lines` is cut. */
      readonly added: number;
      readonly removed: number;
      /** The diff lines with their ' ', '+', '-' or '\\' prefix (at most 400). */
      readonly lines: readonly string[];
      /** How many diff lines were left out of `lines`. */
      readonly omitted?: number;
      readonly binary?: true;
      readonly fileState?: 'new' | 'deleted';
      /** The section is gone (the change was undone): the widget is not drawn. */
      readonly withdrawn?: true;
      readonly at: string;
    };

/** The saved row of one diff section. */
export type DiffRow = Extract<TranscriptEntry, { role: 'diff' }>;

export interface ChatSession {
  readonly id: string;
  readonly provider: ProviderId;
  nativeSessionId?: string;
  readonly createdAt: string;
  title: string;
  editMode: 'auto' | 'review';
  /**
   * S001 (bugfix): the per-session chat mode (Manual / Edit Automatically / Auto), persisted so it
   * survives reload + follows the session when switched. Optional for back-compat: a pre-mode
   * session (or a corrupt value) defaults to 'manual' on read.
   */
  mode?: PermissionMode;
  /**
   * The run config chosen in the chat panel's bottom-right controls: `model` is an
   * id/alias of the provider's family (absent = the CLI's own default model) and
   * `effort` a level of that model's efforts (absent = the CLI's default). Persisted
   * per session; optional for back-compat (pre-run-config sessions read as absent).
   */
  model?: string | undefined;
  effort?: string | undefined;
  transcript: TranscriptEntry[];
  /**
   * Story E202610101d04e560:S001: while a turn's output segment (session-output.ts) has not been
   * fully handled, where the panel got to. Sessions are kept in files under ~/.insrc/chat-sessions,
   * shared by every window, so ownerHostPid names the extension host following it. Optional for
   * back-compat.
   */
  liveTurn?: LiveTurn;
}

/** A turn still being read from the session output file. */
export interface LiveTurn {
  readonly cursor: { readonly turnId: string; readonly generation: number; readonly offset: number };
  readonly ownerHostPid: number;
  readonly pid?: number | undefined;
  readonly startedAt?: number | null | undefined;
}

export interface ChatSummary {
  readonly id: string;
  readonly provider: ProviderId;
  readonly title: string;
  readonly updatedAt: string;
}

/** The per-session run config (model id/alias + effort level), both optional. */
export interface RunConfig {
  readonly model?: string | undefined;
  readonly effort?: string | undefined;
}

export interface ChatSessionStore {
  create(provider: ProviderId, run?: RunConfig): ChatSession;
  /**
   * A new in-memory session that is NOT persisted yet — it enters the store (index + history)
   * only on the first {@link save} (i.e. once it has a message). Lets the chat open a fresh
   * "draft" without cluttering history with empty chats that are never used. Same shape as
   * {@link create}, minus the immediate save.
   */
  draft(provider: ProviderId, run?: RunConfig): ChatSession;
  get(id: string): ChatSession | undefined;
  list(): ReadonlyArray<ChatSummary>;
  append(id: string, entry: TranscriptEntry): void;
  save(session: ChatSession): void;
}

/** The slice of vscode.Memento this store needs (kept structural so the store is vscode-free). */
export interface MementoLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): void | PromiseLike<void>;
}

export interface MementoStoreDeps {
  readonly memento: MementoLike;
  readonly now?: () => string;
  readonly genId?: () => string;
  /**
   * Optional cap on how many sessions the index retains (S005): when set, save()
   * evicts the oldest (least-recently-saved) sessions + their blobs beyond the cap,
   * so extension-local history (k3) stays bounded. Unset = S003 unbounded behaviour.
   */
  readonly maxSessions?: number;
  /** Called with the id of each session evicted beyond the cap (so its output files can go too). */
  readonly onEvict?: ((sessionId: string) => void) | undefined;
}

/** The Memento key of the session id list, least recently saved first. */
export const INDEX_KEY = 'insrc.chat.index';
/** The Memento key prefix of one session's record; the session id follows it. */
export const SESSION_PREFIX = 'insrc.chat.session.';

/** Whether a stored value has the fields every session record must carry. */
export function isSession(v: unknown): v is ChatSession {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s['id'] === 'string' &&
    typeof s['provider'] === 'string' &&
    typeof s['createdAt'] === 'string' &&
    typeof s['title'] === 'string' &&
    (s['editMode'] === 'auto' || s['editMode'] === 'review') &&
    Array.isArray(s['transcript'])
  );
}

/** When a session last changed: its last row's time, or its creation time when it has no row. */
export function updatedAtOf(s: ChatSession): string {
  const last = s.transcript[s.transcript.length - 1];
  return last?.at ?? s.createdAt;
}

/**
 * The sc4 real binding over a vscode Memento. Sessions are stored one-per-key under
 * `insrc.chat.session.<id>` with an `insrc.chat.index` id list; all reads are
 * corruption-tolerant (get -> undefined, list -> []). Writes are fire-and-forget.
 */
export function createMementoChatSessionStore(deps: MementoStoreDeps): ChatSessionStore {
  const { memento } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const genId = deps.genId ?? (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  // A non-positive / fractional cap would wipe the active session on save; treat only a
  // positive integer as a real cap, otherwise fall back to the unbounded S003 behaviour.
  const maxSessions =
    deps.maxSessions !== undefined && deps.maxSessions >= 1 ? Math.floor(deps.maxSessions) : undefined;

  const readIndex = (): string[] => {
    try {
      const raw = memento.get<unknown>(INDEX_KEY);
      return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  };
  const writeIndex = (ids: string[]): void => {
    void memento.update(INDEX_KEY, ids);
  };

  const get = (id: string): ChatSession | undefined => {
    try {
      const raw = memento.get<unknown>(SESSION_PREFIX + id);
      return isSession(raw) ? raw : undefined;
    } catch {
      return undefined;
    }
  };

  const save = (session: ChatSession): void => {
    void memento.update(SESSION_PREFIX + session.id, session);
    const ids = readIndex();
    if (maxSessions === undefined) {
      // S003 unbounded behaviour, preserved byte-for-byte when no cap is set.
      if (!ids.includes(session.id)) writeIndex([...ids, session.id]);
      return;
    }
    // S005 bounded history (k3): LRU-order by moving the saved id to the end, then
    // evict the oldest (front) beyond the cap — dropping each evicted session's blob
    // too (no orphaned keys). The id being saved is at the end, so it is never evicted.
    const reordered = ids.filter((id) => id !== session.id);
    reordered.push(session.id);
    if (reordered.length > maxSessions) {
      const cut = reordered.length - maxSessions;
      for (const id of reordered.slice(0, cut)) {
        void memento.update(SESSION_PREFIX + id, undefined);
        try {
          deps.onEvict?.(id);
        } catch {
          /* cleanup is best-effort; eviction itself has happened */
        }
      }
      writeIndex(reordered.slice(cut));
    } else {
      writeIndex(reordered);
    }
  };

    const draft = (provider: ProviderId, run?: RunConfig): ChatSession => ({
      id: genId(),
      provider,
      createdAt: now(),
      title: 'new chat',
      editMode: 'auto',
      mode: 'manual',
      ...(run?.model !== undefined ? { model: run.model } : {}),
      ...(run?.effort !== undefined ? { effort: run.effort } : {}),
      transcript: [],
    });

  return {
    draft,
    create(provider: ProviderId, run?: RunConfig): ChatSession {
      const session = draft(provider, run);
      save(session); // create persists immediately (S005 eviction relies on this)
      return session;
    },
    get,
    list(): ReadonlyArray<ChatSummary> {
      const out: ChatSummary[] = [];
      for (const id of readIndex()) {
        const s = get(id);
        if (s) out.push({ id: s.id, provider: s.provider, title: s.title, updatedAt: updatedAtOf(s) });
      }
      return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    },
    append(id: string, entry: TranscriptEntry): void {
      const s = get(id);
      if (s === undefined) return; // corrupt/missing -> no-op, never throw
      s.transcript.push(entry);
      save(s);
    },
    save,
  };
}

/** A volatile, in-memory ChatSessionStore for tests — a Map-backed {@link MementoLike} behind the same logic. */
export function createInMemoryChatSessionStore(deps?: {
  now?: () => string;
  genId?: () => string;
  maxSessions?: number;
}): ChatSessionStore {
  const map = new Map<string, unknown>();
  const memento: MementoLike = {
    get<T>(key: string): T | undefined {
      return map.get(key) as T | undefined;
    },
    update(key: string, value: unknown): void {
      map.set(key, value);
    },
  };
  return createMementoChatSessionStore({ memento, ...(deps ?? {}) });
}
