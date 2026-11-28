/** Browser-only adapter: the live editor's configured schema, not a lookalike. */
import { serializerCtx, type Editor } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import type { Node as ProseNode, Schema } from '@milkdown/kit/prose/model';
import type { ScratchMarkdownCodec } from './scratch-markdown.js';
import { preserveScratchEol } from './scratch-markdown.js';
import { $prose } from '@milkdown/kit/utils';
import { Plugin, type Transaction } from '@milkdown/kit/prose/state';
import { syncHeadingIdPlugin } from '@milkdown/kit/preset/commonmark';
import { trailing } from '@milkdown/kit/plugin/trailing';
import { scratchConfiguredCodec, scratchIntentDigest } from './scratch-markdown-codec.js';
import type { ScratchSnapshot } from './scratch-editor-state.js';
import { ScratchIdleValidation } from './scratch-idle-validation.js';
import type { ScratchValidationClient } from './scratch-validation-client.js';

export const SCRATCH_HOST_TRANSACTION = 'insrcScratchHostSnapshot';
function hostTransaction(transaction: Transaction): boolean {
  // ProseMirror supplies the root transaction to later appended mutations.
  // Presentation plugins can append after this observer has already seen the
  // host root; those mutations still belong to the same host update.
  const root = transaction.getMeta('appendedTransaction') as Transaction | undefined;
  return !!transaction.getMeta(SCRATCH_HOST_TRANSACTION) || !!root?.getMeta(SCRATCH_HOST_TRANSACTION);
}
export interface ScratchObservedDraft {
  readonly kind: 'proposal' | 'refused'; readonly draft: string; readonly draftSeq: number;
  readonly baseVersion: number; readonly baseDigest: string; readonly reason?: string | undefined;
}
interface Candidate { readonly draft: string; readonly draftSeq: number; readonly document: ProseNode; readonly schema: Schema }
export interface ScratchObservationOptions {
  readonly source: () => ScratchSnapshot;
  readonly stage: (draft: string) => number;
  readonly eligible: (sequence: number, base: ScratchSnapshot) => boolean;
  readonly validator: ScratchValidationClient;
  readonly failed: (message: string) => void;
  readonly timing?: ((phase: 'capture' | 'intent' | 'validation', milliseconds: number) => void) | undefined;
}
export function scratchMilkdownCodec(ctx: Ctx): ScratchMarkdownCodec<ProseNode> { return scratchConfiguredCodec(ctx); }

/** Install before create(), activate after opening admission. Input dispatch
 * captures one immutable document and serializes once for recovery. Parsing,
 * roundtrip and inventories run only after a real typing gap, in the worker. */
export async function observeScratchMarkdown(editor: Editor, options: ScratchObservationOptions, onDraft: (draft: ScratchObservedDraft) => void): Promise<{ activate(): void; deactivate(): void; refresh(): void }> {
  let active = false;
  const scheduler = new ScratchIdleValidation<Candidate, Awaited<ReturnType<ScratchValidationClient['run']>>>({
    source: options.source,
    eligible: (candidate, base) => active && options.eligible(candidate.draftSeq, base),
    validate: async (candidate, base, current) => {
      let start = performance.now();
      const expectedIntent = await scratchIntentDigest(candidate.document, candidate.schema);
      options.timing?.('intent', performance.now() - start);
      if (!current()) throw new Error('Validation superseded by newer typing.');
      start = performance.now();
      const result = await options.validator.run({ source: base.markdown, draft: candidate.draft,
        baseKey: `${base.version}:${base.digest}`, expectedIntent });
      options.timing?.('validation', performance.now() - start);
      return result;
    },
    complete: (candidate, base, result) => onDraft({ kind: result.allowed ? 'proposal' : 'refused', draft: candidate.draft,
      draftSeq: candidate.draftSeq, baseVersion: base.version, baseDigest: base.digest, reason: result.reason }),
    failed: (_candidate, error) => options.failed(error instanceof Error ? error.message : 'Background validation failed; draft retained.'),
    dispose: () => options.validator.dispose(),
  });
  await editor.remove(trailing); // presentation-only initialization is not an edit
  editor.use($prose(ctx => {
    // Capture this editor's plugin key during its own SchemaReady setup. The
    // public composable is shared; looking its key up on each transaction could
    // accidentally refer to a later-created sibling editor.
    const headingIdKey = syncHeadingIdPlugin.key();
    return new Plugin({
      appendTransaction: (transactions, _old, next) => {
        if (!active || !transactions.some(tr => tr.docChanged) || transactions.some(hostTransaction) || (headingIdKey && transactions.every(tr => !!tr.getMeta(headingIdKey)))) return null;
        const start = performance.now();
        try {
          const draft = preserveScratchEol(options.source().markdown, ctx.get(serializerCtx)(next.doc));
          const draftSeq = options.stage(draft);
          scheduler.stage({ draft, draftSeq, document: next.doc, schema: next.schema });
        } catch { queueMicrotask(() => { if (active) options.failed('Draft capture failed. Local editor text is retained; keep this pane open.'); }); }
        finally { options.timing?.('capture', performance.now() - start); }
        return null;
      },
    });
  }));
  return { activate: () => { active = true; }, deactivate: () => { active = false; scheduler.dispose(); }, refresh: () => scheduler.refresh() };
}
