/** Browser-only adapter: the live editor's configured schema, not a lookalike. */
import { editorViewCtx, parserCtx, serializerCtx, type Editor } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { ScratchMarkdownCodec } from './scratch-markdown.js';
import { prepareScratchMarkdownTransaction } from './scratch-markdown.js';
import { $prose } from '@milkdown/kit/utils';
import { Plugin } from '@milkdown/kit/prose/state';
import { trailing } from '@milkdown/kit/plugin/trailing';

export const SCRATCH_HOST_TRANSACTION = 'insrcScratchHostSnapshot';
export type ScratchObservedDraft = ReturnType<typeof prepareScratchMarkdownTransaction>;

function sameMarkdownDocument(left: ProseNode, right: ProseNode): boolean {
  const pending: [ProseNode, ProseNode][] = [[left, right]];
  while (pending.length) {
    const [a, b] = pending.pop()!;
    if (a.type !== b.type || a.text !== b.text || a.childCount !== b.childCount) return false;
    const aa = { ...a.attrs }, ba = { ...b.attrs };
    // commonmark's heading-id plugin derives this DOM anchor from heading text
    // after parsing. It is not serialized Markdown; no other attr is ignored.
    if (a.type.name === 'heading') { delete aa['id']; delete ba['id']; }
    if (JSON.stringify(aa) !== JSON.stringify(ba) || JSON.stringify(a.marks.map(m => m.toJSON())) !== JSON.stringify(b.marks.map(m => m.toJSON()))) return false;
    for (let i = 0; i < a.childCount; i++) pending.push([a.child(i), b.child(i)]);
  }
  return true;
}

export function scratchMilkdownCodec(ctx: Ctx): ScratchMarkdownCodec<ProseNode> {
  return { parse: ctx.get(parserCtx), serialize: ctx.get(serializerCtx), equivalent: (a, b) => a.eq(b) || sameMarkdownDocument(a, b) };
}

/** Install before create(), activate after it. Observe actual transactions;
 * callbacks receive proposals/refusals only, never initialization or selection.
 * Canonical source is supplied by the document bridge and never rewritten here. */
export async function observeScratchMarkdown(editor: Editor, source: () => string, onDraft: (draft: ScratchObservedDraft) => void): Promise<{ activate(): void; deactivate(): void }> {
  let active = false;
  let lastSerialized = '';
  // The trailing plugin inserts a presentation paragraph, not source content.
  // Keep that initialization mutation out of the document-authoring pipeline.
  await editor.remove(trailing);
  editor.use($prose(ctx => new Plugin({
    appendTransaction: (transactions, _old, next) => {
      if (!active || !transactions.some(tr => tr.docChanged)) return null;
      const codec = scratchMilkdownCodec(ctx);
      let serialized: string;
      try { serialized = codec.serialize(next.doc); } catch {
        onDraft(prepareScratchMarkdownTransaction(source(), codec, { origin: 'user', docChanged: true, document: next.doc }));
        return null;
      }
      if (serialized === lastSerialized) return null;
      lastSerialized = serialized;
      if (transactions.some(tr => tr.getMeta(SCRATCH_HOST_TRANSACTION))) return null;
      onDraft(prepareScratchMarkdownTransaction(source(), codec, { origin: 'user', docChanged: true, document: next.doc }));
      return null;
    },
  })));
  return {
    activate: () => { lastSerialized = editor.action(ctx => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc)); active = true; },
    deactivate: () => { active = false; },
  };
}
