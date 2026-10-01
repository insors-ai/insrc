/**
 * Story E20260926f9563bf5:S001 / sc1 — the webview-side render layer (t1 foundation).
 *
 * The single view-time rendering seam the chat overhaul builds on: a typed per-row
 * view-model ({@link RowViewModel}), a {@link RenderRegistry} that dispatches each
 * row kind to an inline {@link RowRenderer} (falling back to the flat `line()`
 * writer for any unmapped kind), and a {@link RenderHost} exposing the shared
 * icon-only chevron collapse primitive. S003 registers the concrete
 * markdown/JSON/role/collapse renderers and S004 the approval-card renderer into
 * the SAME registry, so the agreed mock (k5) + locked directions (k6) are
 * implemented once and cannot drift.
 *
 * t1 provides ONLY the mechanism: the types, the registry (with `line()` registered
 * as the 'fallback' renderer), and the collapse primitive. `toViewModel` and the
 * user/assistant-text/tool-command renderers land in t4; the approval renderer +
 * permission wiring in S004.
 *
 * Single-source parity mirrors {@link markerWebviewSource} (markers.ts): the host
 * owns the types here and {@link renderRegistryWebviewSource} emits the equivalent
 * JS-source factory the ONE nonce'd webview bootstrap embeds inline (k1 — no
 * import, no remote origin, textContent/className only, never innerHTML). A unit
 * test evals the factory and drives it against a fake document, so the webview
 * render logic is verified without a real DOM.
 */
import type { TranscriptEntry } from './session-store.js';
import type { TurnEvent } from './stream-events.js';
import { MARKER_CLASS } from './markers.js';

/** The two conversational roles a message row can carry. */
export type ChatRole = 'user' | 'assistant';

/**
 * Every row kind the registry can render. S001 registers 'user', 'assistant-text',
 * 'tool-command' (t4) and 'fallback' (t1); S003 fills the markdown/JSON/result/diff
 * kinds and S004 the 'approval' kind. Any kind with no registered renderer routes to
 * 'fallback' (the flat line() writer), so no current row kind ever regresses (k2).
 */
export type RowKind =
  | 'user'
  | 'assistant-text'
  | 'assistant-markdown'
  | 'assistant-json'
  | 'tool-command'
  | 'tool-result'
  | 'inline-diff'
  | 'approval'
  | 'permission-outcome'
  | 'selection-request'
  | 'selection-outcome'
  | 'progress'
  | 'fallback';

/**
 * The view-time model a renderer consumes. Derived from the plain durable transcript
 * or a live TurnEvent at VIEW time and never persisted (k4).
 */
export interface RowViewModel {
  readonly kind: RowKind;
  readonly role?: ChatRole;
  readonly text: string;
  readonly cssClass?: string;
  readonly collapsible: boolean;
  readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * The host a renderer is handed: the shared collapse/chevron primitive plus the sc1
 * design tokens. Renderers build inline DOM through it (textContent/className only).
 */
export interface RenderHost {
  /**
   * Wrap `el` in the shared collapse container with the icon-only chevron (▸/▾)
   * toggle (k6 a). `defaultCollapsed` clamps the content to a 3-line preview (k6 b).
   */
  collapsible(el: unknown, opts: { defaultCollapsed: boolean }): unknown;
  readonly tokens: Readonly<Record<string, string>>;
}

/** An inline renderer producing the row's DOM node from its view-model. */
export interface RowRenderer {
  render(vm: RowViewModel, host: RenderHost): unknown;
}

/** The registry: register a renderer per kind; renderRow dispatches (or falls back). */
export interface RenderRegistry {
  register(kind: RowKind, r: RowRenderer): void;
  renderRow(vm: RowViewModel): unknown;
}

/**
 * Derive the view-time {@link RowViewModel} from a plain durable {@link TranscriptEntry}
 * or a live {@link TurnEvent}. Pure + total + deterministic: no DOM, no storage write,
 * no I/O (k4 — rendering is derived at view time, never persisted). An unrecognised
 * entry maps to kind:'fallback' so renderRow always resolves a renderer.
 *
 * Mapping (single-sourced with {@link renderRegistryWebviewSource}'s inline copy; a
 * parity test pins the two together):
 * - transcript role 'user'      -> { kind:'user', role:'user' }        (collapsible)
 * - transcript role 'assistant' -> { kind:'assistant-text', role:'assistant' } (collapsible)
 * - transcript role 'marker'    -> { kind:'fallback', cssClass }       (the sc1 marker row)
 *   (a persisted tool-call marker -> { kind:'tool-command' } so a replay pairs with its result)
 * - event 'assistant-delta'     -> { kind:'assistant-text', role:'assistant' } (ac2)
 * - event 'tool-call'           -> { kind:'tool-command', text: command ?? tool/mcp } (ac3; long commands collapse)
 * - anything else               -> { kind:'fallback', text:'' }
 */
export function toViewModel(entry: TranscriptEntry | TurnEvent): RowViewModel {
  // A TranscriptEntry carries `role`; a TurnEvent carries `kind`.
  if ('role' in entry) {
    if (entry.role === 'user') return { kind: 'user', role: 'user', text: entry.text, collapsible: true };
    if (entry.role === 'assistant') return { kind: 'assistant-text', role: 'assistant', text: entry.text, collapsible: true };
    // S001 (dev-chat ux polish): a replayed tool-result row -> the structured tool-result view-model
    // (command line + separator + collapsed output). Single-sourced with the live-event branch below.
    if (entry.role === 'tool-result') {
      return { kind: 'tool-result', text: entry.command ?? '', collapsible: true, meta: { command: entry.command, output: entry.output } };
    }
    // S003 (dev-chat ux polish): a replayed permission-outcome row -> the resolved-chip view-model
    // (tool name + decided badge). Single-sourced with the live-event branch below (dual-input parity).
    if (entry.role === 'permission-outcome') {
      return { kind: 'permission-outcome', text: entry.toolName, collapsible: false, meta: { toolName: entry.toolName, decision: entry.decision } };
    }
    // S004 (dev-chat ux polish): a replayed selection-outcome row -> the resolved-chip view-model
    // (chosen labels). Single-sourced with the live-event branch below (dual-input parity).
    if (entry.role === 'selection-outcome') {
      return { kind: 'selection-outcome', text: entry.chosen.join(', '), collapsible: false, meta: { chosen: entry.chosen } };
    }
    // ISSUE-1163888072faa9f2: a persisted tool-call marker replays as the SAME tool row the live
    // tool-call drew, so its following tool-result row attaches to it (one row per invocation).
    if (entry.role === 'marker' && entry.cssClass === MARKER_CLASS.tool) {
      return { kind: 'tool-command', text: entry.text, collapsible: false };
    }
    // 'marker' (S008): keep the sc1 marker class so a restored marker row renders identically.
    return entry.cssClass !== undefined
      ? { kind: 'fallback', text: entry.text, cssClass: entry.cssClass, collapsible: false }
      : { kind: 'fallback', text: entry.text, collapsible: false };
  }
  if (entry.kind === 'assistant-delta') {
    return { kind: 'assistant-text', role: 'assistant', text: entry.text, collapsible: true };
  }
  if (entry.kind === 'tool-call') {
    const label = entry.command ?? (entry.mcp ? `${entry.mcp.server} · ${entry.mcp.name}` : entry.tool);
    // ISSUE-1163888072faa9f2: the provider call id (when reported) lets the result pair exactly.
    return entry.callId !== undefined
      ? { kind: 'tool-command', text: label, collapsible: false, meta: { callId: entry.callId } }
      : { kind: 'tool-command', text: label, collapsible: false };
  }
  // S001 (dev-chat ux polish): a live tool-result event -> the SAME structured view-model as its
  // replayed transcript twin (dual-input parity, a test pins the two).
  if (entry.kind === 'tool-result') {
    const meta = entry.callId !== undefined
      ? { command: entry.command, output: entry.output, callId: entry.callId }
      : { command: entry.command, output: entry.output };
    return { kind: 'tool-result', text: entry.command ?? '', collapsible: true, meta };
  }
  // S003 (dev-chat ux polish): a live permission-outcome event -> the SAME resolved-chip view-model
  // as its replayed transcript twin (dual-input parity, a test pins the two).
  if (entry.kind === 'permission-outcome') {
    return { kind: 'permission-outcome', text: entry.toolName, collapsible: false, meta: { toolName: entry.toolName, decision: entry.decision } };
  }
  // S004 (dev-chat ux polish): a live selection-request event -> the card view-model (the widget
  // renderer reads prompt/options/multi/requestId off meta). `multi` is normalized to a boolean.
  if (entry.kind === 'selection-request') {
    return {
      kind: 'selection-request',
      text: entry.prompt,
      collapsible: false,
      meta: { prompt: entry.prompt, options: entry.options, requestId: entry.requestId, multi: entry.multi === true },
    };
  }
  // S004 (dev-chat ux polish): a live selection-outcome event -> the SAME resolved-chip view-model
  // as its replayed transcript twin (dual-input parity, a test pins the two).
  if (entry.kind === 'selection-outcome') {
    return { kind: 'selection-outcome', text: entry.chosen.join(', '), collapsible: false, meta: { chosen: entry.chosen } };
  }
  return { kind: 'fallback', text: '', collapsible: false };
}

/**
 * The CSS the collapse primitive relies on: an icon-only chevron and a body that
 * clamps to a 3-line preview when collapsed (k6 a/b). Embedded once in the webview
 * `<style>` (t1). Kept as a single exported string so the shell and any test share
 * one source.
 */
export const RENDER_REGISTRY_STYLE =
  `.insrc-collapse{display:flex;align-items:flex-start;gap:6px;}` +
  `.insrc-collapse__chevron{color:var(--muted);cursor:pointer;user-select:none;flex:0 0 auto;line-height:1.5;}` +
  `.insrc-collapse__chevron:hover{color:var(--accent);}` +
  `.insrc-collapse__body{flex:1 1 auto;min-width:0;}` +
  `.insrc-collapse--collapsed .insrc-collapse__body{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}` +
  // S001 (dev-chat ux polish): the tool-result row — a command line (green $ prompt) above a thin
  // separator, then the collapsed output. The command stays visible; only the output collapses.
  `.insrc-toolresult{}` +
  `.insrc-toolresult__cmd{color:var(--fg-strong);white-space:pre-wrap;word-break:break-word;}` +
  `.insrc-toolresult__prompt{color:var(--accent);}` +
  `.insrc-toolresult__sep{height:1px;background:var(--border,#222a36);margin:6px 0;}` +
  `.insrc-toolresult__out{color:var(--fg);white-space:pre-wrap;word-break:break-word;font-family:var(--font,monospace);}` +
  // ISSUE-1163888072faa9f2: a tool row with its result attached stacks command / separator / output.
  // Doubled class so it outranks chat-panel's `.insrc-toolrow` rule, which is emitted AFTER this style.
  `.insrc-toolrow.insrc-toolrow--result{flex-direction:column;align-items:stretch;gap:0;}` +
  // S004: the in-chat permission-approval card (k6 i). Icon-only approve/deny buttons
  // (▹ green ✓ / red ✗); the whole card is bordered to read as an action, not prose.
  `.insrc-approval{border:1px solid rgba(251,191,36,.45);border-radius:10px;background:linear-gradient(180deg,rgba(251,191,36,.09),rgba(251,191,36,.03));padding:11px 13px;margin:2px 0;display:flex;flex-direction:column;gap:9px;}` +
  `.insrc-approval__title{font-weight:600;color:var(--amber);display:flex;align-items:center;gap:8px;}` +
  `.insrc-approval__detail{color:var(--fg);font-size:13px;white-space:pre-wrap;word-break:break-word;}` +
  `.insrc-approval__actions{display:flex;gap:8px;flex-wrap:wrap;}` +
  `.insrc-approval__btn{cursor:pointer;border:1px solid var(--border-lit);background:var(--panel);color:var(--fg);border-radius:7px;padding:4px 12px;line-height:1.4;font-size:13px;font-family:var(--font);}` +
  `.insrc-approval__btn--approve{border-color:rgba(74,222,128,.5);color:#bff3d3;background:rgba(74,222,128,.12);}` +
  `.insrc-approval__btn--deny{border-color:rgba(248,113,113,.5);color:#f6bcbc;background:rgba(248,113,113,.10);}` +
  `.insrc-approval__btn:hover{filter:brightness(1.15);}` +
  // S003 (dev-chat ux polish) ac1: the resolved approval-card states — recolour the (now button-less)
  // card to read as a settled decision, reusing the approve(green)/deny(red) tints.
  `.insrc-approval--approved{border-color:rgba(74,222,128,.5);background:linear-gradient(180deg,rgba(74,222,128,.09),rgba(74,222,128,.03));}` +
  `.insrc-approval--rejected{border-color:rgba(248,113,113,.5);background:linear-gradient(180deg,rgba(248,113,113,.09),rgba(248,113,113,.03));}` +
  // S003 (dev-chat ux polish) t1: the persisted resolved-outcome chip — a tool name + a decided badge
  // (green approved / red rejected via the approval btn tints). Non-actionable (no buttons).
  `.insrc-permoutcome{display:inline-flex;align-items:center;gap:9px;border:1px solid var(--border);border-radius:8px;background:#0a0d14;padding:5px 11px;max-width:100%;}` +
  `.insrc-permoutcome__tool{color:var(--fg-strong);font-family:var(--font);white-space:pre-wrap;word-break:break-word;}` +
  `.insrc-permoutcome__badge{border:1px solid var(--border-lit);border-radius:7px;padding:2px 9px;font-size:12px;line-height:1.4;}` +
  // S004 (dev-chat ux polish): the interactive selection widget (radio/checkbox chips + a confirm
  // button). Bordered like the approval card so it reads as an action; each option row is clickable,
  // the ▣/◉ glyph marks the selected state, and the confirm is disabled until ≥1 is chosen.
  `.insrc-select{border:1px solid rgba(56,189,248,.42);border-radius:10px;background:linear-gradient(180deg,rgba(56,189,248,.08),rgba(56,189,248,.02));padding:11px 13px;margin:2px 0;display:flex;flex-direction:column;gap:9px;}` +
  `.insrc-select__prompt{font-weight:600;color:var(--accent2);white-space:pre-wrap;word-break:break-word;}` +
  `.insrc-select__options{display:flex;flex-direction:column;gap:5px;}` +
  `.insrc-select__opt{display:flex;align-items:flex-start;gap:8px;cursor:pointer;border:1px solid var(--border);border-radius:7px;background:var(--panel);padding:5px 10px;}` +
  `.insrc-select__opt:hover{border-color:var(--accent2);}` +
  `.insrc-select__opt--on{border-color:rgba(56,189,248,.6);background:rgba(56,189,248,.10);}` +
  `.insrc-select__ctl{color:var(--accent2);flex:0 0 auto;line-height:1.5;user-select:none;}` +
  `.insrc-select__label{color:var(--fg);white-space:pre-wrap;word-break:break-word;}` +
  `.insrc-select__confirm{align-self:flex-start;cursor:pointer;border:1px solid rgba(56,189,248,.5);color:#bfe6fb;background:rgba(56,189,248,.12);border-radius:7px;padding:4px 14px;line-height:1.4;font-size:13px;font-family:var(--font);}` +
  `.insrc-select__confirm:hover{filter:brightness(1.15);}` +
  `.insrc-select__confirm--disabled{opacity:.45;cursor:default;filter:none;}` +
  `.insrc-select--resolved{border-color:var(--border);background:#0a0d14;}` +
  // S004: the persisted resolved-selection chip — a ✓ glyph + the chosen label(s). Non-actionable.
  `.insrc-selectoutcome{display:inline-flex;align-items:center;gap:9px;border:1px solid var(--border);border-radius:8px;background:#0a0d14;padding:5px 11px;max-width:100%;}` +
  `.insrc-selectoutcome__icon{color:var(--accent);flex:0 0 auto;}` +
  `.insrc-selectoutcome__labels{color:var(--fg-strong);font-family:var(--font);white-space:pre-wrap;word-break:break-word;}`;

/**
 * The webview-embeddable factory source. Evaluating it yields
 * `(document, line) => { register, renderRow, collapsible }`:
 *
 * - `line(s, cls?)` is the existing flat writer (chat-panel.ts), pre-registered as
 *   the 'fallback' RowRenderer so every currently-handled kind renders unchanged.
 * - `renderRow(vm)` dispatches to the registered renderer for `vm.kind`, falling
 *   back to 'fallback' for any unmapped kind (incl. the reserved 'approval-request'
 *   before S004 registers it), and — per-row isolated — falling back if a renderer
 *   throws, so one bad renderer never blanks the transcript.
 * - `collapsible(el, {defaultCollapsed})` builds the icon-only chevron (▸/▾) toggle
 *   over a 3-line-clamped body (k6 a/b), via className/textContent only (k1).
 *
 * CSP-safe: no import, no remote origin, no vscode reference, no innerHTML.
 */
export function renderRegistryWebviewSource(): string {
  return (
    `function(document,line){` +
    `var REG={};` +
    `function register(kind,fn){REG[kind]={render:fn};}` +
    `function collapsible(el,opts){` +
    `var collapsed=!!(opts&&opts.defaultCollapsed);` +
    `var wrap=document.createElement('div');` +
    `wrap.className='insrc-collapse'+(collapsed?' insrc-collapse--collapsed':'');` +
    `var chev=document.createElement('span');` +
    `chev.className='insrc-collapse__chevron';` +
    `chev.setAttribute('role','button');chev.setAttribute('aria-label','toggle');` +
    `chev.textContent=collapsed?'\\u25b8':'\\u25be';` +
    `var body=document.createElement('div');body.className='insrc-collapse__body';` +
    `if(el)body.appendChild(el);` +
    `chev.addEventListener('click',function(){` +
    `collapsed=!collapsed;` +
    `wrap.className='insrc-collapse'+(collapsed?' insrc-collapse--collapsed':'');` +
    `chev.textContent=collapsed?'\\u25b8':'\\u25be';});` +
    `wrap.appendChild(chev);wrap.appendChild(body);return wrap;}` +
    `var host={collapsible:collapsible,tokens:{}};` +
    // S004: the approval-card decision sink. chat-panel (t7) registers a callback via
    // onApprovalDecision(cb); the card buttons call it with (requestId, decision). Kept
    // as a factory-level hook so the renderer stays CSP-safe (no postMessage/vscode ref).
    `var DEC=null;function onApprovalDecision(cb){DEC=cb;}` +
    // S004: the selection-widget decision sink. chat-panel registers a callback via
    // onSelectionDecision(cb); the widget's confirm button calls it with (requestId, selectedIds).
    // Factory-level hook so the renderer stays CSP-safe (no postMessage/vscode ref).
    `var SDEC=null;function onSelectionDecision(cb){SDEC=cb;}` +
    // S003 t2: a message row is role-classed (user vs assistant tone, ac1) and, when long
    // (>3 lines or a long single line), its content is wrapped in the sc1 collapse primitive
    // (default-collapsed 3-line preview, ac2). Short messages render un-wrapped. textContent only (k1).
    `function isLong(s){s=s||'';return s.split('\\n').length>3||s.length>240;}` +
    // S001 (bugfix): the mock's role label — 'you \\u276f' (user) / '\\u25c6 claude' (assistant),
    // the glyph on the outer edge. Spans only (the fake DOM has no createTextNode); textContent (k1).
    `function whoRow(role,glyph,label){` +
    `var w=document.createElement('div');w.className='insrc-who insrc-who--'+role;` +
    `var g=document.createElement('span');g.className='insrc-glyph';g.textContent=glyph;` +
    `var l=document.createElement('span');l.className='insrc-wholabel';l.textContent=label;` +
    `if(role==='user'){w.appendChild(l);w.appendChild(g);}else{w.appendChild(g);w.appendChild(l);}` +
    `return w;}` +
    // S001 (bugfix): a message row is the mock's `.msg` — a `.who` role label above a bordered
    // `.bubble` (user right-aligned blue card / assistant magenta-left-border card, k5). Long text
    // (or an inner widget) collapses to a 3-line preview via the sc1 chevron primitive (ac2). The
    // outer wrap is line('') so it is appended to the transcript + returned for keyed reconcile.
    `function msgRow(vm,host,role,inner){` +
    `var raw=vm&&vm.text!=null?vm.text:'';` +
    `var wrap=line('');wrap.textContent='';wrap.className='insrc-msg insrc-msg--'+role;` +
    `wrap.appendChild(role==='user'?whoRow('user','\\u276f','you'):whoRow('assistant','\\u25c6','claude'));` +
    `var bubble=document.createElement('div');bubble.className='insrc-bubble insrc-bubble--'+role;` +
    // ISSUE-b1c7c1bc: the ASSISTANT row is never default-collapsed, however long it runs (S001 ac3:
    // 'the assistant-text renderer is NOT default-collapsed (rendered in full)'). Collapsing is a
    // TOOL-output affordance — it exists so long command output can't bury the conversation — and
    // burying the model's own answer behind a chevron was never its job. The user row keeps
    // collapsing when long (a deliberate narrowing: long pastes stay previewable). host.collapsible
    // itself is untouched and still serves tool-command, tool-result and caption rows.
    `var content=inner||null;var longMsg=isLong(raw)&&role!=='assistant';` +
    `if(content){bubble.appendChild(longMsg?host.collapsible(content,{defaultCollapsed:true}):content);}` +
    `else if(longMsg){var c=document.createElement('div');c.textContent=raw;bubble.appendChild(host.collapsible(c,{defaultCollapsed:true}));}` +
    `else{bubble.textContent=raw;}` +
    `wrap.appendChild(bubble);return wrap;}` +
    // S001 (bugfix): assistant content is rendered by the bundled `marked` library (GFM: tables,
    // ordered/nested lists, code, blockquotes — replacing the incomplete hand-rolled parser). BT is
    // the backtick char (built at runtime so the source carries no literal backtick).
    `var BT=String.fromCharCode(96);` +
    // guardMd: marked escapes text, and the strict CSP (default-src 'none'; scripts nonce-only)
    // neutralizes injected scripts/handlers/resource loads — but belt-and-suspenders, scrub every
    // rendered node: drop non-http(s) link hrefs, open the rest safely, and strip image sources.
    `function guardMd(el){try{` +
    `var as=el.querySelectorAll('a');for(var i=0;i<as.length;i++){var hr=as[i].getAttribute('href')||'';if(/^https?:/i.test(hr)){as[i].setAttribute('rel','noopener noreferrer');as[i].setAttribute('target','_blank');}else{as[i].removeAttribute('href');}}` +
    `var ig=el.querySelectorAll('img');for(var j=0;j<ig.length;j++){ig[j].removeAttribute('src');ig[j].removeAttribute('srcset');}` +
    `}catch(e){}}` +
    // renderAssistantMd: marked.parse(raw) -> HTML assigned via innerHTML (k1 relaxed to a library
    // render, kept safe by marked's escaping + the CSP + guardMd). A top-level JSON value is
    // pretty-printed into a ```json code block so it renders as highlighted-ish code, not flat text.
    `function renderAssistantMd(raw){` +
    `var src=raw||'';var t=src.trim();` +
    `if(t&&(t.charAt(0)==='{'||t.charAt(0)==='[')){try{var p=JSON.parse(t);src=BT+BT+BT+'json\\n'+JSON.stringify(p,null,2)+'\\n'+BT+BT+BT;}catch(e){}}` +
    `var div=document.createElement('div');div.className='insrc-md';` +
    `try{div.innerHTML=(typeof marked!=='undefined'&&marked&&marked.parse)?marked.parse(src,{gfm:true,breaks:false,headerIds:false,mangle:false}):src;guardMd(div);}catch(e){div.textContent=src;}` +
    `return div;}` +
    `function renderRow(vm){` +
    `var r=(vm&&REG[vm.kind])||REG.fallback;` +
    `try{return r.render(vm,host);}` +
    `catch(e){try{return REG.fallback.render(vm,host);}catch(_){return null;}}}` +
    // toViewModel: single-sourced mirror of the host toViewModel (render-registry.ts); a parity
    // test pins the two together. Pure: derives the row from a transcript entry or a live event.
    `function toViewModel(entry){` +
    `if(!entry)return {kind:'fallback',text:'',collapsible:false};` +
    `if('role' in entry){` +
    `if(entry.role==='user')return {kind:'user',role:'user',text:entry.text,collapsible:true};` +
    `if(entry.role==='assistant')return {kind:'assistant-text',role:'assistant',text:entry.text,collapsible:true};` +
    // S001 (dev-chat ux polish): a replayed tool-result row -> the structured tool-result view-model.
    `if(entry.role==='tool-result')return {kind:'tool-result',text:entry.command!=null?entry.command:'',collapsible:true,meta:{command:entry.command,output:entry.output}};` +
    // S003 (dev-chat ux polish): a replayed permission-outcome row -> the resolved-chip view-model.
    `if(entry.role==='permission-outcome')return {kind:'permission-outcome',text:entry.toolName,collapsible:false,meta:{toolName:entry.toolName,decision:entry.decision}};` +
    // S004 (dev-chat ux polish): a replayed selection-outcome row -> the resolved-chip view-model.
    `if(entry.role==='selection-outcome')return {kind:'selection-outcome',text:(entry.chosen||[]).join(', '),collapsible:false,meta:{chosen:entry.chosen}};` +
    // ISSUE-1163888072faa9f2: a persisted tool-call marker replays as the tool row (parity with host).
    `if(entry.role==='marker'&&entry.cssClass===${JSON.stringify(MARKER_CLASS.tool)})return {kind:'tool-command',text:entry.text,collapsible:false};` +
    `return entry.cssClass!==undefined?{kind:'fallback',text:entry.text,cssClass:entry.cssClass,collapsible:false}:{kind:'fallback',text:entry.text,collapsible:false};}` +
    `if(entry.kind==='assistant-delta')return {kind:'assistant-text',role:'assistant',text:entry.text,collapsible:true};` +
    `if(entry.kind==='tool-call'){var label=entry.command!=null?entry.command:(entry.mcp?(entry.mcp.server+' \\u00b7 '+entry.mcp.name):entry.tool);return entry.callId!==undefined?{kind:'tool-command',text:label,collapsible:false,meta:{callId:entry.callId}}:{kind:'tool-command',text:label,collapsible:false};}` +
    // S001 (dev-chat ux polish): a live tool-result event -> the SAME structured view-model (parity).
    `if(entry.kind==='tool-result')return {kind:'tool-result',text:entry.command!=null?entry.command:'',collapsible:true,meta:entry.callId!==undefined?{command:entry.command,output:entry.output,callId:entry.callId}:{command:entry.command,output:entry.output}};` +
    // S003 (dev-chat ux polish): a live permission-outcome event -> the SAME resolved-chip view-model (parity).
    `if(entry.kind==='permission-outcome')return {kind:'permission-outcome',text:entry.toolName,collapsible:false,meta:{toolName:entry.toolName,decision:entry.decision}};` +
    // S004 (dev-chat ux polish): a live selection-request event -> the card view-model (parity with host).
    `if(entry.kind==='selection-request')return {kind:'selection-request',text:entry.prompt,collapsible:false,meta:{prompt:entry.prompt,options:entry.options,requestId:entry.requestId,multi:entry.multi===true}};` +
    // S004 (dev-chat ux polish): a live selection-outcome event -> the SAME resolved-chip view-model (parity).
    `if(entry.kind==='selection-outcome')return {kind:'selection-outcome',text:(entry.chosen||[]).join(', '),collapsible:false,meta:{chosen:entry.chosen}};` +
    `return {kind:'fallback',text:'',collapsible:false};}` +
    // 'fallback' is the existing flat writer: byte-identical to the pre-sc1 render (k2).
    // ISSUE-1163888072faa9f2: a turn's done/error marker (live or replayed) settles its tool rows, so a
    // call that never got a result can't absorb a later turn's result.
    `register('fallback',function(vm){var cc=vm&&vm.cssClass;` +
    `if(cc===${JSON.stringify(MARKER_CLASS.done)}||cc===${JSON.stringify(MARKER_CLASS.error)})PEND=[];` +
    `return line(vm&&vm.text!=null?vm.text:'',cc);});` +
    // t4 renderers. user/assistant-text render the plain text through line() (the S003 story
    // adds role differentiation + collapse-by-default via the collapsible primitive). The
    // tool-command renderer shows the real command INLINE with the sc1 tool tone and is NEVER
    // collapsed (k6 d).
    // S003 t2: role-differentiated + collapse-when-long (ac1/ac2). t3 extends assistant-text with
    // content-type widgets by passing an inner node to msgRow.
    // ISSUE-1163888072faa9f2: a user row opens a new turn — settle any tool rows left pending (a
    // cancelled turn persists no done/error marker), so a replay never attaches across turns.
    `register('user',function(vm,host){PEND=[];return msgRow(vm,host,'user');});` +
    `register('assistant-text',function(vm,host){return msgRow(vm,host,'assistant',renderAssistantMd(vm&&vm.text));});` +
    // S001 (bugfix): tool-call surfaces the REAL command in the mock's bordered `.toolrow` under a
    // '\\u25b8 tool' role label, with a green `$` prompt (k5 ac3). textContent (k1).
    // ISSUE-1163888072faa9f2: a long command (isLong) collapses to a 3-line preview via the sc1
    // chevron; the row node itself is never a collapse wrapper. Each row is queued in PEND so its
    // tool-result attaches to it instead of drawing a second row that repeats the command.
    `var PEND=[];` +
    `function toolCmd(raw,host){` +
    `var cmd=document.createElement('span');cmd.className='insrc-toolrow__cmd';` +
    `var p=document.createElement('span');p.className='insrc-toolrow__prompt';p.textContent='$';cmd.appendChild(p);` +
    `var txt=document.createElement('span');txt.textContent=' '+raw;cmd.appendChild(txt);` +
    `return isLong(raw)?host.collapsible(cmd,{defaultCollapsed:true}):cmd;}` +
    `function toolRow(vm,host){` +
    `var raw=vm&&vm.text!=null?vm.text:'';` +
    `var wrap=line('');wrap.textContent='';wrap.className='insrc-msg insrc-msg--tool';` +
    `wrap.appendChild(whoRow('tool','\\u25b8','tool'));` +
    `var box=document.createElement('div');box.className='insrc-toolrow';` +
    `var head=toolCmd(raw,host);box.appendChild(head);wrap.appendChild(box);` +
    `var cid=vm&&vm.meta&&vm.meta.callId!=null?String(vm.meta.callId):'';` +
    `PEND.push({wrap:wrap,box:box,head:head,cmd:raw,id:cid});if(PEND.length>32)PEND.shift();return wrap;}` +
    `register('tool-command',function(vm,host){return toolRow(vm,host);});` +
    // S003 t4: tool results + inline diffs collapse to their caption header via the SAME sc1
    // chevron primitive (k6 c). A caption line stays visible; the body is default-collapsed.
    `function captionRow(vm,host,caption){` +
    `var d=line('');d.className='insrc-msg';` +
    `var cap=document.createElement('div');cap.className='insrc-caption';cap.textContent=caption;` +
    `var body=document.createElement('div');body.textContent=vm&&vm.text!=null?vm.text:'';` +
    `d.textContent='';d.appendChild(cap);d.appendChild(host.collapsible(body,{defaultCollapsed:true}));` +
    `return d;}` +
    `register('inline-diff',function(vm,host){return captionRow(vm,host,(vm&&vm.meta&&vm.meta.caption)||'diff');});` +
    // S001 (dev-chat ux polish): a tool-result row shows the command line (always visible), a visual
    // separator, then the output collapsed to a ~3-line preview (ONLY the output is wrapped in the
    // sc1 collapse primitive; the command stays outside it). className/textContent only (k1, CSP-safe).
    // ISSUE-1163888072faa9f2: pair the result with its pending tool row and attach the separator +
    // collapsed output INSIDE it. A result carrying a call id pairs ONLY with the row of that id (an
    // Edit/Write result has no tool row, so it stays standalone). An id-less result (replay, or a
    // provider without ids) pairs among id-less rows: same command first, else the oldest (a replayed
    // row is labelled by tool name). An unpaired result draws the standalone command + output row below.
    `function takePending(cmd,id){var k;` +
    `if(id!==''){for(k=0;k<PEND.length;k++){if(PEND[k].id===id)return PEND.splice(k,1)[0];}return null;}` +
    `var first=-1;for(k=0;k<PEND.length;k++){if(PEND[k].id!=='')continue;if(first<0)first=k;if(cmd!==''&&PEND[k].cmd===cmd)return PEND.splice(k,1)[0];}` +
    `return first<0?null:PEND.splice(first,1)[0];}` +
    `function toolResultRow(vm,host){` +
    `var meta=(vm&&vm.meta)||{};` +
    `var cmd=meta.command!=null?String(meta.command):'';` +
    `var output=meta.output!=null?String(meta.output):'';` +
    `var pend=takePending(cmd,meta.callId!=null?String(meta.callId):'');` +
    `if(pend){pend.box.className='insrc-toolrow insrc-toolrow--result';` +
    // A replayed row is labelled by tool name; show the real command once the result carries it.
    `if(cmd!==''&&cmd!==pend.cmd){pend.box.removeChild(pend.head);pend.box.appendChild(toolCmd(cmd,host));}` +
    `var ps=document.createElement('div');ps.className='insrc-toolresult__sep';pend.box.appendChild(ps);` +
    `var po=document.createElement('div');po.className='insrc-toolresult__out';po.textContent=output;` +
    `pend.box.appendChild(host.collapsible(po,{defaultCollapsed:true}));return pend.wrap;}` +
    `var wrap=line('');wrap.textContent='';wrap.className='insrc-msg insrc-msg--toolresult';` +
    `if(cmd!==''){var c=document.createElement('div');c.className='insrc-toolresult__cmd';` +
    `var p=document.createElement('span');p.className='insrc-toolresult__prompt';p.textContent='$';c.appendChild(p);` +
    `var ct=document.createElement('span');ct.textContent=' '+cmd;c.appendChild(ct);wrap.appendChild(c);}` +
    `var sep=document.createElement('div');sep.className='insrc-toolresult__sep';wrap.appendChild(sep);` +
    `var out=document.createElement('div');out.className='insrc-toolresult__out';out.textContent=output;` +
    `wrap.appendChild(host.collapsible(out,{defaultCollapsed:true}));return wrap;}` +
    `register('tool-result',function(vm,host){return toolResultRow(vm,host);});` +
    // S004: the approval card (k6 i). requestId/title/detail ride vm.meta (chat-panel's live
    // handler builds the vm from an ApprovalRequestEvent). Icon-only approve(\\u2713)/deny(\\u2717)
    // buttons call the decision sink with (requestId, decision). textContent/className only (k1).
    `register('approval',function(vm){` +
    `var meta=(vm&&vm.meta)||{};` +
    `var rid=meta.requestId!=null?String(meta.requestId):'';` +
    `var card=document.createElement('div');card.className='insrc-approval';card.setAttribute('data-request-id',rid);` +
    `var title=document.createElement('div');title.className='insrc-approval__title';` +
    `title.textContent=meta.title!=null?String(meta.title):((vm&&vm.text)||'Permission request');card.appendChild(title);` +
    `if(meta.detail!=null&&String(meta.detail)!==''){var det=document.createElement('div');det.className='insrc-approval__detail';det.textContent=String(meta.detail);card.appendChild(det);}` +
    `var actions=document.createElement('div');actions.className='insrc-approval__actions';` +
    `var approve=document.createElement('button');approve.className='insrc-approval__btn insrc-approval__btn--approve';` +
    `approve.setAttribute('aria-label','approve');approve.setAttribute('title','Approve');approve.textContent='\\u2713';` +
    `var deny=document.createElement('button');deny.className='insrc-approval__btn insrc-approval__btn--deny';` +
    `deny.setAttribute('aria-label','deny');deny.setAttribute('title','Deny');deny.textContent='\\u2717';` +
    // S003 (dev-chat ux polish) ac1: once decided, stamp the card with a resolved class (green
    // approved / red rejected) and REMOVE the actions element so the buttons disappear and the
    // card reads as a settled outcome (the pending card is live-only, never persisted).
    `function resolve(dec){try{card.className='insrc-approval insrc-approval--'+(dec==='approve'?'approved':'rejected');if(actions)card.removeChild(actions);}catch(e){}}` +
    `approve.addEventListener('click',function(){resolve('approve');if(DEC)DEC(rid,'approve');});` +
    `deny.addEventListener('click',function(){resolve('deny');if(DEC)DEC(rid,'deny');});` +
    `actions.appendChild(approve);actions.appendChild(deny);card.appendChild(actions);` +
    `return card;});` +
    // S003 (dev-chat ux polish) t1: the resolved permission-outcome chip — a persisted, non-actionable
    // row (tool name + a decided badge, green approved / red rejected via the approval btn tints). Built
    // via line() so it self-appends (like tool-result), so the live turn-event + replay paths agree.
    `register('permission-outcome',function(vm){` +
    `var meta=(vm&&vm.meta)||{};` +
    `var tool=meta.toolName!=null?String(meta.toolName):'';` +
    `var approved=meta.decision==='approved';` +
    `var wrap=line('');wrap.textContent='';wrap.className='insrc-msg insrc-msg--permoutcome';` +
    `var chip=document.createElement('div');chip.className='insrc-permoutcome insrc-permoutcome--'+(approved?'approved':'rejected');` +
    `var name=document.createElement('span');name.className='insrc-permoutcome__tool';name.textContent=tool;chip.appendChild(name);` +
    `var badge=document.createElement('span');badge.className='insrc-permoutcome__badge insrc-approval__btn--'+(approved?'approve':'deny');` +
    `badge.textContent=approved?'\\u2713 approved':'\\u2717 rejected';chip.appendChild(badge);` +
    `wrap.appendChild(chip);return wrap;});` +
    // S004 (dev-chat ux polish): the interactive selection widget. prompt/options/multi/requestId ride
    // vm.meta. Controls are keyed by ARRAY INDEX (so duplicate option ids still render distinctly);
    // multi:false -> single-select (choosing one clears the others), multi:true -> multi-select. A
    // confirm button (disabled until >=1 chosen) calls the SDEC sink with (requestId, selectedIds).
    // Built via line() so it self-appends (like tool-result). textContent/className only (k1).
    `register('selection-request',function(vm){` +
    `var meta=(vm&&vm.meta)||{};` +
    `var rid=meta.requestId!=null?String(meta.requestId):'';` +
    `var options=Array.isArray(meta.options)?meta.options:[];` +
    `var multi=meta.multi===true;` +
    `var wrap=line('');wrap.textContent='';wrap.className='insrc-msg insrc-msg--selection';` +
    `var card=document.createElement('div');card.className='insrc-select';card.setAttribute('data-request-id',rid);` +
    `var promptEl=document.createElement('div');promptEl.className='insrc-select__prompt';promptEl.textContent=meta.prompt!=null?String(meta.prompt):'';card.appendChild(promptEl);` +
    `var list=document.createElement('div');list.className='insrc-select__options';` +
    `var state=[];var setters=[];` +
    `var confirm=document.createElement('button');` +
    `function anyOn(){for(var a=0;a<state.length;a++){if(state[a])return true;}return false;}` +
    `function refresh(){var none=!anyOn();confirm.disabled=none;confirm.className='insrc-select__confirm'+(none?' insrc-select__confirm--disabled':'');confirm.setAttribute('aria-disabled',none?'true':'false');}` +
    `options.forEach(function(o,i){` +
    `state[i]=false;` +
    `var row=document.createElement('div');row.className='insrc-select__opt';` +
    `var ctl=document.createElement('span');ctl.className='insrc-select__ctl';ctl.setAttribute('role',multi?'checkbox':'radio');` +
    `var lbl=document.createElement('span');lbl.className='insrc-select__label';lbl.textContent=o&&o.label!=null?String(o.label):'';` +
    `function paint(){ctl.textContent=state[i]?(multi?'\\u2611':'\\u25c9'):(multi?'\\u2610':'\\u25cb');ctl.setAttribute('aria-checked',state[i]?'true':'false');row.className='insrc-select__opt'+(state[i]?' insrc-select__opt--on':'');}` +
    `setters[i]=function(on){state[i]=on;paint();};paint();` +
    `row.addEventListener('click',function(){if(multi){setters[i](!state[i]);}else{for(var j=0;j<setters.length;j++){setters[j](false);}setters[i](true);}refresh();});` +
    `row.appendChild(ctl);row.appendChild(lbl);list.appendChild(row);});` +
    `card.appendChild(list);` +
    `confirm.textContent='confirm';confirm.setAttribute('aria-label','confirm selection');` +
    `confirm.addEventListener('click',function(){` +
    `if(confirm.disabled)return;` +
    `var chosen=[];for(var i=0;i<state.length;i++){if(state[i]){var o=options[i]||{};chosen.push(o.id!=null?String(o.id):String(i));}}` +
    `if(chosen.length===0)return;` +
    `if(SDEC)SDEC(rid,chosen);` +
    `try{card.className='insrc-select insrc-select--resolved';if(list.parentNode===card)card.removeChild(list);if(confirm.parentNode===card)card.removeChild(confirm);}catch(e){}});` +
    `refresh();card.appendChild(confirm);` +
    `wrap.appendChild(card);return wrap;});` +
    // S004 (dev-chat ux polish): the persisted resolved-selection chip — a ✓ glyph + the chosen
    // label(s), non-actionable (no controls). Built via line() so it self-appends (like tool-result).
    `register('selection-outcome',function(vm){` +
    `var meta=(vm&&vm.meta)||{};` +
    `var chosen=Array.isArray(meta.chosen)?meta.chosen:[];` +
    `var wrap=line('');wrap.textContent='';wrap.className='insrc-msg insrc-msg--selectoutcome';` +
    `var chip=document.createElement('div');chip.className='insrc-selectoutcome';` +
    `var icon=document.createElement('span');icon.className='insrc-selectoutcome__icon';icon.textContent='\\u2713';chip.appendChild(icon);` +
    `var txt=document.createElement('span');txt.className='insrc-selectoutcome__labels';txt.textContent=chosen.map(function(c){return String(c);}).join(', ');chip.appendChild(txt);` +
    `wrap.appendChild(chip);return wrap;});` +
    // S001 t5 (lc1): keyed append. A row rendered with a key is remembered; re-appending the
    // SAME key (a live echo and its session-restored twin) reconciles to the one existing node
    // instead of double-rendering. resetKeys() is called when the transcript is cleared on
    // session-restored, so the fresh replay re-keys from an empty map.
    `var KEYS={};` +
    `function appendKeyed(vm,key){if(key==null)return renderRow(vm);if(KEYS[key])return KEYS[key];var n=renderRow(vm);if(n)KEYS[key]=n;return n;}` +
    `function resetKeys(){KEYS={};PEND=[];}` +
    `return {register:register,renderRow:renderRow,collapsible:collapsible,toViewModel:toViewModel,appendKeyed:appendKeyed,resetKeys:resetKeys,onApprovalDecision:onApprovalDecision,onSelectionDecision:onSelectionDecision};}`
  );
}
