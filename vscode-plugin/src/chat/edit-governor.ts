/**
 * Story E20260925edb76e2e:S006 — the edit governor (post-write review + revert).
 * Story E20261013b2e8109f:S001 — it also finds what a turn changed, section by section.
 *
 * A vscode-free, deps-injected module (mirrors createChatPanelHost). It takes a snapshot of the
 * working tree when a turn starts and, on check(), asks the baseline for the patch between that
 * snapshot and the working tree as it is now, cuts it into sections (diff-sections.ts) and tells
 * the render seam which sections are new, which changed and which are gone. That is one
 * comparison for every provider and every way a file can change (an edit tool, a patch, a shell
 * command). With insrc.chat.diffView 'editor' it instead opens each edited file in a native diff
 * editor on the file-edit signal, and in review mode reverts a rejected edit to the snapshot.
 * It is a PASSTHROUGH observer (k8): it never gates the CLI write before disk. All git/fs/editor
 * access is injected, so the logic is unit-testable with fakes and nothing is persisted here
 * (k3) — per-turn state is in-memory only.
 */
import { parsePatch, reconcileSections, type KnownSection, type SectionOp } from './diff-sections.js';

export type DiffView = 'chat' | 'editor';

/** An opaque handle to a pre-turn workspace baseline (e.g. a git tree/stash object id). */
export interface BaselineHandle {
  readonly ref: string;
  /** The private index file the snapshot was written through; removed by release. */
  readonly index?: string;
}

/** Captures an exact pre-turn working-tree baseline (git tree/stash), no working-tree disturbance. */
export interface WorkspaceBaseline {
  /** Whether an exact baseline can be captured for this workspace (e.g. a git repo). */
  available(cwd: string): Promise<boolean>;
  /** Snapshot the working tree; the returned handle survives for the life of the turn. */
  snapshot(cwd: string): Promise<BaselineHandle>;
  /** The path's pre-turn content from the baseline, or undefined if it did not exist. */
  read(handle: BaselineHandle, path: string): Promise<string | undefined>;
  /**
   * The patch between the snapshot and the working tree as it is now ('' when nothing changed),
   * or undefined when it cannot be read.
   */
  changes(handle: BaselineHandle): Promise<string | undefined>;
  /** Free what the snapshot holds outside the repository (its private index file). */
  release(handle: BaselineHandle): Promise<void>;
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
  /**
   * The result of one check: the sections to add, update and withdraw, and how many new sections
   * the per-check limit left out.
   */
  showSections(ops: readonly SectionOp[], overflow: { readonly sections: number; readonly files: number } | undefined): void;
  /** Called at most once per turn, the first time a check cannot read the changes. */
  sectionsUnreadable(): void;
  showEditor(path: string, baseline: string | undefined, opts: { review: boolean }): Promise<void>;
}

export interface EditGovernorLogger {
  warn(msg: string): void;
}

export interface EditGovernorDeps {
  readonly baseline: WorkspaceBaseline;
  readonly fs: FsSeam;
  readonly render: EditRenderSeam;
  readonly diffView: () => DiffView;
  readonly logger?: EditGovernorLogger;
  /** Surface a user-facing note (e.g. revert unavailable in a non-git workspace). */
  readonly notify?: (msg: string) => void;
}

export interface EditGovernor {
  beginTurn(input: { mode: 'auto' | 'review'; cwd: string }): Promise<void>;
  /** The editor view only: open the edited file's diff in an editor (and track it in review mode). */
  observe(path: string): Promise<void>;
  /** Whether this turn's changes are shown as sections in the chat (a snapshot exists and the chat view is on). */
  sectionsActive(): boolean;
  /**
   * Compare the working tree with the turn's snapshot and report what changed since the last
   * check. Checks run one at a time; a call made while one runs causes exactly one more, and its
   * promise resolves when a check that started after the call has ended. Never rejects.
   */
  check(): Promise<void>;
  /** The cwd-relative paths of every section known this turn, shown or hidden. */
  sectionPaths(): ReadonlySet<string>;
  /** The turn ended: one last check, then the snapshot is released. */
  resolveTurn(): Promise<void>;
  /** The turn stopped reporting before its end: no last check; the snapshot is released at once. */
  abandonTurn(): Promise<void>;
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
  /** The sections the checks of this turn have seen, with the ids the render seam knows them by. */
  known: KnownSection[];
  nextId: number;
  /** render.sectionsUnreadable was called for this turn. */
  unreadableSaid: boolean;
  /** No more checks: the turn was resolved or abandoned. */
  ended: boolean;
  /** baseline.release was called for the handle. */
  released: boolean;
  /** The turn was abandoned: a check still in flight reports nothing. */
  abandoned?: true;
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
  const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
  let turn: TurnState | undefined;
  /** The check running now, and the one more that runs after it when a call arrived meanwhile. */
  let active: Promise<void> | undefined;
  let queued: Promise<void> | undefined;

  async function release(t: TurnState): Promise<void> {
    if (t.handle === undefined || t.released) return;
    t.released = true;
    await safe(() => deps.baseline.release(t.handle!), (e) => warn(`[edit-governor] baseline.release failed: ${msg(e)}`));
  }

  async function beginTurn(input: { mode: 'auto' | 'review'; cwd: string }): Promise<void> {
    // The previous turn's checks stop here, and what its snapshot holds outside the repository goes.
    const prev = turn;
    turn = undefined;
    if (prev !== undefined) {
      prev.ended = true;
      await release(prev);
    }
    let handle: BaselineHandle | undefined;
    const ok = await safe(() => deps.baseline.available(input.cwd), (e) =>
      warn(`[edit-governor] baseline.available failed: ${msg(e)}`),
    );
    if (ok === true) {
      handle = await safe(() => deps.baseline.snapshot(input.cwd), (e) =>
        warn(`[edit-governor] baseline.snapshot failed: ${msg(e)}`),
      );
    }
    // A missing baseline (non-git / snapshot failure) => no sections and no revert for this turn.
    turn = { mode: input.mode, cwd: input.cwd, handle, edits: new Map(), known: [], nextId: 0, unreadableSaid: false, ended: false, released: false };
  }

  function sectionsActive(): boolean {
    return turn !== undefined && !turn.ended && turn.handle !== undefined && deps.diffView() === 'chat';
  }

  function sectionPaths(): ReadonlySet<string> {
    return new Set((turn?.known ?? []).map((k) => k.section.path));
  }

  /** One comparison of the working tree with the snapshot. Never throws. */
  async function runCheck(): Promise<void> {
    // Capture the turn this check belongs to: it runs over slow git IO, and a result that arrives
    // after the turn was replaced, resolved or abandoned must not reach the render seam.
    const t = turn;
    if (t === undefined || t.ended || t.handle === undefined || deps.diffView() !== 'chat') return;
    const patch = await safe(() => deps.baseline.changes(t.handle!), (e) => warn(`[edit-governor] baseline.changes failed: ${msg(e)}`));
    if (turn !== t || t.abandoned === true) return;
    try {
      if (patch === undefined) {
        warn('[edit-governor] the changes of this turn could not be read');
        if (!t.unreadableSaid) {
          t.unreadableSaid = true;
          deps.render.sectionsUnreadable();
        }
        return;
      }
      const result = reconcileSections(t.known, parsePatch(patch), t.nextId);
      t.known = result.known;
      t.nextId = result.nextId;
      if (result.ops.length > 0 || result.overflow !== undefined) deps.render.showSections(result.ops, result.overflow);
    } catch (e) {
      warn(`[edit-governor] showing the changed sections failed: ${msg(e)}`);
    }
  }

  function check(): Promise<void> {
    if (active === undefined) {
      const mine: Promise<void> = runCheck().then(() => {
        if (active === mine) active = undefined;
      });
      active = mine;
      return mine;
    }
    // A check is running and may already have read the tree: one more runs after it, for every
    // call made meanwhile.
    if (queued === undefined) {
      const running = active;
      const next: Promise<void> = running.then(() => {
        if (queued === next) queued = undefined;
        return check();
      });
      queued = next;
    }
    return queued;
  }

  async function observe(path: string): Promise<void> {
    // The chat view shows a turn's changes as sections (check); only the editor view acts on the
    // file-edit signal.
    if (deps.diffView() !== 'editor') return;
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
            warn(`[edit-governor] baseline.read failed for ${path}: ${msg(e)}`),
          )
        : undefined;
      // Track for decision ONLY in review mode (auto never surfaces accept/reject).
      if (review) t.edits.set(path, { baseline: baselineContent, decided: false });
    }

    // If a newer turn superseded this one while we awaited IO, drop the render — its diff
    // belongs to the old turn and would paint into (or mislead) the new one.
    if (turn !== t) return;

    await safe(() => deps.render.showEditor(path, baselineContent, { review }), (e) =>
      warn(`[edit-governor] showEditor failed for ${path}: ${msg(e)}`),
    );
  }

  async function resolveTurn(): Promise<void> {
    const t = turn;
    if (t === undefined || t.ended) return;
    // What changed since the last tool call (or with no tool call at all) is found here.
    await check();
    if (turn !== t) return;
    t.ended = true;
    // Auto (or no-baseline): nothing to gate — clear the per-turn state now.
    // Review: leave tracked edits so late-arriving edit-decision messages are honored;
    // they are discarded at the next beginTurn (a superseded turn's edits stay on disk).
    if (t.mode !== 'review' || t.handle === undefined) t.edits.clear();
    await release(t);
  }

  async function abandonTurn(): Promise<void> {
    const t = turn;
    if (t === undefined || t.ended) return;
    t.ended = true;
    t.abandoned = true;
    t.known = [];
    await release(t);
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

  return { beginTurn, observe, sectionsActive, check, sectionPaths, resolveTurn, abandonTurn, decide };
}
