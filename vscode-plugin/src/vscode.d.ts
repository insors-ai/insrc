/**
 * Minimal compile-only declaration of the `vscode` module — only the surface the
 * foundation story (S001) touches. The real module is supplied by the VS Code
 * host at runtime; this shim keeps the package buildable + dependency-free for
 * v1's onboarding scope. Story S006 (Marketplace packaging) swaps this for the
 * full `@types/vscode`.
 */
declare module 'vscode' {
  export interface Disposable {
    dispose(): void;
  }

  /** A typed event (S006 edit-governance content-provider change signal). */
  export type Event<T> = (listener: (e: T) => unknown) => Disposable;

  /** Fires a typed {@link Event} (S006 baseline content-provider refresh). */
  export class EventEmitter<T> {
    readonly event: Event<T>;
    fire(data: T): void;
    dispose(): void;
  }

  /** A resource identifier (S006 native editor-diff: baseline virtual doc vs the file). */
  export interface Uri {
    readonly scheme: string;
    readonly path: string;
    readonly fsPath: string;
    toString(): string;
  }
  export namespace Uri {
    export function file(path: string): Uri;
    export function parse(value: string): Uri;
  }

  /** Supplies read-only content for a custom-scheme document (S006 baseline diff side). */
  export interface TextDocumentContentProvider {
    readonly onDidChange?: Event<Uri>;
    provideTextDocumentContent(uri: Uri): string | undefined | PromiseLike<string | undefined>;
  }

  export interface StatusBarItem extends Disposable {
    text: string;
    tooltip: string | undefined;
    command: string | undefined;
    show(): void;
    hide(): void;
  }

  export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
  }

  export interface MessageOptions {
    modal?: boolean | undefined;
    detail?: string | undefined;
  }

  /** The editor column a webview panel opens in (S004 sc9). */
  export enum ViewColumn {
    Active = -1,
    Beside = -2,
    One = 1,
    Two = 2,
  }

  /** A quick-pick choice (S004 sc9 status-bar menu). A `label` plus caller fields. */
  export interface QuickPickItem {
    label: string;
    description?: string | undefined;
    detail?: string | undefined;
  }

  /** The webview body of a panel (S004 sc9): set `html`, and the host↔webview bridge. */
  export interface Webview {
    html: string;
    postMessage(message: unknown): PromiseLike<boolean>;
    onDidReceiveMessage(listener: (message: unknown) => unknown): Disposable;
  }

  /** A live webview panel (S004 sc9): create/reveal/dispose + its webview body. */
  export interface WebviewPanel extends Disposable {
    readonly webview: Webview;
    readonly active: boolean;
    readonly visible: boolean;
    reveal(viewColumn?: ViewColumn): void;
    onDidDispose(listener: () => unknown): Disposable;
  }

  export namespace window {
    export function createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem;
    export function showInformationMessage(message: string, options: MessageOptions, ...items: string[]): PromiseLike<string | undefined>;
    /** Surface a non-blocking error toast (sc8 Notifier — a rejected config write). */
    export function showErrorMessage(message: string): PromiseLike<string | undefined>;
    /** Surface a non-blocking warning toast (S006 edit-governance notes, e.g. non-git revert). */
    export function showWarningMessage(message: string, ...items: string[]): PromiseLike<string | undefined>;
    /** Create a webview panel in `showOptions` column (S004 sc9 WebviewPanelHost). */
    export function createWebviewPanel(
      viewType: string,
      title: string,
      showOptions: ViewColumn,
      options?: { enableScripts?: boolean | undefined },
    ): WebviewPanel;
    /** Present a quick-pick menu; resolves the chosen item or undefined on dismiss (S004 sc9). */
    export function showQuickPick<T extends QuickPickItem>(
      items: readonly T[] | PromiseLike<readonly T[]>,
      options?: { placeHolder?: string | undefined },
    ): PromiseLike<T | undefined>;
  }

  export namespace commands {
    export function registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable;
    /** Execute a built-in or contributed command (e.g. 'workbench.action.reloadWindow'). */
    export function executeCommand<T = unknown>(command: string, ...rest: unknown[]): Thenable<T | undefined>;
  }

  export namespace extensions {
    /** The installed+enabled extension with `extensionId`, or undefined (host-detection, S003). */
    export function getExtension(extensionId: string): { readonly id: string } | undefined;
  }

  export namespace env {
    /** The running editor's product name (e.g. 'Visual Studio Code', 'Cursor'). */
    export const appName: string;
    /** The running editor's uri scheme (e.g. 'vscode', 'cursor'). */
    export const uriScheme: string;
  }

  export interface WorkspaceFolder {
    readonly uri: { readonly fsPath: string };
  }

  /**
   * A read/update handle over a slice of the settings tree (S001-settings-UI /
   * sc8). `get`/`update`/`has` take a section id relative to the handle's own
   * section (or a full dotted id when the handle was created section-less).
   */
  export interface WorkspaceConfiguration {
    get<T>(section: string): T | undefined;
    has(section: string): boolean;
    update(section: string, value: unknown, configurationTarget?: ConfigurationTarget | boolean): PromiseLike<void>;
  }

  /** Emitted when settings change; scopes a listener to the keys it cares about. */
  export interface ConfigurationChangeEvent {
    affectsConfiguration(section: string): boolean;
  }

  /**
   * Where an `update` writes. VS Code has NO "machine" target — a setting is made
   * machine-scoped by its `scope:"machine"` manifest declaration (which excludes
   * it from Settings Sync and workspace override); such a setting is written at
   * the Global (user) target. Mirror of the real `vscode.ConfigurationTarget`.
   */
  export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3,
  }

  export namespace workspace {
    /** The open workspace folders, or undefined when no folder is open (S004). */
    export const workspaceFolders: readonly WorkspaceFolder[] | undefined;
    /** A configuration handle; with a `section` its ids are relative to that section (sc8). */
    export function getConfiguration(section?: string): WorkspaceConfiguration;
    /** Subscribe to settings-change events (sc8 live-sync listener). */
    export function onDidChangeConfiguration(listener: (e: ConfigurationChangeEvent) => unknown): Disposable;
    /** Register a read-only content provider for a custom URI scheme (S006 baseline diff side). */
    export function registerTextDocumentContentProvider(scheme: string, provider: TextDocumentContentProvider): Disposable;
  }

  /** A per-scope persisted key/value store (VS Code's `Memento`). */
  export interface Memento {
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
  }

  /** The manifest + identity of an installed extension (VS Code's `Extension<T>`). */
  export interface Extension {
    /** The parsed `package.json` of the extension (carries `version`). */
    readonly packageJSON: { readonly version?: string; readonly [key: string]: unknown };
  }

  export interface ExtensionContext {
    readonly subscriptions: { dispose(): unknown }[];
    /** Absolute path of the directory the extension is installed in. */
    readonly extensionPath: string;
    /** Per-workspace persisted state (S004 one-time register-prompt flag). */
    readonly workspaceState: Memento;
    /** Machine-global persisted state (S003 daemon-auto-update last-seen version). */
    readonly globalState: Memento;
    /** This extension's own descriptor (carries `packageJSON.version`). */
    readonly extension: Extension;
  }
}
