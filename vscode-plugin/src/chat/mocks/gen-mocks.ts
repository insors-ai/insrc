/**
 * Story E20260925edb76e2e:S001 / t2 — the mock generator.
 *
 * Writes the five per-surface terminal-styled mock HTML deliverables under this
 * directory. Each mock's <style> block is renderTerminalStyle(terminalTheme)
 * VERBATIM, so the S001 drift-lock (the contract test's byte-equality assertion)
 * holds by construction — regenerating after a token change produces the new files
 * with no hand-editing. Only the per-surface <body> markup is authored here.
 *
 * Run: npx tsx vscode-plugin/src/chat/mocks/gen-mocks.ts
 * (also invoked by the contract test to prove the checked-in files are up to date).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderTerminalStyle, surfaceClass, terminalTheme, SURFACE_KINDS, type SurfaceKind } from '../design-tokens.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** File basename per surface (kept stable; the contract test derives the set from SURFACE_KINDS). */
export const MOCK_FILE: Record<SurfaceKind, string> = {
  chat: 'chat.html',
  'provider-dropdown': 'provider-dropdown.html',
  'history-dropdown': 'history-dropdown.html',
  'inline-diff': 'inline-diff.html',
  'docs-review': 'docs-review.html',
};

const TITLE: Record<SurfaceKind, string> = {
  chat: 'Core chat panel',
  'provider-dropdown': 'Provider dropdown',
  'history-dropdown': 'History dropdown',
  'inline-diff': 'Inline diff — review mode',
  'docs-review': 'Docs-review pane',
};

/** Per-surface terminal-styled body markup (box chrome + markers; never chat-bubble). */
function body(kind: SurfaceKind): string {
  const cls = surfaceClass(kind);
  switch (kind) {
    case 'chat':
      return [
        `<div class="${cls}">`,
        `  <div class="insrc-term__box">insrc chat — claude</div>`,
        `  <div class="insrc-term__rule">❯ add a --json flag to the status command</div>`,
        `  <div class="insrc-term__marker--pending">thinking…</div>`,
        `  <div class="insrc-term__marker--tool">mcp · insrc · insrc_analyze_step</div>`,
        `  <div class="insrc-term__marker--edit">edit src/cli/commands/status.ts</div>`,
        `  <div class="insrc-term__marker--done">done · 1 file changed</div>`,
        `</div>`,
      ].join('\n');
    case 'provider-dropdown':
      return [
        `<div class="${cls}">`,
        `  <div class="insrc-term__box">provider</div>`,
        `  <div class="insrc-term__marker--done">claude — installed</div>`,
        `  <div class="insrc-term__dim">codex — installed</div>`,
        `</div>`,
      ].join('\n');
    case 'history-dropdown':
      return [
        `<div class="${cls}">`,
        `  <div class="insrc-term__box">recent chats</div>`,
        `  <div class="insrc-term__sel">status --json flag</div>`,
        `  <div class="insrc-term__dim">refactor RoleRouter tiers</div>`,
        `</div>`,
      ].join('\n');
    case 'inline-diff':
      return [
        `<div class="${cls}">`,
        `  <div class="insrc-term__box">✎ src/cli/commands/status.ts</div>`,
        `  <pre>+  if (argv.json) { process.stdout.write(JSON.stringify(status)); return; }</pre>`,
        `  <div class="insrc-term__marker--done">Accept</div>`,
        `  <div class="insrc-term__marker--error">Reject</div>`,
        `</div>`,
      ].join('\n');
    case 'docs-review':
      return [
        `<div class="${cls}">`,
        `  <div class="insrc-term__box">tracked workflow · pending approval</div>`,
        `  <div class="insrc-term__dim">docs/epics/…/S001/LLD.md</div>`,
        `  <div class="insrc-term__marker--done">review ✓ pass — 0 HIGH</div>`,
        `</div>`,
      ].join('\n');
  }
}

/** Build one mock's full HTML document with the renderer output embedded verbatim. */
export function mockHtml(kind: SurfaceKind): string {
  const style = renderTerminalStyle(terminalTheme);
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<title>insrc terminal mock — ${TITLE[kind]}</title>`,
    style,
    `</head>`,
    `<body class="insrc-term">`,
    body(kind),
    `</body>`,
    `</html>`,
    ``,
  ].join('\n');
}

/** Write all five mock files. Returns the absolute paths written. */
export function generateMocks(outDir: string = HERE): string[] {
  const written: string[] = [];
  for (const kind of SURFACE_KINDS) {
    const path = join(outDir, MOCK_FILE[kind]);
    writeFileSync(path, mockHtml(kind), 'utf8');
    written.push(path);
  }
  return written;
}

// Run directly (tsx) to (re)generate the checked-in mock files.
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = generateMocks();
  for (const f of files) process.stdout.write(`wrote ${f}\n`);
}
