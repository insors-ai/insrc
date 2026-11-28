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
  return inspectScratchTree(markdown, scratchSourceCodec.parse(markdown) as SyntaxNode);
}
function inspectScratchTree(markdown: string, tree: SyntaxNode): ScratchSyntaxInventory {
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
  const pending: SyntaxNode[] = [tree];
  while (pending.length) {
    const node = pending.pop()!;
    if (!supported.has(node.type)) unsupported.add(node.type);
    if (node.type === 'image' && /^(?:blob:|vscode-webview:|vscode-resource:|https:\/\/[^/]*\.vscode-cdn\.net(?:\/|$))/i.test(node.url ?? '')) unsupported.add('transient image URL');
    if (node.type === 'text') {
      const text = node.value ?? '';
      // Each delimiter is scanned once. Repeated unmatched openers must not
      // trigger one suffix scan per opener on a maximum-size note.
      const wiki = text.indexOf('[['), template = text.indexOf('{{'), footnote = text.indexOf('[^');
      if ((wiki >= 0 && text.lastIndexOf(']]') >= wiki + 2) ||
          (template >= 0 && text.lastIndexOf('}}') >= template + 2) ||
          (footnote >= 0 && text.indexOf(']', footnote + 3) >= 0) || /(?:^|\n)[ \t]*:::/.test(text)) unsupported.add('custom literal syntax');
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

/** VS Code applies replacement text using the TextDocument's EOL. Keep
 * proposals and acknowledgements byte-identical for uniform CRLF documents. */
export function preserveScratchEol(source: string, serialized: string): string {
  return source.includes('\r\n') ? serialized.replace(/\r?\n/g, '\r\n') : serialized;
}

/** A job owns its parse products; no tree is shared with an external caller.
 * The independent source grammar is still checked even for a configured codec.
 * Equal bytes share products within this job, never skip an assertion. */
class ScratchMarkdownValidationJob<Document> {
  private readonly admissions = new Map<string, ScratchMarkdownAdmission>();
  private readonly documents = new Map<string, Document>();
  private readonly trees = new Map<string, ReturnType<typeof grammar.parse>>();
  private readonly inventories = new Map<string, ScratchSyntaxInventory>();
  private readonly semantics = new Map<string, string>();
  constructor(private readonly codec: ScratchMarkdownCodec<Document>, private readonly base?: VerifiedScratchBase) {}
  private tree(source: string): ReturnType<typeof grammar.parse> {
    let tree = this.trees.get(source);
    if (!tree) { tree = scratchSourceCodec.parse(source); this.trees.set(source, tree); }
    return tree;
  }
  parse(source: string): Document {
    if (!this.documents.has(source)) this.documents.set(source,
      this.codec === scratchSourceCodec ? this.tree(source) as unknown as Document : this.codec.parse(source));
    return this.documents.get(source)!;
  }
  private inventory(source: string): ScratchSyntaxInventory {
    let inventory = this.inventories.get(source);
    if (!inventory) { inventory = inspectScratchTree(source, this.tree(source) as SyntaxNode); this.inventories.set(source, inventory); }
    return inventory;
  }
  private semantic(source: string): string {
    let semantic = this.semantics.get(source);
    if (semantic === undefined) { semantic = JSON.stringify(this.tree(source), (key, value: unknown) => key === 'position' ? undefined : value); this.semantics.set(source, semantic); }
    return semantic;
  }
  check(source: string): ScratchMarkdownAdmission {
    const cached = this.admissions.get(source); if (cached) return cached;
    const result = this.checkUncached(source); this.admissions.set(source, result); return result;
  }
  private checkUncached(source: string): ScratchMarkdownAdmission {
    const refuse = (reason: string): ScratchMarkdownAdmission => ({ allowed: false, source, reason });
    if (scratchUtf8Bytes(source) > SCRATCH_NOTE_BYTES) return refuse('Note exceeds the rich editor size limit.');
    try {
      if (/\r(?!\n)/.test(source) || (source.includes('\r\n') && /(?<!\r)\n/.test(source))) return refuse('Mixed line endings require the text editor; original content is retained.');
      const before = this.inventory(source);
      if (before.unsupported.length) return refuse('This note contains markup without verified rich-editor preservation support. Use the text editor to edit it.');
      const parsed = this.parse(source);
      const serialized = preserveScratchEol(source, this.codec.serialize(parsed));
      if (scratchUtf8Bytes(serialized) > SCRATCH_NOTE_BYTES) return refuse('Serialized note exceeds the rich editor size limit.');
      if (this.semantic(source) !== this.semantic(serialized)) return refuse('Markdown semantics changed during serialization. Use the text editor to edit it.');
      if (!this.codec.equivalent(parsed, this.parse(serialized))) return refuse('Markdown structure changed during serialization.');
      const after = this.inventory(serialized);
      if (after.unsupported.length || JSON.stringify(before.fingerprints) !== JSON.stringify(after.fingerprints)) return refuse('Markdown source syntax changed during serialization. Use the text editor to edit it.');
      return { allowed: true, source };
    } catch { return refuse('The rich editor cannot safely parse this note. Original content is retained.'); }
  }
  edit(source: string, draft: string, expectedDocument: Document): ScratchMarkdownAdmission & { readonly draft: string } {
    const base = this.base?.source === source ? { allowed: true as const, source } : this.check(source);
    if (!base.allowed) return { ...base, draft };
    const proposal = this.check(draft);
    if (!proposal.allowed) return { allowed: false, source, draft, reason: proposal.reason };
    try {
      if (!this.codec.equivalent(expectedDocument, this.parse(draft))) return { allowed: false, source, draft, reason: 'The draft does not preserve the intended editor document.' };
      const original = this.base?.source === source ? this.base.inventory.protectedSpans : this.inventory(source).protectedSpans;
      const proposed = this.inventory(draft).protectedSpans;
      const rawBySemantic = new Map<string, Set<string>>();
      for (const span of proposed) {
        let raw = rawBySemantic.get(span.semantic);
        if (!raw) { raw = new Set(); rawBySemantic.set(span.semantic, raw); }
        raw.add(span.raw);
      }
      for (const span of original) {
        const matching = rawBySemantic.get(span.semantic);
        if (matching && (matching.size !== 1 || !matching.has(span.raw))) return { allowed: false, source, draft, reason: 'Unchanged content has an unrelated raw source change.' };
      }
    } catch { return { allowed: false, source, draft, reason: 'The intended editor document could not be verified.' }; }
    return { allowed: true, source, draft };
  }
  /** Only a fully checked source yields a cache record. No parser tree or
   * mutable codec document escapes into the cache. */
  verified(source: string): VerifiedScratchBase | undefined {
    if (!this.check(source).allowed) return;
    const inventory = this.inventory(source);
    return Object.freeze({ source, inventory: Object.freeze({ unsupported: Object.freeze([...inventory.unsupported]),
      fingerprints: Object.freeze([...inventory.fingerprints]), protectedSpans: Object.freeze(inventory.protectedSpans.map(span => Object.freeze({ ...span }))) }) });
  }
}
interface VerifiedScratchBase { readonly source: string; readonly inventory: ScratchSyntaxInventory }
/** A single verified immutable base, scoped to one codec/executor instance.
 * The caller supplies the exact version/digest key; byte identity is mandatory
 * too. Epoch replacement creates a new verifier, never transfers its cache. */
export class ScratchMarkdownVerifier<Document> {
  private base: { readonly key: string; readonly value: VerifiedScratchBase } | undefined;
  private revision = 0;
  constructor(private readonly codec: ScratchMarkdownCodec<Document>) {}
  invalidate(): void { this.revision++; this.base = undefined; }
  job(source: string, key: string): { readonly validation: ScratchMarkdownValidationJob<Document>; retainBase(): void } {
    if (this.base && (this.base.key !== key || this.base.value.source !== source)) this.invalidate();
    const revision = this.revision;
    const validation = new ScratchMarkdownValidationJob(this.codec, this.base?.value);
    return { validation, retainBase: () => {
      if (revision !== this.revision || this.base) return;
      const value = validation.verified(source);
      if (value) this.base = { key, value };
    } };
  }
}

export function checkScratchMarkdown<Document>(source: string, codec: ScratchMarkdownCodec<Document>): ScratchMarkdownAdmission {
  return new ScratchMarkdownValidationJob(codec).check(source);
}
/** Retain source admission, independent semantics, configured structure, exact
 * raw fingerprints and unchanged-span checks, sharing only job-local parses. */
export function checkScratchMarkdownEdit<Document>(source: string, draft: string, codec: ScratchMarkdownCodec<Document>, expectedDocument: Document):
  ScratchMarkdownAdmission & { readonly draft: string } {
  return new ScratchMarkdownValidationJob(codec).edit(source, draft, expectedDocument);
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
  try { draft = preserveScratchEol(source, codec.serialize(transaction.document)); }
  catch { return { kind: 'refused', source, draft: '', reason: 'Serialization failed; original source and editor document are retained.' }; }
  const result = checkScratchMarkdownEdit(source, draft, codec, transaction.document);
  return result.allowed ? { kind: 'proposal', source, draft } : { kind: 'refused', source, draft, reason: result.reason };
}
