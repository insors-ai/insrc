/**
 * Story E20260921ad0d45c9:S001 — the injectable VS Code boundaries.
 *
 * Each foundation surface (sc2 StatusSurface, sc3 CommandRegistry, sc4
 * ConsentGate) wraps a NARROW, structural slice of the VS Code API passed in as
 * a dependency, so the surface's logic is unit-testable off the editor with a
 * fake. The real `vscode` objects satisfy these shapes structurally; the entry
 * module (extension.ts) is the only place that imports `vscode` and binds them.
 */

/** Anything disposable — VS Code's `Disposable` satisfies this. */
export interface DisposableLike {
  dispose(): unknown;
}

/** The status-bar item slice sc2 drives (VS Code's `StatusBarItem` satisfies it). */
export interface StatusBarHandle extends DisposableLike {
  text: string;
  tooltip: string | undefined;
  show(): void;
}

/** The `commands.registerCommand` slice sc3 uses. */
export type RegisterCommandFn = (command: string, callback: (...args: unknown[]) => unknown) => DisposableLike;

/** The `subscriptions` sink sc3 pushes Disposables into (VS Code's `ExtensionContext.subscriptions`). */
export type DisposableSink = { push(disposable: DisposableLike): unknown };

/** The modal-message slice sc4 uses (VS Code's `window.showInformationMessage` with `modal:true`). */
export type ModalMessageFn = (
  message: string,
  options: { modal: boolean; detail?: string | undefined },
  ...items: string[]
) => PromiseLike<string | undefined>;
