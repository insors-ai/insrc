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
 * - event 'assistant-delta'     -> { kind:'assistant-text', role:'assistant' } (ac2)
 * - event 'tool-call'           -> { kind:'tool-command', text: command ?? tool/mcp } (ac3, never collapsed)
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
    return { kind: 'tool-command', text: label, collapsible: false };
  }
  // S001 (dev-chat ux polish): a live tool-result event -> the SAME structured view-model as its
  // replayed transcript twin (dual-input parity, a test pins the two).
  if (entry.kind === 'tool-result') {
    return { kind: 'tool-result', text: entry.command ?? '', collapsible: true, meta: { command: entry.command, output: entry.output } };
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
  // S004: the in-chat permission-approval card (k6 i). Icon-only approve/deny buttons
  // (▹ green ✓ / red ✗); the whole card is bordered to read as an action, not prose.
  `.insrc-approval{border:1px solid rgba(251,191,36,.45);border-radius:10px;background:linear-gradient(180deg,rgba(251,191,36,.09),rgba(251,191,36,.03));padding:11px 13px;margin:2px 0;display:flex;flex-direction:column;gap:9px;}` +
  `.insrc-approval__title{font-weight:600;color:var(--amber);display:flex;align-items:center;gap:8px;}` +
  `.insrc-approval__detail{color:var(--fg);font-size:13px;white-space:pre-wrap;word-break:break-word;}` +
  `.insrc-approval__actions{display:flex;gap:8px;flex-wrap:wrap;}` +
  `.insrc-approval__btn{cursor:pointer;border:1px solid var(--border-lit);background:var(--panel);color:var(--fg);border-radius:7px;padding:4px 12px;line-height:1.4;font-size:13px;font-family:var(--font);}` +
  `.insrc-approval__btn--approve{border-color:rgba(74,222,128,.5);color:#bff3d3;background:rgba(74,222,128,.12);}` +
  `.insrc-approval__btn--deny{border-color:rgba(248,113,113,.5);color:#f6bcbc;background:rgba(248,113,113,.10);}` +
  `.insrc-approval__btn:hover{filter:brightness(1.15);}`;

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
    `var content=inner||null;var longMsg=isLong(raw);` +
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
    `return entry.cssClass!==undefined?{kind:'fallback',text:entry.text,cssClass:entry.cssClass,collapsible:false}:{kind:'fallback',text:entry.text,collapsible:false};}` +
    `if(entry.kind==='assistant-delta')return {kind:'assistant-text',role:'assistant',text:entry.text,collapsible:true};` +
    `if(entry.kind==='tool-call'){var label=entry.command!=null?entry.command:(entry.mcp?(entry.mcp.server+' \\u00b7 '+entry.mcp.name):entry.tool);return {kind:'tool-command',text:label,collapsible:false};}` +
    // S001 (dev-chat ux polish): a live tool-result event -> the SAME structured view-model (parity).
    `if(entry.kind==='tool-result')return {kind:'tool-result',text:entry.command!=null?entry.command:'',collapsible:true,meta:{command:entry.command,output:entry.output}};` +
    `return {kind:'fallback',text:'',collapsible:false};}` +
    // 'fallback' is the existing flat writer: byte-identical to the pre-sc1 render (k2).
    `register('fallback',function(vm){return line(vm&&vm.text!=null?vm.text:'',vm&&vm.cssClass);});` +
    // t4 renderers. user/assistant-text render the plain text through line() (the S003 story
    // adds role differentiation + collapse-by-default via the collapsible primitive). The
    // tool-command renderer shows the real command INLINE with the sc1 tool tone and is NEVER
    // collapsed (k6 d).
    // S003 t2: role-differentiated + collapse-when-long (ac1/ac2). t3 extends assistant-text with
    // content-type widgets by passing an inner node to msgRow.
    `register('user',function(vm,host){return msgRow(vm,host,'user');});` +
    `register('assistant-text',function(vm,host){return msgRow(vm,host,'assistant',renderAssistantMd(vm&&vm.text));});` +
    // S001 (bugfix): tool-call surfaces the REAL command in the mock's bordered `.toolrow` under a
    // '\\u25b8 tool' role label, with a green `$` prompt (k5 ac3). Never collapsed (k6 d). textContent (k1).
    `function toolRow(vm){` +
    `var raw=vm&&vm.text!=null?vm.text:'';` +
    `var wrap=line('');wrap.textContent='';wrap.className='insrc-msg insrc-msg--tool';` +
    `wrap.appendChild(whoRow('tool','\\u25b8','tool'));` +
    `var box=document.createElement('div');box.className='insrc-toolrow';` +
    `var cmd=document.createElement('span');cmd.className='insrc-toolrow__cmd';` +
    `var p=document.createElement('span');p.className='insrc-toolrow__prompt';p.textContent='$';cmd.appendChild(p);` +
    `var txt=document.createElement('span');txt.textContent=' '+raw;cmd.appendChild(txt);` +
    `box.appendChild(cmd);wrap.appendChild(box);return wrap;}` +
    `register('tool-command',function(vm){return toolRow(vm);});` +
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
    `function toolResultRow(vm,host){` +
    `var meta=(vm&&vm.meta)||{};` +
    `var cmd=meta.command!=null?String(meta.command):'';` +
    `var output=meta.output!=null?String(meta.output):'';` +
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
    `approve.addEventListener('click',function(){if(DEC)DEC(rid,'approve');});` +
    `deny.addEventListener('click',function(){if(DEC)DEC(rid,'deny');});` +
    `actions.appendChild(approve);actions.appendChild(deny);card.appendChild(actions);` +
    `return card;});` +
    // S001 t5 (lc1): keyed append. A row rendered with a key is remembered; re-appending the
    // SAME key (a live echo and its session-restored twin) reconciles to the one existing node
    // instead of double-rendering. resetKeys() is called when the transcript is cleared on
    // session-restored, so the fresh replay re-keys from an empty map.
    `var KEYS={};` +
    `function appendKeyed(vm,key){if(key==null)return renderRow(vm);if(KEYS[key])return KEYS[key];var n=renderRow(vm);if(n)KEYS[key]=n;return n;}` +
    `function resetKeys(){KEYS={};}` +
    `return {register:register,renderRow:renderRow,collapsible:collapsible,toViewModel:toViewModel,appendKeyed:appendKeyed,resetKeys:resetKeys,onApprovalDecision:onApprovalDecision};}`
  );
}
