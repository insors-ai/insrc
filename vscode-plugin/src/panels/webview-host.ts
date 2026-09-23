/**
 * Story E20260922401ae5fb:S004 / t4 — the WebviewPanelHost core (sc9).
 *
 * The VS-Code-free host over injected boundaries (a PanelFactory, a MenuPicker,
 * the DaemonDataGateway). It owns the status-bar 2-item menu, the two panels'
 * single-instance lifecycle (create-or-reveal, cached ref cleared on dispose),
 * the fixed daemon/workflows/debug tab framework (default 'daemon', ac2), and
 * the minimal daemon-status default render. It NEVER throws to the caller: a
 * gateway read failure degrades to an in-panel error state + logger.warn, and a
 * panel-create failure is caught and logged (a visible no-op).
 *
 * The rich tab bodies (s5 daemon/workflows, s6 debug) and the Repo Configuration
 * form (s7) are the consuming stories' — S004 renders only the shell + the
 * daemon default view + placeholders.
 */

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

/** Build the sc9 WebviewPanelHost over its injected boundaries. Never throws. */
export function createWebviewPanelHost(deps: WebviewPanelHostDeps): WebviewPanelHost {
  const { panels, pickMenu, gateway, logger } = deps;

  // The single-instance panel references (cleared on the user closing a panel).
  let detailPanel: PanelHandle | undefined;
  let repoPanel: PanelHandle | undefined;

  /** Create-or-reveal a single-instance panel; a create failure is caught + logged. */
  const openSingleton = (
    current: PanelHandle | undefined,
    viewType: string,
    title: string,
    onDispose: () => void,
  ): PanelHandle | undefined => {
    if (current !== undefined) {
      current.reveal();
      return current;
    }
    let panel: PanelHandle;
    try {
      panel = panels({ viewType, title });
    } catch (err) {
      logger.warn(`insrc: could not open the ${title} panel — ${errText(err)}`);
      return undefined;
    }
    // Clear the cached ref when the user closes the panel so a later open creates fresh.
    panel.onDidDispose(onDispose);
    panel.reveal();
    return panel;
  };

  /** Render the Detailed Status panel body for `tab`; the daemon tab reads gateway.status(). */
  const renderDetail = async (panel: PanelHandle, tab: DetailTab): Promise<void> => {
    // The whole render is guarded: a gateway read failure degrades the body, and
    // the outer catch covers a setHtml throw (e.g. the panel disposed mid-render)
    // so this never becomes an unhandled rejection — the host never-throw contract.
    try {
      let body: string;
      if (tab === 'daemon') {
        try {
          const view = await gateway.status();
          body = `<p class="state">${escapeHtml(view.state)}</p>${
            view.detail !== undefined ? `<p class="detail">${escapeHtml(view.detail)}</p>` : ''
          }`;
        } catch (err) {
          // Degraded render: the panel + tabs still appear; the body shows the reason.
          logger.warn(`insrc: could not read daemon status — ${errText(err)}`);
          body = `<p class="error">insrc daemon unreachable</p>`;
        }
      } else {
        // Workflows/Debug are placeholders filled by the consuming stories (s5/s6).
        body = `<p class="placeholder">This view is coming soon.</p>`;
      }
      panel.setHtml(detailHtml(tab, body));
    } catch (err) {
      logger.warn(`insrc: could not render the Detailed Status panel — ${errText(err)}`);
    }
  };

  return {
    openDetailedStatus(tab: DetailTab = 'daemon'): void {
      const panel = openSingleton(detailPanel, DETAIL_VIEW_TYPE, 'insrc — Detailed Status', () => {
        detailPanel = undefined;
      });
      if (panel === undefined) return;
      detailPanel = panel; // cache synchronously so a rapid second call reveals, not duplicates.
      void renderDetail(panel, tab); // async render; renderDetail never throws.
    },

    openRepoConfiguration(): void {
      const panel = openSingleton(repoPanel, REPO_VIEW_TYPE, 'insrc — Repo Configuration', () => {
        repoPanel = undefined;
      });
      if (panel === undefined) return;
      repoPanel = panel;
      // Shell only in S004 — the per-repo form is s7's. Guard the setHtml so a
      // disposed-mid-open panel degrades to a logged no-op (host never-throw).
      try {
        panel.setHtml(shellHtml('Repo Configuration', `<p class="placeholder">This editor is coming soon.</p>`));
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

/** The Detailed Status body: a tab strip (active tab marked) + the tab's body. */
function detailHtml(active: DetailTab, body: string): string {
  const tabs = DETAIL_TABS.map(
    (t) => `<span class="tab${t === active ? ' active' : ''}" data-tab="${t}">${escapeHtml(tabLabel(t))}</span>`,
  ).join('');
  return shellHtml('Detailed Status', `<nav class="tabs">${tabs}</nav><section class="body">${body}</section>`);
}

/** The shared webview HTML shell (title + content). VS-Code-theme-friendly, minimal. */
function shellHtml(title: string, content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: var(--vscode-font-family, sans-serif); padding: 12px; }
    .tabs { display: flex; gap: 8px; border-bottom: 1px solid var(--vscode-panel-border, #666); margin-bottom: 12px; }
    .tab { padding: 4px 8px; cursor: default; opacity: 0.7; }
    .tab.active { opacity: 1; font-weight: 600; border-bottom: 2px solid var(--vscode-focusBorder, #08f); }
    .error { color: var(--vscode-errorForeground, #f33); }
    .placeholder, .detail { opacity: 0.75; }
  </style></head><body><h2>${escapeHtml(title)}</h2>${content}</body></html>`;
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

/** Escape untrusted text before it enters the webview HTML. */
function escapeHtml(text: string): string {
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

/** One-line error text for a logger.warn. */
function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
