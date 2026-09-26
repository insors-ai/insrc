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
  `.insrc-collapse--collapsed .insrc-collapse__body{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}`;

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
    `return entry.cssClass!==undefined?{kind:'fallback',text:entry.text,cssClass:entry.cssClass,collapsible:false}:{kind:'fallback',text:entry.text,collapsible:false};}` +
    `if(entry.kind==='assistant-delta')return {kind:'assistant-text',role:'assistant',text:entry.text,collapsible:true};` +
    `if(entry.kind==='tool-call'){var label=entry.command!=null?entry.command:(entry.mcp?(entry.mcp.server+' \\u00b7 '+entry.mcp.name):entry.tool);return {kind:'tool-command',text:label,collapsible:false};}` +
    `return {kind:'fallback',text:'',collapsible:false};}` +
    // 'fallback' is the existing flat writer: byte-identical to the pre-sc1 render (k2).
    `register('fallback',function(vm){return line(vm&&vm.text!=null?vm.text:'',vm&&vm.cssClass);});` +
    // t4 renderers. user/assistant-text render the plain text through line() (the S003 story
    // adds role differentiation + collapse-by-default via the collapsible primitive). The
    // tool-command renderer shows the real command INLINE with the sc1 tool tone and is NEVER
    // collapsed (k6 d).
    `register('user',function(vm){return line(vm.text);});` +
    `register('assistant-text',function(vm){return line(vm.text);});` +
    `register('tool-command',function(vm){return line(vm.text,'insrc-term__marker--tool');});` +
    `return {register:register,renderRow:renderRow,collapsible:collapsible,toViewModel:toViewModel};}`
  );
}
