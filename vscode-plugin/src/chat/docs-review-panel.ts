/**
 * Story E20260925edb76e2e:S007 / t3 — the docs-review webview host.
 *
 * A vscode-free, deps-injected factory (mirrors createChatPanelHost): it renders
 * the terminal-styled 'docs-review' surface (one nonce'd inline script under a
 * strict per-render CSP, textContent/className only — the S003 shell invariants),
 * lists the daemon's PENDING tracked artifacts, opens one on demand, and drives
 * the approve / request-changes decision through the DocsReviewClient. It is a
 * PASSTHROUGH observer of the tracked-workflow flow (k8): it never runs a
 * workflow itself — it only reads pending()/content() and calls the daemon's own
 * approve()/comment() IPCs on daemon-tracked artifacts (k5). Persists nothing (k3).
 * All vscode API lives behind the injected {@link ChatPanelChannel}.
 */
import { renderTerminalStyle, surfaceClass, terminalTheme, type TerminalTheme } from './design-tokens.js';
import { envelope, type WebviewToHost, type HostToWebview, type DocsArtifactSummary, type RenderDegradation } from './protocol.js';
import type { ChatPanelChannel, ChatPanelLogger } from './chat-panel.js';
import type { DocsReviewClient } from './docs-review-client.js';
import { MARKED_SRC } from './webview-marked.js';
import { renderMarkdownStyle, DOCS_REVIEW_MARKDOWN_TOKENS } from './markdown-style.js';
import { deriveSectionIndex, type SectionIndex } from './docs-sections.js';

/**
 * The artifact kinds the daemon's resolveComment locator (parseArtifactId) supports —
 * request-changes is only offered for these; other pending kinds (SPEC/PLAN/ISSUE/CR)
 * can be approved but not commented, so the pane hides that control for them rather
 * than offer a button guaranteed to fail server-side.
 */
const COMMENTABLE_KINDS = new Set(['DEF', 'HLD', 'LLD']);

export interface DocsReviewHostDeps {
  createPanel(opts: { viewType: string; title: string }): ChatPanelChannel;
  readonly client: DocsReviewClient;
  readonly renderStyle?: (theme?: TerminalTheme) => string;
  readonly theme?: TerminalTheme;
  readonly logger?: ChatPanelLogger;
  readonly genNonce?: () => string;
}

export interface DocsReviewHost {
  open(): void;
  dispose(): void;
}

const VIEW_TYPE = 'insrc.docsReviewPanel';
const NOOP_LOGGER: ChatPanelLogger = { warn: () => {}, error: () => {} };

/** The ac3 notice shown beside the full body text when the structured render could
 *  not be produced. Degraded means PLAINER, never partial. */
export const DEGRADE_NOTICE =
  'structured view unavailable — showing the document as plain text';

/** The ac3 notice when the body renders but its section index could not be
 *  derived: the document is fully readable, only navigation is missing. */
export const SECTION_INDEX_NOTICE =
  'section navigation unavailable — the document is shown in full';

/**
 * sc2 (S001/t4) — the webview-side body renderer, as source so the shell can
 * inline it into its single nonce'd script AND the tests can `eval` it against a
 * stub DOM. Exported for that second reason: this repo has shipped a webview
 * contract that string assertions pronounced green while the behaviour was
 * wrong, so the fallback path is proved by RUNNING it, not by grepping for it.
 *
 * `guardMd` is the sanctioned scrub, carried verbatim from render-registry.ts:321
 * (drop non-http(s) hrefs, open the rest safely, strip image sources). The parse
 * call mirrors render-registry.ts:332 including `headerIds:false` — heading
 * identity comes from sc3's deriveSectionIndex, never from the renderer.
 *
 * `renderMarkdownBody` returns `{ el, degradation }` per the ratified widening
 * (not the HLD sketch's bare HTMLElement), so ac3's "the reviewer is told the
 * structured presentation was unavailable" is carried BY THE CONTRACT instead of
 * re-inferred by each caller. A parse throw and a missing vendored global take
 * the SAME code path and produce the SAME message — one path, one notice — and
 * either way the FULL body text is present: degraded is plainer, never partial.
 */
export const DOCS_BODY_RENDERER_SOURCE =
  `var DEGRADE_NOTICE=${JSON.stringify(DEGRADE_NOTICE)};` +
  `function guardMd(el){try{` +
  `var as=el.querySelectorAll('a');for(var i=0;i<as.length;i++){var hr=as[i].getAttribute('href')||'';if(/^https?:/i.test(hr)){as[i].setAttribute('rel','noopener noreferrer');as[i].setAttribute('target','_blank');}else{as[i].removeAttribute('href');}}` +
  `var ig=el.querySelectorAll('img');for(var j=0;j<ig.length;j++){ig[j].removeAttribute('src');ig[j].removeAttribute('srcset');}` +
  `}catch(e){}}` +
  `function renderMarkdownBody(el,src){var s=src||'';` +
  `try{` +
  `if(typeof marked==='undefined'||!marked||!marked.parse)throw new Error('vendored markdown renderer unavailable');` +
  `el.innerHTML=marked.parse(s,{gfm:true,breaks:false,headerIds:false,mangle:false});` +
  `guardMd(el);` +
  `el.className='insrc-md';` +
  `return {el:el,degradation:{degraded:false,notice:''}};` +
  `}catch(e){` +
  `el.className='insrc-docs-plain';` +
  `el.textContent=s;` +
  `return {el:el,degradation:{degraded:true,notice:DEGRADE_NOTICE}};` +
  `}}`;

/**
 * sc3 consumption (S001/t6) — slug stamping, the section chooser and
 * jump-to-section, as source so the shell inlines it AND the tests `eval` it.
 *
 * Everything here is built by DOM CONSTRUCTION with textContent only and injects
 * NO markup, which is what keeps the surface's single injection site single: the
 * markdown body (renderMarkdownBody) remains the one place markup is assigned.
 *
 * Stamping pairs rendered headings with posted anchors BY TITLE, advancing a
 * pointer through the index, rather than by position alone. Position alone would
 * silently mis-stamp if the renderer ever emitted a heading the deriver did not
 * index — marked understands setext headings (underlined with === / ---) while
 * deriveSectionIndex is ATX-only, so the two lists are not guaranteed to be the
 * same length. An unmatched heading is left UNSTAMPED, so an anchor target always
 * matches a posted anchor rather than pointing somewhere arbitrary.
 */
export const DOCS_SECTIONS_SOURCE =
  `function stampSlugs(root,sections){` +
  `var anchors=(sections&&sections.anchors)||[];if(!anchors.length)return 0;` +
  `var hs=root.querySelectorAll('h1,h2,h3,h4,h5,h6');var p=0,n=0;` +
  `for(var i=0;i<hs.length&&p<anchors.length;i++){` +
  `var txt=(hs[i].textContent||'').trim();` +
  `var j=p;while(j<anchors.length&&anchors[j].title!==txt)j++;` +
  `if(j<anchors.length){hs[i].id=anchors[j].slug;p=j+1;n++;}}` +
  `return n;}` +
  `function renderSectionChooser(host,sections,onPick){` +
  `while(host.firstChild)host.removeChild(host.firstChild);` +
  // No headings -> NO control at all, not an empty one.
  `var anchors=(sections&&sections.anchors)||[];if(!anchors.length)return false;` +
  `var sel=document.createElement('select');sel.id='insrc-docs-sections-select';` +
  `sel.setAttribute('aria-label','jump to section');` +
  `var first=document.createElement('option');first.value='';first.textContent='jump to section…';` +
  `sel.appendChild(first);` +
  `for(var i=0;i<anchors.length;i++){var o=document.createElement('option');` +
  `o.value=anchors[i].slug;` +
  // The heading's VERBATIM text, indented by depth. textContent only.
  `o.textContent=new Array(Math.max(1,anchors[i].level)).join('  ')+anchors[i].title;` +
  `sel.appendChild(o);}` +
  `sel.addEventListener('change',function(){if(sel.value)onPick(sel.value);});` +
  `host.appendChild(sel);return true;}` +
  `function jumpToSection(slug){var t=document.getElementById(slug);` +
  // Move the view DIRECTLY there rather than scrolling through the document.
  `if(t&&t.scrollIntoView)t.scrollIntoView({block:'start'});return !!t;}` +
  `function renderDegradationNotice(host,degradation){` +
  `while(host.firstChild)host.removeChild(host.firstChild);` +
  `if(!degradation||!degradation.degraded)return false;` +
  `var d=document.createElement('div');d.className='insrc-docs-notice';` +
  `d.setAttribute('role','status');` +
  `d.textContent=degradation.notice||'';host.appendChild(d);return true;}`;

/**
 * S002/t2 — the functional-requirements renderer, as SOURCE so the shell inlines
 * it into its single nonce'd script AND the tests `new Function`-evaluate it
 * against a stub DOM. The third member of the family DOCS_BODY_RENDERER_SOURCE
 * (:76) and DOCS_SECTIONS_SOURCE (:111) established, written in the same
 * ES5-compatible style for the same reason: it runs as a plain script in the
 * webview and under `new Function` in node:test.
 *
 * `renderFunctionalRequirements` is the FIRST implementation of sc2's published
 * `StructuredRenderer<FunctionalDefinition>`. It builds DOM and sets textContent
 * and assigns no markup anywhere, so the surface's single injection site — the
 * markdown body's `el.innerHTML=marked.parse` — stays single.
 *
 * Every string the reviewer reads is copied straight off the record. That is the
 * whole point of the Story: the same identifier reaching the screen through the
 * markdown path (prose generation -> marked's inline parser -> the guardMd scrub)
 * can be silently reformatted, and today's FrId grammar being free of
 * markdown-active characters is a property of the minter, not a guarantee the
 * display layer is entitled to lean on.
 *
 * The record is treated as STRUCTURALLY UNTRUSTED: validateFunctionalDefinition
 * (functional-definition.ts:54) runs at ASSEMBLY time inside the daemon, and sc1
 * projects body.functionalDefinition verbatim with no validation, so a malformed
 * `requirements`, a malformed entry, a duplicate id and an orphan itemRef all
 * ARRIVE here rather than being impossible.
 *
 * Two deliberate agreements with the prose renderer it replaces on screen
 * (functional-definition.ts:87-110), so the two renderings of one record can
 * never disagree:
 *   - per-item requirements group under their `itemRef`, and an orphan falls into
 *     the same literal `(unassigned)` bucket (:99);
 *   - groups appear in first-appearance order, as the prose renderer's Map does.
 * And one deliberate DIVERGENCE: the prose renderer drops an entry whose `scope`
 * is neither 'doc' nor 'item'; this renderer treats anything that is not 'item'
 * as doc-level, so a malformed scope shows the commitment rather than hiding it.
 * Showing more is safe here; hiding a commitment from the reviewer at the
 * approval gate is not.
 *
 * Nothing calls this yet — t5 wires it in. Defined and inlined, inert.
 */
export const DOCS_FR_SOURCE =
  // One requirement -> one discrete element. textContent ONLY, on every field.
  `function frItem(r){` +
  `var it=document.createElement('div');it.className='insrc-fr-item';` +
  `var id=document.createElement('span');id.className='insrc-fr-id';id.textContent=r.id;it.appendChild(id);` +
  `var st=document.createElement('span');st.className='insrc-fr-stmt';st.textContent=r.statement;it.appendChild(st);` +
  `if(typeof r.rationale==='string'&&r.rationale.length>0){` +
  `var ra=document.createElement('div');ra.className='insrc-fr-why';ra.textContent=r.rationale;it.appendChild(ra);}` +
  `return it;}` +
  // An entry is renderable only if it can actually be displayed: a non-null
  // object carrying both strings. One bad entry never disqualifies its siblings.
  `function frOk(r){return !!r&&typeof r==='object'&&typeof r.id==='string'&&typeof r.statement==='string';}` +
  `function renderFunctionalRequirements(record){` +
  `var root=document.createElement('div');root.className='insrc-fr';` +
  // Array.isArray BEFORE any iteration: this repo has already shipped the
  // unguarded version of this bug once, in the UX companion's childrenOf.
  `var reqs=(record&&Array.isArray(record.requirements))?record.requirements:[];` +
  `var i,r,key;` +
  // Doc-level first, in RECORD ORDER. Nothing is sorted, deduplicated or
  // renumbered: two entries sharing one FrId both render, because collapsing a
  // duplicate would hide a producer-side defect from the reviewer.
  `for(i=0;i<reqs.length;i++){r=reqs[i];if(frOk(r)&&r.scope!=='item')root.appendChild(frItem(r));}` +
  // Then per-item groups, in first-appearance order.
  `var order=[],groups={};` +
  `for(i=0;i<reqs.length;i++){r=reqs[i];if(!frOk(r)||r.scope!=='item')continue;` +
  `key=(typeof r.itemRef==='string'&&r.itemRef.length>0)?r.itemRef:'(unassigned)';` +
  `if(!Object.prototype.hasOwnProperty.call(groups,key)){groups[key]=[];order.push(key);}` +
  `groups[key].push(r);}` +
  // A group exists only because it has members, so no empty header is possible.
  `for(i=0;i<order.length;i++){` +
  `var g=document.createElement('div');g.className='insrc-fr-group';` +
  `var h=document.createElement('div');h.className='insrc-fr-group-label';h.textContent=order[i];g.appendChild(h);` +
  `var list=groups[order[i]];` +
  `for(var j=0;j<list.length;j++)g.appendChild(frItem(list[j]));` +
  `root.appendChild(g);}` +
  // The sc2 shape. `degradation` is left ABSENT: PLACEMENT is what can degrade,
  // not rendering, so t4 decides the notice.
  `return {el:root};}` +
  // S002/t3 — locate the document's own functional-requirements section in the
  // POSTED index. CONSUMES sc3's identity and mints none of its own: the value
  // returned is a slug deriveSectionIndex already produced and stampSlugs has
  // already written onto a heading element.
  //
  // Matched by the title's TAIL, not by equality, because the format engine
  // supplies a document-position-dependent number — frBodyLines strips the
  // renderer's own `## Functional requirements` (bindings.ts:27) precisely so the
  // engine can number it, which renders as `## 2. Functional requirements` on a
  // DEF. An equality match would never fire on a real document.
  //
  // Every miss returns undefined, which is SAFE: the caller takes the fallback
  // placement rather than substituting in the wrong place. A heading inside a
  // fenced code block cannot match either, because deriveSectionIndex already
  // skips fences and the index this reads therefore carries no anchor for it —
  // this adds NO second markdown scanner, which is what keeps section identity
  // single-sourced.
  `var FR_HEADING='functional requirements';` +
  `function frAnchorSlug(sections){` +
  `var anchors=(sections&&sections.anchors)||[];` +
  `for(var i=0;i<anchors.length;i++){` +
  `var a=anchors[i];` +
  `if(!a||typeof a.title!=='string'||typeof a.slug!=='string')continue;` +
  `var t=a.title.toLowerCase().replace(/^\\s+|\\s+$/g,'');` +
  // The FIRST match in document order, so a document carrying two never
  // produces an ambiguous target.
  `if(t.length>=FR_HEADING.length&&t.slice(t.length-FR_HEADING.length)===FR_HEADING)return a.slug;}` +
  `return undefined;}` +
  // S002/t4 — PLACEMENT. The only destructive operation in this Story, and the
  // only code path that could make a reviewer read LESS of a document than the
  // artifact contains, so everything here is bounded and ordered deliberately.
  //
  // Three outcomes, returned as a discriminator so a test can assert the
  // BEHAVIOUR rather than infer it from the resulting tree:
  //   'none'       absent record -> nothing created, nothing removed. The
  //                dominant path: 630 of 634 ledger artifacts carry no record.
  //   'in-section' the generated bullet list beneath the document's own heading
  //                is replaced by the record-built container.
  //   'prepended'  the block goes above the body instead, because the body
  //                degraded to plain text (no headings to substitute under) or
  //                the section could not be located.
  //
  // ORDERING IS THE SAFETY PROPERTY: the sibling range is computed and the
  // container fully BUILT before the first removeChild, so a construction throw
  // leaves the document completely intact. The caller's try/catch (t5) is a
  // backstop for the unforeseen, not the thing that makes this safe.
  `var FR_PLACEMENT_NOTICE='functional requirements shown above the document — their section could not be located';` +
  `function frIsHeading(n){var t=(n&&n.tagName)?String(n.tagName).toLowerCase():'';` +
  `return t==='h1'||t==='h2'||t==='h3'||t==='h4'||t==='h5'||t==='h6';}` +
  // SCOPED to the body container, deliberately NOT document.getElementById: an
  // element elsewhere on the surface that happened to share the id could
  // otherwise have its siblings deleted.
  `function frHeadingIn(bodyEl,slug){` +
  `var hs=(bodyEl&&bodyEl.querySelectorAll)?bodyEl.querySelectorAll('h1,h2,h3,h4,h5,h6'):[];` +
  `for(var i=0;i<hs.length;i++){if(hs[i]&&hs[i].id===slug)return hs[i];}return null;}` +
  `function placeFunctionalRequirements(bodyEl,record,sections,bodyDegraded){` +
  // ABSENT GATE, before ANY createElement call. `undefined`, a non-array and an
  // empty array are all 'absent' — the convention functional-definition.ts
  // states twice (:58, :88), adopted unchanged so client and daemon agree.
  `var reqs=(record&&Array.isArray(record.requirements))?record.requirements:[];` +
  `if(reqs.length===0)return {placed:'none'};` +
  // A degraded body has no heading elements at all, so it cannot be located;
  // skip the lookup rather than search a tree that has nothing to find.
  `var slug=bodyDegraded?undefined:frAnchorSlug(sections);` +
  `var head=slug?frHeadingIn(bodyEl,slug):null;` +
  // BUILD BEFORE MUTATE.
  `var built=renderFunctionalRequirements(record).el;` +
  // Every entry malformed -> an empty container. Treat it exactly as absent
  // rather than inserting an empty box.
  `if(!built.children||built.children.length===0)return {placed:'none'};` +
  `if(head){` +
  `var kids=bodyEl.children||[];var start=-1,i;` +
  `for(i=0;i<kids.length;i++){if(kids[i]===head){start=i;break;}}` +
  `if(start>=0){` +
  // The bound: stop at the next heading of ANY level, or the end of the
  // container. Any-level rather than equal-or-shallower so NO heading element is
  // ever removed, which is what guarantees the section chooser can never be left
  // offering an entry whose target no longer exists.
  `var stop=start+1;while(stop<kids.length&&!frIsHeading(kids[stop]))stop++;` +
  // Capture the doomed nodes AND the insertion reference BEFORE removing
  // anything: `children` is live in the real DOM, so indices shift under us.
  `var doomed=[],j;for(j=start+1;j<stop;j++)doomed.push(kids[j]);` +
  `var ref=kids[stop]||null;` +
  `for(j=0;j<doomed.length;j++)bodyEl.removeChild(doomed[j]);` +
  `if(ref)bodyEl.insertBefore(built,ref);else bodyEl.appendChild(built);` +
  // The heading element, its text and its stamped slug are untouched.
  `return {placed:'in-section'};}}` +
  // FALLBACK. On the degraded path this block is the reviewer's ONLY legible
  // access to the commitments, so it is shown rather than withheld.
  `bodyEl.insertBefore(built,bodyEl.firstChild||null);` +
  // A notice ONLY when the body itself rendered fine — that is the case where
  // silence would mislead, because the reviewer would have no way to tell the
  // block was displaced rather than designed that way. When the body already
  // degraded, s1's DEGRADE_NOTICE is showing and a second notice would stack.
  `if(bodyDegraded)return {placed:'prepended'};` +
  `return {placed:'prepended',degradation:{degraded:true,notice:FR_PLACEMENT_NOTICE}};}`;

/**
 * sc2 (S001/t4) — the renderer contract s2, s3 and s4 build their structured
 * renderers against. PUBLISHED HERE AND IMPLEMENTED NOWHERE in s1: this Story
 * renders only the markdown body, so the type exists so the later Stories share
 * one shape rather than inventing three.
 *
 * Every implementation MUST build DOM and set textContent — it may NOT assign
 * markup. That is what keeps the surface's single injection site single as
 * s2/s3/s4 land: the markdown body is the one place markup is ever injected.
 */
export type StructuredRenderer<T> = (record: T) => {
  /** The constructed element, built by DOM construction with textContent only. */
  readonly el: unknown;
  /** Absent/false unless the record could not be presented structurally. */
  readonly degradation?: { readonly degraded: boolean; readonly notice?: string } | undefined;
};

/** Escape a value for safe embedding in an HTML attribute / the CSP meta content. */
function attr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function createDocsReviewHost(deps: DocsReviewHostDeps): DocsReviewHost {
  const log = deps.logger ?? NOOP_LOGGER;
  const renderStyle = deps.renderStyle ?? renderTerminalStyle;
  const theme = deps.theme ?? terminalTheme;
  const genNonce =
    deps.genNonce ?? (() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);

  let channel: ChatPanelChannel | undefined;
  let disposed = false;
  // In-memory only (k3): the currently-pending artifacts by id (id -> summary), so
  // open-doc/docs-decision intents are validated against the live list and openDoc can
  // read the artifact kind (to gate request-changes). The client owns id->mdPath.
  // Discarded on dispose.
  const pending = new Map<string, DocsArtifactSummary>();
  // Monotonic guard so a slow refreshPending response can never overwrite a newer one
  // (open() + the webview boot-ping + each decision all trigger a refresh; real IPC
  // latency means "last-to-complete" would otherwise win, not "last-requested").
  let refreshSeq = 0;

  const post = (msg: HostToWebview): void => {
    if (disposed || channel === undefined) return;
    channel.postMessage(envelope(msg));
  };

  /** (Re)load the pending set from the daemon and post it; a throw -> empty list + notice. */
  async function refreshPending(): Promise<void> {
    const mySeq = ++refreshSeq;
    try {
      const artifacts = await deps.client.pending();
      if (mySeq !== refreshSeq) return; // superseded by a newer refresh — drop this response
      pending.clear();
      for (const a of artifacts) pending.set(a.id, a);
      post({ type: 'docs-list', artifacts });
    } catch (err) {
      if (mySeq !== refreshSeq) return;
      log.warn(`[docs-review] pending failed: ${String(err)}`);
      post({ type: 'docs-list', artifacts: [] });
      post({
        type: 'docs-content',
        artifactId: '',
        markdown: `docs-review unavailable: ${errText(err)}`,
        openQuestions: [],
        blocked: false,
      });
    }
  }

  /**
   * Derive the section index for an opened document. A throw here is NOT fatal:
   * the body still renders, it just has no navigation, so this degrades to an
   * empty index plus a notice rather than refusing to open the document. That is
   * the same rule the body renderer follows — degraded means less, never blank.
   *
   * NOTE (recorded, not fixed here): openDoc takes no sequence number, so two
   * quick opens with the first IPC slower will display the wrong document. That
   * is a PRE-EXISTING gap — the pane's monotonic guard (refreshSeq, :66/:75/:78/:83)
   * covers refreshPending and the docs-LIST only — and it is out of scope for this
   * Story, filed separately. What this task does guarantee is narrower and real:
   * the index and the markdown ride one message, so they can never disagree.
   */
  function deriveSections(markdown: string): {
    sections: SectionIndex;
    degradation: RenderDegradation | undefined;
  } {
    try {
      return { sections: deriveSectionIndex(markdown), degradation: undefined };
    } catch (err) {
      log.warn(`[docs-review] section index failed: ${String(err)}`);
      return {
        sections: { anchors: [] },
        degradation: { degraded: true, notice: SECTION_INDEX_NOTICE },
      };
    }
  }

  async function openDoc(artifactId: string): Promise<void> {
    const commentable = COMMENTABLE_KINDS.has(pending.get(artifactId)?.kind ?? '');
    try {
      const content = await deps.client.content(artifactId);
      // t5 — derive the index ONCE per opened document (not per interaction) and
      // post it on the SAME message as the markdown it came from. Deriving it
      // here, from `content.markdown`, is what makes the two inseparable.
      const { sections, degradation } = deriveSections(content.markdown);
      post({
        type: 'docs-content',
        artifactId,
        markdown: content.markdown,
        openQuestions: content.openQuestions,
        blocked: content.blocked,
        commentable,
        sections,
        // Only when it actually degraded: a successful derivation posts no
        // degradation at all, so `=== undefined` means "nothing went wrong".
        ...(degradation !== undefined ? { degradation } : {}),
        // S002/t1 — the functional record rides THIS message, beside the markdown
        // it belongs to, so the two can never be paired across two documents.
        // Forwarded by REFERENCE: no clone, no reshaping, no defaulting and no
        // validation, which is what sc1's verbatim-projection rule requires and
        // what makes the character-for-character id guarantee survivable (anything
        // done to the record here would be a place for an identifier to change).
        // Spread conditionally for the same reason `degradation` is: an absent
        // record stays an ABSENT KEY rather than a key holding undefined.
        ...(content.functionalDefinition !== undefined
          ? { functionalDefinition: content.functionalDefinition }
          : {}),
      });
    } catch (err) {
      log.warn(`[docs-review] content ${artifactId} failed: ${String(err)}`);
      // A content-load failure means the reviewer never saw the body — suppress approve
      // (blocked:true) so the review gate is not defeated; request-changes stays available.
      post({
        type: 'docs-content',
        artifactId,
        markdown: `unavailable: ${errText(err)}`,
        openQuestions: [],
        blocked: true,
        commentable,
      });
    }
  }

  async function decide(artifactId: string, accept: boolean, note: string | undefined): Promise<void> {
    const commentable = COMMENTABLE_KINDS.has(pending.get(artifactId)?.kind ?? '');
    try {
      if (accept) {
        const res = await deps.client.approve(artifactId);
        // A review block-verdict is NOT an error — it comes back non-lossily in skipped[]
        // (k5, daemon-enforced). The host approves ONE artifact, so a non-empty skipped[]
        // with nothing approved means this one was withheld; surface the reason inline and
        // the artifact stays pending.
        if (res.approved.length === 0 && res.skipped.length > 0) {
          const skip = res.skipped[0]!;
          post({
            type: 'docs-content',
            artifactId,
            markdown: `not approved (blocked): ${skip.reason}`,
            openQuestions: [],
            blocked: true,
            commentable,
          });
        }
      } else {
        // request-changes: record the reviewer's note; the artifact stays pending (there
        // is no daemon reject IPC — mirrors the JetBrains annotate flow).
        await deps.client.comment(artifactId, note && note.trim() !== '' ? note : 'changes requested');
      }
    } catch (err) {
      log.warn(`[docs-review] decision ${artifactId} failed: ${String(err)}`);
      post({
        type: 'docs-content',
        artifactId,
        markdown: `decision failed: ${errText(err)}`,
        openQuestions: [],
        blocked: true,
        commentable,
      });
    }
    // Re-fetch so the list reflects real approval state (k5 — never a client-side guess).
    await refreshPending();
  }

  const renderShell = (): string => {
    const nonce = genNonce();
    const style = renderStyle(theme);
    // The markdown element rules the rendered body needs. renderStyle emits CSS
    // custom properties and surface classes only — no element rules — and the
    // .insrc-md stylesheet is not in scope on this surface, so they come from the
    // ONE shared rule set (markdown-style.ts) with this surface's own tokens.
    const mdStyle = `<style>${renderMarkdownStyle(DOCS_REVIEW_MARKDOWN_TOKENS)}` +
      // The plain-text fallback container: preserve the document's own newlines
      // (it is markdown source at that point) without the <pre> geometry.
      `.insrc-docs-plain{white-space:pre-wrap;word-break:break-word;font-family:var(--it-font);color:var(--it-fg);}` +
      `.insrc-docs-notice{color:var(--it-warn);border:1px solid var(--it-border);padding:4px 8px;margin:4px 0;font-size:12px;}` +
      `#insrc-docs-sections select{background:var(--it-bg);color:var(--it-fg);border:1px solid var(--it-border);font-family:var(--it-font);font-size:12px;padding:2px 4px;margin:4px 0;max-width:100%;}` +
      // S002/t2 — the functional-requirement items. `--it-*` ONLY: the chat
      // surface's `--sans`/`--fg-strong`/`--border` names are undefined here, and
      // an undefined var() inside a shorthand invalidates the whole declaration,
      // which is how borders and colours vanish silently (the S001 gotcha).
      //
      // `white-space:normal;word-break:normal` are not decoration. On the degraded
      // path renderMarkdownBody sets `.insrc-docs-plain` on the BODY CONTAINER
      // (:90), whose `white-space:pre-wrap;word-break:break-word` would otherwise
      // inherit into these items — on precisely the path where this block is the
      // reviewer's only legible access to the commitments. t4 verifies it visually.
      `.insrc-fr{margin:6px 0;}` +
      `.insrc-fr-item{border-left:2px solid var(--it-accent);padding:4px 0 4px 10px;margin:6px 0;white-space:normal;word-break:normal;}` +
      `.insrc-fr-id{display:block;color:var(--it-accent);font-family:var(--it-font);font-size:12px;}` +
      `.insrc-fr-stmt{display:block;color:var(--it-fg);font-family:var(--it-font);}` +
      `.insrc-fr-why{color:var(--it-dim);font-family:var(--it-font);font-size:12px;margin-top:3px;}` +
      `.insrc-fr-group-label{color:var(--it-fg);font-family:var(--it-font);font-weight:600;margin:12px 0 2px;}` +
      `</style>`;
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    const cls = surfaceClass('docs-review');
    const listCls = surfaceClass('history-dropdown');
    const bootstrap =
      `const vs=acquireVsCodeApi();` +
      `const listEl=document.getElementById('insrc-docs-list');` +
      `const bodyEl=document.getElementById('insrc-docs-body');` +
      `const oqEl=document.getElementById('insrc-docs-oq');` +
      `const noteEl=document.getElementById('insrc-docs-note');` +
      `const actEl=document.getElementById('insrc-docs-actions');` +
      `const secEl=document.getElementById('insrc-docs-sections');` +
      `const noticeEl=document.getElementById('insrc-docs-notice');` +
      `var current='';` +
      // docs-list: one clickable row per pending artifact (textContent only, no innerHTML).
      `function renderList(items){while(listEl.firstChild)listEl.removeChild(listEl.firstChild);` +
      `(items||[]).forEach(function(a){var b=document.createElement('button');b.className='insrc-docs-item';` +
      `b.textContent='['+a.kind+'] '+(a.title||a.id)+' — '+a.status;` +
      `b.addEventListener('click',function(){current=a.id;vs.postMessage({v:1,payload:{type:'open-doc',artifactId:a.id}});});` +
      `listEl.appendChild(b);});` +
      `if(!(items&&items.length)){var e=document.createElement('div');e.className='insrc-diff-ctx';e.textContent='no pending artifacts';listEl.appendChild(e);}}` +
      // docs-content: render the verbatim body + open questions + block banner + the
      // approve/request-changes controls (controls hidden while blocked).
      DOCS_BODY_RENDERER_SOURCE +
      DOCS_SECTIONS_SOURCE +
      // S002/t2 — inlined after its two siblings, since its placement step (t5)
      // runs after both. INERT at t2: defined, nothing calls it yet.
      DOCS_FR_SOURCE +
      `function renderContent(m){var r=renderMarkdownBody(bodyEl,m.markdown||'');` +
      // Stamp FIRST, and let the stamped count gate the chooser. On the degraded
      // path the body is plain text with no heading elements, so nothing can be
      // stamped — rendering the chooser anyway would offer entries whose targets
      // do not exist and whose selection silently does nothing. A chooser that
      // cannot navigate is worse than no chooser, and "no targets" is the same
      // situation as "no headings", which already omits it entirely.
      `var stamped=stampSlugs(bodyEl,m.sections);` +
      `renderSectionChooser(secEl,stamped>0?m.sections:{anchors:[]},jumpToSection);` +
      // ac3: the notice comes from the POSTED state when the host declared one,
      // and otherwise from this render's own degradation — same shape either way.
      `renderDegradationNotice(noticeEl,(m.degradation&&m.degradation.degraded)?m.degradation:r.degradation);` +
      `while(oqEl.firstChild)oqEl.removeChild(oqEl.firstChild);` +
      `(m.openQuestions||[]).forEach(function(q){var d=document.createElement('div');d.className='insrc-docs-oq-item';d.textContent='? '+q;oqEl.appendChild(d);});` +
      `while(actEl.firstChild)actEl.removeChild(actEl.firstChild);` +
      `if(m.artifactId){` +
      `if(m.blocked){var w=document.createElement('div');w.className='insrc-diff-del';w.textContent='blocked — not approvable';actEl.appendChild(w);}` +
      `else{var ok=document.createElement('button');ok.textContent='approve';ok.addEventListener('click',function(){vs.postMessage({v:1,payload:{type:'docs-decision',artifactId:m.artifactId,accept:true}});});actEl.appendChild(ok);}` +
      // request-changes only for kinds the daemon can record a comment on (commentable !== false).
      `if(m.commentable!==false){var rc=document.createElement('button');rc.textContent='request changes';rc.addEventListener('click',function(){vs.postMessage({v:1,payload:{type:'docs-decision',artifactId:m.artifactId,accept:false,note:noteEl.value}});noteEl.value='';});actEl.appendChild(rc);}}}` +
      `window.addEventListener('message',function(e){var m=e.data&&e.data.payload;if(!m)return;` +
      `if(m.type==='docs-list'){renderList(m.artifacts);}` +
      `else if(m.type==='docs-content'){renderContent(m);}});` +
      // request the pending list as soon as the script is live.
      `vs.postMessage({v:1,payload:{type:'open-doc',artifactId:''}});`;
    return (
      `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      `<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">` +
      `${style}${mdStyle}</head>` +
      // The `--it-*` tokens renderTerminalStyle emits are scoped to `.insrc-term`,
      // so the surface div has to sit INSIDE an .insrc-term element to inherit
      // them — exactly as the reviewed mock does
      // (mocks/docs-review.html: <body class="insrc-term"><div class="insrc-term-review">).
      // The shell previously put the surface class straight on <body>, leaving
      // every var(--it-…) in this pane undefined.
      `<body class="insrc-term">` +
      `<div class="${cls}">` +
      `<div id="insrc-docs-list" class="${listCls}" aria-label="pending artifacts"></div>` +
      // t6: the section chooser and the ac3 notice. Both are filled by DOM
      // construction with textContent — never markup — and the chooser host stays
      // EMPTY (no control at all) for a document with no headings.
      `<div id="insrc-docs-sections" aria-label="sections"></div>` +
      `<div id="insrc-docs-notice" aria-live="polite"></div>` +
      // A DIV, not a <pre>: marked emits newline-separated block elements, so a
      // preformatted container would render a literal blank line between every
      // block and set headings in the monospace face at body size.
      `<div id="insrc-docs-body" class="insrc-docs-content" aria-label="artifact body"></div>` +
      `<div id="insrc-docs-oq" aria-label="open questions"></div>` +
      `<textarea id="insrc-docs-note" rows="2" aria-label="request-changes note"></textarea>` +
      `<div id="insrc-docs-actions"></div>` +
      `</div>` +
      `<script nonce="${nonce}">${MARKED_SRC}\n;${bootstrap}</script></body></html>`
    );
  };

  function handleMessage(message: unknown): void {
    const env = message as { v?: unknown; payload?: unknown } | null;
    if (env === null || env.v !== 1 || typeof env.payload !== 'object' || env.payload === null) {
      log.warn('[docs-review] dropped malformed message');
      return;
    }
    const msg = env.payload as WebviewToHost;
    switch (msg.type) {
      case 'open-doc':
        if (typeof msg.artifactId !== 'string') return;
        // The webview's boot ping (empty id) means "load the list"; a real id opens a doc.
        if (msg.artifactId === '') {
          void refreshPending();
        } else if (pending.has(msg.artifactId)) {
          void openDoc(msg.artifactId);
        } else {
          // A stale row (approved/evicted since the list was posted) -> refresh, drop the open.
          log.warn(`[docs-review] open-doc: unknown/stale artifact ${msg.artifactId}`);
          void refreshPending();
        }
        return;
      case 'docs-decision':
        if (typeof msg.artifactId !== 'string' || typeof msg.accept !== 'boolean') return;
        // Only act on a live pending artifact (k5); a stale decision -> refresh, drop.
        if (!pending.has(msg.artifactId)) {
          log.warn(`[docs-review] docs-decision: unknown/stale artifact ${msg.artifactId}`);
          void refreshPending();
          return;
        }
        void decide(msg.artifactId, msg.accept, typeof msg.note === 'string' ? msg.note : undefined);
        return;
      default:
        // any chat-slice / forward variant: accepted-but-ignored seam — never an error.
        return;
    }
  }

  return {
    open(): void {
      disposed = false;
      if (channel !== undefined) {
        channel.reveal();
        void refreshPending();
        return;
      }
      channel = deps.createPanel({ viewType: VIEW_TYPE, title: 'insrc docs review' });
      channel.onDidDispose(() => {
        disposed = true;
        channel = undefined;
        pending.clear();
      });
      channel.onMessage(handleMessage);
      channel.setHtml(renderShell());
      post({ type: 'theme', theme });
      // The webview boot ping also triggers refreshPending; post one now so a fast
      // consumer (test double) sees the list without waiting for the ping.
      void refreshPending();
    },
    dispose(): void {
      disposed = true;
      channel?.dispose();
      channel = undefined;
      pending.clear();
    },
  };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
