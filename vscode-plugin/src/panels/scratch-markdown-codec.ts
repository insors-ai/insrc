/** The parsing half of the pinned editor configuration. No EditorView/DOM is
 * created here; both the pane and its worker use these exact vendor schemas. */
import { Clock, Container, Ctx, type MilkdownPlugin } from '@milkdown/kit/ctx';
import { Editor, config, init, schema, parser, serializer, parserCtx, serializerCtx } from '@milkdown/kit/core';
import { schema as commonmarkSchema, remarkAddOrderInListPlugin, remarkInlineLinkPlugin,
  remarkLineBreak, remarkHtmlTransformer, remarkMarker, remarkPreserveEmptyLinePlugin } from '@milkdown/kit/preset/commonmark';
import { schema as gfmSchema, remarkGFMPlugin } from '@milkdown/kit/preset/gfm';
import { imageBlockSchema, remarkImageBlockPlugin } from '@milkdown/kit/component/image-block';
import { latex } from '@milkdown/crepe/feature/latex';
import type { Node as ProseNode, Schema } from '@milkdown/kit/prose/model';
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
export function scratchDocumentIntent(document: ProseNode, expectedSchema: Schema): string {
  const value = (node: ProseNode): unknown => {
    if (node.type !== expectedSchema.nodes[node.type.name]) throw new Error('Document belongs to a different configured schema.');
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
/** The caller supplies the owning editor/codec schema, not a candidate-derived
 * substitute. Foreign NodeTypes are refused before their names cross a thread. */
export const scratchIntentDigest = async (document: ProseNode, expectedSchema: Schema): Promise<string> => digestText(scratchDocumentIntent(document, expectedSchema));

/** In-process equivalence retains ProseMirror NodeType identity. Names are
 * sufficient only for transport fingerprints bound to a qualified codec. */
function sameScratchDocument(left: ProseNode, right: ProseNode): boolean {
  const pending: [ProseNode, ProseNode][] = [[left, right]];
  while (pending.length) {
    const [a, b] = pending.pop()!;
    if (a.type !== b.type || a.text !== b.text || a.childCount !== b.childCount) return false;
    const aa = { ...a.attrs }, ba = { ...b.attrs };
    if (a.type.name === 'heading') { delete aa['id']; delete ba['id']; }
    if (JSON.stringify(aa) !== JSON.stringify(ba) || JSON.stringify(a.marks.map(m => m.toJSON())) !== JSON.stringify(b.marks.map(m => m.toJSON()))) return false;
    for (let i = 0; i < a.childCount; i++) pending.push([a.child(i), b.child(i)]);
  }
  return true;
}

/** Qualification hashes come from the actual executing codec, including for
 * refused sources. No document or serialized note is returned to the caller. */
export async function scratchCodecProof(codec: ScratchMarkdownCodec<ProseNode>, source: string, actualDraft: ProseNode): Promise<ScratchCodecProof> {
  // Include every declarative flag/default/DOM rule. Callback semantics are
  // compared through the actual parsing and serialization corpus below.
  const shape = (types: Record<string, { spec: object }>): unknown => Object.entries(types).map(([name, type]) => [name, JSON.stringify(type.spec, (_key, value: unknown) => typeof value === 'function' ? undefined : value)]);
  const parsedSource = codec.parse(source);
  const model = parsedSource.type.schema;
  return { schema: await digestText(JSON.stringify([shape(model.nodes), shape(model.marks)])),
    sourceIntent: await scratchIntentDigest(parsedSource, model), sourceSerialized: await digestText(codec.serialize(parsedSource)),
    draftIntent: await scratchIntentDigest(actualDraft, model), draftSerialized: await digestText(codec.serialize(actualDraft)) };
}

export function scratchConfiguredCodec(ctx: Ctx): ScratchMarkdownCodec<ProseNode> {
  return { parse: ctx.get(parserCtx), serialize: ctx.get(serializerCtx),
    equivalent: (left, right) => left.eq(right) || sameScratchDocument(left, right) };
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
