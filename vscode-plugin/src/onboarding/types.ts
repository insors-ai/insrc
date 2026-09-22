/**
 * Story E20260921ad0d45c9:S005 / t1 — the OnboardingStore seam.
 *
 * A per-workspace persisted flag so the auto-run onboarding sequence fires ONCE
 * per workspace root. The real binding (over vscode.ExtensionContext.workspaceState)
 * is constructed in extension.ts (t3), so this module carries no 'vscode' import
 * (k5). Mirrors S004's PromptStore. An in-memory impl is provided for tests.
 */

export interface OnboardingStore {
  /** True iff this workspace root was previously onboarded. Never throws (missing ⇒ false). */
  wasOnboarded(root: string): boolean;
  /** Persist that this workspace root completed the onboarding sequence. */
  markOnboarded(root: string): void;
}

/** A volatile in-memory OnboardingStore for tests (the real one persists via workspaceState). */
export function createInMemoryOnboardingStore(): OnboardingStore {
  const onboarded = new Set<string>();
  return {
    wasOnboarded: (root) => onboarded.has(root),
    markOnboarded: (root) => {
      onboarded.add(root);
    },
  };
}
