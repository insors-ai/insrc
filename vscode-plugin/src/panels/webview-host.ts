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
 * ON-DEMAND ONLY.
 *
 * S006: an optional per-tab `tabControllers` map supplies a continuous ticker (the
 * Debug log tail — the epic's ONLY ticker). The host arms exactly one controller
 * (the active tab's) and disposes it on switch-away / refresh / panel-close, so a
 * ticker never runs for an inactive tab. Arming is deferred until the webview posts
 * {type:'ready'} (its message listener is live) so the controller's initial batch
 * is not delivered into a not-yet-loaded document and dropped. A tab body may post
 * {type:'action',action} — the host forwards a validated action to the injected
 * `onDetailAction` sink (the consent-gated orphan kill lives in extension.ts, k4).
 * A host built without either behaves exactly as the S005 shell. VS-Code-free +
 * never-throw.
 */

import { escapeHtml, makeNonce } from './html.js';
import type { ModelTiersWrite } from './model-tiers.js';
import {
  type DetailTab,
  type MenuItem,
  type PanelHandle,
  type WebviewPanelHost,
  type WebviewPanelHostDeps,
} from './types.js';

/** The panel view-types (the sc9 host owns exactly three panels). */
const DETAIL_VIEW_TYPE = 'insrc.detailedStatus';
const REPO_VIEW_TYPE = 'insrc.repoConfiguration';
const MODEL_TIERS_VIEW_TYPE = 'insrc.modelTiers';

/** The fixed tab order of the Detailed Status panel (daemon first — ac2 default). */
const DETAIL_TABS: readonly DetailTab[] = ['daemon', 'workflows', 'debug'];

/** The three menu choices, in order. */
const MENU_ITEMS: readonly MenuItem[] = [
  { label: 'Detailed Status', action: 'detailed' },
  { label: 'Repo Configuration', action: 'repoConfig' },
  { label: 'Model Tiers', action: 'modelTiers' },
];

/** The tier/core-floor value set a Model Tiers write message is validated against. */
const TIER_VALUES = ['core', 'mid', 'cheap'] as const;
const TIER_FIELDS = ['runner', 'model', 'effort'] as const;

/** Body fragments for the built-in fallbacks + degraded states. */
const PLACEHOLDER = `<p class="placeholder">This view is coming soon.</p>`;
const REPO_PLACEHOLDER = `<p class="placeholder">This editor is coming soon.</p>`;
const MODEL_TIERS_PLACEHOLDER = `<p class="placeholder">This editor is coming soon.</p>`;
const DAEMON_ERR = `<p class="error">insrc daemon unreachable</p>`;
const VIEW_ERR = `<p class="error">insrc: could not load this view.</p>`;

/**
 * The ONLY inline webview script (nonce'd; posts ONLY the sanctioned message
 * shapes). Static — it interpolates no untrusted data. Wires each tab button to
 * post {type:'switchTab',tab}, the Refresh control to post {type:'refresh'}, and
 * each [data-action] control (S006: the Debug tab's Clean-up button) to post
 * {type:'action',action}. It also listens for host->webview {type:'appendLog'}
 * frames (S006: the live daemon-log ticker) and appends each line to #insrc-log
 * via a text node — inherently XSS-safe, so the host escapes nothing for it.
 */
const BOOTSTRAP = `const vscode = acquireVsCodeApi();
for (const el of document.querySelectorAll('.tab')) {
  el.addEventListener('click', function () { vscode.postMessage({ type: 'switchTab', tab: el.getAttribute('data-tab') }); });
}
const r = document.getElementById('insrc-refresh');
if (r) { r.addEventListener('click', function () { vscode.postMessage({ type: 'refresh' }); }); }
for (const el of document.querySelectorAll('[data-action]')) {
  el.addEventListener('click', function () { vscode.postMessage({ type: 'action', action: el.getAttribute('data-action') }); });
}
window.addEventListener('message', function (event) {
  const msg = event.data;
  if (!msg || msg.type !== 'appendLog' || !Array.isArray(msg.lines)) return;
  const log = document.getElementById('insrc-log');
  if (!log) return;
  for (const line of msg.lines) { log.appendChild(document.createTextNode(String(line) + '\\n')); }
});
vscode.postMessage({ type: 'ready' });`;

/**
 * The Repo Configuration panel's inline bootstrap (nonce'd; posts ONLY the three
 * sanctioned repo message shapes). Static — it reads only host-rendered DOM data.
 * The repo <select> change posts {type:'selectRepo',repoPath}; each per-repo form
 * field change posts {type:'repoWrite',repoPath,segments,value} (value '' -> null to
 * clear the override); the Providers section's button posts
 * {type:'repoRegisterProviders',repoPath,clients} with the checked data-provider
 * values. The form's data-repo carries the selected repoPath and each field's
 * data-segments carries the dot-joined trailing path under models.byRepo.
 */
const REPO_BOOTSTRAP = `const vscode = acquireVsCodeApi();
const sel = document.getElementById('insrc-repo-select');
if (sel) { sel.addEventListener('change', function () { vscode.postMessage({ type: 'selectRepo', repoPath: sel.value }); }); }
const form = document.getElementById('insrc-repo-form');
const repoPath = form ? form.getAttribute('data-repo') : '';
for (const el of document.querySelectorAll('[data-segments]')) {
  el.addEventListener('change', function () {
    var segments;
    try { segments = JSON.parse(el.getAttribute('data-segments')); } catch (e) { return; }
    if (!Array.isArray(segments)) return;
    vscode.postMessage({ type: 'repoWrite', repoPath: repoPath, segments: segments, value: el.value === '' ? null : el.value });
  });
}
const regBtn = document.getElementById('insrc-register-providers');
if (regBtn) { regBtn.addEventListener('click', function () {
  var clients = [];
  for (const el of document.querySelectorAll('input[data-provider]')) {
    if (el.checked) clients.push(el.getAttribute('data-provider'));
  }
  vscode.postMessage({ type: 'repoRegisterProviders', repoPath: repoPath, clients: clients });
}); }`;

/**
 * The Model Tiers panel's inline bootstrap (nonce'd; posts ONLY the
 * {type:'modelTiersWrite',...} shape, Story S001). A per-tier field change
 * posts {kind:'tierField',tier,field,value} from its data-tier/data-field
 * attributes; the panel-foot Core-floor select (no data-tier) posts
 * {kind:'coreFloor',value}.
 */
const MODEL_TIERS_BOOTSTRAP = `const vscode = acquireVsCodeApi();
for (const el of document.querySelectorAll('select[data-tier][data-field]')) {
  el.addEventListener('change', function () {
    vscode.postMessage({ type: 'modelTiersWrite', kind: 'tierField', tier: el.getAttribute('data-tier'), field: el.getAttribute('data-field'), value: el.value });
  });
}
const floor = document.querySelector('select[data-field="coreFloor"]');
if (floor) { floor.addEventListener('change', function () { vscode.postMessage({ type: 'modelTiersWrite', kind: 'coreFloor', value: floor.value }); }); }`;

/** Build the sc9 WebviewPanelHost over its injected boundaries. Never throws. */
export function createWebviewPanelHost(deps: WebviewPanelHostDeps): WebviewPanelHost {
  const { panels, pickMenu, gateway, logger } = deps;

  // The single-instance panel references (cleared on the user closing a panel).
  let detailPanel: PanelHandle | undefined;
  let repoPanel: PanelHandle | undefined;
  let modelTiersPanel: PanelHandle | undefined;
  // The Detailed Status panel's currently-active tab (ac3: switch re-renders it).
  let detailActiveTab: DetailTab = 'daemon';
  // The Repo Configuration panel's currently-selected repo (S007; select re-renders).
  let repoSelectedRepo: string | undefined;
  // The live tab controller's dispose (S006): exactly ONE ticker is armed at a
  // time, and none survives the panel; undefined when the active tab has none.
  let activeControllerDispose: (() => void) | undefined;

  /** Dispose the live tab controller (if any) and clear it. Never throws. */
  const disposeActiveController = (): void => {
    const dispose = activeControllerDispose;
    activeControllerDispose = undefined;
    if (dispose === undefined) return;
    try {
      dispose();
    } catch (err) {
      logger.warn(`insrc: could not dispose the active tab controller — ${errText(err)}`);
    }
  };

  /**
   * Arm the ACTIVE tab's controller (S006), called when the webview reports it is
   * ready (its message listener is live) — so the controller's initial emit is not
   * posted into a not-yet-loaded document and dropped. Disposes any previous
   * controller first (idempotent). Guarded against a stale `ready` from a
   * disposed/replaced panel. The tab is always the current `detailActiveTab`, and
   * the old controller was already stopped at render-start, so this is a pure arm.
   * Never throws (the host never-throw contract).
   */
  const armActiveController = (panel: PanelHandle): void => {
    if (detailPanel !== panel) return; // a ready from a stale (closed/replaced) panel — ignore.
    disposeActiveController();
    const controller = deps.tabControllers?.[detailActiveTab];
    if (controller === undefined) return;
    try {
      activeControllerDispose = controller.onActivate({ postMessage: (message) => panel.postMessage(message) });
    } catch (err) {
      activeControllerDispose = undefined;
      logger.warn(`insrc: could not activate the ${detailActiveTab} tab controller — ${errText(err)}`);
    }
  };

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
    const msg = message as { type?: unknown; tab?: unknown; action?: unknown };
    if (msg.type === 'ready') {
      // The (re-)rendered webview finished loading and registered its message
      // listener — NOW arm the active tab's controller so its initial batch is not
      // posted into a not-yet-ready document and lost (fixes the first-open + the
      // refresh re-seed). Any prior controller was stopped at render-start.
      armActiveController(panel);
      return;
    }
    if (msg.type === 'refresh') {
      // A fresh document replaces the old one (its listener is gone), so stop the
      // live ticker now; the post-render `ready` re-arms it and re-seeds the log.
      disposeActiveController();
      void renderDetail(panel, detailActiveTab);
      return;
    }
    if (
      msg.type === 'switchTab' &&
      typeof msg.tab === 'string' &&
      (DETAIL_TABS as readonly string[]).includes(msg.tab)
    ) {
      detailActiveTab = msg.tab as DetailTab;
      // Stop the outgoing tab's ticker immediately (its document is being replaced),
      // then re-render; the new document's `ready` arms the new tab's controller.
      disposeActiveController();
      void renderDetail(panel, detailActiveTab);
      return;
    }
    if (msg.type === 'action' && typeof msg.action === 'string') {
      // A webview action (S006: the Debug Clean-up button). The host owns no effect
      // — it forwards a validated action string to the injected sink (extension.ts
      // runs the consent-gated kill, k4). A sink throw must not surface (never-throw).
      try {
        deps.onDetailAction?.(msg.action);
      } catch (err) {
        logger.warn(`insrc: the detail action handler failed — ${errText(err)}`);
      }
      return;
    }
    // Anything else is a silent no-op (a malformed/spoofed message can't drive the host).
  };

  /**
   * Render the Repo Configuration body for the currently-selected repo (S007). The
   * body comes from the injected `repoRenderer`; a host without one renders the S004
   * placeholder (fallback preserved). A renderer failure (registeredRepos/rawConfig
   * reject) degrades to an in-panel error state, and a setHtml throw is caught — the
   * host never-throw contract. The repo form is fully rendered here (no post-load
   * host->webview push), so no ready-gate is needed; the picker/field messages drive
   * the next re-render.
   */
  const renderRepoPanel = async (panel: PanelHandle): Promise<void> => {
    try {
      let body: string;
      let scripted = false;
      const renderer = deps.repoRenderer;
      if (renderer !== undefined) {
        try {
          body = await renderer(repoSelectedRepo);
          scripted = true; // the rendered body carries the picker/field controls.
        } catch (err) {
          logger.warn(`insrc: could not render the Repo Configuration view — ${errText(err)}`);
          body = VIEW_ERR;
        }
      } else {
        body = REPO_PLACEHOLDER; // S004 fallback (no repoRenderer wired).
      }
      panel.setHtml(shellHtml('Repo Configuration', body, makeNonce(), scripted ? REPO_BOOTSTRAP : undefined));
    } catch (err) {
      logger.warn(`insrc: could not render the Repo Configuration panel — ${errText(err)}`);
    }
  };

  /**
   * Handle a webview->host message for the Repo Configuration panel (S007). Validates
   * the shape ({selectRepo,repoPath} / {repoWrite,repoPath,segments,value} /
   * {repoRegisterProviders,repoPath,clients}), skips a late message after the panel
   * was disposed/replaced, re-renders on a repo select, and forwards a validated
   * RepoConfigWrite / RepoProviderRegistration to the injected sinks. Never throws.
   */
  const handleRepoMessage = (panel: PanelHandle, message: unknown): void => {
    if (repoPanel !== panel) return; // stale panel (disposed/replaced) — no-op.
    if (typeof message !== 'object' || message === null) return;
    const msg = message as { type?: unknown; repoPath?: unknown; segments?: unknown; value?: unknown; clients?: unknown };
    if (msg.type === 'selectRepo' && typeof msg.repoPath === 'string') {
      // The empty option ('') clears the selection back to the picker-only view.
      repoSelectedRepo = msg.repoPath.length > 0 ? msg.repoPath : undefined;
      void renderRepoPanel(panel);
      return;
    }
    if (
      msg.type === 'repoWrite' &&
      typeof msg.repoPath === 'string' &&
      Array.isArray(msg.segments) &&
      msg.segments.every((s) => typeof s === 'string')
    ) {
      // The host owns no write — it forwards a validated RepoConfigWrite to the sink
      // (extension.ts runs the consent-gated config.write, k4). A sink throw must not
      // surface (never-throw).
      try {
        deps.onRepoConfigWrite?.({
          repoPath: msg.repoPath,
          segments: msg.segments as readonly string[],
          value: msg.value,
        });
      } catch (err) {
        logger.warn(`insrc: the repo-config write handler failed — ${errText(err)}`);
      }
      return;
    }
    if (
      msg.type === 'repoRegisterProviders' &&
      typeof msg.repoPath === 'string' &&
      Array.isArray(msg.clients) &&
      msg.clients.every((c) => typeof c === 'string')
    ) {
      // The host owns no registration — it forwards a validated
      // RepoProviderRegistration to the sink (extension.ts runs the
      // consent-gated mcp.register IPC, k4). Never-throw.
      try {
        deps.onRepoRegisterProviders?.({
          repoPath: msg.repoPath,
          clients: msg.clients as readonly string[],
        });
      } catch (err) {
        logger.warn(`insrc: the provider-registration handler failed — ${errText(err)}`);
      }
      return;
    }
    // Anything else is a silent no-op (a malformed/spoofed message can't drive the host).
  };

  /**
   * Render the Model Tiers panel body (Story S001). The body comes from the
   * injected `modelTiersRenderer`; a host without one renders the placeholder
   * (fallback preserved, mirroring renderRepoPanel). The panel is fully
   * rendered here (no post-load host->webview push), so no ready-gate is
   * needed; each field change posts a write and the host re-renders from
   * fresh config afterward.
   */
  const renderModelTiersPanel = async (panel: PanelHandle): Promise<void> => {
    try {
      let body: string;
      let scripted = false;
      const renderer = deps.modelTiersRenderer;
      if (renderer !== undefined) {
        try {
          body = await renderer();
          scripted = true; // the rendered body carries the per-tier + core-floor controls.
        } catch (err) {
          logger.warn(`insrc: could not render the Model Tiers view — ${errText(err)}`);
          body = VIEW_ERR;
        }
      } else {
        body = MODEL_TIERS_PLACEHOLDER; // fallback (no modelTiersRenderer wired).
      }
      panel.setHtml(shellHtml('Model Tiers', body, makeNonce(), scripted ? MODEL_TIERS_BOOTSTRAP : undefined));
    } catch (err) {
      logger.warn(`insrc: could not render the Model Tiers panel — ${errText(err)}`);
    }
  };

  /**
   * Handle a webview->host message for the Model Tiers panel (Story S001).
   * Validates the shape for both ModelTiersWrite kinds before forwarding —
   * tierField needs a real tier + field + a string value; coreFloor needs a
   * real tier value. Skips a late message after the panel was
   * disposed/replaced. Anything else (malformed/spoofed) is a silent no-op,
   * exactly as an unrecognized Repo Configuration message already is.
   */
  const handleModelTiersMessage = (panel: PanelHandle, message: unknown): void => {
    if (modelTiersPanel !== panel) return; // stale panel (disposed/replaced) — no-op.
    if (typeof message !== 'object' || message === null) return;
    const msg = message as { type?: unknown; kind?: unknown; tier?: unknown; field?: unknown; value?: unknown };
    if (msg.type !== 'modelTiersWrite') return;
    let write: ModelTiersWrite | undefined;
    if (
      msg.kind === 'tierField' &&
      typeof msg.tier === 'string' &&
      (TIER_VALUES as readonly string[]).includes(msg.tier) &&
      typeof msg.field === 'string' &&
      (TIER_FIELDS as readonly string[]).includes(msg.field) &&
      typeof msg.value === 'string'
    ) {
      write = { kind: 'tierField', tier: msg.tier, field: msg.field, value: msg.value } as ModelTiersWrite;
    } else if (msg.kind === 'coreFloor' && typeof msg.value === 'string' && (TIER_VALUES as readonly string[]).includes(msg.value)) {
      write = { kind: 'coreFloor', value: msg.value } as ModelTiersWrite;
    }
    if (write === undefined) return; // malformed — silently dropped, never forwarded.
    // The host owns no write — it forwards a validated ModelTiersWrite to the sink
    // (extension.ts runs the global config.write, k6). A sink throw must not surface.
    try {
      deps.onModelTiersWrite?.(write);
    } catch (err) {
      logger.warn(`insrc: the model-tiers write handler failed — ${errText(err)}`);
    }
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
          disposeActiveController(); // the panel is gone — no ticker survives it (S006).
        },
        (p) => {
          p.onMessage((message) => handleDetailMessage(p, message));
        },
      );
      if (panel === undefined) return;
      detailPanel = panel; // cache synchronously so a rapid second call reveals, not duplicates.
      // Stop any live ticker (the reveal path may re-render over an existing panel),
      // then render. The new document posts `ready` once loaded, which arms the
      // active tab's controller — so its initial emit lands on a live webview.
      disposeActiveController();
      void renderDetail(panel, detailActiveTab);
    },

    openRepoConfiguration(): void {
      const panel = openSingleton(
        repoPanel,
        REPO_VIEW_TYPE,
        'insrc — Repo Configuration',
        () => {
          repoPanel = undefined;
        },
        (p) => {
          p.onMessage((message) => handleRepoMessage(p, message)); // S007: wire the repo bridge once.
        },
      );
      if (panel === undefined) return;
      repoPanel = panel; // cache synchronously so a rapid second call reveals, not duplicates.
      // Render the per-repo editor (S007) from fresh config; renderRepoPanel never
      // throws. A host without a repoRenderer degrades to the S004 placeholder.
      void renderRepoPanel(panel);
    },

    openModelTiers(): void {
      const panel = openSingleton(
        modelTiersPanel,
        MODEL_TIERS_VIEW_TYPE,
        'insrc — Model Tiers',
        () => {
          modelTiersPanel = undefined;
        },
        (p) => {
          p.onMessage((message) => handleModelTiersMessage(p, message)); // Story S001: wire the bridge once.
        },
      );
      if (panel === undefined) return;
      modelTiersPanel = panel; // cache synchronously so a rapid second call reveals, not duplicates.
      // Always render (never a no-op); renderModelTiersPanel never throws. A host
      // without a modelTiersRenderer degrades to the placeholder.
      void renderModelTiersPanel(panel);
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
      else if (chosen.action === 'repoConfig') this.openRepoConfiguration();
      else this.openModelTiers();
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
    .provider-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 8px; border: 1px solid var(--vscode-panel-border, #3c3c3c); border-radius: 6px; margin-bottom: 4px; }
    .status-chip { font-size: 10.5px; border-radius: 9px; padding: 1px 8px; white-space: nowrap; }
    .status-chip.ok { background: rgba(35, 134, 54, 0.25); color: #81c995; }
    .status-chip.warn { background: rgba(187, 128, 9, 0.25); color: #e8b94a; }
    .status-chip.off { opacity: 0.7; }
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
