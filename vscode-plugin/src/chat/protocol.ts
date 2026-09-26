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

/** Host -> webview: render + stream events. */
export type HostToWebview =
  | { readonly type: 'turn-event'; readonly event: TurnEvent }
  | { readonly type: 'session-restored'; readonly sessionId: string; readonly transcript: TranscriptEntry[] }
  | { readonly type: 'history-list'; readonly chats: ChatSummary[] }
  | { readonly type: 'edit-prompt'; readonly path: string; readonly diff: UnifiedDiff; readonly review?: boolean }
  | { readonly type: 'docs-list'; readonly artifacts: DocsArtifactSummary[] }
  | { readonly type: 'theme'; readonly theme: TerminalTheme };

/** Webview -> host: user intents. */
export type WebviewToHost =
  | { readonly type: 'submit-turn'; readonly text: string }
  | { readonly type: 'new-chat'; readonly provider: ProviderId }
  | { readonly type: 'open-chat'; readonly chatId: string }
  | { readonly type: 'set-edit-mode'; readonly mode: 'auto' | 'review' }
  | { readonly type: 'edit-decision'; readonly path: string; readonly accept: boolean }
  | { readonly type: 'docs-decision'; readonly artifactId: string; readonly accept: boolean };

/** The discriminant values of each direction (exported so consumers/tests can assert exhaustiveness). */
export const HOST_TO_WEBVIEW_TYPES = [
  'turn-event',
  'session-restored',
  'history-list',
  'edit-prompt',
  'docs-list',
  'theme',
] as const;

export const WEBVIEW_TO_HOST_TYPES = [
  'submit-turn',
  'new-chat',
  'open-chat',
  'set-edit-mode',
  'edit-decision',
  'docs-decision',
] as const;

export type HostToWebviewType = (typeof HOST_TO_WEBVIEW_TYPES)[number];
export type WebviewToHostType = (typeof WEBVIEW_TO_HOST_TYPES)[number];

/** Wrap a payload in the versioned envelope. */
export function envelope<T>(payload: T): Envelope<T> {
  return { v: 1, payload };
}
