/**
 * Story E202611134642d49a:S001 t3 — the shared webview HTML shell, extracted VERBATIM
 * from panels/webview-host.ts so the chat panel and both scratch viewTypes
 * (insrc.scratchpads / insrc.scratchpad) render through the identical CSP+nonce
 * shell. vscode-free: pure string assembly, importable from tests.
 *
 * The shell carries a strict CSP that only permits the nonce'd bootstrap script
 * (and inline styles); `bootstrap`, when present, is that single nonce'd script.
 */

import { escapeHtml } from './html.js';

/**
 * The shared webview HTML shell (title + content). Carries a strict CSP that
 * only permits the nonce'd bootstrap script (and inline styles); `bootstrap`,
 * when present, is that single nonce'd script. VS-Code-theme-friendly, minimal.
 */
export function shellHtml(title: string, content: string, nonce: string, bootstrap?: string): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  const script = bootstrap !== undefined ? `<script nonce="${nonce}">${bootstrap}</script>` : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>
    body { font-family: var(--vscode-font-family, sans-serif); padding: 12px; }
    .tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--vscode-panel-border, #666); margin-bottom: 12px; }
    .tab { padding: 4px 8px; cursor: pointer; opacity: 0.7; background: none; border: none; color: inherit; font: inherit; }
    .tab.active { opacity: 1; font-weight: 600; border-bottom: 2px solid var(--vscode-focusBorder, #08f); }
    .refresh { margin-bottom: 8px; cursor: pointer; }
    .chain h3 { margin: 8px 0 2px; }
    .error { color: var(--vscode-errorForeground, #f33); }
    .placeholder, .detail, .status { opacity: 0.75; }
    .repos h3 { margin: 12px 0 4px; }
    .repo-list { list-style: none; padding: 0; margin: 0; }
    .repo { padding: 3px 0; }
    .repo-name { font-weight: 600; }
    .completeness { margin-left: 6px; padding: 0 6px; border-radius: 3px; font-size: 0.9em; }
    .completeness.complete { color: var(--vscode-testing-iconPassed, #3a3); }
    .completeness.incomplete { color: var(--vscode-editorWarning-foreground, #c90); border: 1px solid currentColor; }
    .reasons { margin: 2px 0 4px 18px; padding-left: 12px; opacity: 0.85; }
    /* Form controls follow the theme: without these, <select> renders with the
       browser's default white ground instead of the dropdown colours. */
    select, input[type=text], input[type=number], input[type=password] {
      background: var(--vscode-dropdown-background, #3c3c3c);
      color: var(--vscode-dropdown-foreground, #f0f0f0);
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border, #666));
      border-radius: 2px; padding: 2px 4px; font: inherit;
    }
    select:focus, input:focus { outline: 1px solid var(--vscode-focusBorder, #08f); outline-offset: -1px; }
    option { background: var(--vscode-dropdown-background, #3c3c3c); color: var(--vscode-dropdown-foreground, #f0f0f0); }
    input[type=checkbox] { accent-color: var(--vscode-checkbox-foreground, #08f); }
    button {
      background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff);
      border: none; border-radius: 2px; padding: 4px 10px; cursor: pointer; font: inherit;
    }
    button:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
    button:disabled { opacity: 0.5; cursor: default; }
    /* Model Tiers panel (Story S001): one card per tier + the core-floor footer. */
    .panel-head p { opacity: 0.75; margin: 2px 0 10px; }
    .tier-list { display: flex; flex-direction: column; }
    .tier { border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c); padding: 10px 0; }
    .tier:last-child { border-bottom: none; }
    .tier-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 2px; }
    .tier-name { display: flex; align-items: baseline; gap: 8px; }
    .tier-name b { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
    .tier-purpose { font-size: 0.85em; opacity: 0.7; }
    .floor-badge { font-size: 0.75em; opacity: 0.85; white-space: nowrap; border: 1px solid var(--vscode-panel-border, #666); border-radius: 10px; padding: 1px 8px; }
    .controls { display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap; }
    .field { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 120px; }
    .field label { font-size: 0.8em; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.04em; }
    .hosting-chip { display: inline-flex; align-items: center; font-size: 0.7em; border-radius: 9px; padding: 0 6px; margin-left: 4px; font-weight: 600; vertical-align: 1px; }
    .hosting-chip.cloud { background: var(--vscode-charts-blue, #1b3a52); color: var(--vscode-editor-foreground, #7ec8f5); }
    .hosting-chip.local { background: var(--vscode-charts-green, #1e3a24); color: var(--vscode-editor-foreground, #81c995); }
    .note { display: flex; align-items: flex-start; gap: 6px; margin-top: 8px; font-size: 0.9em; border-radius: 4px; padding: 5px 8px; }
    .note.ok { opacity: 0.8; }
    .note.err { background: var(--vscode-inputValidation-errorBackground, #5a1d1d); color: var(--vscode-inputValidation-errorForeground, var(--vscode-errorForeground, #f33)); }
    .note .dot { flex: 0 0 auto; margin-top: 0.1em; }
    .panel-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--vscode-panel-border, #3c3c3c); }
    .foot-field { display: flex; align-items: center; gap: 8px; }
    .foot-hint { font-size: 0.85em; opacity: 0.7; }
    /* Repo Configuration panel (Story S001): role tiers grouped by criticality
       (native <details>/<summary> needs no custom chevron or toggle-class rule)
       plus status-card Providers. */
    .section { border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c); padding: 10px 0; }
    .section:last-child { border-bottom: none; }
    .section-head { font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: baseline; gap: 8px; }
    .section-head::marker { color: var(--vscode-icon-foreground, #c5c5c5); }
    .count { font-size: 11px; opacity: 0.7; border: 1px solid var(--vscode-panel-border, #666); border-radius: 9px; padding: 0 7px; }
    .rows { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; }
    .role-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 3px 2px; border-radius: 4px; }
    .role-row:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
    .floor-row { display: flex; align-items: center; gap: 10px; }
    #insrc-tracker > summary { display: list-item; padding: 4px 0; }
    .tracker-body { max-width: 900px; display: grid; gap: 18px; padding: 4px 0 8px; }
    .tracker-body h3 { margin: 8px 0; font-size: 13px; }
    .tracker-grid, .tracker-status { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 12px 16px; }
    .tracker-status { margin: 0; padding: 8px 10px; border: 1px solid var(--vscode-panel-border, #666); border-radius: 4px; }
    .tracker-status dt, .tracker-label { font-weight: 600; }
    .tracker-status dd { margin: 3px 0 0; overflow-wrap: anywhere; }
    .tracker-field { display: grid; gap: 4px; align-content: start; min-width: 0; }
    .tracker-field input, .tracker-field select { width: 100%; box-sizing: border-box; padding: 4px 6px; }
    .tracker-hint, .tracker-source { display: block; font-size: 0.85em; color: var(--vscode-descriptionForeground, #aaa); overflow-wrap: anywhere; }
    .tracker-policies { width: 100%; border-collapse: collapse; text-align: left; }
    .tracker-policies th, .tracker-policies td { padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border, #666); vertical-align: top; overflow-wrap: anywhere; }
    .tracker-policies thead { background: var(--vscode-editorWidget-background, rgba(127, 127, 127, 0.15)); }
    .tracker-policies tbody th { width: 34%; font-weight: 500; }
    .provider-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 8px; border: 1px solid var(--vscode-panel-border, #3c3c3c); border-radius: 6px; margin-bottom: 4px; }
    .status-chip { font-size: 10.5px; border-radius: 9px; padding: 1px 8px; white-space: nowrap; }
    .status-chip.ok { background: rgba(35, 134, 54, 0.25); color: #81c995; }
    .status-chip.warn { background: rgba(187, 128, 9, 0.25); color: #e8b94a; }
    .status-chip.off { opacity: 0.7; }
  </style></head><body><h2>${escapeHtml(title)}</h2>${content}${script}</body></html>`;
}
