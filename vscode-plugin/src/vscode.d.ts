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
  }

  export namespace commands {
    export function registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable;
  }

  export interface ExtensionContext {
    readonly subscriptions: { dispose(): unknown }[];
  }
}
