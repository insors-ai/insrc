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
import { markerFor, markerWebviewSource } from './markers.js';
import { renderRegistryWebviewSource, RENDER_REGISTRY_STYLE } from './render-registry.js';
// S001 (bugfix): the bundled `marked` UMD (committed generated string) — evaluated first in the
// one nonce'd webview script so `marked.parse` is available to the render registry (no CDN; CSP-safe).
import { MARKED_SRC } from './webview-marked.js';
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
import { createTurnLifecycle, DEFAULT_TURN_LOCK_TIMEOUT_MS, trySaveSession, type TurnSink } from './turn-lifecycle.js';
import type { ChatSessionStore, ChatSession } from './session-store.js';
import type { TurnEvent, UnifiedDiff } from './stream-events.js';
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
  reveal(): void;
  dispose(): void;
}

export interface ChatPanelLogger {
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * S006 edit-governance seams the host injects into the EditGovernor. Optional: when
 * absent the host behaves exactly as before (marker-only, no diff/governance). The
 * host itself provides the CHAT render (posts the sc3 edit-prompt); extension.ts
 * supplies the git/fs seams, the native-editor diff, and the diffView accessor.
 */
export interface ChatEditGovernanceDeps {
  readonly baseline: WorkspaceBaseline;
  readonly fs: FsSeam;
  readonly computeDiff: (before: string | undefined, after: string, path: string) => UnifiedDiff;
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
  dispose(): void;
}

/** The chat panel's webview view type (also the WebviewPanelSerializer key). */
export const CHAT_VIEW_TYPE = 'insrc.chatPanel';
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

  const post = (msg: HostToWebview): void => {
    if (disposed || channel === undefined) return;
    channel.postMessage(envelope(msg));
  };

  // Story E2026101259da3204:S001: the attachments waiting to go with each session's next message,
  // in the order they were added. Held here and not in the webview, so a rebuilt webview and a
  // chat switch lose nothing (a window reload does). `clientId` is the webview's own name for a
  // pasted image, echoed back so it can show the thumbnail it holds.
  const att = deps.attachments;
  interface PendingAttachment {
    readonly ref: AttachmentRef;
    readonly clientId?: string | undefined;
  }
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
  const changePending = (sessionId: string, change: (list: PendingAttachment[]) => Promise<{ readonly post: boolean; readonly errors: readonly string[] }>): void => {
    const run = async (): Promise<void> => {
      let result: { readonly post: boolean; readonly errors: readonly string[] };
      try {
        result = await change(pendingOf(sessionId));
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

  // S006: the EditGovernor (inline diff + auto/review + revert). The CHAT surface
  // render is host-internal (posts the sc3 edit-prompt into the one webview); the
  // EDITOR surface + git/fs seams are injected via deps.editGovernance. Absent ->
  // no governor -> the host renders edits exactly as before (the S004 edit marker).
  let governor: EditGovernor | undefined;
  if (deps.editGovernance !== undefined) {
    const eg = deps.editGovernance;
    const editRender: EditRenderSeam = {
      // The host is authoritative for review: carry opts.review on the edit-prompt so the
      // webview gates its accept/reject controls on the HOST's decision, not a drifting
      // webview-local toggle (a stale toggle after a session switch never hides a real
      // control nor shows a dead one).
      showChat: (path, diff, opts) => post({ type: 'edit-prompt', path, diff, review: opts.review }),
      showEditor: (path, baseline, opts) => eg.editorDiff(path, baseline, opts),
    };
    governor = createEditGovernor({
      baseline: eg.baseline,
      fs: eg.fs,
      computeDiff: eg.computeDiff,
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
    showApprovalHead();
  };

  // ISSUE-6a811b8a: Stop. Each request still waiting is recorded as rejected, and the queue cleared.
  const rejectQueuedApprovals = (): void => {
    shownApproval = undefined;
    for (const r of approvals.clear()) recordPermissionOutcome(r.toolName ?? r.title, false, r.requestId);
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
  };

  // ISSUE-6a811b8a: a chat switch or the panel closing. The waiting cards were live-only, so the
  // queue is dropped without outcome rows.
  const dropQueuedApprovals = (): void => {
    shownApproval = undefined;
    approvals.clear();
  };

  // A self-contained informational assistant message (its own turn id, so it closes itself).
  const postInfo = (turnId: string, text: string): void => {
    post({ type: 'turn-event', event: { kind: 'assistant-delta', turnId, text } });
    post({ type: 'turn-event', event: { kind: 'done', turnId, ok: true } });
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
  const followLiveTurn = (s: ChatSession): void => {
    // ISSUE-6a811b8a: the turns this follow raised approval requests for, so its end ends their batch
    // even when the output ends without a terminal event.
    const followedTurns = new Set<string>();
    turns.follow(s, {
      onEvent: (ev) => {
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
      onEnd: () => {
        if (session !== s) return;
        for (const turnId of followedTurns) approvals.endTurn(turnId);
        runCompletedBatch();
        postHistory();
      },
    });
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
    // owns the frame + palette (deliberately single-dark hex, not VS Code theme vars — it's a
    // terminal). The sc1 marker classes are re-toned to the design's accent/cyan/amber/green/red.
    const layoutStyle =
      `<style>` +
      `:root{color-scheme:dark;--font:"JetBrains Mono",ui-monospace,"SF Mono","Cascadia Code",Menlo,Consolas,monospace;` +
      `--bg:#0b0e14;--bg-alt:#10141c;--bg-inset:#0d1119;--panel:#11161f;--fg:#c6cdd8;--fg-strong:#e8edf4;--muted:#6b7688;--dim:#4a5464;` +
      `--border:#222a36;--border-lit:#2f3a4a;--accent:#4ade80;--accent2:#38bdf8;--amber:#fbbf24;--magenta:#c084fc;--red:#f87171;--user:#8ab4ff;--sel:rgba(74,222,128,.22);` +
      `--sans:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;}` +
      `*{box-sizing:border-box;}html,body{height:100%;width:100%;}` +
      `body{margin:0;padding:0;display:flex;background:radial-gradient(1200px 600px at 80% -10%,rgba(56,189,248,.06),transparent 60%),radial-gradient(900px 500px at -5% 10%,rgba(74,222,128,.05),transparent 55%),var(--bg);color:var(--fg);font-family:var(--font);font-size:13.5px;line-height:1.5;-webkit-font-smoothing:antialiased;}` +
      `::selection{background:var(--sel);}a{color:var(--accent2);}` +
      // Full-bleed: the .box IS the whole panel (approved --panel surface), edge to edge — no floating
      // card border/radius/shadow (that framing was the mock's page card; in-panel it fills).
      `.box{flex:1 1 auto;width:100%;min-width:0;display:flex;flex-direction:column;min-height:0;background:var(--panel);overflow:hidden;}` +
      `.chrome{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-inset);border-bottom:1px solid var(--border);color:var(--muted);font-size:12px;flex:0 0 auto;flex-wrap:wrap;}` +
      `.chrome .dot{width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px rgba(74,222,128,.14);flex:0 0 auto;}` +
      `.chrome .title{color:var(--fg-strong);font-weight:600;letter-spacing:.02em;}` +
      `.chrome .right{margin-left:auto;display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;}` +
      // The scrolling transcript band (mock .term): the only overflow region, its own padding +
      // subtle top gradient. Replaces the former inset .pad wrapper so progress/input are full bars.
      `#insrc-term{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:14px;padding:16px 14px;white-space:pre-wrap;word-break:break-word;color:var(--fg);background:radial-gradient(1200px 300px at 50% -10%,rgba(56,189,248,.05),transparent 60%),var(--panel);}` +
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
      `.inputbar{display:flex;gap:9px;align-items:flex-end;padding:11px 12px;border-top:1px solid var(--border);background:var(--bg-inset);flex:0 0 auto;}` +
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
      `#insrc-progress{display:flex;align-items:center;gap:10px;padding:7px 14px;border-top:1px solid var(--border);background:var(--bg-inset);color:var(--muted);font-size:12px;flex:0 0 auto;}` +
      `#insrc-progress[hidden]{display:none;}` +
      `#insrc-progress .spin{display:inline-flex;gap:4px;flex:0 0 auto;}` +
      `#insrc-progress .spin i{width:6px;height:6px;border-radius:50%;background:var(--accent2);opacity:.35;animation:insrc-blink 1.1s infinite;}` +
      `#insrc-progress .spin i:nth-child(2){animation-delay:.18s;}#insrc-progress .spin i:nth-child(3){animation-delay:.36s;}` +
      `#insrc-progress .elapsed{margin-left:auto;color:var(--dim);font-variant-numeric:tabular-nums;}` +
      `@keyframes insrc-blink{0%,100%{opacity:.30;transform:translateY(0);}40%{opacity:1;transform:translateY(-2px);}}` +
      `@media (prefers-reduced-motion:reduce){#insrc-progress .spin i{animation:none;opacity:.7;}}` +
      // S001 (ISSUE-c96399d1) delta 1: the input reads as a FLUSH 2-line terminal prompt — no bordered
      // box (no border/border-radius/background). rows=2 (no auto-grow) pins the visible height at 2 lines
      // and a longer message scrolls natively inside it (a textarea scrolls its own content by default —
      // we deliberately do NOT add overflow-y:auto so #insrc-term stays the panel's single scroll region).
      `#insrc-input{flex:1 1 auto;min-width:0;resize:none;height:40px;background:transparent;color:var(--fg-strong);caret-color:var(--accent);padding:9px 4px;font-family:var(--font);font-size:13px;line-height:1.5;outline:none;}` +
      `#insrc-input::placeholder{color:var(--dim);}` +
      `.statusbar{display:flex;gap:12px;align-items:center;padding:7px 13px;background:var(--bg-inset);border-top:1px solid var(--border);color:var(--muted);font-size:11.5px;flex-wrap:wrap;flex:0 0 auto;}` +
      // ISSUE-6ae99f6e: the functional provider + mode (edits) selects live in the status bar, styled as
      // segments; the mode seg carries the amber 'auto-approve' pill (S004 k6 i) via .statusbar .perm-auto.
      `.statusbar .seg{display:inline-flex;align-items:center;gap:5px;}` +
      `.statusbar .perm-auto{color:var(--amber);border:1px solid rgba(251,191,36,.4);border-radius:999px;padding:2px 9px;}` +
      // The provider/session/edits selects, styled as the bold segment value (transparent, borderless).
      `.segsel{appearance:none;-webkit-appearance:none;background:transparent;border:none;color:var(--fg);font-family:var(--font);font-size:12px;font-weight:500;line-height:1.2;padding:0 14px 0 2px;margin:0;cursor:pointer;outline:none;` +
      `background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 6px) 55%,calc(100% - 3px) 55%;background-size:3px 3px,3px 3px;background-repeat:no-repeat;}` +
      `.segsel:hover{color:var(--accent);}.segsel:disabled{opacity:.5;cursor:default;}.segsel option{background:var(--bg-alt);color:var(--fg);font-weight:400;}` +
      // Keep the header session switcher compact so a long session name can't overflow the chrome —
      // it is the only control in the header now (its selected option shows the active session).
      // ISSUE-bd2d6b6a: it is rendered as a CHIP — a bordered, faintly-filled, rounded container —
      // rather than as a bare .segsel. The clock/history glyph, the session label and the arrow are
      // three marks that .segsel would leave floating transparent on the chrome background with no
      // grouping cue, so the switcher read as TWO controls (a detached dim icon, then label+arrow).
      // Enclosure binds them whatever the session name happens to be. This is a DELIBERATE departure
      // from the borderless .segsel seg language kept by the footer provider/edits selects: this is
      // the sole header control and the only one carrying an icon.
      // The three background layers must be redeclared together (icon + the two .segsel arrow
      // gradients); the icon sits inside the chip's left padding, not at its bare edge.
      `.chrome #insrc-history{max-width:36ch;padding:3px 16px 3px 22px;` +
      `background-color:rgba(255,255,255,.045);border:1px solid var(--border);border-radius:6px;` +
      `background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%23c6cdd8' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.5 8a5.5 5.5 0 1 0 1.6-3.9'/%3E%3Cpath d='M2.4 3.1v2.2h2.2'/%3E%3Cpath d='M8 5.2V8l2 1.2'/%3E%3C/svg%3E"),linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);` +
      `background-position:left 6px center,calc(100% - 6px) 55%,calc(100% - 3px) 55%;background-size:12px 12px,3px 3px,3px 3px;background-repeat:no-repeat,no-repeat,no-repeat;}` +
      `.insrc-term-diff{border:1px solid var(--border-lit);border-radius:6px;margin:6px 0;overflow:hidden;}` +
      `.insrc-diff-path{color:var(--dim);padding:4px 10px;background:var(--bg-inset);border-bottom:1px solid var(--border);}` +
      `.insrc-diff-add{background:rgba(74,222,128,.10);color:var(--fg-strong);padding:0 10px;}` +
      `.insrc-diff-del{background:rgba(248,113,113,.10);color:var(--fg);padding:0 10px;}` +
      `.insrc-diff-ctx{color:var(--muted);padding:0 10px;}` +
      `.insrc-diff-actions{display:flex;gap:8px;padding:8px 10px;background:var(--bg-inset);}` +
      `.insrc-diff-actions button{border:1px solid var(--border-lit);background:var(--bg-alt);color:var(--fg);border-radius:6px;padding:4px 12px;font-family:var(--font);cursor:pointer;}` +
      `.insrc-diff-actions button:hover{border-color:var(--accent);}` +
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
      `.insrc-bubble--user{background:rgba(138,180,255,.08);border:1px solid rgba(138,180,255,.30);border-radius:10px 10px 2px 10px;padding:9px 12px;color:var(--fg-strong);max-width:100%;white-space:pre-wrap;word-break:break-word;}` +
      `.insrc-who--assistant{color:var(--magenta);}` +
      `.insrc-bubble--assistant{background:var(--bg-inset);border:1px solid var(--border);border-radius:2px 10px 10px 10px;padding:10px 13px;max-width:100%;white-space:pre-wrap;word-break:break-word;}` +
      // tool-call: the mock's bordered .toolrow with a green $ prompt, under a cyan '▸ tool' label.
      `.insrc-who--tool{color:var(--accent2);}` +
      `.insrc-toolrow{display:flex;gap:9px;align-items:flex-start;border:1px solid var(--border);border-radius:8px;background:#0a0d14;padding:8px 11px;max-width:100%;}` +
      `.insrc-toolrow__cmd{color:var(--fg-strong);white-space:pre-wrap;word-break:break-word;font-family:var(--font);}` +
      `.insrc-toolrow__prompt{color:var(--accent);}` +
      // rendered markdown reads as "rendered": the sans face, mock spacing, cyan inline code chips.
      // The markdown element rules now live in ONE place — markdown-style.ts — because
      // the docs-review surface renders marked output too (S001/t4). Extracted, not
      // copied: emitted output here is byte-identical to the previous inline rules,
      // verified by a dedicated test, and this surface keeps its own `:root` palette.
      renderMarkdownStyle(CHAT_MARKDOWN_TOKENS) +
      // JSON widget: a bordered code surface with key/value/punct tones (mock .jsonw).
      `.insrc-json{font-family:var(--font);border:1px solid var(--border);border-radius:8px;background:#0a0d14;padding:8px 11px;font-size:12.5px;line-height:1.55;}` +
      `.insrc-json .insrc-json-key{color:var(--accent2);}.insrc-json .insrc-json-val{color:var(--accent);}.insrc-json .insrc-json-punct{color:var(--dim);}` +
      `.insrc-caption{color:var(--muted);cursor:default;font-size:11px;letter-spacing:.05em;text-transform:uppercase;}` +
      `</style>`;
    const provCls = surfaceClass('provider-dropdown');
    const histCls = surfaceClass('history-dropdown');
    const diffCls = surfaceClass('inline-diff'); // S006: sc1 'inline-diff' surface for the chat-view diff
    // S005: provider <option>s are rendered server-side from providers.available (the
    // installed claude/codex set is fixed per panel, k4) so NO new sc3 message is needed;
    // values are attribute-escaped. Empty available -> the selector is disabled.
    const available = deps.providers.available;
    // No placeholder: the select shows the ACTIVE session's provider (set from history-list on
    // restore); picking a different provider starts a new chat with it.
    const providerOpts = available.map((p) => `<option value="${attr(p)}">${attr(p)}</option>`).join('');
    const provDisabled = available.length === 0 ? ' disabled' : '';
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
      `reg.onSelectionDecision(function(requestId,selected){vs.postMessage({v:1,payload:{type:'selection-decision',requestId:requestId,selected:selected}});});` +
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
      `function setRunning(r){running=r;if(sendBtn){sendBtn.textContent=r?'\\u25a0':'\\u276f';sendBtn.className=r?'stop':'';sendBtn.setAttribute('aria-label',r?'stop':'send');}}` +
      // S002 ac3/lc1: the single live-only progress widget. setProgress shows + updates the ONE
      // #insrc-progress label (gated on running by the caller); hideProgress hides it. It is never
      // written to the transcript (the host status-skip stays as-is, k4).
      `const prog=document.getElementById('insrc-progress');` +
      `const progLabel=prog?prog.querySelector('.plabel'):null;` +
      `const progElapsed=document.getElementById('insrc-elapsed');` +
      // S001 (bugfix): the mock's live elapsed timer (m:ss). Starts on the first setProgress of a turn,
      // ticks each second, and is cleared when the widget hides (done/error/cancel).
      `var progT0=0,progTimer=null;` +
      `function fmtElapsed(ms){var s=Math.floor(ms/1000);var m=Math.floor(s/60);var ss=s%60;return m+':'+(ss<10?'0':'')+ss;}` +
      `function tickElapsed(){if(progElapsed)progElapsed.textContent=fmtElapsed(Date.now()-progT0);}` +
      `function setProgress(text){if(prog){prog.hidden=false;if(progLabel)progLabel.textContent=text;if(!progTimer){progT0=Date.now();tickElapsed();progTimer=setInterval(tickElapsed,1000);}}}` +
      `function hideProgress(){if(prog)prog.hidden=true;if(progTimer){clearInterval(progTimer);progTimer=null;}if(progElapsed)progElapsed.textContent='';}` +
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
      // renderDiff: one row per hunk line via textContent (no innerHTML); add/remove/context
      // class by the +/-/space prefix computeDiff wrote. In review mode append accept/reject
      // buttons that post edit-decision for this path.
      `function renderDiff(path,diff,review){var box=document.createElement('div');box.className=${JSON.stringify(diffCls)};var hdr=document.createElement('div');hdr.className='insrc-diff-path';hdr.textContent=path;box.appendChild(hdr);var hunks=(diff&&diff.hunks)||[];hunks.forEach(function(h){(h.lines||[]).forEach(function(ln){var d=document.createElement('div');var c=ln.charAt(0);d.className=c==='+'?'insrc-diff-add':c==='-'?'insrc-diff-del':'insrc-diff-ctx';d.textContent=ln;box.appendChild(d);});});if(review){var bar=document.createElement('div');bar.className='insrc-diff-actions';var ok=document.createElement('button');ok.textContent='accept';ok.addEventListener('click',function(){vs.postMessage({v:1,payload:{type:'edit-decision',path:path,accept:true}});bar.remove();});var no=document.createElement('button');no.textContent='reject';no.addEventListener('click',function(){vs.postMessage({v:1,payload:{type:'edit-decision',path:path,accept:false}});bar.remove();});bar.appendChild(ok);bar.appendChild(no);box.appendChild(bar);}pager.append(box);}` +
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
      `if(ev&&(ev.kind==='done'||ev.kind==='error')){setRunning(false);hideProgress();}}` +
      // S006: an edit-prompt carries the computed diff + the HOST's review flag -> render it
      // (+ accept/reject controls only when the host says review; never gated on local state).
      // ISSUE-6a811b8a: more requests queued behind the shown card — update its '1 of N' in place.
      `else if(m.type==='approval-position'){reg.approvalPosition(m.requestId,m.position,m.total);}` +
      `else if(m.type==='edit-prompt'){pager.track(undefined,function(){renderDiff(m.path,m.diff,m.review===true);});}` +
      // Story E20261012ddc4ede1:S001: an older page the reader asked for; the pager puts it above
      // the held rows and keeps the reader's place (a page it did not ask for is discarded).
      `else if(m.type==='transcript-page'){pager.prepend(m);}` +
      // S001 ac1/lc1: the live user-row echo — reconciled to ONE row via its stable key.
      `else if(m.type==='user-row'){pager.track(m.rowIndex,function(){reg.appendKeyed(reg.toViewModel({role:'user',text:m.text}),m.key);});}` +
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
      `_rows.forEach(function(x,i){pager.track(_first+i,function(){reg.appendKeyed(reg.toViewModel(x),'r'+(_first+i));});});hs.value=cur;setRunning(false);hideProgress();` +
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
      `function doSubmit(){if(!box.value.trim())return;vs.postMessage({v:1,payload:{type:'submit-turn',text:box.value}});box.value='';setRunning(true);setProgress('working\\u2026');setProvLock(true);}` +
      `box.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){doSubmit();}});` +
      // A user cancel posts cancel-turn AND resets the UI locally: the host reap posts no terminal
      // event, so the webview must clear running + hide the progress widget itself (no stuck spinner).
      `if(sendBtn)sendBtn.addEventListener('click',function(){if(running){vs.postMessage({v:1,payload:{type:'cancel-turn'}});setRunning(false);hideProgress();}else{doSubmit();}});` +
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
      // Fixed header (mock .chrome): dot + insrc + ONLY the session dropdown, right-aligned. The
      // ISSUE-6ae99f6e fix keeps the header to a single control: the #insrc-history session switcher
      // (its selected option already shows the session — the old 'session' label + active-name text were
      // duplication). The provider + mode selects live in the footer status bar now.
      `<div class="chrome">` +
      `<span class="dot"></span><span class="title">insrc</span>` +
      `<span class="right"><select id="insrc-history" class="segsel ${histCls}" aria-label="session"><option value="">new…</option></select></span>` +
      `</div>` +
      // Full-width bars (mock): the scrolling transcript, then the live progress bar, then the input
      // bar — each a flex:0 band with its own top border + inset ground, NOT inset inside a .pad.
      // Story E20261012ddc4ede1:S001: the 'load earlier' bar (the pager fills and shows it).
      `<div id="insrc-older" role="button" tabindex="0" aria-label="load earlier messages"></div>` +
      `<div id="insrc-term" class="term"></div>` +
      // S002 ac3: the single animated progress widget above the input (live-only). Mock: 3 blinking
      // dots + a label + a right-aligned elapsed timer; hidden until a turn runs.
      `<div id="insrc-progress" class="progress" hidden><span class="spin"><i></i><i></i><i></i></span><span class="plabel"></span><span class="elapsed" id="insrc-elapsed"></span></div>` +
      `<div class="inputbar">` +
      // S002 (ux-polish): the leading '>' prompt IS the send/stop control (glyph + class set by
      // setRunning: ❯ green Send / ■ red Stop). role=button + tabindex make the span a keyboard-
      // reachable control; the separate trailing send button is retired (one send affordance).
      `<span id="insrc-prompt" role="button" tabindex="0" aria-label="send">❯</span>` +
      `<textarea id="insrc-input" rows="2" aria-label="message" placeholder="message claude… (⌘↵ send · ^C interrupt)"></textarea>` +
      `</div>` +
      // Status bar (mock .statusbar): ISSUE-6ae99f6e — the FUNCTIONAL provider + mode selects live here
      // now, left-to-right (provider, then the 'edits' approval-mode). Same ids/options/classes as before
      // so their change-handlers + the pmode/updatePermSeg wiring bind unchanged; the mode seg keeps id
      // 'insrc-modeseg' (pmseg) so the amber auto pill still styles. No read-only session/edits mirror and
      // no '✓ idle' marker — the session is shown by the header dropdown and idle/busy by the progress bar.
      `<div class="statusbar">` +
      `<span class="seg"><select id="insrc-provider" class="segsel ${provCls}" aria-label="provider"${provDisabled}>${providerOpts}</select></span>` +
      `<span class="seg" id="insrc-modeseg">edits <select id="insrc-mode" class="segsel ${provCls}" aria-label="mode"><option value="manual">Manual</option><option value="edit-auto">Edit Automatically</option><option value="auto">Auto</option></select></span>` +
      `</div>` +
      `</div>` +
      `<script nonce="${nonce}">${MARKED_SRC}\n;${bootstrap}</script></body></html>`
    );
  };

  async function runTurn(text: unknown, allowedTools?: readonly string[], opts?: { readonly suppressEcho?: boolean | undefined }): Promise<void> {
    if (typeof text !== 'string') return; // malformed submit-turn -> no-op (never throws)
    const prompt = text.trim();
    if (prompt === '' || session === undefined) return; // empty submit is a no-op

    const s = session;

    s.transcript.push({ role: 'user', text: prompt, at: now() });
    // S001 ac1/lc1: echo the user's prompt LIVE so it appears during the turn (not only on a
    // later session-restored replay). ONE append is both the durable row and the live echo —
    // its key is the row's transcript index, so the live row and its replay reconcile to a
    // single rendered row webview-side (the stored transcript shape is unchanged, k4).
    // S003 (dev-chat ux polish) ac2: a SYNTHESIZED grant re-run (from an Approve) passes
    // suppressEcho so the internal "Approved — run exactly this now: …" prompt is NOT echoed as a
    // user bubble (only the resolved permission-outcome chip is shown). A normal submit still echoes.
    if (opts?.suppressEcho !== true) {
      post({ type: 'user-row', text: prompt, key: `r${s.transcript.length - 1}`, rowIndex: s.transcript.length - 1 });
    }
    // S005: name the chat from its FIRST user prompt (clipped) so the history dropdown
    // rows are distinguishable; a whitespace-only prompt is already rejected above, so
    // the clip is non-empty. Later turns keep the established title.
    if (s.transcript.filter((r) => r.role === 'user').length === 1) {
      const derived = prompt.replace(/\s+/g, ' ').trim().slice(0, 60);
      if (derived !== '') s.title = derived;
      // Then ask the LLM for a better title in the background (keeps `derived` on failure).
      void applyTitle(s, prompt);
    }
    trySave(s); // runTurn is fired and forgotten: a failing save must not become an unhandled rejection

    const grant = allowedTools && allowedTools.length > 0 ? { allowedTools } : {};
    const req = s.nativeSessionId !== undefined
      ? { provider: s.provider, prompt, cwd: deps.cwd(), permissionMode, ...grant, resume: { provider: s.provider, nativeSessionId: s.nativeSessionId } }
      : { provider: s.provider, prompt, cwd: deps.cwd(), permissionMode, ...grant };

    const sink: TurnSink = {
      onWaiting: () => post({ type: 'turn-event', event: { kind: 'status', turnId: 'waiting', phase: 'waiting' } }),
      // S006: capture the pre-turn baseline BEFORE the CLI can write (governor.beginTurn), so the
      // diff + revert are computed against the true pre-turn content (k8 observer).
      // S001 (bugfix): the merged chat mode now governs edits (via claude's permission flags), so the
      // governor runs visualize-only — it renders diffs but no longer gates with accept/reject (the
      // separate edit-review gate is retired, Claude-Code style).
      beforeRun: async () => {
        if (governor !== undefined) await governor.beginTurn({ mode: 'auto', cwd: deps.cwd() });
      },
      onEvent: (ev) => {
        // ISSUE-6a811b8a: an approval-request is queued, not posted; only the queue head is shown.
        // Story E20261012ddc4ede1:S001: write the row first, then post the event with its index.
        const rowIndex = appendEvent(s, ev);
        if (ev.kind === 'approval-request') enqueueApproval(ev);
        else postLive(ev, rowIndex);
        // ISSUE-6a811b8a: the turn's end lets its batch of turn-ended requests complete.
        if (ev.kind === 'done' || ev.kind === 'error') approvals.endTurn(ev.turnId);
        // S004 (dev-chat ux polish): remember a surfaced selection request's options (keyed by
        // requestId) so a later selection-decision can map the chosen ids back to labels.
        if (ev.kind === 'selection-request') {
          pendingSelections.set(ev.requestId, { options: ev.options });
        }
        // S006: an observed file-edit -> the governor computes + renders its own diff
        // (auto: visualize-only; review: track for accept/reject). Fire-and-forget so
        // the incremental turn loop never blocks on git/fs IO.
        if (governor !== undefined && ev.kind === 'file-edit') governor.observe(ev.path).catch((err: unknown) => warnGovernor('observe', err));
      },
      onTerminal: () => {
        runCompletedBatch(); // ISSUE-6a811b8a: requests decided before the turn ended are now complete
        trySave(s); // persist the turn's transcript rows (an errored turn's too); a failing save never breaks the turn
        if (governor !== undefined) governor.resolveTurn().catch((err: unknown) => warnGovernor('resolveTurn', err));
        postHistory(); // S005: title/updatedAt changed -> refresh the history dropdown
      },
      onError: (message, turnId) => post({ type: 'turn-event', event: { kind: 'error', turnId, message } }),
    };
    // Single-in-flight per panel: the newest message wins. start drops a turn still waiting for
    // the lock and stops the previous turn posting (the transcript never interleaves); the previous
    // turn's process is NOT killed: this turn waits for it.
    await turns.start(s, req, sink);
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
        postInitialState();
        return;
      case 'submit-turn':
        if (typeof msg.text === 'string' && msg.text.trim() !== '') supersedeQueuedApprovals();
        void runTurn(msg.text);
        return;
      case 'cancel-turn':
        // S002 ac2: the Stop control cancels the in-flight turn via the existing reap.
        // Idempotent when no turn is active (stop() no-ops).
        rejectQueuedApprovals(); // ISSUE-6a811b8a: Stop rejects the requests still waiting
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
        void turns.detach();
        turns.invalidate();
        dropQueuedApprovals(); // ISSUE-6a811b8a: a chat switch drops the waiting requests
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
        void turns.detach();
        turns.invalidate();
        dropQueuedApprovals(); // ISSUE-6a811b8a: a chat switch drops the waiting requests
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
        changePending(sessionId, async (list) => {
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
            list.push({ ref: await att.store.addBytes(sessionId, { name, mime, bytes }), clientId });
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
          changePending(sessionId, async (list) => {
            const errors: string[] = [];
            const room = Math.max(0, MAX_ATTACHMENTS_PER_MESSAGE - list.length);
            for (const path of paths.slice(0, room)) {
              try {
                list.push({ ref: await att.store.addFile(sessionId, path) });
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
  const wireChannel = (ch: ChatPanelChannel): void => {
    disposed = false;
    channel = ch;
    channel.onDidDispose(() => {
      void turns.detach();
      dropQueuedApprovals();
      disposed = true;
      channel = undefined;
    });
    channel.onMessage(handleMessage);
    channel.setHtml(renderShell());
    postInitialState();
  };

  return {
    open(): void {
      disposed = false;
      if (channel !== undefined) {
        channel.reveal();
        return;
      }
      wireChannel(deps.createPanel({ viewType: VIEW_TYPE, title: 'insrc chat' }));
    },
    adopt(ch: ChatPanelChannel): void {
      // A restored panel arrived. Supersede any live channel (kill its in-flight turn + dispose
      // it) so exactly one channel remains, then wire the restored one in place.
      if (channel !== undefined) {
        void turns.detach();
        try {
          channel.dispose();
        } catch {
          /* already disposed */
        }
        channel = undefined;
      }
      wireChannel(ch);
    },
    dispose(): void {
      void turns.detach();
      dropQueuedApprovals();
      disposed = true;
      channel?.dispose();
      channel = undefined;
    },
  };
}
