/**
 * Story E20260925edb76e2e:S003 / sc4 — the extension-local chat/session store.
 *
 * The persisted ChatSession record + the store interface every chat surface reads
 * (S005 history/provider, S006 edit-mode). Chat history is kept EXTENSION-LOCAL
 * (k3): the real binding is over a vscode Memento (context.globalState /
 * workspaceState) — never the daemon graph/config store, and no local-JSON file.
 * A missing/corrupt entry degrades to empty rather than throwing (durability NFR).
 *
 * vscode-free: the store depends only on the structural {@link MementoLike} shape,
 * so the real vscode.Memento passes directly and tests inject an in-memory double.
 */
import type { ProviderId } from './cli-adapter.js';

export interface TranscriptEntry {
  readonly role: 'user' | 'assistant' | 'marker';
  readonly text: string;
  readonly at: string;
}

export interface ChatSession {
  readonly id: string;
  readonly provider: ProviderId;
  nativeSessionId?: string;
  readonly createdAt: string;
  title: string;
  editMode: 'auto' | 'review';
  transcript: TranscriptEntry[];
}

export interface ChatSummary {
  readonly id: string;
  readonly provider: ProviderId;
  readonly title: string;
  readonly updatedAt: string;
}

export interface ChatSessionStore {
  create(provider: ProviderId): ChatSession;
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
}

const INDEX_KEY = 'insrc.chat.index';
const SESSION_PREFIX = 'insrc.chat.session.';

function isSession(v: unknown): v is ChatSession {
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

function updatedAtOf(s: ChatSession): string {
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
      for (const id of reordered.slice(0, cut)) void memento.update(SESSION_PREFIX + id, undefined);
      writeIndex(reordered.slice(cut));
    } else {
      writeIndex(reordered);
    }
  };

  return {
    create(provider: ProviderId): ChatSession {
      const session: ChatSession = {
        id: genId(),
        provider,
        createdAt: now(),
        title: 'new chat',
        editMode: 'auto',
        transcript: [],
      };
      save(session);
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
