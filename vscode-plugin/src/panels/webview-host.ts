/**
 * Story E20260922401ae5fb:S004 / t4 — the WebviewPanelHost core (sc9).
 * Amended by S005 (t3): per-tab renderer dispatch + an interactive, CSP-nonce'd
 * tab strip + Refresh control + an on-demand host<->webview message bridge.
 *
 * The VS-Code-free host over injected boundaries (a PanelFactory, a MenuPicker,
 * the DaemonDataGateway). It owns the status-bar 2-item menu, the two panels'
 * single-instance lifecycle (create-or-reveal, cached ref cleared on dispose),
 * the fixed daemon/workflows/debug tab framework (default 'daemon', ac2), and the
 * tab-body render. It NEVER throws to the caller: a gateway/renderer failure
 * degrades to an in-panel error state + logger.warn, and a panel-create/setHtml
 * throw is caught and logged (a visible no-op).
 *
 * S005: the daemon + workflows tab bodies come from injected `detailRenderers`;
 * a tab without a renderer falls back to the host's built-in default (daemon
 * status) or the 'coming soon' placeholder, so a host built without renderers
 * behaves exactly as the S004 shell. Tab-switch + Refresh are driven from inside
 * the webview via {type:'switchTab',tab}/{type:'refresh'} messages and re-render
 * ON-DEMAND ONLY — no timer/interval (the continuous ticker is s6's Debug log).
 */

import { escapeHtml, makeNonce } from './html.js';
import {
  type DetailTab,
  type MenuItem,
  type PanelHandle,
  type WebviewPanelHost,
  type WebviewPanelHostDeps,
} from './types.js';

/** The panel view-types (the sc9 host owns exactly two panels). */
const DETAIL_VIEW_TYPE = 'insrc.detailedStatus';
const REPO_VIEW_TYPE = 'insrc.repoConfiguration';

/** The fixed tab order of the Detailed Status panel (daemon first — ac2 default). */
const DETAIL_TABS: readonly DetailTab[] = ['daemon', 'workflows', 'debug'];

/** The two menu choices, in order (ac1: exactly two). */
const MENU_ITEMS: readonly MenuItem[] = [
  { label: 'Detailed Status', action: 'detailed' },
  { label: 'Repo Configuration', action: 'repoConfig' },
];

/** Body fragments for the built-in fallbacks + degraded states. */
const PLACEHOLDER = `<p class="placeholder">This view is coming soon.</p>`;
const REPO_PLACEHOLDER = `<p class="placeholder">This editor is coming soon.</p>`;
const DAEMON_ERR = `<p class="error">insrc daemon unreachable</p>`;
const VIEW_ERR = `<p class="error">insrc: could not load this view.</p>`;

/**
 * The ONLY inline webview script (nonce'd; posts ONLY the two sanctioned message
 * shapes). Static — it interpolates no untrusted data. Wires each tab button to
 * post {type:'switchTab',tab} and the Refresh control to post {type:'refresh'}.
 */
const BOOTSTRAP = `const vscode = acquireVsCodeApi();
for (const el of document.querySelectorAll('.tab')) {
  el.addEventListener('click', function () { vscode.postMessage({ type: 'switchTab', tab: el.getAttribute('data-tab') }); });
}
const r = document.getElementById('insrc-refresh');
if (r) { r.addEventListener('click', function () { vscode.postMessage({ type: 'refresh' }); }); }`;

/** Build the sc9 WebviewPanelHost over its injected boundaries. Never throws. */
export function createWebviewPanelHost(deps: WebviewPanelHostDeps): WebviewPanelHost {
  const { panels, pickMenu, gateway, logger } = deps;

  // The single-instance panel references (cleared on the user closing a panel).
  let detailPanel: PanelHandle | undefined;
  let repoPanel: PanelHandle | undefined;
  // The Detailed Status panel's currently-active tab (ac3: switch re-renders it).
  let detailActiveTab: DetailTab = 'daemon';

  /** Create-or-reveal a single-instance panel; a create failure is caught + logged. */
  const openSingleton = (
    current: PanelHandle | undefined,
    viewType: string,
    title: string,
    onDispose: () => void,
    onCreate?: (panel: PanelHandle) => void,
  ): PanelHandle | undefined => {
    // The whole open — reveal-existing, create, onDidDispose/onCreate wiring, and
    // reveal — is guarded so no editor-API call can throw out of the host (the
    // never-throw contract; a failure degrades to a logged visible no-op).
    try {
      if (current !== undefined) {
        current.reveal();
        return current;
      }
      const panel = panels({ viewType, title });
      // Clear the cached ref when the user closes the panel so a later open creates fresh.
      panel.onDidDispose(onDispose);
      onCreate?.(panel); // wire the message bridge ONCE, on fresh create only.
      panel.reveal();
      return panel;
    } catch (err) {
      logger.warn(`insrc: could not open the ${title} panel — ${errText(err)}`);
      return undefined;
    }
  };

  /** Render the Detailed Status body for `tab` (renderer -> built-in daemon -> placeholder). */
  const renderDetail = async (panel: PanelHandle, tab: DetailTab): Promise<void> => {
    // The whole render is guarded: a renderer/gateway failure degrades the body,
    // and the outer catch covers a setHtml throw (panel disposed mid-render) so
    // this never becomes an unhandled rejection — the host never-throw contract.
    try {
      let body: string;
      const renderer = deps.detailRenderers?.[tab];
      if (renderer !== undefined) {
        try {
          body = await renderer(gateway);
        } catch (err) {
          logger.warn(`insrc: could not render the ${tab} view — ${errText(err)}`);
          body = tab === 'daemon' ? DAEMON_ERR : VIEW_ERR;
        }
      } else if (tab === 'daemon') {
        // Built-in default (preserved from S004 for a rendererless host): the
        // minimal daemon-status render from gateway.status().
        try {
          const view = await gateway.status();
          body = `<p class="state">${escapeHtml(view.state)}</p>${
            view.detail !== undefined ? `<p class="detail">${escapeHtml(view.detail)}</p>` : ''
          }`;
        } catch (err) {
          logger.warn(`insrc: could not read daemon status — ${errText(err)}`);
          body = DAEMON_ERR;
        }
      } else {
        // Workflows/Debug with no renderer are placeholders (debug until s6).
        body = PLACEHOLDER;
      }
      panel.setHtml(detailHtml(tab, body, makeNonce()));
    } catch (err) {
      logger.warn(`insrc: could not render the Detailed Status panel — ${errText(err)}`);
    }
  };

  /**
   * Handle a webview->host message for the Detailed Status panel. Validates the
   * shape (msg.type in {switchTab,refresh}, msg.tab a real DetailTab), skips a
   * late message after the panel was disposed/replaced, and re-renders on-demand.
   */
  const handleDetailMessage = (panel: PanelHandle, message: unknown): void => {
    if (detailPanel !== panel) return; // stale panel (disposed/replaced) — no-op.
    if (typeof message !== 'object' || message === null) return;
    const msg = message as { type?: unknown; tab?: unknown };
    if (msg.type === 'refresh') {
      void renderDetail(panel, detailActiveTab);
      return;
    }
    if (
      msg.type === 'switchTab' &&
      typeof msg.tab === 'string' &&
      (DETAIL_TABS as readonly string[]).includes(msg.tab)
    ) {
      detailActiveTab = msg.tab as DetailTab;
      void renderDetail(panel, detailActiveTab);
    }
    // Anything else is a silent no-op (a malformed/spoofed message can't drive the host).
  };

  return {
    openDetailedStatus(tab: DetailTab = 'daemon'): void {
      detailActiveTab = tab;
      const panel = openSingleton(
        detailPanel,
        DETAIL_VIEW_TYPE,
        'insrc — Detailed Status',
        () => {
          detailPanel = undefined;
        },
        (p) => {
          p.onMessage((message) => handleDetailMessage(p, message));
        },
      );
      if (panel === undefined) return;
      detailPanel = panel; // cache synchronously so a rapid second call reveals, not duplicates.
      void renderDetail(panel, detailActiveTab); // async render; renderDetail never throws.
    },

    openRepoConfiguration(): void {
      const panel = openSingleton(repoPanel, REPO_VIEW_TYPE, 'insrc — Repo Configuration', () => {
        repoPanel = undefined;
      });
      if (panel === undefined) return;
      repoPanel = panel;
      // Shell only in S004 — the per-repo form is s7's. Guard the setHtml so a
      // disposed-mid-open panel degrades to a logged no-op (host never-throw). The
      // shared shell carries the CSP even though this panel runs no bootstrap.
      try {
        panel.setHtml(shellHtml('Repo Configuration', REPO_PLACEHOLDER, makeNonce()));
      } catch (err) {
        logger.warn(`insrc: could not render the Repo Configuration panel — ${errText(err)}`);
      }
    },

    async showStatusMenu(): Promise<void> {
      let chosen: MenuItem | undefined;
      try {
        chosen = await pickMenu(MENU_ITEMS);
      } catch (err) {
        // The picker itself should not reject, but never let it surface an error.
        logger.warn(`insrc: the status menu failed — ${errText(err)}`);
        return;
      }
      if (chosen === undefined) return; // dismissed (Esc) — no-op (ac1).
      if (chosen.action === 'detailed') this.openDetailedStatus();
      else this.openRepoConfiguration();
    },
  };
}

/** The Detailed Status body: an interactive tab strip (active marked) + the tab body. */
function detailHtml(active: DetailTab, body: string, nonce: string): string {
  const tabs = DETAIL_TABS.map(
    (t) => `<button type="button" class="tab${t === active ? ' active' : ''}" data-tab="${t}">${escapeHtml(tabLabel(t))}</button>`,
  ).join('');
  const content = `<nav class="tabs">${tabs}</nav><section class="body">${body}</section>`;
  return shellHtml('Detailed Status', content, nonce, BOOTSTRAP);
}

/**
 * The shared webview HTML shell (title + content). Carries a strict CSP that
 * only permits the nonce'd bootstrap script (and inline styles); `bootstrap`,
 * when present, is that single nonce'd script. VS-Code-theme-friendly, minimal.
 */
function shellHtml(title: string, content: string, nonce: string, bootstrap?: string): string {
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
  </style></head><body><h2>${escapeHtml(title)}</h2>${content}${script}</body></html>`;
}

/** The human tab label for a DetailTab. */
function tabLabel(tab: DetailTab): string {
  switch (tab) {
    case 'daemon':
      return 'Daemon';
    case 'workflows':
      return 'Workflows';
    case 'debug':
      return 'Debug';
  }
}

/** One-line error text for a logger.warn. */
function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
