/**
 * Story E202610137fefc3fc:S001 — the dev chat takes every colour from the VS Code theme.
 *
 * The chat's own style is read from the shell the host renders (its last <style> block; the
 * first is the shared token sheet, which the docs-review panel uses and this Story leaves
 * alone). The tests keep fixed colours out, keep every name defined, and pin which theme
 * variable each name holds and which name each component uses.
 *
 *   npx tsx --test src/chat/__tests__/chat-theme.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createChatPanelHost, type ChatPanelChannel } from '../chat-panel.js';
import { createInMemoryChatSessionStore } from '../session-store.js';
import { createAttachmentStore } from '../attachment-store.js';
import { renderTerminalStyle } from '../design-tokens.js';
import { CHAT_MARKDOWN_TOKENS, DOCS_REVIEW_MARKDOWN_TOKENS, renderMarkdownStyle } from '../markdown-style.js';
import { RENDER_REGISTRY_STYLE } from '../render-registry.js';
import type { ProviderRegistry, StreamAdapter } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';
import { fakeAttachmentFs } from './fake-attachment-fs.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The shell with every optional part on (the attachment controls add rules too). */
function shellHtml(): string {
  let html = '';
  const channel: ChatPanelChannel = { setHtml: (h) => { html = h; }, postMessage: () => {}, onMessage: () => {}, onDidDispose: () => {}, reveal: () => {}, dispose: () => {} };
  const adapter: StreamAdapter = { async *run(): AsyncIterable<TurnEvent> {}, cancel: () => {}, decide: () => {}, capabilities: { resume: true } };
  const providers: ProviderRegistry = { available: ['claude'], get: () => adapter };
  createChatPanelHost({
    createPanel: () => channel,
    providers,
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'N',
    attachments: { store: createAttachmentStore({ root: '/att', fs: fakeAttachmentFs().fs }), pickFiles: async () => [], open: () => {} },
  }).open();
  return html;
}
const styleBlocks = (html: string): string[] => [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]!);
/** The chat's own style: the last block. */
const ownStyle = (html: string): string => styleBlocks(html).at(-1)!;
/** The `:root` rule's declarations, name -> value. */
function layer(style: string): Map<string, string> {
  const root = /:root\{([^}]*)\}/.exec(style);
  assert.ok(root, 'the style has a :root rule');
  const out = new Map<string, string>();
  for (const decl of root[1]!.split(';')) {
    const at = decl.indexOf(':');
    if (at > 0) out.set(decl.slice(0, at).trim(), decl.slice(at + 1).trim());
  }
  return out;
}
/** A rule's declarations by its exact selector. */
function rule(style: string, selector: string): string {
  // The selector must start a rule: at the very start, or straight after the previous rule's `}`.
  let at = style.indexOf(`${selector}{`);
  while (at > 0 && style[at - 1] !== '}') at = style.indexOf(`${selector}{`, at + 1);
  assert.ok(at >= 0, `the style has a rule for ${selector}`);
  return style.slice(at + selector.length + 1, style.indexOf('}', at));
}
/** The top-level selectors of a style. */
function selectors(style: string): Set<string> {
  const out = new Set<string>();
  let depth = 0;
  let buf = '';
  for (const ch of style) {
    if (ch === '{') { if (depth === 0) out.add(buf.trim()); depth++; buf = ''; }
    else if (ch === '}') { depth--; buf = ''; }
    else buf += ch;
  }
  return out;
}

/** The theme variables of the approved mapping (SPEC-3d2161bcef24cecf and the design's layer). */
const APPROVED_THEME_VARIABLES = [
  'editor-font-family', 'editor-background', 'editor-foreground', 'editor-selectionBackground', 'editor-inactiveSelectionBackground',
  'editorWidget-background', 'editorWidget-border', 'panel-border', 'contrastBorder', 'focusBorder', 'widget-shadow',
  'descriptionForeground', 'errorForeground', 'editorWarning-foreground', 'textLink-foreground',
  'textCodeBlock-background', 'textPreformat-foreground', 'textPreformat-background', 'textBlockQuote-background', 'textBlockQuote-border', 'textSeparator-foreground',
  'chat-requestBackground', 'chat-requestBorder',
  'terminal-ansiGreen', 'terminal-ansiCyan', 'terminal-ansiYellow', 'terminal-ansiMagenta', 'terminal-ansiBlue',
  'diffEditor-insertedLineBackground', 'diffEditor-insertedTextBackground', 'diffEditor-removedLineBackground', 'diffEditor-removedTextBackground',
  'diffEditor-insertedTextBorder', 'diffEditor-removedTextBorder',
  'inputValidation-warningBackground', 'inputValidation-warningBorder', 'input-foreground', 'input-placeholderForeground',
  'button-background', 'button-foreground', 'button-hoverBackground', 'button-secondaryBackground', 'button-secondaryForeground', 'button-secondaryHoverBackground',
  'testing-iconPassed', 'testing-iconFailed', 'progressBar-background',
  'dropdown-background', 'dropdown-foreground', 'dropdown-border', 'checkbox-background', 'checkbox-foreground', 'checkbox-border',
].map((v) => `--vscode-${v}`);

test("chat theme: the chat's own style has no hex, rgb, rgba or hsl value, no radial gradient and no var() with a literal fallback; its only color-mix is the assistant message's ground, declared once; the colour scheme follows the theme kind; a linear gradient is built only from names and transparent", () => {
  const html = shellHtml();
  assert.equal(styleBlocks(html).length, 2, 'the shared sheet, then the chat\'s own style');
  // Data URIs are shapes, not colours; they are checked on their own below.
  const uris = [...ownStyle(html).matchAll(/url\("data:[^"]*"\)/g)].map((m) => m[0]);
  // One derived colour is allowed, by the user's decision of 2026-10-13: the assistant message's
  // ground, a slightly darker shade of the editor background. It is set aside here and pinned below.
  const ASSISTANT_BG = '--assistant-bg:color-mix(in srgb,var(--vscode-editor-background) 90%,black);';
  assert.equal(ownStyle(html).split(ASSISTANT_BG).length, 2, 'the one derived colour is declared once, exactly as decided');
  assert.equal((ownStyle(html).match(/color-mix\(/g) ?? []).length, 1, 'and it is the only color-mix');
  const style = ownStyle(html).replace(ASSISTANT_BG, '').replace(/url\("data:[^"]*"\)/g, 'url()');

  assert.deepEqual(style.match(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g)?.filter((h) => !style.includes(`${h}{`) && !style.includes(`${h} `) && !style.includes(`${h}:`) && !style.includes(`${h},`) && !style.includes(`${h}>`) && !style.includes(`${h}.`) && !style.includes(`${h}[`)) ?? [], [], 'no hex colour');
  for (const fn of ['rgb(', 'rgba(', 'hsl(', 'hsla(', 'color-mix(', 'radial-gradient(', 'conic-gradient(']) {
    assert.ok(!style.includes(fn), `no ${fn}...) in the chat's style`);
  }
  // A colour value is only ever a name, a theme variable, or a keyword that carries no colour.
  for (const m of style.matchAll(/(?:^|[;{])\s*(color|background|background-color|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline|outline-color|caret-color|box-shadow|fill|stroke)\s*:\s*([^;}]*)/g)) {
    const value = m[2]!;
    const words = value.replace(/var\([^()]*(?:\([^()]*(?:\([^()]*(?:\([^()]*\))*[^()]*\))*[^()]*\))*[^()]*\)/g, ' ').replace(/url\(\)/g, ' ').replace(/linear-gradient\([^)]*\)/g, ' ');
    for (const word of words.split(/[\s,/]+/).filter((w) => w !== '')) {
      assert.match(word, /^(?:transparent|currentColor|none|inherit|0|\d*\.?\d+(?:px|em|%)?|solid|dashed|center|no-repeat|left|right|top|bottom|calc\(.*|.*\)|!important)$/, `"${word}" in \`${m[1]}:${value}\` is not a colour literal`);
    }
  }
  // Every var() fallback is another var() or `transparent`.
  for (const m of style.matchAll(/var\(--[\w-]+\s*,\s*([^)]*)/g)) {
    assert.match(m[1]!.trim(), /^(?:var\(--[\w-]+|transparent$)/, `the fallback in \`${m[0]}\` is a variable, not a literal`);
  }
  // The colour scheme is not forced: it follows the theme kind, and high-contrast light wins over high-contrast.
  assert.ok(!/:root\{[^}]*color-scheme/.test(style), 'no colour scheme on :root');
  assert.deepEqual(
    [...style.matchAll(/body\.(vscode-[\w-]+)\{color-scheme:(light|dark);\}/g)].map((m) => [m[1], m[2]]),
    [['vscode-light', 'light'], ['vscode-dark', 'dark'], ['vscode-high-contrast', 'dark'], ['vscode-high-contrast-light', 'light']],
  );
  assert.equal((style.match(/color-scheme/g) ?? []).length, 4);
  // The only gradients left draw the select arrows, from a name and transparent.
  const gradients = style.match(/linear-gradient\((?:[^()]|\([^()]*\))*\)/g) ?? [];
  assert.ok(gradients.length > 0);
  for (const g of gradients) assert.match(g, /^linear-gradient\((?:45|135)deg,(?:transparent 50%,var\(--muted\) 50%|var\(--muted\) 50%,transparent 50%)\)$/, g);
  // The data URIs carry no colour of their own.
  assert.ok(uris.length >= 2);
  for (const u of uris) {
    assert.ok(!/%23[0-9a-fA-F]{3,8}|rgb|hsl/.test(u), 'a data URI in the style carries no fixed colour');
    assert.match(u, /stroke='currentColor'/);
  }
  // The same holds for the two sources taken on their own.
  for (const source of [RENDER_REGISTRY_STYLE, Object.values(CHAT_MARKDOWN_TOKENS).join(';')]) {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|color-mix\(|gradient\(|var\(--[\w-]+\s*,/.test(source), 'no fixed colour, gradient or fallback in the row renderer style or the markdown tokens');
  }
});

test("chat theme: every name used in the shell style, the row renderer style and the chat's markdown rules is defined in the named layer", () => {
  const style = ownStyle(shellHtml());
  const names = layer(style);
  const used = (text: string): string[] => [...new Set([...text.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!))].filter((n) => !n.startsWith('--vscode-'));
  for (const [where, text] of [['the shell style', style], ['the row renderer style', RENDER_REGISTRY_STYLE], ["the chat's markdown rules", renderMarkdownStyle(CHAT_MARKDOWN_TOKENS)]] as const) {
    const missing = used(text).filter((n) => !names.has(n));
    assert.deepEqual(missing, [], `${where} uses only names the layer defines`);
    assert.ok(used(text).length > 0, `${where} uses names`);
  }
  // The row renderer and the markdown rules name no theme variable themselves: the layer is the one place.
  assert.ok(!RENDER_REGISTRY_STYLE.includes('--vscode-'));
  assert.ok(!renderMarkdownStyle(CHAT_MARKDOWN_TOKENS).includes('--vscode-'));
  assert.ok(!style.replace(/:root\{[^}]*\}/, '').includes('--vscode-'), 'no rule outside :root names a theme variable');
  // No name is defined and never used.
  const everything = style + RENDER_REGISTRY_STYLE;
  for (const name of names.keys()) assert.ok(everything.includes(`var(${name})`), `${name} is used`);
});

test("chat theme: every name but the one derived ground holds a theme variable of this design's mapping, and every optional one falls back to another theme variable", () => {
  const names = layer(ownStyle(shellHtml()));
  const referenced = new Set<string>();
  // The one derived colour (see the first test); every other name holds a theme variable.
  assert.equal(names.get('--assistant-bg'), 'color-mix(in srgb,var(--vscode-editor-background) 90%,black)');
  names.delete('--assistant-bg');
  for (const [name, value] of names) {
    assert.match(value, /^var\(--vscode-[\w-]+(?:,var\(--vscode-[\w-]+(?:,var\(--vscode-[\w-]+(?:,var\(--vscode-[\w-]+\))?\))?\)|,transparent)?\)$/, `${name} holds a theme variable, with at most a chain of theme-variable fallbacks: ${value}`);
    for (const m of value.matchAll(/--vscode-[\w-]+/g)) referenced.add(m[0]);
  }
  assert.deepEqual([...referenced].filter((v) => !APPROVED_THEME_VARIABLES.includes(v)), [], 'no theme variable outside the approved mapping');
  assert.deepEqual(APPROVED_THEME_VARIABLES.filter((v) => !referenced.has(v)), [], 'every approved theme variable is used');

  const holds = (name: string): string => names.get(name) ?? '';
  // Variables a theme may leave unset, or an older VS Code may not have, never stand alone.
  assert.equal(holds('--user-bg'), 'var(--vscode-chat-requestBackground,var(--vscode-editor-inactiveSelectionBackground))');
  assert.equal(holds('--msg-border'), 'var(--vscode-contrastBorder,var(--vscode-chat-requestBorder,var(--vscode-editorWidget-border,var(--vscode-panel-border))))');
  assert.equal(holds('--border-lit'), 'var(--vscode-contrastBorder,var(--vscode-editorWidget-border,var(--vscode-panel-border)))');
  assert.equal(holds('--border'), 'var(--vscode-contrastBorder,var(--vscode-panel-border))');
  assert.equal(holds('--add-bg'), 'var(--vscode-diffEditor-insertedLineBackground,var(--vscode-diffEditor-insertedTextBackground))');
  assert.equal(holds('--del-bg'), 'var(--vscode-diffEditor-removedLineBackground,var(--vscode-diffEditor-removedTextBackground))');
  assert.equal(holds('--pre-bg'), 'var(--vscode-textPreformat-background,var(--vscode-textCodeBlock-background))');
  // A high-contrast theme outlines a diff line; any other theme leaves the outline clear.
  assert.equal(holds('--add-border'), 'var(--vscode-diffEditor-insertedTextBorder,transparent)');
  assert.equal(holds('--del-border'), 'var(--vscode-diffEditor-removedTextBorder,transparent)');
  // Every border name leads with the high-contrast border.
  for (const name of ['--border', '--border-lit', '--msg-border', '--warn-border', '--dropdown-border', '--check-border']) {
    assert.ok(holds(name).startsWith('var(--vscode-contrastBorder,'), `${name} leads with the high-contrast border`);
  }
  // The whole chat is in the editor's monospace font, the assistant's prose included.
  assert.equal(holds('--font'), 'var(--vscode-editor-font-family)');
  assert.equal(holds('--sans'), 'var(--vscode-editor-font-family)');
  // The mapping's single-variable names.
  const single: Array<[string, string]> = [
    ['--bg', 'editor-background'], ['--panel', 'editor-background'], ['--bg-inset', 'editorWidget-background'], ['--code-bg', 'textCodeBlock-background'],
    ['--fg', 'editor-foreground'], ['--muted', 'descriptionForeground'], ['--link', 'textLink-foreground'], ['--sel', 'editor-selectionBackground'],
    ['--accent', 'terminal-ansiGreen'], ['--accent2', 'terminal-ansiCyan'], ['--amber', 'terminal-ansiYellow'], ['--magenta', 'terminal-ansiMagenta'], ['--user', 'terminal-ansiBlue'],
    ['--red', 'errorForeground'], ['--warn', 'editorWarning-foreground'], ['--warn-bg', 'inputValidation-warningBackground'],
    ['--btn-bg', 'button-background'], ['--btn-fg', 'button-foreground'], ['--btn2-bg', 'button-secondaryBackground'], ['--btn2-fg', 'button-secondaryForeground'],
    ['--pass', 'testing-iconPassed'], ['--fail', 'testing-iconFailed'], ['--progress', 'progressBar-background'], ['--focus', 'focusBorder'],
    ['--input-fg', 'input-foreground'], ['--placeholder', 'input-placeholderForeground'], ['--dropdown-bg', 'dropdown-background'], ['--dropdown-fg', 'dropdown-foreground'],
    ['--check-bg', 'checkbox-background'], ['--check-fg', 'checkbox-foreground'], ['--pre-fg', 'textPreformat-foreground'],
    ['--quote-bg', 'textBlockQuote-background'], ['--quote-border', 'textBlockQuote-border'], ['--sep', 'textSeparator-foreground'],
  ];
  for (const [name, variable] of single) assert.equal(holds(name), `var(--vscode-${variable})`, name);
});

test('chat theme: each component uses the name the mapping gives it (bars, transcript, user and assistant bubbles, tool row, markers, diff lines, approval card and buttons, decided badge, selection card, input, selects, pill, attachment chips, progress, markdown)', () => {
  const style = ownStyle(shellHtml());
  const has = (selector: string, ...decls: string[]): void => {
    const body = `;${rule(style, selector)};`;
    for (const d of decls) assert.ok(body.includes(`;${d};`) || body.includes(`${d};`), `${selector} declares ${d} (has: ${body})`);
  };
  // panel and transcript: the editor ground, flat
  has('body', 'background:var(--bg)', 'color:var(--fg)', 'font-family:var(--font)');
  has('#insrc-term', 'background:var(--panel)');
  // The shared sheet paints `.insrc-term` (the body's class) and `.insrc-term-diff` from its own
  // tokens. The chat's rules must win over both: a more specific body rule, and a diff rule that
  // comes later in the document with the same specificity.
  has('body.insrc-term', 'background:var(--bg)', 'color:var(--fg)', 'font-family:var(--font)');
  has('.insrc-term-diff', 'background:var(--panel)', 'color:var(--fg)', 'border:1px solid var(--border-lit)');
  const sheet = styleBlocks(shellHtml())[0]!;
  const html = shellHtml();
  assert.ok(html.indexOf(sheet) < html.indexOf(style), "the chat's style comes after the shared sheet");
  // The selects carry a surface class the shared sheet also paints; `.segsel`, later in the
  // document with the same specificity, sets all three properties that rule sets.
  assert.match(html, /<button id="insrc-runbtn" type="button" class="runbtn insrc-term-[\w-]+"/);
  assert.match(html, /<button id="insrc-effortbtn" type="button" class="gaugebtn insrc-term-[\w-]+"/);
  assert.match(sheet, /\.insrc-term-[\w-]+ \{ display: block; background: var\(--it-bg\); color: var\(--it-fg\); border: 1px solid var\(--it-border\); \}/);
  has('.segsel', 'background:transparent', 'border:none', 'color:var(--fg)');
  // bars: the widget ground with the widget border
  has('.chrome', 'background:var(--bg-inset)', 'border-bottom:1px solid var(--border-lit)');
  has('.inputbar', 'background:var(--bg-inset)', 'border-top:1px solid var(--border-lit)');
  has('#insrc-progress', 'background:var(--bg-inset)', 'border-top:1px solid var(--border-lit)');
  has('.statusbar', 'background:var(--bg-inset)', 'border-top:1px solid var(--border-lit)');
  has('.attachbar', 'background:var(--bg-inset)');
  assert.ok(!style.includes('.chrome .dot') && !style.includes('.chrome .title'), 'the header carries only the session switcher: the tab already names insrc');
  // messages
  has('.insrc-bubble--user', 'background:var(--user-bg)', 'border:1px solid var(--msg-border)');
  has('.insrc-bubble--assistant', 'background:var(--assistant-bg)', 'border:1px solid var(--msg-border)');
  has('.insrc-who--user', 'color:var(--user)');
  has('.insrc-who--assistant', 'color:var(--magenta)');
  // tool rows and results, structured values
  has('.insrc-toolrow', 'background:var(--code-bg)', 'border:1px solid var(--border-lit)');
  has('.insrc-json', 'background:var(--code-bg)', 'border:1px solid var(--border-lit)');
  has('.insrc-who--tool', 'color:var(--accent2)');
  // the five markers, each its own colour from the theme's terminal palette
  const markers: Array<[string, string]> = [['pending', '--magenta'], ['tool', '--accent2'], ['edit', '--amber'], ['done', '--accent'], ['error', '--red']];
  for (const [kind, name] of markers) has(`.insrc-term__marker--${kind}::before`, `color:var(${name})!important`);
  assert.equal(new Set(markers.map(([, n]) => n)).size, 5);
  // diff
  has('.insrc-diffw__line--add', 'background:var(--add-bg)', 'outline:1px solid var(--add-border)');
  has('.insrc-diffw__line--del', 'background:var(--del-bg)', 'outline:1px solid var(--del-border)');
  has('.insrc-diffw__head', 'background:var(--bg-inset)', 'border-bottom:1px solid var(--border)');
  // approval card, its buttons and the decided badge
  has('.insrc-approval', 'background:var(--warn-bg)', 'border:1px solid var(--warn-border)');
  has('.insrc-approval__title', 'color:var(--warn)');
  has('.insrc-approval__btn--approve', 'background:var(--btn-bg)', 'color:var(--btn-fg)');
  has('.insrc-approval__btn--deny', 'background:var(--btn2-bg)', 'color:var(--btn2-fg)');
  has('.insrc-approval--approved', 'border-color:var(--pass)');
  has('.insrc-approval--rejected', 'border-color:var(--fail)');
  has('.insrc-permoutcome', 'background:var(--code-bg)');
  has('.insrc-permoutcome__badge.insrc-approval__btn--approve', 'color:var(--pass)', 'border-color:var(--pass)', 'background:transparent');
  has('.insrc-permoutcome__badge.insrc-approval__btn--deny', 'color:var(--fail)', 'border-color:var(--fail)', 'background:transparent');
  // The badge's own rule comes after the button rule it overrides.
  assert.ok(style.indexOf('.insrc-permoutcome__badge.insrc-approval__btn--approve{') > style.indexOf('.insrc-approval__btn--approve{'));
  // selection card
  has('.insrc-select', 'background:var(--bg-inset)', 'border:1px solid var(--border-lit)');
  has('.insrc-select__opt', 'background:var(--check-bg)', 'border:1px solid var(--check-border)');
  has('.insrc-select__opt--on', 'border-color:var(--focus)');
  has('.insrc-select__ctl', 'color:var(--check-fg)');
  has('.insrc-select__confirm', 'background:var(--btn-bg)', 'color:var(--btn-fg)');
  has('.insrc-selectoutcome', 'background:var(--code-bg)');
  has('.insrc-selectoutcome__icon', 'color:var(--pass)');
  // input, send control, selects, pill
  has('#insrc-input', 'color:var(--input-fg)', 'background:transparent', 'font-family:var(--font)');
  has('#insrc-input::placeholder', 'color:var(--placeholder)');
  has('#insrc-prompt', 'color:var(--accent)');
  has('#insrc-prompt.stop', 'color:var(--red)');
  has('.segsel', 'color:var(--fg)');
  has('.segsel option', 'background:var(--dropdown-bg)', 'color:var(--dropdown-fg)');
  has('.histchip', 'background:var(--dropdown-bg)', 'border:1px solid var(--dropdown-border)');
  has('.statusbar .perm-auto', 'color:var(--warn)', 'border:1px solid var(--warn)');
  // attachment chips, progress
  has('.attchip', 'border:1px solid var(--border-lit)', 'color:var(--fg)');
  has('.attchip__size', 'color:var(--muted)');
  has('.atterr', 'color:var(--red)');
  has('.insrc-attchip', 'border:1px solid var(--border-lit)');
  has('#insrc-progress .spin i', 'background:var(--progress)');
  // markdown: inline code has its own ground and text, a fenced block the code-block ground
  has('.insrc-md', 'font-family:var(--sans)', 'color:var(--fg)');
  assert.ok(style.includes('.insrc-md code{background:var(--pre-bg);}.insrc-md pre code{background:none;}'));
  assert.match(style, /\.insrc-md code\{[^}]*color:var\(--pre-fg\);\}/);
  assert.match(style, /\.insrc-md pre\{background:var\(--code-bg\);/);
  assert.ok(style.includes('.insrc-md blockquote{background:var(--quote-bg);border-left-color:var(--quote-border);}'));
  assert.ok(style.includes('.insrc-md hr{border-top-color:var(--sep);}.insrc-md a{color:var(--link);}'));
  // These overrides come after the shared markdown rules they refine.
  assert.ok(style.lastIndexOf('.insrc-md a{color:var(--link);}') > style.indexOf('.insrc-md a{color:var(--pre-fg);'));
  // links, selection, focus
  assert.ok(style.includes('::selection{background:var(--sel);}a{color:var(--link);}'));
  assert.match(style, /:focus-visible\{outline:1px solid var\(--focus\);outline-offset:1px;\}<?$/);
});

test('chat theme: the history chip is one wrapper around the select with a masked icon in the current text colour; the select keeps its id and options, and every image source the shell declares is allowed by its content security policy', () => {
  const html = shellHtml();
  const style = ownStyle(html);
  assert.equal((html.match(/class="histchip"/g) ?? []).length, 1);
  assert.match(html, /<span class="right"><span class="histchip"><select id="insrc-history" class="segsel [^"]*" aria-label="session"><option value="">new…<\/option><\/select><\/span><\/span>/);
  const icon = rule(style, '.histchip::before');
  assert.match(icon, /background-color:currentColor/);
  assert.match(icon, /(?:^|;)mask:url\("data:image\/svg\+xml,[^"]*"\) center\/12px 12px no-repeat/);
  assert.match(icon, /pointer-events:none/, 'the glyph never takes a click meant for the select');
  // The select itself no longer paints an icon; it keeps the two arrow layers every .segsel has.
  assert.equal(rule(style, '.chrome #insrc-history'), 'max-width:100%;');
  assert.ok(!/\.segsel\{[^}]*data:image/.test(style));
  // Every url() the document declares is a data: URI, which the policy's img-src allows.
  const policy = /Content-Security-Policy" content="([^"]*)"/.exec(html)![1]!;
  assert.equal(policy, "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-N';");
  const sources = [...styleBlocks(html).join('').matchAll(/url\(("?)([^")]*)/g)].map((m) => m[2]!);
  assert.ok(sources.length >= 2);
  for (const src of sources) assert.ok(src.startsWith('data:'), `declared image source is a data URI: ${src.slice(0, 40)}`);
});

test("chat theme: every selector and element id of the shell and the row renderer from before the change is still present, the added selectors are exactly the listed ones, and the shell is still one nonce'd inline script under the same policy", () => {
  const before = JSON.parse(readFileSync(join(HERE, 'chat-theme-before.json'), 'utf8')) as { selectors: string[]; ids: string[]; styleBlocks: number };
  const html = shellHtml();
  const now = selectors(ownStyle(html));
  // Every selector from before is still there; what is new is listed here and nowhere else.
  assert.deepEqual(before.selectors.filter((s) => !now.has(s)), [], 'no selector was removed or renamed');
  assert.deepEqual([...now].filter((s) => !before.selectors.includes(s)).sort(), [
    '#insrc-prompt:focus-visible,#insrc-older:focus-visible,.segsel:focus-visible,.attachbtn:focus-visible,.attchip__x:focus-visible,.insrc-attchip:focus-visible',
    '.histchip',
    '.histchip::before',
    '.insrc-approval__btn--approve:hover',
    // Epic babd84c6e2fb480a Story S001: a link or code reference the page made clickable has no href, so it needs its own link look.
    '.insrc-diffw__line[data-diff-path]',
    '.insrc-diffw__text .hljs-comment,.insrc-diffw__text .hljs-quote,.insrc-diffw__text .hljs-doctag',
    '.insrc-diffw__text .hljs-keyword,.insrc-diffw__text .hljs-selector-tag',
    '.insrc-diffw__text .hljs-meta,.insrc-diffw__text .hljs-attribute,.insrc-diffw__text .hljs-attr,.insrc-diffw__text .hljs-tag,.insrc-diffw__text .hljs-name,.insrc-diffw__text .hljs-selector-class,.insrc-diffw__text .hljs-selector-id',
    '.insrc-diffw__text .hljs-number,.insrc-diffw__text .hljs-literal,.insrc-diffw__text .hljs-symbol,.insrc-diffw__text .hljs-bullet',
    '.insrc-diffw__text .hljs-string,.insrc-diffw__text .hljs-regexp',
    '.insrc-diffw__text .hljs-title,.insrc-diffw__text .hljs-section,.insrc-diffw__text .hljs-function',
    '.insrc-diffw__text .hljs-type,.insrc-diffw__text .hljs-built_in,.insrc-diffw__text .hljs-class',
    '.insrc-md a[data-url],.insrc-md a[data-path]',
    '.insrc-md blockquote',
    '.insrc-md code',
    '.insrc-md hr',
    '.insrc-md pre code',
    '.insrc-permoutcome__badge.insrc-approval__btn--approve',
    '.insrc-permoutcome__badge.insrc-approval__btn--deny',
    '.insrc-select__confirm--disabled:hover',
    // The progress widget's idle state (always visible; its [hidden] rule left the fixture).
    '#insrc-progress.idle .spin i',
    '#insrc-progress.idle .spin i:nth-child(2)',
    '#insrc-progress.idle .spin i:nth-child(3)',
    '@keyframes insrc-breathe',
    // Run-config controls (bottom-right): the provider·model button + effort gauge, their
    // upward popups, the slider's ticks/notches, and the rise animation.
    '@keyframes insrc-rise',
    '.gaugebtn.dim',
    '.notches',
    '.notches span',
    '.notches span.on',
    '.notches span:hover',
    '.popup',
    '.popup .chk',
    '.popup .foot',
    '.popup .item',
    '.popup .item .sub',
    '.popup .item.dis',
    '.popup .item.dis:hover',
    '.popup .item.sel .chk',
    '.popup .item.sel .lbl',
    '.popup .item:hover',
    '.popup .pane',
    '.popup .pane + .pane',
    '.popup .pane-h',
    '.popup .panes',
    '.popup,.slider-pop',
    '.popup.open,.slider-pop.open',
    '.runbtn .chev',
    '.runbtn,.gaugebtn',
    '.runbtn:focus-visible,.gaugebtn:focus-visible',
    '.runbtn:hover,.gaugebtn:hover',
    '.slider-pop',
    '.slider-pop .foot',
    '.slider-pop .pane-h',
    '.slider-pop input[type=range]',
    '.statusbar .runctl',
    '.ticks',
    '.ticks i',
    '.ticks i.on',
    // Story E20261013b2e8109f:S001: the no-shrink rule and the diff widget (the seven .insrc-diff-* rules of the old box left the fixture).
    '#insrc-term>*',
    '.insrc-diffw',
    '.insrc-diffw--empty .insrc-diffw__body',
    '.insrc-diffw--gone',
    '.insrc-diffw--open .insrc-diffw__line--more',
    '.insrc-diffw--open .insrc-diffw__omitted',
    '.insrc-diffw__a',
    '.insrc-diffw__body',
    '.insrc-diffw__chev',
    '.insrc-diffw__d',
    '.insrc-diffw__glyph',
    '.insrc-diffw__head',
    '.insrc-diffw__head:focus-visible',
    '.insrc-diffw__head[role=button]',
    '.insrc-diffw__kind',
    '.insrc-diffw__line',
    '.insrc-diffw__line--add',
    '.insrc-diffw__line--add .insrc-diffw__sign',
    '.insrc-diffw__line--ctx',
    '.insrc-diffw__line--del',
    '.insrc-diffw__line--del .insrc-diffw__sign',
    '.insrc-diffw__line--more',
    '.insrc-diffw__line--note',
    '.insrc-diffw__more',
    '.insrc-diffw__more:hover',
    '.insrc-diffw__num',
    '.insrc-diffw__omitted',
    '.insrc-diffw__path',
    '.insrc-diffw__sign',
    '.insrc-diffw__stat',
    '.insrc-diffw__text',
    'body.insrc-term',
    'body.vscode-dark',
    'body.vscode-high-contrast',
    'body.vscode-high-contrast-light',
    'body.vscode-light',
  ].filter((s) => !before.selectors.includes(s)).sort());
  // The element ids, in document order.
  const markup = html.slice(html.indexOf('<body')).split('<script')[0]!;
  assert.deepEqual([...new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!))], before.ids);
  assert.match(html, /<body class="insrc-term">/, 'the body carries no theme class of its own; VS Code adds the theme kind');
  // Still two style blocks and one script, under the same policy.
  assert.equal(styleBlocks(html).length, before.styleBlocks);
  assert.equal((html.match(/<script\b/g) ?? []).length, 1);
  assert.match(html, /<script nonce="N">/);
  assert.match(html, /Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-N';"/);
});

test("chat theme: the shared token sheet and the docs-review markdown rules are byte-identical to before the change, and the docs-review panel uses none of the chat's three style sources", () => {
  const before = JSON.parse(readFileSync(join(HERE, 'chat-theme-before.json'), 'utf8')) as { sharedSheetSha256: string; docsReviewMarkdownSha256: string };
  const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
  assert.equal(sha(renderTerminalStyle()), before.sharedSheetSha256, 'the shared token sheet is unchanged');
  assert.equal(sha(renderMarkdownStyle(DOCS_REVIEW_MARKDOWN_TOKENS)), before.docsReviewMarkdownSha256, 'the docs-review markdown rules are unchanged');
  // The chat still embeds that sheet as it is, ahead of its own style.
  assert.equal(styleBlocks(shellHtml())[0], /<style>([\s\S]*?)<\/style>/.exec(renderTerminalStyle())![1]);
  // The docs-review panel builds its document from those two and from nothing this Story changed:
  // it does not use the chat shell, the row renderer's style or the chat's markdown tokens.
  const panel = readFileSync(join(HERE, '..', 'docs-review-panel.ts'), 'utf8');
  assert.match(panel, /import \{ renderMarkdownStyle, DOCS_REVIEW_MARKDOWN_TOKENS \} from '\.\/markdown-style\.js';/);
  for (const absent of ['RENDER_REGISTRY_STYLE', 'CHAT_MARKDOWN_TOKENS']) {
    assert.ok(!panel.includes(absent), `the docs-review panel does not use ${absent}`);
  }
  // From the chat panel's module it takes only the attribute escaper and two types, not the shell.
  assert.match(panel, /import \{ attr, type ChatPanelChannel, type ChatPanelLogger \} from '\.\/chat-panel\.js';/);
});

// Story E20261013b2e8109f:S001 / t5 — the diff widget in the shell's style.
test("chat theme: the transcript's children do not shrink, the diff widget's rules name only the shell's theme names, and the .insrc-term-diff rule still out-ranks the shared sheet", () => {
  const html = shellHtml();
  const style = ownStyle(html);
  // A row with overflow:hidden has a minimum height of zero in a flex column: no row may shrink.
  assert.match(rule(style, '#insrc-term'), /display:flex;flex-direction:column/);
  assert.equal(rule(style, '#insrc-term>*'), 'flex-shrink:0;');
  assert.match(rule(style, '.insrc-diffw'), /flex:0 0 auto/);
  // The widget's rules: every name they use is one the layer defines, and none is a theme variable.
  const names = layer(style);
  const widget = [...RENDER_REGISTRY_STYLE.matchAll(/(\.insrc-diffw[^{]*)\{([^}]*)\}/g)].map((m) => [m[1]!, m[2]!] as const);
  assert.ok(widget.length >= 25, 'the widget has its rules');
  const used = new Set<string>();
  for (const [selector, body] of widget) {
    assert.ok(!body.includes('--vscode-'), `${selector} names no theme variable`);
    assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, `${selector} carries no colour of its own`);
    for (const m of body.matchAll(/var\((--[\w-]+)/g)) used.add(m[1]!);
  }
  assert.deepEqual([...used].filter((n) => !names.has(n)), []);
  for (const n of ['--add-bg', '--del-bg', '--add-border', '--del-border', '--bg-inset', '--border', '--muted', '--pass', '--red', '--link', '--focus']) assert.ok(used.has(n), n);
  // The old box's rules are gone.
  assert.doesNotMatch(style, /\.insrc-diff-(path|add|del|ctx|actions)/);
  // The widget's root is still painted by the chat's own `.insrc-term-diff` rule, which comes after
  // the shared sheet's rule of the same specificity.
  const own = rule(style, '.insrc-term-diff');
  for (const d of ['background:var(--panel)', 'color:var(--fg)', 'border:1px solid var(--border-lit)', 'overflow:hidden']) assert.ok(own.includes(d), d);
  const sheet = styleBlocks(html)[0]!;
  assert.ok(sheet.includes('.insrc-term-diff'), 'the shared sheet has a rule for the same class');
  assert.ok(html.indexOf(sheet) < html.indexOf(style), "the chat's style comes after the shared sheet");
});

test('chat theme: the progress widget keeps its colours, and its idle variant has its own slower animation that reduced motion stops', () => {
  const css = ownStyle(shellHtml());
  assert.ok(css.includes('#insrc-progress{') && css.includes('background:var(--bg-inset)') && css.includes('border-top:1px solid var(--border-lit)'), 'the widget keeps its inset background and lit border');
  assert.ok(css.includes('#insrc-progress .spin i{width:6px;height:6px;border-radius:50%;background:var(--progress)'), 'the dots keep the progress colour');
  assert.ok(css.includes('#insrc-progress.idle .spin i{background:var(--muted);animation:insrc-breathe 3.6s'), 'the idle variant has its own animation, in the muted colour');
  assert.ok(css.includes('@keyframes insrc-breathe{0%,100%{opacity:.20;}50%{opacity:.65;}}'), 'a gentle breathing, with no vertical movement');
  assert.ok(!/insrc-breathe\{[^}]*translate/.test(css), 'no vertical movement while idle');
  assert.ok(/prefers-reduced-motion:reduce\)\{[^}]*#insrc-progress\.idle \.spin i\{animation:none/.test(css), 'reduced motion stops the idle animation');
  assert.ok(!css.includes('#insrc-progress[hidden]'), 'the [hidden] rule is gone');
});

// Epic 00d80121c593053c Story S001 t5: the syntax token colours and the highlighter in the shell.
test('the shell inlines the highlighter source once, holds no script tag in it, and the CSP is unchanged', async () => {
  const { HLJS_SRC } = await import('../webview-hljs.js');
  const html = shellHtml();
  assert.equal(html.split(HLJS_SRC).length - 1, 1, 'the highlighter source is inlined exactly once');
  assert.equal((html.match(/<script\b/g) ?? []).length, 1, 'the shell still has one script tag');
  assert.equal((html.match(/<\/script>/g) ?? []).length, 1);
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-[^']+';">/, 'the policy is the one it was');
  // The highlighter is evaluated before the page's own code, which looks for the global.
  assert.ok(html.indexOf(HLJS_SRC) < html.indexOf('const vs=acquireVsCodeApi()'), 'the highlighter is defined before the bootstrap runs');
  // Neither the marked module nor the review pane takes it.
  const { createDocsReviewHost } = await import('../docs-review-panel.js');
  let review = '';
  createDocsReviewHost({
    createPanel: () => ({ setHtml: (h) => { review = h; }, postMessage: () => {}, onMessage: () => {}, onDidDispose: () => {}, reveal: () => {}, dispose: () => {} }),
    client: { async pending() { return []; }, async content() { throw new Error('unused'); }, async decide() { throw new Error('unused'); } },
  }).open();
  assert.ok(!review.includes(HLJS_SRC), 'the review pane does not carry the highlighter');
  const marked = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'webview-marked.ts'), 'utf8');
  assert.ok(!marked.includes('hljs'), 'webview-marked.ts is untouched by the highlighter');
});

test('the token classes take their colours from existing :root names with no new --vscode- name in the widget rules, and the added selectors are listed exactly', () => {
  const html = shellHtml();
  const rules = [...RENDER_REGISTRY_STYLE.matchAll(/([^{}]*\.hljs-[^{}]*)\{([^}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));
  assert.equal(rules.length, 7, 'seven colour groups');
  // Each class group takes exactly one of the chat's own colours, and the widget rules name no theme variable.
  const used = new Set<string>();
  for (const r of rules) {
    assert.doesNotMatch(r.body, /--vscode-/, `${r.sel} names no theme variable`);
    const names = [...r.body.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]!);
    assert.equal(names.length, 1, `${r.sel} uses one colour`);
    used.add(names[0]!);
  }
  assert.deepEqual([...used].sort(), ['--accent', '--accent2', '--amber', '--link', '--magenta', '--muted', '--user'], 'the mapping: keyword magenta, string accent, number amber, function and title user, type and built-in accent2, comment muted, meta/attribute/tag link');
  // Every one of them is a name the :root layer already defines.
  const root = /:root\{([^}]*)\}/.exec(html)?.[1] ?? '';
  for (const n of used) assert.match(root, new RegExp(`${n}:`), `${n} is defined in :root`);
  assert.doesNotMatch(RENDER_REGISTRY_STYLE, /--vscode-/, 'the widget rules still name no theme variable');
  // The added selectors are the ones listed in the added-selector test above, exactly (that test fails on any other).
  const have = selectors(RENDER_REGISTRY_STYLE);
  for (const r of rules) assert.ok(have.has(r.sel), `${r.sel} is a rule of the widget style`);
});
