/** The parsing half of the pinned editor configuration. No EditorView/DOM is
 * created here; both the pane and its worker use these exact vendor schemas. */
import { Clock, Container, Ctx, type MilkdownPlugin } from '@milkdown/kit/ctx';
import { Editor, config, init, schema, parser, serializer, parserCtx, serializerCtx } from '@milkdown/kit/core';
import { schema as commonmarkSchema, remarkAddOrderInListPlugin, remarkInlineLinkPlugin,
  remarkLineBreak, remarkHtmlTransformer, remarkMarker, remarkPreserveEmptyLinePlugin } from '@milkdown/kit/preset/commonmark';
import { schema as gfmSchema, remarkGFMPlugin } from '@milkdown/kit/preset/gfm';
import { imageBlockSchema, remarkImageBlockPlugin } from '@milkdown/kit/component/image-block';
import { latex } from '@milkdown/crepe/feature/latex';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { ScratchMarkdownCodec } from './scratch-markdown.js';
import type { ScratchCodecProof } from './scratch-validation-client.js';

/** Crepe exposes its LaTeX feature registration, but not its schema plugins.
 * Collect its declarative $nodeSchema/$remark groups through that public API.
 * UI configuration, commands, input rules and tooltip plugins are deliberately
 * not executed in a worker. Parity tests cover every node/mark and the corpus. */
class ParsingRegistration extends Editor {
  readonly parsing: MilkdownPlugin[] = [];
  override readonly config = (_configure: Parameters<Editor['config']>[0]): this => this;
  override readonly use = (plugins: MilkdownPlugin | MilkdownPlugin[]): this => {
    if (Array.isArray(plugins) && ('node' in plugins || ('plugin' in plugins && 'options' in plugins))) this.parsing.push(...plugins);
    return this;
  };
}

export function configureScratchSchema(ctx: Ctx): void {
  // Crepe's default block-image codec replaces alt text with a resize ratio.
  // This shared override preserves standard alt/title semantics in both hosts.
  ctx.update(imageBlockSchema.key, original => context => {
    const spec = original(context);
    return { ...spec, attrs: { ...spec.attrs, alt: { default: '', validate: 'string' } },
      parseMarkdown: { ...spec.parseMarkdown, runner: (state, node, type) => {
        state.addNode(type, { src: node.url as string, alt: (node.alt as string | null) ?? '', caption: (node.title as string | null) ?? '', ratio: 1 });
      } },
      toMarkdown: { ...spec.toMarkdown, runner: (state, node) => {
        state.openNode('paragraph'); state.addNode('image', undefined, undefined, { url: node.attrs['src'], alt: node.attrs['alt'], title: node.attrs['caption'] || null }); state.closeNode();
      } },
    };
  });
}

/** Exact comparison semantics of the live transaction, including its sole
 * presentation exception. JSON is data, never evaluated as worker code. */
export function scratchDocumentIntent(document: ProseNode): string {
  const value = (node: ProseNode): unknown => {
    const attrs = { ...node.attrs }; if (node.type.name === 'heading') delete attrs['id'];
    const content: unknown[] = []; node.forEach(child => content.push(value(child)));
    return [node.type.name, attrs, node.text ?? null, node.marks.map(mark => mark.toJSON()), content];
  };
  return JSON.stringify(value(document));
}

async function digestText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export const scratchIntentDigest = (document: ProseNode): Promise<string> => digestText(scratchDocumentIntent(document));

/** Qualification hashes come from the actual executing codec, including for
 * refused sources. No document or serialized note is returned to the caller. */
export async function scratchCodecProof(codec: ScratchMarkdownCodec<ProseNode>, source: string, actualDraft: ProseNode): Promise<ScratchCodecProof> {
  const shape = (types: Record<string, { spec: { attrs?: unknown; content?: unknown; group?: unknown } }>): unknown => Object.entries(types).map(([name, type]) => [name, type.spec.attrs, type.spec.content, type.spec.group]);
  const model = actualDraft.type.schema;
  const parsedSource = codec.parse(source);
  return { schema: await digestText(JSON.stringify([shape(model.nodes), shape(model.marks)])),
    sourceIntent: await scratchIntentDigest(parsedSource), sourceSerialized: await digestText(codec.serialize(parsedSource)),
    draftIntent: await scratchIntentDigest(actualDraft), draftSerialized: await digestText(codec.serialize(actualDraft)) };
}

export function scratchConfiguredCodec(ctx: Ctx): ScratchMarkdownCodec<ProseNode> {
  return { parse: ctx.get(parserCtx), serialize: ctx.get(serializerCtx),
    equivalent: (left, right) => left.eq(right) || scratchDocumentIntent(left) === scratchDocumentIntent(right) };
}

export async function createScratchBackgroundCodec(): Promise<ScratchMarkdownCodec<ProseNode>> {
  const registration = new ParsingRegistration(); latex(registration, {});
  const ctx = new Ctx(new Container(), new Clock());
  const plugins: MilkdownPlugin[] = [schema, parser, serializer, init(Editor.make()), config(configureScratchSchema),
    ...commonmarkSchema, ...gfmSchema, ...remarkAddOrderInListPlugin, ...remarkInlineLinkPlugin,
    ...remarkLineBreak, ...remarkHtmlTransformer, ...remarkMarker, ...remarkPreserveEmptyLinePlugin,
    ...remarkGFMPlugin, ...remarkImageBlockPlugin, ...imageBlockSchema, ...registration.parsing];
  const runners = plugins.map(plugin => plugin(ctx.produce()));
  // These are context timers, not provider calls: parser/schema dependencies
  // must be started together, exactly as Milkdown's Editor.create does.
  await Promise.all(runners.map(run => run()));
  return scratchConfiguredCodec(ctx);
}
