import type { ActiveChatEntry, DocsDocumentTab, HostToWebview, WebviewToHost } from './protocol.js';
import type { TurnEvent } from './stream-events.js';

/**
 * E202611031bd72813:S001 — compile-time protocol contract for the shapes this Story added or
 * pinned. This file is PRODUCTION source (vscode-plugin/tsconfig.json includes src/ but excludes
 * tests), so `npx tsc --noEmit` typechecks it for real: the assignments below fail compilation if
 * a field is added, removed, renamed or made required, and the @ts-expect-error lines fail if a
 * forbidden field ever becomes allowed. protocol.test.ts / stream-events.test.ts assert the
 * runtime kind arrays cover these kinds, so the compile-time proof and the runtime wire list
 * cannot drift apart silently.
 */

/** The message kinds this contract pins (asserted against the runtime type arrays in tests). */
export const PROTOCOL_CONTRACT_KINDS = ['active-list', 'open-chat', 'docs-content', 'docs-decision-result', 'open-doc', 'docs-decision', 'open-companion', 'selection-decision'] as const;

const entry: ActiveChatEntry = { id: 'a', title: 't', status: 'waiting-input', lastActivityAt: 1 };
// @ts-expect-error — an ActiveChatEntry carries EXACTLY id/title/status/lastActivityAt; an extra field must not compile
export const contractEntryExtra: ActiveChatEntry = { id: 'a', title: 't', status: 'done', lastActivityAt: 1, provider: 'claude' };

export const contractActiveList: HostToWebview = { type: 'active-list', chats: [entry] };
export const contractOpenChat: WebviewToHost = { type: 'open-chat', chatId: 'a' };
export const contractDocsContent: HostToWebview = { type: 'docs-content', artifactId: 'a', markdown: '# x', openQuestions: [], blocked: false };
export const contractDocsTab: DocsDocumentTab = { title: 'LLD.md', type: 'markdown', relPath: 'docs/LLD.md' };
// @ts-expect-error — DocsDocumentTab must NOT carry presentKey (panel-level state, not a message field)
export const contractDocsTabWithKey = { title: 'x', type: 'markdown', presentKey: 'p' } satisfies DocsDocumentTab;

// The LLD-pinned docs-review webview->host contracts.
export const contractOpenDoc: WebviewToHost = { type: 'open-doc', artifactId: 'a' };
export const contractDocsDecision: WebviewToHost = { type: 'docs-decision', artifactId: 'a', decision: 'approve', comments: [] };
export const contractOpenCompanion: WebviewToHost = { type: 'open-companion', artifactId: 'a', relPath: 'docs/x.html' };
export const contractSelectionDecision: WebviewToHost = { type: 'selection-decision', requestId: 'sel-1', selected: ['a', 'b'] };

/** One representative TurnEvent per kind of the union — each assignment is compile-time proof of that kind's shape. */
export const contractTurnEvents: readonly TurnEvent[] = [
  { kind: 'assistant-delta', turnId: 't', text: 'x' },
  { kind: 'tool-call', turnId: 't', callId: 'c', tool: 'Bash', command: 'ls' },
  { kind: 'file-edit', turnId: 't', path: 'p', diff: { path: 'p', hunks: [] } },
  { kind: 'status', turnId: 't', phase: 'thinking' },
  { kind: 'done', turnId: 't', ok: true, sessionId: 's' },
  { kind: 'error', turnId: 't', message: 'm' },
  { kind: 'tool-result', turnId: 't', callId: 'c', output: 'x' },
  { kind: 'approval-request', turnId: 't', requestId: 'r', title: 't', detail: 'd', toolName: 'Bash', resolution: 'in-turn' },
  { kind: 'permission-outcome', turnId: 't', toolName: 'Bash', decision: 'approved' },
  { kind: 'selection-request', turnId: 't', requestId: 'r', prompt: 'p', options: [{ id: 'o', label: 'l' }] },
  { kind: 'selection-outcome', turnId: 't', chosen: ['o'] },
];
