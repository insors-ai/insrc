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
import type { TurnEvent, UnifiedDiff } from './stream-events.js';
import type { TerminalTheme } from './design-tokens.js';
import type { ProviderId } from './cli-adapter.js';
import type { TranscriptEntry, ChatSummary } from './session-store.js';
import type { SectionIndex } from './docs-sections.js';
// S002 sc1: the docs-content variant types its functional record by INDEXING off
// DocsContent (which itself indexes off the daemon's ArtifactReviewView), so the
// record's shape is declared ONCE in the daemon and the three layers cannot drift.
// `import type` is erased at compile, so the protocol<->client type cycle is not a
// runtime cycle and this file stays type-only / vscode-free.
import type { DocsContent } from './docs-review-client.js';

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

/** A daemon-tracked artifact awaiting review — the shape the docs-list variant carries (S007 fills the pane). */
export interface DocsArtifactSummary {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly status: string;
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
  | { readonly type: 'turn-event'; readonly event: TurnEvent }
  | { readonly type: 'session-restored'; readonly sessionId: string; readonly transcript: TranscriptEntry[]; readonly mode?: PermissionMode }
  | { readonly type: 'history-list'; readonly chats: ChatSummary[] }
  | { readonly type: 'edit-prompt'; readonly path: string; readonly diff: UnifiedDiff; readonly review?: boolean }
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
    }
  // S001 sc2 (additive): the live echo of the user's prompt on submit, so it appears
  // during the turn (not only on a later session-restored replay). `key` is the row's
  // stable transcript-index key, so the live echo and its replay reconcile to ONE row (lc1).
  | { readonly type: 'user-row'; readonly text: string; readonly key: string }
  | { readonly type: 'theme'; readonly theme: TerminalTheme };

/** Webview -> host: user intents. */
export type WebviewToHost =
  | { readonly type: 'submit-turn'; readonly text: string }
  | { readonly type: 'new-chat'; readonly provider: ProviderId }
  | { readonly type: 'open-chat'; readonly chatId: string }
  | { readonly type: 'set-edit-mode'; readonly mode: 'auto' | 'review' }
  | { readonly type: 'edit-decision'; readonly path: string; readonly accept: boolean }
  // S007: `note` carries the reviewer's request-changes text on reject (accept:false) —
  // additive-optional, existing accept-only handlers ignore it.
  | { readonly type: 'docs-decision'; readonly artifactId: string; readonly accept: boolean; readonly note?: string }
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
  | { readonly type: 'ready' };

/** The discriminant values of each direction (exported so consumers/tests can assert exhaustiveness). */
export const HOST_TO_WEBVIEW_TYPES = [
  'turn-event',
  'session-restored',
  'history-list',
  'edit-prompt',
  'docs-list',
  'docs-content',
  'user-row',
  'theme',
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
] as const;

export type HostToWebviewType = (typeof HOST_TO_WEBVIEW_TYPES)[number];
export type WebviewToHostType = (typeof WEBVIEW_TO_HOST_TYPES)[number];

/** Wrap a payload in the versioned envelope. */
export function envelope<T>(payload: T): Envelope<T> {
  return { v: 1, payload };
}
