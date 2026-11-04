/**
 * Story E20261013e62a9269:S001, then Story E20261015067b05b6:S001 — a document a chat turn
 * presents for review is opened in the review pane without the user doing anything.
 *
 * The controller declares what it presents by calling `insrc_present` with the documents'
 * artifact ids or paths; the provider mapper puts that list on the tool-call event and the chat
 * host passes it to `declared`. Only a declaration opens anything: the presenter reads no tool
 * result and does not guess at the end of a turn what became pending.
 *
 * A turn opens a document at most once. Nothing here throws to the chat host: a failed read of
 * the pending list or a failed open is logged and shown through the outcome.
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
  open(target: { readonly artifactId: string; readonly mdPath: string; readonly presentKey: string }): void;
  readonly log: ChatPanelLogger;
}

/**
 * What a declaration came to: the declared names that are open in the review pane for this turn,
 * the ones that are not pending (or match more than one pending document), and whether the pending list could not be read (then nothing is
 * opened and no name is classified).
 */
export interface DeclaredOutcome {
  readonly opened: readonly string[];
  readonly notPending: readonly string[];
  readonly unreadable: boolean;
}

/** One chat turn, as the presenter sees it. */
export interface PresentedTurn {
  /**
   * The documents the turn declared by calling `insrc_present`, as artifact ids or document paths.
   * Opens the pending document each name resolves to, once per turn and in order. Never rejects.
   */
  declared(documents: readonly string[]): Promise<DeclaredOutcome>;
  /** The turn is over. A turn opens only what it declared, so nothing is opened at its end. */
  end(): void;
}

export interface ReviewPresenter {
  begin(): PresentedTurn;
}

/** What a turn knows. */
interface TurnState {
  /** The ids whose open call threw this turn, so they are not tried again. */
  readonly failed: Set<string>;
  /** The turn's declarations, one behind another. */
  queue: Promise<void>;
}

/**
 * E202611031bd72813:S001 t7: the presentation key of one declaration — `<artifactId>#<n>` with a
 * HOST-WIDE counter, so every insrc_present that opens the same artifact gets its own editor panel
 * (two declarations of one document, even from two chat sessions, never share a panel).
 */
const presentKeyOf = (artifactId: string, seq: number): string => `${artifactId}#${seq}`;

/** A declared name names a pending document by its artifact id (compared without regard to case: the daemon lists `-s5` for some records and `-S001` for others) or by its path, absolute or repo-relative. */
// The daemon-side twin is `namesPending` in src/mcp/server.ts (insrc_present's answer): keep the two in step.
const namesDocument = (name: string, doc: PendingDocument): boolean =>
  doc.id.toLowerCase() === name.toLowerCase() || doc.mdPath === name || doc.mdPath.endsWith(`/${name}`);

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function createReviewPresenter(deps: ReviewPresenterDeps): ReviewPresenter {
  const { log } = deps;
  // E202611031bd72813:S001 t7: the host-wide presentKey sequence — one presenter per extension host,
  // shared by every chat session, so presentKeys are unique across all of them.
  let hostPresentSeq = 0;

  async function read(what: string): Promise<readonly PendingDocument[] | undefined> {
    try {
      return await deps.pendingDocuments();
    } catch (err) {
      log.warn(`review presenter: the pending list could not be read ${what}: ${errorText(err)}`);
      return undefined;
    }
  }

  function open(state: TurnState, doc: PendingDocument, openedThisDeclaration: Set<string>): void {
    // Dedup is PER DECLARATION (E202611031bd72813:S001 t7): the same document named twice in ONE
    // insrc_present opens once, but a LATER declaration opens again under a fresh presentKey.
    // An open that threw is never retried within the turn.
    if (openedThisDeclaration.has(doc.id) || state.failed.has(doc.id)) return;
    // Marked first: an open that throws is not tried again in this turn.
    openedThisDeclaration.add(doc.id);
    try {
      deps.open({ artifactId: doc.id, mdPath: doc.mdPath, presentKey: presentKeyOf(doc.id, ++hostPresentSeq) });
    } catch (err) {
      state.failed.add(doc.id);
      log.error(`review presenter: ${doc.id} could not be opened: ${errorText(err)}`);
    }
  }

  return {
    begin(): PresentedTurn {
      const state: TurnState = { failed: new Set(), queue: Promise.resolve() };
      return {
        declared(documents: readonly string[]): Promise<DeclaredOutcome> {
          return new Promise<DeclaredOutcome>((resolve) => {
            state.queue = state.queue.then(async () => {
              const outcome: { opened: string[]; notPending: string[]; unreadable: boolean } = { opened: [], notPending: [], unreadable: false };
              const openedThisDeclaration = new Set<string>();
              try {
                const docs = await read('for a declared document');
                if (docs === undefined) {
                  outcome.unreadable = true;
                } else {
                  for (const name of documents) {
                    // A name that matches more than one pending document (a bare `PLAN.md` among several
                    // Stories') is ambiguous: it is reported, never guessed at by opening the first.
                    const matches = docs.filter((d) => namesDocument(name, d));
                    const doc = matches.length === 1 ? matches[0] : undefined;
                    if (doc === undefined) {
                      outcome.notPending.push(name);
                      continue;
                    }
                    open(state, doc, openedThisDeclaration);
                    // The name is shown when its document is open (this declaration opened it, or an
                    // earlier name in the same declaration did); a failed open is left out.
                    if (!state.failed.has(doc.id) && openedThisDeclaration.has(doc.id)) outcome.opened.push(name);
                  }
                }
              } catch (err) {
                log.error(`review presenter: a declaration failed: ${errorText(err)}`);
                outcome.unreadable = true;
              } finally {
                resolve(outcome);
              }
            });
          });
        },
        end(): void {
          // Nothing to do: a turn opens only what it declared.
        },
      };
    },
  };
}
