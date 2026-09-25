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
import { envelope, type WebviewToHost, type HostToWebview } from './protocol.js';
import type { ProviderRegistry } from './cli-adapter.js';
import type { ChatSessionStore, ChatSession } from './session-store.js';
import type { TurnEvent } from './stream-events.js';

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
}

export interface ChatPanelHost {
  open(): void;
  dispose(): void;
}

const VIEW_TYPE = 'insrc.chatPanel';
const NOOP_LOGGER: ChatPanelLogger = { warn: () => {}, error: () => {} };

/** Escape a value for safe embedding in an HTML attribute / the CSP meta content. */
function attr(v: string): string {
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

  const post = (msg: HostToWebview): void => {
    if (disposed || channel === undefined) return;
    channel.postMessage(envelope(msg));
  };

  // S005: (re)post the extension-local chat history so the webview history-dropdown stays current.
  const postHistory = (): void => post({ type: 'history-list', chats: [...deps.store.list()] });

  const renderShell = (): string => {
    const nonce = genNonce();
    const style = renderStyle(theme); // a complete <style>…</style>
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    const cls = surfaceClass('chat');
    const provCls = surfaceClass('provider-dropdown');
    const histCls = surfaceClass('history-dropdown');
    // S005: provider <option>s are rendered server-side from providers.available (the
    // installed claude/codex set is fixed per panel, k4) so NO new sc3 message is needed;
    // values are attribute-escaped. Empty available -> the selector is disabled.
    const available = deps.providers.available;
    const providerOpts = ['<option value="">provider…</option>']
      .concat(available.map((p) => `<option value="${attr(p)}">${attr(p)}</option>`))
      .join('');
    const provDisabled = available.length === 0 ? ' disabled' : '';
    const bootstrap =
      `const vs=acquireVsCodeApi();` +
      `const t=document.getElementById('insrc-term');` +
      // S004: line() widened to carry an optional sc1 marker class (className only; still textContent, no innerHTML).
      `function line(s,cls){const d=document.createElement('div');if(cls)d.className=cls;d.textContent=s;t.appendChild(d);t.scrollTop=t.scrollHeight;}` +
      // S004: the marker mapper, single-sourced with the host markerFor (markers.ts), embedded in THIS one nonce'd script.
      `const markerFor=${markerWebviewSource()};` +
      // S005: provider-selector + history-dropdown wiring (same one nonce'd script).
      `var cur='';` +
      `const ps=document.getElementById('insrc-provider');` +
      `const hs=document.getElementById('insrc-history');` +
      `ps.addEventListener('change',function(){if(ps.value){vs.postMessage({v:1,payload:{type:'new-chat',provider:ps.value}});ps.value='';}});` +
      `hs.addEventListener('change',function(){if(hs.value){vs.postMessage({v:1,payload:{type:'open-chat',chatId:hs.value}});}});` +
      `window.addEventListener('message',e=>{const m=e.data&&e.data.payload;if(!m)return;if(m.type==='turn-event'){const ev=m.event;if(ev&&ev.kind==='assistant-delta'){line(ev.text);}else{const mk=markerFor(ev);if(mk)line(mk.label,mk.cssClass);}}` +
      // S005: session-restored CLEARS the terminal before replaying (so switching chats
      // does not append onto the prior chat's view) + tracks the active id for the dropdown.
      `else if(m.type==='session-restored'){cur=m.sessionId||'';t.textContent='';(m.transcript||[]).forEach(x=>line(x.text));hs.value=cur;}` +
      // S005: history-list (re)populates the dropdown; labels via textContent (no innerHTML); keep active selected.
      `else if(m.type==='history-list'){while(hs.options.length>1)hs.remove(1);(m.chats||[]).forEach(function(c){var o=document.createElement('option');o.value=c.id;o.textContent='['+c.provider+'] '+(c.title||c.id);hs.appendChild(o);});hs.value=cur;}});` +
      `const box=document.getElementById('insrc-input');` +
      `box.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){vs.postMessage({v:1,payload:{type:'submit-turn',text:box.value}});box.value='';}});`;
    return (
      `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      `<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">` +
      `${style}</head>` +
      `<body class="${cls}">` +
      `<div class="insrc-term-controls">` +
      `<select id="insrc-provider" class="${provCls}" aria-label="provider"${provDisabled}>${providerOpts}</select>` +
      `<select id="insrc-history" class="${histCls}" aria-label="history"><option value="">history…</option></select>` +
      `</div>` +
      `<div id="insrc-term"></div>` +
      `<textarea id="insrc-input" rows="2" aria-label="message"></textarea>` +
      `<script nonce="${nonce}">${bootstrap}</script></body></html>`
    );
  };

  /**
   * Stop the in-flight turn (supersede or dispose). The reliable reap is
   * cancel(turnId) through the turn's OWN captured provider (never the current
   * session's, which may have switched after a new-chat/open-chat). Abandoning the
   * async iterator (.return()) is best-effort cleanup that applies when the adapter
   * generator next settles at a yield. LIMITATION: a turn that has emitted NO event
   * yet has no known turnId, so it cannot be force-cancelled here — real claude/codex
   * emit a session-init event within ms, so activeTurnId is set almost immediately;
   * a pathological zero-output hang is reaped only when its stream finally settles.
   * Idempotent.
   */
  const cancelActive = (): void => {
    const it = activeIterator;
    const prov = activeProvider;
    const tid = activeTurnId;
    activeIterator = undefined;
    activeProvider = undefined;
    activeTurnId = undefined;
    if (it !== undefined) {
      try {
        void it.return?.(undefined);
      } catch {
        /* returning an already-finished iterator is a no-op */
      }
    }
    if (prov !== undefined && tid !== undefined) {
      try {
        deps.providers.get(prov).cancel(tid);
      } catch {
        /* provider gone / already finished — nothing to cancel */
      }
    }
  };

  async function runTurn(text: unknown): Promise<void> {
    if (typeof text !== 'string') return; // malformed submit-turn -> no-op (never throws)
    const prompt = text.trim();
    if (prompt === '' || session === undefined) return; // empty submit is a no-op

    // Single-in-flight: supersede any prior turn (kill it + bump generation) so the
    // stale loop stops posting — the transcript never interleaves.
    cancelActive();
    const myGen = ++generation;
    const s = session;

    s.transcript.push({ role: 'user', text: prompt, at: now() });
    // S005: name the chat from its FIRST user prompt (clipped) so the history dropdown
    // rows are distinguishable; a whitespace-only prompt is already rejected above, so
    // the clip is non-empty. Later turns keep the established title.
    if (s.transcript.filter((r) => r.role === 'user').length === 1) {
      const derived = prompt.replace(/\s+/g, ' ').trim().slice(0, 60);
      if (derived !== '') s.title = derived;
    }
    deps.store.save(s);

    let adapter;
    try {
      adapter = deps.providers.get(s.provider);
    } catch {
      post({ type: 'turn-event', event: { kind: 'error', turnId: 'none', message: `no adapter for provider ${s.provider}` } });
      return;
    }

    const req = s.nativeSessionId !== undefined
      ? { provider: s.provider, prompt, cwd: deps.cwd(), resume: { provider: s.provider, nativeSessionId: s.nativeSessionId } }
      : { provider: s.provider, prompt, cwd: deps.cwd() };

    // Hold the iterator explicitly so cancelActive() can .return() it even while it
    // is parked awaiting its first event.
    const iterator = adapter.run(req)[Symbol.asyncIterator]();
    activeIterator = iterator;
    activeProvider = s.provider;
    try {
      for (;;) {
        const next = await iterator.next();
        if (disposed || myGen !== generation) break; // superseded/disposed -> stop posting
        if (next.done === true) break;
        const ev = next.value;
        activeTurnId = ev.turnId;
        post({ type: 'turn-event', event: ev });
        appendEvent(s, ev);
        if (ev.kind === 'done') {
          if (ev.sessionId !== undefined) s.nativeSessionId = ev.sessionId;
          deps.store.save(s);
          postHistory(); // S005: title/updatedAt changed -> refresh the history dropdown
          break;
        }
        if (ev.kind === 'error') {
          deps.store.save(s); // persist the errored turn's transcript rows too
          postHistory(); // S005: a first-turn error still set the title -> refresh the dropdown label
          break;
        }
      }
    } catch (err) {
      if (!disposed && myGen === generation) {
        post({ type: 'turn-event', event: { kind: 'error', turnId: activeTurnId ?? 'none', message: err instanceof Error ? err.message : String(err) } });
        try {
          deps.store.save(s);
        } catch {
          /* persistence failure must not surface */
        }
      }
    } finally {
      if (myGen === generation) {
        activeIterator = undefined;
        activeProvider = undefined;
        activeTurnId = undefined;
      }
    }
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
    // Durable markers are single-sourced through markerFor — the SAME mapper the webview
    // uses — so a host row and its live marker never drift. done now persists a marker row
    // (the S003 gap); an unmapped/future kind -> markerFor returns null -> no row.
    const marker = markerFor(ev);
    if (marker !== null) s.transcript.push({ role: 'marker', text: marker.label, at: now() });
  }

  function handleMessage(message: unknown): void {
    const env = message as { v?: unknown; payload?: unknown } | null;
    if (env === null || env.v !== 1 || typeof env.payload !== 'object' || env.payload === null) {
      log.warn('[chat] dropped malformed message');
      return;
    }
    const msg = env.payload as WebviewToHost;
    switch (msg.type) {
      case 'submit-turn':
        void runTurn(msg.text);
        return;
      case 'new-chat': {
        if (typeof msg.provider !== 'string') return;
        // S005: only start a chat on an INSTALLED agentic CLI (k4). A stale webview
        // option for an uninstalled provider is a no-op (it would fail on the first turn).
        if (!deps.providers.available.some((p) => p === msg.provider)) {
          log.warn(`[chat] new-chat: provider not available ${msg.provider}`);
          return;
        }
        // Switching the active session must stop any in-flight turn first, or its
        // deltas would paint into the newly-restored session's view.
        cancelActive();
        ++generation;
        session = deps.store.create(msg.provider);
        post({ type: 'session-restored', sessionId: session.id, transcript: session.transcript });
        postHistory(); // S005: the new chat appears in the dropdown
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
        cancelActive();
        ++generation;
        session = s;
        post({ type: 'session-restored', sessionId: s.id, transcript: s.transcript });
        postHistory(); // S005: keep the dropdown selection/order in sync
        return;
      }
      default:
        // set-edit-mode (S006), edit-decision (S006), docs-decision (S007), or any
        // unknown/forward variant: accepted-but-ignored seam — never an error.
        return;
    }
  }

  return {
    open(): void {
      disposed = false;
      if (channel !== undefined) {
        channel.reveal();
        return;
      }
      channel = deps.createPanel({ viewType: VIEW_TYPE, title: 'insrc chat' });
      channel.onDidDispose(() => {
        cancelActive();
        disposed = true;
        channel = undefined;
      });
      channel.onMessage(handleMessage);
      channel.setHtml(renderShell());

      const available = deps.providers.available;
      if (available.length === 0) {
        post({ type: 'turn-event', event: { kind: 'error', turnId: 'none', message: 'no agentic CLI (claude/codex) installed' } });
        return;
      }
      if (session === undefined) session = deps.store.create(available[0]!);
      post({ type: 'theme', theme });
      post({ type: 'session-restored', sessionId: session.id, transcript: session.transcript });
      postHistory(); // S005: populate the history dropdown as soon as the panel opens
    },
    dispose(): void {
      cancelActive();
      disposed = true;
      channel?.dispose();
      channel = undefined;
    },
  };
}
