/**
 * Story E20260925edb76e2e:S003 / sc3 — the webview<->extension message protocol.
 *
 * The single typed, versioned channel between the chat host and the thin webview:
 * host->webview render/stream events and webview->host user intents, discriminated
 * by `type`. Every UI surface (chat, markers S004, dropdowns S005, inline-diff
 * S006, docs-review S007) rides this one channel. S003 defines the WHOLE envelope
 * but implements only the chat slice; the edit-* / docs-* variants are
 * defined-but-unhandled seams the later stories wire.
 *
 * Type-only; vscode-free.
 */
import type { OutboxAction, OutboxView } from './chat-outbox.js';
import type { TurnEvent } from './stream-events.js';
import type { TerminalTheme } from './design-tokens.js';
import type { ProviderId } from './cli-adapter.js';
import type { TranscriptEntry, ChatSummary } from './session-store.js';
import type { AttachmentRef } from './attachment-store.js';
import type { SectionIndex } from './docs-sections.js';
// S002 sc1: the docs-content variant types its functional record by INDEXING off
// DocsContent (which itself indexes off the daemon's ArtifactReviewView), so the
// record's shape is declared ONCE in the daemon and the three layers cannot drift.
// `import type` is erased at compile, so the protocol<->client type cycle is not a
// runtime cycle and this file stays type-only / vscode-free.
import type { DocsContent, ReviewDecision, ReviewDecisionComment, ReviewDecisionOutcome } from './docs-review-client.js';

/**
 * sc2 (S001) — whether the structured presentation was unavailable, and the
 * reviewer-facing sentence saying so. ONE shape, so ac3's notice is a contract
 * rather than per-Story copy. `degraded: false` pairs with an EMPTY notice; a
 * non-empty notice never accompanies a successful render. The notice is always
 * set by textContent, never as markup.
 */
export interface RenderDegradation {
  readonly degraded: boolean;
  readonly notice:   string;
}

/** The wire envelope: every message is wrapped with a protocol version for forward-compat. */
export interface Envelope<T> {
  readonly v: 1;
  readonly payload: T;
}

/** One document of an artifact as the review pane lists it: the markdown, or an HTML companion. */
export interface DocsDocumentTab {
  readonly title: string;
  readonly type: 'markdown' | 'html';
  /** Repo-relative path; always set for an HTML companion. */
  readonly relPath?: string | undefined;
}

/** A daemon-tracked artifact awaiting review — the shape the docs-list variant carries (S007 fills the pane). */
export interface DocsArtifactSummary {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly status: string;
  // Story E202610131f74c81f:S001: what the pane's table shows beside the title. Each is an
  // absent key when the daemon sent none.
  /** How many open questions the document has. */
  readonly openQuestions?: number | undefined;
  /** The canonical work item id (E…:S…), when the daemon could derive it. */
  readonly workItemId?: string | undefined;
}

/**
 * S004 sc2 (additive): the tool-permission mode for a chat session. `review`
 * S001 (bugfix): the SINGLE chat mode (merged from the old edits+perms controls,
 * Claude-Code style — the two separate auto/review dropdowns confused which one
 * gated tool permissions):
 *   - 'manual'    — ask approval for every tool (edits AND commands) via the card
 *   - 'edit-auto' — file edits auto-apply; commands/other tools still ask
 *   - 'auto'      — nothing asks; fully autonomous
 * This is the ONE canonical declaration both the adapter (cli-adapter.ts buildArgs)
 * and the webview status-bar control import, so the two never drift (k2/k3). The
 * old separate edit-review gate ('set-edit-mode') is retired: the mode governs edits.
 */
export type PermissionMode = 'manual' | 'edit-auto' | 'auto';

/** Host -> webview: render + stream events. */
export type HostToWebview =
  // Run-config echo: the active session's provider/model/effort ('' = CLI default), posted
  // on open/switch/restore and after a set-run-config, so the bottom-right buttons follow.
  | { readonly type: 'run-config'; readonly provider: string; readonly model: string; readonly effort: string }
  // Story E20261012ddc4ede1:S001 (additive): `rowIndex` is the absolute transcript index of the row
  // this event wrote; absent on an event that writes no row (status, approval-request).
  // ISSUE-160fa1bb7a8604ad (additive): `info` marks the done that closes an informational line the host posts under its
  // own turn id; the page does not read it as the end of the running turn.
  | { readonly type: 'turn-event'; readonly event: TurnEvent; readonly rowIndex?: number | undefined; readonly info?: boolean | undefined }
  // Story E20261012ddc4ede1:S001 (additive): `transcript` is a window of the session's rows, not
  // necessarily all of them. `firstIndex` is the absolute index of transcript[0] (absent = 0) and
  // `total` the number of rows in the whole transcript.
  | {
      readonly type: 'session-restored';
      readonly sessionId: string;
      readonly transcript: TranscriptEntry[];
      readonly mode?: PermissionMode;
      readonly firstIndex?: number | undefined;
      readonly total?: number | undefined;
    }
  // Story E20261012ddc4ede1:S001: the answer to 'load-older': rows [firstIndex, before) of the
  // session's transcript. `rows` is empty and firstIndex === before when nothing is older.
  | {
      readonly type: 'transcript-page';
      readonly sessionId: string;
      readonly before: number;
      readonly firstIndex: number;
      readonly rows: TranscriptEntry[];
      readonly total: number;
    }
  | { readonly type: 'history-list'; readonly chats: ChatSummary[] }
  /**
   * Story E20261013b2e8109f:S001: a transcript row the host pushed outside the event path (a diff
   * section, or one of the host's own marker lines), with its absolute index. A diff row with
   * `replaces` redraws the widget of that section; any other row is drawn as the same row is drawn
   * on restore.
   */
  | { readonly type: 'transcript-row'; readonly rowIndex: number; readonly row: TranscriptEntry }
  // ISSUE-6a811b8a: the shown approval card's place in the queue changed ('1 of N'); update it in place.
  | { readonly type: 'approval-position'; readonly requestId: string; readonly position: number; readonly total: number }
  | { readonly type: 'docs-list'; readonly artifacts: DocsArtifactSummary[] }
  // S007: one pending artifact's rendered body for the docs-review pane (additive).
  // `commentable` (optional; default true) hides request-changes for artifact kinds the
  // daemon's resolveComment locator does not support (only DEF/HLD/LLD).
  | {
      readonly type: 'docs-content';
      readonly artifactId: string;
      readonly markdown: string;
      readonly openQuestions: readonly string[];
      readonly blocked: boolean;
      readonly commentable?: boolean;
      // S001/t5 (additive, same message — NO new message type). `sections` is the
      // index derived from THE MARKDOWN ON THIS MESSAGE, so the two always travel
      // together: a superseded open swaps both at once and a stale index can never
      // be paired with newer markdown.
      readonly sections?: SectionIndex | undefined;
      // Whether the structured presentation was unavailable, carried here rather
      // than inferred in the webview. DISTINCT from `blocked`: a degraded render
      // still shows the full document and stays approvable; `blocked` means the
      // reviewer never saw the body at all.
      readonly degradation?: RenderDegradation | undefined;
      // S002 (additive, SAME message — no new message type, exactly as t5 added
      // `sections` and `degradation` above). The artifact's functional record,
      // forwarded verbatim from DocsContent. ABSENT KEY when the document carries
      // none — which is the common case — so `=== undefined` means the same thing
      // on both sides of the postMessage boundary as it does across the IPC.
      readonly functionalDefinition?: DocsContent['functionalDefinition'];
      // S003/t2 (additive, SAME message again — no new message type, no second
      // round trip). The DIAGRAM source records plus the companion refs, each
      // INDEXED off DocsContent so protocol -> client -> daemon stay one
      // declaration deep and cannot drift. ABSENT KEY when the document carries
      // none, which is the dominant case.
      //
      // Both records travel because a companion ref CANNOT identify which one
      // drew it: three daemon renderers all stamp kind:'diagram-mermaid'
      // (companion/render.ts:104 ER, :205 sequence, :243 component), so the
      // webview dispatches on the RECORD present, never on the ref's kind.
      // `companions` rides along for the link-out to the authentic generated file
      // and for ofSectionId placement — the pane never reads that file's content.
      readonly erDefinition?: DocsContent['erDefinition'];
      readonly sequenceDefinition?: DocsContent['sequenceDefinition'];
      readonly companions?: DocsContent['companions'];
      // S003/t6 — the slug the diagram companion's `ofSectionId` resolved to in
      // THIS document, resolved HOST-SIDE with sc3's shipped createSectionResolver
      // and posted alongside. Deliberately not re-derived in the webview: the
      // resolver matches an ofSectionId against both the anchor slug AND the slug a
      // raw title would produce, so a webview-side match would mint a SECOND,
      // weaker section identity — exactly what sc3 exists to prevent. Absent when
      // there is no ref, no ofSectionId, or it names no section here.
      readonly diagramAnchorSlug?: string | undefined;
      // S004/t1 (additive, SAME message once more — no new message type, no new
      // IPC method, no second round trip). The EXPERIENCE record, INDEXED off
      // DocsContent on exactly the terms its five siblings are, so protocol ->
      // client -> daemon stay one declaration deep. ABSENT KEY when the document
      // carries none: only four ledger bodies carry a uxDefinition at all, so
      // absence is overwhelmingly the common case.
      //
      // Unlike the diagram pair, ONE record suffices here — a ux-mock ref names
      // the only kind that could have drawn it (CompanionKind is
      // 'diagram-mermaid' | 'diagram-html' | 'ux-mock'), so there is no bundle to
      // disambiguate. The webview still dispatches on the RECORD present rather
      // than the ref's kind, matching S003 so the two slots behave alike.
      readonly uxDefinition?: DocsContent['uxDefinition'];
      // S004/t1 — the slug the ux-mock companion's `ofSectionId` resolved to in
      // THIS document, resolved HOST-SIDE with sc3's shipped createSectionResolver
      // and posted alongside, for the same reason `diagramAnchorSlug` is: resolving
      // in the webview would re-implement slugify and the title-alias rule and mint
      // a SECOND, weaker section identity. Absent when there is no ux-mock ref, no
      // ofSectionId on it, or it names no section in this document.
      readonly experienceAnchorSlug?: string | undefined;
      // E2 S004 (additive): set by openArtifact for an artifact that is not awaiting
      // review, so the webview shows the document with no approve or request-changes
      // control. Absent on every other open.
      readonly readOnly?: boolean | undefined;
      // Story E202610138d4b90c9:S001 (additive): what the pane saves and shows comments
      // with, forwarded from DocsContent on the same terms as the records above, and
      // `documents`: one entry per document of the artifact, the markdown first, then each
      // HTML companion. Each is an absent key when there is none.
      readonly docPath?: DocsContent['docPath'];
      readonly contentVersion?: DocsContent['contentVersion'];
      readonly feedback?: DocsContent['feedback'];
      readonly reviewer?: DocsContent['reviewer'];
      readonly state?: DocsContent['state'];
      readonly documents?: readonly DocsDocumentTab[] | undefined;
      // Story E202610131f74c81f:S001 (additive). `reveal`: the reviewer asked for this document
      // (a list row, or the delivery board), so the pane brings it into view; absent on every
      // re-read. `changed`: the re-read was started by a change to the document's files.
      readonly reveal?: boolean | undefined;
      readonly changed?: boolean | undefined;
    }
  // S001 sc2 (additive): the live echo of the user's prompt on submit, so it appears
  // during the turn (not only on a later session-restored replay). `key` is the row's
  // stable transcript-index key, so the live echo and its replay reconcile to ONE row (lc1).
  // Story E20261012ddc4ede1:S001 (additive): `rowIndex` is the row's absolute transcript index.
  // Story E2026101259da3204:S001 (additive): `attachments` is the files the message carries.
  // Epic E20261014613abdb3 Story S001: a queued message's turn began for this session, so the webview
  // shows the turn as running (and offers Stop) though no submit was clicked for it.
  | { readonly type: 'turn-running'; readonly sessionId: string }
  // Epic E20261014613abdb3 Story S002: the shown chat's outbox, posted after every queue change.
  | { readonly type: 'outbox'; readonly view: OutboxView }
  | {
      readonly type: 'user-row';
      readonly text: string;
      readonly key: string;
      readonly rowIndex?: number | undefined;
      readonly attachments?: readonly AttachmentRef[] | undefined;
    }
  // Story E2026101259da3204:S001: the attachments waiting to go with a session's next message.
  // The host owns this list, so a rebuilt webview loses nothing. `error` is one plain sentence
  // when an attachment was refused or could not be stored.
  | {
      readonly type: 'attachments-pending';
      readonly sessionId: string;
      readonly items: readonly PendingAttachmentView[];
      readonly error?: string | undefined;
    }
  | { readonly type: 'theme'; readonly theme: TerminalTheme }
  // Story E202610138d4b90c9:S001: the answer to a 'docs-decision'. `ok` false means the
  // decision was not recorded; `message` is the line the pane shows either way.
  | {
      readonly type: 'docs-decision-result';
      readonly artifactId: string;
      readonly ok: boolean;
      readonly outcome?: ReviewDecisionOutcome | undefined;
      readonly recorded?: number | undefined;
      readonly message: string;
    }
  // Story E202610138d4b90c9:S001: the answer to an 'open-companion'. `html` is the file's
  // text for the frame; absent when the file is not one of the document's or could not be read.
  | { readonly type: 'docs-companion'; readonly artifactId: string; readonly relPath: string; readonly html?: string | undefined };

/** Webview -> host: user intents. */
export type WebviewToHost =
  | { readonly type: 'submit-turn'; readonly text: string }
  | { readonly type: 'new-chat'; readonly provider: ProviderId; readonly model?: string | undefined; readonly effort?: string | undefined }
  /** Bottom-right run-config controls: change the model and/or effort for the current
   *  session's subsequent turns (absent field = CLI default). */
  | { readonly type: 'set-run-config'; readonly model?: string | undefined; readonly effort?: string | undefined }
  | { readonly type: 'open-chat'; readonly chatId: string }
  | { readonly type: 'set-edit-mode'; readonly mode: 'auto' | 'review' }
  | { readonly type: 'edit-decision'; readonly path: string; readonly accept: boolean }
  // Story E202610138d4b90c9:S001: the button the reviewer pressed in the review pane, with
  // every comment written since the last send (replaces the earlier accept/note shape).
  | { readonly type: 'docs-decision'; readonly artifactId: string; readonly decision: ReviewDecision; readonly comments: readonly ReviewDecisionComment[] }
  // Story E202610138d4b90c9:S001: the review pane asks for the text of one HTML document of
  // the open artifact, by its repo-relative path. Answered with 'docs-companion'.
  | { readonly type: 'open-companion'; readonly artifactId: string; readonly relPath: string }
  // S007: the docs-review read intent — open one pending artifact's body (additive).
  | { readonly type: 'open-doc'; readonly artifactId: string }
  // S002 (additive): the Stop control's intent — cancel the in-flight turn. The host
  // routes it to the existing cancelActive() reap; a no-op when no turn is active.
  | { readonly type: 'cancel-turn' }
  // S004 sc2 (additive): the approve/deny click on an in-chat permission card. `requestId`
  // correlates back to the ApprovalRequestEvent so the adapter answers the RIGHT request.
  // `scope` is accepted-but-inert this Story ('once' behaviour); a later story honours
  // 'session' without a wire change.
  | {
      readonly type: 'permission-decision';
      readonly requestId: string;
      readonly decision: 'approve' | 'deny';
      readonly scope?: 'once' | 'session';
    }
  // S004 sc2 (additive): the status-bar auto/review toggle. The host stores it per-session
  // and applies it to the NEXT turn's buildArgs (never the in-flight spawn).
  | { readonly type: 'set-permission-mode'; readonly mode: PermissionMode }
  // S004 (dev-chat ux polish) (additive): the confirm click on an in-chat selection widget.
  // `requestId` correlates back to the SelectionRequestEvent; `selected` is the chosen option
  // ids (>=1 — the confirm is disabled until at least one is picked). The host maps the ids to
  // labels, records the resolved outcome, and continues the run conveying the choice.
  | { readonly type: 'selection-decision'; readonly requestId: string; readonly selected: readonly string[] }
  // S001 (bugfix) (additive): the webview→host readiness handshake. Posted once the webview's
  // message listener is attached — on the INITIAL load AND on every VS-Code webview reload
  // (show-after-hide / restore, since the panel has no retainContextWhenHidden). The host
  // (re)sends theme + active session + history in response, so a reloaded webview is always
  // populated instead of racing the not-yet-attached listener with a post-after-setHtml.
  | { readonly type: 'ready' }
  // Story E20261012ddc4ede1:S001: the webview asks for the page of rows that ends just before
  // absolute transcript index `before` (its first held row). Answered with 'transcript-page'.
  | { readonly type: 'load-older'; readonly sessionId: string; readonly before: number }
  // Story E2026101259da3204:S001: attachments. No message carries a file path: a pasted image
  // travels as base64, a document is chosen in the host's own file dialog, and an attachment is
  // afterwards named only by the id the host issued. `clientId` lets the webview match the chip
  // to the thumbnail it already holds.
  | { readonly type: 'attach-image'; readonly mime: string; readonly dataBase64: string; readonly name?: string | undefined; readonly clientId?: string | undefined }
  | { readonly type: 'pick-attachments' }
  | { readonly type: 'remove-attachment'; readonly attachmentId: string }
  | { readonly type: 'open-attachment'; readonly attachmentId: string }
  // Epic babd84c6e2fb480a Story S001: a clicked link or code reference. The page only reports what
  // was clicked; the host validates it (http/https only; a path inside the workspace) and opens it.
  | { readonly type: 'open-link'; readonly url: string }
  | { readonly type: 'open-code-ref'; readonly path: string; readonly line?: number | undefined }
  // Epic E20261014613abdb3 Story S002: an outbox action on one row ('outbox-retry-now' is Story S004's).
  | OutboxAction;

/** A pending attachment as the webview shows it: no path. */
export interface PendingAttachmentView {
  readonly id: string;
  readonly name: string;
  readonly kind: 'image' | 'file';
  readonly size: number;
  readonly clientId?: string | undefined;
}

/** The discriminant values of each direction (exported so consumers/tests can assert exhaustiveness). */
export const HOST_TO_WEBVIEW_TYPES = [
  'turn-event',
  'session-restored',
  'history-list',
  'transcript-row',
  'docs-list',
  'docs-content',
  'user-row',
  'theme',
  'transcript-page',
  'attachments-pending',
  'docs-decision-result',
  'docs-companion',
  'turn-running',
  'outbox',
] as const;

export const WEBVIEW_TO_HOST_TYPES = [
  'submit-turn',
  'new-chat',
  'open-chat',
  'set-edit-mode',
  'edit-decision',
  'docs-decision',
  'open-doc',
  'cancel-turn',
  'permission-decision',
  'set-permission-mode',
  'selection-decision',
  'ready',
  'load-older',
  'attach-image',
  'pick-attachments',
  'remove-attachment',
  'open-attachment',
  'open-link',
  'open-code-ref',
  'open-companion',
  'outbox-cancel',
  'outbox-dismiss',
  'outbox-resend',
  'outbox-retry-now',
] as const;

export type HostToWebviewType = (typeof HOST_TO_WEBVIEW_TYPES)[number];
export type WebviewToHostType = (typeof WEBVIEW_TO_HOST_TYPES)[number];

/** Wrap a payload in the versioned envelope. */
export function envelope<T>(payload: T): Envelope<T> {
  return { v: 1, payload };
}
