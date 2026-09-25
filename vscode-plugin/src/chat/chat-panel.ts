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

  const renderShell = (): string => {
    const nonce = genNonce();
    const style = renderStyle(theme); // a complete <style>…</style>
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    const cls = surfaceClass('chat');
    const bootstrap =
      `const vs=acquireVsCodeApi();` +
      `const t=document.getElementById('insrc-term');` +
      `function line(s){const d=document.createElement('div');d.textContent=s;t.appendChild(d);t.scrollTop=t.scrollHeight;}` +
      `window.addEventListener('message',e=>{const m=e.data&&e.data.payload;if(!m)return;if(m.type==='turn-event'){const ev=m.event;line(ev.kind==='assistant-delta'?ev.text:'['+ev.kind+']');}` +
      `else if(m.type==='session-restored'){(m.transcript||[]).forEach(x=>line(x.text));}});` +
      `const box=document.getElementById('insrc-input');` +
      `box.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){vs.postMessage({v:1,payload:{type:'submit-turn',text:box.value}});box.value='';}});`;
    return (
      `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      `<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">` +
      `${style}</head>` +
      `<body class="${cls}"><div id="insrc-term"></div>` +
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
          break;
        }
        if (ev.kind === 'error') {
          deps.store.save(s); // persist the errored turn's transcript rows too
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
    if (ev.kind === 'assistant-delta') s.transcript.push({ role: 'assistant', text: ev.text, at: now() });
    else if (ev.kind === 'tool-call') s.transcript.push({ role: 'marker', text: `tool: ${ev.tool}`, at: now() });
    else if (ev.kind === 'file-edit') s.transcript.push({ role: 'marker', text: `edit: ${ev.path}`, at: now() });
    else if (ev.kind === 'error') s.transcript.push({ role: 'marker', text: `error: ${ev.message}`, at: now() });
    // 'status'/'done' are transient markers — not persisted as transcript rows.
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
        // Switching the active session must stop any in-flight turn first, or its
        // deltas would paint into the newly-restored session's view.
        cancelActive();
        ++generation;
        session = deps.store.create(msg.provider);
        post({ type: 'session-restored', sessionId: session.id, transcript: session.transcript });
        return;
      }
      case 'open-chat': {
        if (typeof msg.chatId !== 'string') return;
        const s = deps.store.get(msg.chatId);
        if (s === undefined) {
          log.warn(`[chat] open-chat: unknown session ${msg.chatId}`);
          return;
        }
        cancelActive();
        ++generation;
        session = s;
        post({ type: 'session-restored', sessionId: s.id, transcript: s.transcript });
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
    },
    dispose(): void {
      cancelActive();
      disposed = true;
      channel?.dispose();
      channel = undefined;
    },
  };
}
