/**
 * Story E20260921ad0d45c9:S004 / t1 — the sc7 WorkspaceRegistrar contract + its
 * injectable seam interfaces.
 *
 * sc7 is internal-shared: s5 consumes WorkspaceRegistrar for the onboarding
 * register step; s4 owns the impl. The WorkspaceFolders + PromptStore seams are
 * type-only here (the real VS-Code-bound impls are constructed in extension.ts,
 * t3), so this module carries NO 'vscode' import (k5) — the S002/S003 pattern.
 */

/** The enrolment state of a workspace root (verbatim from the HLD sketch). */
export interface RegistrationState {
  root: string;
  registered: boolean;
}

/** sc7: check whether the open root is enrolled and enrol it via repo.add only (k3). */
export interface WorkspaceRegistrar {
  /** Registered iff the normalized root matches a repo.list row's path. Never throws. */
  state(root: string): Promise<RegistrationState>;
  /** Enrol via rpc('repo.add', { path }) (no steering); rejects on a repo.add failure. */
  register(root: string): Promise<RegistrationState>;
}

/** The open workspace roots, injected so root resolution is testable off VS Code. */
export type WorkspaceFolders = () => readonly string[];

/** A per-workspace persisted flag store so a dismissed register prompt is not re-nagged (lc1). */
export interface PromptStore {
  /** True iff this key was previously marked dismissed. Never throws (missing ⇒ false). */
  wasDismissed(key: string): boolean;
  /** Persist that this key's prompt was dismissed. */
  markDismissed(key: string): void;
}

/** A volatile in-memory PromptStore for tests (the real one persists via workspaceState). */
export function createInMemoryPromptStore(): PromptStore {
  const dismissed = new Set<string>();
  return {
    wasDismissed: (key) => dismissed.has(key),
    markDismissed: (key) => {
      dismissed.add(key);
    },
  };
}
