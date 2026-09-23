/**
 * Story E20260922401ae5fb:S004 / t1 — the sc9 WebviewPanelHost contract + its
 * injectable VS Code boundaries.
 *
 * sc9 is the single tabbed-webview host + read-only DaemonData gateway for every
 * live page (Detailed Status + Repo Configuration). Like sc2/sc3/sc6/sc8, the
 * cores are VS-Code-free: they run over NARROW structural slices of the editor
 * API (PanelFactory, MenuPicker) injected as dependencies, so the host + gateway
 * are unit-testable off the editor with fakes. extension.ts is the only module
 * that imports `vscode` and binds the real objects.
 *
 * S004 implements the SHELL only — the panel lifecycle, the fixed tab framework
 * (daemon default + Workflows/Debug placeholders), the status-bar 2-item menu,
 * and the full read-only gateway. The rich tab bodies are the consuming stories'
 * (s5 daemon/workflows, s6 debug, s7 repo form).
 */

import type { DisposableLike } from '../surfaces/types.js';

// ---------------------------------------------------------------------------
// sc9 host + view types (verbatim from the HLD interfaceSketch)
// ---------------------------------------------------------------------------

/** The three tabs of the Detailed Status panel, in authored order (daemon first). */
export type DetailTab = 'daemon' | 'workflows' | 'debug';

/**
 * The sc9 host: opens/reveals the two panels. Each `open*` is single-instance —
 * created on first call, revealed thereafter. `showStatusMenu` is the body of
 * the status-bar item's click command (a 2-item QuickPick); it is NOT a new
 * public surface member, just the host method extension.ts binds.
 */
export interface WebviewPanelHost {
  /** Create-or-reveal the Detailed Status panel, selecting `tab` (default 'daemon'). */
  openDetailedStatus(tab?: DetailTab): void;
  /** Create-or-reveal the separate Repo Configuration panel (shell only in S004). */
  openRepoConfiguration(): void;
  /** Show the status-bar 2-item menu and route the choice to the matching open method. */
  showStatusMenu(): Promise<void>;
}

/**
 * The read-only DaemonData facade over the existing daemon read IPC + local
 * reads. Every method maps a source into its View type; a failed read rejects
 * with {@link GatewayReadError} — the gateway surfaces no UI itself.
 */
export interface DaemonDataGateway {
  status(): Promise<DaemonStatusView>;
  workflowChain(): Promise<WorkflowChainView>;
  mcpClients(): Promise<readonly McpClientView[]>;
  registeredRepos(): Promise<readonly RepoRef[]>;
  scanOrphans(): Promise<readonly OrphanProcess[]>;
}

/** The minimal default Daemon-tab view (ac2). s5 enriches the rendering. */
export interface DaemonStatusView {
  readonly state: string;
  readonly detail?: string;
}

/** The Workflows-tab view: one row per work item's chain (s5 renders it). */
export interface WorkflowChainView {
  readonly rows: readonly WorkflowChainRow[];
}

export interface WorkflowChainRow {
  readonly slug: string;
  readonly stage: string;
  readonly status: string;
}

/** One attached MCP/socket client (s6 Debug tab renders it). */
export interface McpClientView {
  readonly host: string;
  readonly wired: boolean;
}

/** One stray daemon/mcp process the scan found (s6 consent-gated kill consumes it). */
export interface OrphanProcess {
  readonly pid: number;
  readonly command: string;
}

/** A registered repo reference (s7 repo picker consumes it). */
export interface RepoRef {
  readonly path: string;
  readonly name: string;
}

/** Thrown/rejected by a gateway method when its underlying read fails. */
export class GatewayReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayReadError';
  }
}

// ---------------------------------------------------------------------------
// Injected VS Code boundaries (the real editor API satisfies these shapes)
// ---------------------------------------------------------------------------

/**
 * A live webview panel handle — the slice of VS Code's `WebviewPanel` the host
 * drives. The real object satisfies it structurally; a fake records the calls.
 */
export interface PanelHandle extends DisposableLike {
  /** Set the panel's HTML body (the rendered tab shell). */
  setHtml(html: string): void;
  /** Bring the panel to the foreground. */
  reveal(): void;
  /** Fire `listener` when the user closes the panel (clears the host's cached ref). */
  onDidDispose(listener: () => void): void;
}

/** The `window.createWebviewPanel` slice the host uses (one factory per panel kind). */
export type PanelFactory = (options: { readonly viewType: string; readonly title: string }) => PanelHandle;

/** One choice offered in the status-bar menu (VS Code's `QuickPickItem` satisfies it). */
export interface MenuItem {
  readonly label: string;
  /** Which host action this item maps to (kept out of the visible label). */
  readonly action: 'detailed' | 'repoConfig';
}

/**
 * The `window.showQuickPick` slice sc9 uses: present the items, resolve the
 * chosen one or `undefined` when the user dismisses (Esc).
 */
export type MenuPicker = (items: readonly MenuItem[]) => Promise<MenuItem | undefined>;

/** The `logger` slice the host/gateway use for warn-on-degrade (never console). */
export interface PanelLogger {
  warn(message: string): void;
}

/** A read-only scan of the local process table for stray daemon/mcp processes. */
export type ProcessScan = () => Promise<readonly OrphanProcess[]>;

// ---------------------------------------------------------------------------
// Dependency bundles
// ---------------------------------------------------------------------------

/** The injected boundaries `createWebviewPanelHost` runs over. */
export interface WebviewPanelHostDeps {
  readonly panels: PanelFactory;
  readonly pickMenu: MenuPicker;
  readonly gateway: DaemonDataGateway;
  readonly logger: PanelLogger;
}

/** The read-only data sources `createDaemonDataGateway` wires (all local, no cloud). */
export interface DaemonDataGatewayDeps {
  /** The shared sc1 client — the only daemon path (daemon.status/repo.list/daemon.debug-status). */
  readonly rpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  /** Resolves the `.insrc/artifacts` root for the workflow-chain read (or undefined). */
  readonly artifactsRoot: () => string | undefined;
  /** The local process-table scan (mirrors the JetBrains OrphanProcessSeam). */
  readonly processScan: ProcessScan;
  readonly logger: PanelLogger;
}
