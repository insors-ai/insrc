/** Browser-only adapter: the live editor's configured schema, not a lookalike. */
import { parserCtx, serializerCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { ScratchMarkdownCodec } from './scratch-markdown.js';

export function scratchMilkdownCodec(ctx: Ctx): ScratchMarkdownCodec<ProseNode> {
  return { parse: ctx.get(parserCtx), serialize: ctx.get(serializerCtx), equivalent: (a, b) => a.eq(b) };
}
