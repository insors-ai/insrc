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
import { envelope, type WebviewToHost, type HostToWebview, type PermissionMode, type SessionActionTarget } from './protocol.js';
import { AttachmentRefused, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE, type AttachmentRef, type AttachmentStore } from './attachment-store.js';
// S001 (bugfix): classifyPermissionDenial is the pure classifier that tells a tool-permission gate
// apart from a working-directory / sandbox-allowlist block (the two must not share an Approve path).
import { classifyPermissionDenial, type ProviderRegistry, type ProviderId, type StreamAdapter } from './cli-adapter.js';
import { type QueuedApproval,  createApprovalQueue, type ApprovalResolution, type ApprovalDecision } from './approval-queue.js';
import { latestWindow, pageBefore } from './transcript-window.js';
import { transcriptPagerWebviewSource } from './transcript-pager.js';
import { createMemorySessionLocks, defaultIsAlive, defaultProcessStartTime, type SessionLocks } from './session-lock.js';
import { createTurnLifecycle, DEFAULT_TURN_LOCK_TIMEOUT_MS, trySaveSession, type SpawnedCli, type TurnSink } from './turn-lifecycle.js';
import type { ActiveChatEntry, ChatSessionStore, ChatSession, ChatStatus, PersistedRequest, TranscriptEntry, RunConfig } from './session-store.js';
import { readTurnProgress, setTurnProgress } from './session-store.js';
import type { ModelDefinitions } from '../models/definitions.js';
import { providerIcon, PROVIDER_ICON_SVGS } from './provider-icons.js';
import { classifyFailure, MAX_INFRA_RETRIES } from './chat-failure.js';
import type { TurnEvent } from './stream-events.js';
import type { DeclaredOutcome, PresentedTurn, ReviewPresenter } from './review-presenter.js';
import type { QueuedMessage, TurnOutcome } from './chat-queue-store.js';
import type { ChatQueueWorker, QueueAction, QueuedCliIdentity, QueuedTurnRunner, WaitingOn } from './chat-queue-worker.js';
import { projectOutbox, projectSessionOutbox, type OutboxContext } from './chat-outbox.js';
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
  readonly editorDiff: (path: string, baseline: string | undefined, opts: { review: boolean; canRevert?: () => boolean }) => Promise<void>;
  readonly diffView: () => DiffView;
  readonly notify?: (msg: string) => void;
}

/** One served model as the run-config popup lists it. */
export interface RunModelView {
  readonly id: string;
  readonly name: string;
  readonly alias?: string | undefined;
  readonly otherAliases?: readonly string[] | undefined;
  readonly efforts: readonly string[];
}

/** One provider as the run-config popup lists it: its served models + efforts. */
export interface RunProviderView {
  readonly id: ProviderId;
  readonly label: string;
  readonly models: readonly RunModelView[];
}

/** cliKind (daemon family) → chat ProviderId — the same mapping familyForClient uses. */
const CLI_KIND_TO_PROVIDER: Readonly<Record<string, ProviderId>> = { claude: 'claude', codex: 'codex', vibe: 'vibe' };

/** Project the daemon's model definitions to the popup's per-provider view, keeping only
 *  installed providers and dropping rejected model ids. Families sharing a cliKind are
 *  ONE provider: an Ollama-hosted CLI family (e.g. ollama-claude) runs the same CLI
 *  binary against locally-hosted models, so its models join the vendor family's entry
 *  (label from the vendor family) instead of adding a duplicate provider row. Pure; never throws. */
export function runCatalogView(defs: ModelDefinitions, available: readonly ProviderId[]): readonly RunProviderView[] {
  const byProvider = new Map<ProviderId, { label: string; vendorLabelSeen: boolean; seen: Set<string>; models: RunModelView[] }>();
  for (const f of defs.families) {
    const provider = f.cliKind !== undefined ? CLI_KIND_TO_PROVIDER[f.cliKind] : undefined;
    if (provider === undefined || !available.includes(provider)) continue;
    const rejected = new Set(f.rejectedModels ?? []);
    let entry = byProvider.get(provider);
    if (entry === undefined) {
      entry = { label: f.displayName, vendorLabelSeen: f.host === undefined, seen: new Set(), models: [] };
      byProvider.set(provider, entry);
    }
    // The vendor (non-hosted) family's displayName is the provider's label, whatever the order.
    if (f.host === undefined && !entry.vendorLabelSeen) {
      entry.label = f.displayName;
      entry.vendorLabelSeen = true;
    }
    for (const m of f.models) {
      if (rejected.has(m.id) || entry.seen.has(m.id)) continue;
      entry.seen.add(m.id);
      entry.models.push({
        id: m.id,
        name: m.displayName ?? m.id,
        ...(m.aliases.length > 0 ? { alias: m.aliases[0] } : {}),
        ...(m.aliases.length > 1 ? { otherAliases: m.aliases.slice(1) } : {}),
        efforts: m.efforts,
      });
    }
  }
  return [...byProvider.entries()].map(([id, e]) => ({ id, label: e.label, models: e.models }));
}

export function reconcileRunConfig(provider: ProviderId, next: RunConfig, catalog: readonly RunProviderView[]): RunConfig {
  const model = next.model;
  if (model === undefined || model === '') return {};
  const selected = catalog.find(entry => entry.id === provider)?.models.find(entry =>
    entry.id === model || entry.alias === model || entry.otherAliases?.includes(model) === true);
  if (selected === undefined) return {};
  return next.effort !== undefined && selected.efforts.includes(next.effort)
    ? { model, effort: next.effort } : { model };
}

export interface ChatPanelHostDeps {
  createPanel(opts: { viewType: string; title: string }): ChatPanelChannel;
  readonly providers: ProviderRegistry;
  readonly catalogReachable?: (() => Promise<boolean>) | undefined;
  readonly catalogRetryMs?: number | undefined;
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
  readonly deriveTitle?: (input: { provider: ProviderId; prompt: string; cwd: string; model?: string | undefined; effort?: string | undefined }) => Promise<string | undefined>;
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
  readonly isAlive?: ((pid: number, startedAt?: number) => boolean) | undefined;
  /**
   * Story E2026101259da3204:S001: pasting images and attaching documents. The store keeps the
   * files; `pickFiles` (the file dialog, resolving with the chosen paths, none when dismissed)
   * and `open` (show a file) are the two VS Code calls, injected so this module stays free of the
   * vscode module. Absent -> no attach button, no chip row, and the attachment messages are ignored.
   */
  readonly attachments?: ChatAttachmentDeps | undefined;
  /**
   * Story E202611134642d49a:S001 t4: the scratchpad menu in the chat status bar. When present,
   * the webview renders the icon-only #insrc-scratch button next to #insrc-attach, posts
   * 'scratch-open-menu' on click and renders the host's 'scratch-list' pushes into
   * #insrc-scratchmenu. Absent -> no button, no menu, and the scratch messages are ignored
   * by the webview (the host switch still refuses non-string payload fields).
   */
  readonly scratchpads?: { readonly enabled: true } | undefined;
  /** Epic babd84c6e2fb480a Story S001: opens a clicked link or code reference. Absent -> the clicks are ignored. */
  readonly links?: LinkOpener | undefined;
  /**
   * Epic E20261014613abdb3 Story S001: how long a queued message's turn may wait on an unanswered
   * approval or selection card before the message ends as stopped. Default CONTINUATION_WAIT_MS.
   */
  readonly continuationWaitMs?: number | undefined;
  /**
   * E202611031bd72813:S001 t3: how often the active-chats list is recomputed and reposted so done
   * chats age out (the 60 s purge timer). Default 60_000; tests set it low.
   */
  readonly activeListTimerMs?: number | undefined;
  /**
   * E202611031bd72813:S001 t5: the session-output store (for cursor registration/retention) behind
   * the detached-session observer. Absent -> the observer does not run.
   */
  readonly sessionOutput?: import('./session-output.js').SessionOutput | undefined;
  /**
   * E202611031bd72813:S001 t5: how often the background observer reconciles detached chats.
   * Default 60_000; tests set it low. Per-tick ingestion is budgeted.
   */
  readonly observerTimerMs?: number | undefined;
  /** E202611031bd72813:S001 t5: per-tick ingestion budget for the observer (ms). Default 2000. */
  readonly observerTickBudgetMs?: number | undefined;
  /** t6: how long a follow-up run may wait to spawn before the decision is recorded delivery-failed. */
  readonly followUpDeliveryTimeoutMs?: number | undefined;
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
  /**
   * The daemon's model definitions (models.definitions), read once at host start and
   * re-rendered into the bottom-right provider·model popup: per CLI family, the served
   * models (shipped + user-approved, rejected excluded) with their effort levels.
   * Absent -> the popup lists providers with no models (the CLI default only).
   */
  readonly definitions?: (() => Promise<ModelDefinitions>) | undefined;
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
const IDLE_PLACEHOLDER = 'message claude… (Enter send · Ctrl+Enter new line · ^C interrupt)';
const QUEUE_PLACEHOLDER = 'message claude… (Enter to queue · Ctrl+Enter new line · ^C interrupt)';

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
  let viewGeneration = 0;
  let targetedActions = false;
  let nextPendingTurn = 0;
  // Story E202610138d4b90c9:S001: messages another pane handed over, waiting their turn (see drain).
  // Whether the webview has posted 'ready' since the channel was wired. The session is not the
  // test: opening the panel drafts it at once, before the webview listens.
  let webviewReady = false;
  // adopt() is replacing the channel: the waiting list is kept for the restored webview.
  let superseding = false;
  const trySave = (target: ChatSession): void => trySaveSession(deps.store, log, target);
  // The turn lifecycle: the session lease, the newest-message-wins rule, the running CLI process,
  // the turn's cursor in the session file, following a saved turn, Stop and detach.
  const sessionLocks = deps.sessionLocks ?? createMemorySessionLocks({ logger: log });
  const newLifecycle = () => createTurnLifecycle({
    providers: deps.providers,
    store: deps.store,
    locks: sessionLocks,
    lockTimeoutMs: () => deps.turnLockTimeoutMs?.() ?? DEFAULT_TURN_LOCK_TIMEOUT_MS,
    hostPid: deps.hostPid ?? process.pid,
    processStartTime: deps.processStartTime ?? defaultProcessStartTime,
    isAlive: deps.isAlive ?? defaultIsAlive,
    isOpen: () => !disposed,
    logger: log,
    sessionOutput: deps.sessionOutput, // t5: register live/follow cursors for retention
  });
  // S001 (bugfix): the SINGLE chat mode (Manual / Edit Automatically / Auto). It is now a PERSISTED
  // per-session preference: it tracks the ACTIVE session's stored mode (synced on open/switch/
  // restore) and is applied to the NEXT turn's buildArgs.
  // For now Auto is the only available mode: the approval cards Manual and Edit Automatically depend on
  // break the chat flow. A session's stored mode is left as it is, so it returns when this is lifted.
  let permissionMode: PermissionMode = 'auto';
  const modeOf = (_s: ChatSession | undefined): PermissionMode => 'auto';
  // Keep the last usable catalog across failures and webview replacement.
  let runCatalog: readonly RunProviderView[] = deps.providers.available.map((id) => ({ id, label: id, models: [] }));
  let runCatalogReady = false;
  let catalogStatus: 'loading' | 'ready' | 'unavailable' = deps.definitions === undefined ? 'unavailable' : 'loading';
  let catalogGeneration = 0;
  let catalogRevision = 0;
  let catalogFlight = false;
  let catalogTimer: ReturnType<typeof setTimeout> | undefined;
  const postCatalog = (): void => {
    if (webviewReady) post({ type: 'run-catalog', revision: catalogRevision, status: catalogStatus, providers: runCatalog });
  };
  const publishCatalog = (status: typeof catalogStatus): void => {
    catalogStatus = status;
    catalogRevision += 1;
    postCatalog();
  };
  const resetCatalogBinding = (): void => {
    catalogGeneration += 1;
    catalogFlight = false;
    clearTimeout(catalogTimer);
    catalogTimer = undefined;
  };
  const scheduleCatalogRecovery = (): void => {
    if (catalogTimer !== undefined || deps.catalogReachable === undefined || channel === undefined) return;
    const generation = catalogGeneration;
    const revision = catalogRevision;
    catalogTimer = setTimeout(() => {
      catalogTimer = undefined;
      if (generation !== catalogGeneration) return;
      void (async () => {
        let reachable = false;
        try { reachable = await deps.catalogReachable?.() === true; } catch { /* retry while the panel remains open */ }
        if (generation !== catalogGeneration || revision !== catalogRevision || catalogStatus !== 'unavailable') return;
        if (reachable) refreshRunCatalog();
        else scheduleCatalogRecovery();
      })();
    }, deps.catalogRetryMs ?? 60_000);
    catalogTimer.unref();
  };
  const refreshRunCatalog = (): void => {
    const definitions = deps.definitions;
    if (definitions === undefined || channel === undefined || catalogFlight) return;
    const generation = catalogGeneration;
    catalogFlight = true;
    clearTimeout(catalogTimer);
    catalogTimer = undefined;
    publishCatalog('loading');
    void (async () => {
      try {
        const next = runCatalogView(await definitions(), deps.providers.available);
        if (generation !== catalogGeneration) return;
        runCatalog = next;
        runCatalogReady = true;
        publishCatalog('ready');
        if (session !== undefined) {
          reconcileSessionConfig(session);
          postRunConfig(session);
        }
      } catch (err) {
        if (generation !== catalogGeneration) return;
        log.warn(`[chat] models.definitions unavailable: ${err instanceof Error ? err.message : String(err)}`);
        publishCatalog('unavailable');
        scheduleCatalogRecovery();
      } finally {
        if (generation === catalogGeneration) catalogFlight = false;
      }
    })();
  };
  // ISSUE-6a811b8a: the approval queue. Every approval-request a turn raises is queued here and
  // only the oldest undecided one (the head) is shown as an actionable card; the next is shown once
  // it is decided. Each request keeps the facts its decision needs: `toolName` (the tool to
  // pre-allow), `command` (the exact command to name in the grant re-run), `blockKind` (a
  // tool-permission gate apart from a working-dir / sandbox-allowlist block, which Approve cannot
  // grant) and `resolution` (a turn that ended on refusal, or the running turn).
  // Epic E20261014613abdb3 Story S001: the queued message this window is running, and what its
  // turns (the message's own and its continuations) have reported so far.
  interface QueuedRun {
    readonly message: QueuedMessage;
    readonly session: ChatSession;
    readonly onSpawn: (cli: QueuedCliIdentity) => void;
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
  type SelectionRequest = Extract<TurnEvent, { kind: 'selection-request' }>;
  interface SessionRuntime {
    readonly session: ChatSession;
    readonly turns: ReturnType<typeof newLifecycle>;
    readonly approvals: ReturnType<typeof createApprovalQueue>;
    readonly pendingSelections: Map<string, SelectionRequest>;
    startingTurns: number;
    pendingTurnId?: string | undefined;
    queued?: QueuedRun | undefined;
    shownApproval?: string | undefined;
    shownTotal: number;
    restored: boolean;
    diffTurn?: DiffTurn | undefined;
    governor?: EditGovernor | undefined;
    writer?: symbol | undefined;
    rollbackUnsafe: boolean;
  }
  const runtimes = new Map<string, SessionRuntime>();
  const runtimeOf = (s: ChatSession): SessionRuntime => {
    const existing = runtimes.get(s.id);
    if (existing !== undefined) return existing;
    const rt: SessionRuntime = {
      session: s, turns: newLifecycle(), approvals: createApprovalQueue(), pendingSelections: new Map(),
      startingTurns: 0, shownTotal: 0, restored: false, rollbackUnsafe: false,
    };
    rt.governor = makeGovernor(rt);
    runtimes.set(s.id, rt);
    return rt;
  };
  const selected = (): SessionRuntime | undefined => session === undefined ? undefined : runtimeOf(session);
  const matchesAction = (rt: SessionRuntime, target: SessionActionTarget | undefined, turnId: string | undefined): boolean =>
    target === undefined ? !targetedActions : turnId !== undefined && target?.sessionId === rt.session.id && target.viewGeneration === viewGeneration && target.turnId === turnId;
  const postRunning = (rt: SessionRuntime): void => {
    if (rt.session !== session) return;
    post({ type: 'turn-running', sessionId: rt.session.id, pendingTurnId: rt.pendingTurnId, target: { sessionId: rt.session.id, viewGeneration } });
  };
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
  // Story E202611134642d49a:S001 t4: the scratchpad button is always available in the status
  // bar (the store lives in the extension host), but the seam is injectable so tests without a
  // scratch setup see no button — the same contract as the attach seam.
  const scratchOn = deps.scratchpads !== undefined;
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
  let diffTurnSeq = 0;
  const openDiffTurn = (s: ChatSession): DiffTurn => {
    const dt: DiffTurn = { session: s, key: `d${Date.now().toString(36)}${(diffTurnSeq++).toString(36)}`, sections: new Map(), held: new Map(), afterTerminal: false, ended: false };
    runtimeOf(s).diffTurn = dt;
    return dt;
  };
  /** Push a row the event path did not write, and post it while its session is the one shown. */
  const pushRow = (dt: DiffTurn, row: TranscriptEntry): void => {
    dt.session.transcript.push(row);
    const rowIndex = dt.session.transcript.length - 1;
    if (!disposed && session === dt.session) post({ type: 'transcript-row', rowIndex, row, target: { sessionId: dt.session.id, viewGeneration } });
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
    const governor = runtimeOf(dt.session).governor;
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
  const endDiffTurn = (rt = selected()): void => {
    const dt = rt?.diffTurn;
    if (dt === undefined || dt.ended) return;
    settleHeld(dt);
    dt.ended = true;
    trySave(dt.session);
    void rt?.governor?.abandonTurn().catch((err: unknown) => warnGovernor('abandonTurn', err));
  };

  const makeGovernor = (rt: SessionRuntime): EditGovernor | undefined => {
    if (deps.editGovernance === undefined) return undefined;
    const eg = deps.editGovernance;
    const editRender: EditRenderSeam = {
      showSections: (ops, overflow) => {
        const dt = rt.diffTurn;
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
        const dt = rt.diffTurn;
        if (dt === undefined || dt.ended) return;
        pushMarker(dt, 'The changes of this turn could not be read');
        if (dt.afterTerminal) trySave(dt.session);
      },
      showEditor: (path, baseline, opts) => {
        const writer = rt.writer;
        return eg.editorDiff(path, baseline, {
          ...opts,
          canRevert: () => writer !== undefined && rt.writer === writer && !rt.rollbackUnsafe,
        });
      },
    };
    return createEditGovernor({
      baseline: eg.baseline,
      fs: eg.fs,
      render: editRender,
      diffView: eg.diffView,
      logger: { warn: (m) => log.warn(m) },
      ...(eg.notify !== undefined ? { notify: eg.notify } : {}),
    });
  };

  /** The governor's calls are fired and forgotten: a failure is logged, never an unhandled rejection. */
  const warnGovernor = (step: string, err: unknown): void =>
    log.warn(`[chat] edit governor ${step} failed: ${err instanceof Error ? err.message : String(err)}`);

  // S005: (re)post the extension-local chat history so the webview history-dropdown stays current.
  // ISSUE-0d3939248a956860: a chat with no message is left out — it would show as an empty
  // "new chat" row that opens to nothing (it stays on disk; the list is only filtered).
  const postHistory = (): void => post({ type: 'history-list', chats: deps.store.list().filter((c) => deps.store.hasMessages(c.id)) });
  // E202611031bd72813:S001 t3: the active-chats dropdown feed — recomputed (purge included) on every
  // status change, on history refresh, and on a 60 s timer so done chats age out of the list.
  // E202611031bd72813:S001 t4 ac4: project to the exact protocol ActiveChatEntry wire shape
  // (id/title/provider/status/lastActivityAt) — the store's entry also carries updatedAt, which
  // is a history-list field, not an active-list field. `provider` rides along so the dropdown
  // can paint the provider icon next to the chat title (UX feedback).
  const postActive = (): void => post({ type: 'active-list', chats: deps.store.activeChats().map((c) => ({ id: c.id, title: c.title, provider: c.provider, status: c.status, lastActivityAt: c.lastActivityAt })) });
  let activeTimer: ReturnType<typeof setInterval> | undefined;
  const startActiveTimer = (): void => {
    if (activeTimer !== undefined) return;
    activeTimer = setInterval(() => { if (!disposed) postActive(); }, deps.activeListTimerMs ?? 60_000);
    activeTimer.unref?.(); // a panel-lifetime timer must not by itself keep the process alive
  };

  // E202611031bd72813:S001 t5 — the 60 s lossless observer for detached chats. For each active
  // session whose saved turn this host does not run and whose owner host is dead, it ingests the
  // remaining output through the provider adapter from the persisted observer checkpoint (own
  // cursor, registered for retention), persisting requests before any completion/death transition.
  let observerTimer: ReturnType<typeof setInterval> | undefined;
  let observerRunning = false; // passes never overlap: a tick is skipped while one is in flight
  // Generations this host's observer currently pins (key `${sessionId}:${generation}`), held
  // ACROSS ticks while there may be unread output; registered once per generation (refcounted),
  // released only when a pass caught up or the turn reached a real terminal.
  const heldPins = new Map<string, { sessionId: string; turnId: string; generation: number; offset: number }>();
  const runObserverPass = async (): Promise<void> => {
    if (observerRunning || disposed) return;
    observerRunning = true;
    try {
      await observeDetached();
    } finally {
      observerRunning = false;
    }
  };
  const startObserverTimer = (): void => {
    if (observerTimer !== undefined || deps.sessionOutput === undefined) return;
    observerTimer = setInterval(() => { void runObserverPass(); }, deps.observerTimerMs ?? 60_000);
    observerTimer.unref?.(); // same as the active-list timer above
  };
  /** Persists a request onto the fresh record (union by requestId); returns whether it is UNRESOLVED. */
  const persistRequest = (s: ChatSession, r: PersistedRequest): boolean => {
    try {
      const fresh = deps.store.get(s.id) ?? s;
      const existing = fresh.pendingRequests ?? [];
      // MR1-R3: replay detection is scoped to the originating turn — a LATER turn reusing the same
      // request id is a new request, not a replay of the earlier (possibly resolved) one
      const prior = existing.find((x) => x.requestId === r.requestId && x.turnId === r.turnId);
      if (prior !== undefined) return !prior.resolved; // a replayed, already-resolved request stays resolved
      fresh.pendingRequests = [...existing, r];
      deps.store.save(fresh);
      return true;
    } catch (err) {
      log.warn(`[chat] session ${s.id}: pendingRequest not saved: ${err instanceof Error ? err.message : String(err)}`);
      return true;
    }
  };
  const observeDetached = async (): Promise<void> => {
    const out = deps.sessionOutput;
    if (out === undefined) return;
    let chats: readonly ActiveChatEntry[];
    try {
      chats = deps.store.activeChats();
    } catch {
      return;
    }
    const hostPid = deps.hostPid ?? process.pid;
    for (const c of chats) {
      const s = deps.store.get(c.id);
      const live = s?.liveTurn;
      if (s === undefined || live === undefined) continue;
      if (live.ownerHostPid === hostPid) continue; // this host's own live/followed turn: the lifecycle owns it
      if (deps.isAlive !== undefined && live.ownerHostPid !== 0 && deps.isAlive(live.ownerHostPid)) continue; // another live window owns it
      const turnId = live.cursor.turnId;
      // The checkpoint is turn-scoped: a checkpoint of ANOTHER turn is never reused. With no valid
      // checkpoint the observer re-anchors to the TURN'S START (recoverTurn), never to the advanced
      // transcript cursor with an empty decoder — a fresh full-turn replay is lossless (request ids
      // dedupe), a mid-stream start could lose a split marker or reuse a selection id.
      const cpRaw = s.observerCheckpoint;
      let cp = cpRaw !== undefined && cpRaw.turnId === turnId ? cpRaw : undefined;
      // Whether the pass anchors at the TURN'S START (no valid checkpoint -> recoverTurn): such a
      // replay must truncate to the turn-start transcript length, so rows the live reader already
      // persisted for THIS turn are replaced, not duplicated.
      let anchorIsTurnStart = false;
      // A replaying pass (rewind / SegmentGone re-anchor / first pass after detach) re-reads
      // already-ingested events: truncate the transcript back to the last persisted length at the
      // anchor point — the checkpoint's transcriptLen, or the liveTurn's turnStartLen for a
      // turn-start anchor, or the liveTurn's current stamp — so re-appended rows replace, never
      // duplicate, already-persisted rows.
      // anchorIsTurnStart means the pass replays from the TURN'S START; only a successful recoverTurn
      // sets it — the fallback below replays from the ADVANCED live cursor, where truncating to the
      // turn-start length would delete consumed rows without replaying them.
      const anchorLen = (): number | undefined =>
        anchorIsTurnStart
          ? (live.turnStartLen ?? live.transcriptLen ?? cp?.transcriptLen) // never 0: a missing stamp must not delete earlier history
          : (cp?.transcriptLen ?? live.transcriptLen);
      if (cp === undefined) {
        try {
          const rc = await out.recoverTurn(s.id, turnId);
          if (rc !== undefined) {
            cp = { turnId, generation: rc.generation, offset: rc.offset, selectionSeq: 0 };
            anchorIsTurnStart = true;
          }
        } catch { /* fall back below */ }
        // Fallback: the liveTurn cursor PAIRED WITH the lifecycle's own decoder state for this turn —
        // never the advanced offset with an empty decoder (that would lose a split-marker prefix).
        cp ??= { turnId, generation: live.cursor.generation, offset: live.cursor.offset, selectionSeq: live.decoder?.selectionSeq ?? 0, ...(live.decoder?.selectionBuffer !== undefined && live.decoder.selectionBuffer !== '' ? { selectionBuffer: live.decoder.selectionBuffer } : {}), ...(live.decoder?.sessionId !== undefined ? { sessionId: live.decoder.sessionId } : {}), ...(live.decoder?.toolCommands !== undefined ? { toolCommands: { ...live.decoder.toolCommands } } : {}), ...(live.decoder?.editPaths !== undefined ? { editPaths: { ...live.decoder.editPaths } } : {}) };
      }
      // AFTER the anchor is known: the persisted rows below this cut are kept; everything the pass
      // re-reads past the anchor is collected as pending rows and REPLACES the persisted rows above
      // the cut at save time — so replays never duplicate already-persisted rows, and the cached
      // record's transcript is never mutated mid-pass.
      const baseLen = s.transcript.length;
      let replayCut = anchorLen() ?? baseLen;
      let pendingRows: TranscriptEntry[] = [];
      let ad;
      try {
        ad = deps.providers.get(s.provider);
      } catch {
        continue;
      }
      if (typeof ad.resume !== 'function') continue;
      const resume = ad.resume.bind(ad);
      // One ingest pass from `from` with the given decoder state. Its generation is pinned via
      // heldPins (once per generation, across passes/ticks) — dropped only when the pass caught
      // up or reached a real terminal; between ticks an unread generation stays pinned.
      const readerId = `host-${hostPid}`; // one pin per reader: another window's observer may pin the same generation
      const ingest = async (from: { generation: number; offset: number }, decSeq: number, decBuf: string) => {
        const cursor = { sessionId: s.id, turnId, generation: from.generation, offset: from.offset };
        const pinKey = `${s.id}:${cursor.generation}`;
        if (!heldPins.has(pinKey)) {
          out.registerCursor(cursor, readerId);
          heldPins.set(pinKey, cursor);
        }
        const ctl = new AbortController();
        const deadline = Date.now() + (deps.observerTickBudgetMs ?? 2000);
        // Budget watchdog: bounds the pass even while the followed process is idle and no events
        // arrive (tail otherwise waits indefinitely), so a tick always ends and passes never overlap.
        const watchdog = setTimeout(() => {
          st.abortedByBudget = true;
          ctl.abort();
        }, deps.observerTickBudgetMs ?? 2000);
        watchdog.unref?.();
        // seed the decoder-carried fields from the checkpoint: an idle, budget-aborted pass gets no
        // onDecoderState callback, and the checkpoint write below must not drop what the previous pass captured
        const st = { sawTerminal: cp.sawTerminal === true, sawObservationFailure: false, syntheticEofOnly: true, abortedByBudget: false, threw: false, ingestedAny: false, last: cursor, seq: decSeq, buf: decBuf, nativeSessionId: cp.sessionId, toolCommands: cp.toolCommands !== undefined ? { ...cp.toolCommands } : undefined as Record<string, string> | undefined, editPaths: cp.editPaths !== undefined ? { ...cp.editPaths } : undefined as Record<string, string> | undefined, preTerminal: undefined as { generation: number; offset: number; seq: number; buf: string; rows: number } | undefined };
        try {
          const events = resume(
            { cursor, pid: live.pid, startedAt: live.startedAt ?? null, decoderState: { selectionSeq: decSeq, ...(decBuf !== '' ? { selectionBuffer: decBuf } : {}), ...(cp.sessionId !== undefined ? { sessionId: cp.sessionId } : {}), ...(cp.toolCommands !== undefined ? { toolCommands: { ...cp.toolCommands } } : {}), ...(cp.editPaths !== undefined ? { editPaths: { ...cp.editPaths } } : {}) }, ...(cp.sawTerminal === true ? { sawTerminal: true } : {}) },
            {
              drain: true, // read the WHOLE segment, past the terminal event — caught-up means drained
              signal: ctl.signal,
              onProgress: (cur) => {
                st.last = { ...cursor, offset: cur.offset };
                if (Date.now() > deadline && !ctl.signal.aborted) {
                  st.abortedByBudget = true;
                  ctl.abort(); // per-tick budget: pause, never discard
                }
              },
              onDecoderState: (ds) => {
                st.seq = ds.selectionSeq;
                st.buf = ds.selectionBuffer;
                // capture the native session id as soon as the decoder sees it (codex thread.started /
                // claude init) — a budget-limited pass that consumed it before completing still persists it
                if (ds.sessionId !== undefined) st.nativeSessionId = ds.sessionId;
                // and the tool_use -> command/edit-path correlations, so a budget boundary between
                // tool_use and tool_result cannot drop them
                if (ds.toolCommands !== undefined) st.toolCommands = { ...ds.toolCommands };
                if (ds.editPaths !== undefined) st.editPaths = { ...ds.editPaths };
              },
            },
          );
          for await (const ev of events) {
            st.ingestedAny = true;
            // capture the pre-terminal cursor+decoder+transcript length BEFORE the terminal event's
            // row is appended, so a budget rewind replays from a point whose transcriptLen excludes it
            if ((ev.kind === 'done' || (ev.kind === 'error' && ev.observationFailure !== true)) && st.preTerminal === undefined) {
              st.preTerminal = { generation: st.last.generation, offset: st.last.offset, seq: st.seq, buf: st.buf, rows: pendingRows.length };
            }
            // collect the event's transcript row exactly like the live path maps it (rowForEvent), so
            // an observer-completed detached chat reopens with its output, not an empty transcript.
            // Observation failures are transient read errors, not durable output — never persisted.
            if (!(ev.kind === 'error' && ev.observationFailure === true)) {
              const row = rowForEvent(ev);
              if (row !== undefined) pendingRows.push(row);
            }
            if (ev.kind === 'approval-request') {
              // waiting-input only if the request is actually unresolved — a replayed, already
              // resolved request must not flip the chat back to waiting-input
              if (persistRequest(s, { requestId: ev.requestId, kind: 'approval', turnId: ev.turnId, title: ev.title, detail: ev.detail, ...(ev.toolName !== undefined ? { toolName: ev.toolName } : {}), ...(ev.command !== undefined ? { command: ev.command } : {}), resolved: false })) setChatStatus(s, 'waiting-input');
            } else if (ev.kind === 'selection-request') {
              if (persistRequest(s, { requestId: ev.requestId, kind: 'selection', turnId: ev.turnId, prompt: ev.prompt, options: ev.options.map((o) => o.label), ...(ev.multi === true ? { multi: true } : {}), resolved: false })) setChatStatus(s, 'waiting-input');
            } else if (ev.kind === 'tool-call' && ev.present !== undefined) {
              // E202611031bd72813:S001 t8: a DETACHED chat's insrc_present is still dispatched to the
              // presenter (each declaration opens its own presentKey panel), deduped by declarationId.
              const decl = declarationIdOf(ev);
              // MR4: the shared durable identity covers the follow reader's replays too
              if (!declarationDispatched(s, decl)) {
                markDeclarationDispatched(s, decl);
                const declared = new Set(s.observerCheckpoint?.declaredIds ?? []);
                declared.add(decl.id);
                const base = s.observerCheckpoint ?? { turnId, generation: cp.generation, offset: cp.offset, selectionSeq: cp.selectionSeq };
                s.observerCheckpoint = { ...base, declaredIds: [...declared] };
                try {
                  deps.store.save(s);
                } catch { /* best-effort */ }
                const presenter = deps.presenter;
                if (presenter !== undefined) {
                  try {
                    const shown = presenter.begin();
                    void shown
                      .declared(ev.present)
                      .then((outcome) => {
                        shown.end();
                        if (outcome.unreadable) log.warn(`[chat] session ${s.id}: a detached insrc_present could not be read`);
                      })
                      .catch((err: unknown) => log.error(`chat: the review presenter failed on a detached declaration: ${err instanceof Error ? err.message : String(err)}`));
                  } catch (err) {
                    log.error(`chat: the review presenter failed on a detached declaration: ${err instanceof Error ? err.message : String(err)}`);
                  }
                }
              }
            } else if (ev.kind === 'error') {
              if (ev.observationFailure === true) {
                st.sawObservationFailure = true;
                // only the synthetic EOF error ('the turn ended without a result') is excusable by
                // verified death; a real read failure / SegmentGone must block caught-up
                if (ev.message !== 'the turn ended without a result') st.syntheticEofOnly = false;
              }
              else {
                st.sawTerminal = true;
              }
            } else if (ev.kind === 'done') {
              st.sawTerminal = true;
              // keep the provider's native session id (same rule as the live path's keepNativeSession),
              // so the next turn can resume the detached session's CLI thread
              if (ev.sessionId !== undefined) st.nativeSessionId = ev.sessionId;
            }
            if (Date.now() > deadline && !ctl.signal.aborted) {
              st.abortedByBudget = true;
              ctl.abort();
            }
          }
        } catch {
          if (!ctl.signal.aborted) st.threw = true; // the cursor stays; recovery below re-anchors
        } finally {
          clearTimeout(watchdog);
        }
        return { ...st, cursor };
      };
      let pass = await ingest({ generation: cp.generation, offset: cp.offset }, cp.selectionSeq, cp.selectionBuffer ?? '');
      // SegmentGone / output-read failure recovery: re-anchor into the oldest retained generation
      // that still holds this turn and replay from its start with a FRESH decoder. Replay is
      // lossless, not duplicating: persisted requests dedupe by requestId on re-ingest.
      if (pass.sawObservationFailure && !pass.abortedByBudget && !pass.threw) { // a prior terminal in the checkpoint does not block re-anchoring
        try {
          const oldest = await out.oldestRetainedGeneration(s.id);
          const rc = oldest !== undefined ? await out.recoverTurn(s.id, turnId) : undefined;
          if (rc !== undefined && (rc.generation !== pass.cursor.generation || rc.offset !== pass.cursor.offset)) {
            // the re-anchor replays from the TURN'S START: collect rows afresh and cut at the
            // turn-start length (never below the pass-start cut when the stamp is missing)
            pendingRows = [];
            replayCut = live.turnStartLen ?? replayCut;
            pass = await ingest(rc, 0, '');
          }
        } catch { /* keep the failed pass */ }
      }
      // caught up = the iterator drained to the end of the available output without a budget abort,
      // an observation failure, or a thrown pass
      // caught up = drained to the end of the available output without an abort/failure — reading
      // nothing new also counts when the checkpoint already holds an ingested terminal.
      const pidDead0 = live.pid !== undefined && deps.isAlive !== undefined && !deps.isAlive(live.pid, live.startedAt ?? undefined);
      // caught up = drained without abort/throw; an observation failure does not block it when the
      // process is VERIFIED dead (the synthetic EOF error is expected then).
      const caughtUp = (pass.ingestedAny || cp.sawTerminal === true) && !pass.abortedByBudget && !pass.threw && (!pass.sawObservationFailure || (pidDead0 && pass.syntheticEofOnly));
      // persist the checkpoint (turn-scoped: own cursor + decoder progress). A terminal seen in a
      // NOT-caught-up pass is not checkpointed past: the next pass re-reads from just before the
      // terminal event, so the completion gate (caught up AND (terminal or verified death)) applies.
      // Rewind a not-caught-up terminal to just before it — ONCE (a sustained budget exhaustion
      // must not replay the same prefix forever; after one rewind the checkpoint advances normally).
      const rewind = pass.sawTerminal && !caughtUp && cp.sawTerminal !== true;
      const persistAt = rewind ? (pass.preTerminal ?? pass.last) : pass.last;
      const persistSeq = rewind ? (pass.preTerminal?.seq ?? pass.seq) : pass.seq;
      const persistBuf = rewind ? (pass.preTerminal?.buf ?? pass.buf) : pass.buf;
      // A rewind keeps only the rows collected up to the pre-terminal point.
      const keptRows = rewind ? (pass.preTerminal?.rows ?? 0) : pendingRows.length;
      let checkpointSaved = false;
      // Re-fetch and check the liveTurn identity BEFORE persisting anything: if another window
      // reattached or a newer turn started mid-pass, this pass must not write the checkpoint or the
      // transcript at all — the new owner owns the record.
      const fresh0 = deps.store.get(s.id);
      const stillSameTurn = fresh0?.liveTurn !== undefined && fresh0.liveTurn.cursor.turnId === live.cursor.turnId && fresh0.liveTurn.cursor.generation === live.cursor.generation && fresh0.liveTurn.cursor.offset === live.cursor.offset && fresh0.liveTurn.ownerHostPid === live.ownerHostPid;
      try {
        if (!stillSameTurn) throw new Error('turn taken over mid-pass');
        const fresh = fresh0 ?? s;
        // Merge without ever mutating the cached record mid-pass: keep the fresh record's rows below
        // the replay cut, then this pass's collected rows, then any rows another window appended
        // during ingestion (beyond what this pass fetched at its start). Nothing is discarded.
        const cut = Math.min(replayCut, fresh.transcript.length);
        const concurrentSuffix = fresh.transcript.length > baseLen ? fresh.transcript.slice(baseLen) : [];
        const merged = [...fresh.transcript.slice(0, cut), ...pendingRows.slice(0, keptRows), ...concurrentSuffix];
        const toSave: ChatSession = { ...fresh, transcript: merged };
        if (pass.nativeSessionId !== undefined) toSave.nativeSessionId = pass.nativeSessionId;
        toSave.observerCheckpoint = { turnId, generation: persistAt.generation, offset: persistAt.offset, selectionSeq: persistSeq, ...(persistBuf !== '' ? { selectionBuffer: persistBuf } : {}), ...(pass.nativeSessionId !== undefined ? { sessionId: pass.nativeSessionId } : {}), ...(pass.toolCommands !== undefined ? { toolCommands: { ...pass.toolCommands } } : {}), ...(pass.editPaths !== undefined ? { editPaths: { ...pass.editPaths } } : {}), ...(pass.sawTerminal ? { sawTerminal: true } : {}), ...(rewind ? { rewound: true } : {}), ...(fresh.observerCheckpoint?.declaredIds !== undefined ? { declaredIds: fresh.observerCheckpoint.declaredIds } : {}), transcriptLen: cut + keptRows };
        deps.store.save(toSave);
        checkpointSaved = true;
      } catch { /* best-effort — pins are NOT released below if this failed; a takeover retries next pass */ }
      // Terminal output is safe to checkpoint, but the writer may still own this segment.
      let transitionSaved = false;
      if (caughtUp && checkpointSaved && pidDead0) {
        // A newer turn may have started while this pass was ingesting: re-check the liveTurn identity
        // before clearing — never erase a new turn's cursor or mark it done from an old pass.
        const now = deps.store.get(s.id);
        const same = now?.liveTurn !== undefined && now.liveTurn.cursor.turnId === live.cursor.turnId && now.liveTurn.cursor.generation === live.cursor.generation && now.liveTurn.cursor.offset === live.cursor.offset && now.liveTurn.ownerHostPid === live.ownerHostPid;
        if (same) {
          try {
            // ONE atomic write clears liveTurn AND sets the final status, on a COPY: the store's
            // get() returns its cached (mutable) record, so mutating it before save would leave the
            // cache showing no liveTurn even when the write fails — and every later pass skips such
            // a session, permanently unreconciled. Mutating only the copy means a failed save leaves
            // both the cache and the disk untouched, so the next pass retries the whole transition.
            const { liveTurn: _cleared, ...rest } = now!;
            const next: ChatSession = {
              ...rest,
              status: (now!.pendingRequests ?? []).some((r) => !r.resolved) ? 'waiting-input' : 'done',
              lastActivityAt: Math.max(now!.lastActivityAt ?? 0, Date.now()),
            };
            if (next.progress?.turnId === turnId) setTurnProgress(next, undefined);
            deps.store.save(next);
            transitionSaved = true;
          } catch { /* best-effort: the next pass retries the whole transition */ }
          if (transitionSaved) postActive();
        }
      }
      if (transitionSaved) {
        out.unregisterCursor({ sessionId: s.id, ...live.cursor }, readerId);
        for (const [key, cur] of [...heldPins]) {
          if (key.startsWith(`${s.id}:`)) {
            heldPins.delete(key);
            out.unregisterCursor(cur, readerId);
          }
        }
      }
    }
  };

  // Story E20261012ddc4ede1:S001: post a live event with the absolute transcript index of the row
  // it wrote (none for an event that writes no row), so the webview knows which row each node is.
  const postLive = (s: ChatSession | undefined, event: TurnEvent, rowIndex: number | undefined, projectTurn = true): void => {
    if (s !== session) return;
    post({ type: 'turn-event', event, ...(rowIndex !== undefined ? { rowIndex } : {}),
      ...(s !== undefined ? { target: { sessionId: s.id, viewGeneration, ...(projectTurn ? { turnId: event.turnId } : {}) } } : {}) });
  };

  // Story E20261012ddc4ede1:S001: every session-restored goes through here. Only the latest window
  // of the transcript is sent (never the whole history), with the absolute index of its first row
  // and the transcript's total row count; the webview asks for older pages with 'load-older'.
  const postRestored = (s: ChatSession): void => {
    reconcileSessionConfig(s);
    // Story c760757cc9077508/s1: echo the run config BEFORE the transcript — the webview's
    // assistant who-labels compose from it at render time, so the restore must not render
    // rows under the previous session's identity. ([run-config, session-restored] order.)
    postRunConfig(s);
    const window = latestWindow(s.transcript);
    viewGeneration += 1;
    post({ type: 'session-restored', sessionId: s.id, viewGeneration, progress: readTurnProgress(s), pendingTurnId: runtimes.get(s.id)?.pendingTurnId, transcript: [...window.rows], mode: permissionMode, firstIndex: window.firstIndex, total: s.transcript.length });
    postOutbox(); // Epic E20261014613abdb3 Story S002: each chat shows its own outbox
  };

  /** Echo the session's run config to the bottom-right buttons ('' = CLI default). */
  const postRunConfig = (s: ChatSession): void => {
    post({ type: 'run-config', provider: s.provider, model: s.model ?? '', effort: s.effort ?? '' });
  };

  const reconcileSessionConfig = (s: ChatSession, proposed: RunConfig = s): RunConfig => {
    if (!runCatalogReady) return {};
    const next = reconcileRunConfig(s.provider, proposed, runCatalog);
    if (s.model !== next.model || s.effort !== next.effort) {
      s.model = next.model;
      s.effort = next.effort;
      if (deps.store.get(s.id) !== undefined) trySave(s);
    }
    return next;
  };

  /**
   * Epic E20261014613abdb3 Story S002: the queue's rows as the worker last delivered them (undefined
   * while the queue is off or has not been read yet), projected to the shown chat's outbox and posted
   * after every change, whenever a chat is shown (which covers the webview's 'ready') and after an
   * action. A note is shown once, with the post it came with.
   */
  let outboxRows: readonly QueuedMessage[] | undefined;
  const postOutbox = (note?: string): void => {
    if (session === undefined) return;
    const ctx: OutboxContext = {
      titleOf: (id) => deps.store.get(id)?.title,
      here: (m) => runtimes.get(m.sessionId)?.queued?.message.seq === m.seq,
      ...(note !== undefined ? { note } : {}),
    };
    try {
      const snapshot = worker?.eligibility?.();
      if (snapshot !== undefined) post({ type: 'outbox', view: projectSessionOutbox(snapshot, session.id, ctx) });
      else if (outboxRows !== undefined) post({ type: 'outbox', view: projectOutbox(outboxRows, session.id, ctx) });
    } catch (err) {
      log.warn(`[chat-queue] could not project the outbox: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // S003 (dev-chat ux polish): record a resolved permission decision. Mirrors the tool-result
  // dual persist+render path (appendEvent): emit it LIVE as a turn-event the webview renders via the
  // registry (a resolved chip), AND persist it STRUCTURALLY as a role:'permission-outcome' transcript
  // row (+ save) so a restored session shows the decided chip instead of the live-only approval card.
  const recordPermissionOutcome = (toolName: string, approved: boolean, requestId: string, s = session): void => {
    const decision: 'approved' | 'rejected' = approved ? 'approved' : 'rejected';
    // Story E20261012ddc4ede1:S001: write the row first, so the event carries its row index.
    let rowIndex: number | undefined;
    if (s !== undefined) {
      s.transcript.push({ role: 'permission-outcome', toolName, decision, at: now() });
      rowIndex = s.transcript.length - 1;
    }
    postLive(s, { kind: 'permission-outcome', turnId: `perm-${requestId}`, toolName, decision }, rowIndex, false);
    if (s !== undefined) trySave(s);
  };

  // ISSUE-6a811b8a: where a request is answered. The adapters set it; a request without it is
  // routed as before the field existed (a request naming a tool was a claude refusal that ended
  // the turn; any other was answered inside the turn).
  const resolutionOf = (ev: Extract<TurnEvent, { kind: 'approval-request' }>): ApprovalResolution =>
    ev.resolution ?? (typeof ev.toolName === 'string' && ev.toolName !== '' ? 'turn-ended' : 'in-turn');

  // ISSUE-6a811b8a: post the queue head as the actionable card, once per request.
  const showApprovalHead = (rt = selected()): void => {
    if (rt === undefined || session?.id !== rt.session.id) return;
    const head = rt.approvals.head();
    if (head === undefined) {
      rt.shownApproval = undefined;
      return;
    }
    if (rt.shownApproval === head.request.requestId) {
      // Requests joined the queue behind the shown card: update its count in place, never a second card.
      if (head.total !== rt.shownTotal) {
        rt.shownTotal = head.total;
        post({ type: 'approval-position', requestId: head.request.requestId, position: head.position, total: head.total, target: { sessionId: rt.session.id, viewGeneration } });
      }
      return;
    }
    rt.shownApproval = head.request.requestId;
    rt.shownTotal = head.total;
    const r = head.request;
    post({
      type: 'turn-event',
      target: { sessionId: rt.session.id, viewGeneration },
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
  const reportCards = (rt = selected()): void => {
    if (rt === undefined) return;
    const q = rt.queued;
    if (q === undefined) return;
    const now: WaitingOn = rt.approvals.head() !== undefined ? 'approval' : rt.pendingSelections.size > 0 ? 'selection' : undefined;
    if (now === q.waiting) return;
    q.waiting = now;
    try {
      q.onWaiting?.(now);
    } catch (err) {
      log.warn(`[chat] the queue could not be told about a waiting card: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // E202611031bd72813:S001 t2 — active-chat status precedence (LLD s5): waiting-input while ANY
  // approval/selection request is unresolved; working while a turn runs; done at terminal with none.
  const unresolvedRequests = (rt = selected()): boolean => rt !== undefined && (rt.approvals.head() !== undefined || rt.pendingSelections.size > 0);
  const setChatStatus = (s: ChatSession, status: ChatStatus): void => {
    // a failing status write is logged and never breaks a turn (same rule as trySaveSession)
    try {
      deps.store.setStatus(s.id, status);
      postActive(); // keep the active-chats dropdown in sync on every transition
    } catch (err) {
      log.warn(`[chat] session ${s.id}: status not saved: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const reevaluateChatStatus = (s: ChatSession): void => {
    const rt = runtimeOf(s);
    if (unresolvedRequests(rt)) setChatStatus(s, 'waiting-input');
    else if (rt.turns.busy()) setChatStatus(s, 'working');
    // E202611031bd72813:S001 t2: done is reserved for observed completion — a session whose turn
    // is still unfinished (liveTurn cursor kept, e.g. after an observation failure) keeps its last
    // known active status instead of being marked done.
    else if (s.liveTurn === undefined) setChatStatus(s, 'done');
  };

  /** t6: persist the queue's full snapshot onto the active session (when it is in the store). */
  const persistQueueSnapshot = (rt = selected()): void => {
    if (rt === undefined || deps.store.get(rt.session.id) === undefined) return;
    rt.session.queueSnapshot = rt.approvals.snapshot();
    trySave(rt.session);
  };

  const enqueueApproval = (ev: Extract<TurnEvent, { kind: 'approval-request' }>, rt: SessionRuntime): void => {
    rt.approvals.enqueue({
      requestId: ev.requestId,
      turnId: ev.turnId,
      title: ev.title,
      detail: ev.detail,
      ...(typeof ev.toolName === 'string' && ev.toolName !== '' ? { toolName: ev.toolName } : {}),
      ...(ev.command !== undefined && ev.command !== '' ? { command: ev.command } : {}),
      blockKind: classifyPermissionDenial(ev.detail),
      resolution: resolutionOf(ev),
    });
    // t6: keep the persisted queue snapshot fresh on every enqueue — otherwise a request arriving
    // after the last snapshot would be lost on reload (restore replaces the queue with the snapshot)
    persistPendingBeforeClear(rt.session);
    reportCards(rt); // Story S002
    showApprovalHead(rt);
  };

  // E202611031bd72813:S001 t6: mark one persisted request resolved with its outcome (never deleted mid-flight).
  /** t6: make sure an unresolved persisted record exists for requestId, so a host reload while
   * its follow-up is pending still has a restorable request (card re-posted, re-decidable). */
  const ensurePersistedUnresolved = (s: ChatSession, requestId: string, turnId?: string): void => {
    if ((s.pendingRequests ?? []).some((r) => r.requestId === requestId && (turnId === undefined || r.turnId === turnId))) return;
    s.pendingRequests = [...(s.pendingRequests ?? []), { requestId, kind: 'approval', turnId: turnId ?? s.liveTurn?.cursor.turnId ?? 'unknown', resolved: false }];
    try {
      deps.store.save(s);
    } catch (err) {
      log.warn(`[chat] session ${s.id}: request ${requestId} not saved: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const markPersistedRequest = (s: ChatSession | undefined, requestId: string, resolved: boolean, outcome?: string, turnId?: string): void => {
    if (s === undefined) return;
    const list = s.pendingRequests ?? [];
    // MR1-R3: outcome correlation is turn-scoped — a later turn reusing the request id must not
    // overwrite the earlier turn's record
    const i = list.findIndex((r) => r.requestId === requestId && (turnId === undefined || r.turnId === turnId || r.turnId === 'unknown'));
    const matchTurn = turnId ?? s.liveTurn?.cursor.turnId ?? 'unknown';
    if (i < 0) {
      // never persisted (fresh live request): upsert a minimal record so the outcome (e.g.
      // delivery-failed) is not silently dropped
      if (outcome === undefined) return;
      list.push({ requestId, kind: 'approval', turnId: matchTurn, resolved, outcome });
      s.pendingRequests = list;
      try {
        deps.store.save(s);
      } catch (err) {
        log.warn(`[chat] session ${s.id}: request ${requestId} outcome not saved: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    const cur = list[i]!;
    if (cur.resolved === resolved && cur.outcome === outcome) return;
    const next = [...list];
    next[i] = { ...cur, resolved, ...(outcome !== undefined ? { outcome } : {}) };
    s.pendingRequests = next;
    try {
      deps.store.save(s);
    } catch (err) {
      log.warn(`[chat] session ${s.id}: request ${requestId} outcome not saved: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // E202611031bd72813:S001 t6: write the queue's waiting requests + pending selections onto the
  // session's persisted pendingRequests BEFORE they are dropped (outcome set when they are being
  // resolved as rejected/superseded/timed-out; unresolved when they stay actionable across a switch).
  const persistPendingBeforeClear = (s: ChatSession | undefined, outcome?: string): void => {
    if (s === undefined) return;
    const rt = runtimeOf(s);
    // A DRAFT session is not in history yet (it persists on its first turn) — nothing to save onto.
    if (deps.store.get(s.id) === undefined) return;
    const existing = [...(s.pendingRequests ?? [])];
    let changed = false;
    const upsert = (rec: import('./session-store.js').PersistedRequest): void => {
      const i = existing.findIndex((r) => r.requestId === rec.requestId && r.turnId === rec.turnId);
      if (i >= 0) existing[i] = rec;
      else existing.push(rec);
      changed = true;
    };
    for (const r of rt.approvals.snapshot().waiting) {
      upsert({
        requestId: r.requestId,
        kind: 'approval',
        turnId: r.turnId,
        title: r.title,
        detail: r.detail,
        blockKind: r.blockKind,
        ...(r.toolName !== undefined ? { toolName: r.toolName } : {}),
        ...(r.command !== undefined ? { command: r.command } : {}),
        resolved: outcome !== undefined,
        ...(outcome !== undefined ? { outcome } : {}),
      });
    }
    for (const [requestId, sel] of rt.pendingSelections) {
      upsert({
        requestId,
        kind: 'selection',
        turnId: sel.turnId,
        ...(sel.prompt !== undefined ? { prompt: sel.prompt } : {}),
        options: sel.options.map((o) => o.label),
        ...(sel.multi === true ? { multi: true } : {}),
        resolved: outcome !== undefined,
        ...(outcome !== undefined ? { outcome } : {}),
      });
    }
    const snap0 = rt.approvals.snapshot();
    if (!changed && snap0.waiting.length === 0 && snap0.batches.length === 0 && snap0.ended.length === 0 && snap0.grants.length === 0 && rt.pendingSelections.size === 0) return; // completely empty: leave the stored record byte-identical
    s.pendingRequests = existing;
    // the FULL queue state (waiting, batches, ended turns, grant chain) — not just waiting — so a
    // restore can rebuild the queue exactly, batch decisions and grants included
    s.queueSnapshot = snap0;
    try {
      deps.store.save(s);
    } catch (err) {
      log.warn(`[chat] session ${s.id}: pendingRequests not saved: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // E202611031bd72813:S001 t6: re-enter a session's unresolved persisted requests into the live
  // queue/selection map on attach or webview reload, keyed by their ORIGINAL requestId, and
  // re-register them with the adapter when their turn is (being) followed — so a decision answers
  // the same request, and a dead stdin falls back to a follow-up run (relayDecision).
  const restorePendingRequests = (s: ChatSession): void => {
    const rt = runtimeOf(s);
    rt.shownApproval = undefined;
    if (rt.restored) {
      showApprovalHead(rt);
      for (const ev of rt.pendingSelections.values()) postLive(s, ev, undefined, false);
      return;
    }
    rt.restored = true;
    let restored = 0;
    // the full queue snapshot (waiting, batches, ended, grants) rebuilds the queue exactly
    const snap = s.queueSnapshot;
    let snapWaiting: readonly QueuedApproval[] = [];
    let snapBatches: { readonly turnId: string; readonly decisions: ApprovalDecision[] }[] = [];
    if (snap !== undefined && Array.isArray(snap.waiting)) {
      // revive every waiting request EXCEPT those with a persisted RESOLVED record — decisions
      // update pendingRequests, so an unfiltered restore could revive already-decided requests;
      // requests with no persisted record at all are kept (they were never persisted)
      // MR1-R3: resolved-record filtering is turn-scoped — a resolved record from an earlier turn
      // must not suppress a same-id request from a LATER turn in the snapshot
      const resolvedRecs = (s.pendingRequests ?? []).filter((r) => r.resolved);
      snapWaiting = snap.waiting.filter((w) => !resolvedRecs.some((r) => r.requestId === w.requestId && (w.turnId === undefined || r.turnId === w.turnId)));
      // t6 round-trip: same resolved-record filtering (turn-scoped) for the snapshot's BATCHES —
      // a batch whose decisions all have resolved persisted records was already delivered; leaving
      // it in would restore it and let a later runCompletedBatch() re-run the follow-up after reload
      snapBatches = Array.isArray(snap.batches)
        ? snap.batches
            .map((b) => ({ turnId: b.turnId, decisions: b.decisions.filter((d: ApprovalDecision) => !resolvedRecs.some((r) => r.requestId === d.request.requestId && (d.request.turnId === undefined || r.turnId === d.request.turnId))) }))
            .filter((b) => b.decisions.length > 0)
        : [];
      rt.approvals.restore({ ...snap, waiting: snapWaiting, batches: snapBatches });
      s.queueSnapshot = rt.approvals.snapshot(); // keep the persisted snapshot in sync with the filtered restore
      trySave(s);
    }
    for (const r of s.pendingRequests ?? []) {
      if (r.resolved) continue;
      restored += 1;
      if (r.kind === 'approval') {
        // turn-scoped like the filters above (MR1-R3): a same-id record/decision from ANOTHER turn
        // must not count as "already rebuilt" for this turn's record
        const decidedInBatch = snapBatches.some((b) => b.decisions.some((d) => d.request.requestId === r.requestId && (r.turnId === undefined || d.request.turnId === undefined || d.request.turnId === r.turnId)));
        if (snapWaiting.some((w) => w.requestId === r.requestId && (r.turnId === undefined || w.turnId === undefined || w.turnId === r.turnId)) || decidedInBatch) {
          // already rebuilt from the snapshot — only re-register a followed turn's request with the adapter,
          // and end the turn of a non-in-turn one so its restored batch can complete on decision
          const inTurn = s.liveTurn !== undefined && r.turnId !== undefined && s.liveTurn.cursor.turnId === r.turnId;
          if (!inTurn && r.turnId !== undefined) rt.approvals.endTurn(r.turnId);
          if (inTurn && r.turnId !== undefined) {
            try {
              deps.providers.get(s.provider).registerPending?.(r.turnId, r.requestId);
            } catch (err) {
              log.warn(`[chat] session ${s.id}: restored request ${r.requestId} not re-registered: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
          continue;
        }
        const inTurn = s.liveTurn !== undefined && r.turnId !== undefined && s.liveTurn.cursor.turnId === r.turnId;
        rt.approvals.enqueue({
          requestId: r.requestId,
          turnId: r.turnId ?? 'restored',
          title: r.title ?? r.requestId,
          detail: r.detail ?? '',
          blockKind: r.blockKind === 'dir-block' ? 'dir-block' : 'tool-gate',
          ...(r.toolName !== undefined ? { toolName: r.toolName } : {}),
          ...(r.command !== undefined ? { command: r.command } : {}),
          resolution: inTurn ? 'in-turn' : 'turn-ended',
        });
        if (!inTurn && r.turnId !== undefined) rt.approvals.endTurn(r.turnId); // its turn is gone: the restored batch can complete on decision
        if (inTurn && r.turnId !== undefined) {
          try {
            deps.providers.get(s.provider).registerPending?.(r.turnId, r.requestId);
          } catch (err) {
            log.warn(`[chat] session ${s.id}: restored request ${r.requestId} not re-registered: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } else {
        rt.pendingSelections.set(r.requestId, {
          kind: 'selection-request', turnId: r.turnId ?? 'restored', requestId: r.requestId,
          prompt: r.prompt ?? '',
          options: (r.options ?? []).map((label) => ({ id: label, label })),
          ...(r.multi === true ? { multi: true } : {}),
        });
      }
    }
    for (const r of s.pendingRequests ?? []) if (!r.resolved) restoredRequestIds.add(followUpKey(s.id, r.turnId, r.requestId));
    if (snap !== undefined && Array.isArray(snap.waiting)) {
      for (const w of snapWaiting) restoredRequestIds.add(followUpKey(s.id, w.turnId, w.requestId));
      restored += snapWaiting.length; // snapshot-only requests (no pendingRequests record) count too
    }
    if (restored === 0) return; // nothing to restore: no card posts, no status rewrite, no save
    showApprovalHead();
    // LLD s7: restored SELECTIONS re-post their actionable card too (prompt + multi preserved), so
    // a chat whose LiveTurn cleared still shows its resolvable selection after reattach
    for (const [requestId, sel] of rt.pendingSelections) {
      const rec = (s.pendingRequests ?? []).find((r) => r.requestId === requestId);
      post({
        type: 'turn-event',
        event: {
          kind: 'selection-request',
          turnId: rec?.turnId ?? 'restored',
          requestId,
          prompt: sel.prompt ?? '',
          options: sel.options,
          ...(sel.multi === true ? { multi: true } : {}),
        },
      });
    }
    reportCards();
    if (session === s) reevaluateChatStatus(s);
  };

  // ISSUE-6a811b8a: Stop. Each request still waiting is recorded as rejected, and the queue cleared.
  const rejectQueuedApprovals = (rt = selected()): void => {
    if (rt === undefined) return;
    rt.shownApproval = undefined;
    persistPendingBeforeClear(rt.session, 'rejected'); // t6: persisted (resolved) before the clear
    for (const r of rt.approvals.clear()) recordPermissionOutcome(r.toolName ?? r.title, false, r.requestId, rt.session);
    reportCards(rt); // Story S002
  };

  // ISSUE-6a811b8a: the user typed a message instead of answering. A request the running turn is
  // waiting on is answered 'deny' first (so the provider stops waiting), then every waiting request
  // is recorded as rejected and the queue cleared, which also resets the grant chain: a later
  // follow-up never carries grants from before the typed message.
  const supersedeQueuedApprovals = (rt = selected()): void => {
    if (rt === undefined) return;
    rt.shownApproval = undefined;
    persistPendingBeforeClear(rt.session, 'superseded'); // t6: persisted (resolved) before the clear
    for (const r of rt.approvals.clear()) {
      if (r.resolution === 'in-turn') relayDecision(r.requestId, 'deny', r.turnId, rt.session);
      recordPermissionOutcome(r.toolName ?? r.title, false, r.requestId, rt.session);
    }
    reportCards(rt); // Story S002
  };

  // ISSUE-6a811b8a: a chat switch or the panel closing. The waiting cards were live-only, so the
  // queue is dropped without outcome rows.
  const dropQueuedApprovals = (rt = selected()): void => {
    if (rt === undefined) return;
    rt.shownApproval = undefined;
    persistPendingBeforeClear(rt.session); // t6: unresolved but actionable — saved BEFORE the clear
    rt.approvals.clear();
    rt.pendingSelections.clear();
    rt.restored = false;
    reportCards(rt); // Story S002
  };

  /** Epic E20261014613abdb3 Story S001: ends the queued run with an outcome, once. */
  const endQueued = (rt: SessionRuntime, outcome: TurnOutcome): void => {
    const q = rt.queued;
    if (q === undefined) return;
    rt.queued = undefined;
    if (q.waitTimer !== undefined) clearTimeout(q.waitTimer);
    q.resolve(outcome);
  };
  /**
   * Epic E20261014613abdb3 Story S001: decides whether the queued message is over, once none of its
   * turns is in progress. A Stop wins over the stopped CLI's own error; a view detached from a
   * session-file turn waits for that CLI to exit; a waiting approval or selection card holds the
   * message (and the repository's lease) until it is answered, or for continuationWaitMs.
   */
  const settleQueued = (rt = selected()): void => {
    if (rt === undefined) return;
    const q = rt.queued;
    if (q === undefined || q.turns > 0) return;
    if (q.stopped) return endQueued(rt, { kind: 'stopped' });
    if (q.viewLost && q.terminal === undefined && q.error === undefined) {
      if (!q.spawned) return endQueued(rt, { kind: 'stopped', reason: 'the turn was dropped before it started' });
      const cli = q.lastCli;
      // A session-file turn keeps running after its view was detached (its cursor is saved): the
      // message ends when that CLI exits. A pipe turn was stopped by the detach.
      if (q.session.liveTurn !== undefined && cli !== undefined) {
        void cli.exited.then(() => {
          if (rt.queued === q) endQueued(rt, { kind: 'detached-ended' });
        });
        return;
      }
      return endQueued(rt, { kind: 'stopped', reason: 'the turn ended when the chat was switched or closed' });
    }
    if (!q.spawned && q.terminal === undefined && q.error === undefined) {
      return endQueued(rt, { kind: 'stopped', reason: 'the turn was dropped before it started' });
    }
    const cardsWaiting = rt.approvals.head() !== undefined || rt.pendingSelections.size > 0;
    if (cardsWaiting && !q.viewLost) {
      if (q.waitTimer === undefined) {
        q.waitTimer = setTimeout(() => {
          if (rt.queued !== q) return;
          rejectQueuedApprovals(rt);
          persistPendingBeforeClear(rt.session, 'timeout');
          rt.pendingSelections.clear();
          endQueued(rt, { kind: 'stopped', reason: 'no answer to the approval' });
          // E202611031bd72813:S001 t2: the timeout cleared every request — re-evaluate so a
          // completed turn no longer sits at waiting-input.
          reevaluateChatStatus(rt.session);
        }, deps.continuationWaitMs ?? CONTINUATION_WAIT_MS);
      }
      return;
    }
    if (q.viewLost && cardsWaiting) { endQueued(rt, { kind: 'stopped', reason: 'no answer to the approval' }); reevaluateChatStatus(rt.session); return; } // E202611031bd72813:S001 t2
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
      return endQueued(rt, { kind: 'failed', error, acted: q.acted, cause });
    }
    endQueued(rt, { kind: 'done' });
  };
  /** The panel is closing while a queued message runs. */
  const queuedViewLost = (rt: SessionRuntime): void => {
    if (rt.queued !== undefined) rt.queued.viewLost = true;
  };

  // A self-contained informational assistant message (its own turn id, so it closes itself).
  const postInfo = (turnId: string, text: string): void => {
    post({ type: 'turn-event', event: { kind: 'assistant-delta', turnId, text } });
    post({ type: 'turn-event', event: { kind: 'done', turnId, ok: true }, info: true });
  };

  // Story S004: an informational line that is also stored (postInfo is live-only), so a reload still
  // shows it. Written like followLiveTurn writes a row: append, then post with the row's index.
  const persistInfo = (s: ChatSession, turnId: string, text: string): void => {
    const ev: TurnEvent = { kind: 'assistant-delta', turnId, text };
    const rowIndex = appendEvent(s, ev);
    stampLiveTranscriptLen(s);
    postLive(s, ev, rowIndex, false);
    if (session === s) post({ type: 'turn-event', event: { kind: 'done', turnId, ok: true }, info: true });
    trySave(s);
  };

  // ISSUE-6a811b8a: when a turn-ended batch is complete (its turn ended and every request it raised
  // is decided), run ONE follow-up for it, allowed every tool approved so far (the grant chain). A
  // single approved request keeps today's exact prompt; several get one prompt naming each approved
  // action and each denied one, so nothing already decided is asked again. Only one follow-up is
  // ever started per batch, so no approval can supersede another approval's follow-up.
  const runCompletedBatch = (rt = selected()): void => {
    if (rt === undefined) return;
    const owner = rt.session;
    const batch = rt.approvals.takeCompletedBatch();
    if (batch === undefined) return;
    // t6 round-trip: the removal must be persisted too — the decision handler persists the
    // snapshot BEFORE this call, so without this the stored queueSnapshot.batches would still
    // hold the delivered batch and a reload could restore and re-run it
    persistQueueSnapshot(rt);
    const action = (r: { toolName?: string | undefined; command?: string | undefined }): string =>
      r.command !== undefined && r.command !== '' ? `run exactly this: ${r.command}` : `the ${r.toolName ?? 'tool'} action you requested permission for`;
    const approved = batch.decisions.filter((d) => d.decision === 'approve' && d.request.blockKind === 'tool-gate').map((d) => d.request);
    const denied = batch.decisions.filter((d) => d.decision === 'deny').map((d) => d.request);
    const blocked = batch.decisions.filter((d) => d.decision === 'approve' && d.request.blockKind === 'dir-block').map((d) => d.request);
    if (approved.length === 0) {
      // Nothing to run. A single request keeps today's behaviour (its chip says it all); a batch
      // of several says so once.
      if (batch.decisions.length > 1 && session === owner) postInfo(`info-batch-${batch.turnId}`, 'No action was approved, so nothing was run.');
      // nothing was delivered (no run happens) — the decisions are still recorded with their outcomes
      for (const d of batch.decisions) markPersistedRequest(owner, d.request.requestId, true, d.decision === 'approve' ? 'approved' : 'denied', d.request.turnId);
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
    // NOT fire-and-forget: mark each decided request with its outcome only once the follow-up has
    // actually started; if it never starts (dropped chain, no session), the outcome is delivery-failed
    // — a silent no-op is never recorded as approved. runTurn reports adapter/lock failures as error
    // events rather than rejecting, so the start is confirmed via busy state in a microtask, with the
    // promise rejection as a backstop for real throws.
    const decisions = batch.decisions;
    // marked with their outcomes only when the follow-up's CLI actually spawns; delivery-failed if
    // the turn settles without spawning (see the run sink's onSpawn / pendingFollowUp)
    for (const d of decisions) pendingFollowUps.set(followUpKey(owner.id, d.request.turnId, d.request.requestId), { requestId: d.request.requestId, outcome: d.decision === 'approve' ? 'approved' : 'denied', excludeTurnId: rt.turns.live?.turnId, originTurnId: d.request.turnId, groupId: batch.turnId, sessionId: owner.id });
    const p = runTurn(prompt, rt.approvals.grantChain(), { suppressEcho: true, session: owner });
    void p.then(
      () => {
        for (const d of decisions) {
          if (pendingFollowUps.delete(followUpKey(owner.id, d.request.turnId, d.request.requestId))) markPersistedRequest(owner, d.request.requestId, true, 'delivery-failed', d.request.turnId);
        }
      },
      (err: unknown) => {
        log.warn(`[chat] batch follow-up for turn ${batch.turnId} failed: ${err instanceof Error ? err.message : String(err)}`);
        for (const d of decisions) {
          if (pendingFollowUps.delete(followUpKey(owner.id, d.request.turnId, d.request.requestId))) markPersistedRequest(owner, d.request.requestId, true, 'delivery-failed', d.request.turnId);
        }
      },
    );
  };

  // A provider that answers in-turn (control-protocol / codex): relay the decision to the LIVE
  // turn's captured adapter (its own provider, never the current session's — it may have
  // switched). decide() no-ops on an unknown/stale/dead requestId, so a late click is safe.
  // E202611031bd72813:S001 t6: a decision whose original process stdin is gone (no live turn, or
  // decide() reports undelivered — process exited / live-unwritable) is delivered as a follow-up
  // runTurn carrying the decision (resuming the native session when one is known); if even that
  // cannot start, the persisted request is marked resolved with outcome delivery-failed — a silent
  // no-op is never recorded as a success.
  /**
   * MR3 (manual code review): follow-ups whose stall timer already recorded delivery-failed.
   * The lifecycle checks `shouldSpawn` immediately before spawning the CLI, so a timed-out
   * continuation can never execute later, after the UI already reported failure.
   */
  const cancelledFollowUps = new Set<string>(); // followUpKey entries whose continuation must not spawn
  const deliverDecisionAsFollowUp = (requestId: string, decision: 'approve' | 'deny', target?: ChatSession, originTurnId?: string): void => {
    const s = target ?? session;
    const rt = s === undefined ? undefined : runtimeOf(s);
    if (s !== undefined && deps.store.get(s.id) !== undefined) ensurePersistedUnresolved(s, requestId, originTurnId); // survive a reload while the follow-up waits
    // MR1-R3: the record lookup is turn-scoped — a later turn reusing the request id carries ITS OWN command
    const rec = s?.pendingRequests?.find((r) => r.requestId === requestId && (originTurnId === undefined || r.turnId === originTurnId));
    const what = rec?.command ?? rec?.toolName ?? rec?.title ?? 'the requested action';
    const prompt = decision === 'approve' ? `Approved — run exactly this now: ${what}` : `Denied — do not attempt: ${what}`;
    let started = false;
    if (s !== undefined) {
      const pfKey = followUpKey(s.id, originTurnId ?? rt?.turns.live?.turnId, requestId);
      try {
        // The outcome is marked only when the follow-up's CLI actually SPAINS (the run sink's
        // onSpawn consumes pendingFollowUp); if the turn settles without spawning — dropped chain,
        // no session, adapter/lock failure reported as an error event — the request is marked
        // delivery-failed. A silent no-op is never recorded as approved.
        // MR1-R3: the exclusion/origin turn is the decision's originating turn (fall back to the live one)
        const pfKey = followUpKey(s.id, originTurnId ?? rt?.turns.live?.turnId, requestId);
        pendingFollowUps.set(pfKey, { requestId, outcome: decision === 'approve' ? 'approved' : 'denied', excludeTurnId: originTurnId ?? rt?.turns.live?.turnId, originTurnId, groupId: requestId, sessionId: s.id });
        // MR3: the continuation carries a cancellation identity — if the stall timer below fires
        // first, shouldSpawn returns false and the turn ends WITHOUT spawning the CLI.
        const p = runTurn(prompt, rt?.approvals.grantChain(), { suppressEcho: true, session: s, shouldSpawn: () => !cancelledFollowUps.has(pfKey) }); // resumes s.nativeSessionId when known
        started = true;
        // If the follow-up never spawns (the original CLI still holds the turn lock and stays
        // blocked), the settled-promise path above may never run — bound the wait with a timer so
        // the outcome is always recorded (delivery-failed), never left approved indefinitely.
        // MR3: the timer also CANCELS the scheduled continuation (cancelledFollowUps), so when the
        // original turn later ends, the queued follow-up does not execute after the recorded failure.
        const stallTimer = setTimeout(() => {
          cancelledFollowUps.add(pfKey);
          if (pendingFollowUps.delete(pfKey)) {
            markPersistedRequest(s, requestId, true, 'delivery-failed', originTurnId);
            reevaluateChatStatus(s);
          }
        }, deps.followUpDeliveryTimeoutMs ?? 30_000);
        stallTimer.unref?.();
        const settle = (): void => {
          clearTimeout(stallTimer);
          cancelledFollowUps.delete(pfKey);
          if (pendingFollowUps.delete(pfKey)) {
            markPersistedRequest(s, requestId, true, 'delivery-failed', originTurnId);
            reevaluateChatStatus(s);
          }
        };
        void p.then(settle, (err: unknown) => {
          log.warn(`[chat] follow-up for decision ${requestId} failed: ${err instanceof Error ? err.message : String(err)}`);
          settle();
        });
      } catch (err) {
        pendingFollowUps.delete(pfKey);
        cancelledFollowUps.delete(pfKey);
        log.warn(`[chat] follow-up for decision ${requestId} could not start: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (!started) markPersistedRequest(s, requestId, true, 'delivery-failed', originTurnId);
    if (s !== undefined) reevaluateChatStatus(s);
  };

  /**
   * Decisions already sent to a follow-up run — at most one per CONVERSATION+request, because
   * request ids may repeat across chats/turns (MR1-R2): keyed `${sessionId}::${requestId}`.
   */
  const followUpsStarted = new Set<string>();
  const followUpKey = (sessionId: string | undefined, turnId: string | undefined, requestId: string): string => `${sessionId ?? '?'}::${turnId ?? '?'}::${requestId}`;
  /** Request ids restored from a persisted queue snapshot (they may have no pendingRequests record). */
  const restoredRequestIds = new Set<string>();
  /** Request ids decided through the queue in this host — a valid queued decision must never
   * silently disappear, even if its turn already ended and nothing was persisted yet. */
  const decidedRequestIds = new Set<string>();
  /** The follow-up run currently pending spawn: its request(s) are marked with the outcome only
   * when the CLI actually spawns (onSpawn); if the turn is dropped before spawning, delivery-failed. */
  // MR1-R3: keyed by the FULL follow-up identity (session::originTurn::request) so repeated request
  // ids across conversations/turns keep separate markers
  let pendingFollowUps = new Map<string, { readonly requestId: string; readonly outcome: string; readonly excludeTurnId: string | undefined; readonly originTurnId: string | undefined; readonly groupId: string; readonly sessionId: string | undefined }>();
  /** turnId -> requestId: each follow-up is bound to the turn it actually started, so a spawn/event
   * of one follow-up's turn never marks another pending follow-up delivered. */
  const followUpTurns = new Map<string, string>();
  /** Bind the oldest pending follow-up to a newly started turn and mark it delivered. */
  const confirmFollowUp = (turnId: string, s: ChatSession): void => {
    const turnKey = followUpKey(s.id, turnId, '');
    let rid = followUpTurns.get(turnKey);
    if (rid === undefined) {
      // bind the oldest pending follow-up that was NOT queued behind this very turn — the
      // original turn's own events must never confirm its successor's delivery
      for (const [candidate, pf] of pendingFollowUps) {
        // MR1-R3: a spawn/event of a turn confirms only a follow-up owned by THAT turn's session —
        // an unrelated turn starting in another chat must not consume this session's marker
        if (pf.excludeTurnId !== turnId && pf.sessionId === s.id) {
          rid = candidate;
          break;
        }
      }
      if (rid === undefined) return;
      followUpTurns.set(turnKey, rid);
    }
    if (rid === undefined) return;
    const pf = pendingFollowUps.get(rid);
    if (pf === undefined) return;
    // one follow-up turn confirms its WHOLE group (a batch follow-up carries several decisions)
    for (const [other, opf] of [...pendingFollowUps]) {
      if (opf.groupId === pf.groupId && opf.sessionId === s.id) {
        pendingFollowUps.delete(other);
        // MR1-R4: outcome correlation uses the request's ORIGINATING turn — never the live
        // exclusion turn the follow-up happened to be queued behind
        markPersistedRequest(s, opf.requestId, true, opf.outcome, opf.originTurnId ?? opf.excludeTurnId);
      }
    }
    // keep the binding until the turn ENDS: later events of the same follow-up turn must map to
    // it (already confirmed -> no-op), never re-bind to another pending follow-up
  };

  /** Adapters already wired for async delivery failures (one subscription per adapter per host). */
  const deliveryWired = new WeakSet<object>();
  /**
   * MR1 + MR1-R2 (manual code review): explicit ownership of a delivery attempt, keyed by the FULL
   * identity — provider adapter, turn, request, and originating conversation. Request ids are NOT
   * globally unique (they may repeat across turns, conversations and providers), so a requestId-only
   * key would let a later decision overwrite an earlier attempt's owner. The async stdin-failure
   * callback resolves through THIS binding only: a terminal event may have cleared the original
   * chat's liveTurn and the user may have switched chats, so falling back to the selected session
   * would reroute the failure (and its follow-up) into the wrong conversation. An unknown/stale
   * binding fails closed: nothing is mutated, no follow-up starts.
   */
  const deliveryKey = (provider: ProviderId, turnId: string, requestId: string): string => `${provider}::${turnId}::${requestId}`;
  const deliveryOwners = new Map<string, string>(); // deliveryKey -> originating session id
  const wireDeliveryFailure = (provider: ProviderId, ad: StreamAdapter): void => {
    if (deliveryWired.has(ad) || ad.onDeliveryFailed === undefined) return;
    deliveryWired.add(ad);
    ad.onDeliveryFailed((turnId, failedRequestId, failedDecision) => {
      // the stdin write failed AFTER decide() reported delivered — correct the persisted outcome
      // and answer the request with the follow-up run instead of leaving it approved. Resolve the
      // session through the recorded full-identity binding, never the currently selected chat.
      const ownerId = deliveryOwners.get(deliveryKey(provider, turnId, failedRequestId));
      deliveryOwners.delete(deliveryKey(provider, turnId, failedRequestId));
      const s = ownerId !== undefined ? runtimes.get(ownerId)?.session ?? deps.store.get(ownerId) : undefined;
      if (s === undefined || deps.store.get(s.id) === undefined) {
        log.warn(`[chat] async delivery failure for ${failedRequestId} (turn ${turnId}) has no known originating conversation — failing closed, no follow-up started`);
        return;
      }
      ensurePersistedUnresolved(s, failedRequestId, turnId);
      markPersistedRequest(s, failedRequestId, true, 'delivery-failed', turnId);
      reevaluateChatStatus(s);
      // MR3-R4a: the async failure takes the SAME owner/turn-bound recovery as the sync path —
      // including live-unwritable stop+verified-exit and the session-lost triage
      recoverUndelivered(s, failedRequestId, failedDecision, turnId);
    });
  };

  const relayDecision = (requestId: string, decision: 'approve' | 'deny', originTurnId?: string, s = session): void => {
    if (s === undefined) return;
    const rt = runtimeOf(s);
    const live = rt.turns.live;
    const probeProvider = live?.provider ?? s.provider;
    wireDeliveryFailure(probeProvider, deps.providers.get(probeProvider));
    let undelivered = false; // a live turn whose decide() reported dead stdin (or a dead adapter)
    // t6: probe delivery through the live turn — or, for a RESTORED request with no live turn in
    // this host, the session's persisted liveTurn (its stdin died with its owner): decide()
    // reports undelivered for it, and the follow-up fallback below answers the decision.
    // MR1-R3: the probe turn is the live turn, else the decision's originating turn (the queue's
    // record), else the persisted liveTurn — so a later turn reusing a request id is correlated to
    // its OWN turn, never to an earlier turn's resolved record.
    const probeTurnId = originTurnId ?? live?.turnId ?? s.liveTurn?.cursor.turnId;
    if (probeTurnId !== undefined) {
      // MR1/MR1-R2: record the full delivery identity -> originating conversation, so a later
      // async stdin failure resolves to THIS attempt even after a terminal or a chat switch —
      // repeated request ids in other turns/conversations keep their own bindings.
      deliveryOwners.set(deliveryKey(probeProvider, probeTurnId, requestId), s.id);
      try {
        // Process triage: a live turn with a live pid gets the in-turn decide (live-writable);
        // decide() itself reports undelivered for a dead/absent stdin, and the request is NOT
        // consumed on failure, so the fallback below can still answer it.
        const res = deps.providers.get(probeProvider).decide(probeTurnId, requestId, decision);
        if (res.delivered) {
          markPersistedRequest(s, requestId, true, decision === 'approve' ? 'approved' : 'denied', probeTurnId);
          return;
        }
        undelivered = true;
      } catch (err: unknown) {
        // Adapter gone / provider unavailable: fall through to the fallback. Never throw; the
        // decision is still recorded and the queue moves on (ISSUE-6a811b8a).
        undelivered = true;
        log.warn(`[chat] approval decision for ${requestId} could not be delivered: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // The follow-up run answers a decision that could not reach the CLI: either a live turn whose
    // decide() reported undelivered (the decision came from the queue, so it is real even when no
    // persisted record exists yet), or a RESTORED request persisted unresolved after a
    // reattach/reload with no live turn. A stale id with no live turn and no unresolved persisted
    // record stays the old silent no-op. followUpsStarted keeps the follow-up one-shot.
    // MR1-R3: the persisted lookup is turn-scoped — a later turn reusing the request id does NOT
    // inherit the earlier turn's resolved record.
    const persisted = s.pendingRequests?.find((r) => r.requestId === requestId && (probeTurnId === undefined || r.turnId === probeTurnId));
    // a persisted RESOLVED record FOR THIS TURN means this decision was already delivered — a
    // duplicate (the adapter no-ops on the consumed id, also reporting delivered:false) must not
    // re-follow-up
    if (persisted !== undefined && persisted.resolved) undelivered = false;
    // a snapshot-restored request (in restoredRequestIds) is unresolved by construction — the
    // follow-up must answer it even when no pendingRequests record exists
    // a request this host's queue just decided (decidedRequestIds) is a valid decision even if its
    // turn already ended and nothing was persisted yet — the follow-up must answer it (delivered or
    // delivery-failed), never a silent no-op recorded as approved
    const requestKey = followUpKey(s.id, probeTurnId, requestId);
    if (!undelivered && (persisted === undefined ? !(restoredRequestIds.has(requestKey) || decidedRequestIds.has(requestKey)) : persisted.resolved)) return;
    recoverUndelivered(s, requestId, decision, probeTurnId);
  };

  /**
   * MR3-R4a: ONE recovery path for synchronous (decide() reports undelivered) and asynchronous
   * (stdin write fails after acceptance) delivery failure alike, always bound to the ORIGINATING
   * session/turn — never the selected chat. Applies the LLD s7 triage: live-unwritable with no
   * native handle -> session-lost; live-unwritable with a handle -> stop the original and VERIFY
   * exit (MR3-R4b) before the continuation resumes that native session; otherwise the plain
   * follow-up run. If the verified stop fails, record delivery-failed and launch nothing.
   */
  const recoverUndelivered = (s: ChatSession, requestId: string, decision: 'approve' | 'deny', originTurnId: string | undefined): void => {
    // MR3-R5: liveness and the stop target are bound to the ORIGINATING turn — s.liveTurn must still
    // BE that turn; the host-wide turns.stop() may only be used when the origin IS the current turn
    const rt = runtimeOf(s);
    const originTurn = originTurnId ?? s.liveTurn?.cursor.turnId;
    const originLive = s.liveTurn !== undefined && s.liveTurn.cursor.turnId === originTurn ? s.liveTurn : undefined;
    const probePid = originLive?.pid;
    const probeAlive = probePid !== undefined && (deps.isAlive?.(probePid) ?? false);
    if (probeAlive && s.nativeSessionId === undefined) {
      markPersistedRequest(s, requestId, true, 'session-lost', originTurnId);
      reevaluateChatStatus(s);
      return;
    }
    const fk = followUpKey(s.id, originTurnId, requestId);
    if (followUpsStarted.has(fk)) return;
    followUpsStarted.add(fk);
    if (probeAlive && s.nativeSessionId !== undefined && originTurn !== undefined) {
      void (async () => {
        try {
          let verified: boolean | undefined;
          if (rt.turns.live?.turnId === originTurn) {
            // the origin is THIS host's current turn: the lifecycle owns exactly it
            verified = await rt.turns.stop(s); // MR3-R4b: true only when the exit was confirmed
          } else {
            // MR3-R5: a detached/other chat's original — stop ONLY that turn's process via its
            // adapter; no handle -> fail closed, never stop the selected chat as a substitute
            verified = await deps.providers.get(s.provider).stopTurnVerified?.(originTurn);
          }
          if (verified !== true) throw new Error('the original process exit could not be verified');
          deliverDecisionAsFollowUp(requestId, decision, s, originTurnId);
        } catch (err) {
          log.warn(`[chat] live-unwritable recovery for ${requestId} could not stop the original: ${err instanceof Error ? err.message : String(err)}`);
          markPersistedRequest(s, requestId, true, 'delivery-failed', originTurnId);
          reevaluateChatStatus(s);
        }
      })();
      return;
    }
    deliverDecisionAsFollowUp(requestId, decision, s, originTurnId);
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
    postLive(session, { kind: 'selection-outcome', turnId: `sel-${requestId}`, chosen }, rowIndex, false);
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
  /**
   * MR4 (manual code review): one durable declaration identity per conversation, shared by the
   * live, follow and observer paths. `declarationDispatched` checks the persisted union (the
   * observer checkpoint's declaredIds plus presentedDeclarations); `markDeclarationDispatched`
   * records a NEW dispatch durably so a later replay — reattach, reload, the observer after the
   * follow reader — never opens a second panel for the same declaration.
   */
  /**
   * MR4-R2: the declaration identity is conversation+turn+call scoped — `${turnId}:${callId}` —
   * because provider item ids may repeat across turns/CLI invocations: a replay of one declaration
   * (reattach/reload/observer) must open once, while a NEW turn reusing the same call id must still
   * present. Legacy persisted ledgers hold the bare call id; those still match their own turn's
   * declaration (compat), without suppressing a different turn's.
   */
  const declarationIdOf = (ev: { readonly turnId: string; readonly callId?: string | undefined; readonly present?: readonly string[] | undefined }): { readonly id: string; readonly legacy: string | undefined; readonly turnId: string } => {
    const call = ev.callId ?? (ev.present ?? []).join(',');
    return { id: `${ev.turnId}:${call}`, legacy: ev.callId, turnId: ev.turnId };
  };
  const declarationDispatched = (s: ChatSession, decl: { readonly id: string; readonly legacy: string | undefined; readonly turnId: string }): boolean => {
    if ((s.presentedDeclarations ?? []).includes(decl.id)) return true;
    // MR4-R3: a LEGACY bare call id (pre-upgrade persisted format) is only a wildcard within the
    // turn that owns the checkpoint it sits in — the checkpoint's turnId is that provenance. A
    // bare id never suppresses a different (e.g. later) turn's genuine declaration.
    const cp = s.observerCheckpoint;
    if (cp !== undefined && cp.turnId === decl.turnId && decl.legacy !== undefined && (cp.declaredIds ?? []).includes(decl.legacy)) return true;
    return false;
  };
  const markDeclarationDispatched = (s: ChatSession, decl: { readonly id: string; readonly legacy: string | undefined; readonly turnId: string }): void => {
    if (declarationDispatched(s, decl)) return;
    s.presentedDeclarations = [...(s.presentedDeclarations ?? []), decl.id];
    try {
      deps.store.save(s);
    } catch { /* best-effort, as the observer's checkpoint save */ }
  };

  const presentDeclared = (shown: PresentedTurn | undefined, ev: TurnEvent, s: ChatSession, canShow: () => boolean): void => {
    if (shown === undefined || ev.kind !== 'tool-call' || ev.present === undefined) return;
    // MR4: a declaration already dispatched (e.g. by the detached observer) is never re-presented
    // when the follow reader replays the same tool call on reattach.
    const decl = declarationIdOf(ev);
    if (declarationDispatched(s, decl)) return;
    markDeclarationDispatched(s, decl);
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
    const rt = runtimeOf(s);
    // ISSUE-6a811b8a: the turns this follow raised approval requests for, so its end ends their batch
    // even when the output ends without a terminal event.
    const followedTurns = new Set<string>();
    // Story E20261013e62a9269:S001: begun on the follow's first event, never when the follow is
    // asked for: this is asked for on every webview ready, and the lifecycle returns without
    // following while this host runs the turn, whose own presented turn must stay the newest.
    let shown: PresentedTurn | undefined;
    rt.turns.follow(s, {
      onEvent: (ev) => {
        if (shown === undefined) shown = beginPresented();
        presentDeclared(shown, ev, s, () => session === s);
        // A followed turn's approval requests go through the queue like a live one's.
        // Story E20261012ddc4ede1:S001: write the row first, then post the event with the row's
        // index. The write does not depend on whether the session is shown.
        const rowIndex = appendEvent(s, ev);
        stampLiveTranscriptLen(s);
        if (!disposed) {
          if (ev.kind === 'approval-request') {
            followedTurns.add(ev.turnId);
            enqueueApproval(ev, rt);
            setChatStatus(s, 'waiting-input'); // E202611031bd72813:S001 t2
          } else if (ev.kind === 'selection-request') {
            rt.pendingSelections.set(ev.requestId, ev);
            persistPendingBeforeClear(s);
            setChatStatus(s, 'waiting-input'); // E202611031bd72813:S001 t2: followed selection request
            reportCards(rt);
            postLive(s, ev, rowIndex, false);
          } else postLive(s, ev, rowIndex);
          if (ev.kind === 'done' || (ev.kind === 'error' && ev.observationFailure !== true)) {
            rt.approvals.endTurn(ev.turnId);
            persistQueueSnapshot(rt);
          }
        }
      },
      onEnd: (outcome) => {
        // A failed resume leaves the turn's cursor saved for a later follow; nothing has ended.
        // E202611031bd72813:S001 t2: 'observation-failed' likewise keeps the last known status —
        // only a real end moves the chat to done (or waiting-input when requests remain).
        if (outcome === 'ended') endPresented(shown);
        if (outcome === 'ended') {
          for (const turnId of followedTurns) rt.approvals.endTurn(turnId);
          runCompletedBatch(rt);
          postHistory();
          reevaluateChatStatus(s); // E202611031bd72813:S001 t2: same precedence on follow end
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
    postCatalog();
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
    runtimeOf(session).shownApproval = undefined;
    restorePendingRequests(session); // t6: a reloaded webview re-enters the session's unresolved persisted requests
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
      raw = await deps.deriveTitle({
        provider: target.provider,
        prompt: firstPrompt,
        cwd: deps.cwd(),
        ...(target.model !== undefined ? { model: target.model } : {}),
        ...(target.effort !== undefined ? { effort: target.effort } : {}),
      });
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
      // the popups' drop shadow (the theme's widget shadow)
      `--pop-shadow:var(--vscode-widget-shadow);` +
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
      // A positioned wrapper, so the jump button can float over the transcript without being a row of it.
      `#insrc-termwrap{flex:1 1 auto;min-height:0;position:relative;display:flex;flex-direction:column;}` +
      `#insrc-jump{position:absolute;right:18px;bottom:12px;width:28px;height:28px;padding:0;border-radius:50%;border:1px solid var(--border-lit);background:var(--dropdown-bg);color:var(--fg);font-size:14px;line-height:1;cursor:pointer;z-index:1;}` +
      `#insrc-jump[hidden]{display:none;}#insrc-jump:hover{color:var(--accent);border-color:var(--accent);}#insrc-jump:focus-visible{outline:1px solid var(--focus);outline-offset:1px;}` +
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
      // Run-config controls in the status bar's bottom-right corner: the provider·model
      // button + effort gauge button, and their popups opening UPWARD from there.
      `.statusbar .runctl{margin-left:auto;display:inline-flex;align-items:center;gap:8px;position:relative;}` +
      // Story E202611134642d49a:S001 t4: the scratchpad button in the status bar wraps in a
      // positioned chip so its menu anchors to it; the menu opens UPWARD from the status bar
      // (the .chatmenu default opens downward, which is right for the top chrome only).
      (scratchOn
        ? `.scratchchip{position:relative;display:inline-flex;align-items:center;}` +
          `#insrc-scratchmenu{bottom:calc(100% + 8px);top:auto;right:auto;left:0;}`
        : '') +
      `.runbtn,.gaugebtn{display:inline-flex;align-items:center;gap:6px;height:24px;background:var(--dropdown-bg);border:1px solid var(--dropdown-border);border-radius:6px;padding:0 8px;cursor:pointer;color:var(--fg);font-family:var(--font);font-size:12px;font-weight:500;}` +
      `.runbtn:hover,.gaugebtn:hover{color:var(--accent);}` +
      `.runbtn:focus-visible,.gaugebtn:focus-visible{outline:1px solid var(--focus);outline-offset:1px;}` +
      `.runbtn .chev{opacity:.6;font-size:10px;}` +
      `.pico{display:inline-flex;width:14px;height:14px;flex:0 0 14px;align-items:center;justify-content:center;}` +
      `.pico svg{width:14px;height:14px;display:block;}` +
      `.gaugebtn.dim{opacity:.5;cursor:default;}` +
      `@keyframes insrc-rise{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}` +
      `.popup,.slider-pop{position:absolute;bottom:calc(100% + 8px);right:0;display:none;background:var(--dropdown-bg);border:1px solid var(--dropdown-border);border-radius:10px;box-shadow:0 12px 32px var(--pop-shadow);z-index:20;animation:insrc-rise .12s ease-out;color:var(--dropdown-fg);}` +
      `.popup.open,.slider-pop.open{display:flex;}` +
      `.popup{flex-direction:column;padding:6px;box-sizing:border-box;min-width:0;width:min(560px,calc(100vw - 28px));max-width:calc(100vw - 28px);}` +
      `.popup .panes{display:flex;gap:2px;}` +
      `.popup .pane{display:flex;flex-direction:column;min-width:0;flex:1;max-height:min(264px,45vh);overflow:auto;}` +
      `.popup .pane + .pane{border-left:1px solid var(--border-lit);padding-left:2px;}` +
      `.popup .pane-h{padding:6px 10px 4px;font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);}` +
      `.popup .item{display:flex;align-items:center;gap:8px;margin:1px;padding:5px 8px;border-radius:6px;cursor:pointer;white-space:nowrap;}` +
      `.popup .item:hover{background:var(--sel);}` +
      `.popup .item.dis{opacity:.45;cursor:default;}` +
      `.popup .item.dis:hover{background:none;}` +
      `.popup .chk{width:14px;flex:0 0 14px;color:var(--accent);font-weight:600;visibility:hidden;}` +
      `.popup .item.sel .chk{visibility:visible;}` +
      `.popup .item.sel .lbl{color:var(--fg-strong);}` +
      `.popup .item .sub{margin-left:auto;color:var(--muted);font-size:11px;font-family:var(--font);}` +
      `.popup .foot{margin-top:6px;padding:6px 10px 2px;border-top:1px solid var(--border-lit);color:var(--muted);font-size:11px;}` +
      `.slider-pop{flex-direction:column;width:330px;max-width:calc(100vw - 28px);box-sizing:border-box;padding:10px 14px 12px;}` +
      `.slider-pop .pane-h{padding:2px 2px 8px;font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);}` +
      `.slider-pop input[type=range]{width:100%;accent-color:var(--accent);cursor:pointer;margin:0;}` +
      `.ticks{display:flex;justify-content:space-between;padding:0 7px;}` +
      `.ticks i{width:1px;height:5px;background:var(--border-lit);}` +
      `.ticks i.on{background:var(--accent);height:8px;}` +
      `.notches{display:flex;justify-content:space-between;padding:0 2px;margin-top:3px;}` +
      `.notches span{font-size:10px;color:var(--muted);cursor:pointer;padding:1px 2px;border-radius:4px;}` +
      `.notches span:hover{background:var(--sel);}` +
      `.notches span.on{color:var(--accent);font-weight:600;}` +
      `.slider-pop .foot{margin-top:10px;padding-top:8px;border-top:1px solid var(--border-lit);color:var(--muted);font-size:11px;line-height:1.4;}` +
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
      // E202611031bd72813:S001 t4: the active-chats chip, LEFT-aligned at the start of .chrome
      // (.histchip look, but the glyph is a status dot whose colour follows the most urgent entry:
      // red > yellow > green via data-urgent on the chip).
      `.actchip{position:relative;display:inline-flex;align-items:center;max-width:36ch;padding:3px 2px 3px 22px;background:var(--dropdown-bg);border:1px solid var(--dropdown-border);border-radius:6px;color:var(--fg);}` +
      `.actchip::before{content:"";position:absolute;left:7px;top:50%;width:9px;height:9px;margin-top:-4.5px;border-radius:50%;background:var(--muted);pointer-events:none;}` +
      `.actchip[data-urgent="waiting-input"]::before{background:var(--red);}` +
      `.actchip[data-urgent="working"]::before{background:var(--warn);}` +
      `.actchip[data-urgent="done"]::before{background:var(--pass);}` +
      `.chrome #insrc-active{max-width:100%;}` +
      `.status-dot{font-style:normal;}` +
      `.status-dot.red{color:var(--red);}.status-dot.yellow{color:var(--warn);}.status-dot.green{color:var(--pass);}` +
      // E202611031bd72813:S001 t4 ac1 (now Story 546198e11c24c1e3/s1): each active-list row's
      // status-dot sub carries data-dot red/yellow/green; these rules colour that dot (the closed
      // chip shows the AGGREGATE urgent colour via data-urgent on #insrc-actchip above).
      `.popup .item .sub[data-dot="red"]{color:var(--red);}` +
      `.popup .item .sub[data-dot="yellow"]{color:var(--warn);}` +
      `.popup .item .sub[data-dot="green"]{color:var(--pass);}` +
      // Story 546198e11c24c1e3/s1: the two chrome dropdowns are borderless button triggers (provider
      // icon + label + chevron) inside their chips, plus a downward-anchored .popup menu that reuses
      // the run-config item rows.
      `.chatbtn{display:inline-flex;align-items:center;gap:6px;background:transparent;border:none;color:var(--fg);font-family:var(--font);font-size:12px;font-weight:500;line-height:1.2;padding:0;margin:0;cursor:pointer;outline:none;max-width:100%;}` +
      `.chatbtn:hover{color:var(--accent);}` +
      `.chatbtn:focus-visible{outline:1px solid var(--focus);outline-offset:1px;}` +
      `.chatbtn .chatlbl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}` +
      `.chatbtn .chev{opacity:.6;font-size:10px;}` +
      // Story e0821209d94791d0/s1: the dedicated new-chat button left of the history chip — same
      // ground/border/radius as .histchip, icon-only, glyph in the shared .pico 14px slot.
      `.newchatbtn{display:inline-flex;align-items:center;justify-content:center;padding:3px 5px;margin:0 6px 0 0;background:var(--dropdown-bg);border:1px solid var(--dropdown-border);border-radius:6px;color:var(--fg);cursor:pointer;}` +
      `.newchatbtn:hover{color:var(--accent);}` +
      `.newchatbtn:focus-visible{outline:1px solid var(--focus);outline-offset:1px;}` +
      `.chatmenu{bottom:auto;right:auto;top:calc(100% + 6px);left:0;width:auto;min-width:min(220px,calc(100vw - 28px));max-width:min(360px,calc(100vw - 28px));max-height:min(300px,50vh);overflow:auto;}` +
      // The history chip is RIGHT-aligned: its menu must anchor to the chip's right edge and open
      // leftward, or the left-anchored .chatmenu default pushes it past the right viewport edge.
      `#insrc-histmenu{left:auto;right:0;}` +
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
    const available = deps.providers.available;
    // Run-config buttons (bottom-right): labels reflect the ACTIVE session's persisted
    // model/effort (absent = the CLI default, shown as 'default'); the catalog the popup
    // reads is embedded as escaped JSON for the nonce'd bootstrap (no extra fetch/CSP).
    const runProvider = session?.provider ?? available[0];
    const runModelId = session?.model;
    const runEffort = session?.effort;
    const runModel = runCatalog.find((p) => p.id === runProvider)?.models.find((m) => runModelId !== undefined && (m.id === runModelId || m.alias === runModelId || m.otherAliases?.includes(runModelId) === true));
    const runModelLabel = runModel !== undefined ? (runModel.alias ?? runModel.name) : (runModelId || 'default');
    const runEffortLabel = runEffort !== undefined && runEffort !== '' ? runEffort : 'default';
    const catalogJson = attr(JSON.stringify(runCatalog));
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
        `function renderOutbox(v){if(!v||v.sessionId!==cur)return;obCounts=[];var rows=v.rows||[];` +
        `var parts=[];var n=v.aheadFromOtherChats||0;if(n>0)parts.push(n+(n===1?' message':' messages')+' from other chats ahead');` +
        `if(v.runningChat)parts.push('running: \u201c'+String(v.runningChat.title)+'\u201d'+(v.runningChat.here?' (this window)':''));` +
        `if(v.blockedBy)parts.push('waiting for '+(v.blockedBy.reason==='selection'?'a choice':'an approval')+' in \u201c'+String(v.blockedBy.chatTitle)+'\u201d');` +
        `if(v.capacity&&rows.some(function(r){return r.state==='queued'||r.state==='retrying'||r.state==='processing';})){parts.push(v.capacity.occupied+' of '+v.capacity.total+' running');}` +
        `if(Array.isArray(v.activeTurns)&&rows.some(function(r){return r.waitReason==='capacity';})){parts.push(v.activeTurns.map(function(t){return t.title;}).join(', '));}` +
        `obSum.textContent=parts.join(' \u00b7 ');obSum.hidden=parts.length===0;` +
        `obList.textContent='';` +
        `rows.forEach(function(r){var row=document.createElement('div');row.className='outbox__row outbox__row--'+String(r.state);` +
        `var text=String(r.text||'');var first=text.split('\\n')[0];` +
        `row.appendChild(obSpan('outbox__place',typeof r.position==='number'?'#'+r.position:(r.state==='not-delivered'?'not sent':String(r.state))));` +
        `var t=obSpan('outbox__text',first||(r.attachments>0?'':'(empty)'));t.setAttribute('title',text);row.appendChild(t);` +
        `if(r.attachments>0)row.appendChild(obSpan('outbox__files','\ud83d\udcce'+r.attachments));` +
        `if(r.error){var er=obSpan('outbox__err',String(r.error));er.setAttribute('title',String(r.error));row.appendChild(er);}` +
        `var reason=({'same-session':'waiting for this chat’s earlier message','origin-unavailable':'waiting for the sending window','capacity':'waiting for a free chat slot','approval':'waiting for approval','selection':'waiting for a choice'})[r.waitReason];if(reason)row.appendChild(obSpan('outbox__attempt',reason));` +
        `if(r.state==='retrying'){row.appendChild(obSpan('outbox__attempt','attempt '+String(r.attempt||1)+' of 3'));` +
        `var cd=obSpan('outbox__countdown','');row.appendChild(cd);if(typeof r.nextAttemptAt==='number')obCounts.push({el:cd,at:r.nextAttemptAt});` +
        `row.appendChild(obBtn('\u25b6','retry this message now','outbox-retry-now',r.seq));}` +
        `if(r.state==='queued'||r.state==='retrying'){row.appendChild(obBtn('\u2715','cancel this message','outbox-cancel',r.seq));}` +
        `else if(r.state==='failed'||r.state==='not-delivered'){row.appendChild(obBtn('\u21bb','send this message again','outbox-resend',r.seq));row.appendChild(obBtn('\u2715','dismiss this message','outbox-dismiss',r.seq));}` +
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
    // Story E202611134642d49a:S001 t4: the scratchpad menu. The button posts scratch-open-menu;
    // the host answers with a 'scratch-list' push (recent entries, or an error). Rows post
    // scratch-open {id} / scratch-new / scratch-browse. Empty and error states render as hint
    // rows, so the menu is never blank. Rendering reuses mitem/chatMenuKey/closePops.
    const scratchScript = !scratchOn
      ? ''
      : `var scratchBtn=document.getElementById('insrc-scratch'),scratchMenu=document.getElementById('insrc-scratchmenu'),scratchList=null;` +
        `function renderScratchMenu(m){scratchMenu.innerHTML='';var err=typeof m.error==='string'?m.error:'';if(err){scratchMenu.appendChild(mitem(false,err.indexOf('scratchpads unavailable:')===0?err:'scratchpads unavailable: '+err,undefined,undefined,undefined,true,''));return;}var es=Array.isArray(m.entries)?m.entries:[];` +
        `if(es.length===0){scratchMenu.appendChild(mitem(false,'no scratchpads yet — use “New scratchpad” below',undefined,undefined,undefined,true,''));}` +
        `es.forEach(function(e){if(e&&typeof e.id==='string'){var row=mitem(false,String(e.name!==undefined?e.name:e.id),undefined,undefined,undefined,false,'');row.setAttribute('data-id',e.id);row.onclick=function(){vs.postMessage({v:1,payload:{type:'scratch-open',id:e.id}});};scratchMenu.appendChild(row);}});` +
        `var newRow=mitem(false,'New scratchpad',undefined,undefined,undefined,false,'');newRow.onclick=function(){vs.postMessage({v:1,payload:{type:'scratch-new'}});};scratchMenu.appendChild(newRow);` +
        `var brRow=mitem(false,'Browse all',undefined,undefined,undefined,false,'');brRow.onclick=function(){vs.postMessage({v:1,payload:{type:'scratch-browse'}});};scratchMenu.appendChild(brRow);}` +
        `if(scratchBtn)scratchBtn.addEventListener('click',function(e){if(e&&e.stopPropagation)e.stopPropagation();vs.postMessage({v:1,payload:{type:'scratch-open-menu'}});toggleChatMenu(scratchBtn,scratchMenu,function(){renderScratchMenu(scratchList||{entries:[]});});});` +
        `if(scratchBtn)scratchBtn.addEventListener('keydown',function(e){triggerKey(scratchBtn,scratchMenu,function(){renderScratchMenu(scratchList||{entries:[]});},e);});` +
        `if(scratchMenu)scratchMenu.addEventListener('click',function(e){if(e&&e.stopPropagation)e.stopPropagation();});` +
        `if(scratchMenu)scratchMenu.addEventListener('keydown',function(e){chatMenuKey(scratchBtn,scratchMenu,e);});`;
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
      `const pager=(${transcriptPagerWebviewSource()})(t,{bar:document.getElementById('insrc-older'),jump:document.getElementById('insrc-jump'),post:function(p){vs.postMessage({v:1,payload:p});}});` +
      `function line(s,cls){const d=document.createElement('div');if(cls)d.className=cls;d.textContent=s;return pager.append(d);}` +
      // S004: the marker mapper, single-sourced with the host markerFor (markers.ts), embedded in THIS one nonce'd script.
      `const markerFor=${markerWebviewSource()};` +
      // S001 sc1: the render registry, single-sourced with render-registry.ts, embedded in THIS one nonce'd script.
      // line() is pre-registered as the 'fallback' renderer; t4/S003/S004 register the concrete row renderers.
      `const reg=(${renderRegistryWebviewSource()})(document,line);` +
      `pager.attach(reg);` +
      // S004 ac2: the approval card's approve/deny buttons post a permission-decision the host
      // relays to the live turn's CLI (adapter.decide). Wired once via the sc1 decision sink.
      `reg.onApprovalDecision(function(requestId,decision,target){vs.postMessage({v:1,payload:{type:'permission-decision',requestId:requestId,decision:decision,target:target}});});` +
      // S004 (dev-chat ux polish): the selection widget's confirm posts a selection-decision the host
      // maps back to labels + continues the run. Wired once via the sc1 selection decision sink.
      `reg.onLinkOpen(function(p){vs.postMessage({v:1,payload:p});});` +
      `reg.onSelectionDecision(function(requestId,selected,target){vs.postMessage({v:1,payload:{type:'selection-decision',requestId:requestId,selected:selected,target:target}});});` +
      attachScript +
      outboxScript +
      // S005: history-dropdown wiring (same one nonce'd script).
      `var cur='';var curProv='';` +
      `const hs=document.getElementById('insrc-history');` +
      // Story e0821209d94791d0/s1: the new-chat chrome button left of .histchip posts the same new-chat.
      `const nc=document.getElementById('insrc-newchat');` +
      `const actChip=document.getElementById('insrc-actchip');const act=document.getElementById('insrc-active');` +
      `const DOT={ 'waiting-input':'red', working:'yellow', done:'green' };` +
      // Story 546198e11c24c1e3/s1: the two chrome dropdowns are now custom button triggers + .popup
      // menus (the native <select>s are gone). The provider icon renders as the real inline SVG via
      // pico() inside the trigger/row markup — no data-URI background. The list entries are cached
      // client-side and the selected ids (histSel/actSel) reconcile to the host-confirmed session.
      `var histEntries=[];var actEntries=[];var histSel='';var actSel='';var chatFocused=null;` +
      `const actMenu=document.getElementById('insrc-actmenu');const histMenu=document.getElementById('insrc-histmenu');` +
      // Run-config controls (bottom-right): the provider·model popup + effort gauge.
      // State lives in the buttons' data-* attributes (server-rendered from the active
      // session); the model catalog is embedded once in #insrc-catalog.
      `var catalog=[],catalogRevision=-1,catalogStatus=document.getElementById('insrc-catalog').getAttribute('data-status')||'loading';try{catalog=JSON.parse(document.getElementById('insrc-catalog').getAttribute('data-catalog')||'[]');}catch(e){catalog=[];}` +
      `const rb=document.getElementById('insrc-runbtn'),gb=document.getElementById('insrc-effortbtn');` +
      `const rp=document.getElementById('insrc-runpop'),ep=document.getElementById('insrc-effortpop');` +
      `function rstate(){return{provider:rb?rb.getAttribute('data-provider')||'':'',model:rb?rb.getAttribute('data-model')||'':'',effort:rb?rb.getAttribute('data-effort')||'':''};}` +
      // Story c760757cc9077508/s1: seed the assistant who-label source from the server-rendered
      // run-config attributes, so the first paint already composes PROVIDER/model (no fallback flash).
      `reg.setRunIdentity(rstate().provider,rstate().model);` +
      `var ICONS=${JSON.stringify(PROVIDER_ICON_SVGS)};function pico(p){return ICONS[p]||'';}` +
      `function rprov(p){return catalog.filter(function(f){return f.id===p;})[0];}` +
      `function rmodel(p,m){var f=rprov(p);return f?f.models.filter(function(x){return x.id===m||x.alias===m||(x.otherAliases&&x.otherAliases.indexOf(m)>=0);})[0]:undefined;}` +
      `function rtext(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}` +
      `function rlabel(){var s=rstate(),f=rprov(s.provider),m=rmodel(s.provider,s.model);rb.innerHTML='<span class="pico">'+pico(s.provider)+'</span> '+rtext(s.provider||'…')+' · '+rtext(m?(m.alias||m.name):(s.model||'default'))+' <span class="chev">▾</span>';}` +
      `function elabel(){var s=rstate();document.getElementById('insrc-effortlabel').textContent=s.effort||'default';}` +
      `function rlevels(){var s=rstate(),m=rmodel(s.provider,s.model);return m?m.efforts.slice():[];}` +
      `function catalogHint(){return catalogStatus==='loading'?'Loading model catalog…':catalogStatus==='unavailable'?'Model catalog unavailable. Reopen to retry.':'';}` +
      `function requestCatalog(){vs.postMessage({v:1,payload:{type:'open-run-picker'}});}` +
      `function updatePickers(){if(rp&&rp.classList.contains('open'))renderProvPane();if(ep&&ep.classList.contains('open'))renderEffortPop();}` +
      `function closePops(){if(rp)rp.classList.remove('open');if(ep)ep.classList.remove('open');if(rb)rb.setAttribute('aria-expanded','false');if(gb)gb.setAttribute('aria-expanded','false');if(actMenu)actMenu.classList.remove('open');if(histMenu)histMenu.classList.remove('open');if(act)act.setAttribute('aria-expanded','false');if(hs)hs.setAttribute('aria-expanded','false');${scratchOn ? 'if(scratchMenu)scratchMenu.classList.remove(\'open\');if(scratchBtn)scratchBtn.setAttribute(\'aria-expanded\',\'false\');' : ''}chatFocused=null;}` +
      `function mitem(sel,label,sub,onclick,onhover,dis,icon){var d=document.createElement('div');d.className='item'+(sel?' sel':'')+(dis?' dis':'');d.setAttribute('role','menuitem');if(dis)d.setAttribute('aria-disabled','true');d.innerHTML='<span class="pico">'+(icon||'')+'</span><span class="chk">✓</span><span class="lbl"></span>'+(sub?'<span class="sub"></span>':'');d.querySelector('.lbl').textContent=label;if(sub)d.querySelector('.sub').textContent=sub;if(!dis){if(onhover)d.onmouseenter=onhover;d.onclick=onclick;}return d;}` +
      // Story 546198e11c24c1e3/s1: the chat dropdowns. The two triggers render from selected-id
      // membership (histChatFor/activeChatFor return the entry or undefined); the menus reuse mitem's
      // role=menuitem rows with a roving tabindex. Activation writes actSel/histSel optimistically and
      // posts open-chat; new-chat is posted by the #insrc-newchat chrome button. reconcile() snaps BOTH selections to cur.
      `function histChatFor(id){for(var i=0;i<histEntries.length;i++){if(histEntries[i].id===id)return histEntries[i];}return undefined;}` +
      `function activeChatFor(id){for(var i=0;i<actEntries.length;i++){if(actEntries[i].id===id)return actEntries[i];}return undefined;}` +
      `function chatTrig(e,label){return '<span class="pico">'+(e?pico(e.provider):'')+'</span><span class="chatlbl">'+rtext(label)+'</span><span class="chev">▾</span>';}` +
      `function renderTriggers(){var he=histChatFor(histSel),ae=activeChatFor(actSel);hs.innerHTML=chatTrig(he,he?(he.title||he.id):'new…');act.innerHTML=chatTrig(ae,ae?(ae.title||ae.id):'no active work');}` +
      `function reconcile(){actSel=(cur&&activeChatFor(cur))?cur:'';histSel=(cur&&histChatFor(cur))?cur:'';renderTriggers();}` +
      `function pickChat(id,trigger){actSel=histSel=id;renderTriggers();closePops();if(trigger&&trigger.focus)trigger.focus();vs.postMessage({v:1,payload:{type:'open-chat',chatId:id}});}` +
      `function newChatPick(trigger){closePops();if(trigger&&trigger.focus)trigger.focus();vs.postMessage({v:1,payload:{type:'new-chat',provider:curProv||''}});}` +
      `function activeRow(c){var d=mitem(c.id===actSel,c.title||c.id,'●',function(){pickChat(c.id,act);},undefined,false,pico(c.provider));var s=d.querySelector('.sub');if(s)s.setAttribute('data-dot',DOT[c.status]||'green');return d;}` +
      `function historyRow(c){return mitem(c.id===histSel,c.title||c.id,undefined,function(){pickChat(c.id,hs);},undefined,false,pico(c.provider));}` +
      `function renderActiveMenu(){actMenu.innerHTML='';if(actEntries.length===0){actMenu.appendChild(mitem(false,'no active work',undefined,undefined,undefined,true,''));return;}for(var i=0;i<actEntries.length;i++)actMenu.appendChild(activeRow(actEntries[i]));}` +
      // Story e0821209d94791d0/s1: the menu lists persisted chats only — new-chat moved to the #insrc-newchat chrome button.
      `function renderHistoryMenu(){histMenu.innerHTML='';for(var i=0;i<histEntries.length;i++)histMenu.appendChild(historyRow(histEntries[i]));}` +
      `function chatRows(menu){var out=[];for(var i=0;i<menu.children.length;i++){var c=menu.children[i];if(c.getAttribute&&c.getAttribute('role')==='menuitem'&&c.getAttribute('aria-disabled')!=='true')out.push(c);}return out;}` +
      `function focusRow(rows,row,keep){for(var i=0;i<rows.length;i++)rows[i].setAttribute('tabindex',rows[i]===row?'0':'-1');chatFocused=row;if(row&&row.focus){if(keep)row.focus({preventScroll:true});else row.focus();}}` +
      // ISSUE-0d3939248a956860: opening a menu shows its top (the most recent chats) and focuses its
      // selected row WITHOUT scrolling to it. Focusing the selected row of a fresh chat used
      // to scroll it to its oldest entries, and a hidden menu keeps the offset it was closed at.
      // Arrow keys still scroll to the row they move to.
      `function focusMenu(menu){var rows=chatRows(menu);var sel=null;for(var i=0;i<rows.length;i++){if((' '+(rows[i].className||'')+' ').indexOf(' sel ')>=0){sel=rows[i];break;}}var target=sel||rows[0]||null;if(target)focusRow(rows,target,true);else chatFocused=null;menu.scrollTop=0;}` +
      `function openChatMenu(trigger,menu,render){render();menu.classList.add('open');trigger.setAttribute('aria-expanded','true');focusMenu(menu);}` +
      `function toggleChatMenu(trigger,menu,render){var was=menu.classList.contains('open');closePops();if(!was)openChatMenu(trigger,menu,render);}` +
      `function chatMenuKey(trigger,menu,e){var rows=chatRows(menu);if(e.key==='Escape'){if(e.stopPropagation)e.stopPropagation();closePops();if(trigger&&trigger.focus)trigger.focus();return;}if(e.key==='Tab'){closePops();return;}if(!rows.length)return;var idx=-1;for(var i=0;i<rows.length;i++){if(rows[i]===chatFocused){idx=i;break;}}if(e.key==='ArrowDown'){if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation();idx=(idx+1)%rows.length;focusRow(rows,rows[idx]);}else if(e.key==='ArrowUp'){if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation();idx=(idx-1+rows.length)%rows.length;focusRow(rows,rows[idx]);}else if(e.key==='Home'){if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation();focusRow(rows,rows[0]);}else if(e.key==='End'){if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation();focusRow(rows,rows[rows.length-1]);}else if(e.key==='Enter'||e.key===' '){if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation();var r=rows[idx<0?0:idx];if(r&&r.onclick)r.onclick();}}` +
      `if(act)act.addEventListener('click',function(e){if(e&&e.stopPropagation)e.stopPropagation();toggleChatMenu(act,actMenu,renderActiveMenu);});` +
      `if(hs)hs.addEventListener('click',function(e){if(e&&e.stopPropagation)e.stopPropagation();toggleChatMenu(hs,histMenu,renderHistoryMenu);});` +
      `if(nc)nc.addEventListener('click',function(e){if(e&&e.stopPropagation)e.stopPropagation();newChatPick(nc);});` +
      `function triggerKey(trigger,menu,render,e){if(e.key==='Enter'||e.key===' '){if(e.preventDefault)e.preventDefault();toggleChatMenu(trigger,menu,render);}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(e.preventDefault)e.preventDefault();closePops();openChatMenu(trigger,menu,render);}}` +
      `if(act)act.addEventListener('keydown',function(e){triggerKey(act,actMenu,renderActiveMenu,e);});` +
      `if(hs)hs.addEventListener('keydown',function(e){triggerKey(hs,histMenu,renderHistoryMenu,e);});` +
      `if(actMenu)actMenu.addEventListener('click',function(e){if(e&&e.stopPropagation)e.stopPropagation();});` +
      `if(histMenu)histMenu.addEventListener('click',function(e){if(e&&e.stopPropagation)e.stopPropagation();});` +
      `if(actMenu)actMenu.addEventListener('keydown',function(e){chatMenuKey(act,actMenu,e);});` +
      `if(histMenu)histMenu.addEventListener('keydown',function(e){chatMenuKey(hs,histMenu,e);});` +
      // Story E202611134642d49a:S001 t4: the scratchpad menu (declared after the shared menu
      // helpers it reuses: mitem/closePops/toggleChatMenu/triggerKey/chatMenuKey).
      scratchScript +
      `function renderProvPane(hover){var pp=document.getElementById('insrc-provpane');pp.innerHTML='<div class="pane-h">Provider</div>';var s=rstate();document.getElementById('insrc-popfoot').textContent=catalogHint()||(started?'Provider is fixed once a chat has started · model and effort apply to the next turns.':'Provider change starts a new chat · model change applies to the next turns.');catalog.forEach(function(f){pp.appendChild(mitem(f.id===s.provider,f.label,String(f.models.length),function(){if(f.id!==s.provider){vs.postMessage({v:1,payload:{type:'new-chat',provider:f.id,model:''}});}},function(){renderModelPane(f);},started&&f.id!==s.provider,pico(f.id)));});renderModelPane(rprov(hover||s.provider));}` +
      `function renderModelPane(f){if(!f)return;var mp=document.getElementById('insrc-modelpane');mp.innerHTML='<div class="pane-h"></div>';mp.querySelector('.pane-h').textContent=f.label;var s=rstate();mp.appendChild(mitem(s.model==='', 'default','CLI default',function(){pickModel(f,'');}));f.models.forEach(function(m){mp.appendChild(mitem(f.id===s.provider&&rmodel(s.provider,s.model)===m,m.name,m.alias||m.id,function(){pickModel(f,m.id);}));});}` +
      `function pickModel(f,id){var s=rstate();if(f.id!==s.provider){vs.postMessage({v:1,payload:{type:'new-chat',provider:f.id,model:id,effort:s.effort}});}else{vs.postMessage({v:1,payload:{type:'set-run-config',model:id}});closePops();}}` +
      `function renderEffortPop(){var s=rstate(),levels=['default'].concat(rlevels()),cur=s.effort?levels.indexOf(s.effort):0;if(cur<0)cur=0;var sl=document.getElementById('insrc-effortslider');sl.max=levels.length-1;sl.value=cur;sl.setAttribute('aria-valuetext',levels[cur]);var tk=document.getElementById('insrc-ticks'),nt=document.getElementById('insrc-notches');tk.innerHTML='';nt.innerHTML='';levels.forEach(function(l,i){var t=document.createElement('i');if(i===cur)t.className='on';tk.appendChild(t);var sp=document.createElement('span');sp.textContent=l;if(i===cur)sp.className='on';sp.onclick=function(){sl.value=i;applyEffort();};nt.appendChild(sp);});document.getElementById('insrc-effortnote').textContent=catalogHint()||'Applies to the next turns of this chat.';}` +
      `function applyEffort(){var s=rstate(),levels=['default'].concat(rlevels()),i=Number(document.getElementById('insrc-effortslider').value);var e=levels[i]==='default'?'':levels[i];vs.postMessage({v:1,payload:{type:'set-run-config',effort:e}});}` +
      `if(rb)rb.onclick=function(e){e.stopPropagation();var was=rp.classList.contains('open');closePops();if(!was){renderProvPane();rp.classList.add('open');rb.setAttribute('aria-expanded','true');requestCatalog();}};` +
      `if(gb)gb.onclick=function(e){e.stopPropagation();if(gb.classList.contains('dim'))return;var was=ep.classList.contains('open');closePops();if(!was){renderEffortPop();ep.classList.add('open');gb.setAttribute('aria-expanded','true');requestCatalog();}};` +
      `var esl=document.getElementById('insrc-effortslider');if(esl){esl.addEventListener('change',applyEffort);}` +
      `if(rp)rp.addEventListener('click',function(e){e.stopPropagation();});` +
      `if(ep)ep.addEventListener('click',function(e){e.stopPropagation();});` +
      `document.addEventListener('click',closePops);` +
      `document.addEventListener('keydown',function(e){if(e.key==='Escape')closePops();});` +
      `rlabel();elabel();` +
      // S002 (ux-polish): webview-local turn running-state drives the leading '>' prompt send/stop control.
      // ❯ (Send) at rest, ■ (Stop) while a turn runs; set on submit, cleared on done/error.
      `var running=false;` +
      // Whether the active chat has started (has rows): the provider is fixed then — the
      // popup disables the other providers (the host refuses the new-chat too). Model and
      // effort stay changeable for the session's subsequent turns.
      `var started=false;` +
      // (The old provider select + its lock are gone: the bottom-right run-config popup
      // posts new-chat on a provider change of an UNSTARTED draft — ChatSession.provider
      // stays readonly.)
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
      `function tickElapsed(){if(progElapsed)progElapsed.textContent=fmtElapsed(Math.max(0,Date.now()-progT0));}` +
      `function clearElapsed(){if(progTimer){clearInterval(progTimer);progTimer=null;}if(progElapsed)progElapsed.textContent='';}` +
      `function setProgress(text,startedAt){if(prog){prog.className='progress';if(progLabel)progLabel.textContent=text;if(startedAt===null){clearElapsed();return;}if(typeof startedAt==='number')progT0=startedAt;else if(!progTimer)progT0=Date.now();tickElapsed();if(!progTimer)progTimer=setInterval(tickElapsed,1000);}}` +
      `var viewGen=0,activeProgress=null,pendingTurn=null;` +
      `function setIdle(){activeProgress=null;pendingTurn=null;if(prog){prog.className='progress idle';if(progLabel)progLabel.textContent='idle';}clearElapsed();}` +
      `function projectProgress(p){activeProgress=p;setRunning(true);setProgress(p.label||({'starting':'starting…','waiting-approval':'waiting for approval…','waiting-choice':'waiting for choice…'}[p.phase]||'working…'),typeof p.startedAt==='number'?p.startedAt:null);}` +
      `function matchesTarget(t){return t.sessionId===cur&&t.viewGeneration===viewGen&&(!activeProgress||!t.turnId||t.turnId===activeProgress.turnId||t.turnId===pendingTurn);}` +
      `function decisionTarget(ev){return viewGen>0?{sessionId:cur,viewGeneration:viewGen,turnId:ev.turnId,requestId:ev.requestId}:undefined;}` +
      // S001 (bugfix): the SINGLE chat-mode control (Manual / Edit Automatically / Auto). Posts
      // set-permission-mode; its wrapping seg flags 'perm-auto' (amber pill) when fully autonomous.
      `var pmode='auto';` +
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
      `window.addEventListener('message',e=>{const m=e.data&&e.data.payload;if(!m||(m.target&&!matchesTarget(m.target)))return;if(m.type==='turn-event'){const ev=m.event;pager.track(m.rowIndex,function(){if(ev&&ev.kind==='status'){var mkp=markerFor(ev);if(running&&mkp)setProgress(mkp.label,activeProgress?(activeProgress.startedAt??null):undefined);}else if(ev&&(ev.kind==='assistant-delta'||ev.kind==='tool-call'||ev.kind==='tool-result'||ev.kind==='permission-outcome'||ev.kind==='selection-request'||ev.kind==='selection-outcome')){var vm=reg.toViewModel(ev);if(ev.kind==='selection-request')vm.meta.target=decisionTarget(ev);reg.renderRow(vm);}` +
      // S004 ac1: a live approval-request renders the in-chat approve/deny card (the renderer
      // builds a detached node, so the handler appends it) — never a silent block.
      `else if(ev&&ev.kind==='approval-request'){var _c=reg.renderRow({kind:'approval',text:ev.title,collapsible:false,meta:{requestId:ev.requestId,title:ev.title,detail:ev.detail,toolName:ev.toolName,position:ev.position,total:ev.total,target:decisionTarget(ev)}});if(_c){pager.append(_c);}}` +
      `else{const mk=markerFor(ev);if(mk)reg.renderRow({kind:'fallback',text:mk.label,cssClass:mk.cssClass});}});` +
      `if(ev&&(ev.kind==='done'||(ev.kind==='error'&&!ev.observationFailure))&&!m.info){setRunning(false);setIdle();}}` +
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
      `else if(m.type==='turn-running'){if(m.sessionId===cur){pendingTurn=m.pendingTurnId||null;if(!activeProgress){setRunning(true);setProgress('working\\u2026',pendingTurn?null:undefined);}}}` +
      `else if(m.type==='turn-progress'){if(m.progress&&m.progress.turnId===m.target.turnId){pendingTurn=null;projectProgress(m.progress);}else if(!m.progress&&((activeProgress&&activeProgress.turnId===m.target.turnId)||pendingTurn===m.target.turnId)){setRunning(false);setIdle();}}` +
      `else if(m.type==='user-row'){pager.track(m.rowIndex,function(){reg.appendKeyed(reg.toViewModel({role:'user',text:m.text,attachments:m.attachments,at:m.at}),m.key);});}` +
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
      `else if(m.type==='session-restored'){if(typeof m.viewGeneration==='number'){if(m.viewGeneration<=viewGen)return;viewGen=m.viewGeneration;}else if(viewGen>0)return;cur=m.sessionId||'';t.textContent='';reg.resetKeys();` +
      `var _rows=m.transcript||[],_first=typeof m.firstIndex==='number'?m.firstIndex:0,_total=typeof m.total==='number'?m.total:_first+_rows.length;` +
      `started=_total>0;` +
      `pager.reset(cur,_first,_total);` +
      `_rows.forEach(function(x,i){pager.track(_first+i,function(){reg.appendKeyed(reg.toViewModel(x),'r'+(_first+i));});});reconcile();setRunning(false);setIdle();pendingTurn=m.pendingTurnId||null;if(m.progress){projectProgress(m.progress);}else if(pendingTurn){setRunning(true);setProgress('starting…',null);}` +
      // S001 (bugfix): reflect the session's persisted mode in the mode control (follows the session).
      `if(m.mode&&pm){pmode=m.mode;pm.value=m.mode;updatePermSeg();}` +
      `}` +
      // S005: history-list (re)populates the dropdown; labels via textContent (no innerHTML); keep active selected.
      // S001 (74bc0120): the active session appearing in the PERSISTED history is itself proof of
      // context — session-store's draft() only enters the store on its first save, i.e. once the
      // chat has a message — so re-settle the lock here alongside the existing provider re-sync.
      // Run-config echo: the host confirms a session's provider/model/effort (open/switch/
      // restore / set-run-config) — the buttons' labels and data-* follow it.
      `else if(m.type==='run-config'){curProv=m.provider||'';if(rb){rb.setAttribute('data-provider',m.provider||'');rb.setAttribute('data-model',m.model||'');rb.setAttribute('data-effort',m.effort||'');}reg.setRunIdentity(m.provider||'',m.model||'');rlabel();elabel();updatePickers();}` +
      `else if(m.type==='run-catalog'&&m.revision>=catalogRevision){catalogRevision=m.revision;catalogStatus=m.status;catalog=Array.isArray(m.providers)?m.providers:[];rlabel();elabel();updatePickers();}` +
      // history-list: the persisted chats repopulate the session dropdown; reconcile BOTH triggers
      // against cur (a rejected open-chat arrives as history-list alone, so this also clears a stale
      // active selection — see the LLD errorCases[1]).
      `else if(m.type==='history-list'){histEntries=m.chats||[];reconcile();}` +
      // E202611031bd72813:S001 t4 (now Story 546198e11c24c1e3/s1): active-list repopulates the left
      // dropdown; each row carries a status dot (red/yellow/green) + the provider icon + title; the
      // chip glyph shows the most urgent status. reconcile() settles BOTH triggers against cur.
      `else if(m.type==='active-list'){actEntries=m.chats||[];var urg='';var rank={'waiting-input':3,working:2,done:1};(m.chats||[]).forEach(function(c){if((rank[c.status]||0)>(rank[urg]||0))urg=c.status;});if(actChip&&actChip.dataset)actChip.dataset.urgent=urg;reconcile();}` +
      // Story E202611134642d49a:S001 t4: the host's answer to scratch-open-menu — cache the
      // list and re-render the menu if it is open (a closed menu renders on its next open).
      (scratchOn ? `else if(m.type==='scratch-list'){scratchList=m;if(scratchMenu&&scratchMenu.classList.contains('open'))renderScratchMenu(m);}` : '') +
      // Story E202611134642d49a:S001 t4: a scratchpad's Send-to-chat. Deterministic insertion
      // into #insrc-input ONLY: splice at the caret, replacing an active range; when the caret
      // is at the end of a non-empty draft, append with one separating newline. Never touches
      // #insrc-prompt and never posts submit/cancel — the user decides when to send.
      (scratchOn ? `else if(m.type==='insert-into-input'){if(typeof m.text!=='string')return;var v=m.text;var s=typeof box.selectionStart==='number'?box.selectionStart:box.value.length,e=typeof box.selectionEnd==='number'?box.selectionEnd:s;` +
        `if(e>s){box.value=box.value.slice(0,s)+v+box.value.slice(e);box.selectionStart=box.selectionEnd=s+v.length;}` +
        `else if(s>=box.value.length&&box.value!==''){box.value=box.value+'\\n'+v;box.selectionStart=box.selectionEnd=box.value.length;}` +
        `else{box.value=box.value.slice(0,s)+v+box.value.slice(s);box.selectionStart=box.selectionEnd=s+v.length;}` +
        `box.focus();}` : '') +
      `});` +
      `const box=document.getElementById('insrc-input');` +
      // S002 ac2: submit converges on ONE path (Enter and the leading '>' prompt control); it
      // posts submit-turn + marks running. The '>' prompt posts cancel-turn while running.
      // Guard on non-empty (matches the host runTurn no-op) so an empty submit never marks running
      // or shows a stuck spinner. On submit, show the progress widget; status events refine its label.
      // With attachments on, a blank box still submits when chips are shown.
      // Epic E20261014613abdb3 Story S002: with the queue, a sent message waits in the outbox until it
      // starts, so the turn is marked running only when the host says so ('turn-running').
      `function doSubmit(){if(!box.value.trim()${attachOn ? '&&attCount===0' : ''})return;started=true;vs.postMessage({v:1,payload:{type:'submit-turn',text:box.value}});box.value='';${queueOn ? '' : `setRunning(true);setProgress('working\\u2026');`}}` +
      // Enter sends. Ctrl or Cmd with it adds a line, which a textarea does not do by itself (execCommand keeps
      // the undo stack and scrolls to the caret). Shift or Alt is left to the browser, and so is an Enter that
      // confirms an input-method composition.
      `box.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.isComposing||e.keyCode===229)return;` +
      `if(e.ctrlKey||e.metaKey){e.preventDefault();if(!(document.execCommand&&document.execCommand('insertText',false,'\\n')))box.setRangeText('\\n',box.selectionStart,box.selectionEnd,'end');return;}` +
      `if(e.shiftKey||e.altKey)return;e.preventDefault();doSubmit();});` +
      `document.getElementById('insrc-jump').addEventListener('click',function(){box.focus();});` +
      pasteScript +
      `if(sendBtn)sendBtn.addEventListener('click',function(){if(running){var turnId=pendingTurn||(activeProgress&&activeProgress.turnId),target=turnId?{sessionId:cur,turnId:turnId,viewGeneration:viewGen}:undefined;if(target||viewGen===0)vs.postMessage({v:1,payload:{type:'cancel-turn',target:target}});if(!target&&viewGen===0){setRunning(false);setIdle();}}else{doSubmit();}});` +
      // S002 (ux-polish): the '>' prompt is a role=button span — Enter/Space activate it like a click.
      `if(sendBtn)sendBtn.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();sendBtn.click();}});` +
      `setRunning(false);` +
      // S001 (bugfix): the readiness handshake — now that the 'message' listener above is attached,
      // tell the host we can receive. This runs on the INITIAL load AND on every VS-Code webview
      // reload (show-after-hide / restore, since the panel has no retainContextWhenHidden), so the
      // host re-sends theme + active session + history and the dropdown/transcript are always
      // repopulated instead of being lost to a post-after-setHtml race.
      `vs.postMessage({v:1,payload:{type:'ready',targetedActions:true}});`;
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
      // Fixed header (mock .chrome): the active-chats chip LEFT-aligned + the session switcher RIGHT-aligned.
      // Story 546198e11c24c1e3/s1: both are <button> triggers (aria-haspopup='menu') with custom
      // role='menu' panels (insrc-actmenu / insrc-histmenu) instead of native <select>s, so each row
      // can render the real provider icon + a status dot. The provider + mode selects live in the footer.
      `<div class="chrome">` +
            // E202611031bd72813:S001 t4: #insrc-active LEFT-aligned at the chrome start; the history
            // chip stays the sole control of .right (right-aligned).
            `<span class="actchip" id="insrc-actchip" data-urgent=""><button type="button" id="insrc-active" class="chatbtn" aria-haspopup="menu" aria-expanded="false" aria-label="active chats"><span class="pico"></span><span class="chatlbl">no active work</span><span class="chev">▾</span></button><div id="insrc-actmenu" class="popup chatmenu" role="menu" aria-label="active chats"></div></span>` +
            `<span class="right"><button type="button" id="insrc-newchat" class="newchatbtn" aria-label="new chat" title="new chat"><span class="pico"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M8 3C4.7 3 2 5.2 2 8s2.7 5 6 5c.6 0 1.2-.1 1.8-.2.9.5 1.9.8 3.2.9-.5-.7-.8-1.5-.9-2.2 1-.9 1.9-2.4 1.9-4.5C14 5.2 11.3 3 8 3Z"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M8 6v4M6 8h4"/></svg></span></button><span class="histchip"><button type="button" id="insrc-history" class="chatbtn ${histCls}" aria-haspopup="menu" aria-expanded="false" aria-label="session"><span class="pico"></span><span class="chatlbl">new…</span><span class="chev">▾</span></button><div id="insrc-histmenu" class="popup chatmenu" role="menu" aria-label="session"></div></span></span>` +
      `</div>` +
      // Full-width bars (mock): the scrolling transcript, then the live progress bar, then the input
      // bar — each a flex:0 band with its own top border + inset ground, NOT inset inside a .pad.
      // Story E20261012ddc4ede1:S001: the 'load earlier' bar (the pager fills and shows it).
      `<div id="insrc-older" role="button" tabindex="0" aria-label="load earlier messages"></div>` +
      `<div id="insrc-termwrap"><div id="insrc-term" class="term"></div><button type="button" id="insrc-jump" title="Jump to latest output" aria-label="jump to latest output" hidden>&#8595;</button></div>` +
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
      // Story E202611134642d49a:S001 t4: the sibling icon-only scratchpad button, directly next
      // to the attach button, with its upward-opening menu (the .scratchchip wrapper anchors it).
      (scratchOn
        ? `<span class="scratchchip"><button id="insrc-scratch" type="button" class="attachbtn" aria-haspopup="menu" aria-expanded="false" aria-label="scratchpads" title="scratchpads">` +
          `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M4 1.5h6l3 3V14a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5Z"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M10 1.5V5h3.5"/><path fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" d="M6 8h4M6 10.5h4M6 13h2.5"/></svg>` +
          `</button><div id="insrc-scratchmenu" class="popup chatmenu" role="menu" aria-label="scratchpads"></div></span>`
        : '') +
      `<span class="seg" id="insrc-modeseg">edits <select id="insrc-mode" class="segsel ${provCls}" aria-label="mode"><option value="manual" disabled>Manual</option><option value="edit-auto" disabled>Edit Automatically</option><option value="auto" selected>Auto</option></select></span>` +
      // Run-config controls, bottom-right corner of the status bar. The popups open upward.
      `<span class="runctl">` +
      `<button id="insrc-runbtn" type="button" class="runbtn ${provCls}" aria-haspopup="menu" aria-expanded="false" title="provider · model" data-provider="${attr(runProvider ?? '')}" data-model="${attr(runModelId ?? '')}" data-effort="${attr(runEffort ?? '')}"><span class="pico">${providerIcon(runProvider)}</span> ${attr(runProvider ?? '…')} · ${attr(runModelLabel)} <span class="chev">▾</span></button>` +
      `<button id="insrc-effortbtn" type="button" class="gaugebtn ${provCls}" aria-haspopup="dialog" aria-expanded="false" title="effort level"><span aria-hidden="true">◔</span> <span id="insrc-effortlabel">${attr(runEffortLabel)}</span></button>` +
      `<div id="insrc-runpop" class="popup" role="menu" aria-label="provider and model">` +
      `<div class="panes"><div class="pane" id="insrc-provpane"><div class="pane-h">Provider</div></div><div class="pane" id="insrc-modelpane"><div class="pane-h">Model</div></div></div>` +
      `<div class="foot" id="insrc-popfoot">Provider change starts a new chat · model change applies to the next turns.</div>` +
      `</div>` +
      `<div id="insrc-effortpop" class="slider-pop" role="dialog" aria-label="effort level">` +
      `<div class="pane-h">Effort</div>` +
      `<input type="range" id="insrc-effortslider" min="0" step="1" value="0" aria-label="effort level">` +
      `<div class="ticks" id="insrc-ticks"></div>` +
      `<div class="notches" id="insrc-notches"></div>` +
      `<div class="foot" id="insrc-effortnote"></div>` +
      `</div>` +
      `<div id="insrc-catalog" hidden data-catalog="${catalogJson}" data-status="${catalogStatus}"></div>` +
      `</span>` +
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
    opts?: { readonly suppressEcho?: boolean | undefined; readonly skipUserRow?: boolean | undefined; readonly attachments?: readonly AttachmentRef[] | undefined; readonly session?: ChatSession | undefined; readonly shouldSpawn?: (() => boolean) | undefined },
  ): Promise<void> {
    // Story E202610138d4b90c9:S001: counted as starting until turns.start has been called (from
    // then on the lifecycle says a turn is in progress), so no waiting pane message is run between.
    const owner = opts?.session ?? session;
    if (owner === undefined) return;
    const rt = runtimeOf(owner);
    const pendingTurnId = `pending-${++nextPendingTurn}`;
    rt.pendingTurnId = pendingTurnId;
    postRunning(rt);
    rt.startingTurns += 1;
    let counted = true;
    const started = (): void => {
      if (!counted) return;
      counted = false;
      rt.startingTurns -= 1;
    };
    try {
      await startTurn(text, allowedTools, { ...opts, session: rt.session }, started, pendingTurnId);
    } finally {
      started();
      if (rt.pendingTurnId === pendingTurnId) {
        rt.pendingTurnId = undefined;
        if (rt.session === session) post({ type: 'turn-progress', target: { sessionId: rt.session.id, viewGeneration, turnId: pendingTurnId }, progress: null });
      }
    }
  }

  async function startTurn(
    text: unknown,
    allowedTools: readonly string[] | undefined,
    opts: { readonly suppressEcho?: boolean | undefined; readonly skipUserRow?: boolean | undefined; readonly attachments?: readonly AttachmentRef[] | undefined; readonly session?: ChatSession | undefined; readonly shouldSpawn?: (() => boolean) | undefined } | undefined,
    started: () => void,
    pendingTurnId: string,
  ): Promise<void> {
    if (typeof text !== 'string') return; // malformed submit-turn -> no-op (never throws)
    const typed = text.trim();
    const files = opts?.attachments ?? [];
    const s = opts?.session ?? session; // t6: a follow-up fallback may target a non-selected chat
    if ((typed === '' && files.length === 0) || s === undefined) return; // empty submit is a no-op
    const rt = runtimeOf(s);
    if (!runCatalogReady && (s.model || s.effort)) {
      const message = 'Model catalog unavailable. Reopen the model picker to retry or choose the default model.';
      if (rt.queued !== undefined) rt.queued.error = message;
      postLive(s, { kind: 'error', turnId: pendingTurnId, message }, undefined, false);
      return;
    }
    const runCfg = reconcileSessionConfig(s);
    const vibe = s.provider === 'vibe' && (runCfg.model || runCfg.effort) ? {
      vibeCatalog: runCatalog.find(entry => entry.id === 'vibe')?.models.map(model => ({
        id: model.id, efforts: model.efforts,
        aliases: model.alias === undefined ? [] : [model.alias, ...(model.otherAliases ?? [])],
      })) ?? [],
    } : {};
    if (s === session) postRunConfig(s);
    const governor = rt.governor;
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
      if (opts?.suppressEcho !== true && session === s) {
        // Story e4ce70ad1ae43d31/s1: the live echo carries the persisted row's `at` so its
        // who-row time matches the replayed row.
        const at = s.transcript[s.transcript.length - 1]?.at;
        post({
          type: 'user-row',
          target: { sessionId: s.id, viewGeneration },
          text: typed,
          key: `r${s.transcript.length - 1}`,
          rowIndex: s.transcript.length - 1,
          ...(files.length > 0 ? { attachments: [...files] } : {}),
          ...(at !== undefined ? { at } : {}),
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
    // E202611031bd72813:S001 t2: turn starts -> working (after the first save, so the draft exists in the store);
    // a continuation started while other requests remain unresolved stays waiting-input
    setChatStatus(s, unresolvedRequests(rt) ? 'waiting-input' : 'working');

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
    const q = rt.queued;
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
      ? { provider: s.provider, prompt, cwd: deps.cwd(), permissionMode: modeOf(s), ...runCfg, ...vibe, ...grant, ...readable, resume: { provider: s.provider, nativeSessionId: s.nativeSessionId } }
      : { provider: s.provider, prompt, cwd: deps.cwd(), permissionMode: modeOf(s), ...runCfg, ...vibe, ...grant, ...readable };

    // Story E20261013b2e8109f:S001: this turn's diff state, opened in beforeRun.
    let dt: DiffTurn | undefined;
    const writer = Symbol();
    let spawned = false;
    const releaseWriter = (): void => { if (rt.writer === writer) rt.writer = undefined; };
    const sink: TurnSink = {
      // MR3: checked by the lifecycle immediately before the CLI spawns; false ends the turn without spawning
      ...(opts?.shouldSpawn !== undefined ? { shouldSpawn: opts.shouldSpawn } : {}),
      onSpawn: (cli) => {
        spawned = true;
        void cli.exited.then(releaseWriter);
        const progress = readTurnProgress(s);
        if (progress !== undefined && rt.pendingTurnId === pendingTurnId) {
          rt.pendingTurnId = undefined;
          if (session === s) post({ type: 'turn-progress', target: { sessionId: s.id, viewGeneration, turnId: progress.turnId }, progress });
        }
        // a pending follow-up run actually spawned: its decisions were delivered. Only a spawn of a
        // DIFFERENT turn than the one the follow-up was queued behind consumes the marker — events of
        // the original turn must not mark the follow-up delivered before it starts.
        // a spawn of a NEW turn binds + confirms the oldest pending follow-up (per-turn correlation)
        if (pendingFollowUps.size > 0 && rt.turns.live?.turnId !== undefined) confirmFollowUp(rt.turns.live.turnId, s);
        if (q !== undefined) {
          q.spawned = true;
          q.lastCli = cli;
          try {
            q.onSpawn(cli);
          } catch (err) {
            log.warn(`[chat] the queue could not record the turn's CLI: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      },
      onWaiting: () => postLive(s, { kind: 'status', turnId: 'waiting', phase: 'waiting' }, undefined, false),
      // S006: capture the pre-turn baseline BEFORE the CLI can write (governor.beginTurn), so the
      // diff + revert are computed against the true pre-turn content (k8 observer).
      // S001 (bugfix): the merged chat mode now governs edits (via claude's permission flags), so the
      // governor runs visualize-only — it renders diffs but no longer gates with accept/reject (the
      // separate edit-review gate is retired, Claude-Code style).
      beforeRun: async () => {
        rt.writer = writer;
        rt.rollbackUnsafe = false;
        for (const other of runtimes.values()) {
          if (other === rt || (other.writer === undefined && other.session.liveTurn === undefined)) continue;
          other.rollbackUnsafe = true;
          rt.rollbackUnsafe = true;
        }
        if (governor === undefined) return;
        endDiffTurn(rt); // a turn that never reached its end still holds a diff state: end it first
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
        // a pending follow-up run produced a non-error event: it started, so its decisions were
        // delivered (adapters that never call onSpawn are covered here; onSpawn covers spawn-only).
        // An ERROR as the first event means the spawn/setup failed BEFORE onSpawn — leave
        // pendingFollowUp set so the settled run is marked delivery-failed, not approved.
        // a non-error event of a NEW turn binds + confirms the oldest pending follow-up to THAT
        // turn only — never marks other pending follow-ups delivered
        if (ev.kind !== 'error' && pendingFollowUps.size > 0) confirmFollowUp(ev.turnId, s);
        // Story E20261013e62a9269:S001: before anything else, and whatever is done with the event below.
        presentDeclared(shown, ev, s, () => session === s);
        // Story S004: the agent acted (a tool call, an edit or a tool result): this message is never retried.
        if (q !== undefined && (ev.kind === 'tool-call' || ev.kind === 'file-edit' || ev.kind === 'tool-result')) q.acted = true;
        // ISSUE-6a811b8a: an approval-request is queued. Only the queue head is shown.
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
          stampLiveTranscriptLen(s);
          if (ev.kind === 'approval-request') {
            enqueueApproval(ev, rt);
            setChatStatus(s, 'waiting-input'); // mid-turn: the agent is blocked on this request
          } else postLive(s, ev, rowIndex);
        }
        // ISSUE-6a811b8a: the turn's end lets its batch of turn-ended requests complete.
        if (ev.kind === 'done' || (ev.kind === 'error' && ev.observationFailure !== true)) {
          rt.approvals.endTurn(ev.turnId); // E202611031bd72813:S001 t2: an observation failure is not terminal
          persistQueueSnapshot(rt); // t6: the ended set must be fresh for reload restoration
        }
        // S004 (dev-chat ux polish): remember a surfaced selection request's options (keyed by
        // requestId) so a later selection-decision can map the chosen ids back to labels.
        if (ev.kind === 'selection-request') {
          rt.pendingSelections.set(ev.requestId, ev);
          persistPendingBeforeClear(s);
          setChatStatus(s, 'waiting-input'); // mid-turn selection request
          reportCards(rt); // Story S002
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
      onTerminal: (ev) => {
        followUpTurns.delete(ev.turnId);
        if (q !== undefined) {
          q.terminal = ev.kind;
          if (ev.kind === 'done' && ev.replayUnsafe === true) q.acted = true;
          if (ev.kind === 'error') q.error = ev.message;
          // Story S004: a done with ok:false is a failed turn, not a finished one. claude and codex report an overload or
          // a rate limit as an is_error result, which the adapter maps to done(ok:false) with the provider's text.
          else if (ev.kind === 'done' && !ev.ok) q.error = ev.message ?? 'the turn ended with an error';
        }
        runCompletedBatch(rt); // ISSUE-6a811b8a: requests decided before the turn ended are now complete
        // E202611031bd72813:S001 t2: re-evaluate AFTER runCompletedBatch — a continuation it starts
        // keeps 'working'; pending cards keep waiting-input; otherwise done.
        reevaluateChatStatus(s);
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
        setChatStatus(s, 'done'); // E202611031bd72813:S001 t2: adapter/setup/lock failure -> done
        if (q !== undefined) q.error = message;
        endDiffTurn(rt);
        postLive(s, { kind: 'error', turnId, message }, undefined);
      },
    };
    // Single-in-flight per session: the newest message wins. start drops a turn still waiting for
    // the lock and stops the previous turn posting (the transcript never interleaves); the previous
    // turn's process is NOT killed: this turn waits for it.
    // Story E20261013b2e8109f:S001: start() stops the previous turn reporting to its sink at once,
    // while this turn's beforeRun may wait for that turn's process: settle its held paths now.
    endDiffTurn(rt);
    const run = rt.turns.start(s, req, sink);
    started();
    // Story E20261013e62a9269:S001: the one place that is reached for a turn that completed,
    // failed, was stopped or was superseded.
    try {
      await run;
    } finally {
      if (!spawned) releaseWriter();
      endPresented(shown);
      if (q !== undefined && rt.queued === q) {
        q.turns -= 1;
        settleQueued(rt);
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
  /** After a live-path appendEvent, record the persisted transcript length on the liveTurn, so a
   * later observer replay from an earlier cursor truncates instead of duplicating these rows. */
  function stampLiveTranscriptLen(s: ChatSession): void {
    if (s.liveTurn !== undefined && s.liveTurn.transcriptLen !== s.transcript.length) {
      s.liveTurn = { ...s.liveTurn, transcriptLen: s.transcript.length };
    }
  }

  /** The durable transcript row for an event, or undefined when the event persists no row. */
  function rowForEvent(ev: TurnEvent): TranscriptEntry | undefined {
    if (ev.kind === 'assistant-delta') return { role: 'assistant', text: ev.text, at: now() };
    // 'status' is a transient progress tick (thinking/streaming/tool/editing): it is
    // rendered LIVE in the webview (from the posted turn-event) but NOT persisted —
    // persisting every tick would bloat the durable transcript and replay as noise on
    // restore. The durable lifecycle facts (tool-call/file-edit/done/error) ARE kept.
    if (ev.kind === 'status') return undefined;
    // S001 (dev-chat ux polish): a tool result persists STRUCTURALLY as a role:'tool-result' row
    // (command + output), not as a flat marker — so a restored transcript re-renders the command
    // + collapsed output legibly. markerFor returns null for it, so this branch owns its persistence.
    if (ev.kind === 'tool-result') {
      return {
        role: 'tool-result',
        ...(ev.command !== undefined && ev.command !== '' ? { command: ev.command } : {}),
        output: ev.output,
        at: now(),
      };
    }
    // Durable markers are single-sourced through markerFor — the SAME mapper the webview
    // uses — so a host row and its live marker never drift. done now persists a marker row
    // (the S003 gap); an unmapped/future kind -> markerFor returns null -> no row.
    const marker = markerFor(ev);
    // S008: persist the sc1 cssClass alongside the label so a RESTORED chat reproduces
    // each marker's glyph + phosphor tone (identical to live) instead of plain text.
    if (marker !== null) return { role: 'marker', text: marker.label, cssClass: marker.cssClass, at: now() };
    return undefined;
  }

  function appendEvent(s: ChatSession, ev: TurnEvent): number | undefined {
    const progress = readTurnProgress(s);
    if (progress?.turnId === ev.turnId && (ev.kind === 'status' || ev.kind === 'approval-request' || ev.kind === 'selection-request')) {
      const phase = ev.kind === 'status' ? 'working' : ev.kind === 'approval-request' ? 'waiting-approval' : 'waiting-choice';
      const label = ev.kind === 'status' ? markerFor(ev)?.label : undefined;
      if (setTurnProgress(s, { ...progress, phase, label, turnEpoch: s.progressTurnEpoch ?? 0 })) {
        trySave(s);
        if (s === session) post({ type: 'turn-progress', target: { sessionId: s.id, viewGeneration, turnId: ev.turnId }, progress: readTurnProgress(s) ?? null });
      }
    }
    const row = rowForEvent(ev);
    if (row === undefined) return undefined;
    s.transcript.push(row);
    return s.transcript.length - 1;
  }

  function handleMessage(message: unknown): void {
    const env = message as { v?: unknown; payload?: unknown } | null;
    if (env === null || env.v !== 1 || typeof env.payload !== 'object' || env.payload === null) {
      log.warn('[chat] dropped malformed message');
      return;
    }
    const msg = env.payload as WebviewToHost;
    const rt = selected();
    switch (msg.type) {
      case 'ready':
        // S001 (bugfix): the webview attached its listener and is ready to receive. (Re)send the
        // full view state. Fires on the initial load AND every VS-Code webview reload (the panel
        // has no retainContextWhenHidden), so a restored/re-shown chat is always repopulated
        // instead of showing an empty dropdown + transcript.
        webviewReady = true;
        targetedActions = msg.targetedActions === true;
        for (const w of readyWaiters.splice(0)) w();
        postInitialState();
        // ISSUE-de069d56d76eaacd: a rebuilt page (VS Code discards a covered tab's page) starts idle after its
        // session-restored; tell it when a turn is still in progress, so the progress widget and Stop come back.
        if (rt !== undefined && (rt.turns.busy() || rt.startingTurns > 0 || rt.queued !== undefined)) postRunning(rt);
        return;
      case 'open-run-picker':
        refreshRunCatalog();
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
      case 'cancel-turn': {
        // S002 ac2: the Stop control cancels the in-flight turn via the existing reap.
        // Idempotent when no turn is active (stop() no-ops).
        if (rt === undefined) return;
        const stopping = rt.session;
        const turnId = rt.pendingTurnId ?? readTurnProgress(stopping)?.turnId;
        const generation = viewGeneration;
        if (!matchesAction(rt, msg.target, turnId)) return;
        const clearProgress = (): void => {
          if (stopping === undefined || turnId === undefined) return;
          if (stopping.progress?.turnId === turnId) {
            setTurnProgress(stopping, undefined);
            trySave(stopping);
          }
          if (session === stopping && viewGeneration === generation) {
            post({ type: 'turn-progress', target: { sessionId: stopping.id, turnId, viewGeneration: generation }, progress: null });
          }
        };
        if (stopping.liveTurn !== undefined && rt.turns.live === undefined && rt.pendingTurnId === undefined) {
          void rt.turns.stop(stopping).then((verified) => {
            if (!verified) {
              if (session === stopping) {
                post({ type: 'turn-event', event: { kind: 'error', turnId: stopping.liveTurn?.cursor.turnId ?? 'none', message: 'Could not confirm that the process stopped. Still following this turn.', observationFailure: true } });
                followLiveTurn(stopping);
              }
              return;
            }
            clearProgress();
            if (session === stopping) reevaluateChatStatus(stopping);
          });
          return;
        }
        if (rt.queued !== undefined) rt.queued.stopped = true; // Epic E20261014613abdb3 Story S001: wins over the CLI's error
        rejectQueuedApprovals(rt); // ISSUE-6a811b8a: Stop rejects the requests still waiting
        settleQueued(rt); // a queued message waiting only on a card ends now
        endDiffTurn(rt);
        void rt.turns.stop().then((verified) => { if (verified) clearProgress(); });
        if (session !== undefined) setChatStatus(session, 'done'); // E202611031bd72813:S001 t2: Stop -> done
        return;
      }
      case 'new-chat': {
        if (typeof msg.provider !== 'string') return;
        // S005: only start a chat on an INSTALLED agentic CLI (k4). A stale webview
        // option for an uninstalled provider is a no-op (it would fail on the first turn).
        if (!deps.providers.available.some((p) => p === msg.provider)) {
          log.warn(`[chat] new-chat: provider not available ${msg.provider}`);
          return;
        }
        // A started chat's provider is fixed: a new-chat naming a DIFFERENT provider is
        // refused (the popup disables those entries once the session has rows; this is the
        // host-side backstop). A same-provider new-chat is the 'new…' flow and always passes,
        // as does any provider switch while the active session is still an empty draft.
        if (session !== undefined && session.transcript.length > 0 && msg.provider !== session.provider) {
          log.warn(`[chat] new-chat: provider change refused on started session ${session.id} (${session.provider} -> ${msg.provider})`);
          postRunConfig(session);
          return;
        }
        // A DRAFT (unsaved): the new chat is not written to history until its first turn, so
        // repeatedly starting/abandoning new chats never leaves empty sessions behind.
        const proposed = {
          model: typeof msg.model === 'string' ? msg.model : undefined,
          effort: typeof msg.effort === 'string' ? msg.effort : undefined,
        };
        if (!runCatalogReady && (proposed.model || proposed.effort)) {
          if (session !== undefined) postRunConfig(session);
          return;
        }
        session = deps.store.draft(msg.provider, reconcileRunConfig(msg.provider, proposed, runCatalog));
        permissionMode = modeOf(session);
        postRestored(session);
        postPending(session.id);
        postHistory(); // refresh the dropdown (the draft is not yet listed until it has a message)
        return;
      }
      case 'set-run-config': {
        // Model/effort for the current session's subsequent turns. Absent/'' = CLI default.
        if (session === undefined) return;
        const model = typeof msg.model === 'string' ? msg.model : undefined;
        const effort = typeof msg.effort === 'string' ? msg.effort : undefined;
        if (model === undefined && effort === undefined) return;
        if (runCatalogReady) {
          reconcileSessionConfig(session, { model: model ?? session.model, effort: effort ?? session.effort });
        } else if ((model === '' && !effort) || (model === undefined && effort === '')) {
          if (model === '') session.model = undefined;
          session.effort = undefined;
          if (deps.store.get(session.id) !== undefined) trySave(session);
        }
        postRunConfig(session);
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
        showSession(s);
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
        // ISSUE-0d3939248a956860: a draft persists on its first turn (set-permission-mode's rule).
        if (deps.store.get(session.id) !== undefined) deps.store.save(session);
        return;
      }
      case 'edit-decision': {
        // S006: accept keeps the on-disk change; reject reverts to the pre-turn baseline.
        // An unknown/decided path is a no-op inside the governor.
        if (typeof msg.path !== 'string' || typeof msg.accept !== 'boolean') return;
        if (rt === undefined || !matchesAction(rt, msg.target, readTurnProgress(rt.session)?.turnId)) return;
        if (!msg.accept && rt.rollbackUnsafe) {
          deps.editGovernance?.notify?.('The edit could not be reverted because its original baseline is no longer exclusive.');
          return;
        }
        void rt.governor?.decide(msg.path, msg.accept).catch((err: unknown) => warnGovernor('decide', err));
        return;
      }
      case 'permission-decision': {
        // S004 ac2: relay the approve/deny click to the LIVE turn's adapter (its own captured
        // provider, never the current session's — it may have switched). decide() no-ops on an
        // unknown/stale/dead requestId, so a late/duplicate click is safe.
        if (rt === undefined || typeof msg.requestId !== 'string' || (msg.decision !== 'approve' && msg.decision !== 'deny')) return;
        if ((targetedActions || msg.target !== undefined) &&
            (msg.target?.requestId !== msg.requestId || !matchesAction(rt, msg.target, rt.approvals.head()?.request.turnId))) return;
        // S001 (bugfix): review-mode GRANT flow. claude denies + ENDS the turn on a permission
        // request (no in-turn control channel), so the decision can't be relayed to a live turn —
        // instead, on Approve we re-run the blocked action resuming the session with that tool
        // pre-allowed; on Deny we drop it (the turn already ended as denied).
        // ISSUE-6a811b8a: a queued request is decided only when it is the head; a waiting one's card
        // is never shown, so a decision for it (a stale or second webview) is ignored.
        if (rt.approvals.has(msg.requestId)) {
          const res = rt.approvals.decide(msg.requestId, msg.decision);
          if (!res.ok) return;
          decidedRequestIds.add(followUpKey(rt.session.id, res.decided.turnId, msg.requestId));
          // t6: keep the persisted queue snapshot fresh on every decision — batch decisions and
          // grants otherwise live only in memory until the next clear(), and a reload would restore
          // the stale snapshot, losing them and reviving already-decided requests
          persistQueueSnapshot();
          if (session !== undefined) reevaluateChatStatus(session); // E202611031bd72813:S001 t2: resolution re-evaluates precedence
          // Epic E20261014613abdb3 Story S001: a decision that starts no continuation may end the queued message.
          queueMicrotask(() => settleQueued(rt));
          queueMicrotask(() => reportCards(rt)); // Story S002
          rt.shownApproval = undefined;
          const decided = res.decided;
          // persist the full decided record (action payload included) unresolved, so a follow-up
          // fallback can carry the real action text and a reload can restore it whole. MR6: this
          // must also cover TURN-ENDED decisions — runCompletedBatch() persists the batch REMOVAL
          // below, so without a durable unresolved record here a reload in the removal->spawn
          // window would find no actionable delivery state at all.
          if (session !== undefined && deps.store.get(session.id) !== undefined) {
            const list = [...(session.pendingRequests ?? [])];
            // MR1-R3: the unresolved-record upsert is turn-scoped — a later turn reusing the request
            // id gets its own full record (command included), not a bare shell
            if (!list.some((r) => r.requestId === msg.requestId && r.turnId === decided.turnId)) {
              list.push({
                requestId: msg.requestId,
                kind: 'approval',
                turnId: decided.turnId,
                title: decided.title,
                detail: decided.detail,
                ...(decided.toolName !== undefined ? { toolName: decided.toolName } : {}),
                ...(decided.command !== undefined ? { command: decided.command } : {}),
                resolved: false,
              });
              session.pendingRequests = list;
              trySave(session);
            }
          }
          // S003 (dev-chat ux polish): record the resolved outcome (approve AND deny) as a persisted,
          // live-rendered chip — including the dir-block approve branch, which posts no grant re-run.
          recordPermissionOutcome(decided.toolName ?? decided.title, msg.decision === 'approve', msg.requestId);
          if (decided.resolution === 'in-turn') {
            // t6: relayDecision marks the persisted record once delivery is CONFIRMED (delivered in-turn,
            // follow-up started, or delivery-failed) — an undelivered decision must stay unresolved
            relayDecision(msg.requestId, msg.decision, decided.turnId);
            showApprovalHead();
            return;
          }
          // turn-ended decisions are delivered by the batch follow-up (runCompletedBatch), which marks
          // each record once the run starts (or immediately when nothing runs) — never marked approved
          // before delivery. A dir-block approve never runs at all, so it is marked here.
          if (msg.decision === 'approve' && decided.blockKind === 'dir-block') {
            markPersistedRequest(session, msg.requestId, true, 'approved', decided.turnId);
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
        if (msg.mode !== 'auto') return; // invalid, or a mode that is disabled for now -> drop
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
        if (rt === undefined || typeof msg.requestId !== 'string' || !Array.isArray(msg.selected)) return;
        const pending = rt.pendingSelections.get(msg.requestId);
        if (pending === undefined) return; // unknown / stale / already answered -> no-op
        if ((targetedActions || msg.target !== undefined) &&
            (msg.target?.requestId !== msg.requestId || !matchesAction(rt, msg.target, pending.turnId))) return;
        const ids = msg.selected.filter((x): x is string => typeof x === 'string');
        if (ids.length === 0) return;
        rt.pendingSelections.delete(msg.requestId);
        queueMicrotask(() => settleQueued(rt)); // Epic E20261014613abdb3 Story S001
        queueMicrotask(() => reportCards(rt)); // Story S002
        // Map ids -> labels (ids should be unique; a duplicate maps to its first option, and an
        // unknown id falls back to the id text so the choice is never dropped silently).
        const labels = ids.map((id) => pending.options.find((o) => o.id === id)?.label ?? id);
        markPersistedRequest(rt.session, msg.requestId, true, 'selected', pending.turnId);
        recordSelectionOutcome(msg.requestId, labels);
        // Continue the run with a synthesized user message naming the choice. suppressEcho so the
        // synthetic prompt is not echoed as a user bubble — only the resolved selection chip marks it.
        void runTurn(`Selected: ${labels.join(', ')}`, undefined, { suppressEcho: true, session: rt.session });
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
      // Story E202611134642d49a:S001 t2: the six scratchpad intents are declared in the
      // protocol, but their HANDLERS are wired by the extension host (t7) through the
      // injected scratch boundary — the chat panel itself has no scratchpad case yet.
      // The payload fields are part of the contract: a non-string id/text here is a
      // malformed message and is REJECTED (dropped, never throws) just like the default.
      case 'scratch-open-menu':
      case 'scratch-new':
      case 'scratch-browse':
        return; // titleless intents: no payload fields to validate
      case 'scratch-open':
      case 'scratch-delete':
        if (typeof msg.id !== 'string') { log.warn('[chat] dropped malformed scratch message: non-string id'); return; }
        return; // accepted; the t7 handler consumes it
      case 'send-to-chat':
        if (typeof msg.text !== 'string') { log.warn('[chat] dropped malformed send-to-chat: non-string text'); return; }
        return; // accepted; the t7 handler consumes it
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
  const showSession = (candidate: ChatSession): void => {
    const s = runtimeOf(candidate).session;
    session = s;
    permissionMode = modeOf(s);
    postRestored(s);
    restorePendingRequests(s); // t6: after postRestored — session-restored clears the webview
    postPending(s.id);
    postHistory();
    followLiveTurn(s);
  };

  /** Resolves once the panel's webview has posted 'ready'. */
  const whenReady = (): Promise<void> => (webviewReady ? Promise.resolve() : new Promise<void>((r) => void readyWaiters.push(r)));

  /**
   * Epic E20261014613abdb3 Story S001: runs a message the repository's queue handed this window. It
   * opens the panel if it is closed. A run dispatched behind an open chat keeps that view selected,
   * tells the webview a turn is running (so Stop is offered for a turn that started without a
   * click), and starts the turn as a typed message would; it resolves once that turn and its
   * continuations have ended.
   */
  const queueRunner: QueuedTurnRunner = {
    recoverCli(lease) {
      const live = deps.store.get(lease.sessionId)?.liveTurn;
      if (live?.pid === undefined || (live.ownerHostPid !== 0 && live.ownerHostPid !== lease.pid)) return undefined;
      return { pid: live.pid, startedAt: live.startedAt ?? undefined };
    },
    note(message, text) {
      if (disposed || session === undefined || session.id !== message.sessionId) return log.warn(`[chat-queue] note for ${message.key} not shown (its chat is not open): ${text}`);
      postInfo(`queue-giveup-${message.turnId}`, text); // live only: it is about the queue, not the conversation
    },
    run(message, onSpawn, onWaiting) {
      return new Promise<TurnOutcome>((resolve) => {
        let rt: SessionRuntime | undefined;
        void (async (): Promise<void> => {
          try {
            const openedForQueue = channel === undefined;
            if (openedForQueue) hostOpen();
            await whenReady();
            const s = runtimes.get(message.sessionId)?.session ?? deps.store.get(message.sessionId);
            if (s === undefined) return resolve({ kind: 'failed', error: 'the chat no longer exists', acted: false });
            rt = runtimeOf(s);
            if (openedForQueue && session?.id !== s.id && session !== undefined && !deps.store.hasMessages(session.id)) {
              showSession(s);
              postInfo(`queue-note-${message.turnId}`, `Running your queued message in "${s.title}".`);
            }
            if (rt.queued !== undefined) return resolve({ kind: 'failed', error: 'this chat already owns a queue run', acted: false });
            rt.queued = { message, session: s, onSpawn, onWaiting, waiting: undefined, turns: 0, spawned: false, lastCli: undefined, terminal: undefined, error: undefined, acted: false, stopped: false, viewLost: false, waitTimer: undefined, resolve };
            const retried = message.attempts > 0;
            if (retried) {
              const cause = classifyFailure(message.error ?? '');
              persistInfo(s, `queue-retry-${message.turnId}-${message.attempts}`, `the turn failed with ${cause}; retrying (attempt ${message.attempts} of ${MAX_INFRA_RETRIES})`);
            }
            await runTurn(message.text, undefined, {
              session: s,
              ...(message.attachments.length > 0 ? { attachments: message.attachments } : {}),
              ...(retried ? { skipUserRow: true } : {}),
            });
            // runTurn returned without starting a turn (a blank message): nothing ran.
            if (rt.queued?.message === message && rt.queued.turns === 0 && !rt.queued.spawned && rt.queued.terminal === undefined) settleQueued(rt);
          } catch (err) {
            if (rt?.queued?.message === message) rt.queued = undefined;
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
    supersedeQueuedApprovals(runtimeOf(s));
    void runTurn(text, undefined, { session: s, attachments: files });
  };

  const detachRuntimes = (): void => {
    for (const rt of runtimes.values()) {
      queuedViewLost(rt);
      endDiffTurn(rt);
      void rt.turns.detach();
      dropQueuedApprovals(rt);
      settleQueued(rt);
    }
  };

  const wireChannel = (ch: ChatPanelChannel): void => {
    resetCatalogBinding();
    disposed = false;
    channel = ch;
    webviewReady = false; // until this channel's webview posts 'ready'
    channel.onDidDispose(() => {
      if (channel !== ch) return;
      resetCatalogBinding();
      if (!superseding) detachRuntimes();
      markViewGone();
      disposed = true;
      channel = undefined;
      if (activeTimer !== undefined) {
        clearInterval(activeTimer);
        activeTimer = undefined;
      }
      if (observerTimer !== undefined) {
        clearInterval(observerTimer);
        observerTimer = undefined;
      }
    });
    channel.onMessage(message => { if (channel === ch) void handleMessage(message); });
    channel.setHtml(renderShell());
    postInitialState();
    refreshRunCatalog();
    postActive();
    startActiveTimer();
    startObserverTimer();
    void runObserverPass(); // one immediate pass on attach
  };

  return {
    open(): void {
      hostOpen();
    },
    adopt(ch: ChatPanelChannel): void {
      // A restored panel arrived. Supersede any live channel (kill its in-flight turn + dispose
      // it) so exactly one channel remains, then wire the restored one in place.
      if (channel !== undefined) {
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
      detachRuntimes();
      markViewGone();
      resetCatalogBinding();
      disposed = true;
      channel?.dispose();
      channel = undefined;
    },
  };
}
