/**
 * Story E20260921ad0d45c9:S001 / t3 — sc2 StatusSurface.
 *
 * A glanceable editor status indicator reflecting the daemon as
 * running / stopped / errored / unknown, over an INJECTED status-bar handle so
 * the mapping logic is unit-testable with a fake (no live window). The lifecycle
 * and onboarding seams (s2/s5) push resulting state in through `set`.
 */
import type { StatusBarHandle } from './types.js';

/** The four states the indicator can show. `unknown` is the pre-probe default. */
export type DaemonUiState = 'running' | 'stopped' | 'errored' | 'unknown';

export interface StatusSnapshot {
  state: DaemonUiState;
  detail?: string | undefined;
}

export interface StatusSurface {
  /** Render a new status into the status-bar item. */
  set(snapshot: StatusSnapshot): void;
  /** The last snapshot set (starts at `unknown`). */
  current(): StatusSnapshot;
}

interface Presentation {
  text: string;
  tooltip: string;
}

/** Map each state to a glanceable label + tooltip. Pure — no VS Code needed. */
function present(snapshot: StatusSnapshot): Presentation {
  const suffix = snapshot.detail !== undefined && snapshot.detail !== '' ? ` — ${snapshot.detail}` : '';
  switch (snapshot.state) {
    case 'running':
      return { text: '$(pass) insrc', tooltip: `insrc daemon: running${suffix}` };
    case 'stopped':
      return { text: '$(circle-slash) insrc', tooltip: `insrc daemon: stopped${suffix}` };
    case 'errored':
      return { text: '$(error) insrc', tooltip: `insrc daemon: errored${suffix}` };
    case 'unknown':
      return { text: '$(sync~spin) insrc', tooltip: `insrc daemon: checking…${suffix}` };
  }
}

/**
 * Build the sc2 StatusSurface over an injected status-bar handle. The handle is
 * shown immediately in its initial `unknown` state.
 */
export function createStatusSurface(handle: StatusBarHandle): StatusSurface {
  let snapshot: StatusSnapshot = { state: 'unknown' };

  const render = (): void => {
    const p = present(snapshot);
    handle.text = p.text;
    handle.tooltip = p.tooltip;
  };

  render();
  handle.show();

  return {
    set(next: StatusSnapshot): void {
      snapshot = next;
      render();
    },
    current(): StatusSnapshot {
      return snapshot;
    },
  };
}
