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
import type { ProviderRegistry, ProviderId, TurnCursor, TurnProcess } from './cli-adapter.js';
import { createMemorySessionLocks, defaultIsAlive, defaultProcessStartTime, LockWaitAborted, LockWaitSuperseded, runLeased, type SessionLease, type SessionLocks } from './session-lock.js';
// S001 (bugfix): a value import — the pure classifier that tells a tool-permission gate apart from
// a working-directory / sandbox-allowlist block (the two must not share an Approve path).
import { classifyPermissionDenial } from './cli-adapter.js';
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
}

/** How often a running turn's cursor (and transcript) is saved at most. */
const CURSOR_SAVE_MS = 500;

/** insrc.chat.turnLockTimeoutMs default: 10 minutes. */
export const DEFAULT_TURN_LOCK_TIMEOUT_MS = 600_000;

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
  let activeTurnId: string | undefined;
  let activeProvider: import('./cli-adapter.js').ProviderId | undefined;
  let activeIterator: AsyncIterator<TurnEvent> | undefined;
  let generation = 0;
  const locks = deps.sessionLocks ?? createMemorySessionLocks({ logger: log });
  const hostPid = deps.hostPid ?? process.pid;
  const startTime = deps.processStartTime ?? defaultProcessStartTime;
  const isAlive = deps.isAlive ?? defaultIsAlive;
  // Turns this host is reading live (runTurn); a saved cursor for one of them is not resumed.
  const runningTurns = new Set<string>();
  // The saved turn this host is following after a reload (resume), if any.
  let following: { readonly sessionId: string; readonly ctl: AbortController } | undefined;
  let resumedProc: TurnProcess | undefined;
  // Detaches from the live turn (stops reading, leaves its process running) — set while one runs.
  let detachLive: (() => void) | undefined;
  /** Forgets which turn the panel is reading live (the one place these refs are reset together). */
  const clearLiveRefs = (): void => {
    activeIterator = undefined;
    activeProvider = undefined;
    activeTurnId = undefined;
  };
  /** Persists a session; a persistence failure is logged and never breaks a turn. */
  const trySave = (target: ChatSession): void => {
    try {
      deps.store.save(target);
    } catch (err) {
      log.warn(`[chat] session ${target.id} not saved: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const lockTimeoutMs = (): number => deps.turnLockTimeoutMs?.() ?? DEFAULT_TURN_LOCK_TIMEOUT_MS;
  // The wait of a turn that is queued behind the session's previous process; aborting it drops
  // the turn without stopping anything (a newer submit, Stop, a chat switch).
  let waitCtl: AbortController | undefined;
  // The newest CLI process this host started; kept until it exits, even after its answer, so Stop
  // can end a process that is still running in the background.
  let liveProc: TurnProcess | undefined;
  // S001 (bugfix): the SINGLE chat mode (Manual / Edit Automatically / Auto). It is now a PERSISTED
  // per-session preference: it tracks the ACTIVE session's stored mode (synced on open/switch/
  // restore) and is applied to the NEXT turn's buildArgs. Default 'manual' so tool use surfaces as
  // in-chat approval cards (never silently blocked).
  let permissionMode: PermissionMode = 'manual';
  // Normalize a session's stored mode (optional/back-compat/corrupt -> 'manual').
  const modeOf = (s: ChatSession | undefined): PermissionMode =>
    s !== undefined && (s.mode === 'edit-auto' || s.mode === 'auto' || s.mode === 'manual') ? s.mode : 'manual';
  // S001 (bugfix): pending review-mode permission requests, requestId -> the request's grant facts.
  // Populated when a turn surfaces an approval-request (claude's `system/permission_denied`, which
  // also ENDS the turn). `toolName` is the tool to pre-allow; `command` (when present) is the exact
  // command to name in the grant re-run; `blockKind` tells a tool-permission gate (Approve re-runs
  // with the tool pre-allowed) apart from a working-dir / sandbox-allowlist block (Approve cannot
  // grant a directory — it posts an informational message instead). Cleared on decision.
  const pendingPerms = new Map<string, { toolName: string; command?: string; blockKind: 'tool-gate' | 'dir-block' }>();
  // S004 (dev-chat ux polish): pending selection requests, requestId -> the widget's options.
  // Populated when a turn surfaces a selection-request (parsed from an `insrc:select` marker),
  // consumed by a selection-decision to map the chosen ids back to labels. Cleared on decision.
  const pendingSelections = new Map<string, { options: ReadonlyArray<{ id: string; label: string }> }>();

  const post = (msg: HostToWebview): void => {
    if (disposed || channel === undefined) return;
    channel.postMessage(envelope(msg));
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

  // S005: (re)post the extension-local chat history so the webview history-dropdown stays current.
  const postHistory = (): void => post({ type: 'history-list', chats: [...deps.store.list()] });

  // S003 (dev-chat ux polish): record a resolved permission decision. Mirrors the tool-result
  // dual persist+render path (appendEvent): emit it LIVE as a turn-event the webview renders via the
  // registry (a resolved chip), AND persist it STRUCTURALLY as a role:'permission-outcome' transcript
  // row (+ save) so a restored session shows the decided chip instead of the live-only approval card.
  const recordPermissionOutcome = (toolName: string, approved: boolean, requestId: string): void => {
    const decision: 'approved' | 'rejected' = approved ? 'approved' : 'rejected';
    post({ type: 'turn-event', event: { kind: 'permission-outcome', turnId: `perm-${requestId}`, toolName, decision } });
    if (session !== undefined) {
      session.transcript.push({ role: 'permission-outcome', toolName, decision, at: now() });
      deps.store.save(session);
    }
  };

  // S004 (dev-chat ux polish): record a resolved selection. Mirrors recordPermissionOutcome — emit
  // it LIVE as a turn-event the webview renders via the registry (a resolved chip), AND persist it
  // STRUCTURALLY as a role:'selection-outcome' transcript row (+ save) so a restored session shows the
  // decided chip instead of the live-only widget. `chosen` carries the LABELS (host-resolved from ids).
  const recordSelectionOutcome = (requestId: string, chosen: readonly string[]): void => {
    post({ type: 'turn-event', event: { kind: 'selection-outcome', turnId: `sel-${requestId}`, chosen } });
    if (session !== undefined) {
      session.transcript.push({ role: 'selection-outcome', chosen: [...chosen], at: now() });
      deps.store.save(session);
    }
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
    const live = s.liveTurn;
    if (live === undefined || following?.sessionId === s.id || runningTurns.has(live.cursor.turnId)) return;
    if (live.ownerHostPid !== hostPid && isAlive(live.ownerHostPid)) return; // another window follows it
    let adapter;
    try {
      adapter = deps.providers.get(s.provider);
    } catch {
      return;
    }
    if (typeof adapter.resume !== 'function') return;
    s.liveTurn = { ...live, ownerHostPid: hostPid };
    trySave(s);
    const ctl = new AbortController();
    following = { sessionId: s.id, ctl };
    let lastSave = Date.now();
    const turnId = live.cursor.turnId;
    void (async () => {
      try {
        const events = adapter.resume(
          { cursor: { sessionId: s.id, ...live.cursor }, pid: live.pid, startedAt: live.startedAt ?? null },
          {
            signal: ctl.signal,
            onAttach: (p) => {
              resumedProc = p;
            },
            onProgress: (c) => {
              if (s.liveTurn?.cursor.turnId !== c.turnId) return;
              s.liveTurn = { ...s.liveTurn, cursor: { turnId: c.turnId, generation: c.generation, offset: c.offset } };
              if (Date.now() - lastSave >= CURSOR_SAVE_MS) {
                lastSave = Date.now();
                trySave(s);
              }
            },
          },
        );
        for await (const ev of events) {
          if (ctl.signal.aborted) break;
          if (!disposed && session === s) post({ type: 'turn-event', event: ev });
          appendEvent(s, ev);
          if (ev.kind === 'done' && ev.sessionId !== undefined) s.nativeSessionId = ev.sessionId;
          if (ev.kind === 'done' || ev.kind === 'error') break;
        }
        if (!ctl.signal.aborted) {
          if (s.liveTurn?.cursor.turnId === turnId) delete s.liveTurn;
          trySave(s);
          if (session === s) postHistory();
        }
      } catch (err) {
        log.warn(`[chat] session ${s.id}: could not resume turn ${turnId}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (following?.ctl === ctl) following = undefined;
        resumedProc = undefined;
      }
    })();
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
    post({ type: 'session-restored', sessionId: session.id, transcript: session.transcript, mode: permissionMode });
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
    deps.store.save(target);
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
      `function line(s,cls){const d=document.createElement('div');if(cls)d.className=cls;d.textContent=s;t.appendChild(d);t.scrollTop=t.scrollHeight;return d;}` +
      // S004: the marker mapper, single-sourced with the host markerFor (markers.ts), embedded in THIS one nonce'd script.
      `const markerFor=${markerWebviewSource()};` +
      // S001 sc1: the render registry, single-sourced with render-registry.ts, embedded in THIS one nonce'd script.
      // line() is pre-registered as the 'fallback' renderer; t4/S003/S004 register the concrete row renderers.
      `const reg=(${renderRegistryWebviewSource()})(document,line);` +
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
      `function renderDiff(path,diff,review){var box=document.createElement('div');box.className=${JSON.stringify(diffCls)};var hdr=document.createElement('div');hdr.className='insrc-diff-path';hdr.textContent=path;box.appendChild(hdr);var hunks=(diff&&diff.hunks)||[];hunks.forEach(function(h){(h.lines||[]).forEach(function(ln){var d=document.createElement('div');var c=ln.charAt(0);d.className=c==='+'?'insrc-diff-add':c==='-'?'insrc-diff-del':'insrc-diff-ctx';d.textContent=ln;box.appendChild(d);});});if(review){var bar=document.createElement('div');bar.className='insrc-diff-actions';var ok=document.createElement('button');ok.textContent='accept';ok.addEventListener('click',function(){vs.postMessage({v:1,payload:{type:'edit-decision',path:path,accept:true}});bar.remove();});var no=document.createElement('button');no.textContent='reject';no.addEventListener('click',function(){vs.postMessage({v:1,payload:{type:'edit-decision',path:path,accept:false}});bar.remove();});bar.appendChild(ok);bar.appendChild(no);box.appendChild(bar);}t.appendChild(box);t.scrollTop=t.scrollHeight;}` +
      // S001 sc1/t4: the live turn-event append routes through reg.renderRow(reg.toViewModel(ev)).
      // assistant-delta -> assistant-text row (its actual text, ac2); tool-call -> tool-command row
      // (the real command inline, ac3). Every other kind keeps the sc1 marker path (markerFor ->
      // fallback), so status/file-edit/done/error render exactly as today and an unknown kind is skipped.
      // S002 ac3: a status event drives the SINGLE progress widget (gated on running) instead of a
      // transcript row — rapid phase changes update the one widget in place. assistant-delta/tool-call
      // still render via the sc1 view-model (S001); other markers still append. done/error hides the
      // widget + returns the button to ▶ (ac2). The host status-skip is untouched (lc1/k4).
      `window.addEventListener('message',e=>{const m=e.data&&e.data.payload;if(!m)return;if(m.type==='turn-event'){const ev=m.event;if(ev&&ev.kind==='status'){var mkp=markerFor(ev);if(running&&mkp)setProgress(mkp.label);}else if(ev&&(ev.kind==='assistant-delta'||ev.kind==='tool-call'||ev.kind==='tool-result'||ev.kind==='permission-outcome'||ev.kind==='selection-request'||ev.kind==='selection-outcome')){reg.renderRow(reg.toViewModel(ev));}` +
      // S004 ac1: a live approval-request renders the in-chat approve/deny card (the renderer
      // builds a detached node, so the handler appends it) — never a silent block.
      `else if(ev&&ev.kind==='approval-request'){var _c=reg.renderRow({kind:'approval',text:ev.title,collapsible:false,meta:{requestId:ev.requestId,title:ev.title,detail:ev.detail,toolName:ev.toolName}});if(_c){t.appendChild(_c);t.scrollTop=t.scrollHeight;}}` +
      `else{const mk=markerFor(ev);if(mk)reg.renderRow({kind:'fallback',text:mk.label,cssClass:mk.cssClass});}` +
      `if(ev&&(ev.kind==='done'||ev.kind==='error')){setRunning(false);hideProgress();}}` +
      // S006: an edit-prompt carries the computed diff + the HOST's review flag -> render it
      // (+ accept/reject controls only when the host says review; never gated on local state).
      `else if(m.type==='edit-prompt'){renderDiff(m.path,m.diff,m.review===true);}` +
      // S001 ac1/lc1: the live user-row echo — reconciled to ONE row via its stable key.
      `else if(m.type==='user-row'){reg.appendKeyed(reg.toViewModel({role:'user',text:m.text}),m.key);}` +
      // S005: session-restored CLEARS the terminal before replaying (so switching chats
      // does not append onto the prior chat's view) + tracks the active id for the dropdown.
      // S001 t5: the replay routes through the sc1 registry (reg.appendKeyed(reg.toViewModel(x)))
      // keyed by transcript index, so it single-sources rendering with the live path and carries
      // each row's stored cssClass (marker rows -> fallback with the class), and resetKeys() clears
      // the reconciliation map for the fresh replay.
      `else if(m.type==='session-restored'){cur=m.sessionId||'';t.textContent='';reg.resetKeys();(m.transcript||[]).forEach(function(x,i){reg.appendKeyed(reg.toViewModel(x),'r'+i);});hs.value=cur;setRunning(false);hideProgress();` +
      // S001 (bugfix): reflect the session's persisted mode in the mode control (follows the session).
      `if(m.mode&&pm){pmode=m.mode;pm.value=m.mode;updatePermSeg();}` +
      `setProvLock(((m.transcript||[]).length)>0);}` +
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

  /**
   * End the live turn's CLI process at once (no lock timeout) and drop a waiting turn. The reap is
   * cancel(turnId) through the turn's OWN captured provider (never the current session's, which
   * may have switched), plus the process handed over by onSpawn, which also covers a process still
   * running after its answer. Abandoning the async iterator (.return()) is best-effort cleanup.
   * Resolves once the process has exited (or there was none). Idempotent.
   */
  const stopLive = async (): Promise<void> => {
    waitCtl?.abort();
    waitCtl = undefined;
    detachLive = undefined;
    const it = activeIterator;
    const prov = activeProvider;
    const tid = activeTurnId;
    const proc = liveProc;
    clearLiveRefs();
    liveProc = undefined;
    if (it !== undefined) {
      try {
        void it.return?.(undefined);
      } catch {
        /* returning an already-finished iterator is a no-op */
      }
    }
    if (prov !== undefined && tid !== undefined) {
      try {
        await deps.providers.get(prov).cancel(tid);
      } catch {
        /* provider gone / already finished — nothing to cancel */
      }
    }
    if (proc !== undefined) {
      try {
        await proc.stop();
      } catch {
        /* already gone / not signalable — callers fire this and forget it */
      }
    }
  };

  /** Stop (the Stop control): end the live turn, and a turn followed after a reload, at once. */
  const stopActive = async (): Promise<void> => {
    following?.ctl.abort();
    const resumed = resumedProc;
    resumedProc = undefined;
    await stopLive();
    if (resumed !== undefined) await resumed.stop().catch(() => {});
  };

  /**
   * A chat switch, the panel closing, or adopt(): stop FOLLOWING the turn. A turn that writes to
   * the session file keeps running (with its lease) and its cursor stays saved, so showing the
   * session again resumes it. A pipe turn could not be resumed, so it is stopped as before.
   */
  const detachActive = async (): Promise<void> => {
    waitCtl?.abort();
    waitCtl = undefined;
    following?.ctl.abort(); // a resumed turn: its process is not ours to stop here
    resumedProc = undefined;
    const detach = detachLive;
    if (detach !== undefined && liveProc?.cursor !== undefined) {
      detachLive = undefined;
      liveProc = undefined;
      clearLiveRefs();
      detach();
      return;
    }
    await stopLive();
  };

  /**
   * One CLI process per session: waits until the session's previous process has exited (in this
   * window or another), stopping it only after the lock timeout, and shows the waiting state.
   * Undefined when the turn was dropped while waiting (newer submit / Stop / chat switch) or is
   * no longer current once granted — nothing is to run then.
   */
  async function acquireSessionLease(s: ChatSession, myGen: number): Promise<SessionLease | undefined> {
    const ctl = new AbortController();
    waitCtl = ctl;
    let lease: SessionLease;
    try {
      lease = await locks.acquire(s.id, {
        timeoutMs: lockTimeoutMs(),
        signal: ctl.signal,
        onWaiting: () => {
          log.warn(`[chat] session ${s.id}: waiting for the previous turn's process to exit`);
          if (!disposed && myGen === generation) post({ type: 'turn-event', event: { kind: 'status', turnId: 'waiting', phase: 'waiting' } });
        },
      });
    } catch (err) {
      // Dropped while waiting (newer submit / Stop / chat switch): nothing to run, nothing to say.
      if (err instanceof LockWaitAborted || err instanceof LockWaitSuperseded) return undefined;
      const message = `could not lock chat session: ${err instanceof Error ? err.message : String(err)}`;
      log.error(`[chat] session ${s.id}: ${message}`);
      if (!disposed && myGen === generation) post({ type: 'turn-event', event: { kind: 'error', turnId: 'none', message } });
      return undefined;
    } finally {
      if (waitCtl === ctl) waitCtl = undefined;
    }
    if (disposed || myGen !== generation) {
      lease.release();
      return undefined;
    }
    return lease;
  }

  async function runTurn(text: unknown, allowedTools?: readonly string[], opts?: { readonly suppressEcho?: boolean | undefined }): Promise<void> {
    if (typeof text !== 'string') return; // malformed submit-turn -> no-op (never throws)
    const prompt = text.trim();
    if (prompt === '' || session === undefined) return; // empty submit is a no-op

    // Single-in-flight per panel: the newest message wins. A turn still waiting for the lock is
    // dropped, and the generation bump stops the previous loop posting (the transcript never
    // interleaves). The previous turn's process is NOT killed: this turn waits for it below.
    waitCtl?.abort();
    waitCtl = undefined;
    const myGen = ++generation;
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
      post({ type: 'user-row', text: prompt, key: `r${s.transcript.length - 1}` });
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

    let adapter;
    try {
      adapter = deps.providers.get(s.provider);
    } catch {
      post({ type: 'turn-event', event: { kind: 'error', turnId: 'none', message: `no adapter for provider ${s.provider}` } });
      return;
    }

    const grant = allowedTools && allowedTools.length > 0 ? { allowedTools } : {};
    const req = s.nativeSessionId !== undefined
      ? { provider: s.provider, prompt, cwd: deps.cwd(), permissionMode, ...grant, resume: { provider: s.provider, nativeSessionId: s.nativeSessionId } }
      : { provider: s.provider, prompt, cwd: deps.cwd(), permissionMode, ...grant };

    const lease = await acquireSessionLease(s, myGen);
    if (lease === undefined) return;
    // runLeased releases the lease on every path unless a process was attached to it (then the
    // process's exit releases it): a failed spawn, an adapter without onSpawn, or a throw.
    await runLeased(lease, async (attachLease) => {
      // The lease follows the started process: it is released when that process exits, not
      // when its answer ends.
      const onSpawn = (proc: TurnProcess): void => {
        attachLease(proc);
        if (myGen === generation) liveProc = proc;
        const forget = (): void => {
          if (liveProc === proc) liveProc = undefined;
        };
        proc.exit.then(forget, forget);
        // The turn's output is kept in the session file: remember where it starts, owned by this
        // host, so a reloaded window can follow it from there.
        if (proc.cursor !== undefined) {
          const { turnId, generation: gen, offset } = proc.cursor;
          runningTurns.add(turnId);
          proc.exit.then(
            () => runningTurns.delete(turnId),
            () => runningTurns.delete(turnId),
          );
          s.liveTurn = {
            cursor: { turnId, generation: gen, offset },
            ownerHostPid: hostPid,
            ...(proc.pid !== undefined ? { pid: proc.pid, startedAt: startTime(proc.pid) ?? null } : {}),
          };
          saveCursorNow();
        }
      };
      // Save the cursor as lines are handled, together with the transcript rows they produced, so
      // the saved session is always a consistent snapshot. Throttled; the terminal event saves.
      let lastCursorSave = 0;
      const saveCursorNow = (): void => {
        lastCursorSave = Date.now();
        trySave(s);
      };
      const onProgress = (c: TurnCursor): void => {
        const live = s.liveTurn;
        if (live === undefined || live.cursor.turnId !== c.turnId) return;
        s.liveTurn = { ...live, cursor: { turnId: c.turnId, generation: c.generation, offset: c.offset } };
        if (Date.now() - lastCursorSave >= CURSOR_SAVE_MS) saveCursorNow();
      };
      /** At the turn's terminal event its output has been fully handled: forget its cursor. */
      const clearCursor = (turnId: string): void => {
        if (s.liveTurn?.cursor.turnId === turnId) delete s.liveTurn;
      };
      let detached = false;
      let detachThis: (() => void) | undefined;
      try {
        // S006: capture the pre-turn baseline BEFORE the CLI can write (governor.beginTurn),
        // so the diff + revert are computed against the true pre-turn content (k8 observer).
        // S001 (bugfix): the merged chat mode now governs edits (via claude's permission flags), so the
        // governor runs visualize-only — it renders diffs but no longer gates with accept/reject (the
        // separate edit-review gate is retired, Claude-Code style). Inside the try, so a failed
        // baseline capture or adapter start is a turn error and the lease is still released.
        if (governor !== undefined) await governor.beginTurn({ mode: 'auto', cwd: deps.cwd() });
        // Hold the iterator explicitly so stopLive() can .return() it even while it
        // is parked awaiting its first event.
        const iterator = adapter.run(req, { onSpawn, onProgress, sessionId: s.id })[Symbol.asyncIterator]();
        activeIterator = iterator;
        activeProvider = s.provider;
        detachThis = (): void => {
          detached = true;
          if (s.liveTurn !== undefined) runningTurns.delete(s.liveTurn.cursor.turnId); // resumable now
          trySave(s); // the cursor and the rows handled so far
          void iterator.return?.(undefined); // stop reading; the CLI keeps writing to the session file
        };
        if (myGen === generation) detachLive = detachThis;
        for (;;) {
          const next = await iterator.next();
          if (next.done === true || detached) break;
          // Superseded/disposed: post nothing more, but keep reading so the superseded turn's CLI
          // never stalls on a full pipe; its process (and the lease) end when it exits.
          if (disposed || myGen !== generation) {
            if (next.value.kind === 'done' || next.value.kind === 'error') {
              clearCursor(next.value.turnId);
              void iterator.return?.(undefined); // as on the live path: finish the generator
              break;
            }
            continue;
          }
          const ev = next.value;
          activeTurnId = ev.turnId;
          post({ type: 'turn-event', event: ev });
          appendEvent(s, ev);
          // S001 (bugfix): remember what an approval card is asking about, so Approve can re-run the
          // blocked action concretely (the exact command / tool pre-allowed) — and so a working-dir
          // block is branched away from the tool-grant path (classifyPermissionDenial).
          if (ev.kind === 'approval-request' && typeof ev.toolName === 'string' && ev.toolName !== '') {
            pendingPerms.set(ev.requestId, {
              toolName: ev.toolName,
              ...(ev.command !== undefined && ev.command !== '' ? { command: ev.command } : {}),
              blockKind: classifyPermissionDenial(ev.detail),
            });
          }
          // S004 (dev-chat ux polish): remember a surfaced selection request's options (keyed by
          // requestId) so a later selection-decision can map the chosen ids back to labels.
          if (ev.kind === 'selection-request') {
            pendingSelections.set(ev.requestId, { options: ev.options });
          }
          // S006: an observed file-edit -> the governor computes + renders its own diff
          // (auto: visualize-only; review: track for accept/reject). Fire-and-forget so
          // the incremental turn loop never blocks on git/fs IO.
          if (governor !== undefined && ev.kind === 'file-edit') void governor.observe(ev.path);
          if (ev.kind === 'done' || ev.kind === 'error') clearCursor(ev.turnId);
          if (ev.kind === 'done') {
            if (ev.sessionId !== undefined) s.nativeSessionId = ev.sessionId;
            deps.store.save(s);
            if (governor !== undefined) void governor.resolveTurn();
            postHistory(); // S005: title/updatedAt changed -> refresh the history dropdown
            void iterator.return?.(undefined); // finish the generator; the process is left to exit
            break;
          }
          if (ev.kind === 'error') {
            deps.store.save(s); // persist the errored turn's transcript rows too
            if (governor !== undefined) void governor.resolveTurn();
            postHistory(); // S005: a first-turn error still set the title -> refresh the dropdown label
            void iterator.return?.(undefined);
            break;
          }
        }
      } catch (err) {
        if (!disposed && myGen === generation) {
          post({ type: 'turn-event', event: { kind: 'error', turnId: activeTurnId ?? 'none', message: err instanceof Error ? err.message : String(err) } });
          trySave(s);
        }
      } finally {
        if (myGen === generation) clearLiveRefs();
        if (detachThis !== undefined && detachLive === detachThis) detachLive = undefined;
      }
    });
  }

  function appendEvent(s: ChatSession, ev: TurnEvent): void {
    if (ev.kind === 'assistant-delta') {
      s.transcript.push({ role: 'assistant', text: ev.text, at: now() });
      return;
    }
    // 'status' is a transient progress tick (thinking/streaming/tool/editing): it is
    // rendered LIVE in the webview (from the posted turn-event) but NOT persisted —
    // persisting every tick would bloat the durable transcript and replay as noise on
    // restore. The durable lifecycle facts (tool-call/file-edit/done/error) ARE kept.
    if (ev.kind === 'status') return;
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
      return;
    }
    // Durable markers are single-sourced through markerFor — the SAME mapper the webview
    // uses — so a host row and its live marker never drift. done now persists a marker row
    // (the S003 gap); an unmapped/future kind -> markerFor returns null -> no row.
    const marker = markerFor(ev);
    // S008: persist the sc1 cssClass alongside the label so a RESTORED chat reproduces
    // each marker's glyph + phosphor tone (identical to live) instead of plain text.
    if (marker !== null) {
      s.transcript.push({ role: 'marker', text: marker.label, cssClass: marker.cssClass, at: now() });
    }
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
        void runTurn(msg.text);
        return;
      case 'cancel-turn':
        // S002 ac2: the Stop control cancels the in-flight turn via the existing reap.
        // Idempotent when no turn is active (stopActive() no-ops).
        void stopActive();
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
        void detachActive();
        ++generation;
        // A DRAFT (unsaved): the new chat is not written to history until its first turn, so
        // repeatedly starting/abandoning new chats never leaves empty sessions behind.
        session = deps.store.draft(msg.provider);
        permissionMode = modeOf(session);
        post({ type: 'session-restored', sessionId: session.id, transcript: session.transcript, mode: permissionMode });
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
        void detachActive();
        ++generation;
        session = s;
        permissionMode = modeOf(s); // S001 (bugfix): the mode follows the opened session
        post({ type: 'session-restored', sessionId: s.id, transcript: s.transcript, mode: permissionMode });
        postHistory(); // S005: keep the dropdown selection/order in sync
        followLiveTurn(s);
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
        if (governor !== undefined) void governor.decide(msg.path, msg.accept);
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
        const pending = pendingPerms.get(msg.requestId);
        if (pending !== undefined) {
          pendingPerms.delete(msg.requestId);
          // S003 (dev-chat ux polish): record the resolved outcome (approve AND deny) as a persisted,
          // live-rendered chip — including the dir-block approve branch, which posts no grant re-run.
          recordPermissionOutcome(pending.toolName, msg.decision === 'approve', msg.requestId);
          if (msg.decision === 'approve') {
            if (pending.blockKind === 'dir-block') {
              // A working-dir / sandbox-allowlist block: --allowedTools cannot grant a directory,
              // so DON'T re-run (that produced the confused no-op). Post a self-contained
              // informational message explaining what actually needs to change — no adapter/argv/
              // allowlist touched (buildArgs still adds only --allowedTools, never --add-dir).
              const tid = `info-${msg.requestId}`;
              post({
                type: 'turn-event',
                event: {
                  kind: 'assistant-delta',
                  turnId: tid,
                  text:
                    `This action was blocked because its path is outside this session's allowed working directories. ` +
                    `Approving cannot grant it — the directory must be added to the session's allowed working directories first ` +
                    `(this is a sandbox/workspace setting, not a tool permission).`,
                },
              });
              post({ type: 'turn-event', event: { kind: 'done', turnId: tid, ok: true } });
            } else if (typeof pending.command === 'string' && pending.command !== '') {
              // A tool-permission gate WITH a concrete command: re-run naming the EXACT command so the
              // resumed model has an unambiguous action (not a vague "please proceed" nudge).
              // S003 (ux polish) ac2: suppressEcho so the synthetic grant prompt is not echoed as a
              // user bubble — only the resolved permission-outcome chip marks the approval.
              void runTurn(`Approved — run exactly this now: ${pending.command}`, [pending.toolName], { suppressEcho: true });
            } else {
              // A tool-permission gate with no captured command: fall back to today's tool-name phrasing.
              void runTurn(`Approved: please proceed with the ${pending.toolName} action you requested permission for.`, [pending.toolName], { suppressEcho: true });
            }
          }
          return;
        }
        // Otherwise a provider that DOES answer in-turn (control-protocol / codex): relay to the
        // LIVE turn's captured adapter. decide() no-ops on an unknown/stale/dead requestId.
        if (activeProvider === undefined || activeTurnId === undefined) return;
        try {
          deps.providers.get(activeProvider).decide(activeTurnId, msg.requestId, msg.decision);
        } catch {
          /* adapter gone / provider unavailable — the decision is undeliverable, never throw */
        }
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
      void detachActive();
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
        void detachActive();
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
      void detachActive();
      disposed = true;
      channel?.dispose();
      channel = undefined;
    },
  };
}
