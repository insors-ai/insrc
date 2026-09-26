/**
 * Story E20260925edb76e2e:S007 / t3 — the docs-review webview host.
 *
 * A vscode-free, deps-injected factory (mirrors createChatPanelHost): it renders
 * the terminal-styled 'docs-review' surface (one nonce'd inline script under a
 * strict per-render CSP, textContent/className only — the S003 shell invariants),
 * lists the daemon's PENDING tracked artifacts, opens one on demand, and drives
 * the approve / request-changes decision through the DocsReviewClient. It is a
 * PASSTHROUGH observer of the tracked-workflow flow (k8): it never runs a
 * workflow itself — it only reads pending()/content() and calls the daemon's own
 * approve()/comment() IPCs on daemon-tracked artifacts (k5). Persists nothing (k3).
 * All vscode API lives behind the injected {@link ChatPanelChannel}.
 */
import { renderTerminalStyle, surfaceClass, terminalTheme, type TerminalTheme } from './design-tokens.js';
import { envelope, type WebviewToHost, type HostToWebview, type DocsArtifactSummary } from './protocol.js';
import type { ChatPanelChannel, ChatPanelLogger } from './chat-panel.js';
import type { DocsReviewClient } from './docs-review-client.js';

/**
 * The artifact kinds the daemon's resolveComment locator (parseArtifactId) supports —
 * request-changes is only offered for these; other pending kinds (SPEC/PLAN/ISSUE/CR)
 * can be approved but not commented, so the pane hides that control for them rather
 * than offer a button guaranteed to fail server-side.
 */
const COMMENTABLE_KINDS = new Set(['DEF', 'HLD', 'LLD']);

export interface DocsReviewHostDeps {
  createPanel(opts: { viewType: string; title: string }): ChatPanelChannel;
  readonly client: DocsReviewClient;
  readonly renderStyle?: (theme?: TerminalTheme) => string;
  readonly theme?: TerminalTheme;
  readonly logger?: ChatPanelLogger;
  readonly genNonce?: () => string;
}

export interface DocsReviewHost {
  open(): void;
  dispose(): void;
}

const VIEW_TYPE = 'insrc.docsReviewPanel';
const NOOP_LOGGER: ChatPanelLogger = { warn: () => {}, error: () => {} };

/** Escape a value for safe embedding in an HTML attribute / the CSP meta content. */
function attr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function createDocsReviewHost(deps: DocsReviewHostDeps): DocsReviewHost {
  const log = deps.logger ?? NOOP_LOGGER;
  const renderStyle = deps.renderStyle ?? renderTerminalStyle;
  const theme = deps.theme ?? terminalTheme;
  const genNonce =
    deps.genNonce ?? (() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);

  let channel: ChatPanelChannel | undefined;
  let disposed = false;
  // In-memory only (k3): the currently-pending artifacts by id (id -> summary), so
  // open-doc/docs-decision intents are validated against the live list and openDoc can
  // read the artifact kind (to gate request-changes). The client owns id->mdPath.
  // Discarded on dispose.
  const pending = new Map<string, DocsArtifactSummary>();
  // Monotonic guard so a slow refreshPending response can never overwrite a newer one
  // (open() + the webview boot-ping + each decision all trigger a refresh; real IPC
  // latency means "last-to-complete" would otherwise win, not "last-requested").
  let refreshSeq = 0;

  const post = (msg: HostToWebview): void => {
    if (disposed || channel === undefined) return;
    channel.postMessage(envelope(msg));
  };

  /** (Re)load the pending set from the daemon and post it; a throw -> empty list + notice. */
  async function refreshPending(): Promise<void> {
    const mySeq = ++refreshSeq;
    try {
      const artifacts = await deps.client.pending();
      if (mySeq !== refreshSeq) return; // superseded by a newer refresh — drop this response
      pending.clear();
      for (const a of artifacts) pending.set(a.id, a);
      post({ type: 'docs-list', artifacts });
    } catch (err) {
      if (mySeq !== refreshSeq) return;
      log.warn(`[docs-review] pending failed: ${String(err)}`);
      post({ type: 'docs-list', artifacts: [] });
      post({
        type: 'docs-content',
        artifactId: '',
        markdown: `docs-review unavailable: ${errText(err)}`,
        openQuestions: [],
        blocked: false,
      });
    }
  }

  async function openDoc(artifactId: string): Promise<void> {
    const commentable = COMMENTABLE_KINDS.has(pending.get(artifactId)?.kind ?? '');
    try {
      const content = await deps.client.content(artifactId);
      post({
        type: 'docs-content',
        artifactId,
        markdown: content.markdown,
        openQuestions: content.openQuestions,
        blocked: content.blocked,
        commentable,
      });
    } catch (err) {
      log.warn(`[docs-review] content ${artifactId} failed: ${String(err)}`);
      // A content-load failure means the reviewer never saw the body — suppress approve
      // (blocked:true) so the review gate is not defeated; request-changes stays available.
      post({
        type: 'docs-content',
        artifactId,
        markdown: `unavailable: ${errText(err)}`,
        openQuestions: [],
        blocked: true,
        commentable,
      });
    }
  }

  async function decide(artifactId: string, accept: boolean, note: string | undefined): Promise<void> {
    const commentable = COMMENTABLE_KINDS.has(pending.get(artifactId)?.kind ?? '');
    try {
      if (accept) {
        const res = await deps.client.approve(artifactId);
        // A review block-verdict is NOT an error — it comes back non-lossily in skipped[]
        // (k5, daemon-enforced). The host approves ONE artifact, so a non-empty skipped[]
        // with nothing approved means this one was withheld; surface the reason inline and
        // the artifact stays pending.
        if (res.approved.length === 0 && res.skipped.length > 0) {
          const skip = res.skipped[0]!;
          post({
            type: 'docs-content',
            artifactId,
            markdown: `not approved (blocked): ${skip.reason}`,
            openQuestions: [],
            blocked: true,
            commentable,
          });
        }
      } else {
        // request-changes: record the reviewer's note; the artifact stays pending (there
        // is no daemon reject IPC — mirrors the JetBrains annotate flow).
        await deps.client.comment(artifactId, note && note.trim() !== '' ? note : 'changes requested');
      }
    } catch (err) {
      log.warn(`[docs-review] decision ${artifactId} failed: ${String(err)}`);
      post({
        type: 'docs-content',
        artifactId,
        markdown: `decision failed: ${errText(err)}`,
        openQuestions: [],
        blocked: true,
        commentable,
      });
    }
    // Re-fetch so the list reflects real approval state (k5 — never a client-side guess).
    await refreshPending();
  }

  const renderShell = (): string => {
    const nonce = genNonce();
    const style = renderStyle(theme);
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    const cls = surfaceClass('docs-review');
    const listCls = surfaceClass('history-dropdown');
    const bootstrap =
      `const vs=acquireVsCodeApi();` +
      `const listEl=document.getElementById('insrc-docs-list');` +
      `const bodyEl=document.getElementById('insrc-docs-body');` +
      `const oqEl=document.getElementById('insrc-docs-oq');` +
      `const noteEl=document.getElementById('insrc-docs-note');` +
      `const actEl=document.getElementById('insrc-docs-actions');` +
      `var current='';` +
      // docs-list: one clickable row per pending artifact (textContent only, no innerHTML).
      `function renderList(items){while(listEl.firstChild)listEl.removeChild(listEl.firstChild);` +
      `(items||[]).forEach(function(a){var b=document.createElement('button');b.className='insrc-docs-item';` +
      `b.textContent='['+a.kind+'] '+(a.title||a.id)+' — '+a.status;` +
      `b.addEventListener('click',function(){current=a.id;vs.postMessage({v:1,payload:{type:'open-doc',artifactId:a.id}});});` +
      `listEl.appendChild(b);});` +
      `if(!(items&&items.length)){var e=document.createElement('div');e.className='insrc-diff-ctx';e.textContent='no pending artifacts';listEl.appendChild(e);}}` +
      // docs-content: render the verbatim body + open questions + block banner + the
      // approve/request-changes controls (controls hidden while blocked).
      `function renderContent(m){bodyEl.textContent=m.markdown||'';` +
      `while(oqEl.firstChild)oqEl.removeChild(oqEl.firstChild);` +
      `(m.openQuestions||[]).forEach(function(q){var d=document.createElement('div');d.className='insrc-docs-oq-item';d.textContent='? '+q;oqEl.appendChild(d);});` +
      `while(actEl.firstChild)actEl.removeChild(actEl.firstChild);` +
      `if(m.artifactId){` +
      `if(m.blocked){var w=document.createElement('div');w.className='insrc-diff-del';w.textContent='blocked — not approvable';actEl.appendChild(w);}` +
      `else{var ok=document.createElement('button');ok.textContent='approve';ok.addEventListener('click',function(){vs.postMessage({v:1,payload:{type:'docs-decision',artifactId:m.artifactId,accept:true}});});actEl.appendChild(ok);}` +
      // request-changes only for kinds the daemon can record a comment on (commentable !== false).
      `if(m.commentable!==false){var rc=document.createElement('button');rc.textContent='request changes';rc.addEventListener('click',function(){vs.postMessage({v:1,payload:{type:'docs-decision',artifactId:m.artifactId,accept:false,note:noteEl.value}});noteEl.value='';});actEl.appendChild(rc);}}}` +
      `window.addEventListener('message',function(e){var m=e.data&&e.data.payload;if(!m)return;` +
      `if(m.type==='docs-list'){renderList(m.artifacts);}` +
      `else if(m.type==='docs-content'){renderContent(m);}});` +
      // request the pending list as soon as the script is live.
      `vs.postMessage({v:1,payload:{type:'open-doc',artifactId:''}});`;
    return (
      `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      `<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">` +
      `${style}</head>` +
      `<body class="${cls}">` +
      `<div id="insrc-docs-list" class="${listCls}" aria-label="pending artifacts"></div>` +
      `<pre id="insrc-docs-body" class="insrc-docs-content" aria-label="artifact body"></pre>` +
      `<div id="insrc-docs-oq" aria-label="open questions"></div>` +
      `<textarea id="insrc-docs-note" rows="2" aria-label="request-changes note"></textarea>` +
      `<div id="insrc-docs-actions"></div>` +
      `<script nonce="${nonce}">${bootstrap}</script></body></html>`
    );
  };

  function handleMessage(message: unknown): void {
    const env = message as { v?: unknown; payload?: unknown } | null;
    if (env === null || env.v !== 1 || typeof env.payload !== 'object' || env.payload === null) {
      log.warn('[docs-review] dropped malformed message');
      return;
    }
    const msg = env.payload as WebviewToHost;
    switch (msg.type) {
      case 'open-doc':
        if (typeof msg.artifactId !== 'string') return;
        // The webview's boot ping (empty id) means "load the list"; a real id opens a doc.
        if (msg.artifactId === '') {
          void refreshPending();
        } else if (pending.has(msg.artifactId)) {
          void openDoc(msg.artifactId);
        } else {
          // A stale row (approved/evicted since the list was posted) -> refresh, drop the open.
          log.warn(`[docs-review] open-doc: unknown/stale artifact ${msg.artifactId}`);
          void refreshPending();
        }
        return;
      case 'docs-decision':
        if (typeof msg.artifactId !== 'string' || typeof msg.accept !== 'boolean') return;
        // Only act on a live pending artifact (k5); a stale decision -> refresh, drop.
        if (!pending.has(msg.artifactId)) {
          log.warn(`[docs-review] docs-decision: unknown/stale artifact ${msg.artifactId}`);
          void refreshPending();
          return;
        }
        void decide(msg.artifactId, msg.accept, typeof msg.note === 'string' ? msg.note : undefined);
        return;
      default:
        // any chat-slice / forward variant: accepted-but-ignored seam — never an error.
        return;
    }
  }

  return {
    open(): void {
      disposed = false;
      if (channel !== undefined) {
        channel.reveal();
        void refreshPending();
        return;
      }
      channel = deps.createPanel({ viewType: VIEW_TYPE, title: 'insrc docs review' });
      channel.onDidDispose(() => {
        disposed = true;
        channel = undefined;
        pending.clear();
      });
      channel.onMessage(handleMessage);
      channel.setHtml(renderShell());
      post({ type: 'theme', theme });
      // The webview boot ping also triggers refreshPending; post one now so a fast
      // consumer (test double) sees the list without waiting for the ping.
      void refreshPending();
    },
    dispose(): void {
      disposed = true;
      channel?.dispose();
      channel = undefined;
      pending.clear();
    },
  };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
