/**
 * Story E20260925edb76e2e:S003 / t3 — the terminal chat panel host.
 *
 * A vscode-free, deps-injected factory (mirrors createWebviewPanelHost): it renders
 * the terminal-styled chat webview shell (one nonce'd inline script under a strict
 * per-render CSP, built from the sc1 renderTerminalStyle + surfaceClass('chat')),
 * dispatches the sc3 WebviewToHost intents, and runs the sc5 StreamAdapter turn
 * loop — posting each sc2 TurnEvent to the webview INCREMENTALLY (no whole-turn
 * buffering) while appending sc4 transcript rows. It is a PASSTHROUGH: it only
 * drives the CLI adapter and observes events; it never invokes an insrc workflow
 * tool (k8). All vscode calls are injected via {@link ChatPanelChannel}.
 */
import { renderTerminalStyle, surfaceClass, terminalTheme, type TerminalTheme } from './design-tokens.js';
import { MARKER_CLASS, markerFor, markerWebviewSource } from './markers.js';
import type { DiffSection } from './diff-sections.js';
import { renderRegistryWebviewSource, RENDER_REGISTRY_STYLE } from './render-registry.js';
// S001 (bugfix): the bundled `marked` UMD (committed generated string) — evaluated first in the
// one nonce'd webview script so `marked.parse` is available to the render registry (no CDN; CSP-safe).
import { MARKED_SRC } from './webview-marked.js';
import { HLJS_SRC } from './webview-hljs.js';
import { renderMarkdownStyle, CHAT_MARKDOWN_TOKENS } from './markdown-style.js';
import { envelope, type WebviewToHost, type HostToWebview, type PermissionMode } from './protocol.js';
import { AttachmentRefused, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE, type AttachmentRef, type AttachmentStore } from './attachment-store.js';
// S001 (bugfix): classifyPermissionDenial is the pure classifier that tells a tool-permission gate
// apart from a working-directory / sandbox-allowlist block (the two must not share an Approve path).
import { classifyPermissionDenial, type ProviderRegistry, type ProviderId } from './cli-adapter.js';
import { createApprovalQueue, type ApprovalResolution } from './approval-queue.js';
import { latestWindow, pageBefore } from './transcript-window.js';
import { transcriptPagerWebviewSource } from './transcript-pager.js';
import { createMemorySessionLocks, defaultIsAlive, defaultProcessStartTime, type SessionLocks } from './session-lock.js';
import { createTurnLifecycle, DEFAULT_TURN_LOCK_TIMEOUT_MS, trySaveSession, type SpawnedCli, type TurnSink } from './turn-lifecycle.js';
import type { ChatSessionStore, ChatSession, TranscriptEntry } from './session-store.js';
import { classifyFailure, MAX_INFRA_RETRIES } from './chat-failure.js';
import type { TurnEvent } from './stream-events.js';
import type { DeclaredOutcome, PresentedTurn, ReviewPresenter } from './review-presenter.js';
import type { QueuedMessage, TurnOutcome } from './chat-queue-store.js';
import type { ChatQueueWorker, QueueAction, QueuedTurnRunner, WaitingOn } from './chat-queue-worker.js';
import { projectOutbox } from './chat-outbox.js';
import type { LinkOpener } from './link-opener.js';
import { LINK_MARKUP_STYLE } from './link-markup.js';
import {
  createEditGovernor,
  type EditGovernor,
  type EditRenderSeam,
  type WorkspaceBaseline,
  type FsSeam,
  type DiffView,
} from './edit-governor.js';

/** The injected panel seam (mirrors extension.ts's PanelHandle). All vscode API lives here. */
export interface ChatPanelChannel {
  setHtml(html: string): void;
  /** Fire-and-forget: a post to a disposed/hidden panel must never reject inward. */
  postMessage(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
  onDidDispose(listener: () => void): void;
  /** Story E20261013e62a9269:S001: with preserveFocus the panel is shown without taking keyboard focus. */
  reveal(opts?: { readonly preserveFocus?: boolean | undefined }): void;
  dispose(): void;
}

export interface ChatPanelLogger {
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * S006 edit-governance seams the host injects into the EditGovernor. Optional: when
 * absent the host behaves exactly as before (marker-only, no diff/governance). The
 * host itself provides the CHAT render (it pushes each changed section as a diff row);
 * extension.ts supplies the git/fs seams, the native-editor diff, and the diffView accessor.
 */
export interface ChatEditGovernanceDeps {
  readonly baseline: WorkspaceBaseline;
  readonly fs: FsSeam;
  /** An edit event's path as git names it: relative to the workspace folder, with forward slashes. */
  readonly relPath: (path: string) => string;
  /** Open the edit's diff in a native VS Code editor (ac4, diffView='editor'). */
  readonly editorDiff: (path: string, baseline: string | undefined, opts: { review: boolean }) => Promise<void>;
  readonly diffView: () => DiffView;
  readonly notify?: (msg: string) => void;
}

export interface ChatPanelHostDeps {
  createPanel(opts: { viewType: string; title: string }): ChatPanelChannel;
  readonly providers: ProviderRegistry;
  readonly store: ChatSessionStore;
  readonly cwd: () => string;
  readonly renderStyle?: (theme?: TerminalTheme) => string;
  readonly theme?: TerminalTheme;
  readonly logger?: ChatPanelLogger;
  readonly now?: () => string;
  readonly genNonce?: () => string;
  /** S006: edit governance (inline diff + auto/review + revert). Absent -> marker-only. */
  readonly editGovernance?: ChatEditGovernanceDeps;
  /**
   * LLM chat titling: after the first turn, produce a short title for the chat. Absent -> the
   * built-in impl runs a SEPARATE one-shot CLI call (no resume, so it never pollutes the
   * conversation) over the session's provider. Returns undefined on failure (the truncated
   * first prompt then stays as the title). Injected in tests to decouple from the CLI.
   */
  readonly deriveTitle?: (input: { provider: ProviderId; prompt: string; cwd: string }) => Promise<string | undefined>;
  /**
   * The registry a turn takes its session's lease from before it starts a CLI process, so only
   * one process works on a session at a time. Absent -> an in-memory registry (this window only).
   */
  readonly sessionLocks?: SessionLocks | undefined;
  /** Live read of how long a turn waits for the session's previous process before stopping it. */
  readonly turnLockTimeoutMs?: (() => number) | undefined;
  /** This extension host's pid, recorded as the owner of a turn's saved cursor. Default process.pid. */
  readonly hostPid?: number | undefined;
  /** A pid's process start time, recorded with the cursor so a reused pid is never followed. */
  readonly processStartTime?: ((pid: number) => number | undefined) | undefined;
  /** Whether a pid is alive (another window's extension host owning a saved cursor). */
  readonly isAlive?: ((pid: number) => boolean) | undefined;
  /**
   * Story E2026101259da3204:S001: pasting images and attaching documents. The store keeps the
   * files; `pickFiles` (the file dialog, resolving with the chosen paths, none when dismissed)
   * and `open` (show a file) are the two VS Code calls, injected so this module stays free of the
   * vscode module. Absent -> no attach button, no chip row, and the attachment messages are ignored.
   */
  readonly attachments?: ChatAttachmentDeps | undefined;
  /** Epic babd84c6e2fb480a Story S001: opens a clicked link or code reference. Absent -> the clicks are ignored. */
  readonly links?: LinkOpener | undefined;
  /**
   * Epic E20261014613abdb3 Story S001: how long a queued message's turn may wait on an unanswered
   * approval or selection card before the message ends as stopped. Default CONTINUATION_WAIT_MS.
   */
  readonly continuationWaitMs?: number | undefined;
  /**
   * Epic E20261014613abdb3 Story S001: builds this window's worker over the repository's chat queue,
   * given the host's runner. Present: typed messages go through the queue and run in order. Absent
   * (node:sqlite unavailable, or tests): messages start their turns directly, as before.
   */
  readonly queue?: ((runner: QueuedTurnRunner) => ChatQueueWorker) | undefined;
  /**
   * Story E20261013e62a9269:S001: opens a document a turn presents for approval in the review
   * pane. A turn this host runs begins a presented turn just before it starts and ends it when
   * its run is over; a followed turn begins one on its first event. Absent -> nothing is presented.
   */
  readonly presenter?: ReviewPresenter | undefined;
}

export interface ChatAttachmentDeps {
  readonly store: AttachmentStore;
  pickFiles(): Promise<readonly string[]>;
  open(path: string): void;
}

export { DEFAULT_TURN_LOCK_TIMEOUT_MS };

export interface ChatPanelHost {
  open(): void;
  /**
   * S001 (bugfix): adopt an EXTERNALLY-supplied channel — a VS-Code-restored WebviewPanel
   * wrapped as a ChatPanelChannel — and wire+drive it exactly as open() does for a
   * freshly-created one (theme + session-restored + history-list), so a restored chat tab
   * shows history and is interactive instead of being an inert shell. Supersedes any
   * already-live channel so only one remains. Called by the WebviewPanelSerializer.
   */
  adopt(channel: ChatPanelChannel): void;
  /**
   * Story E202610138d4b90c9:S001, Epic E20261014613abdb3 Story S005: another pane hands the chat a
   * message to send as the user's. It goes through the repository's queue like a typed message
   * (origin 'review-pane'), to the chat shown in this panel, or the one the panel opens on when it
   * is closed, and waits its turn in that chat's outbox; nothing is held in memory here. 'queued'
   * when it joined the queue; { kind: 'unavailable', note } when the text is blank, no agentic CLI
   * is installed, the queue refused it (full or busy) or this window has no queue.
   */
  submitExternal(text: string): ExternalSubmitResult;
  /**
   * Epic E20261014613abdb3 Story S001: runs a message the repository's queue hands this window
   * (HLD sc3). Resolves when the message's turn and its continuations have ended.
   */
  readonly queueRunner: QueuedTurnRunner;
  dispose(): void;
}

/** How long a queued turn may wait on an unanswered approval or selection card (10 minutes). */
/** The input's placeholder when idle, and while a turn runs with the queue on (the hint to queue replaces it). */
const IDLE_PLACEHOLDER = 'message claude… (⌘↵ send · ^C interrupt)';
const QUEUE_PLACEHOLDER = 'message claude… (⌘/Ctrl+Enter to queue · ^C interrupt)';

export const CONTINUATION_WAIT_MS = 600_000;

export type ExternalSubmitResult = 'queued' | { readonly kind: 'unavailable'; readonly note: string };

/** The chat panel's webview view type (also the WebviewPanelSerializer key). */
export const CHAT_VIEW_TYPE = 'insrc.chatPanel';
/** The chat tab's title; also set on a tab VS Code restores, which keeps the title it was saved with. */
export const CHAT_PANEL_TITLE = 'insrc ctrl';
const VIEW_TYPE = CHAT_VIEW_TYPE;
const NOOP_LOGGER: ChatPanelLogger = { warn: () => {}, error: () => {} };

/** Escape a value for safe embedding in an HTML attribute / the CSP meta content; shared by every webview shell. */
export function attr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function createChatPanelHost(deps: ChatPanelHostDeps): ChatPanelHost {
  const log = deps.logger ?? NOOP_LOGGER;
  const renderStyle = deps.renderStyle ?? renderTerminalStyle;
  const theme = deps.theme ?? terminalTheme;
  const now = deps.now ?? (() => new Date().toISOString());
  const genNonce = deps.genNonce ?? (() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);

  let channel: ChatPanelChannel | undefined;
  let disposed = false;
  let session: ChatSession | undefined;
  // Story E202610138d4b90c9:S001: messages another pane handed over, waiting their turn (see drain).
  // Whether the webview has posted 'ready' since the channel was wired. The session is not the
  // test: opening the panel drafts it at once, before the webview listens.
  let webviewReady = false;
  // runTurn calls between their start and their turns.start.
  let startingTurns = 0;
  // adopt() is replacing the channel: the waiting list is kept for the restored webview.
  let superseding = false;
  const trySave = (target: ChatSession): void => trySaveSession(deps.store, log, target);
  // The turn lifecycle: the session lease, the newest-message-wins rule, the running CLI process,
  // the turn's cursor in the session file, following a saved turn, Stop and detach.
  const turns = createTurnLifecycle({
    providers: deps.providers,
    store: deps.store,
    locks: deps.sessionLocks ?? createMemorySessionLocks({ logger: log }),
    lockTimeoutMs: () => deps.turnLockTimeoutMs?.() ?? DEFAULT_TURN_LOCK_TIMEOUT_MS,
    hostPid: deps.hostPid ?? process.pid,
    processStartTime: deps.processStartTime ?? defaultProcessStartTime,
    isAlive: deps.isAlive ?? defaultIsAlive,
    isOpen: () => !disposed,
    logger: log,
  });
  // S001 (bugfix): the SINGLE chat mode (Manual / Edit Automatically / Auto). It is now a PERSISTED
  // per-session preference: it tracks the ACTIVE session's stored mode (synced on open/switch/
  // restore) and is applied to the NEXT turn's buildArgs. Default 'manual' so tool use surfaces as
  // in-chat approval cards (never silently blocked).
  let permissionMode: PermissionMode = 'manual';
  // Normalize a session's stored mode (optional/back-compat/corrupt -> 'manual').
  const modeOf = (s: ChatSession | undefined): PermissionMode =>
    s !== undefined && (s.mode === 'edit-auto' || s.mode === 'auto' || s.mode === 'manual') ? s.mode : 'manual';
  // ISSUE-6a811b8a: the approval queue. Every approval-request a turn raises is queued here and
  // only the oldest undecided one (the head) is shown as an actionable card; the next is shown once
  // it is decided. Each request keeps the facts its decision needs: `toolName` (the tool to
  // pre-allow), `command` (the exact command to name in the grant re-run), `blockKind` (a
  // tool-permission gate apart from a working-dir / sandbox-allowlist block, which Approve cannot
  // grant) and `resolution` (a turn that ended on refusal, or the running turn).
  const approvals = createApprovalQueue();
  // The requestId of the head card the webview is showing (posted once) and the total it shows.
  let shownApproval: string | undefined;
  let shownTotal = 0;
  // S004 (dev-chat ux polish): pending selection requests, requestId -> the widget's options.
  // Populated when a turn surfaces a selection-request (parsed from an `insrc:select` marker),
  // consumed by a selection-decision to map the chosen ids back to labels. Cleared on decision.
  const pendingSelections = new Map<string, { options: ReadonlyArray<{ id: string; label: string }> }>();
  // Epic E20261014613abdb3 Story S001: the queued message this window is running, and what its
  // turns (the message's own and its continuations) have reported so far.
  interface QueuedRun {
    readonly message: QueuedMessage;
    readonly session: ChatSession;
    readonly onSpawn: (cli: { readonly pid?: number | undefined; readonly startedAt?: number | undefined }) => void;
    /** Story S002: tells the worker the card this message waits on, so every window's outbox can say so. */
    readonly onWaiting: ((on: WaitingOn) => void) | undefined;
    /** The card last reported. */
    waiting: WaitingOn;
    /** Turns of this message begun and not yet over. */
    turns: number;
    spawned: boolean;
    lastCli: SpawnedCli | undefined;
    terminal: 'done' | 'error' | undefined;
    error: string | undefined;
    /**
     * Story S004: true once any turn of this message emitted a tool-call, file-edit or tool-result event. Never cleared (a
     * continuation or an approval re-run of the same message keeps it): a message whose agent acted is never retried.
     */
    acted: boolean;
    stopped: boolean;
    viewLost: boolean;
    waitTimer: ReturnType<typeof setTimeout> | undefined;
    readonly resolve: (o: TurnOutcome) => void;
  }
  let queued: QueuedRun | undefined;
  const readyWaiters: Array<() => void> = [];

  const post = (msg: HostToWebview): void => {
    if (disposed || channel === undefined) return;
    channel.postMessage(envelope(msg));
  };

  // Story E2026101259da3204:S001: the attachments waiting to go with each session's next message,
  // in the order they were added. Held here and not in the webview, so a rebuilt webview and a
  // chat switch lose nothing (a window reload does). `clientId` is the webview's own name for a
  // pasted image, echoed back so it can show the thumbnail it holds.
  const att = deps.attachments;
  const links = deps.links;
  interface PendingAttachment {
    readonly ref: AttachmentRef;
    readonly clientId?: string | undefined;
    /** The number of the change that added it, so a submit takes only what was asked for before it. */
    readonly seq: number;
  }
  let changeSeq = 0;
  const pendingAttachments = new Map<string, PendingAttachment[]>();
  // One chain of changes per session: adds and removes run one after another, so the limit is
  // checked against the list as it really is.
  const attachmentWork = new Map<string, Promise<void>>();
  const pendingOf = (sessionId: string): PendingAttachment[] => {
    let list = pendingAttachments.get(sessionId);
    if (list === undefined) {
      list = [];
      pendingAttachments.set(sessionId, list);
    }
    return list;
  };
  /** Tells the webview a session's pending list; nothing is posted for a session that is not shown. */
  const postPending = (sessionId: string, error?: string): void => {
    if (att === undefined || session === undefined || session.id !== sessionId) return;
    post({
      type: 'attachments-pending',
      sessionId,
      items: (pendingAttachments.get(sessionId) ?? []).map((p) => ({
        id: p.ref.id,
        name: p.ref.name,
        kind: p.ref.kind,
        size: p.ref.size,
        ...(p.clientId !== undefined ? { clientId: p.clientId } : {}),
      })),
      ...(error !== undefined ? { error } : {}),
    });
  };
  const TOO_MANY = `Only ${MAX_ATTACHMENTS_PER_MESSAGE} files can be attached to one message`;
  /** The sentence shown for a failed add: the store's own for a refusal, else the failure logged and named. */
  const attachError = (name: string, err: unknown): string => {
    if (err instanceof AttachmentRefused) return err.message;
    const message = err instanceof Error ? err.message : String(err);
    log.error(`[chat] could not attach ${name}: ${message}`);
    return `${name} could not be attached: ${message}`;
  };
  /**
   * Queues a change to a session's pending list behind the ones already running. The change
   * returns the error sentences to show (none when all went well) and whether to post at all.
   */
  const changePending = (
    sessionId: string,
    change: (list: PendingAttachment[], seq: number) => Promise<{ readonly post: boolean; readonly errors: readonly string[] }>,
  ): void => {
    const seq = ++changeSeq;
    const run = async (): Promise<void> => {
      let result: { readonly post: boolean; readonly errors: readonly string[] };
      try {
        result = await change(pendingOf(sessionId), seq);
      } catch (err: unknown) {
        result = { post: true, errors: [attachError('The attachment', err)] };
      }
      if (result.post) postPending(sessionId, result.errors.length > 0 ? result.errors.join(' ') : undefined);
    };
    attachmentWork.set(sessionId, (attachmentWork.get(sessionId) ?? Promise.resolve()).then(run));
  };
  /** The bytes a base64 text decodes to, from its length alone. */
  const base64Bytes = (text: string): number => Math.floor((text.length * 3) / 4) - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0);
  /** An attachment of the active session by the id the host issued: one pending, or one on a sent message. */
  const findAttachment = (s: ChatSession, attachmentId: string): AttachmentRef | undefined => {
    const pending = (pendingAttachments.get(s.id) ?? []).find((p) => p.ref.id === attachmentId);
    if (pending !== undefined) return pending.ref;
    for (const row of s.transcript) {
      if (row.role !== 'user' || row.attachments === undefined) continue;
      const hit = row.attachments.find((a) => a.id === attachmentId);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };

  // S006: the EditGovernor. The CHAT surface is host-internal (each changed section of a turn is
  // pushed as a diff row); the EDITOR surface + git/fs seams are injected via deps.editGovernance.
  // Absent -> no governor -> the host renders edits exactly as before (the S004 edit marker).
  //
  // Story E20261013b2e8109f:S001: the diff state of ONE turn this host started. Only that turn's
  // sink uses it, so nothing here can hold back or add rows for a followed turn or a later one.
  // Rows are only ever pushed: a section's first row carries a sid, a later version names it.
  interface DiffTurn {
    readonly session: ChatSession;
    /** Made once per turn; with a section's id it is that section's sid, unique in the transcript. */
    readonly key: string;
    /** Section id -> the sid of its first row and the section as last pushed. */
    readonly sections: Map<number, { readonly sid: string; section: DiffSection }>;
    /** Edited paths whose path line is held back until the check after the edit: path -> its marker row's text. */
    readonly held: Map<string, string>;
    /** The turn's terminal event has passed: rows that arrive now are saved at once. */
    afterTerminal: boolean;
    ended: boolean;
  }
  let diffTurn: DiffTurn | undefined;
  let diffTurnSeq = 0;
  const openDiffTurn = (s: ChatSession): DiffTurn => {
    const dt: DiffTurn = { session: s, key: `d${Date.now().toString(36)}${(diffTurnSeq++).toString(36)}`, sections: new Map(), held: new Map(), afterTerminal: false, ended: false };
    diffTurn = dt;
    return dt;
  };
  /** Push a row the event path did not write, and post it while its session is the one shown. */
  const pushRow = (dt: DiffTurn, row: TranscriptEntry): void => {
    dt.session.transcript.push(row);
    const rowIndex = dt.session.transcript.length - 1;
    if (!disposed && session === dt.session) post({ type: 'transcript-row', rowIndex, row });
  };
  const pushMarker = (dt: DiffTurn, text: string): void => pushRow(dt, { role: 'marker', text, cssClass: MARKER_CLASS.edit, at: now() });
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  /** The text of the marker row a 'file-edit' event of this path writes. */
  const pathLine = (path: string): string => markerFor({ kind: 'file-edit', turnId: '', path, diff: { path, hunks: [] } })?.label ?? path;
  /** Settle one held path: it gets its path line when no section of the turn is in that file. */
  const settlePath = (dt: DiffTurn, path: string): void => {
    const text = dt.held.get(path);
    if (dt.ended || text === undefined) return;
    dt.held.delete(path);
    let shown = false;
    try {
      shown = governor !== undefined && deps.editGovernance !== undefined && governor.sectionPaths().has(deps.editGovernance.relPath(path));
    } catch (err) {
      warnGovernor('sectionPaths', err);
    }
    if (!shown) pushMarker(dt, text);
  };
  const settleHeld = (dt: DiffTurn): void => {
    for (const path of [...dt.held.keys()]) settlePath(dt, path);
  };
  /**
   * End the open diff state on any exit other than the turn's own end: a detach, a stop, an error
   * or the next turn's start. Held paths are settled at once against the sections known now, the
   * session is saved and the governor's turn is abandoned, so a check in flight shows nothing.
   */
  const endDiffTurn = (): void => {
    const dt = diffTurn;
    if (dt === undefined || dt.ended) return;
    settleHeld(dt);
    dt.ended = true;
    trySave(dt.session);
    if (governor !== undefined) governor.abandonTurn().catch((err: unknown) => warnGovernor('abandonTurn', err));
  };

  let governor: EditGovernor | undefined;
  if (deps.editGovernance !== undefined) {
    const eg = deps.editGovernance;
    const editRender: EditRenderSeam = {
      showSections: (ops, overflow) => {
        const dt = diffTurn;
        if (dt === undefined || dt.ended) return; // a result for a turn whose diff state has ended is dropped
        for (const op of ops) {
          if (op.op === 'add') {
            const sid = `${dt.key}-${op.id}`;
            dt.sections.set(op.id, { sid, section: op.section });
            pushRow(dt, { role: 'diff', sid, ...op.section, at: now() });
            continue;
          }
          const known = dt.sections.get(op.id);
          if (known === undefined) continue;
          if (op.op === 'update') {
            known.section = op.section;
            pushRow(dt, { role: 'diff', replaces: known.sid, ...op.section, at: now() });
          } else {
            const { path, oldStart, oldLines, newStart, newLines } = known.section;
            dt.sections.delete(op.id);
            pushRow(dt, { role: 'diff', replaces: known.sid, path, oldStart, oldLines, newStart, newLines, added: 0, removed: 0, lines: [], withdrawn: true, at: now() });
          }
        }
        if (overflow !== undefined) {
          const { sections: n, files: m } = overflow;
          pushMarker(dt, `${plural(n, 'more changed section', 'more changed sections')} in ${plural(m, 'file', 'files')} ${n === 1 ? 'is' : 'are'} not shown`);
        }
        if (dt.afterTerminal) trySave(dt.session);
      },
      sectionsUnreadable: () => {
        const dt = diffTurn;
        if (dt === undefined || dt.ended) return;
        pushMarker(dt, 'The changes of this turn could not be read');
        if (dt.afterTerminal) trySave(dt.session);
      },
      showEditor: (path, baseline, opts) => eg.editorDiff(path, baseline, opts),
    };
    governor = createEditGovernor({
      baseline: eg.baseline,
      fs: eg.fs,
      render: editRender,
      diffView: eg.diffView,
      logger: { warn: (m) => log.warn(m) },
      ...(eg.notify !== undefined ? { notify: eg.notify } : {}),
    });
  }

  /** The governor's calls are fired and forgotten: a failure is logged, never an unhandled rejection. */
  const warnGovernor = (step: string, err: unknown): void =>
    log.warn(`[chat] edit governor ${step} failed: ${err instanceof Error ? err.message : String(err)}`);

  // S005: (re)post the extension-local chat history so the webview history-dropdown stays current.
  const postHistory = (): void => post({ type: 'history-list', chats: [...deps.store.list()] });

  // Story E20261012ddc4ede1:S001: post a live event with the absolute transcript index of the row
  // it wrote (none for an event that writes no row), so the webview knows which row each node is.
  const postLive = (event: TurnEvent, rowIndex: number | undefined): void =>
    post({ type: 'turn-event', event, ...(rowIndex !== undefined ? { rowIndex } : {}) });

  // Story E20261012ddc4ede1:S001: every session-restored goes through here. Only the latest window
  // of the transcript is sent (never the whole history), with the absolute index of its first row
  // and the transcript's total row count; the webview asks for older pages with 'load-older'.
  const postRestored = (s: ChatSession): void => {
    const window = latestWindow(s.transcript);
    post({ type: 'session-restored', sessionId: s.id, transcript: [...window.rows], mode: permissionMode, firstIndex: window.firstIndex, total: s.transcript.length });
    postOutbox(); // Epic E20261014613abdb3 Story S002: each chat shows its own outbox
  };

  /**
   * Epic E20261014613abdb3 Story S002: the queue's rows as the worker last delivered them (undefined
   * while the queue is off or has not been read yet), projected to the shown chat's outbox and posted
   * after every change, whenever a chat is shown (which covers the webview's 'ready') and after an
   * action. A note is shown once, with the post it came with.
   */
  let outboxRows: readonly QueuedMessage[] | undefined;
  const postOutbox = (note?: string): void => {
    if (outboxRows === undefined || session === undefined) return;
    const view = projectOutbox(outboxRows, session.id, {
      titleOf: (id) => deps.store.get(id)?.title,
      here: (m) => queued?.message.seq === m.seq,
      ...(note !== undefined ? { note } : {}),
    });
    post({ type: 'outbox', view });
  };

  // S003 (dev-chat ux polish): record a resolved permission decision. Mirrors the tool-result
  // dual persist+render path (appendEvent): emit it LIVE as a turn-event the webview renders via the
  // registry (a resolved chip), AND persist it STRUCTURALLY as a role:'permission-outcome' transcript
  // row (+ save) so a restored session shows the decided chip instead of the live-only approval card.
  const recordPermissionOutcome = (toolName: string, approved: boolean, requestId: string): void => {
    const decision: 'approved' | 'rejected' = approved ? 'approved' : 'rejected';
    // Story E20261012ddc4ede1:S001: write the row first, so the event carries its row index.
    let rowIndex: number | undefined;
    if (session !== undefined) {
      session.transcript.push({ role: 'permission-outcome', toolName, decision, at: now() });
      rowIndex = session.transcript.length - 1;
    }
    postLive({ kind: 'permission-outcome', turnId: `perm-${requestId}`, toolName, decision }, rowIndex);
    if (session !== undefined) trySave(session);
  };

  // ISSUE-6a811b8a: where a request is answered. The adapters set it; a request without it is
  // routed as before the field existed (a request naming a tool was a claude refusal that ended
  // the turn; any other was answered inside the turn).
  const resolutionOf = (ev: Extract<TurnEvent, { kind: 'approval-request' }>): ApprovalResolution =>
    ev.resolution ?? (typeof ev.toolName === 'string' && ev.toolName !== '' ? 'turn-ended' : 'in-turn');

  // ISSUE-6a811b8a: post the queue head as the actionable card, once per request.
  const showApprovalHead = (): void => {
    const head = approvals.head();
    if (head === undefined) {
      shownApproval = undefined;
      return;
    }
    if (shownApproval === head.request.requestId) {
      // Requests joined the queue behind the shown card: update its count in place, never a second card.
      if (head.total !== shownTotal) {
        shownTotal = head.total;
        post({ type: 'approval-position', requestId: head.request.requestId, position: head.position, total: head.total });
      }
      return;
    }
    shownApproval = head.request.requestId;
    shownTotal = head.total;
    const r = head.request;
    post({
      type: 'turn-event',
      event: {
        kind: 'approval-request',
        turnId: r.turnId,
        requestId: r.requestId,
        title: r.title,
        detail: r.detail,
        ...(r.toolName !== undefined ? { toolName: r.toolName } : {}),
        ...(r.command !== undefined ? { command: r.command } : {}),
        resolution: r.resolution,
        ...(head.total > 1 ? { position: head.position, total: head.total } : {}),
      },
    });
  };

  // ISSUE-6a811b8a: queue a raised approval-request (instead of posting it) and show the head.
  /**
   * Epic E20261014613abdb3 Story S002: reports to the worker whether the running queued message waits
   * on an approval or a selection card, when that changes. While a queued message runs, the cards
   * in this window are its own.
   */
  const reportCards = (): void => {
    const q = queued;
    if (q === undefined) return;
    const now: WaitingOn = approvals.head() !== undefined ? 'approval' : pendingSelections.size > 0 ? 'selection' : undefined;
    if (now === q.waiting) return;
    q.waiting = now;
    try {
      q.onWaiting?.(now);
    } catch (err) {
      log.warn(`[chat] the queue could not be told about a waiting card: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const enqueueApproval = (ev: Extract<TurnEvent, { kind: 'approval-request' }>): void => {
    approvals.enqueue({
      requestId: ev.requestId,
      turnId: ev.turnId,
      title: ev.title,
      detail: ev.detail,
      ...(typeof ev.toolName === 'string' && ev.toolName !== '' ? { toolName: ev.toolName } : {}),
      ...(ev.command !== undefined && ev.command !== '' ? { command: ev.command } : {}),
      blockKind: classifyPermissionDenial(ev.detail),
      resolution: resolutionOf(ev),
    });
    reportCards(); // Story S002
    showApprovalHead();
  };

  // ISSUE-6a811b8a: Stop. Each request still waiting is recorded as rejected, and the queue cleared.
  const rejectQueuedApprovals = (): void => {
    shownApproval = undefined;
    for (const r of approvals.clear()) recordPermissionOutcome(r.toolName ?? r.title, false, r.requestId);
    reportCards(); // Story S002
  };

  // ISSUE-6a811b8a: the user typed a message instead of answering. A request the running turn is
  // waiting on is answered 'deny' first (so the provider stops waiting), then every waiting request
  // is recorded as rejected and the queue cleared, which also resets the grant chain: a later
  // follow-up never carries grants from before the typed message.
  const supersedeQueuedApprovals = (): void => {
    shownApproval = undefined;
    for (const r of approvals.clear()) {
      if (r.resolution === 'in-turn') relayDecision(r.requestId, 'deny');
      recordPermissionOutcome(r.toolName ?? r.title, false, r.requestId);
    }
    reportCards(); // Story S002
  };

  // ISSUE-6a811b8a: a chat switch or the panel closing. The waiting cards were live-only, so the
  // queue is dropped without outcome rows.
  const dropQueuedApprovals = (): void => {
    shownApproval = undefined;
    approvals.clear();
    reportCards(); // Story S002
  };

  /** Epic E20261014613abdb3 Story S001: ends the queued run with an outcome, once. */
  const endQueued = (outcome: TurnOutcome): void => {
    const q = queued;
    if (q === undefined) return;
    queued = undefined;
    if (q.waitTimer !== undefined) clearTimeout(q.waitTimer);
    q.resolve(outcome);
  };
  /**
   * Epic E20261014613abdb3 Story S001: decides whether the queued message is over, once none of its
   * turns is in progress. A Stop wins over the stopped CLI's own error; a view detached from a
   * session-file turn waits for that CLI to exit; a waiting approval or selection card holds the
   * message (and the repository's lease) until it is answered, or for continuationWaitMs.
   */
  const settleQueued = (): void => {
    const q = queued;
    if (q === undefined || q.turns > 0) return;
    if (q.stopped) return endQueued({ kind: 'stopped' });
    if (q.viewLost && q.terminal === undefined && q.error === undefined) {
      if (!q.spawned) return endQueued({ kind: 'stopped', reason: 'the turn was dropped before it started' });
      const cli = q.lastCli;
      // A session-file turn keeps running after its view was detached (its cursor is saved): the
      // message ends when that CLI exits. A pipe turn was stopped by the detach.
      if (q.session.liveTurn !== undefined && cli !== undefined) {
        void cli.exited.then(() => {
          if (queued === q) endQueued({ kind: 'detached-ended' });
        });
        return;
      }
      return endQueued({ kind: 'stopped', reason: 'the turn ended when the chat was switched or closed' });
    }
    if (!q.spawned && q.terminal === undefined && q.error === undefined) {
      return endQueued({ kind: 'stopped', reason: 'the turn was dropped before it started' });
    }
    const cardsWaiting = approvals.head() !== undefined || pendingSelections.size > 0;
    if (cardsWaiting && !q.viewLost) {
      if (q.waitTimer === undefined) {
        q.waitTimer = setTimeout(() => {
          if (queued !== q) return;
          rejectQueuedApprovals();
          pendingSelections.clear();
          endQueued({ kind: 'stopped', reason: 'no answer to the approval' });
        }, deps.continuationWaitMs ?? CONTINUATION_WAIT_MS);
      }
      return;
    }
    if (q.viewLost && cardsWaiting) return endQueued({ kind: 'stopped', reason: 'no answer to the approval' });
    if (q.error !== undefined || q.terminal === 'error') {
      // Story S004: the cause is read from the error text and reported with whether the agent acted; every failed turn is
      // logged with both, so a pattern the classifier missed is visible. The queue decides whether to retry.
      const error = q.error ?? 'the turn ended with an error';
      const cause = classifyFailure(error);
      log.warn(`[chat-queue] message ${q.message.key} failed: cause ${cause}, acted ${q.acted}, attempt ${q.message.attempts}: ${error}`);
      if (cause === 'auth' && !disposed) {
        const cli = /\b(claude|codex|vibe)\b/i.exec(error)?.[1]?.toLowerCase();
        const how = cli === 'codex' ? 'run `codex login` in a terminal' : cli === 'claude' ? 'run `claude` in a terminal and sign in with /login' : cli === 'vibe' ? 'run `vibe --setup` (or set MISTRAL_API_KEY) in a terminal' : 'sign in to the CLI in a terminal';
        persistInfo(q.session, `queue-signin-${q.message.turnId}`, `${cli ?? 'The CLI'} is not signed in — ${how}, then resend this message.`);
      }
      return endQueued({ kind: 'failed', error, acted: q.acted, cause });
    }
    endQueued({ kind: 'done' });
  };
  /** A chat switch, the panel closing or adopt() while a queued message runs. */
  const queuedViewLost = (): void => {
    if (queued !== undefined) queued.viewLost = true;
  };

  // A self-contained informational assistant message (its own turn id, so it closes itself).
  const postInfo = (turnId: string, text: string): void => {
    post({ type: 'turn-event', event: { kind: 'assistant-delta', turnId, text } });
    post({ type: 'turn-event', event: { kind: 'done', turnId, ok: true }, info: true }); // closes the line, not a turn (ISSUE-160fa1bb)
  };

  // Story S004: an informational line that is also stored (postInfo is live-only), so a reload still
  // shows it. Written like followLiveTurn writes a row: append, then post with the row's index.
  const persistInfo = (s: ChatSession, turnId: string, text: string): void => {
    const ev: TurnEvent = { kind: 'assistant-delta', turnId, text };
    const rowIndex = appendEvent(s, ev);
    postLive(ev, rowIndex);
    post({ type: 'turn-event', event: { kind: 'done', turnId, ok: true }, info: true }); // closes the line, not a turn (ISSUE-160fa1bb)
    trySave(s);
  };

  // ISSUE-6a811b8a: when a turn-ended batch is complete (its turn ended and every request it raised
  // is decided), run ONE follow-up for it, allowed every tool approved so far (the grant chain). A
  // single approved request keeps today's exact prompt; several get one prompt naming each approved
  // action and each denied one, so nothing already decided is asked again. Only one follow-up is
  // ever started per batch, so no approval can supersede another approval's follow-up.
  const runCompletedBatch = (): void => {
    const batch = approvals.takeCompletedBatch();
    if (batch === undefined) return;
    const action = (r: { toolName?: string | undefined; command?: string | undefined }): string =>
      r.command !== undefined && r.command !== '' ? `run exactly this: ${r.command}` : `the ${r.toolName ?? 'tool'} action you requested permission for`;
    const approved = batch.decisions.filter((d) => d.decision === 'approve' && d.request.blockKind === 'tool-gate').map((d) => d.request);
    const denied = batch.decisions.filter((d) => d.decision === 'deny').map((d) => d.request);
    const blocked = batch.decisions.filter((d) => d.decision === 'approve' && d.request.blockKind === 'dir-block').map((d) => d.request);
    if (approved.length === 0) {
      // Nothing to run. A single request keeps today's behaviour (its chip says it all); a batch
      // of several says so once.
      if (batch.decisions.length > 1) postInfo(`info-batch-${batch.turnId}`, 'No action was approved, so nothing was run.');
      return;
    }
    let prompt: string;
    if (batch.decisions.length === 1) {
      const only = approved[0]!;
      prompt =
        only.command !== undefined && only.command !== ''
          ? `Approved — run exactly this now: ${only.command}`
          : `Approved: please proceed with the ${only.toolName ?? 'tool'} action you requested permission for.`;
    } else {
      const lines = ['The permission requests have been decided.', 'Approved — do these now:', ...approved.map((r) => `- ${action(r)}`)];
      if (denied.length > 0) lines.push('Denied — do not attempt these:', ...denied.map((r) => `- ${action(r)}`));
      if (blocked.length > 0) lines.push('Still blocked (outside the allowed working directories) — do not attempt these:', ...blocked.map((r) => `- ${action(r)}`));
      prompt = lines.join('\n');
    }
    void runTurn(prompt, approvals.grantChain(), { suppressEcho: true });
  };

  // A provider that answers in-turn (control-protocol / codex): relay the decision to the LIVE
  // turn's captured adapter (its own provider, never the current session's — it may have
  // switched). decide() no-ops on an unknown/stale/dead requestId, so a late click is safe.
  const relayDecision = (requestId: string, decision: 'approve' | 'deny'): void => {
    const live = turns.live;
    if (live === undefined) return;
    try {
      deps.providers.get(live.provider).decide(live.turnId, requestId, decision);
    } catch (err: unknown) {
      // Adapter gone / provider unavailable: the decision is undeliverable. Never throw; the
      // decision is still recorded and the queue moves on (ISSUE-6a811b8a).
      log.warn(`[chat] approval decision for ${requestId} could not be delivered: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // S004 (dev-chat ux polish): record a resolved selection. Mirrors recordPermissionOutcome — emit
  // it LIVE as a turn-event the webview renders via the registry (a resolved chip), AND persist it
  // STRUCTURALLY as a role:'selection-outcome' transcript row (+ save) so a restored session shows the
  // decided chip instead of the live-only widget. `chosen` carries the LABELS (host-resolved from ids).
  const recordSelectionOutcome = (requestId: string, chosen: readonly string[]): void => {
    // Story E20261012ddc4ede1:S001: write the row first, so the event carries its row index.
    let rowIndex: number | undefined;
    if (session !== undefined) {
      session.transcript.push({ role: 'selection-outcome', chosen: [...chosen], at: now() });
      rowIndex = session.transcript.length - 1;
    }
    postLive({ kind: 'selection-outcome', turnId: `sel-${requestId}`, chosen }, rowIndex);
    if (session !== undefined) trySave(session);
  };

  // S001 (bugfix): (re)send the full view state to the webview. Called on every 'ready' handshake
  // (handleMessage) — the initial load AND every VS-Code webview reload (show-after-hide / restore,
  // since the panel carries no retainContextWhenHidden). Posting this synchronously after setHtml
  // instead would race the not-yet-attached listener and be lost, leaving an empty dropdown +
  // transcript even though the store has the sessions (the root cause of the "history disappeared"
  // regression). A no-agentic-CLI environment surfaces the same error a fresh open would.
  /**
   * Follow a session's saved turn (its output still being read from the session file, e.g. after
   * a window reload) from where it was left. Only the cursor's owner follows it: this host, or any
   * host once the owner's extension host is gone (it then takes ownership). Events after the cursor
   * are posted (while the session is shown) and appended; the cursor is cleared at the end.
   */
  // Story E20261013e62a9269:S001: the presenter's three calls. A presenter that throws is
  // logged and the turn goes on.
  const beginPresented = (): PresentedTurn | undefined => {
    if (deps.presenter === undefined) return undefined;
    try {
      return deps.presenter.begin();
    } catch (err) {
      log.error(`chat: the review presenter failed to begin a turn: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  };
  // Story E20261015067b05b6:S001: the documents a turn declared were opened or were not: say so in the
  // chat, as a line under no turn of its own (live only: it is about the review pane, not the conversation).
  let presentNotes = 0;
  const reportDeclared = (outcome: DeclaredOutcome, canShow: () => boolean): void => {
    if (disposed || !canShow()) return;
    if (outcome.unreadable) {
      postInfo(`present-note-${++presentNotes}`, 'The documents for review could not be opened: the pending list could not be read.');
    } else if (outcome.notPending.length > 0) {
      postInfo(`present-note-${++presentNotes}`, `Not shown for review (not pending approval, or the name matches more than one document): ${outcome.notPending.join(', ')}.`);
    }
  };
  const presentDeclared = (shown: PresentedTurn | undefined, ev: TurnEvent, canShow: () => boolean): void => {
    if (shown === undefined || ev.kind !== 'tool-call' || ev.present === undefined) return;
    try {
      shown
        .declared(ev.present)
        .then((outcome) => reportDeclared(outcome, canShow))
        .catch((err: unknown) => log.error(`chat: the review presenter failed on a declaration: ${err instanceof Error ? err.message : String(err)}`));
    } catch (err) {
      log.error(`chat: the review presenter failed on a declaration: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const endPresented = (shown: PresentedTurn | undefined): void => {
    if (shown === undefined) return;
    try {
      shown.end();
    } catch (err) {
      log.error(`chat: the review presenter failed to end a turn: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const followLiveTurn = (s: ChatSession): void => {
    // ISSUE-6a811b8a: the turns this follow raised approval requests for, so its end ends their batch
    // even when the output ends without a terminal event.
    const followedTurns = new Set<string>();
    // Story E20261013e62a9269:S001: begun on the follow's first event, never when the follow is
    // asked for: this is asked for on every webview ready, and turns.follow returns without
    // following while this host runs the turn, whose own presented turn must stay the newest.
    let shown: PresentedTurn | undefined;
    turns.follow(s, {
      onEvent: (ev) => {
        if (shown === undefined) shown = beginPresented();
        presentDeclared(shown, ev, () => session === s);
        // A followed turn's approval requests go through the queue like a live one's.
        // Story E20261012ddc4ede1:S001: write the row first, then post the event with the row's
        // index. The write does not depend on whether the session is shown.
        const rowIndex = appendEvent(s, ev);
        if (!disposed && session === s) {
          if (ev.kind === 'approval-request') {
            followedTurns.add(ev.turnId);
            enqueueApproval(ev);
          } else postLive(ev, rowIndex);
          if (ev.kind === 'done' || ev.kind === 'error') approvals.endTurn(ev.turnId);
        }
      },
      onEnd: (outcome) => {
        // A failed resume leaves the turn's cursor saved for a later follow; nothing has ended.
        if (outcome === 'ended') endPresented(shown);
        if (outcome === 'ended' && session === s) {
          for (const turnId of followedTurns) approvals.endTurn(turnId);
          runCompletedBatch();
          postHistory();
        }
      },
    });
  };

  /** The panel is gone: its webview no longer listens, so nothing waits for 'ready' until a new one posts it. */
  const markViewGone = (): void => {
    webviewReady = false;
  };

  const postInitialState = (): void => {
    post({ type: 'theme', theme });
    const available = deps.providers.available;
    if (available.length === 0) {
      post({ type: 'turn-event', event: { kind: 'error', turnId: 'none', message: 'no agentic CLI (claude/codex) installed' } });
      return;
    }
    // A DRAFT session (in-memory, not persisted): opening the chat does not save an empty session
    // to history; it enters the store only on the first turn (runTurn's save).
    if (session === undefined) session = deps.store.draft(available[0]!);
    permissionMode = modeOf(session); // S001 (bugfix): adopt the active session's persisted mode
    postRestored(session);
    postPending(session.id); // the rebuilt webview gets the chips it had
    // ISSUE-6a811b8a: session-restored cleared the webview, including the shown approval card;
    // post the queue head again (once) with its position so the queue can still be answered.
    shownApproval = undefined;
    showApprovalHead();
    postHistory();
    followLiveTurn(session);
  };

  // LLM chat titling: after the first turn, an INJECTED deriveTitle (extension.ts wires the
  // one-shot CLI call) produces a short name that swaps in over the truncated first-prompt
  // fallback. When no deriveTitle is provided (or it fails), the fallback stays. The one-shot
  // itself lives in cli-adapter.ts (timeout-bounded) so the host stays free of a CLI call that
  // could hang the turn machinery.
  const TITLE_MAXLEN = 60;
  const sanitizeTitle = (raw: string): string =>
    raw.replace(/\s+/g, ' ').replace(/^[\s"'`.–—-]+|[\s"'`.]+$/g, '').trim().slice(0, TITLE_MAXLEN);
  const applyTitle = async (target: ChatSession, firstPrompt: string): Promise<void> => {
    if (deps.deriveTitle === undefined) return;
    let raw: string | undefined;
    try {
      raw = await deps.deriveTitle({ provider: target.provider, prompt: firstPrompt, cwd: deps.cwd() });
    } catch {
      return; // keep the fallback title
    }
    if (raw === undefined) return;
    const title = sanitizeTitle(raw);
    if (title === '') return;
    target.title = title;
    trySave(target);
    postHistory(); // refresh the history dropdown with the LLM-derived name
  };

  const renderShell = (): string => {
    const nonce = genNonce();
    const style = renderStyle(theme); // a complete <style>…</style> (sc1 palette: --it-* tokens)
    // `img-src data:` is load-bearing, not decoration: the header session switcher paints its
    // clock/history glyph as an inline data-URI SVG background layer (.chrome #insrc-history below).
    // A CSS background-image url() is fetched under `img-src`, so without this directive it inherits
    // `default-src 'none'` and the browser blocks the icon while the sibling linear-gradient arrow
    // layers (not fetches) still paint — the glyph silently disappears. Scoped to `data:` ONLY: no
    // remote origin becomes loadable, scripts stay nonce-only, and default-src stays 'none'.
    const csp = `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    // The chat-surface LAYOUT (S003), ported VERBATIM from the reviewed S001 design mock
    // (docs/epics/…/S001/mocks.html): a single-dark terminal .box (chrome header · .pad transcript
    // with row/gutter markers · dashed .inputline with a ❯ caret · .statusbar), filling the panel
    // edge to edge. The sc1 renderTerminalStyle still supplies the marker ::before glyphs; this
    // owns the frame and the colours.
    // Story E202610137fefc3fc:S001: the chat follows the VS Code theme. The `:root` rule is the one
    // place its colours are chosen: every name holds a --vscode-* theme variable, and a fallback is
    // always another theme variable, never a literal. Every border name leads with the
    // high-contrast border. The rules below, RENDER_REGISTRY_STYLE and CHAT_MARKDOWN_TOKENS use
    // only these names: no hex, rgb, hsl or tint gradient anywhere in the chat's style, and one
    // color-mix (--assistant-bg, below).
    const layoutStyle =
      `<style>` +
      `:root{--font:var(--vscode-editor-font-family);--sans:var(--vscode-editor-font-family);` +
      // grounds
      `--bg:var(--vscode-editor-background);--panel:var(--vscode-editor-background);--bg-inset:var(--vscode-editorWidget-background);` +
      `--code-bg:var(--vscode-textCodeBlock-background);--pre-bg:var(--vscode-textPreformat-background,var(--vscode-textCodeBlock-background));` +
      `--user-bg:var(--vscode-chat-requestBackground,var(--vscode-editor-inactiveSelectionBackground));--warn-bg:var(--vscode-inputValidation-warningBackground);` +
      `--add-bg:var(--vscode-diffEditor-insertedLineBackground,var(--vscode-diffEditor-insertedTextBackground));--del-bg:var(--vscode-diffEditor-removedLineBackground,var(--vscode-diffEditor-removedTextBackground));` +
      `--quote-bg:var(--vscode-textBlockQuote-background);--sel:var(--vscode-editor-selectionBackground);` +
      // The one derived colour, asked for by the user on 2026-10-13: the assistant's message sits on
      // a slightly darker shade of the panel ground, because a theme may give borders no contrast
      // at all (Atom Material: 1.06 to 1), which left the message with no visible edge.
      `--assistant-bg:color-mix(in srgb,var(--vscode-editor-background) 90%,black);` +
      // text
      `--fg:var(--vscode-editor-foreground);--fg-strong:var(--vscode-editor-foreground);--muted:var(--vscode-descriptionForeground);--dim:var(--vscode-descriptionForeground);` +
      `--input-fg:var(--vscode-input-foreground);--placeholder:var(--vscode-input-placeholderForeground);--link:var(--vscode-textLink-foreground);--pre-fg:var(--vscode-textPreformat-foreground);` +
      // borders (the high-contrast border first, so high-contrast themes get their outline)
      `--border:var(--vscode-contrastBorder,var(--vscode-panel-border));--border-lit:var(--vscode-contrastBorder,var(--vscode-editorWidget-border,var(--vscode-panel-border)));` +
      // Both message bubbles take the chat request border: VS Code gives it a visible default even
      // where a theme's own widget and panel borders have no contrast.
      `--msg-border:var(--vscode-contrastBorder,var(--vscode-chat-requestBorder,var(--vscode-editorWidget-border,var(--vscode-panel-border))));` +
      `--warn-border:var(--vscode-contrastBorder,var(--vscode-inputValidation-warningBorder));--quote-border:var(--vscode-textBlockQuote-border);--sep:var(--vscode-textSeparator-foreground);` +
      // In a high-contrast theme a diff line has no ground of its own; the theme outlines it instead.
      `--add-border:var(--vscode-diffEditor-insertedTextBorder,transparent);--del-border:var(--vscode-diffEditor-removedTextBorder,transparent);--focus:var(--vscode-focusBorder);` +
      // the theme's terminal palette: markers, role labels, the send control
      `--accent:var(--vscode-terminal-ansiGreen);--accent2:var(--vscode-terminal-ansiCyan);--amber:var(--vscode-terminal-ansiYellow);--magenta:var(--vscode-terminal-ansiMagenta);--user:var(--vscode-terminal-ansiBlue);` +
      // states
      `--red:var(--vscode-errorForeground);--warn:var(--vscode-editorWarning-foreground);--pass:var(--vscode-testing-iconPassed);--fail:var(--vscode-testing-iconFailed);--progress:var(--vscode-progressBar-background);` +
      // controls
      `--btn-bg:var(--vscode-button-background);--btn-fg:var(--vscode-button-foreground);--btn-hover:var(--vscode-button-hoverBackground);` +
      `--btn2-bg:var(--vscode-button-secondaryBackground);--btn2-fg:var(--vscode-button-secondaryForeground);--btn2-hover:var(--vscode-button-secondaryHoverBackground);` +
      `--dropdown-bg:var(--vscode-dropdown-background);--dropdown-fg:var(--vscode-dropdown-foreground);--dropdown-border:var(--vscode-contrastBorder,var(--vscode-dropdown-border));` +
      `--check-bg:var(--vscode-checkbox-background);--check-fg:var(--vscode-checkbox-foreground);--check-border:var(--vscode-contrastBorder,var(--vscode-checkbox-border));}` +
      // The colour scheme (form controls, scrollbars) follows the theme-kind class VS Code puts on
      // the body. High-contrast light also carries the plain high-contrast class, so it comes last.
      `body.vscode-light{color-scheme:light;}body.vscode-dark{color-scheme:dark;}body.vscode-high-contrast{color-scheme:dark;}body.vscode-high-contrast-light{color-scheme:light;}` +
      `*{box-sizing:border-box;}html,body{height:100%;width:100%;}` +
      `body{margin:0;padding:0;display:flex;background:var(--bg);color:var(--fg);font-family:var(--font);font-size:13.5px;line-height:1.5;-webkit-font-smoothing:antialiased;}` +
      // The body carries the shared sheet's `.insrc-term` class, whose rule out-ranks a plain `body`
      // rule and paints from that sheet's own tokens (theme variables with fixed fallbacks). This
      // rule out-ranks it in turn, so the body's ground, text and font come from the layer above.
      `body.insrc-term{background:var(--bg);color:var(--fg);font-family:var(--font);}` +
      `::selection{background:var(--sel);}a{color:var(--link);}` +
      // Full-bleed: the .box IS the whole panel (approved --panel surface), edge to edge — no floating
      // card border/radius/shadow (that framing was the mock's page card; in-panel it fills).
      `.box{flex:1 1 auto;width:100%;min-width:0;display:flex;flex-direction:column;min-height:0;background:var(--panel);overflow:hidden;}` +
      `.chrome{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-inset);border-bottom:1px solid var(--border-lit);color:var(--muted);font-size:12px;flex:0 0 auto;flex-wrap:wrap;}` +
      `.chrome .right{margin-left:auto;display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;}` +
      // The scrolling transcript band (mock .term): the only overflow region, its own padding +
      // subtle top gradient. Replaces the former inset .pad wrapper so progress/input are full bars.
      `#insrc-term{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:14px;padding:16px 14px;white-space:pre-wrap;word-break:break-word;color:var(--fg);background:var(--panel);}` +
      // Story E20261013b2e8109f:S001: a row of the transcript never shrinks. A row with overflow:hidden
      // has a minimum height of zero in a flex column, which is how the old diff box was squashed to nothing.
      `#insrc-term>*{flex-shrink:0;}` +
      `#insrc-term>div{white-space:pre-wrap;}` +
      // Story E20261012ddc4ede1:S001: the 'load earlier' bar above the transcript. The pager shows
      // it (with the count of older rows) only while rows older than the first held one exist.
      `#insrc-older{flex:0 0 auto;padding:5px 14px;text-align:center;font-size:12px;color:var(--muted);border-bottom:1px solid var(--border);cursor:pointer;}` +
      `#insrc-older:hover{color:var(--fg);}` +
      `.insrc-term__marker--pending{color:var(--muted);}.insrc-term__marker--pending::before{color:var(--magenta)!important;margin-right:.55em;}` +
      `.insrc-term__marker--tool{color:var(--accent2);}.insrc-term__marker--tool::before{color:var(--accent2)!important;margin-right:.55em;}` +
      `.insrc-term__marker--edit{color:var(--fg);}.insrc-term__marker--edit::before{color:var(--amber)!important;margin-right:.55em;}` +
      `.insrc-term__marker--done{color:var(--muted);}.insrc-term__marker--done::before{color:var(--accent)!important;margin-right:.55em;}` +
      `.insrc-term__marker--error{color:var(--red);}.insrc-term__marker--error::before{color:var(--red)!important;margin-right:.55em;}` +
      // Bottom-pinned input bar (mock .inputbar): a full-width band with a top border + inset ground.
      `.inputbar{display:flex;gap:9px;align-items:flex-end;padding:11px 12px;border-top:1px solid var(--border-lit);background:var(--bg-inset);flex:0 0 auto;}` +
      // S002 (ux-polish): the leading '>' prompt IS the clickable send/stop control — ❯ (terminal-green
      // shell prompt) at rest, ■ (red) while a turn runs. The separate trailing send button is retired,
      // so there is exactly one send/stop affordance. A comfortably clickable target, bottom-aligned to
      // the textarea; the glyph/class are toggled by setRunning.
      // S001 (ISSUE-c96399d1) delta 1: top-align the ❯ (align-self:flex-start) so it leads the FIRST line
      // of the flush 2-line prompt only (it no longer sits at the bottom beside a box).
      `#insrc-prompt{flex:0 0 auto;align-self:flex-start;display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:40px;color:var(--accent);font-family:var(--font);font-size:16px;line-height:1;cursor:pointer;outline:none;user-select:none;padding:0 4px;}` +
      `#insrc-prompt:hover{filter:brightness(1.15);}#insrc-prompt:focus-visible{color:var(--fg-strong);}#insrc-prompt.stop{color:var(--red);font-size:13px;}` +
      // S002 ac3: the SINGLE animated progress bar above the input (mock .progress; live-only, never
      // persisted): 3 blinking dots + a label + a right-aligned tabular elapsed timer.
      `#insrc-progress{display:flex;align-items:center;gap:10px;padding:7px 14px;border-top:1px solid var(--border-lit);background:var(--bg-inset);color:var(--muted);font-size:12px;flex:0 0 auto;}` +
      `#insrc-progress .spin{display:inline-flex;gap:4px;flex:0 0 auto;}` +
      `#insrc-progress .spin i{width:6px;height:6px;border-radius:50%;background:var(--progress);opacity:.35;animation:insrc-blink 1.1s infinite;}` +
      `#insrc-progress .spin i:nth-child(2){animation-delay:.18s;}#insrc-progress .spin i:nth-child(3){animation-delay:.36s;}` +
      `#insrc-progress .elapsed{margin-left:auto;color:var(--dim);font-variant-numeric:tabular-nums;}` +
      `@keyframes insrc-blink{0%,100%{opacity:.30;transform:translateY(0);}40%{opacity:1;transform:translateY(-2px);}}` +
      // ISSUE (always visible): the idle state when no turn runs: the same three dots, breathing slowly (a longer,
      // gentler cycle than the working blink, no vertical movement).
      `#insrc-progress.idle .spin i{background:var(--muted);animation:insrc-breathe 3.6s ease-in-out infinite;}` +
      `#insrc-progress.idle .spin i:nth-child(2){animation-delay:.3s;}#insrc-progress.idle .spin i:nth-child(3){animation-delay:.6s;}` +
      `@keyframes insrc-breathe{0%,100%{opacity:.20;}50%{opacity:.65;}}` +
      `@media (prefers-reduced-motion:reduce){#insrc-progress .spin i,#insrc-progress.idle .spin i{animation:none;opacity:.7;}}` +
      // S001 (ISSUE-c96399d1) delta 1: the input reads as a FLUSH 2-line terminal prompt — no bordered
      // box (no border/border-radius/background). rows=2 (no auto-grow) pins the visible height at 2 lines
      // and a longer message scrolls natively inside it (a textarea scrolls its own content by default —
      // we deliberately do NOT add overflow-y:auto so #insrc-term stays the panel's single scroll region).
      `#insrc-input{flex:1 1 auto;min-width:0;resize:none;height:40px;background:transparent;color:var(--input-fg);caret-color:var(--accent);padding:9px 4px;font-family:var(--font);font-size:13px;line-height:1.5;outline:none;}` +
      `#insrc-input::placeholder{color:var(--placeholder);}` +
      `.statusbar{display:flex;gap:12px;align-items:center;padding:7px 13px;background:var(--bg-inset);border-top:1px solid var(--border-lit);color:var(--muted);font-size:11.5px;flex-wrap:wrap;flex:0 0 auto;}` +
      // ISSUE-6ae99f6e: the functional provider + mode (edits) selects live in the status bar, styled as
      // segments; the mode seg carries the amber 'auto-approve' pill (S004 k6 i) via .statusbar .perm-auto.
      `.statusbar .seg{display:inline-flex;align-items:center;gap:5px;}` +
      // Story E2026101259da3204:S001: the icon-only attach control (first in the status bar) and
      // the row of pending attachments between the input and the status bar.
      (att === undefined
        ? ''
        : `.attachbtn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;background:transparent;border:1px solid transparent;border-radius:4px;color:var(--muted);cursor:pointer;}` +
          `.attachbtn:hover,.attachbtn:focus-visible{color:var(--accent);border-color:var(--border-lit);outline:none;}` +
          `.attachbtn svg{width:14px;height:14px;}` +
          `.attachbar{padding:0 12px 8px;background:var(--bg-inset);flex:0 0 auto;}` +
          `.attachbar[hidden],.atterr[hidden]{display:none;}` +
          `.attlist{display:flex;flex-wrap:wrap;gap:6px;}` +
          `.attchip{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:2px 4px 2px 8px;border:1px solid var(--border-lit);border-radius:4px;color:var(--fg);font-size:12px;}` +
          `.attchip__thumb{width:20px;height:20px;object-fit:cover;border-radius:2px;flex:0 0 auto;}` +
          `.attchip__glyph{color:var(--accent);flex:0 0 auto;}` +
          `.attchip__name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:28ch;}` +
          `.attchip__size{color:var(--muted);flex:0 0 auto;}` +
          `.attchip__x{cursor:pointer;color:var(--muted);padding:0 4px;flex:0 0 auto;}` +
          `.attchip__x:hover,.attchip__x:focus-visible{color:var(--red);outline:none;}` +
          `.atterr{color:var(--red);font-size:11.5px;padding-top:4px;}`) +
      // Epic E20261014613abdb3 Story S002: the outbox band above the input bar, and the queue hint.
      (deps.queue === undefined
        ? ''
        : `.outbox{padding:6px 12px;background:var(--bg-inset);border-top:1px solid var(--border-lit);flex:0 0 auto;max-height:30vh;overflow-y:auto;font-size:12px;}` +
          `.outbox[hidden],.outbox__note[hidden],.outbox__sum[hidden]{display:none;}` +
          `.outbox__sum{color:var(--muted);font-size:11.5px;padding-bottom:4px;}` +
          `.outbox__row{display:flex;align-items:center;gap:8px;padding:3px 4px 3px 8px;margin-top:4px;border:1px solid var(--border-lit);border-radius:8px;color:var(--fg);}` +
          `.outbox__place{color:var(--accent);font-weight:600;flex:0 0 auto;min-width:2.2em;}` +
          `.outbox__row--failed .outbox__place,.outbox__row--not-delivered .outbox__place{color:var(--red);}` +
          `.outbox__text{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}` +
          `.outbox__err{color:var(--red);flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40%;}` +
          `.outbox__files{color:var(--muted);flex:0 0 auto;}` +
          `.outbox__btn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:0 0 auto;border-radius:50%;border:1px solid var(--border-lit);color:var(--muted);cursor:pointer;}` +
          `.outbox__btn:hover,.outbox__btn:focus-visible{color:var(--accent);border-color:var(--accent);outline:none;}` +
          `.outbox__note{color:var(--warn);font-size:11.5px;padding-top:4px;}`) +
      `.statusbar .perm-auto{color:var(--warn);border:1px solid var(--warn);border-radius:999px;padding:2px 9px;}` +
      // The provider/session/edits selects, styled as the bold segment value (transparent, borderless).
      `.segsel{appearance:none;-webkit-appearance:none;background:transparent;border:none;color:var(--fg);font-family:var(--font);font-size:12px;font-weight:500;line-height:1.2;padding:0 14px 0 2px;margin:0;cursor:pointer;outline:none;` +
      `background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 6px) 55%,calc(100% - 3px) 55%;background-size:3px 3px,3px 3px;background-repeat:no-repeat;}` +
      `.segsel:hover{color:var(--accent);}.segsel:disabled{opacity:.5;cursor:default;}.segsel option{background:var(--dropdown-bg);color:var(--dropdown-fg);font-weight:400;}` +
      // Keep the header session switcher compact so a long session name can't overflow the chrome —
      // it is the only control in the header now (its selected option shows the active session).
      // ISSUE-bd2d6b6a: it is rendered as a CHIP — a bordered, faintly-filled, rounded container —
      // rather than as a bare .segsel. The clock/history glyph, the session label and the arrow are
      // three marks that .segsel would leave floating transparent on the chrome background with no
      // grouping cue, so the switcher read as TWO controls (a detached dim icon, then label+arrow).
      // Enclosure binds them whatever the session name happens to be. This is a DELIBERATE departure
      // from the borderless .segsel seg language kept by the footer provider/edits selects: this is
      // the sole header control and the only one carrying an icon.
      // Story E202610137fefc3fc:S001: the chip is a wrapper around the select, so its ground,
      // border and glyph can all come from the theme; the glyph sits inside the chip's left
      // padding, not at its bare edge. The select keeps its own two arrow layers from .segsel.
      `.histchip{position:relative;display:inline-flex;align-items:center;max-width:36ch;padding:3px 2px 3px 22px;background:var(--dropdown-bg);border:1px solid var(--dropdown-border);border-radius:6px;color:var(--fg);}` +
      // The glyph is a mask filled with the chip's text colour, so it follows the theme. A mask
      // image is fetched under `img-src`, which allows `data:`.
      `.histchip::before{content:"";position:absolute;left:6px;top:50%;width:12px;height:12px;margin-top:-6px;background-color:currentColor;pointer-events:none;` +
      `-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.5 8a5.5 5.5 0 1 0 1.6-3.9'/%3E%3Cpath d='M2.4 3.1v2.2h2.2'/%3E%3Cpath d='M8 5.2V8l2 1.2'/%3E%3C/svg%3E") center/12px 12px no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='currentColor' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.5 8a5.5 5.5 0 1 0 1.6-3.9'/%3E%3Cpath d='M2.4 3.1v2.2h2.2'/%3E%3Cpath d='M8 5.2V8l2 1.2'/%3E%3C/svg%3E") center/12px 12px no-repeat;}` +
      `.chrome #insrc-history{max-width:100%;}` +
      // The ground and text are set here too: the shared sheet's `.insrc-term-diff` rule would paint them.
      `.insrc-term-diff{border:1px solid var(--border-lit);border-radius:6px;margin:6px 0;overflow:hidden;background:var(--panel);color:var(--fg);}` +
      // S001 sc1: the shared collapse/chevron primitive styles (icon-only chevron + 3-line clamp, k6 a/b).
      RENDER_REGISTRY_STYLE +
      // S001 (bugfix) — full mock parity (k5, docs/epics/…/mocks.html): the .msg card system.
      // A message is a column of a `.insrc-who` role label above a bordered `.insrc-bubble`
      // (user = right-aligned blue card; assistant = magenta-left-border card). Reuses the sc1
      // .insrc-collapse* primitive inside the bubble for long messages. Inline under the CSP (k1).
      `.insrc-msg{display:flex;flex-direction:column;gap:4px;max-width:100%;white-space:normal;}` +
      `.insrc-who{font-size:11px;letter-spacing:.06em;text-transform:uppercase;display:inline-flex;align-items:center;gap:6px;white-space:normal;}` +
      `.insrc-who .insrc-glyph{font-size:12px;}` +
      `.insrc-msg--user{align-items:flex-end;}.insrc-who--user{color:var(--user);}` +
      `.insrc-bubble--user{background:var(--user-bg);border:1px solid var(--msg-border);border-radius:10px 10px 2px 10px;padding:9px 12px;color:var(--fg-strong);max-width:100%;white-space:pre-wrap;word-break:break-word;}` +
      `.insrc-who--assistant{color:var(--magenta);}` +
      `.insrc-bubble--assistant{background:var(--assistant-bg);border:1px solid var(--msg-border);border-radius:2px 10px 10px 10px;padding:10px 13px;max-width:100%;white-space:pre-wrap;word-break:break-word;}` +
      // tool-call: the mock's bordered .toolrow with a green $ prompt, under a cyan '▸ tool' label.
      `.insrc-who--tool{color:var(--accent2);}` +
      `.insrc-toolrow{display:flex;gap:9px;align-items:flex-start;border:1px solid var(--border-lit);border-radius:8px;background:var(--code-bg);padding:8px 11px;max-width:100%;}` +
      `.insrc-toolrow__cmd{color:var(--fg-strong);white-space:pre-wrap;word-break:break-word;font-family:var(--font);}` +
      `.insrc-toolrow__prompt{color:var(--accent);}` +
      // rendered markdown reads as "rendered": the sans face, mock spacing, cyan inline code chips.
      // The markdown element rules now live in ONE place — markdown-style.ts — because
      // the docs-review surface renders marked output too (S001/t4). Extracted, not
      // copied: emitted output here is byte-identical to the previous inline rules,
      // verified by a dedicated test, and this surface keeps its own `:root` palette.
      renderMarkdownStyle(CHAT_MARKDOWN_TOKENS) +
      // What the shared markdown rules have no token for: inline code's own ground (a fenced
      // block keeps the code-block ground), block quotes, rules and links.
      `.insrc-md code{background:var(--pre-bg);}.insrc-md pre code{background:none;}` +
      `.insrc-md blockquote{background:var(--quote-bg);border-left-color:var(--quote-border);}` +
      `.insrc-md hr{border-top-color:var(--sep);}.insrc-md a{color:var(--link);}${LINK_MARKUP_STYLE}` +
      // JSON widget: a bordered code surface with key/value/punct tones (mock .jsonw).
      `.insrc-json{font-family:var(--font);border:1px solid var(--border-lit);border-radius:8px;background:var(--code-bg);padding:8px 11px;font-size:12.5px;line-height:1.55;}` +
      `.insrc-json .insrc-json-key{color:var(--accent2);}.insrc-json .insrc-json-val{color:var(--accent);}.insrc-json .insrc-json-punct{color:var(--dim);}` +
      `.insrc-caption{color:var(--muted);cursor:default;font-size:11px;letter-spacing:.05em;text-transform:uppercase;}` +
      // Keyboard focus is shown in the theme's focus colour (last, so it wins over the rules above).
      `#insrc-prompt:focus-visible,#insrc-older:focus-visible,.segsel:focus-visible,.attachbtn:focus-visible,.attchip__x:focus-visible,.insrc-attchip:focus-visible{outline:1px solid var(--focus);outline-offset:1px;}` +
      `</style>`;
    const provCls = surfaceClass('provider-dropdown');
    const histCls = surfaceClass('history-dropdown');
    // S005: provider <option>s are rendered server-side from providers.available (the
    // installed claude/codex set is fixed per panel, k4) so NO new sc3 message is needed;
    // values are attribute-escaped. Empty available -> the selector is disabled.
    const available = deps.providers.available;
    // No placeholder: the select shows the ACTIVE session's provider (set from history-list on
    // restore); picking a different provider starts a new chat with it.
    const providerOpts = available.map((p) => `<option value="${attr(p)}">${attr(p)}</option>`).join('');
    const provDisabled = available.length === 0 ? ' disabled' : '';
    // Story E2026101259da3204:S001: the attachment controls, present only with the host's seams.
    // The host owns the pending list; this draws what attachments-pending says and asks for
    // changes by message. A pasted image is read here, sent as base64, and its data: URL kept as
    // the chip's thumbnail (matched by clientId; the policy's `img-src data:` allows it). Chips are
    // built with textContent, and a file is only ever named by the id the host issued.
    const attachOn = att !== undefined;
    // Epic E20261014613abdb3 Story S002: the outbox, drawn only from what the host posts ('outbox'),
    // with textContent. Waiting rows show their place and a cancel button; failed and undelivered
    // rows show the reason with resend and dismiss. Buttons are round, icon-only, keyboard-reachable.
    const queueOn = deps.queue !== undefined;
    const outboxScript = !queueOn
      ? ''
      : `var obBox=document.getElementById('insrc-outbox'),obSum=document.getElementById('insrc-obsum'),obList=document.getElementById('insrc-oblist'),obNote=document.getElementById('insrc-obnote');` +
        `function obBtn(glyph,label,type,seq){var b=document.createElement('span');b.className='outbox__btn';b.setAttribute('role','button');b.setAttribute('tabindex','0');b.setAttribute('aria-label',label);b.setAttribute('title',label);b.textContent=glyph;` +
        `function go(){vs.postMessage({v:1,payload:{type:type,seq:seq}});}` +
        `b.addEventListener('click',go);b.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});return b;}` +
        `function obSpan(cls,text){var x=document.createElement('span');x.className=cls;x.textContent=text;return x;}` +
        `var obCounts=[],obTimer=0;` +
        `function obTick(){var n=Date.now();obCounts.forEach(function(c){var s=Math.max(0,Math.ceil((c.at-n)/1000));c.el.textContent=s>0?'retrying in '+(s>=60?Math.floor(s/60)+'m '+(s%60)+'s':s+'s'):'retrying now';});` +
        `if(obCounts.length===0&&obTimer){clearInterval(obTimer);obTimer=0;}}` +
        `function renderOutbox(v){if(!v||v.sessionId!==cur)return;obCounts=[];` +
        `var parts=[];var n=v.aheadFromOtherChats||0;if(n>0)parts.push(n+(n===1?' message':' messages')+' from other chats ahead');` +
        `if(v.runningChat)parts.push('running: \u201c'+String(v.runningChat.title)+'\u201d'+(v.runningChat.here?' (this window)':''));` +
        `if(v.blockedBy)parts.push('waiting for '+(v.blockedBy.reason==='selection'?'a choice':'an approval')+' in \u201c'+String(v.blockedBy.chatTitle)+'\u201d');` +
        `obSum.textContent=parts.join(' \u00b7 ');obSum.hidden=parts.length===0;` +
        `obList.textContent='';var rows=v.rows||[];` +
        `rows.forEach(function(r){var row=document.createElement('div');row.className='outbox__row outbox__row--'+String(r.state);` +
        `var text=String(r.text||'');var first=text.split('\\n')[0];` +
        `row.appendChild(obSpan('outbox__place',typeof r.position==='number'?'#'+r.position:(r.state==='not-delivered'?'not sent':String(r.state))));` +
        `var t=obSpan('outbox__text',first||(r.attachments>0?'':'(empty)'));t.setAttribute('title',text);row.appendChild(t);` +
        `if(r.attachments>0)row.appendChild(obSpan('outbox__files','\ud83d\udcce'+r.attachments));` +
        `if(r.error){var er=obSpan('outbox__err',String(r.error));er.setAttribute('title',String(r.error));row.appendChild(er);}` +
        `if(r.state==='retrying'){row.appendChild(obSpan('outbox__attempt','attempt '+String(r.attempt||1)+' of 3'));` +
        `var cd=obSpan('outbox__countdown','');row.appendChild(cd);if(typeof r.nextAttemptAt==='number')obCounts.push({el:cd,at:r.nextAttemptAt});` +
        `row.appendChild(obBtn('\u25b6','retry this message now','outbox-retry-now',r.seq));}` +
        `if(r.state==='queued'||r.state==='retrying'){row.appendChild(obBtn('\u2715','cancel this message','outbox-cancel',r.seq));}` +
        `else{row.appendChild(obBtn('\u21bb','send this message again','outbox-resend',r.seq));row.appendChild(obBtn('\u2715','dismiss this message','outbox-dismiss',r.seq));}` +
        `obList.appendChild(row);});` +
        `obTick();if(obCounts.length>0&&!obTimer)obTimer=setInterval(obTick,1000);` +
        `if(v.note){obNote.textContent=String(v.note);obNote.hidden=false;}else{obNote.textContent='';obNote.hidden=true;}` +
        `obBox.hidden=rows.length===0&&parts.length===0&&!v.note;}`;
    const attachScript = !attachOn
      ? ''
      : `var attBar=document.getElementById('insrc-attachments'),attList=document.getElementById('insrc-attlist'),attErr=document.getElementById('insrc-atterr'),attBtn=document.getElementById('insrc-attach');` +
        `var attCount=0,attSeq=0,attThumbs={},attSeen={};` +
        `function renderPending(m){` +
        `if(m.sessionId!==cur)return;` +
        `var items=m.items||[];attCount=items.length;attList.textContent='';var shown={};` +
        `items.forEach(function(a){` +
        `var chip=document.createElement('span');chip.className='attchip';` +
        `var th=a.clientId?attThumbs[a.clientId]:undefined;` +
        `if(a.clientId){shown[a.clientId]=true;attSeen[a.clientId]=true;}` +
        `if(th){var im=document.createElement('img');im.className='attchip__thumb';im.setAttribute('alt','');im.src=th;chip.appendChild(im);}` +
        `else{var g=document.createElement('span');g.className='attchip__glyph';g.textContent=a.kind==='image'?'\u25a8':'\u25a4';chip.appendChild(g);}` +
        `var nm=document.createElement('span');nm.className='attchip__name';nm.textContent=String(a.name);nm.setAttribute('title',String(a.name));chip.appendChild(nm);` +
        `var sz=document.createElement('span');sz.className='attchip__size';sz.textContent=reg.attachmentSize(a.size);chip.appendChild(sz);` +
        `var x=document.createElement('span');x.className='attchip__x';x.setAttribute('role','button');x.setAttribute('tabindex','0');x.setAttribute('aria-label','remove '+String(a.name));x.textContent='\u00d7';` +
        `x.addEventListener('click',function(){vs.postMessage({v:1,payload:{type:'remove-attachment',attachmentId:a.id}});});` +
        `x.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();x.click();}});` +
        `chip.appendChild(x);attList.appendChild(chip);});` +
        // A thumbnail is dropped once its chip has been shown and is gone (sent or removed).
        `Object.keys(attThumbs).forEach(function(k){if(attSeen[k]&&!shown[k]){delete attThumbs[k];delete attSeen[k];}});` +
        `if(m.error){attErr.textContent=String(m.error);attErr.hidden=false;}else{attErr.textContent='';attErr.hidden=true;}` +
        `attBar.hidden=items.length===0&&!m.error;}` +
        `if(attBtn)attBtn.addEventListener('click',function(){vs.postMessage({v:1,payload:{type:'pick-attachments'}});});` +
        `reg.onAttachmentOpen(function(id){vs.postMessage({v:1,payload:{type:'open-attachment',attachmentId:id}});});`;
    // A paste holding images attaches them and is prevented; any other paste is left alone.
    const pasteScript = !attachOn
      ? ''
      : `box.addEventListener('paste',function(e){` +
        `var list=e&&e.clipboardData&&e.clipboardData.items?e.clipboardData.items:[],imgs=[];` +
        `for(var i=0;i<list.length;i++){var it=list[i];if(it&&it.kind==='file'&&typeof it.type==='string'&&it.type.indexOf('image/')===0){var f=it.getAsFile();if(f)imgs.push(f);}}` +
        // Some clipboards offer the image only as a file, not as an item.
        `var fl=e&&e.clipboardData&&e.clipboardData.files?e.clipboardData.files:[];` +
        `if(imgs.length===0){for(var j=0;j<fl.length;j++){if(fl[j]&&typeof fl[j].type==='string'&&fl[j].type.indexOf('image/')===0)imgs.push(fl[j]);}}` +
        // Nothing to attach. A paste that carries no text either would otherwise do nothing at all,
        // so say what the clipboard offered.
        `if(imgs.length===0){var ty=[];var tl=e&&e.clipboardData&&e.clipboardData.types?e.clipboardData.types:[];for(var k=0;k<tl.length;k++)ty.push(String(tl[k]));` +
        `if(e&&e.clipboardData&&ty.indexOf('text/plain')<0&&ty.indexOf('text/html')<0){attErr.textContent='The clipboard gave this panel no image to paste (it offered: '+(ty.length?ty.join(', '):'nothing')+').';attErr.hidden=false;attBar.hidden=false;}` +
        `return;}` +
        `e.preventDefault();` +
        `imgs.forEach(function(f){var r=new FileReader();` +
        `r.onload=function(){var url=String(r.result||''),c=url.indexOf(',');if(c<0)return;var cid='p'+(++attSeq);attThumbs[cid]=url;` +
        `vs.postMessage({v:1,payload:{type:'attach-image',mime:f.type,dataBase64:url.slice(c+1),name:f.name||'',clientId:cid}});};` +
        `r.readAsDataURL(f);});});`;
    const bootstrap =
      `const vs=acquireVsCodeApi();` +
      `const t=document.getElementById('insrc-term');` +
      // S004: line() widened to carry an optional sc1 marker class (className only; still textContent, no innerHTML).
      // S001 sc1: line() now RETURNS its appended node so the fallback RowRenderer can hand it back from renderRow.
      // Story E20261012ddc4ede1:S001: the transcript pager, single-sourced with transcript-pager.ts.
      // Every node joins the transcript through pager.append, which follows to the bottom only
      // when the view was already there; nothing else writes the transcript's scroll position.
      `const pager=(${transcriptPagerWebviewSource()})(t,{bar:document.getElementById('insrc-older'),post:function(p){vs.postMessage({v:1,payload:p});}});` +
      `function line(s,cls){const d=document.createElement('div');if(cls)d.className=cls;d.textContent=s;return pager.append(d);}` +
      // S004: the marker mapper, single-sourced with the host markerFor (markers.ts), embedded in THIS one nonce'd script.
      `const markerFor=${markerWebviewSource()};` +
      // S001 sc1: the render registry, single-sourced with render-registry.ts, embedded in THIS one nonce'd script.
      // line() is pre-registered as the 'fallback' renderer; t4/S003/S004 register the concrete row renderers.
      `const reg=(${renderRegistryWebviewSource()})(document,line);` +
      `pager.attach(reg);` +
      // S004 ac2: the approval card's approve/deny buttons post a permission-decision the host
      // relays to the live turn's CLI (adapter.decide). Wired once via the sc1 decision sink.
      `reg.onApprovalDecision(function(requestId,decision){vs.postMessage({v:1,payload:{type:'permission-decision',requestId:requestId,decision:decision}});});` +
      // S004 (dev-chat ux polish): the selection widget's confirm posts a selection-decision the host
      // maps back to labels + continues the run. Wired once via the sc1 selection decision sink.
      `reg.onLinkOpen(function(p){vs.postMessage({v:1,payload:p});});` +
      `reg.onSelectionDecision(function(requestId,selected){vs.postMessage({v:1,payload:{type:'selection-decision',requestId:requestId,selected:selected}});});` +
      attachScript +
      outboxScript +
      // S005: provider-selector + history-dropdown wiring (same one nonce'd script).
      `var cur='';` +
      `const ps=document.getElementById('insrc-provider');` +
      `const hs=document.getElementById('insrc-history');` +
      // S002 (ux-polish): webview-local turn running-state drives the leading '>' prompt send/stop control.
      // ❯ (Send) at rest, ■ (Stop) while a turn runs; set on submit, cleared on done/error.
      `var running=false;` +
      // S001 (74bc0120): the provider select is LOCKED once the active session has context.
      // Changing it does not switch a session's provider — ChatSession.provider is readonly and
      // nativeSessionId is a provider-specific resume handle — it posts new-chat, ABANDONING the
      // current conversation. So it stays usable only on an empty chat, and re-locks on that chat's
      // first turn. setProvLock is the SOLE writer of the control's disabled property: it captures
      // the server-rendered capability gate (provDisabled, when no CLI is installed) once at startup
      // and never enables past it, so the no-CLI gate cannot be re-opened by any lock transition.
      // Starts LOCKED so a webview that never receives a session message fails safe.
      `var provLocked=true;var provGate=!!(ps&&ps.disabled);` +
      `function setProvLock(l){provLocked=l;if(ps)ps.disabled=provGate||provLocked;}` +
      `const sendBtn=document.getElementById('insrc-prompt');` +
      `function setRunning(r){running=r;if(sendBtn){sendBtn.textContent=r?'\\u25a0':'\\u276f';sendBtn.className=r?'stop':'';sendBtn.setAttribute('aria-label',r?'stop':'send');}${queueOn ? `var ib=document.getElementById('insrc-input');if(ib)ib.placeholder=r?${JSON.stringify(QUEUE_PLACEHOLDER)}:${JSON.stringify(IDLE_PLACEHOLDER)};` : ''}}` +
      // S002 ac3/lc1: the single live-only progress widget. setProgress shows + updates the ONE
      // #insrc-progress label (gated on running by the caller); setIdle puts it in its idle state (it is never hidden). It is never
      // written to the transcript (the host status-skip stays as-is, k4).
      `const prog=document.getElementById('insrc-progress');` +
      `const progLabel=prog?prog.querySelector('.plabel'):null;` +
      `const progElapsed=document.getElementById('insrc-elapsed');` +
      // S001 (bugfix): the mock's live elapsed timer (m:ss). Starts on the first setProgress of a turn,
      // ticks each second, and is cleared when the widget hides (done/error/cancel).
      `var progT0=0,progTimer=null;` +
      `function fmtElapsed(ms){var s=Math.floor(ms/1000);var m=Math.floor(s/60);var ss=s%60;return m+':'+(ss<10?'0':'')+ss;}` +
      `function tickElapsed(){if(progElapsed)progElapsed.textContent=fmtElapsed(Date.now()-progT0);}` +
      `function setProgress(text){if(prog){prog.className='progress';if(progLabel)progLabel.textContent=text;if(!progTimer){progT0=Date.now();tickElapsed();progTimer=setInterval(tickElapsed,1000);}}}` +
      `function setIdle(){if(prog){prog.className='progress idle';if(progLabel)progLabel.textContent='idle';}if(progTimer){clearInterval(progTimer);progTimer=null;}if(progElapsed)progElapsed.textContent='';}` +
      `ps.addEventListener('change',function(){if(ps.value){vs.postMessage({v:1,payload:{type:'new-chat',provider:ps.value}});}});` +
      `hs.addEventListener('change',function(){if(hs.value){vs.postMessage({v:1,payload:{type:'open-chat',chatId:hs.value}});}else if(ps.value){vs.postMessage({v:1,payload:{type:'new-chat',provider:ps.value}});}});` +
      // S001 (bugfix): the SINGLE chat-mode control (Manual / Edit Automatically / Auto). Posts
      // set-permission-mode; its wrapping seg flags 'perm-auto' (amber pill) when fully autonomous.
      `var pmode='manual';` +
      `const pm=document.getElementById('insrc-mode');` +
      `const pmseg=document.getElementById('insrc-modeseg');` +
      // ISSUE-6ae99f6e: the read-only status-bar 'session'/'edits' mirror segments + the '✓ idle' marker
      // were removed and the provider + mode selects moved into the footer. updatePermSeg now just toggles
      // the amber auto pill on the mode seg (pmseg); the derived seSess/seEdits views + updSessSeg are gone.
      `function updatePermSeg(){if(pmseg)pmseg.className='seg'+(pmode==='auto'?' perm-auto':'');}` +
      `updatePermSeg();` +
      `if(pm)pm.addEventListener('change',function(){pmode=(pm.value==='auto'||pm.value==='edit-auto')?pm.value:'manual';vs.postMessage({v:1,payload:{type:'set-permission-mode',mode:pmode}});updatePermSeg();});` +
      // S001 sc1/t4: the live turn-event append routes through reg.renderRow(reg.toViewModel(ev)).
      // assistant-delta -> assistant-text row (its actual text, ac2); tool-call -> tool-command row
      // (the real command inline, ac3). Every other kind keeps the sc1 marker path (markerFor ->
      // fallback), so status/file-edit/done/error render exactly as today and an unknown kind is skipped.
      // S002 ac3: a status event drives the SINGLE progress widget (gated on running) instead of a
      // transcript row — rapid phase changes update the one widget in place. assistant-delta/tool-call
      // still render via the sc1 view-model (S001); other markers still append. done/error hides the
      // widget + returns the button to ▶ (ac2). The host status-skip is untouched (lc1/k4).
      `window.addEventListener('message',e=>{const m=e.data&&e.data.payload;if(!m)return;if(m.type==='turn-event'){const ev=m.event;pager.track(m.rowIndex,function(){if(ev&&ev.kind==='status'){var mkp=markerFor(ev);if(running&&mkp)setProgress(mkp.label);}else if(ev&&(ev.kind==='assistant-delta'||ev.kind==='tool-call'||ev.kind==='tool-result'||ev.kind==='permission-outcome'||ev.kind==='selection-request'||ev.kind==='selection-outcome')){reg.renderRow(reg.toViewModel(ev));}` +
      // S004 ac1: a live approval-request renders the in-chat approve/deny card (the renderer
      // builds a detached node, so the handler appends it) — never a silent block.
      `else if(ev&&ev.kind==='approval-request'){var _c=reg.renderRow({kind:'approval',text:ev.title,collapsible:false,meta:{requestId:ev.requestId,title:ev.title,detail:ev.detail,toolName:ev.toolName,position:ev.position,total:ev.total}});if(_c){pager.append(_c);}}` +
      `else{const mk=markerFor(ev);if(mk)reg.renderRow({kind:'fallback',text:mk.label,cssClass:mk.cssClass});}});` +
      `if(ev&&(ev.kind==='done'||ev.kind==='error')&&!m.info){setRunning(false);setIdle();}}` +
      // ISSUE-6a811b8a: more requests queued behind the shown card — update its '1 of N' in place.
      `else if(m.type==='approval-position'){reg.approvalPosition(m.requestId,m.position,m.total);}` +
      // Story E20261013b2e8109f:S001: a row the host pushed outside the event path. A later version
      // of a diff section (a row with replaces) redraws that section's widget in place; any other
      // row (a new section, one of the host's marker lines) is drawn as it is on restore.
      `else if(m.type==='transcript-row'){pager.track(m.rowIndex,function(){var r=m.row;if(r&&r.role==='diff'&&r.replaces!=null){reg.redrawDiff(r);}else if(r){reg.renderRow(reg.toViewModel(r));}});}` +
      // Story E20261012ddc4ede1:S001: an older page the reader asked for; the pager puts it above
      // the held rows and keeps the reader's place (a page it did not ask for is discarded).
      `else if(m.type==='transcript-page'){pager.prepend(m);}` +
      // S001 ac1/lc1: the live user-row echo — reconciled to ONE row via its stable key.
      `else if(m.type==='turn-running'){if(m.sessionId===cur){setRunning(true);setProgress('working\\u2026');setProvLock(true);}}` +
      `else if(m.type==='user-row'){pager.track(m.rowIndex,function(){reg.appendKeyed(reg.toViewModel({role:'user',text:m.text,attachments:m.attachments}),m.key);});}` +
      (attachOn ? `else if(m.type==='attachments-pending'){renderPending(m);}` : '') +
      (queueOn ? `else if(m.type==='outbox'){renderOutbox(m.view);}` : '') +
      // S005: session-restored CLEARS the terminal before replaying (so switching chats
      // does not append onto the prior chat's view) + tracks the active id for the dropdown.
      // S001 t5: the replay routes through the sc1 registry (reg.appendKeyed(reg.toViewModel(x)))
      // keyed by transcript index, so it single-sources rendering with the live path and carries
      // each row's stored cssClass (marker rows -> fallback with the class), and resetKeys() clears
      // the reconciliation map for the fresh replay.
      // Story E20261012ddc4ede1:S001: the posted rows are a window of the transcript starting at
      // absolute index firstIndex (0 when absent); each row is keyed and stamped by its absolute index.
      `else if(m.type==='session-restored'){cur=m.sessionId||'';t.textContent='';reg.resetKeys();` +
      `var _rows=m.transcript||[],_first=typeof m.firstIndex==='number'?m.firstIndex:0,_total=typeof m.total==='number'?m.total:_first+_rows.length;` +
      `pager.reset(cur,_first,_total);` +
      `_rows.forEach(function(x,i){pager.track(_first+i,function(){reg.appendKeyed(reg.toViewModel(x),'r'+(_first+i));});});hs.value=cur;setRunning(false);setIdle();` +
      // S001 (bugfix): reflect the session's persisted mode in the mode control (follows the session).
      `if(m.mode&&pm){pmode=m.mode;pm.value=m.mode;updatePermSeg();}` +
      `setProvLock(_total>0);}` +
      // S005: history-list (re)populates the dropdown; labels via textContent (no innerHTML); keep active selected.
      // S001 (74bc0120): the active session appearing in the PERSISTED history is itself proof of
      // context — session-store's draft() only enters the store on its first save, i.e. once the
      // chat has a message — so re-settle the lock here alongside the existing provider re-sync.
      `else if(m.type==='history-list'){while(hs.options.length>1)hs.remove(1);(m.chats||[]).forEach(function(c){var o=document.createElement('option');o.value=c.id;o.textContent='['+c.provider+'] '+(c.title||c.id);hs.appendChild(o);});hs.value=cur;var _ac=(m.chats||[]).filter(function(c){return c.id===cur;})[0];if(_ac&&_ac.provider){ps.value=_ac.provider;}if(_ac)setProvLock(true);}});` +
      `const box=document.getElementById('insrc-input');` +
      // S002 ac2: submit converges on ONE path (Cmd/Ctrl+Enter and the leading '>' prompt control); it
      // posts submit-turn + marks running. The '>' prompt posts cancel-turn while running.
      // Guard on non-empty (matches the host runTurn no-op) so an empty submit never marks running
      // or shows a stuck spinner. On submit, show the progress widget; status events refine its label.
      // With attachments on, a blank box still submits when chips are shown.
      // Epic E20261014613abdb3 Story S002: with the queue, a sent message waits in the outbox until it
      // starts, so the turn is marked running only when the host says so ('turn-running').
      `function doSubmit(){if(!box.value.trim()${attachOn ? '&&attCount===0' : ''})return;vs.postMessage({v:1,payload:{type:'submit-turn',text:box.value}});box.value='';${queueOn ? '' : `setRunning(true);setProgress('working\\u2026');`}setProvLock(true);}` +
      `box.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){doSubmit();}});` +
      pasteScript +
      // A user cancel posts cancel-turn AND resets the UI locally: the host reap posts no terminal
      // event, so the webview must clear running + hide the progress widget itself (no stuck spinner).
      `if(sendBtn)sendBtn.addEventListener('click',function(){if(running){vs.postMessage({v:1,payload:{type:'cancel-turn'}});setRunning(false);setIdle();}else{doSubmit();}});` +
      // S002 (ux-polish): the '>' prompt is a role=button span — Enter/Space activate it like a click.
      `if(sendBtn)sendBtn.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();sendBtn.click();}});` +
      `setRunning(false);` +
      // S001 (bugfix): the readiness handshake — now that the 'message' listener above is attached,
      // tell the host we can receive. This runs on the INITIAL load AND on every VS-Code webview
      // reload (show-after-hide / restore, since the panel has no retainContextWhenHidden), so the
      // host re-sends theme + active session + history and the dropdown/transcript are always
      // repopulated instead of being lost to a post-after-setHtml race.
      `vs.postMessage({v:1,payload:{type:'ready'}});`;
    return (
      `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      `<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">` +
      `${style}${layoutStyle}</head>` +
      // The body carries ONLY `insrc-term` (which defines the --it-* tokens + base font the marker
      // rows inherit). It must NOT carry a surface class (surfaceClass('chat') etc.): that rule is
      // `.insrc-term-chat{display:block;border:…}` and, as a class (0,1,0), it OVERRIDES the element
      // rule `body{display:flex}` (0,0,1) — collapsing the whole flex-fill layout so the panel box
      // only grows to content height (the "box doesn't fill / input floats mid-panel" bug). Surface
      // classes belong on the inner surface divs, never the root body.
      `<body class="insrc-term">` +
      `<div class="box">` +
      // Fixed header (mock .chrome): ONLY the session dropdown, right-aligned (the tab already carries the insrc name and mark). The
      // ISSUE-6ae99f6e fix keeps the header to a single control: the #insrc-history session switcher
      // (its selected option already shows the session — the old 'session' label + active-name text were
      // duplication). The provider + mode selects live in the footer status bar now.
      `<div class="chrome">` +
            `<span class="right"><span class="histchip"><select id="insrc-history" class="segsel ${histCls}" aria-label="session"><option value="">new…</option></select></span></span>` +
      `</div>` +
      // Full-width bars (mock): the scrolling transcript, then the live progress bar, then the input
      // bar — each a flex:0 band with its own top border + inset ground, NOT inset inside a .pad.
      // Story E20261012ddc4ede1:S001: the 'load earlier' bar (the pager fills and shows it).
      `<div id="insrc-older" role="button" tabindex="0" aria-label="load earlier messages"></div>` +
      `<div id="insrc-term" class="term"></div>` +
      // S002 ac3: the single animated progress widget above the input (live-only). Mock: 3 blinking
      // dots + a label + a right-aligned elapsed timer; idle (never hidden) until a turn runs.
      `<div id="insrc-progress" class="progress idle"><span class="spin"><i></i><i></i><i></i></span><span class="plabel">idle</span><span class="elapsed" id="insrc-elapsed"></span></div>` +
      (deps.queue === undefined
        ? ''
        : `<div id="insrc-outbox" class="outbox" hidden><div id="insrc-obsum" class="outbox__sum" hidden></div><div id="insrc-oblist" class="outbox__list"></div><div id="insrc-obnote" class="outbox__note" role="status" hidden></div></div>`) +
      `<div class="inputbar">` +
      // S002 (ux-polish): the leading '>' prompt IS the send/stop control (glyph + class set by
      // setRunning: ❯ green Send / ■ red Stop). role=button + tabindex make the span a keyboard-
      // reachable control; the separate trailing send button is retired (one send affordance).
      `<span id="insrc-prompt" role="button" tabindex="0" aria-label="send">❯</span>` +
      `<textarea id="insrc-input" rows="2" aria-label="message" placeholder="${IDLE_PLACEHOLDER}"></textarea>` +
      `</div>` +
      (attachOn
        ? `<div id="insrc-attachments" class="attachbar" hidden><div id="insrc-attlist" class="attlist"></div><div id="insrc-atterr" class="atterr" role="status" hidden></div></div>`
        : '') +
      // Status bar (mock .statusbar): ISSUE-6ae99f6e — the FUNCTIONAL provider + mode selects live here
      // now, left-to-right (provider, then the 'edits' approval-mode). Same ids/options/classes as before
      // so their change-handlers + the pmode/updatePermSeg wiring bind unchanged; the mode seg keeps id
      // 'insrc-modeseg' (pmseg) so the amber auto pill still styles. No read-only session/edits mirror and
      // no '✓ idle' marker — the session is shown by the header dropdown and idle/busy by the progress bar.
      `<div class="statusbar">` +
      (attachOn
        ? `<button id="insrc-attach" type="button" class="attachbtn" aria-label="attach files" title="attach files">` +
          `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M13.2 7.3 8 12.5a3.2 3.2 0 0 1-4.5-4.5l5.6-5.6a2.1 2.1 0 0 1 3 3L6.6 10.9a1.1 1.1 0 0 1-1.5-1.5l4.8-4.8"/></svg>` +
          `</button>`
        : '') +
      `<span class="seg"><select id="insrc-provider" class="segsel ${provCls}" aria-label="provider"${provDisabled}>${providerOpts}</select></span>` +
      `<span class="seg" id="insrc-modeseg">edits <select id="insrc-mode" class="segsel ${provCls}" aria-label="mode"><option value="manual">Manual</option><option value="edit-auto">Edit Automatically</option><option value="auto">Auto</option></select></span>` +
      `</div>` +
      `</div>` +
      `<script nonce="${nonce}">${MARKED_SRC}\n;${HLJS_SRC}\n;${bootstrap}</script></body></html>`
    );
  };

  /** The line the attached paths are listed under in the prompt sent to the CLI. */
  const ATTACHED_HEADING = 'Attached files (read them with your file tools):';

  // Story E2026101259da3204:S001: `opts.attachments` is the files this message carries. Only a
  // real submit passes them (see submitTurn); a grant re-run and a selection continuation are the
  // host's own messages and carry none.
  async function runTurn(
    text: unknown,
    allowedTools?: readonly string[],
    opts?: { readonly suppressEcho?: boolean | undefined; readonly skipUserRow?: boolean | undefined; readonly attachments?: readonly AttachmentRef[] | undefined },
  ): Promise<void> {
    // Story E202610138d4b90c9:S001: counted as starting until turns.start has been called (from
    // then on the lifecycle says a turn is in progress), so no waiting pane message is run between.
    startingTurns += 1;
    let counted = true;
    const started = (): void => {
      if (!counted) return;
      counted = false;
      startingTurns -= 1;
    };
    try {
      await startTurn(text, allowedTools, opts, started);
    } finally {
      started();
    }
  }

  async function startTurn(
    text: unknown,
    allowedTools: readonly string[] | undefined,
    opts: { readonly suppressEcho?: boolean | undefined; readonly skipUserRow?: boolean | undefined; readonly attachments?: readonly AttachmentRef[] | undefined } | undefined,
    started: () => void,
  ): Promise<void> {
    if (typeof text !== 'string') return; // malformed submit-turn -> no-op (never throws)
    const typed = text.trim();
    const files = opts?.attachments ?? [];
    if ((typed === '' && files.length === 0) || session === undefined) return; // empty submit is a no-op

    const s = session;
    // The stored row keeps the user's own words; the paths are named only in what the CLI is sent.
    const prompt = files.length === 0 ? typed : [...(typed === '' ? [] : [typed, '']), ATTACHED_HEADING, ...files.map((f) => f.path)].join('\n');

    // Story S004: a retried message already has its user row from the first attempt, so the retry
    // sends the prompt to the CLI but writes no second row, echo, title or save here.
    if (opts?.skipUserRow !== true) {
      s.transcript.push(files.length === 0 ? { role: 'user', text: typed, at: now() } : { role: 'user', text: typed, at: now(), attachments: [...files] });
      // S001 ac1/lc1: echo the user's prompt LIVE so it appears during the turn (not only on a
      // later session-restored replay). ONE append is both the durable row and the live echo —
      // its key is the row's transcript index, so the live row and its replay reconcile to a
      // single rendered row webview-side (the stored transcript shape is unchanged, k4).
      // S003 (dev-chat ux polish) ac2: a SYNTHESIZED grant re-run (from an Approve) passes
      // suppressEcho so the internal "Approved — run exactly this now: …" prompt is NOT echoed as a
      // user bubble (only the resolved permission-outcome chip is shown). A normal submit still echoes.
      if (opts?.suppressEcho !== true) {
        post({
          type: 'user-row',
          text: typed,
          key: `r${s.transcript.length - 1}`,
          rowIndex: s.transcript.length - 1,
          ...(files.length > 0 ? { attachments: [...files] } : {}),
        });
      }
      // S005: name the chat from its FIRST user prompt (clipped) so the history dropdown
      // rows are distinguishable; a whitespace-only prompt is already rejected above, so
      // the clip is non-empty. Later turns keep the established title.
      if (s.transcript.filter((r) => r.role === 'user').length === 1) {
        // A first message with no text is named from its first attachment.
        const derived = (typed !== '' ? typed : (files[0]?.name ?? '')).replace(/\s+/g, ' ').trim().slice(0, 60);
        if (derived !== '') s.title = derived;
        // Then ask the LLM for a better title in the background (keeps `derived` on failure).
        if (typed !== '') void applyTitle(s, typed);
      }
      trySave(s); // runTurn is fired and forgotten: a failing save must not become an unhandled rejection
    }

    const grant = allowedTools && allowedTools.length > 0 ? { allowedTools } : {};
    // The session's attachments directory is readable on this turn and on every later one (a grant
    // re-run and a selection continuation too), so the assistant can read a file again.
    const readable =
      att !== undefined && s.transcript.some((r) => r.role === 'user' && r.attachments !== undefined && r.attachments.length > 0)
        ? { readDirs: [att.store.dirOf(s.id)] }
        : {};
    // Story E20261013e62a9269:S001: this turn as the review presenter sees it, begun once the
    // message is accepted and before the turn starts.
    const shown = beginPresented();
    // Epic E20261014613abdb3 Story S001: a turn of the queued message being run (its own, or a
    // continuation started from it) is counted, so the message ends only after the last one.
    const q = queued !== undefined && queued.session === s ? queued : undefined;
    if (q !== undefined) {
      q.turns += 1;
      q.terminal = undefined;
      q.error = undefined;
      if (q.waitTimer !== undefined) {
        clearTimeout(q.waitTimer);
        q.waitTimer = undefined;
      }
    }
    const req = s.nativeSessionId !== undefined
      ? { provider: s.provider, prompt, cwd: deps.cwd(), permissionMode, ...grant, ...readable, resume: { provider: s.provider, nativeSessionId: s.nativeSessionId } }
      : { provider: s.provider, prompt, cwd: deps.cwd(), permissionMode, ...grant, ...readable };

    // Story E20261013b2e8109f:S001: this turn's diff state, opened in beforeRun.
    let dt: DiffTurn | undefined;
    const sink: TurnSink = {
      onWaiting: () => post({ type: 'turn-event', event: { kind: 'status', turnId: 'waiting', phase: 'waiting' } }),
      // S006: capture the pre-turn baseline BEFORE the CLI can write (governor.beginTurn), so the
      // diff + revert are computed against the true pre-turn content (k8 observer).
      // S001 (bugfix): the merged chat mode now governs edits (via claude's permission flags), so the
      // governor runs visualize-only — it renders diffs but no longer gates with accept/reject (the
      // separate edit-review gate is retired, Claude-Code style).
      beforeRun: async () => {
        if (governor === undefined) return;
        endDiffTurn(); // a turn that never reached its end still holds a diff state: end it first
        await governor.beginTurn({ mode: 'auto', cwd: deps.cwd() });
        // Story E20261013b2e8109f:S001: in a git folder with the chat view on, this turn's changes
        // are shown as sections; the turn gets its own diff state.
        // A setting that cannot be read leaves the turn without one, as before this Story.
        let active = false;
        try {
          active = governor.sectionsActive();
        } catch (err) {
          warnGovernor('sectionsActive', err);
        }
        dt = active ? openDiffTurn(s) : undefined;
      },
      onEvent: (ev) => {
        // Story E20261013e62a9269:S001: before anything else, and whatever is done with the event below.
        presentDeclared(shown, ev, () => true);
        // Story S004: the agent acted (a tool call, an edit or a tool result): this message is never retried.
        if (q !== undefined && (ev.kind === 'tool-call' || ev.kind === 'file-edit' || ev.kind === 'tool-result')) q.acted = true;
        // ISSUE-6a811b8a: an approval-request is queued, not posted; only the queue head is shown.
        // Story E20261012ddc4ede1:S001: write the row first, then post the event with its index.
        // Story E20261013b2e8109f:S001: while this turn's diff state is open an edit's path line and
        // its successful result are held back (the sections show the change); a failed edit shows
        // its path, then its error.
        const open = dt !== undefined && !dt.ended ? dt : undefined;
        const edited = open !== undefined && ev.kind === 'tool-result' && ev.editPath !== undefined ? ev.editPath : undefined;
        if (open !== undefined && ev.kind === 'file-edit') {
          open.held.set(ev.path, markerFor(ev)?.label ?? ev.path);
        } else if (open !== undefined && edited !== undefined && ev.kind === 'tool-result' && ev.isError !== true) {
          if (!open.held.has(edited)) open.held.set(edited, pathLine(edited));
        } else {
          if (open !== undefined && edited !== undefined) {
            open.held.delete(edited);
            pushMarker(open, pathLine(edited));
          }
          const rowIndex = appendEvent(s, ev);
          if (ev.kind === 'approval-request') enqueueApproval(ev);
          else postLive(ev, rowIndex);
        }
        // ISSUE-6a811b8a: the turn's end lets its batch of turn-ended requests complete.
        if (ev.kind === 'done' || ev.kind === 'error') approvals.endTurn(ev.turnId);
        // S004 (dev-chat ux polish): remember a surfaced selection request's options (keyed by
        // requestId) so a later selection-decision can map the chosen ids back to labels.
        if (ev.kind === 'selection-request') {
          pendingSelections.set(ev.requestId, { options: ev.options });
          reportCards(); // Story S002
        }
        // S006: an observed file-edit -> the governor computes + renders its own diff
        // (auto: visualize-only; review: track for accept/reject). Fire-and-forget so
        // the incremental turn loop never blocks on git/fs IO.
        if (governor !== undefined && ev.kind === 'file-edit') governor.observe(ev.path).catch((err: unknown) => warnGovernor('observe', err));
        // Story E20261013b2e8109f:S001: a tool call ended or a patch landed: look for what changed.
        // Fired and forgotten, like observe: the turn loop never waits for git.
        // A held path is settled after the check that follows the end of its edit: an applied
        // patch (codex) at its event, a claude edit at its successful result.
        if (governor !== undefined && open !== undefined && (ev.kind === 'file-edit' || ev.kind === 'tool-result')) {
          const done = ev.kind === 'file-edit' ? (ev.applied === true ? ev.path : undefined) : ev.isError !== true ? edited : undefined;
          governor.check()
            .catch((err: unknown) => warnGovernor('check', err))
            .then(() => {
              if (done === undefined || open.ended) return;
              settlePath(open, done);
              if (open.afterTerminal) trySave(open.session);
            })
            .catch((err: unknown) => warnGovernor('settle', err));
        }
      },
      ...(q !== undefined
        ? {
            onSpawn: (cli: SpawnedCli): void => {
              q.spawned = true;
              q.lastCli = cli;
              try {
                q.onSpawn({ ...(cli.pid !== undefined ? { pid: cli.pid } : {}), ...(cli.startedAt !== undefined ? { startedAt: cli.startedAt } : {}) });
              } catch (err) {
                log.warn(`[chat] the queue could not record the turn's CLI: ${err instanceof Error ? err.message : String(err)}`);
              }
            },
          }
        : {}),
      onTerminal: (ev) => {
        if (q !== undefined) {
          q.terminal = ev.kind;
          if (ev.kind === 'error') q.error = ev.message;
          // Story S004: a done with ok:false is a failed turn, not a finished one. claude and codex report an overload or
          // a rate limit as an is_error result, which the adapter maps to done(ok:false) with the provider's text.
          else if (ev.kind === 'done' && !ev.ok) q.error = ev.message ?? 'the turn ended with an error';
        }
        runCompletedBatch(); // ISSUE-6a811b8a: requests decided before the turn ended are now complete
        trySave(s); // persist the turn's transcript rows (an errored turn's too); a failing save never breaks the turn
        // Story E20261013b2e8109f:S001: the last check runs here; its rows are saved as they arrive,
        // and the turn's diff state ends when it is done.
        const ending = dt;
        if (ending !== undefined) ending.afterTerminal = true;
        if (governor !== undefined) {
          governor.resolveTurn()
            .catch((err: unknown) => warnGovernor('resolveTurn', err))
            .then(() => {
              if (ending === undefined || ending.ended) return;
              settleHeld(ending); // whatever is still held gets its path line now
              ending.ended = true;
              trySave(ending.session);
            })
            .catch((err: unknown) => warnGovernor('settle', err));
        }
        postHistory(); // S005: title/updatedAt changed -> refresh the history dropdown
      },
      onError: (message, turnId) => {
        if (q !== undefined) q.error = message;
        endDiffTurn();
        post({ type: 'turn-event', event: { kind: 'error', turnId, message } });
      },
    };
    // Single-in-flight per panel: the newest message wins. start drops a turn still waiting for
    // the lock and stops the previous turn posting (the transcript never interleaves); the previous
    // turn's process is NOT killed: this turn waits for it.
    // Story E20261013b2e8109f:S001: start() stops the previous turn reporting to its sink at once,
    // while this turn's beforeRun may wait for that turn's process: settle its held paths now.
    endDiffTurn();
    const run = turns.start(s, req, sink);
    started();
    // Story E20261013e62a9269:S001: the one place that is reached for a turn that completed,
    // failed, was stopped or was superseded.
    try {
      await run;
    } finally {
      endPresented(shown);
      if (q !== undefined) {
        q.turns -= 1;
        settleQueued();
      }
    }
  }

  // Story E2026101259da3204:S001: a submit while the attachment seams are present. Submits run one
  // after another. Each is tied to the session it was sent in and to the attachment changes asked
  // for before it: it waits for those, so a message never goes without a file the user saw as a
  // chip, and takes exactly those from the session's pending list (one pasted after the submit
  // stays pending). If the chat was switched or the panel closed while it waited, it is dropped
  // and the attachments stay pending on their session.
  let submitWork: Promise<void> = Promise.resolve();
  function submitTurn(text: unknown): void {
    if (session === undefined) return;
    const s = session;
    const writes = attachmentWork.get(s.id) ?? Promise.resolve();
    const upTo = changeSeq;
    const run = async (): Promise<void> => {
      await writes;
      if (disposed || session !== s) return;
      const list = pendingOf(s.id);
      const files = list.filter((p) => p.seq <= upTo).map((p) => p.ref);
      if (typeof text !== 'string' || (text.trim() === '' && files.length === 0)) return;
      if (files.length > 0) {
        // In place: a change still running holds this same list.
        list.splice(0, list.length, ...list.filter((p) => p.seq > upTo));
        postPending(s.id);
      }
      sendTyped(s, text, files);
    };
    submitWork = submitWork.then(run).catch((err: unknown) => {
      log.error(`[chat] submit failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  // Returns the absolute transcript index of the row the event wrote, or undefined when it wrote none.
  function appendEvent(s: ChatSession, ev: TurnEvent): number | undefined {
    if (ev.kind === 'assistant-delta') {
      s.transcript.push({ role: 'assistant', text: ev.text, at: now() });
      return s.transcript.length - 1;
    }
    // 'status' is a transient progress tick (thinking/streaming/tool/editing): it is
    // rendered LIVE in the webview (from the posted turn-event) but NOT persisted —
    // persisting every tick would bloat the durable transcript and replay as noise on
    // restore. The durable lifecycle facts (tool-call/file-edit/done/error) ARE kept.
    if (ev.kind === 'status') return undefined;
    // S001 (dev-chat ux polish): a tool result persists STRUCTURALLY as a role:'tool-result' row
    // (command + output), not as a flat marker — so a restored transcript re-renders the command
    // + collapsed output legibly. markerFor returns null for it, so this branch owns its persistence.
    if (ev.kind === 'tool-result') {
      s.transcript.push({
        role: 'tool-result',
        ...(ev.command !== undefined && ev.command !== '' ? { command: ev.command } : {}),
        output: ev.output,
        at: now(),
      });
      return s.transcript.length - 1;
    }
    // Durable markers are single-sourced through markerFor — the SAME mapper the webview
    // uses — so a host row and its live marker never drift. done now persists a marker row
    // (the S003 gap); an unmapped/future kind -> markerFor returns null -> no row.
    const marker = markerFor(ev);
    // S008: persist the sc1 cssClass alongside the label so a RESTORED chat reproduces
    // each marker's glyph + phosphor tone (identical to live) instead of plain text.
    if (marker !== null) {
      s.transcript.push({ role: 'marker', text: marker.label, cssClass: marker.cssClass, at: now() });
      return s.transcript.length - 1;
    }
    return undefined;
  }

  function handleMessage(message: unknown): void {
    const env = message as { v?: unknown; payload?: unknown } | null;
    if (env === null || env.v !== 1 || typeof env.payload !== 'object' || env.payload === null) {
      log.warn('[chat] dropped malformed message');
      return;
    }
    const msg = env.payload as WebviewToHost;
    switch (msg.type) {
      case 'ready':
        // S001 (bugfix): the webview attached its listener and is ready to receive. (Re)send the
        // full view state. Fires on the initial load AND every VS-Code webview reload (the panel
        // has no retainContextWhenHidden), so a restored/re-shown chat is always repopulated
        // instead of showing an empty dropdown + transcript.
        webviewReady = true;
        for (const w of readyWaiters.splice(0)) w();
        postInitialState();
        // ISSUE-de069d56d76eaacd: a rebuilt page (VS Code discards a covered tab's page) starts idle after its
        // session-restored; tell it when a turn is still in progress, so the progress widget and Stop come back.
        if (session !== undefined && (turns.busy() || startingTurns > 0 || queued?.session.id === session.id)) post({ type: 'turn-running', sessionId: session.id });
        return;
      case 'submit-turn':
        if (att !== undefined) {
          submitTurn(msg.text);
          return;
        }
        if (typeof msg.text !== 'string' || session === undefined) return;
        sendTyped(session, msg.text, []);
        return;
      case 'outbox-cancel':
        outboxAction(msg.seq, 'cancel');
        return;
      case 'outbox-dismiss':
        outboxAction(msg.seq, 'dismiss');
        return;
      case 'outbox-resend':
        outboxAction(msg.seq, 'resend');
        return;
      case 'outbox-retry-now':
        outboxAction(msg.seq, 'retry-now');
        return;
      case 'cancel-turn':
        // S002 ac2: the Stop control cancels the in-flight turn via the existing reap.
        // Idempotent when no turn is active (stop() no-ops).
        if (queued !== undefined) queued.stopped = true; // Epic E20261014613abdb3 Story S001: wins over the CLI's error
        rejectQueuedApprovals(); // ISSUE-6a811b8a: Stop rejects the requests still waiting
        settleQueued(); // a queued message waiting only on a card ends now
        endDiffTurn();
        void turns.stop();
        return;
      case 'new-chat': {
        if (typeof msg.provider !== 'string') return;
        // S005: only start a chat on an INSTALLED agentic CLI (k4). A stale webview
        // option for an uninstalled provider is a no-op (it would fail on the first turn).
        if (!deps.providers.available.some((p) => p === msg.provider)) {
          log.warn(`[chat] new-chat: provider not available ${msg.provider}`);
          return;
        }
        // Switching the active session stops following any in-flight turn first, or its deltas
        // would paint into the newly-restored session's view (a session-file turn keeps running).
        endDiffTurn(); // Story E20261013b2e8109f:S001: settle held paths before the sink goes quiet
        queuedViewLost(); // Epic E20261014613abdb3 Story S001
        void turns.detach();
        turns.invalidate();
        dropQueuedApprovals(); // ISSUE-6a811b8a: a chat switch drops the waiting requests
        settleQueued();
        // A DRAFT (unsaved): the new chat is not written to history until its first turn, so
        // repeatedly starting/abandoning new chats never leaves empty sessions behind.
        session = deps.store.draft(msg.provider);
        permissionMode = modeOf(session);
        postRestored(session);
        postPending(session.id);
        postHistory(); // refresh the dropdown (the draft is not yet listed until it has a message)
        return;
      }
      case 'open-chat': {
        if (typeof msg.chatId !== 'string') return;
        const s = deps.store.get(msg.chatId);
        if (s === undefined) {
          // S005: a missing/corrupt id (e.g. evicted by the cap) -> keep the active chat
          // and refresh the dropdown so the dead row drops (list() skips corrupt rows).
          log.warn(`[chat] open-chat: unknown session ${msg.chatId}`);
          postHistory();
          return;
        }
        endDiffTurn(); // Story E20261013b2e8109f:S001: settle held paths before the sink goes quiet
        queuedViewLost(); // Epic E20261014613abdb3 Story S001
        void turns.detach();
        turns.invalidate();
        dropQueuedApprovals(); // ISSUE-6a811b8a: a chat switch drops the waiting requests
        settleQueued();
        session = s;
        permissionMode = modeOf(s); // S001 (bugfix): the mode follows the opened session
        postRestored(s);
        postPending(s.id); // each chat shows its own pending attachments
        postHistory(); // S005: keep the dropdown selection/order in sync
        followLiveTurn(s);
        return;
      }
      case 'load-older': {
        // Story E20261012ddc4ede1:S001: the page of rows ending just before `before`. A request for
        // a session that is no longer the active one (the user switched chats) is ignored.
        if (typeof msg.sessionId !== 'string' || !Number.isInteger(msg.before)) return;
        if (session === undefined || session.id !== msg.sessionId) return;
        const page = pageBefore(session.transcript, msg.before);
        const before = Math.min(Math.max(0, msg.before), session.transcript.length);
        post({ type: 'transcript-page', sessionId: session.id, before, firstIndex: page.firstIndex, rows: [...page.rows], total: session.transcript.length });
        return;
      }
      case 'set-edit-mode': {
        // S006: per-session auto/review toggle (sc4). Persist it (the S005 title-persist
        // pattern) so subsequent turns read the new mode at beginTurn (ac3).
        if (msg.mode !== 'auto' && msg.mode !== 'review') return; // invalid -> drop
        if (session === undefined) return;
        session.editMode = msg.mode;
        deps.store.save(session);
        return;
      }
      case 'edit-decision': {
        // S006: accept keeps the on-disk change; reject reverts to the pre-turn baseline.
        // An unknown/decided path is a no-op inside the governor.
        if (typeof msg.path !== 'string' || typeof msg.accept !== 'boolean') return;
        if (governor !== undefined) governor.decide(msg.path, msg.accept).catch((err: unknown) => warnGovernor('decide', err));
        return;
      }
      case 'permission-decision': {
        // S004 ac2: relay the approve/deny click to the LIVE turn's adapter (its own captured
        // provider, never the current session's — it may have switched). decide() no-ops on an
        // unknown/stale/dead requestId, so a late/duplicate click is safe.
        if (typeof msg.requestId !== 'string' || (msg.decision !== 'approve' && msg.decision !== 'deny')) return;
        // S001 (bugfix): review-mode GRANT flow. claude denies + ENDS the turn on a permission
        // request (no in-turn control channel), so the decision can't be relayed to a live turn —
        // instead, on Approve we re-run the blocked action resuming the session with that tool
        // pre-allowed; on Deny we drop it (the turn already ended as denied).
        // ISSUE-6a811b8a: a queued request is decided only when it is the head; a waiting one's card
        // is never shown, so a decision for it (a stale or second webview) is ignored.
        if (approvals.has(msg.requestId)) {
          const res = approvals.decide(msg.requestId, msg.decision);
          if (!res.ok) return;
          // Epic E20261014613abdb3 Story S001: a decision that starts no continuation may end the queued message.
          queueMicrotask(settleQueued);
          queueMicrotask(reportCards); // Story S002
          shownApproval = undefined;
          const decided = res.decided;
          // S003 (dev-chat ux polish): record the resolved outcome (approve AND deny) as a persisted,
          // live-rendered chip — including the dir-block approve branch, which posts no grant re-run.
          recordPermissionOutcome(decided.toolName ?? decided.title, msg.decision === 'approve', msg.requestId);
          if (decided.resolution === 'in-turn') {
            relayDecision(msg.requestId, msg.decision);
            showApprovalHead();
            return;
          }
          if (msg.decision === 'approve' && decided.blockKind === 'dir-block') {
            // A working-dir / sandbox-allowlist block: --allowedTools cannot grant a directory, so it
            // is never re-run (that produced the confused no-op) and never a grant. Post a
            // self-contained informational message explaining what actually needs to change — no
            // adapter/argv/allowlist touched (buildArgs still adds only --allowedTools, never --add-dir).
            postInfo(
              `info-${msg.requestId}`,
              `This action was blocked because its path is outside this session's allowed working directories. ` +
                `Approving cannot grant it — the directory must be added to the session's allowed working directories first ` +
                `(this is a sandbox/workspace setting, not a tool permission).`,
            );
          }
          // ISSUE-6a811b8a: a turn-ended decision joins its turn's batch (the queue keeps it); the
          // follow-up runs once, when the whole batch is decided and its turn has ended.
          showApprovalHead();
          runCompletedBatch();
          return;
        }
        // Otherwise an id the host does not hold: relay to the LIVE turn's captured adapter, as
        // before. decide() no-ops on an unknown/stale/dead requestId.
        relayDecision(msg.requestId, msg.decision);
        return;
      }
      case 'set-permission-mode': {
        // S001 (bugfix): the chat mode is a PERSISTED per-session preference. Apply it to the NEXT
        // turn's buildArgs and write it onto the active session so it survives reload + follows the
        // session. Persist immediately for an already-saved session (a draft persists on its first
        // turn, so its mode rides along without cluttering history with empty chats).
        if (msg.mode !== 'manual' && msg.mode !== 'edit-auto' && msg.mode !== 'auto') return; // invalid -> drop
        permissionMode = msg.mode;
        if (session !== undefined) {
          session.mode = msg.mode;
          if (deps.store.get(session.id) !== undefined) deps.store.save(session);
        }
        return;
      }
      case 'selection-decision': {
        // S004 (dev-chat ux polish): the user confirmed a selection widget. Look up the pending
        // request; map the chosen ids back to labels via its options; record the resolved outcome
        // (persisted chip) and continue the run conveying the choice. An unknown/stale requestId is a
        // safe no-op (mirrors the permission-decision stale path). The widget guards >=1 selection, so
        // `selected` is non-empty; still, an all-invalid/empty payload is dropped without a run.
        if (typeof msg.requestId !== 'string' || !Array.isArray(msg.selected)) return;
        const pending = pendingSelections.get(msg.requestId);
        if (pending === undefined) return; // unknown / stale / already answered -> no-op
        pendingSelections.delete(msg.requestId);
        queueMicrotask(settleQueued); // Epic E20261014613abdb3 Story S001
        queueMicrotask(reportCards); // Story S002
        const ids = msg.selected.filter((x): x is string => typeof x === 'string');
        if (ids.length === 0) return; // nothing actually chosen -> no run, no outcome
        // Map ids -> labels (ids should be unique; a duplicate maps to its first option, and an
        // unknown id falls back to the id text so the choice is never dropped silently).
        const labels = ids.map((id) => pending.options.find((o) => o.id === id)?.label ?? id);
        recordSelectionOutcome(msg.requestId, labels);
        // Continue the run with a synthesized user message naming the choice. suppressEcho so the
        // synthetic prompt is not echoed as a user bubble — only the resolved selection chip marks it.
        void runTurn(`Selected: ${labels.join(', ')}`, undefined, { suppressEcho: true });
        return;
      }
      case 'attach-image': {
        // Story E2026101259da3204:S001: a pasted image, as base64. It joins the pending list of
        // the session that was active when it was pasted.
        if (att === undefined || session === undefined) return;
        if (typeof msg.mime !== 'string' || typeof msg.dataBase64 !== 'string') return;
        const { mime, dataBase64 } = msg;
        const name = typeof msg.name === 'string' ? msg.name : '';
        const clientId = typeof msg.clientId === 'string' ? msg.clientId : undefined;
        const sessionId = session.id;
        changePending(sessionId, async (list, seq) => {
          const shown = name.trim() === '' ? 'The pasted image' : name;
          if (list.length >= MAX_ATTACHMENTS_PER_MESSAGE) return { post: true, errors: [`${TOO_MANY}; ${shown} was not attached.`] };
          // Judged from the text's length, so an oversize paste is never decoded.
          const size = base64Bytes(dataBase64);
          if (size > MAX_ATTACHMENT_BYTES) {
            return { post: true, errors: [`${shown} is larger than the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB limit.`] };
          }
          const bytes = Buffer.from(dataBase64, 'base64');
          if (bytes.length === 0 || bytes.length !== size) return { post: true, errors: ['The pasted item is not a supported image.'] };
          try {
            list.push({ ref: await att.store.addBytes(sessionId, { name, mime, bytes }), clientId, seq });
          } catch (err: unknown) {
            return { post: true, errors: [attachError(shown, err)] };
          }
          return { post: true, errors: [] };
        });
        return;
      }
      case 'pick-attachments': {
        // The file dialog is the host's own, so no path ever comes from the webview. It is not
        // part of the session's chain of changes: nothing waits on a dialog left open.
        if (att === undefined || session === undefined) return;
        const sessionId = session.id;
        void (async (): Promise<void> => {
          let paths: readonly string[];
          try {
            paths = await att.pickFiles();
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            log.error(`[chat] the file dialog failed: ${message}`);
            changePending(sessionId, async () => ({ post: true, errors: [`The file dialog could not be opened: ${message}`] }));
            return;
          }
          if (paths.length === 0) return; // dismissed: nothing changes, nothing is posted
          changePending(sessionId, async (list, seq) => {
            const errors: string[] = [];
            const room = Math.max(0, MAX_ATTACHMENTS_PER_MESSAGE - list.length);
            for (const path of paths.slice(0, room)) {
              try {
                list.push({ ref: await att.store.addFile(sessionId, path), seq });
              } catch (err: unknown) {
                errors.push(attachError(path.split(/[\\/]/).pop() ?? path, err));
              }
            }
            const left = paths.length - Math.min(paths.length, room);
            if (left > 0) errors.push(`${TOO_MANY}; ${left} ${left === 1 ? 'file was' : 'files were'} not attached.`);
            return { post: true, errors };
          });
        })();
        return;
      }
      case 'remove-attachment': {
        // Only an id in the active session's pending list; anything else does nothing.
        if (att === undefined || session === undefined || typeof msg.attachmentId !== 'string') return;
        const { attachmentId } = msg;
        const sessionId = session.id;
        changePending(sessionId, async (list) => {
          const at = list.findIndex((p) => p.ref.id === attachmentId);
          if (at === -1) return { post: false, errors: [] };
          list.splice(at, 1);
          try {
            await att.store.remove(sessionId, attachmentId);
          } catch (err: unknown) {
            // The chip is gone either way; the start-up sweep takes a file left behind.
            log.warn(`[chat] could not remove attachment ${attachmentId}: ${err instanceof Error ? err.message : String(err)}`);
          }
          return { post: true, errors: [] };
        });
        return;
      }
      case 'open-attachment': {
        // The id is resolved against the active session; the path opened is the host's own.
        if (att === undefined || session === undefined || typeof msg.attachmentId !== 'string') return;
        const ref = findAttachment(session, msg.attachmentId);
        if (ref === undefined) return;
        try {
          att.open(ref.path);
        } catch (err: unknown) {
          log.warn(`[chat] could not open attachment ${ref.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }
      case 'open-link':
        if (links !== undefined) void links.openLink(msg.url);
        return;
      case 'open-code-ref':
        if (links !== undefined) void links.openCodeRef(msg.path, msg.line);
        return;
      default:
        // docs-decision (S007) or any unknown/forward variant: accepted-but-ignored
        // seam — never an error.
        return;
    }
  }

  // S001 (bugfix): the ONE post-channel wiring path shared by open() (fresh panel) and adopt()
  // (a VS-Code-restored panel). Wires onDidDispose/onMessage, renders the shell, and seeds the
  // session + initial state via postInitialState(). NOTE: in the REAL VS-Code webview these
  // initial posts race the not-yet-attached message listener and are lost — the AUTHORITATIVE
  // delivery is the webview's 'ready' handshake (handleMessage → postInitialState), which fires
  // on the initial load AND on every webview reload (show-after-hide / restore, since the panel
  // has no retainContextWhenHidden). Calling it here too keeps the session drafted synchronously
  // (the open()-yields-a-turnable-session invariant) and single-sources the post sequence.
  /** Opens the panel, or reveals it when it is open (the host's open()). */
  const hostOpen = (): void => {
    disposed = false;
    if (channel !== undefined) {
      channel.reveal();
      return;
    }
    wireChannel(deps.createPanel({ viewType: VIEW_TYPE, title: CHAT_PANEL_TITLE }));
  };

  /** Shows a stored chat in the panel, as opening it from the history does. */
  const showSession = (s: ChatSession): void => {
    endDiffTurn();
    void turns.detach();
    turns.invalidate();
    dropQueuedApprovals();
    session = s;
    permissionMode = modeOf(s);
    postRestored(s);
    postPending(s.id);
    postHistory();
    followLiveTurn(s);
  };

  /** Resolves once the panel's webview has posted 'ready'. */
  const whenReady = (): Promise<void> => (webviewReady ? Promise.resolve() : new Promise<void>((r) => void readyWaiters.push(r)));

  /**
   * Epic E20261014613abdb3 Story S001: runs a message the repository's queue handed this window. It
   * opens the panel if it is closed and shows the message's chat (with a note) if another is shown,
   * tells the webview a turn is running (so Stop is offered for a turn that started without a
   * click), and starts the turn as a typed message would; it resolves once that turn and its
   * continuations have ended.
   */
  const queueRunner: QueuedTurnRunner = {
    note(message, text) {
      if (disposed || session === undefined || session.id !== message.sessionId) return log.warn(`[chat-queue] note for ${message.key} not shown (its chat is not open): ${text}`);
      postInfo(`queue-giveup-${message.turnId}`, text); // live only: it is about the queue, not the conversation
    },
    run(message, onSpawn, onWaiting) {
      return new Promise<TurnOutcome>((resolve) => {
        void (async (): Promise<void> => {
          try {
            if (channel === undefined) hostOpen();
            await whenReady();
            let s = session;
            if (s === undefined || s.id !== message.sessionId) {
              const found = deps.store.get(message.sessionId);
              if (found === undefined) return resolve({ kind: 'failed', error: 'the chat no longer exists', acted: false });
              showSession(found);
              s = found;
              postInfo(`queue-note-${message.turnId}`, `Running your queued message in "${found.title ?? 'this chat'}".`);
            }
            queued = { message, session: s, onSpawn, onWaiting, waiting: undefined, turns: 0, spawned: false, lastCli: undefined, terminal: undefined, error: undefined, acted: false, stopped: false, viewLost: false, waitTimer: undefined, resolve };
            post({ type: 'turn-running', sessionId: s.id });
            const retried = message.attempts > 0;
            if (retried) {
              const cause = classifyFailure(message.error ?? '');
              persistInfo(s, `queue-retry-${message.turnId}-${message.attempts}`, `the turn failed with ${cause}; retrying (attempt ${message.attempts} of ${MAX_INFRA_RETRIES})`);
            }
            await runTurn(message.text, undefined, {
              ...(message.attachments.length > 0 ? { attachments: message.attachments } : {}),
              ...(retried ? { skipUserRow: true } : {}),
            });
            // runTurn returned without starting a turn (a blank message): nothing ran.
            if (queued?.message === message && queued.turns === 0 && !queued.spawned && queued.terminal === undefined) settleQueued();
          } catch (err) {
            if (queued?.message === message) queued = undefined;
            resolve({ kind: 'failed', error: err instanceof Error ? err.message : String(err), acted: true });
          }
        })();
      });
    },
  };

  // Epic E20261014613abdb3 Story S001: this window's queue worker, when the queue is available.
  const worker = deps.queue?.(queueRunner);
  // Story S002: the outbox follows every change to the queue, in this window or another.
  worker?.onChange((rows) => {
    outboxRows = rows;
    postOutbox();
  });

  /** Story S002: an outbox action on one of the shown chat's rows; a refusal is said in the outbox. */
  const outboxAction = (seq: unknown, action: QueueAction): void => {
    if (worker === undefined || session === undefined || typeof seq !== 'number') return;
    const row = outboxRows?.find((m) => m.seq === seq);
    if (row === undefined || row.sessionId !== session.id) {
      log.warn(`[chat] outbox ${action} of message ${String(seq)} ignored: it is not a message of the shown chat`);
      return;
    }
    const res = worker.act(seq, action);
    if (!res.ok) postOutbox(res.note);
  };

  /**
   * Epic E20261014613abdb3 Story S001: a message the user sent goes into the repository's queue; it
   * never touches the running turn. A refused message (the queue is full or busy) is said in the chat.
   */
  const enqueueTyped = (w: ChatQueueWorker, s: ChatSession, text: string, files: readonly AttachmentRef[]): void => {
    trySave(s); // a draft chat is kept, so its queued message still finds it
    const res = w.submit({ sessionId: s.id, text, origin: 'typed', attachments: files });
    if (!res.ok) postInfo(`queue-refused-${Date.now()}`, res.note);
  };

  /**
   * A message the user sent. Epic E20261014613abdb3 Story S001: with the queue it goes into the
   * repository's queue and never touches the running turn or its waiting cards; without it, it
   * answers the waiting requests with a no and starts its turn (not awaited, so the next submit does
   * not wait for this turn to end).
   */
  const sendTyped = (s: ChatSession, text: string, files: readonly AttachmentRef[]): void => {
    if (text.trim() === '' && files.length === 0) return;
    if (worker !== undefined) {
      enqueueTyped(worker, s, text.trim(), files);
      return;
    }
    supersedeQueuedApprovals();
    void runTurn(text, undefined, files.length > 0 ? { attachments: files } : undefined);
  };

  const wireChannel = (ch: ChatPanelChannel): void => {
    disposed = false;
    channel = ch;
    webviewReady = false; // until this channel's webview posts 'ready'
    channel.onDidDispose(() => {
      queuedViewLost(); // Epic E20261014613abdb3 Story S001
      endDiffTurn(); // Story E20261013b2e8109f:S001: settle held paths before the sink goes quiet
      void turns.detach();
      dropQueuedApprovals();
      settleQueued();
      markViewGone();
      disposed = true;
      channel = undefined;
    });
    channel.onMessage(handleMessage);
    channel.setHtml(renderShell());
    postInitialState();
  };

  return {
    open(): void {
      hostOpen();
    },
    adopt(ch: ChatPanelChannel): void {
      // A restored panel arrived. Supersede any live channel (kill its in-flight turn + dispose
      // it) so exactly one channel remains, then wire the restored one in place.
      if (channel !== undefined) {
        queuedViewLost(); // Epic E20261014613abdb3 Story S001
        endDiffTurn(); // Story E20261013b2e8109f:S001: settle held paths before the sink goes quiet
        void turns.detach();
        superseding = true;
        try {
          channel.dispose();
        } catch {
          /* already disposed */
        } finally {
          superseding = false;
        }
        channel = undefined;
      }
      wireChannel(ch);
    },
    queueRunner,
    submitExternal(text: string): ExternalSubmitResult {
      if (typeof text !== 'string' || text.trim() === '') return { kind: 'unavailable', note: 'the decision message was empty' };
      if (deps.providers.available.length === 0) return { kind: 'unavailable', note: 'no agentic CLI (claude or codex) is installed' };
      if (worker === undefined) return { kind: 'unavailable', note: 'the chat queue is not available in this window' };
      if (channel === undefined) this.open();
      const target = session;
      if (target === undefined) return { kind: 'unavailable', note: 'there is no chat to send it to' };
      trySave(target); // a draft chat is kept, so the queued message still finds it
      const res = worker.submit({ sessionId: target.id, text: text.trim(), origin: 'review-pane', attachments: [] });
      return res.ok ? 'queued' : { kind: 'unavailable', note: res.note };
    },
    dispose(): void {
      worker?.dispose();
      endDiffTurn(); // Story E20261013b2e8109f:S001: settle held paths before the sink goes quiet
      void turns.detach();
      dropQueuedApprovals();
      markViewGone();
      disposed = true;
      channel?.dispose();
      channel = undefined;
    },
  };
}
