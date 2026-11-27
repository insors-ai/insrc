/** Source-preserving admission, shared by the renderer and host controller.
 * There is deliberately no document/file writer in this module. */
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import { SCRATCH_NOTE_BYTES, scratchUtf8Bytes } from './scratch-editor-protocol.js';

export interface ScratchMarkdownCodec<Document> {
  parse(markdown: string): Document;
  serialize(document: Document): string;
  equivalent(left: Document, right: Document): boolean;
}

interface SyntaxNode {
  readonly type: string;
  readonly value?: string;
  readonly url?: string;
  readonly children?: readonly SyntaxNode[];
  readonly position?: { readonly start: { readonly offset?: number }; readonly end: { readonly offset?: number } };
}
const grammar = remark().use(remarkGfm);
/** Host-side grammar check does not require a DOM or trust a renderer's claim.
 * Renderer admission additionally uses its configured ProseMirror schema. */
export const scratchSourceCodec: ScratchMarkdownCodec<ReturnType<typeof grammar.parse>> = {
  parse: source => grammar.parse(source),
  serialize: document => grammar.stringify(document),
  equivalent: (left, right) => {
    const semantic = (document: unknown): string => JSON.stringify(document, (key, value: unknown) => key === 'position' ? undefined : value);
    return semantic(left) === semantic(right);
  },
};
const supported = new Set(['root', 'paragraph', 'heading', 'thematicBreak', 'blockquote', 'list', 'listItem',
  'text', 'emphasis', 'strong', 'delete', 'inlineCode', 'break', 'link', 'image', 'code', 'table', 'tableRow', 'tableCell']);

export interface ScratchSyntaxInventory {
  readonly unsupported: readonly string[];
  /** Exact source spans, not hashes of the already-lossy rendered document. */
  readonly fingerprints: readonly string[];
  readonly protectedSpans: readonly { readonly semantic: string; readonly raw: string }[];
}

export function inspectScratchSyntax(markdown: string): ScratchSyntaxInventory {
  const unsupported = new Set<string>();
  const fingerprints: string[] = [];
  const protectedSpans: { semantic: string; raw: string }[] = [];
  // Neither the configured commonmark nor GFM codec has an opaque metadata node.
  const metadata = markdown.match(/^\uFEFF?(---|\+\+\+)\r?\n[\s\S]*?(?:\r?\n\1(?:\r?\n|$)|$)/);
  if (metadata) {
    unsupported.add('front matter');
    fingerprints.push(`front-matter:${metadata[0]}`);
    protectedSpans.push({ semantic: 'front-matter', raw: metadata[0] });
  }
  const pending: SyntaxNode[] = [grammar.parse(markdown) as SyntaxNode];
  while (pending.length) {
    const node = pending.pop()!;
    if (!supported.has(node.type)) unsupported.add(node.type);
    if (node.type === 'text' && /\[\[[\s\S]*?\]\]|\[\^[^\]]+\]|\{\{[\s\S]*?\}\}|(?:^|\n)\s*:::/.test(node.value ?? '')) {
      unsupported.add('custom literal syntax');
    }
    const customLink = (node.type === 'link' || node.type === 'image') &&
      /^[a-z][a-z0-9+.-]*:/i.test(node.url ?? '') && !/^(?:https?|mailto):/i.test(node.url ?? '');
    // Every literal leaf is checked, including unfamiliar syntax parsed as
    // plain text. A regex catalog alone cannot enumerate future extensions.
    if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code' || node.type === 'html' || node.type === 'definition' || customLink) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined) unsupported.add('unpositioned opaque syntax');
      else {
        const raw = markdown.slice(start, end);
        fingerprints.push(`${node.type}:${raw}`);
        protectedSpans.push({ semantic: JSON.stringify(node, (key, value: unknown) => key === 'position' ? undefined : value), raw });
      }
    }
    if (node.children) for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]!);
  }
  return { unsupported: [...unsupported], fingerprints, protectedSpans };
}

export type ScratchMarkdownAdmission =
  | { readonly allowed: true; readonly source: string }
  | { readonly allowed: false; readonly source: string; readonly reason: string };

export function checkScratchMarkdown<Document>(source: string, codec: ScratchMarkdownCodec<Document>): ScratchMarkdownAdmission {
  const refuse = (reason: string): ScratchMarkdownAdmission => ({ allowed: false, source, reason });
  if (scratchUtf8Bytes(source) > SCRATCH_NOTE_BYTES) return refuse('Note exceeds the rich editor size limit.');
  try {
    const before = inspectScratchSyntax(source);
    if (before.unsupported.length) {
      return refuse('This note contains markup without verified rich-editor preservation support. Use the text editor to edit it.');
    }
    const parsed = codec.parse(source);
    const serialized = codec.serialize(parsed);
    if (scratchUtf8Bytes(serialized) > SCRATCH_NOTE_BYTES) return refuse('Serialized note exceeds the rich editor size limit.');
    if (!codec.equivalent(parsed, codec.parse(serialized))) return refuse('Markdown structure changed during serialization.');
    const after = inspectScratchSyntax(serialized);
    if (after.unsupported.length || JSON.stringify(before.fingerprints) !== JSON.stringify(after.fingerprints)) {
      return refuse('Markdown source syntax changed during serialization. Use the text editor to edit it.');
    }
    return { allowed: true, source }; // never replace original source with serialized text on open
  } catch {
    return refuse('The rich editor cannot safely parse this note. Original content is retained.');
  }
}

/** Admission never changes either input; callers retain both on failure. An
 * intentional change to supported text/code is allowed; an unsafe base cannot
 * be laundered into a clean draft that silently drops its unsupported content. */
export function checkScratchMarkdownEdit<Document>(source: string, draft: string, codec: ScratchMarkdownCodec<Document>, expectedDocument: Document):
  ScratchMarkdownAdmission & { readonly draft: string } {
  const base = checkScratchMarkdown(source, codec);
  if (!base.allowed) return { ...base, draft };
  const proposal = checkScratchMarkdown(draft, codec);
  if (!proposal.allowed) return { allowed: false, source, draft, reason: proposal.reason };
  try {
    // Expected document comes from the transaction BEFORE serialization. Deriving
    // it from draft would hide exactly the serializer loss being checked.
    if (!codec.equivalent(expectedDocument, codec.parse(draft))) {
      return { allowed: false, source, draft, reason: 'The draft does not preserve the intended editor document.' };
    }
    const original = inspectScratchSyntax(source).protectedSpans;
    const proposed = inspectScratchSyntax(draft).protectedSpans;
    const rawBySemantic = new Map<string, Set<string>>();
    for (const span of proposed) {
      let raw = rawBySemantic.get(span.semantic);
      if (!raw) { raw = new Set(); rawBySemantic.set(span.semantic, raw); }
      raw.add(span.raw);
    }
    for (const span of original) {
      const matching = rawBySemantic.get(span.semantic);
      if (matching && (matching.size !== 1 || !matching.has(span.raw))) {
        return { allowed: false, source, draft, reason: 'Unchanged content has an unrelated raw source change.' };
      }
    }
  } catch { return { allowed: false, source, draft, reason: 'The intended editor document could not be verified.' }; }
  return { allowed: true, source, draft };
}

/** Only an explicit user document transaction may produce a proposal. Opening,
 * normalization, host snapshots, locks and selections return no draft at all. */
export function prepareScratchMarkdownTransaction<Document>(source: string, codec: ScratchMarkdownCodec<Document>, transaction: {
  readonly origin: 'initialization' | 'host' | 'user';
  readonly docChanged: boolean;
  readonly document: Document;
}): { readonly kind: 'unchanged'; readonly source: string } | {
  readonly kind: 'proposal' | 'refused'; readonly source: string; readonly draft: string; readonly reason?: string | undefined;
} {
  if (transaction.origin !== 'user' || !transaction.docChanged) return { kind: 'unchanged', source };
  let draft: string;
  try { draft = codec.serialize(transaction.document); }
  catch { return { kind: 'refused', source, draft: '', reason: 'Serialization failed; original source and editor document are retained.' }; }
  const result = checkScratchMarkdownEdit(source, draft, codec, transaction.document);
  return result.allowed ? { kind: 'proposal', source, draft } : { kind: 'refused', source, draft, reason: result.reason };
}
