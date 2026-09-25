/**
 * Story E20260925edb76e2e:S001 / sc1 — the terminal-UX design tokens + renderer.
 *
 * The single source of the in-editor chat's terminal look & feel (k6): monospace,
 * box-drawing chrome, phosphor-green accents from the insrc docs-site TUI
 * (site/css/tui.css). Every rendered surface (S003 chat panel, S004 markers, S005
 * dropdowns, S006 inline-diff, S007 docs-review) consumes THIS module, so the whole
 * experience is terminal-styled and never a chat-bubble UI.
 *
 * vscode-free + dependency-free: the tokens are plain typed values and
 * `renderTerminalStyle` is a pure token->CSS function. The webview's only styling
 * path is an inlined <style> string assigned to `panel.webview.html`
 * (vscode-plugin/src/panels/webview-host.ts:420 / extension.ts:316) — there is no
 * asWebviewUri / external-stylesheet pipeline — so the renderer returns a complete,
 * self-contained <style> element that S003 drops straight in. Each token maps to a
 * VS Code theme variable with the tui.css literal as the fallback
 * (`var(--vscode-<token>, <literal>)`), so the palette layers over the user's theme
 * yet renders the terminal look on its own (as the mockups show).
 */

export interface TerminalTheme {
  readonly font: { mono: string; sizePx: number; linePx: number };
  readonly color: { bg: string; fg: string; dim: string; accent: string; warn: string; err: string; sel: string };
  readonly chrome: { border: string; boxChars: { h: string; v: string; tl: string; tr: string; bl: string; br: string } };
  readonly marker: { pending: string; toolCall: string; edit: string; done: string; error: string };
}

/** The terminal surfaces sc1 styles. Every UI story targets exactly one of these. */
export type SurfaceKind = 'chat' | 'provider-dropdown' | 'history-dropdown' | 'inline-diff' | 'docs-review';

/** The SurfaceKind members in a fixed order (drives deterministic rendering + coverage checks). */
export const SURFACE_KINDS: readonly SurfaceKind[] = [
  'chat',
  'provider-dropdown',
  'history-dropdown',
  'inline-diff',
  'docs-review',
] as const;

/** Root CSS class per surface — the stable vocabulary downstream surfaces target (via {@link surfaceClass}). */
export const TERMINAL_SURFACE_CLASS: Record<SurfaceKind, string> = {
  chat: 'insrc-term-chat',
  'provider-dropdown': 'insrc-term-provider',
  'history-dropdown': 'insrc-term-history',
  'inline-diff': 'insrc-term-diff',
  'docs-review': 'insrc-term-review',
};

/**
 * The frozen default theme — the exact site/css/tui.css :root values. This is the
 * single default every surface consumes; a caller may pass a variant (e.g. a light
 * theme) to {@link renderTerminalStyle}.
 */
export const terminalTheme: TerminalTheme = Object.freeze({
  font: Object.freeze({
    mono: 'ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code", Menlo, Consolas, monospace',
    sizePx: 13,
    linePx: 20,
  }),
  color: Object.freeze({
    bg: '#0b0e14',
    fg: '#c6cdd8',
    dim: '#4a5464',
    accent: '#4ade80',
    warn: '#fbbf24',
    err: '#f87171',
    sel: 'rgba(74, 222, 128, 0.22)',
  }),
  chrome: Object.freeze({
    border: '#222a36',
    boxChars: Object.freeze({ h: '─', v: '│', tl: '┌', tr: '┐', bl: '└', br: '┘' }),
  }),
  marker: Object.freeze({ pending: '◆', toolCall: '▸', edit: '✎', done: '✓', error: '✗' }),
}) as TerminalTheme;

/** Thrown when a TerminalTheme token is empty or would break out of the inlined <style> element. */
export class TerminalThemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerminalThemeError';
  }
}

/** The stable root CSS class for a surface. Total over SurfaceKind. */
export function surfaceClass(kind: SurfaceKind): string {
  return TERMINAL_SURFACE_CLASS[kind];
}

/** VS Code theme variable each token layers over; the token literal is the fallback. */
const VSCODE_VAR = {
  'font.mono': '--vscode-editor-font-family',
  'color.bg': '--vscode-editor-background',
  'color.fg': '--vscode-editor-foreground',
  'color.dim': '--vscode-descriptionForeground',
  'color.accent': '--vscode-terminal-ansiGreen',
  'color.warn': '--vscode-terminal-ansiYellow',
  'color.err': '--vscode-errorForeground',
  'color.sel': '--vscode-editor-selectionBackground',
  'chrome.border': '--vscode-panel-border',
} as const;

/**
 * Per-class ALLOWLISTS — the token values are interpolated raw into the inlined
 * <style> (bare inside `var(--x, VALUE)`, inside a double-quoted custom property,
 * and inside `content:`). A `<`/`>` denylist is insufficient: a `"`, `)`, `;`, `}`,
 * `url(`, or newline in a value would break out of the rule and inject arbitrary
 * CSS. Each token is instead matched against a strict shape for its role, so the
 * only characters admitted are the ones its CSS context can safely carry.
 */
// #rgb/#rgba/#rrggbb/#rrggbbaa, a functional rgb/rgba/hsl/hsla, or a plain named color.
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s]+\)|[a-zA-Z]+)$/;
// A font-family list: names, quotes, spaces, commas, hyphens — no rule/string-breaking chars.
const FONT_RE = /^[a-zA-Z0-9 ,"-]+$/;
// A short glyph run with no string/rule/markup-breaking character.
const GLYPH_RE = /^[^"\\;{}()<>\r\n]{1,8}$/;

type TokenClass = 'color' | 'font' | 'glyph';

function stringTokens(theme: TerminalTheme): ReadonlyArray<readonly [string, string, TokenClass]> {
  const b = theme.chrome.boxChars;
  const m = theme.marker;
  return [
    ['font.mono', theme.font.mono, 'font'],
    ['color.bg', theme.color.bg, 'color'],
    ['color.fg', theme.color.fg, 'color'],
    ['color.dim', theme.color.dim, 'color'],
    ['color.accent', theme.color.accent, 'color'],
    ['color.warn', theme.color.warn, 'color'],
    ['color.err', theme.color.err, 'color'],
    ['color.sel', theme.color.sel, 'color'],
    ['chrome.border', theme.chrome.border, 'color'],
    ['chrome.boxChars.h', b.h, 'glyph'],
    ['chrome.boxChars.v', b.v, 'glyph'],
    ['chrome.boxChars.tl', b.tl, 'glyph'],
    ['chrome.boxChars.tr', b.tr, 'glyph'],
    ['chrome.boxChars.bl', b.bl, 'glyph'],
    ['chrome.boxChars.br', b.br, 'glyph'],
    ['marker.pending', m.pending, 'glyph'],
    ['marker.toolCall', m.toolCall, 'glyph'],
    ['marker.edit', m.edit, 'glyph'],
    ['marker.done', m.done, 'glyph'],
    ['marker.error', m.error, 'glyph'],
  ];
}

const CLASS_RE: Record<TokenClass, RegExp> = { color: COLOR_RE, font: FONT_RE, glyph: GLYPH_RE };

function validateTheme(theme: TerminalTheme): void {
  for (const [path, value, cls] of stringTokens(theme)) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new TerminalThemeError(`TerminalTheme token '${path}' must be a non-empty string`);
    }
    // Allowlist per role — keeps the inlined <style> un-breakable + un-injectable
    // (a value that could close var()/a string/a rule, or add a selector or url(), is rejected).
    if (!CLASS_RE[cls].test(value)) {
      throw new TerminalThemeError(`TerminalTheme token '${path}' is not a valid ${cls} value (rejected to keep the inlined <style> un-injectable)`);
    }
  }
  for (const [path, num] of [
    ['font.sizePx', theme.font.sizePx],
    ['font.linePx', theme.font.linePx],
  ] as const) {
    if (!Number.isFinite(num) || num <= 0) {
      throw new TerminalThemeError(`TerminalTheme token '${path}' must be a positive number`);
    }
  }
}

/**
 * The canonical, pure token->CSS renderer. Returns a complete, self-contained
 * `<style>…</style>` string (sc1). Deterministic: the same theme always yields
 * byte-identical output, which is what the mock round-trip test relies on.
 */
export function renderTerminalStyle(theme: TerminalTheme = terminalTheme): string {
  validateTheme(theme);
  const f = theme.font;
  const c = theme.color;
  const ch = theme.chrome;
  const m = theme.marker;
  const v = (path: keyof typeof VSCODE_VAR, literal: string): string => `var(${VSCODE_VAR[path]}, ${literal})`;

  const root = [
    `.insrc-term {`,
    `  --it-font: ${v('font.mono', f.mono)};`,
    `  --it-size: var(--vscode-editor-font-size, ${f.sizePx}px);`,
    `  --it-line: ${f.linePx}px;`,
    `  --it-bg: ${v('color.bg', c.bg)};`,
    `  --it-fg: ${v('color.fg', c.fg)};`,
    `  --it-dim: ${v('color.dim', c.dim)};`,
    `  --it-accent: ${v('color.accent', c.accent)};`,
    `  --it-warn: ${v('color.warn', c.warn)};`,
    `  --it-err: ${v('color.err', c.err)};`,
    `  --it-sel: ${v('color.sel', c.sel)};`,
    `  --it-border: ${v('chrome.border', ch.border)};`,
    `  --it-box-h: "${ch.boxChars.h}"; --it-box-v: "${ch.boxChars.v}";`,
    `  --it-box-tl: "${ch.boxChars.tl}"; --it-box-tr: "${ch.boxChars.tr}"; --it-box-bl: "${ch.boxChars.bl}"; --it-box-br: "${ch.boxChars.br}";`,
    `  --it-mk-pending: "${m.pending}"; --it-mk-tool: "${m.toolCall}"; --it-mk-edit: "${m.edit}"; --it-mk-done: "${m.done}"; --it-mk-error: "${m.error}";`,
    `  font-family: var(--it-font);`,
    `  font-size: var(--it-size);`,
    `  line-height: var(--it-line);`,
    `  background: var(--it-bg);`,
    `  color: var(--it-fg);`,
    `}`,
  ].join('\n');

  const surfaces = SURFACE_KINDS.map(
    (k) => `.${TERMINAL_SURFACE_CLASS[k]} { display: block; background: var(--it-bg); color: var(--it-fg); border: 1px solid var(--it-border); }`,
  ).join('\n');

  const chrome = [
    `.insrc-term__box { border: 1px solid var(--it-border); }`,
    `.insrc-term__box::before { content: var(--it-box-tl) var(--it-box-h) var(--it-box-tr); color: var(--it-border); }`,
    `.insrc-term__box::after { content: var(--it-box-bl) var(--it-box-h) var(--it-box-br); color: var(--it-border); }`,
    `.insrc-term__rule::before { content: var(--it-box-v); color: var(--it-border); }`,
    `.insrc-term__sel { background: var(--it-sel); }`,
    `.insrc-term__dim { color: var(--it-dim); }`,
  ].join('\n');

  const markers = [
    `.insrc-term__marker--pending::before { content: var(--it-mk-pending); color: var(--it-accent); }`,
    `.insrc-term__marker--tool::before { content: var(--it-mk-tool); color: var(--it-accent); }`,
    `.insrc-term__marker--edit::before { content: var(--it-mk-edit); color: var(--it-warn); }`,
    `.insrc-term__marker--done::before { content: var(--it-mk-done); color: var(--it-accent); }`,
    `.insrc-term__marker--error::before { content: var(--it-mk-error); color: var(--it-err); }`,
  ].join('\n');

  return `<style>\n${root}\n${surfaces}\n${chrome}\n${markers}\n</style>`;
}
