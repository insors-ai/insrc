/** Private rich-editor bridge. Independent of the chat and retired document channels.
 * Parsers check shape/bounds only; the controller must bind the session to its own URI
 * and validate sequence, version, digest and edit ancestry against live state. */
export const SCRATCH_NOTE_BYTES = 1_048_576;
export const SCRATCH_MESSAGE_BYTES = 2_097_152;
export const SCRATCH_IMAGE_BYTES = 10_485_760;
// Base64 plus a small, bounded header; image uploads have their own transport bound.
export const SCRATCH_ASSET_MESSAGE_BYTES = 4 * Math.ceil(SCRATCH_IMAGE_BYTES / 3) + 4_096;
/** Identity is the pair (paneSessionId, draftSeq), never a reusable free token. */
export const scratchEditId = (draftSeq: number): string => `edit_${draftSeq}`;

interface Session { readonly paneSessionId: string }
interface Snapshot {
  readonly version: number;
  readonly digest: string;
  readonly markdown: string;
}
export interface ScratchDraftProposal extends Session {
  readonly type: 'draft';
  readonly draftSeq: number;
  readonly editId: string; // exactly scratchEditId(draftSeq)
  readonly baseVersion: number;
  readonly baseDigest: string;
  readonly parentEditId?: string | undefined;
  /** false reports the latest recovery draft while an older edit is in flight.
   * Its same-id/text promotion to true uses the newly acknowledged base. */
  readonly apply?: boolean | undefined;
  readonly markdown: string;
}
export interface ScratchSelectionSend extends Session {
  readonly type: 'send-selection';
  readonly draftSeq: number;
  readonly docVersion: number;
  readonly selectedText: string;
}
/** All protocol fields are scalar; include every own field so a future field
 * cannot silently bypass idempotency. Optional absent/undefined are equivalent. */
export function sameScratchDraft(left: ScratchDraftProposal, right: ScratchDraftProposal): boolean {
  const fields = new Set([...Object.keys(left), ...Object.keys(right)] as (keyof ScratchDraftProposal)[]);
  for (const field of fields) if (left[field] !== right[field]) return false;
  return true;
}
export type ScratchEditorToHost =
  | (Session & { readonly type: 'editor-ready' })
  | ScratchDraftProposal
  | ScratchSelectionSend
  | (Session & { readonly type: 'lock'; readonly locked: boolean })
  | (Session & { readonly type: 'undo' | 'redo' | 'save'; readonly draftSeq: number; readonly docVersion: number })
  | (Session & { readonly type: 'asset-request'; readonly requestId: string; readonly action: 'pick-link' | 'pick-image' })
  | (Session & { readonly type: 'asset-request'; readonly requestId: string; readonly action: 'upload-image'; readonly name: string; readonly mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'; readonly dataBase64: string });

export type ScratchHostToEditor =
  | (Session & Snapshot & { readonly type: 'document-state'; readonly locked: boolean })
  | (Session & { readonly type: 'receipt'; readonly draftSeq: number; readonly editId: string })
  | (Session & Snapshot & { readonly type: 'apply-ack'; readonly draftSeq: number; readonly editId: string })
  | (Session & { readonly type: 'conflict'; readonly draftSeq: number; readonly message: string })
  | (Session & { readonly type: 'recovery'; readonly draftSeq: number; readonly markdown: string })
  | (Session & { readonly type: 'asset-result'; readonly requestId: string; readonly href: string; readonly displayUrl: string })
  | (Session & { readonly type: 'action-error'; readonly requestId: string; readonly message: string });

const encoder = new TextEncoder();
export const scratchUtf8Bytes = (text: string): number => encoder.encode(text).byteLength;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const token = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const version = (value: unknown): value is number => count(value) && value >= 1;
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.length <= limit &&
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value) && scratchUtf8Bytes(value) <= limit;
const keys = (m: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean =>
  required.every(k => Object.hasOwn(m, k)) && Object.keys(m).every(k => required.includes(k) || optional.includes(k));
const sessionKeys = (m: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean =>
  keys(m, ['type', 'paneSessionId', ...required], optional);
const snapshot = (m: Record<string, unknown>): boolean => version(m.version) && digest(m.digest) && text(m.markdown, SCRATCH_NOTE_BYTES);
const encodedWithin = (m: Record<string, unknown>, limit: number): boolean => {
  try { return scratchUtf8Bytes(JSON.stringify(m)) <= limit; } catch { return false; }
};
const image = (m: Record<string, unknown>): boolean => {
  if (!text(m.name, 255) || m.name.length === 0 || /[/\\\x00-\x1f]/.test(m.name) ||
      typeof m.mediaType !== 'string' || !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(m.mediaType) || typeof m.dataBase64 !== 'string') return false;
  const data = m.dataBase64;
  if (data.length === 0 || data.length % 4 !== 0 || data.length > 4 * Math.ceil(SCRATCH_IMAGE_BYTES / 3) ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return false;
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return (data.length / 4) * 3 - padding <= SCRATCH_IMAGE_BYTES;
};

/** Accept only closed, bounded structured-clone messages. No paths or arbitrary commands. */
export function parseScratchEditorMessage(value: unknown): ScratchEditorToHost | undefined {
  if (!record(value) || !token(value.paneSessionId)) return undefined;
  const m = value;
  let valid = false;
  switch (m.type) {
    case 'editor-ready': valid = sessionKeys(m, []); break;
    case 'draft':
      valid = sessionKeys(m, ['draftSeq', 'editId', 'baseVersion', 'baseDigest', 'markdown'], ['parentEditId', 'apply']) &&
        count(m.draftSeq) && m.draftSeq > 0 && m.editId === scratchEditId(m.draftSeq) && version(m.baseVersion) && digest(m.baseDigest) &&
        (m.parentEditId === undefined || token(m.parentEditId)) && (m.apply === undefined || typeof m.apply === 'boolean') && text(m.markdown, SCRATCH_NOTE_BYTES);
      break;
    case 'send-selection':
      valid = sessionKeys(m, ['draftSeq', 'docVersion', 'selectedText']) && count(m.draftSeq) && version(m.docVersion) &&
        text(m.selectedText, SCRATCH_NOTE_BYTES) && m.selectedText.length > 0;
      break;
    case 'lock': valid = sessionKeys(m, ['locked']) && typeof m.locked === 'boolean'; break;
    case 'undo': case 'redo': case 'save':
      valid = sessionKeys(m, ['draftSeq', 'docVersion']) && count(m.draftSeq) && version(m.docVersion);
      break;
    case 'asset-request':
      if (!token(m.requestId)) break;
      if (m.action === 'pick-link' || m.action === 'pick-image') valid = sessionKeys(m, ['requestId', 'action']);
      else if (m.action === 'upload-image') {
        valid = sessionKeys(m, ['requestId', 'action', 'name', 'mediaType', 'dataBase64']) && image(m);
        return valid && encodedWithin(m, SCRATCH_ASSET_MESSAGE_BYTES) ? m as unknown as ScratchEditorToHost : undefined;
      }
      break;
    default: return undefined;
  }
  return valid && encodedWithin(m, SCRATCH_MESSAGE_BYTES) ? m as unknown as ScratchEditorToHost : undefined;
}

export function parseScratchHostMessage(value: unknown): ScratchHostToEditor | undefined {
  if (!record(value) || !token(value.paneSessionId)) return undefined;
  const m = value;
  let valid = false;
  switch (m.type) {
    case 'document-state': valid = sessionKeys(m, ['version', 'digest', 'markdown', 'locked']) && snapshot(m) && typeof m.locked === 'boolean'; break;
    case 'receipt': valid = sessionKeys(m, ['draftSeq', 'editId']) && count(m.draftSeq) && token(m.editId); break;
    case 'apply-ack': valid = sessionKeys(m, ['draftSeq', 'editId', 'version', 'digest', 'markdown']) && count(m.draftSeq) && token(m.editId) && snapshot(m); break;
    case 'conflict': valid = sessionKeys(m, ['draftSeq', 'message']) && count(m.draftSeq) && text(m.message, 4096); break;
    case 'recovery': valid = sessionKeys(m, ['draftSeq', 'markdown']) && count(m.draftSeq) && text(m.markdown, SCRATCH_NOTE_BYTES); break;
    case 'asset-result': valid = sessionKeys(m, ['requestId', 'href', 'displayUrl']) && token(m.requestId) && text(m.href, 8192) && text(m.displayUrl, 8192); break;
    case 'action-error': valid = sessionKeys(m, ['requestId', 'message']) && token(m.requestId) && text(m.message, 4096); break;
    default: return undefined;
  }
  return valid && encodedWithin(m, SCRATCH_MESSAGE_BYTES) ? m as unknown as ScratchHostToEditor : undefined;
}
