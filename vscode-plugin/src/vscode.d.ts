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

  export namespace window {
    export function createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem;
    export function showInformationMessage(message: string, options: MessageOptions, ...items: string[]): PromiseLike<string | undefined>;
    /** Surface a non-blocking error toast (sc8 Notifier — a rejected config write). */
    export function showErrorMessage(message: string): PromiseLike<string | undefined>;
  }

  export namespace commands {
    export function registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable;
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
  }

  /** A per-scope persisted key/value store (VS Code's `Memento`). */
  export interface Memento {
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
  }

  export interface ExtensionContext {
    readonly subscriptions: { dispose(): unknown }[];
    /** Absolute path of the directory the extension is installed in. */
    readonly extensionPath: string;
    /** Per-workspace persisted state (S004 one-time register-prompt flag). */
    readonly workspaceState: Memento;
  }
}
