/**
 * Story E20260925edb76e2e:S006 — the edit governor (post-write review + revert).
 *
 * A vscode-free, deps-injected module (mirrors createChatPanelHost). It observes the
 * sc2 file-edit SIGNAL, computes the diff ITSELF from a pre-turn baseline vs the
 * current on-disk content (so it is correct for BOTH providers — codex file_change
 * carries empty hunks, claude Write/MultiEdit are unparsed by the adapter), renders
 * it through an injected seam (chat webview OR native editor per insrc.chat.diffView),
 * and in review mode reverts a rejected edit to the pre-turn baseline. It is a
 * PASSTHROUGH observer (k8): it never gates the CLI write before disk. All git/fs/
 * editor access is injected, so the governance logic is unit-testable with fakes and
 * nothing new is persisted (k3) — per-turn state is in-memory only.
 */
import type { UnifiedDiff } from './stream-events.js';

export type DiffView = 'chat' | 'editor';

/** An opaque handle to a pre-turn workspace baseline (e.g. a git tree/stash object id). */
export interface BaselineHandle {
  readonly ref: string;
}

/** Captures an exact pre-turn working-tree baseline (git tree/stash), no working-tree disturbance. */
export interface WorkspaceBaseline {
  /** Whether an exact baseline can be captured for this workspace (e.g. a git repo). */
  available(cwd: string): Promise<boolean>;
  /** Snapshot the working tree; the returned handle survives for the life of the turn. */
  snapshot(cwd: string): Promise<BaselineHandle>;
  /** The path's pre-turn content from the baseline, or undefined if it did not exist. */
  read(handle: BaselineHandle, path: string): Promise<string | undefined>;
}

/** Current on-disk file IO (used to compute the after-content + apply a revert). */
export interface FsSeam {
  /** Current content of a path, or undefined if missing / binary (non-text). */
  read(path: string): Promise<string | undefined>;
  write(path: string, content: string): Promise<void>;
  remove(path: string): Promise<void>;
}

/** Renders an edit's diff on the configured surface (ac4). Provided by extension.ts. */
export interface EditRenderSeam {
  showChat(path: string, diff: UnifiedDiff, opts: { review: boolean }): void;
  showEditor(path: string, baseline: string | undefined, opts: { review: boolean }): Promise<void>;
}

export interface EditGovernorLogger {
  warn(msg: string): void;
}

export interface EditGovernorDeps {
  readonly baseline: WorkspaceBaseline;
  readonly fs: FsSeam;
  readonly computeDiff: (before: string | undefined, after: string, path: string) => UnifiedDiff;
  readonly render: EditRenderSeam;
  readonly diffView: () => DiffView;
  readonly logger?: EditGovernorLogger;
  /** Surface a user-facing note (e.g. revert unavailable in a non-git workspace). */
  readonly notify?: (msg: string) => void;
}

export interface EditGovernor {
  beginTurn(input: { mode: 'auto' | 'review'; cwd: string }): Promise<void>;
  observe(path: string): Promise<void>;
  resolveTurn(): Promise<void>;
  decide(path: string, accept: boolean): Promise<void>;
}

/** A tracked (review-mode) edit awaiting an accept/reject decision. */
interface TrackedEdit {
  readonly baseline: string | undefined;
  decided: boolean;
}

interface TurnState {
  mode: 'auto' | 'review';
  cwd: string;
  /** undefined => no exact baseline captured (non-git / snapshot failed) => visualize-only. */
  handle: BaselineHandle | undefined;
  edits: Map<string, TrackedEdit>;
}

const NOOP_WARN = (): void => {};

async function safe<T>(fn: () => Promise<T>, onErr: (e: unknown) => void): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    onErr(e);
    return undefined;
  }
}

export function createEditGovernor(deps: EditGovernorDeps): EditGovernor {
  const warn = deps.logger?.warn ?? NOOP_WARN;
  let turn: TurnState | undefined;

  async function beginTurn(input: { mode: 'auto' | 'review'; cwd: string }): Promise<void> {
    let handle: BaselineHandle | undefined;
    const ok = await safe(() => deps.baseline.available(input.cwd), (e) =>
      warn(`[edit-governor] baseline.available failed: ${e instanceof Error ? e.message : String(e)}`),
    );
    if (ok === true) {
      handle = await safe(() => deps.baseline.snapshot(input.cwd), (e) =>
        warn(`[edit-governor] baseline.snapshot failed: ${e instanceof Error ? e.message : String(e)}`),
      );
    }
    // A missing baseline (non-git / snapshot failure) => visualize-only for this turn.
    turn = { mode: input.mode, cwd: input.cwd, handle, edits: new Map() };
  }

  async function observe(path: string): Promise<void> {
    // Capture the turn this observe belongs to. observe is fire-and-forget over slow
    // git/fs IO; if a new turn begins (beginTurn swaps `turn`) before this resolves,
    // we must NOT read/track/render against the new turn's state (cross-turn contamination).
    const t = turn;
    if (t === undefined) return;
    // Review governance is only offered when we have an exact baseline to revert to.
    const review = t.mode === 'review' && t.handle !== undefined;

    let baselineContent: string | undefined;
    const existing = t.edits.get(path);
    if (existing !== undefined) {
      baselineContent = existing.baseline; // same path edited again this turn: keep the FIRST baseline
    } else {
      baselineContent = t.handle !== undefined
        ? await safe(() => deps.baseline.read(t.handle!, path), (e) =>
            warn(`[edit-governor] baseline.read failed for ${path}: ${e instanceof Error ? e.message : String(e)}`),
          )
        : undefined;
      // Track for decision ONLY in review mode (auto never surfaces accept/reject).
      if (review) t.edits.set(path, { baseline: baselineContent, decided: false });
    }

    const after = (await safe(() => deps.fs.read(path), (e) =>
      warn(`[edit-governor] fs.read failed for ${path}: ${e instanceof Error ? e.message : String(e)}`),
    )) ?? '';

    // If a newer turn superseded this one while we awaited IO, drop the render — its diff
    // belongs to the old turn and would paint into (or mislead) the new one.
    if (turn !== t) return;

    let diff: UnifiedDiff;
    try {
      diff = deps.computeDiff(baselineContent, after, path);
    } catch (e) {
      warn(`[edit-governor] computeDiff failed for ${path}: ${e instanceof Error ? e.message : String(e)}`);
      return; // cannot render a diff for this path; the turn continues
    }

    if (deps.diffView() === 'editor') {
      await safe(() => deps.render.showEditor(path, baselineContent, { review }), (e) =>
        warn(`[edit-governor] showEditor failed for ${path}: ${e instanceof Error ? e.message : String(e)}`),
      );
    } else {
      try {
        deps.render.showChat(path, diff, { review });
      } catch (e) {
        warn(`[edit-governor] showChat failed for ${path}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  async function resolveTurn(): Promise<void> {
    const t = turn;
    if (t === undefined) return;
    // Auto (or no-baseline): nothing to gate — clear the per-turn state now.
    // Review: leave tracked edits so late-arriving edit-decision messages are honored;
    // they are discarded at the next beginTurn (a superseded turn's edits stay on disk).
    if (t.mode !== 'review' || t.handle === undefined) t.edits.clear();
  }

  async function decide(path: string, accept: boolean): Promise<void> {
    if (turn === undefined) return;
    const entry = turn.edits.get(path);
    if (entry === undefined || entry.decided) return; // unknown / stale / duplicate -> no-op
    entry.decided = true;
    if (accept) return; // keep the on-disk change

    // Reject: restore the pre-turn baseline. A new file (no baseline) is removed.
    if (turn.handle === undefined) {
      deps.notify?.('revert unavailable — not a git workspace');
      return;
    }
    await safe(
      () => (entry.baseline === undefined ? deps.fs.remove(path) : deps.fs.write(path, entry.baseline)),
      (e) => {
        warn(`[edit-governor] revert failed for ${path}: ${e instanceof Error ? e.message : String(e)}`);
        deps.notify?.(`could not revert ${path}`);
      },
    );
  }

  return { beginTurn, observe, resolveTurn, decide };
}

/**
 * A small, dependency-free line diff (LCS) producing a single-hunk {@link UnifiedDiff}.
 * Independent of the sc2 payload, so it renders correctly for every provider/edit kind.
 * A binary/non-text file (fs.read returned undefined -> before/after '') yields an
 * empty-hunk diff the renderer shows as "binary file changed".
 */
export function defaultComputeDiff(before: string | undefined, after: string, path: string): UnifiedDiff {
  const a = before === undefined || before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');

  // LCS table (small files; this is a UI diff, not a merge engine).
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const lines: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push(` ${a[i]!}`);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      lines.push(`-${a[i]!}`);
      i++;
    } else {
      lines.push(`+${b[j]!}`);
      j++;
    }
  }
  while (i < n) lines.push(`-${a[i++]!}`);
  while (j < m) lines.push(`+${b[j++]!}`);

  return {
    path,
    hunks: [{ oldStart: 1, oldLines: n, newStart: 1, newLines: m, lines }],
  };
}
