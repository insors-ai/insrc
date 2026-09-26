/**
 * Story E20260926be8708a9:S001 — adapt a VS-Code-resolved WebviewView onto the S003
 * ChatPanelChannel seam so the EXISTING createChatPanelHost turn-loop renders in the
 * Activity Bar sidebar (like the Claude/Codex/Copilot extensions) instead of an editor tab.
 *
 * Lifecycle inversion: createChatPanelHost.open() CREATES its surface via the injected
 * createPanel(); a WebviewView is instead created BY VS Code and handed to
 * resolveWebviewView(view). So the provider wraps the resolved view as a ChatPanelChannel
 * and builds a host whose createPanel returns that channel — the host, its session store,
 * markers, and edit-governance are all reused UNCHANGED. createChatPanelHost is NOT modified.
 *
 * Type-only vscode imports — this module is vscode-free (no runtime `vscode` dependency),
 * unit-testable with a fake WebviewView, mirroring the createChatPanelHost deps idiom.
 */
import type { WebviewView, WebviewViewProvider } from 'vscode';
import type { ChatPanelChannel, ChatPanelHost, ChatPanelLogger } from './chat-panel.js';

/**
 * Wrap a resolved WebviewView as a ChatPanelChannel. Every method maps onto the view's
 * webview; `reveal` shows the view; `dispose` is a no-op because VS Code owns the view's
 * lifecycle. postMessage is fire-and-forget: a post to a hidden/disposed view must never
 * reject inward (mirrors the editor-panel channel in extension.ts).
 */
export function webviewViewToChannel(view: WebviewView): ChatPanelChannel {
  return {
    setHtml: (html: string) => {
      view.webview.html = html;
    },
    postMessage: (message: unknown) => {
      try {
        const p = view.webview.postMessage(message) as PromiseLike<unknown> | undefined;
        if (p && typeof p.then === 'function') p.then(undefined, () => { /* swallow */ });
      } catch {
        /* posting to a disposed view — swallow (fire-and-forget) */
      }
    },
    onMessage: (listener: (message: unknown) => void) => {
      view.webview.onDidReceiveMessage((m) => listener(m));
    },
    onDidDispose: (listener: () => void) => {
      view.onDidDispose(() => listener());
    },
    reveal: () => {
      view.show(true);
    },
    dispose: () => {
      /* no-op: VS Code owns the sidebar view's lifecycle */
    },
  };
}

/** Injected seams for {@link createChatSidebarViewProvider} — keeps it vscode-free/testable. */
export interface ChatSidebarViewDeps {
  /** Wrap the resolved view as a ChatPanelChannel (extension.ts passes webviewViewToChannel). */
  readonly toChannel: (view: WebviewView) => ChatPanelChannel;
  /** Build a chat host whose createPanel returns the pre-resolved view's channel. */
  readonly makeHost: (createPanel: () => ChatPanelChannel) => ChatPanelHost;
  /** Enable scripts on the view's webview BEFORE the host renders the nonce'd shell. */
  readonly enableScripts: (view: WebviewView) => void;
  /**
   * Record the id of the session the host just restored/created (sniffed from the host's
   * outgoing 'session-restored' posts). extension.ts persists it (globalState) so the NEXT
   * fresh host resumes that conversation instead of starting empty — the H1 continuity fix.
   */
  readonly onActiveSession?: ((sessionId: string) => void) | undefined;
  readonly logger?: ChatPanelLogger | undefined;
}

/** Extract a 'session-restored' sessionId from a host->webview envelope, if that is what it is. */
function sniffActiveSession(message: unknown): string | undefined {
  const payload = (message as { payload?: { type?: unknown; sessionId?: unknown } } | null)?.payload;
  if (payload !== undefined && payload.type === 'session-restored' && typeof payload.sessionId === 'string') {
    return payload.sessionId;
  }
  return undefined;
}

/**
 * A WebviewViewProvider that renders the chat in the sidebar. On resolveWebviewView it
 * enables scripts, wraps the view as a channel, builds a fresh host bound to that channel,
 * and opens it. VS Code may dispose a hidden view and later re-resolve it: each
 * resolveWebviewView is authoritative — the prior host is disposed (stopping its turn-loop
 * so it never posts into the dead view) and a fresh host is built for the new view.
 */
export function createChatSidebarViewProvider(deps: ChatSidebarViewDeps): WebviewViewProvider {
  let current: WebviewView | undefined;
  let host: ChatPanelHost | undefined;

  return {
    resolveWebviewView(view: WebviewView): void {
      // Supersede any host bound to a previously-resolved (now disposed) view.
      if (host !== undefined) {
        try {
          host.dispose();
        } catch {
          /* disposing an already-disposed host is a no-op */
        }
        host = undefined;
      }
      deps.enableScripts(view);
      current = view;
      const base = deps.toChannel(view);
      // Sniff the host's outgoing 'session-restored' posts to persist the active session id,
      // so the next fresh host (after a re-resolution) resumes this conversation (H1).
      const channel: ChatPanelChannel = deps.onActiveSession === undefined
        ? base
        : {
            ...base,
            postMessage: (message: unknown) => {
              const id = sniffActiveSession(message);
              if (id !== undefined) deps.onActiveSession!(id);
              base.postMessage(message);
            },
          };
      host = deps.makeHost(() => channel);
      view.onDidDispose(() => {
        if (current === view) {
          try {
            host?.dispose();
          } catch {
            /* no-op */
          }
          host = undefined;
          current = undefined;
        }
      });
      host.open();
    },
  };
}
