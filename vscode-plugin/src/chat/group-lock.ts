/**
 * Story E20261004c4c420c2:S001 — lock the chat's editor group.
 *
 * A vscode-free, deps-injected module (mirrors createEditGovernor). The chat is an
 * editor-tab webview, so a file picked in the Explorer can open as a tab on top of it.
 * This locks the chat's group the first time the chat tab is verifiably the ACTIVE
 * tab, so files open in another group instead.
 *
 * `workbench.action.lockEditorGroup` takes no target — it locks whichever group is
 * active when it runs — so the command is only issued while the panel is active AND
 * the window's active tab is the chat webview. That is BEST-EFFORT: the check and the
 * command are not atomic, and a focus change between them can lock another group.
 *
 * The panel's view-state events and the tab model update on separate channels with no
 * ordering guarantee, so an attempt is made on BOTH until one succeeds.
 */

/** The slice of a vscode.WebviewPanel the lock needs. */
export interface LockablePanel {
  readonly active: boolean;
  onDidChangeViewState(listener: () => unknown): { dispose(): void };
  onDidDispose(listener: () => unknown): unknown;
}

export interface ChatGroupLockDeps {
  /** Live read of insrc.chat.lockGroup; read at every attempt. */
  readonly enabled: () => boolean;
  /** The chat panel's view type (chat-panel.ts CHAT_VIEW_TYPE). */
  readonly viewType: string;
  /** The raw `input` of the active tab group's active tab, or undefined. No logic. */
  readonly activeTabInput: () => unknown;
  /** Subscribe to tab-model changes (tab changes AND tab-group changes). */
  readonly onTabsChanged: (listener: () => void) => { dispose(): void };
  /** Runs workbench.action.lockEditorGroup on the active group. */
  readonly lockActiveGroup: () => PromiseLike<unknown>;
  readonly warn: (message: string) => void;
}

export interface ChatGroupLock {
  attach(panel: LockablePanel): void;
}

/**
 * Whether a tab's `input` is the chat webview. VS Code reports a webview panel's view
 * type on its tab input with a host prefix (`mainThreadWebview-insrc.chatPanel`), so the
 * rule is: equals the view type, or ends with `-` + the view type. This is the ONE
 * definition of that rule — extension.ts compares nothing itself.
 */
export function isChatTabInput(input: unknown, viewType: string): boolean {
  if (typeof input !== 'object' || input === null) return false;
  const actual = (input as { viewType?: unknown }).viewType;
  if (typeof actual !== 'string') return false;
  return actual === viewType || actual.endsWith(`-${viewType}`);
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function createChatGroupLock(deps: ChatGroupLockDeps): ChatGroupLock {
  return {
    attach(panel: LockablePanel): void {
      // `finished` is set synchronously BEFORE the command is invoked, so an event that
      // lands while the command is still in flight can never issue it a second time.
      let finished = false;
      const subscriptions: Array<{ dispose(): void }> = [];

      const finish = (): void => {
        finished = true;
        for (const s of subscriptions.splice(0)) {
          try {
            s.dispose();
          } catch {
            /* already disposed */
          }
        }
      };

      const attempt = (): void => {
        if (finished) return;
        try {
          if (!panel.active) return;
          if (!isChatTabInput(deps.activeTabInput(), deps.viewType)) return;
          if (!deps.enabled()) return;
        } catch (e) {
          // A failed check leaves the panel eligible: a later event retries.
          deps.warn(`[group-lock] check failed: ${errText(e)}`);
          return;
        }
        // Issued at most once per panel, whether it then resolves or rejects — a command
        // that cannot succeed (an editor fork without it) is not retried.
        finish();
        try {
          deps.lockActiveGroup().then(undefined, (e: unknown) => {
            deps.warn(`[group-lock] lockEditorGroup failed: ${errText(e)}`);
          });
        } catch (e) {
          deps.warn(`[group-lock] lockEditorGroup failed: ${errText(e)}`);
        }
      };

      // Subscribe BEFORE the first attempt, so an immediate lock disposes them and no
      // listener outlives the lock.
      try {
        subscriptions.push(panel.onDidChangeViewState(attempt));
        subscriptions.push(deps.onTabsChanged(attempt));
        panel.onDidDispose(finish);
      } catch (e) {
        // Never throw into the panel create/restore path.
        deps.warn(`[group-lock] subscribe failed: ${errText(e)}`);
        finish();
        return;
      }
      attempt();
    },
  };
}
