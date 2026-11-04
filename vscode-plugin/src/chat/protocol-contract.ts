import type { ActiveChatEntry, DocsDocumentTab, HostToWebview, WebviewToHost } from './protocol.js';

/**
 * E202611031bd72813:S001 — compile-time protocol contract for the shapes this Story added or
 * pinned. This file is PRODUCTION source (vscode-plugin/tsconfig.json includes src/ but excludes
 * tests), so `npx tsc --noEmit` typechecks it for real: the assignments below fail compilation if
 * a field is added, removed, renamed or made required, and the @ts-expect-error lines fail if a
 * forbidden field ever becomes allowed. protocol.test.ts asserts the runtime kind arrays cover
 * these kinds, so the compile-time proof and the runtime wire list cannot drift apart silently.
 */

/** The message kinds this contract pins (asserted against the runtime type arrays in tests). */
export const PROTOCOL_CONTRACT_KINDS = ['active-list', 'open-chat', 'docs-content', 'docs-decision-result'] as const;

const entry: ActiveChatEntry = { id: 'a', title: 't', status: 'waiting-input', lastActivityAt: 1 };
// @ts-expect-error — an ActiveChatEntry carries EXACTLY id/title/status/lastActivityAt; an extra field must not compile
export const contractEntryExtra: ActiveChatEntry = { id: 'a', title: 't', status: 'done', lastActivityAt: 1, provider: 'claude' };

export const contractActiveList: HostToWebview = { type: 'active-list', chats: [entry] };
export const contractOpenChat: WebviewToHost = { type: 'open-chat', chatId: 'a' };
export const contractDocsContent: HostToWebview = { type: 'docs-content', artifactId: 'a', markdown: '# x', openQuestions: [], blocked: false };
export const contractDocsTab: DocsDocumentTab = { title: 'LLD.md', type: 'markdown', relPath: 'docs/LLD.md' };
// @ts-expect-error — DocsDocumentTab must NOT carry presentKey (panel-level state, not a message field)
export const contractDocsTabWithKey = { title: 'x', type: 'markdown', presentKey: 'p' } satisfies DocsDocumentTab;
