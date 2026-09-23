/**
 * Story E20260922401ae5fb (S004/S005) — shared VS-Code-free webview HTML helpers.
 *
 * ONE escaper used by both the sc9 host shell and the S005 tab renderers (no
 * divergent copy), plus a per-render CSP nonce generator. Both are pure and
 * import no 'vscode' — the panels cores stay unit-testable off the editor.
 */

import { randomBytes } from 'node:crypto';

/** Escape untrusted text before it enters the webview HTML (5-char entity map). */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** A fresh base64 CSP nonce for one render (S005: the only inline script's nonce). */
export function makeNonce(): string {
  return randomBytes(16).toString('base64');
}
