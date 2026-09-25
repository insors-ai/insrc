/**
 * Story E20260925edb76e2e:S004 — per-turn lifecycle marker mapper.
 *
 * A pure, vscode-free mapper from the sc2 {@link TurnEvent} union to the sc1
 * terminal marker classes (defined by renderTerminalStyle in design-tokens.ts).
 * S004 owns NO shared contract — it consumes sc1 (marker glyph/tone classes),
 * sc2 (TurnEvent) and rides the existing sc3 'turn-event' message unchanged. It
 * is a PASSTHROUGH: it only observes + maps an event; it never invokes an insrc
 * workflow/MCP tool (k8).
 *
 * Single-source: {@link markerFor} (the host path) and {@link markerWebviewSource}
 * (the inline webview path) both derive their cssClass from the ONE
 * {@link MARKER_CLASS} table, so the host transcript rows and the live webview
 * markers can never disagree (a parity test in markers.test.ts pins the labels).
 */
import type { TurnEvent } from './stream-events.js';

/** The S004-internal marker descriptor: a valid sc1 marker class + the enriched line text. */
export interface MarkerLine {
  readonly cssClass: string;
  readonly label: string;
}

/**
 * The five sc1 marker classes renderTerminalStyle (design-tokens.ts) defines with
 * a ::before glyph + phosphor tone. The single source of the cssClass values used
 * by BOTH the host markerFor and the inline webview mapper.
 */
export const MARKER_CLASS = Object.freeze({
  pending: 'insrc-term__marker--pending',
  tool: 'insrc-term__marker--tool',
  edit: 'insrc-term__marker--edit',
  done: 'insrc-term__marker--done',
  error: 'insrc-term__marker--error',
} as const);

/**
 * Map one sc2 TurnEvent to a terminal lifecycle marker, or null for events that
 * render as plain text (assistant-delta) or that this version does not map (a
 * future/unknown kind — adapter drift). Pure + total + deterministic; no I/O, no
 * vscode import; never invokes a workflow/MCP tool (k8).
 */
export function markerFor(event: TurnEvent): MarkerLine | null {
  switch (event.kind) {
    case 'assistant-delta':
      return null;
    case 'status':
      switch (event.phase) {
        case 'thinking':
          return { cssClass: MARKER_CLASS.pending, label: 'thinking…' };
        case 'streaming':
          return { cssClass: MARKER_CLASS.pending, label: 'streaming…' };
        case 'tool':
          return { cssClass: MARKER_CLASS.tool, label: 'running tool…' };
        case 'editing':
          return { cssClass: MARKER_CLASS.edit, label: 'editing…' };
        default: {
          const _never: never = event.phase;
          void _never;
          return null;
        }
      }
    case 'tool-call':
      return {
        cssClass: MARKER_CLASS.tool,
        label: event.mcp ? `${event.mcp.server} · ${event.mcp.name}` : event.tool,
      };
    case 'file-edit':
      return { cssClass: MARKER_CLASS.edit, label: event.path };
    case 'done':
      return { cssClass: MARKER_CLASS.done, label: event.ok ? 'done' : 'done (failed)' };
    case 'error':
      return { cssClass: MARKER_CLASS.error, label: event.message };
    default: {
      // A future sc2 kind added before S004 catches up: skip it (no marker), never throw.
      const _never: never = event;
      void _never;
      return null;
    }
  }
}

/**
 * The webview-embeddable mirror of {@link markerFor}: a JS function-source string
 * `(event) => { cssClass, label } | null` the S003 webview bootstrap embeds inline
 * (inside the one nonce'd script), so the live webview computes markers with the
 * SAME logic as the host. The cssClass values are interpolated from
 * {@link MARKER_CLASS}, so the two paths share one source; a parity test executes
 * both and asserts equality. CSP-safe: no import, no remote origin, no vscode ref.
 */
export function markerWebviewSource(): string {
  const c = MARKER_CLASS;
  return (
    `function(event){` +
    `if(!event||typeof event.kind!=='string')return null;` +
    `var k=event.kind;` +
    `if(k==='assistant-delta')return null;` +
    `if(k==='status'){` +
    `if(event.phase==='thinking')return{cssClass:${JSON.stringify(c.pending)},label:'thinking…'};` +
    `if(event.phase==='streaming')return{cssClass:${JSON.stringify(c.pending)},label:'streaming…'};` +
    `if(event.phase==='tool')return{cssClass:${JSON.stringify(c.tool)},label:'running tool…'};` +
    `if(event.phase==='editing')return{cssClass:${JSON.stringify(c.edit)},label:'editing…'};` +
    `return null;}` +
    `if(k==='tool-call')return{cssClass:${JSON.stringify(c.tool)},label:event.mcp?(event.mcp.server+' · '+event.mcp.name):event.tool};` +
    `if(k==='file-edit')return{cssClass:${JSON.stringify(c.edit)},label:event.path};` +
    `if(k==='done')return{cssClass:${JSON.stringify(c.done)},label:event.ok?'done':'done (failed)'};` +
    `if(k==='error')return{cssClass:${JSON.stringify(c.error)},label:event.message};` +
    `return null;}`
  );
}
