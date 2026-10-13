/**
 * Story E20261013e62a9269:S001 — a document a chat turn presents for approval is opened in
 * the review pane without the user doing anything.
 *
 * The chat host begins a presented turn for each turn, passes it the turn's tool results
 * and ends it. Two things open a document:
 *   - a tool result that carries a workflow's `pendingApproval.artifactPath` opens the
 *     pending document with that path, at once (a revision of a document that was already
 *     pending included);
 *   - the turn's end opens every document that became pending during the turn and was not
 *     opened in it (a build or code review record, a workflow driven from a script).
 * A turn opens a document at most once. Nothing here throws to the chat host: a failed
 * read of the pending list or a failed open is logged and that call opens nothing.
 *
 * Free of vscode: the pending list and the open are injected.
 */
import type { ChatPanelLogger } from './chat-panel.js';

export interface PendingDocument {
  readonly id: string;
  /** The document's .md path, as the daemon resolves it (absolute). */
  readonly mdPath: string;
}

export interface ReviewPresenterDeps {
  pendingDocuments(): Promise<readonly PendingDocument[]>;
  open(target: { readonly artifactId: string; readonly mdPath: string }): void;
  readonly log: ChatPanelLogger;
}

/** One chat turn, as the presenter sees it. */
export interface PresentedTurn {
  /** A tool result's whole text. */
  toolResult(output: string): void;
  /** The turn is over. A second call does nothing. */
  end(): void;
}

export interface ReviewPresenter {
  begin(): PresentedTurn;
}

/** What a turn knows; a turn begun while the one before it has not ended carries that turn's on. */
interface TurnState {
  /** The ids pending when the turn began; undefined while unread or when the read failed. */
  before: ReadonlySet<string> | undefined;
  readonly opened: Set<string>;
  /** The turn's calls, one behind another. */
  queue: Promise<void>;
}

const BLOCK = 'pendingApproval';

/** The path a tool result presents, or undefined when it presents none. */
export function presentedPathOf(output: string): string | undefined {
  if (!output.includes(BLOCK)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const block = (parsed as Record<string, unknown>)[BLOCK];
  if (typeof block !== 'object' || block === null) return undefined;
  const path = (block as Record<string, unknown>)['artifactPath'];
  return typeof path === 'string' && path !== '' ? path : undefined;
}

/** Both paths are absolute and resolved the same way, so they are equal; a list path that is the presented path's tail is tolerated. */
const samePath = (listed: string, presented: string): boolean =>
  listed === presented || (listed !== '' && presented.endsWith(`/${listed}`));

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function createReviewPresenter(deps: ReviewPresenterDeps): ReviewPresenter {
  const { log } = deps;
  /** The newest turn's handle and state; `ended` says whether that turn is over. */
  let newest: { readonly handle: PresentedTurn; readonly state: TurnState; ended: boolean } | undefined;

  async function read(what: string): Promise<readonly PendingDocument[] | undefined> {
    try {
      return await deps.pendingDocuments();
    } catch (err) {
      log.warn(`review presenter: the pending list could not be read ${what}: ${errorText(err)}`);
      return undefined;
    }
  }

  function open(state: TurnState, doc: PendingDocument): void {
    if (state.opened.has(doc.id)) return;
    // Marked first: an open that throws is not tried again in this turn.
    state.opened.add(doc.id);
    try {
      deps.open({ artifactId: doc.id, mdPath: doc.mdPath });
    } catch (err) {
      log.error(`review presenter: ${doc.id} could not be opened: ${errorText(err)}`);
    }
  }

  const enqueue = (state: TurnState, work: () => Promise<void>): void => {
    state.queue = state.queue.then(work).catch((err: unknown) => {
      log.error(`review presenter: ${errorText(err)}`);
    });
  };

  return {
    begin(): PresentedTurn {
      let state: TurnState;
      if (newest !== undefined && !newest.ended) {
        // The turn before this one is still running: whatever it makes pending is new to this
        // one too, so its start list and what it opened are carried on.
        state = newest.state;
      } else {
        const fresh: TurnState = { before: undefined, opened: new Set(), queue: Promise.resolve() };
        // Asked for now, not when the queue comes round to it: the list is the one of this moment.
        const atStart = read('at the start of the turn');
        enqueue(fresh, async () => {
          const docs = await atStart;
          if (docs !== undefined) fresh.before = new Set(docs.map((d) => d.id));
        });
        state = fresh;
      }
      const mine: { readonly handle: PresentedTurn; readonly state: TurnState; ended: boolean } = {
        state,
        ended: false,
        handle: {
          toolResult(output: string): void {
            const path = presentedPathOf(output);
            if (path === undefined) return;
            enqueue(state, async () => {
              const docs = await read('for a presented document');
              const doc = docs?.find((d) => samePath(d.mdPath, path));
              if (doc !== undefined) open(state, doc);
            });
          },
          end(): void {
            if (mine.ended) return;
            mine.ended = true;
            // A later turn carries this one's state on: its own end opens what is new.
            if (newest !== mine) return;
            enqueue(state, async () => {
              // Without the start list there is no telling what is new.
              if (state.before === undefined) return;
              const docs = await read('at the end of the turn');
              for (const doc of docs ?? []) if (!state.before.has(doc.id)) open(state, doc);
            });
          },
        },
      };
      newest = mine;
      return mine.handle;
    },
  };
}
