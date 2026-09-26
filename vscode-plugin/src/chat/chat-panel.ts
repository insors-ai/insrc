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
import { clampSessionTitleWebviewSource } from './session-title.js';
import { envelope, type WebviewToHost, type HostToWebview } from './protocol.js';
import type { ProviderRegistry, ProviderId } from './cli-adapter.js';
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
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    const cls = surfaceClass('chat');
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
      `--border:#222a36;--border-lit:#2f3a4a;--accent:#4ade80;--accent2:#38bdf8;--amber:#fbbf24;--magenta:#c084fc;--red:#f87171;--sel:rgba(74,222,128,.22);}` +
      `*{box-sizing:border-box;}html,body{height:100%;width:100%;}` +
      `body{margin:0;padding:0;display:flex;background:radial-gradient(1200px 600px at 80% -10%,rgba(56,189,248,.06),transparent 60%),radial-gradient(900px 500px at -5% 10%,rgba(74,222,128,.05),transparent 55%),var(--bg);color:var(--fg);font-family:var(--font);font-size:13.5px;line-height:1.5;-webkit-font-smoothing:antialiased;}` +
      `::selection{background:var(--sel);}a{color:var(--accent2);}` +
      // Full-bleed: the .box IS the whole panel (approved --panel surface), edge to edge — no floating
      // card border/radius/shadow (that framing was the mock's page card; in-panel it fills).
      `.box{flex:1 1 auto;width:100%;min-width:0;display:flex;flex-direction:column;min-height:0;background:var(--panel);overflow:hidden;}` +
      `.chrome{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-inset);border-bottom:1px solid var(--border);color:var(--muted);font-size:12px;flex:0 0 auto;flex-wrap:wrap;}` +
      `.chrome .dot{width:9px;height:9px;border-radius:50%;background:var(--accent);opacity:.85;flex:0 0 auto;}` +
      `.chrome .title{color:var(--fg);}.chrome .right{margin-left:auto;display:inline-flex;align-items:center;gap:5px;color:var(--dim);}` +
      // S001 t6: the active session name in the header, clamped to 32 chars + ellipsis (ac4).
      `.chrome .sesstitle{color:var(--muted);}.chrome .sesstitle:not(:empty)::before{content:'/';margin:0 6px;color:var(--dim);}` +
      `.pad{padding:14px 16px;flex:1 1 auto;display:flex;flex-direction:column;min-height:0;}` +
      `#insrc-term{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:2px;white-space:pre-wrap;word-break:break-word;color:var(--fg);}` +
      `#insrc-term>div{white-space:pre-wrap;}` +
      `.insrc-term__marker--pending{color:var(--muted);}.insrc-term__marker--pending::before{color:var(--magenta)!important;margin-right:.55em;}` +
      `.insrc-term__marker--tool{color:var(--accent2);}.insrc-term__marker--tool::before{color:var(--accent2)!important;margin-right:.55em;}` +
      `.insrc-term__marker--edit{color:var(--fg);}.insrc-term__marker--edit::before{color:var(--amber)!important;margin-right:.55em;}` +
      `.insrc-term__marker--done{color:var(--muted);}.insrc-term__marker--done::before{color:var(--accent)!important;margin-right:.55em;}` +
      `.insrc-term__marker--error{color:var(--red);}.insrc-term__marker--error::before{color:var(--red)!important;margin-right:.55em;}` +
      `.inputline{display:flex;gap:10px;align-items:flex-start;margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);flex:0 0 auto;}` +
      `.inputline .caret{color:var(--accent);font-weight:700;padding-top:6px;user-select:none;}` +
      // S002 ac2: the icon-only Send/Stop button (▶ green Send at rest / ■ red Stop while running).
      `#insrc-send{flex:0 0 auto;align-self:flex-end;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;background:var(--bg-inset);border:1px solid var(--border);border-radius:6px;color:var(--accent);font-family:var(--font);font-size:13px;line-height:1;cursor:pointer;outline:none;user-select:none;padding:0;}` +
      `#insrc-send:hover{border-color:var(--accent);}#insrc-send.stop{color:var(--red);}#insrc-send.stop:hover{border-color:var(--red);}` +
      `#insrc-input{flex:1 1 auto;min-width:0;resize:vertical;min-height:2.4em;background:var(--bg-inset);color:var(--fg);caret-color:var(--accent);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-family:var(--font);font-size:13.5px;line-height:1.5;outline:none;}` +
      `#insrc-input::placeholder{color:var(--dim);}#insrc-input:focus{border-color:var(--accent);}` +
      `.statusbar{display:flex;gap:16px;align-items:center;padding:7px 16px;background:var(--bg-inset);border-top:1px solid var(--border);color:var(--muted);font-size:12px;flex-wrap:wrap;flex:0 0 auto;}` +
      `.statusbar .seg{display:inline-flex;align-items:center;gap:5px;}.statusbar .seg b{color:var(--fg);font-weight:500;}.statusbar .ok{color:var(--accent);margin-left:auto;}` +
      // The provider/session/edits selects, styled as the bold segment value (transparent, borderless).
      `.segsel{appearance:none;-webkit-appearance:none;background:transparent;border:none;color:var(--fg);font-family:var(--font);font-size:12px;font-weight:500;line-height:1.2;padding:0 14px 0 2px;margin:0;cursor:pointer;outline:none;` +
      `background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 6px) 55%,calc(100% - 3px) 55%;background-size:3px 3px,3px 3px;background-repeat:no-repeat;}` +
      `.segsel:hover{color:var(--accent);}.segsel:disabled{opacity:.5;cursor:default;}.segsel option{background:var(--bg-alt);color:var(--fg);font-weight:400;}` +
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
      // S005: provider-selector + history-dropdown wiring (same one nonce'd script).
      `var cur='';` +
      `const ps=document.getElementById('insrc-provider');` +
      `const hs=document.getElementById('insrc-history');` +
      // S001 t6: the header session-name clamp (>32 chars -> 32 + ellipsis, ac4), single-sourced
      // with session-title.ts. VIEW-only: the stored title (history option label) is untouched (k4).
      `const st=document.getElementById('insrc-sesstitle');` +
      `const clampTitle=(${clampSessionTitleWebviewSource()});` +
      // S002 ac2: webview-local turn running-state drives the icon-only Send/Stop button.
      // ▶ (Send) at rest, ■ (Stop) while a turn runs; set on submit, cleared on done/error.
      `var running=false;` +
      `const sendBtn=document.getElementById('insrc-send');` +
      `function setRunning(r){running=r;if(sendBtn){sendBtn.textContent=r?'\\u25a0':'\\u25b6';sendBtn.className='sendbtn'+(r?' stop':'');sendBtn.setAttribute('aria-label',r?'stop':'send');}}` +
      `ps.addEventListener('change',function(){if(ps.value){vs.postMessage({v:1,payload:{type:'new-chat',provider:ps.value}});}});` +
      `hs.addEventListener('change',function(){if(hs.value){vs.postMessage({v:1,payload:{type:'open-chat',chatId:hs.value}});}else if(ps.value){vs.postMessage({v:1,payload:{type:'new-chat',provider:ps.value}});}});` +
      // S006: per-session edit-mode toggle (auto/review) + the chat-view inline diff renderer.
      // emode gates the accept/reject controls webview-side; the host is authoritative for revert.
      `var emode='auto';` +
      `const em=document.getElementById('insrc-editmode');` +
      `em.addEventListener('change',function(){emode=em.value==='review'?'review':'auto';vs.postMessage({v:1,payload:{type:'set-edit-mode',mode:emode}});});` +
      // renderDiff: one row per hunk line via textContent (no innerHTML); add/remove/context
      // class by the +/-/space prefix computeDiff wrote. In review mode append accept/reject
      // buttons that post edit-decision for this path.
      `function renderDiff(path,diff,review){var box=document.createElement('div');box.className=${JSON.stringify(diffCls)};var hdr=document.createElement('div');hdr.className='insrc-diff-path';hdr.textContent=path;box.appendChild(hdr);var hunks=(diff&&diff.hunks)||[];hunks.forEach(function(h){(h.lines||[]).forEach(function(ln){var d=document.createElement('div');var c=ln.charAt(0);d.className=c==='+'?'insrc-diff-add':c==='-'?'insrc-diff-del':'insrc-diff-ctx';d.textContent=ln;box.appendChild(d);});});if(review){var bar=document.createElement('div');bar.className='insrc-diff-actions';var ok=document.createElement('button');ok.textContent='accept';ok.addEventListener('click',function(){vs.postMessage({v:1,payload:{type:'edit-decision',path:path,accept:true}});bar.remove();});var no=document.createElement('button');no.textContent='reject';no.addEventListener('click',function(){vs.postMessage({v:1,payload:{type:'edit-decision',path:path,accept:false}});bar.remove();});bar.appendChild(ok);bar.appendChild(no);box.appendChild(bar);}t.appendChild(box);t.scrollTop=t.scrollHeight;}` +
      // S001 sc1/t4: the live turn-event append routes through reg.renderRow(reg.toViewModel(ev)).
      // assistant-delta -> assistant-text row (its actual text, ac2); tool-call -> tool-command row
      // (the real command inline, ac3). Every other kind keeps the sc1 marker path (markerFor ->
      // fallback), so status/file-edit/done/error render exactly as today and an unknown kind is skipped.
      `window.addEventListener('message',e=>{const m=e.data&&e.data.payload;if(!m)return;if(m.type==='turn-event'){const ev=m.event;if(ev&&(ev.kind==='assistant-delta'||ev.kind==='tool-call')){reg.renderRow(reg.toViewModel(ev));}else{const mk=markerFor(ev);if(mk)reg.renderRow({kind:'fallback',text:mk.label,cssClass:mk.cssClass});}` +
      // S002 ac2: a terminal event returns the button to ▶ Send (t4 also hides the progress widget here).
      `if(ev&&(ev.kind==='done'||ev.kind==='error'))setRunning(false);}` +
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
      `else if(m.type==='session-restored'){cur=m.sessionId||'';t.textContent='';reg.resetKeys();(m.transcript||[]).forEach(function(x,i){reg.appendKeyed(reg.toViewModel(x),'r'+i);});hs.value=cur;}` +
      // S005: history-list (re)populates the dropdown; labels via textContent (no innerHTML); keep active selected.
      `else if(m.type==='history-list'){while(hs.options.length>1)hs.remove(1);(m.chats||[]).forEach(function(c){var o=document.createElement('option');o.value=c.id;o.textContent='['+c.provider+'] '+(c.title||c.id);hs.appendChild(o);});hs.value=cur;var _ac=(m.chats||[]).filter(function(c){return c.id===cur;})[0];if(_ac&&_ac.provider){ps.value=_ac.provider;}if(st)st.textContent=_ac&&_ac.title?clampTitle(_ac.title):'';}});` +
      `const box=document.getElementById('insrc-input');` +
      // S002 ac2: submit converges on ONE path (Cmd/Ctrl+Enter and the Send button); it posts
      // submit-turn + marks running. The Send/Stop button posts cancel-turn while running.
      `function doSubmit(){vs.postMessage({v:1,payload:{type:'submit-turn',text:box.value}});box.value='';setRunning(true);}` +
      `box.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){doSubmit();}});` +
      `if(sendBtn)sendBtn.addEventListener('click',function(){if(running){vs.postMessage({v:1,payload:{type:'cancel-turn'}});}else{doSubmit();}});` +
      `setRunning(false);`;
    return (
      `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      `<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">` +
      `${style}${layoutStyle}</head>` +
      `<body class="insrc-term ${cls}">` +
      `<div class="box">` +
      `<div class="chrome">` +
      `<span class="dot"></span><span class="title">insrc</span><span class="sesstitle" id="insrc-sesstitle"></span>` +
      `<span class="right">session <select id="insrc-history" class="segsel ${histCls}" aria-label="history"><option value="">new…</option></select></span>` +
      `</div>` +
      `<div class="pad">` +
      `<div id="insrc-term" class="term"></div>` +
      `<div class="inputline">` +
      `<span class="caret">❯</span>` +
      `<textarea id="insrc-input" rows="2" aria-label="message" placeholder="message claude… (⌘↵ send)"></textarea>` +
      // S002 ac2: icon-only Send/Stop button (glyph + class set by setRunning: ▶ Send / ■ Stop).
      `<button id="insrc-send" class="sendbtn" type="button" aria-label="send">❯</button>` +
      `</div>` +
      `</div>` +
      // Approved layout: provider / session / edits live as STATUS-BAR segments at the bottom
      // (the selects are styled as the bold segment value, transparent + borderless).
      `<div class="statusbar">` +
      `<span class="seg"><select id="insrc-provider" class="segsel ${provCls}" aria-label="provider"${provDisabled}>${providerOpts}</select></span>` +
      `<span class="seg">edits <select id="insrc-editmode" class="segsel ${provCls}" aria-label="edit mode"><option value="auto">auto</option><option value="review">review</option></select></span>` +
      `<span class="seg ok">✓ idle</span>` +
      `</div>` +
      `</div>` +
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
    // S001 ac1/lc1: echo the user's prompt LIVE so it appears during the turn (not only on a
    // later session-restored replay). ONE append is both the durable row and the live echo —
    // its key is the row's transcript index, so the live row and its replay reconcile to a
    // single rendered row webview-side (the stored transcript shape is unchanged, k4).
    post({ type: 'user-row', text: prompt, key: `r${s.transcript.length - 1}` });
    // S005: name the chat from its FIRST user prompt (clipped) so the history dropdown
    // rows are distinguishable; a whitespace-only prompt is already rejected above, so
    // the clip is non-empty. Later turns keep the established title.
    if (s.transcript.filter((r) => r.role === 'user').length === 1) {
      const derived = prompt.replace(/\s+/g, ' ').trim().slice(0, 60);
      if (derived !== '') s.title = derived;
      // Then ask the LLM for a better title in the background (keeps `derived` on failure).
      void applyTitle(s, prompt);
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

    // S006: capture the pre-turn baseline BEFORE the CLI can write (governor.beginTurn),
    // so the diff + revert are computed against the true pre-turn content (k8 observer).
    if (governor !== undefined) await governor.beginTurn({ mode: s.editMode, cwd: deps.cwd() });

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
        // S006: an observed file-edit -> the governor computes + renders its own diff
        // (auto: visualize-only; review: track for accept/reject). Fire-and-forget so
        // the incremental turn loop never blocks on git/fs IO.
        if (governor !== undefined && ev.kind === 'file-edit') void governor.observe(ev.path);
        if (ev.kind === 'done') {
          if (ev.sessionId !== undefined) s.nativeSessionId = ev.sessionId;
          deps.store.save(s);
          if (governor !== undefined) void governor.resolveTurn();
          postHistory(); // S005: title/updatedAt changed -> refresh the history dropdown
          break;
        }
        if (ev.kind === 'error') {
          deps.store.save(s); // persist the errored turn's transcript rows too
          if (governor !== undefined) void governor.resolveTurn();
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
      case 'submit-turn':
        void runTurn(msg.text);
        return;
      case 'cancel-turn':
        // S002 ac2: the Stop control cancels the in-flight turn via the existing reap.
        // Idempotent when no turn is active (cancelActive() no-ops).
        cancelActive();
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
        // A DRAFT (unsaved): the new chat is not written to history until its first turn, so
        // repeatedly starting/abandoning new chats never leaves empty sessions behind.
        session = deps.store.draft(msg.provider);
        post({ type: 'session-restored', sessionId: session.id, transcript: session.transcript });
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
        cancelActive();
        ++generation;
        session = s;
        post({ type: 'session-restored', sessionId: s.id, transcript: s.transcript });
        postHistory(); // S005: keep the dropdown selection/order in sync
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
      default:
        // docs-decision (S007) or any unknown/forward variant: accepted-but-ignored
        // seam — never an error.
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
      // A DRAFT session (in-memory, not persisted): opening the chat does not save an empty
      // session to history; it enters the store only on the first turn (runTurn's save).
      if (session === undefined) session = deps.store.draft(available[0]!);
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
