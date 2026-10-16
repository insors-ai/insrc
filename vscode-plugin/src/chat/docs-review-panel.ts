/**
 * Story E20260925edb76e2e:S007 / t3 — the docs-review webview host; reworked by
 * Story E202610138d4b90c9:S001.
 *
 * A vscode-free, deps-injected factory (mirrors createChatPanelHost): it renders
 * the review pane (one nonce'd inline script under a strict per-render CSP,
 * textContent/className only — the S003 shell invariants; a column with a fixed
 * comment panel under one scrolling document, in VS Code theme variables), lists
 * the daemon's PENDING tracked artifacts, opens one on demand, and sends the
 * reviewer's decision and comments through the DocsReviewClient's one decide()
 * call. It is a PASSTHROUGH observer of the tracked-workflow flow (k8): it never
 * runs a workflow itself — it only reads pending()/content() and calls the
 * daemon's own review-decision IPC on daemon-tracked artifacts (k5). It keeps
 * which document is open and nothing else (k3).
 * All vscode API lives behind the injected {@link ChatPanelChannel}.
 */
import { envelope, type WebviewToHost, type HostToWebview, type DocsArtifactSummary, type RenderDegradation, type DocsDocumentTab } from './protocol.js';
import { attr, type ChatPanelChannel, type ChatPanelLogger } from './chat-panel.js';
import type { DocsReviewClient, DocsContent, ReviewDecision, ReviewDecisionComment, ReviewDecisionResult } from './docs-review-client.js';
import { MARKED_SRC } from './webview-marked.js';
import { renderMarkdownStyle, DOCS_REVIEW_MARKDOWN_TOKENS } from './markdown-style.js';
import { DOCS_COMMENTS_SOURCE } from './docs-review-comments.js';
import { DOCS_LIST_SOURCE } from './docs-review-list.js';
import type { LinkOpener } from './link-opener.js';
import { LINK_MARKUP_SOURCE } from './link-markup.js';
import { deriveSectionIndex, createSectionResolver, type SectionIndex } from './docs-sections.js';

/**
 * The artifact kinds the daemon's resolveComment locator (parseArtifactId) supports —
 * request-changes is only offered for these; other pending kinds (SPEC/PLAN/ISSUE/CR)
 * can be approved but not commented, so the pane hides that control for them rather
 * than offer a button guaranteed to fail server-side.
 */
const COMMENTABLE_KINDS = new Set(['DEF', 'HLD', 'LLD']);

export interface DocsReviewHostDeps {
  /** quiet (Story E20261013e62a9269:S001): the pane is created without taking keyboard focus. */
  createPanel(opts: { viewType: string; title: string; quiet?: boolean | undefined }): ChatPanelChannel;
  readonly client: DocsReviewClient;
  readonly logger?: ChatPanelLogger;
  readonly genNonce?: () => string;
  /**
   * Story E202610138d4b90c9:S001: hands a decision message to the chat. Absent means no
   * chat message is sent. It never undoes a decision: a throw or 'unavailable' is only
   * reported in the pane.
   */
  readonly notifyChat?: ((text: string) => 'queued' | { readonly kind: 'unavailable'; readonly note: string }) | undefined;
  /**
   * Story E202610138d4b90c9:S001: the text of an HTML companion, by its repo-relative
   * path; undefined when it may not or cannot be read. Absent means no companion is shown.
   */
  readonly readCompanion?: ((relPath: string) => Promise<string | undefined>) | undefined;
  /** Epic babd84c6e2fb480a Story S001: opens a clicked link or code reference. Absent -> the clicks are ignored. */
  readonly links?: LinkOpener | undefined;
  /**
   * Story E202610131f74c81f:S001: watches repo-relative files and calls onChange when any of
   * them is created, changed or deleted. Absent means the pane does not follow changes made
   * outside it.
   */
  readonly watchDocument?: ((relPaths: readonly string[], onChange: () => void) => { dispose(): void }) | undefined;
  /** The timer for the quiet period after a file change; setTimeout by default. */
  readonly setTimer?: ((fn: () => void, ms: number) => { cancel(): void }) | undefined;
}

/** How long the open document's files must be quiet before it is read again. */
export const RELOAD_QUIET_MS = 300;

/** What the chat hand-over of a decision came to. */
type ChatHandOver = 'queued' | { readonly kind: 'unavailable'; readonly note: string } | 'failed' | 'none';

/** The document the pane shows, as the host last read it. */
interface OpenDocument {
  readonly artifactId: string;
  /** Repo-relative .md path: what the document is re-read and decided by. */
  readonly docPath: string | undefined;
  /** Repo-relative paths of its HTML companions. */
  readonly companions: readonly string[];
  readonly kind: string | undefined;
  readonly title: string | undefined;
}

export interface DocsReviewHost {
  open(): void;
  dispose(): void;
  /**
   * E2 S004 (sc7): open the pane on one artifact, by the id and docs/ markdown path
   * the delivery board took from the daemon's snapshot. Pending or read-only is
   * decided from this call's own pending read, never from the pane's refresh.
   * Story E20261013e62a9269:S001: with quiet (a document the chat presents) the pane is
   * created or brought to the front without taking keyboard focus.
   */
  openArtifact(target: { readonly artifactId: string; readonly mdPath: string; readonly quiet?: boolean | undefined }): void;
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
 * `guardMd` is the sanctioned scrub, single-sourced with the chat page in link-markup.ts (no
 * link keeps an href, an http(s) address moves to data-url, image sources are stripped, and code
 * references are linked; a click posts open-link or open-code-ref). The parse
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
  LINK_MARKUP_SOURCE +
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
  // An `li`, not a `div`: the prose form this replaces is a markdown `<ul>`, so
  // assistive technology announces "list, N items" and offers per-item
  // navigation. Rendering divs would have made the structured form look better
  // and navigate WORSE than the prose it replaces — on a Story whose user value
  // names a non-technical reviewer explicitly. (code-review ux finding)
  `var it=document.createElement('li');it.className='insrc-fr-item';` +
  `var id=document.createElement('span');id.className='insrc-fr-id';id.textContent=r.id;it.appendChild(id);` +
  `var st=document.createElement('span');st.className='insrc-fr-stmt';st.textContent=r.statement;it.appendChild(st);` +
  `if(typeof r.rationale==='string'&&r.rationale.length>0){` +
  `var ra=document.createElement('div');ra.className='insrc-fr-why';ra.textContent=r.rationale;it.appendChild(ra);}` +
  `return it;}` +
  // An entry is renderable only if it can actually be displayed: a non-null
  // object carrying both strings. One bad entry never disqualifies its siblings.
  `function frOk(r){return !!r&&typeof r==='object'&&typeof r.id==='string'&&typeof r.statement==='string';}` +
  // THE single definition of "absent", shared by the renderer and the placement
  // gate. It was duplicated in both; they agreed, but a future change to one
  // would have diverged silently and nothing would have caught it. Same
  // single-sourcing discipline this Story applied to section identity.
  // (code-review quality finding)
  `function frRequirementsOf(record){return (record&&Array.isArray(record.requirements))?record.requirements:[];}` +
  `function renderFunctionalRequirements(record){` +
  `var root=document.createElement('ul');root.className='insrc-fr';` +
  // Array.isArray BEFORE any iteration: this repo has already shipped the
  // unguarded version of this bug once, in the UX companion's childrenOf.
  `var reqs=frRequirementsOf(record);` +
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
  // The group is itself an item of the outer list, carrying a label and a nested
  // list — so the per-story grouping is programmatic, not just visual.
  `var g=document.createElement('li');g.className='insrc-fr-group';` +
  `var h=document.createElement('div');h.className='insrc-fr-group-label';h.textContent=order[i];g.appendChild(h);` +
  `var sub=document.createElement('ul');sub.className='insrc-fr';` +
  `var list=groups[order[i]];` +
  `for(var j=0;j<list.length;j++)sub.appendChild(frItem(list[j]));` +
  `g.appendChild(sub);root.appendChild(g);}` +
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
  `if(frRequirementsOf(record).length===0)return {placed:'none'};` +
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

/**
 * S003/t4 — DOCS_DIAGRAM_SOURCE. The FOURTH member of the DOCS_*_SOURCE family,
 * inlined into the same single nonce'd script as its three siblings, so the strict
 * CSP is not widened by one character.
 *
 * Draws the design diagram FROM THE STRUCTURED RECORD, never from the generated
 * companion file (a sampled one is 3,370,719 bytes of foreign scripted HTML). SVG
 * is built element by element with `createElementNS` and every label written via
 * `textContent`, so this file injects NO markup at all and the surface's single
 * injection site — the markdown body's guarded `marked.parse` — stays single.
 * That matters more in SVG than in HTML: SVG is XML, so an unescaped `<` in a
 * class name would be a parse hazard if markup were ever built by concatenation.
 *
 * INERT in this commit: the functions are defined and nothing calls them, so the
 * rendered surface is unchanged. t6 adds the one call that mounts a slot.
 *
 * `dg` prefix throughout — a fifth source string arrives with S004 and all of
 * them share one scope.
 */
export const DOCS_DIAGRAM_SOURCE =
  // The LinkML scalar types a slot `range` may name to still be an ATTRIBUTE.
  // MUST match er.ts:68-73 exactly: parity with the daemon derivation is the
  // property that keeps the in-pane picture and the generated companion telling
  // the same story about the same model, and a drift here changes an edge into an
  // attribute silently.
  `var DG_SCALARS={string:1,integer:1,boolean:1,float:1,double:1,decimal:1,` +
  `time:1,date:1,datetime:1,date_or_datetime:1,` +
  `uri:1,uriorcurie:1,curie:1,ncname:1,objectidentifier:1,nodeidentifier:1,` +
  `jsonpointer:1,jsonpath:1,sparqlpath:1};` +
  `var DG_NS='http://www.w3.org/2000/svg';` +
  // Geometry. Fixed numbers only — no value here is ever derived from record
  // text, which is half of why no attribute can carry injected content.
  `var DG_COLS=3,DG_BOXW_MIN=180,DG_ROWH=16,DG_HEADH=24,DG_PADX=56,DG_PADY=52,DG_MARGIN=16;` +
  // Monospace advance widths at the two font sizes the box uses. Approximate by
  // design: the webview cannot measure text without a layout pass, and a
  // measurement-dependent layout would stop being deterministic. Slightly
  // generous, so a row is padded rather than clipped.
  `var DG_CH_ROW=6.75,DG_CH_HEAD=8.4;` +

  // --- crow's-foot token -----------------------------------------------------
  // The daemon's crowsFootToken (er.ts:195-201), rule for rule: an explicit
  // minimum_cardinality wins over `required`, an explicit maximum_cardinality over
  // `multivalued`, and anything above 1 (or unbounded) reads as 'many'.
  `function dgCrowsFoot(slot){` +
  `var min=(slot&&typeof slot.minimum_cardinality==='number')?slot.minimum_cardinality:((slot&&slot.required===true)?1:0);` +
  `var maxRaw=(slot&&typeof slot.maximum_cardinality==='number')?slot.maximum_cardinality:((slot&&slot.multivalued===true)?Infinity:1);` +
  `var lower=min>=1?'one':'zero';` +
  `var upper=(maxRaw===Infinity||maxRaw>1)?'many':'one';` +
  `return lower+'-to-'+upper;}` +

  // --- the ER derivation -----------------------------------------------------
  // Re-implements erDefinitionToIr (er.ts:273-324). The duplication is
  // UNAVOIDABLE — this runs in a webview and cannot import the daemon module — so
  // the mitigation is a parity test pinning both against shared fixtures with the
  // DAEMON as the authority, not a comment promising they agree.
  //
  // Rules, identical to the daemon's: classes in sorted order, slots in sorted
  // order; a slot whose `range` names a DEFINED CLASS becomes an edge; every other
  // slot folds into the box's attribute list as `name: range`, or the bare name
  // when the range is empty.
  //
  // ONE DELIBERATE DIVERGENCE: a range that is neither a defined class nor a known
  // scalar is a DANGLING reference, and the daemon THROWS ErDefinitionError there
  // (er.ts:291-294). The client must not: the daemon is generating an artifact and
  // owes referential integrity, while this code owes the reviewer whatever it can
  // legibly show. So the dangling slot loses the relationship it would have implied
  // and is listed as a plain attribute — every box and every other edge still draw.
  `function dgDeriveEr(rec){` +
  `var classes=(rec&&typeof rec==='object'&&!(rec instanceof Array)&&rec.classes&&typeof rec.classes==='object'&&!(rec.classes instanceof Array))?rec.classes:null;` +
  `if(!classes)return null;` +
  `var names=[];for(var k in classes){if(Object.prototype.hasOwnProperty.call(classes,k))names.push(k);}` +
  `if(names.length===0)return null;` +
  `names.sort();` +
  `var defined={};for(var n=0;n<names.length;n++)defined[names[n]]=1;` +
  `var nodes=[],edges=[];` +
  `for(var i=0;i<names.length;i++){` +
  `var cn=names[i];var cls=classes[cn]||{};` +
  `var attrs=(cls&&typeof cls==='object'&&cls.attributes&&typeof cls.attributes==='object'&&!(cls.attributes instanceof Array))?cls.attributes:{};` +
  `var slotNames=[];for(var sk in attrs){if(Object.prototype.hasOwnProperty.call(attrs,sk))slotNames.push(sk);}` +
  `slotNames.sort();` +
  `var attrList=[],rels=[];` +
  `for(var j=0;j<slotNames.length;j++){` +
  `var sn=slotNames[j];var slot=attrs[sn];` +
  `if(!slot||typeof slot!=='object'){attrList.push({name:sn,range:''});continue;}` +
  `var range=(typeof slot.range==='string')?slot.range:'';` +
  // A defined class -> a relationship edge.
  `if(range.length>0&&defined[range]===1){rels.push({name:sn,range:range,slot:slot});continue;}` +
  // Scalar, empty, OR DANGLING -> an attribute. The dangling case is where the
  // daemon throws and this does not; see the note above.
  `attrList.push({name:sn,range:range,identifier:slot.identifier===true,dangling:(range.length>0&&DG_SCALARS[range]!==1)});}` +
  `var relRows=[];for(var q=0;q<rels.length;q++){relRows.push({name:rels[q].name,to:rels[q].range,token:dgCrowsFoot(rels[q].slot)});}` +
  `nodes.push({id:cn,attrs:attrList,rels:relRows});` +
  `for(var r=0;r<rels.length;r++){` +
  `var rel=rels[r];` +
  `edges.push({id:cn+'.'+rel.name+'->'+rel.range+':'+dgCrowsFoot(rel.slot),from:cn,to:rel.range,label:rel.name,token:dgCrowsFoot(rel.slot)});}}` +
  `return {nodes:nodes,edges:edges};}` +

  // --- layout ----------------------------------------------------------------
  // Driven by the SORTED NODE LIST on a fixed grid — never by walking edges. That
  // is a correctness property, not a style choice: a cyclic class graph and a
  // self-referencing slot are both ordinary data models (a tree, a parent/child
  // graph), and an edge-driven placement would fail to terminate on either.
  // Deterministic by construction: no randomness, no measurement, no reflow, so
  // the same record always draws the same picture and a visual check is repeatable.
  `function dgRowText(nd){` +
  `var rows=[],k;` +
  `for(k=0;k<nd.attrs.length;k++){var a=nd.attrs[k];rows.push(a.range.length>0?(a.name+': '+a.range):a.name);}` +
  `for(k=0;k<nd.rels.length;k++){var r=nd.rels[k];rows.push(r.name+' → '+r.to+' ('+r.token+')');}` +
  `return rows;}` +
  `function dgLayout(model){` +
  `var pos={},i,k;` +
  // Each box is sized to ITS OWN content. A fixed width clipped the longest
  // relationship rows straight through the border on the first visual read —
  // visible in a screenshot, invisible to every assertion in the suite.
  `var want={};` +
  `for(i=0;i<model.nodes.length;i++){` +
  `var nd=model.nodes[i];var rows=dgRowText(nd);var longest=0;` +
  `for(k=0;k<rows.length;k++)longest=Math.max(longest,rows[k].length);` +
  `want[nd.id]=Math.max(DG_BOXW_MIN,Math.ceil(longest*DG_CH_ROW)+20,Math.ceil(nd.id.length*DG_CH_HEAD)+20);}` +
  // Column width is the widest box in that column, so columns stay aligned and
  // two boxes can never overlap however uneven their content.
  `var colW={};` +
  `for(i=0;i<model.nodes.length;i++){var c=i%DG_COLS;colW[c]=Math.max(colW[c]||0,want[model.nodes[i].id]);}` +
  `var colX={},ax=DG_MARGIN,cc=0;` +
  `while(colW[cc]!==undefined){colX[cc]=ax;ax+=colW[cc]+DG_PADX;cc++;}` +
  `for(i=0;i<model.nodes.length;i++){` +
  `var n2=model.nodes[i];var col=i%DG_COLS,row=Math.floor(i/DG_COLS);` +
  `var h=DG_HEADH+Math.max(n2.attrs.length+n2.rels.length,1)*DG_ROWH+8;` +
  `pos[n2.id]={x:colX[col],y:0,w:colW[col],h:h,col:col,row:row};}` +
  // Row heights are the max box height in that row, so rows never overlap however
  // uneven the attribute counts are.
  `var rowH={};for(i=0;i<model.nodes.length;i++){var p=pos[model.nodes[i].id];rowH[p.row]=Math.max(rowH[p.row]||0,p.h);}` +
  `var rowY={},acc=DG_MARGIN,rr=0;` +
  `while(rowH[rr]!==undefined){rowY[rr]=acc;acc+=rowH[rr]+DG_PADY;rr++;}` +
  `for(i=0;i<model.nodes.length;i++){var q=pos[model.nodes[i].id];q.y=rowY[q.row];}` +
  `return {pos:pos,width:ax-DG_PADX+DG_MARGIN,height:acc-DG_PADY+DG_MARGIN};}` +

  // --- SVG primitives --------------------------------------------------------
  // createElementNS for every element, setAttribute for GEOMETRY ONLY (numbers and
  // fixed class names), textContent for every label. No record text ever reaches an
  // attribute, and no markup string is built anywhere in this file.
  `function dgEl(name,cls){var e=document.createElementNS(DG_NS,name);if(cls)e.setAttribute('class',cls);return e;}` +
  `function dgText(x,y,cls,s){var t=dgEl('text',cls);t.setAttribute('x',String(x));t.setAttribute('y',String(y));t.textContent=String(s);return t;}` +
  `function dgLine(x1,y1,x2,y2,cls){var l=dgEl('line',cls);l.setAttribute('x1',String(x1));l.setAttribute('y1',String(y1));l.setAttribute('x2',String(x2));l.setAttribute('y2',String(y2));return l;}` +

  // Clip the segment between two box centres to the boxes' borders, so an edge
  // visibly STARTS and ENDS at the two boxes it names rather than vanishing under
  // them — the difference between a readable diagram and a pile of lines.
  `function dgEdgePoint(box,tx,ty){` +
  `var cx=box.x+box.w/2,cy=box.y+box.h/2;var dx=tx-cx,dy=ty-cy;` +
  `if(dx===0&&dy===0)return {x:cx,y:cy};` +
  `var sx=dx===0?Infinity:(box.w/2)/Math.abs(dx),sy=dy===0?Infinity:(box.h/2)/Math.abs(dy);` +
  `var s=Math.min(sx,sy);return {x:cx+dx*s,y:cy+dy*s};}` +

  // --- the ER renderer -------------------------------------------------------
  // One box per class carrying its attributes, one arrow per class-ranged slot
  // labelled with the slot name and the daemon's crow's-foot token. Returns the
  // sc2 StructuredRenderer shape: `{ el, degradation? }`.
  `function dgRenderEr(rec){` +
  `var model=dgDeriveEr(rec);if(!model)return null;` +
  `var lay=dgLayout(model);` +
  `var svg=dgEl('svg','insrc-dg');` +
  `svg.setAttribute('viewBox','0 0 '+lay.width+' '+lay.height);` +
  `svg.setAttribute('width','100%');` +
  `svg.setAttribute('preserveAspectRatio','xMinYMin meet');` +
  // Edges first so boxes paint over the line ends, which keeps a label from being
  // crossed by the edge it belongs to.
  // Lines carry the TOPOLOGY only. The captions live inside the source box (see
  // the relationship rows below) rather than floating on the line.
  //
  // That is a correction, not a preference. The first visual read of this renderer
  // showed captions swallowed by boxes that painted after them; moving the captions
  // on top then showed them covering the boxes' own attribute rows, and three
  // captions leaving one box still smeared into each other. A caption anchored
  // inside its box cannot collide with anything by construction, and the reviewer
  // reads the relationship next to the entity that owns it.
  `var g,i;` +
  `for(i=0;i<model.edges.length;i++){` +
  `var e=model.edges[i];var a=lay.pos[e.from],b=lay.pos[e.to];if(!a||!b)continue;` +
  `g=dgEl('g','insrc-dg-edge');` +
  `if(e.from===e.to){` +
  // A self-reference draws as a visible loop on its own box rather than a
  // zero-length line, so the relationship is not silently lost.
  `var lx=a.x+a.w,ly=a.y+a.h/2;` +
  `g.appendChild(dgLine(lx,ly,lx+22,ly,'insrc-dg-edge-line'));` +
  `g.appendChild(dgLine(lx+22,ly,lx+22,ly-20,'insrc-dg-edge-line'));` +
  `g.appendChild(dgLine(lx+22,ly-20,lx,ly-20,'insrc-dg-edge-line'));` +
  `}else{` +
  `var p1=dgEdgePoint(a,b.x+b.w/2,b.y+b.h/2),p2=dgEdgePoint(b,a.x+a.w/2,a.y+a.h/2);` +
  `g.appendChild(dgLine(p1.x,p1.y,p2.x,p2.y,'insrc-dg-edge-line'));}` +
  `svg.appendChild(g);}` +
  `for(i=0;i<model.nodes.length;i++){` +
  `var nd=model.nodes[i];var p=lay.pos[nd.id];` +
  `g=dgEl('g','insrc-dg-node');` +
  `var rect=dgEl('rect','insrc-dg-box');` +
  `rect.setAttribute('x',String(p.x));rect.setAttribute('y',String(p.y));` +
  `rect.setAttribute('width',String(p.w));rect.setAttribute('height',String(p.h));` +
  `rect.setAttribute('rx','4');` +
  `g.appendChild(rect);` +
  `g.appendChild(dgLine(p.x,p.y+DG_HEADH,p.x+p.w,p.y+DG_HEADH,'insrc-dg-box-rule'));` +
  `g.appendChild(dgText(p.x+10,p.y+17,'insrc-dg-class',nd.id));` +
  `for(var j=0;j<nd.attrs.length;j++){` +
  `var at=nd.attrs[j];` +
  `var label=at.range.length>0?(at.name+': '+at.range):at.name;` +
  `if(at.identifier)label=label+'  (id)';` +
  `g.appendChild(dgText(p.x+10,p.y+DG_HEADH+14+j*DG_ROWH,at.dangling?'insrc-dg-attr insrc-dg-attr-dangling':'insrc-dg-attr',label));}` +
  // The relationships this class owns, named inside the box that owns them, with
  // the daemon's crow's-foot token. The arrow on the canvas shows WHERE it goes;
  // this row says what it is called and how many.
  `for(var rI=0;rI<nd.rels.length;rI++){` +
  `var rl=nd.rels[rI];` +
  `g.appendChild(dgText(p.x+10,p.y+DG_HEADH+14+(nd.attrs.length+rI)*DG_ROWH,'insrc-dg-rel',` +
  `rl.name+' \u2192 '+rl.to+' ('+rl.token+')'));}` +
  `svg.appendChild(g);}` +
  `return {el:svg};}` +

  // --- the sequence derivation ----------------------------------------------
  // Re-implements sequenceDefinitionToIr (sequence.ts:243-291). Its rules differ
  // from the ER one in ways that matter: participants keep their DECLARED ORDER
  // rather than being sorted (the order IS the story), and a message's identity is
  // its INDEX, so two identical calls between the same pair stay distinct.
  //
  // Same deliberate divergence as the ER side: the daemon THROWS
  // SequenceDefinitionError on a message naming an undeclared participant, because
  // it is generating an artifact. This drops that one message and draws the rest.
  `function dgDeriveSeq(rec){` +
  `if(!rec||typeof rec!=='object'||(rec instanceof Array))return null;` +
  `var ps=rec.participants,ms=rec.messages;` +
  `if(!(ps instanceof Array)||ps.length===0)return null;` +
  `var nodes=[],ids={},i;` +
  `for(i=0;i<ps.length;i++){var p=ps[i];` +
  `if(!p||typeof p!=='object'||typeof p.id!=='string'||p.id.length===0)continue;` +
  `ids[p.id]=1;` +
  `nodes.push({id:p.id,label:(typeof p.label==='string'&&p.label.length>0)?p.label:p.id});}` +
  `if(nodes.length===0)return null;` +
  `var edges=[];` +
  `if(ms instanceof Array){for(i=0;i<ms.length;i++){var m=ms[i];` +
  `if(!m||typeof m!=='object')continue;` +
  // A dangling endpoint: the daemon throws here, this drops the one message.
  `if(ids[m.from]!==1||ids[m.to]!==1)continue;` +
  `var kind=(m.kind==='return'||m.kind==='recurse')?m.kind:'call';` +
  `edges.push({id:m.from+'->'+m.to+'#'+i+(kind==='recurse'?':repeat':''),` +
  `from:m.from,to:m.to,index:i,kind:kind,` +
  `label:(typeof m.label==='string')?m.label:'',` +
  `note:(typeof m.note==='string'&&m.note.length>0)?m.note:''});}}` +
  `var truncs=[];` +
  `if(rec.truncations instanceof Array){for(i=0;i<rec.truncations.length;i++){` +
  `var t=rec.truncations[i];` +
  `if(t&&typeof t==='object'&&ids[t.atParticipant]===1&&typeof t.note==='string')` +
  `truncs.push({at:t.atParticipant,note:t.note});}}` +
  `return {nodes:nodes,edges:edges,truncations:truncs};}` +

  // Sequence geometry. A lifeline per participant, one row per message.
  `var DG_SEQ_HEAD=30,DG_SEQ_ROW=40,DG_SEQ_TOP=52,DG_SEQ_COLMIN=150,DG_SEQ_PADX=28;` +
  `function dgRenderSeq(rec){` +
  `var model=dgDeriveSeq(rec);if(!model)return null;` +
  `var i,j;` +
  // Column width fits the widest participant label AND the widest message caption,
  // so nothing is clipped — the failure the ER renderer's first visual read caught.
  `var widest=DG_SEQ_COLMIN;` +
  `for(i=0;i<model.nodes.length;i++)widest=Math.max(widest,Math.ceil(model.nodes[i].label.length*DG_CH_ROW)+20);` +
  // COLUMN WIDTH IS DRIVEN BY PARTICIPANT LABELS ONLY. Letting the longest message
  // note size the columns produced a canvas ~3000px wide and ~250px tall on the
  // real record — structurally correct and, scaled into a pane, far too small to
  // read. Captions instead sit on their own row where nothing else competes for the
  // space, and are CLAMPED to the canvas below, so they may span columns without
  // escaping. Found by looking at the first render; no assertion could see it.
  `var colW=widest+DG_SEQ_PADX;` +
  `var n=model.nodes.length;` +
  `var width=DG_MARGIN*2+Math.max(n,1)*colW;` +
  `var height=DG_SEQ_TOP+Math.max(model.edges.length,1)*DG_SEQ_ROW+30+model.truncations.length*18;` +
  `var svg=dgEl('svg','insrc-dg');` +
  `svg.setAttribute('viewBox','0 0 '+width+' '+height);` +
  `svg.setAttribute('width','100%');` +
  `svg.setAttribute('preserveAspectRatio','xMinYMin meet');` +
  `var cx={};` +
  `for(i=0;i<n;i++)cx[model.nodes[i].id]=DG_MARGIN+i*colW+colW/2;` +
  // Lifelines first, so every arrow and caption paints over them.
  `for(i=0;i<n;i++){` +
  `var x=cx[model.nodes[i].id];` +
  `svg.appendChild(dgLine(x,DG_SEQ_HEAD+6,x,height-12,'insrc-dg-lifeline'));}` +
  // Participant heads.
  `for(i=0;i<n;i++){` +
  `var nd=model.nodes[i];var hx=DG_MARGIN+i*colW+8,hw=colW-16;` +
  `var g=dgEl('g','insrc-dg-node');` +
  `var rect=dgEl('rect','insrc-dg-box');` +
  `rect.setAttribute('x',String(hx));rect.setAttribute('y','6');` +
  `rect.setAttribute('width',String(hw));rect.setAttribute('height',String(DG_SEQ_HEAD-6));` +
  `rect.setAttribute('rx','4');` +
  `g.appendChild(rect);` +
  `var tx=dgText(hx+hw/2,DG_SEQ_HEAD-9,'insrc-dg-class',nd.label);` +
  `tx.setAttribute('text-anchor','middle');` +
  `g.appendChild(tx);` +
  `svg.appendChild(g);}` +
  // Messages, in order, each on its own row — the order IS the content.
  `for(i=0;i<model.edges.length;i++){` +
  `var e=model.edges[i];var y=DG_SEQ_TOP+i*DG_SEQ_ROW;` +
  `var x1=cx[e.from],x2=cx[e.to];` +
  `var g2=dgEl('g','insrc-dg-edge');` +
  `var lineCls=e.kind==='return'?'insrc-dg-edge-line insrc-dg-edge-return':'insrc-dg-edge-line';` +
  `if(e.from===e.to){` +
  // A self-call draws as a visible bracket on its own lifeline rather than a
  // zero-length arrow, so a recursion is never silently lost.
  `g2.appendChild(dgLine(x1,y,x1+26,y,lineCls));` +
  `g2.appendChild(dgLine(x1+26,y,x1+26,y+12,lineCls));` +
  `g2.appendChild(dgLine(x1+26,y+12,x1,y+12,lineCls));` +
  `}else{` +
  `g2.appendChild(dgLine(x1,y,x2,y,lineCls));` +
  // A head drawn from two short strokes, so direction is readable without markers.
  `var dir=x2>x1?-1:1;` +
  `g2.appendChild(dgLine(x2,y,x2+dir*7,y-4,lineCls));` +
  `g2.appendChild(dgLine(x2,y,x2+dir*7,y+4,lineCls));}` +
  // Keep a centred caption inside the canvas: a long note centred on a lifeline
  // near an edge would otherwise run off the side where nothing can clip it.
  `function dgClamp(mid,text,size){` +
  `var half=text.length*size/2;` +
  `if(mid-half<DG_MARGIN)return DG_MARGIN+half;` +
  `if(mid+half>width-DG_MARGIN)return width-DG_MARGIN-half;` +
  `return mid;}` +
  `var rawX=e.from===e.to?x1+30:(x1+x2)/2;` +
  `var capText=String(e.index+1)+'. '+e.label+(e.kind==='recurse'?'  (repeat)':'');` +
  `var selfAnchor=e.from===e.to;` +
  `var cap=dgText(selfAnchor?rawX:dgClamp(rawX,capText,DG_CH_ROW),y-6,'insrc-dg-msg',capText);` +
  `cap.setAttribute('text-anchor',selfAnchor?'start':'middle');` +
  `g2.appendChild(cap);` +
  `if(e.note.length>0){` +
  `var nt=dgText(selfAnchor?rawX:dgClamp(rawX,e.note,DG_CH_ROW),y+13,'insrc-dg-note',e.note);` +
  `nt.setAttribute('text-anchor',selfAnchor?'start':'middle');` +
  `g2.appendChild(nt);}` +
  `svg.appendChild(g2);}` +
  // Truncation markers, which say the model itself was cut short.
  `for(i=0;i<model.truncations.length;i++){` +
  `var tr=model.truncations[i];` +
  `svg.appendChild(dgText(cx[tr.at],height-18-i*18,'insrc-dg-note',tr.note));}` +
  `return {el:svg};}` +

  // --- the slot factory ------------------------------------------------------
  // sc4's four-combination gate, stated as a table because ac2 reads on the REF
  // while the HLD sketch read on the RECORD, and the two disagree in both
  // directions. Resolved at the approval gate as RECORD GATES CONTENT:
  //
  //   ref absent  + record absent   -> 'absent'      (zero DOM work)
  //   ref present + record present  -> 'rendered'
  //   ref present + record absent   -> 'unshowable'  (named, with the link-out)
  //   ref absent  + record present  -> 'rendered'    (the design exists; show it)
  //
  // The record decides what can be DRAWN; the ref decides whether a failure must be
  // DECLARED, because a ref is the only evidence a visual was meant to exist.
  // Dispatch is on the RECORD, never on the ref's kind — three daemon renderers all
  // stamp 'diagram-mermaid', so the kind cannot identify its own source record.
  `var DG_LABEL_DEFAULT='Entity model';var DG_LABEL_SEQ='Call sequence';` +
  // Only a DIAGRAM ref is this factory's business. A ux-mock ref belongs to the
  // experience slot (S004) and is ignored here, which is what keeps a document
  // carrying both from having its arrangement pre-empted by s3.
  `function dgPickRef(companions){` +
  `if(!companions||!(companions instanceof Array))return undefined;` +
  `for(var i=0;i<companions.length;i++){var c=companions[i];` +
  `if(c&&typeof c==='object'&&(c.kind==='diagram-mermaid'||c.kind==='diagram-html'))return c;}` +
  `return undefined;}` +
  `function dgLinkOut(ref){` +
  `if(!ref||typeof ref.relPath!=='string'||ref.relPath.length===0)return undefined;` +
  `return {relPath:ref.relPath,title:(typeof ref.title==='string'&&ref.title.length>0)?ref.title:ref.relPath};}` +
  // TRecord for this factory is the RECORD BUNDLE the pane receives, not one
  // record: a companion ref cannot say which record drew it (three daemon
  // renderers all stamp 'diagram-mermaid'), so the factory is handed everything
  // the document carries and dispatches on what is actually present.
  `function dgDrawable(records){` +
  `if(!records||typeof records!=='object')return null;` +
  `if(dgDeriveEr(records.erDefinition)!==null)return 'er';` +
  `if(dgDeriveSeq(records.sequenceDefinition)!==null)return 'sequence';` +
  `return null;}` +
  `function dgBuildDiagramSlot(records,ref,anchorSlug){` +
  // THE ABSENT GATE COMES FIRST and returns before a single element is created, so
  // "no slot" is provable as the ABSENCE OF DOM ACTIVITY rather than as the absence
  // of something visible. This is the dominant path: 2 of 634 ledger bodies carry
  // an erDefinition.
  `var which=dgDrawable(records);var drawable=which!==null;` +
  `if(!drawable&&!ref)return {state:'absent'};` +
  `var label=(ref&&typeof ref.title==='string'&&ref.title.length>0)?ref.title:(which==='sequence'?DG_LABEL_SEQ:DG_LABEL_DEFAULT);` +
  `var link=dgLinkOut(ref);` +
  // lc1 — `diagram-html` is DECLARED in the companion union and produced by
  // nothing. It routes to the stated failure rather than falling through silently,
  // so no companion kind can ever render as nothing if a producer turns it on.
  `if(ref&&ref.kind==='diagram-html'){` +
  `return {state:'unshowable',kind:'diagram',label:label,reason:'this companion kind (diagram-html) cannot be drawn in the review pane',linkOut:link,anchorSlug:anchorSlug};}` +
  `if(!drawable){` +
  // A ref with no record the client can draw from — today the MAJORITY case for
  // diagram refs. The reason NAMES what was referenced instead of failing
  // generically, because a silent omission is indistinguishable from a document
  // that legitimately has no diagram.
  `return {state:'unshowable',kind:'diagram',label:label,reason:'its source record is not available to this surface',linkOut:link,anchorSlug:anchorSlug};}` +
  // A renderer throw must never take the document down over an adjunct, so the
  // whole construction is wrapped and degrades to the same stated failure.
  `var built=null;try{built=(which==='er')?dgRenderEr(records.erDefinition):dgRenderSeq(records.sequenceDefinition);}catch(err){built=null;}` +
  `if(!built||!built.el){` +
  `return {state:'unshowable',kind:'diagram',label:label,reason:'the design record could not be drawn',linkOut:link,anchorSlug:anchorSlug};}` +
  `var out={state:'rendered',kind:'diagram',label:label,body:built.el,anchorSlug:anchorSlug};` +
  `if(link)out.linkOut=link;` +
  `return out;}` +

  // --- mounting ---------------------------------------------------------------
  // Builds the visible frame and puts it where it belongs. Three outcomes, returned
  // as a discriminator so a test asserts the BEHAVIOUR rather than inferring it:
  //   'none'       absent -> the host is cleared and nothing is created.
  //   'in-section' anchored beside the heading the ref named.
  //   'default'    the dedicated host above the body, because there was no
  //                anchor or it named no section in this document.
  //
  // The host is cleared FIRST and unconditionally, which is what makes a re-render
  // idempotent: the body is rebuilt from markdown on every message, so anything
  // placed inside it vanishes on its own, but this host persists and would
  // otherwise accumulate a slot per render.
  `function dgFrame(slot){` +
  // S004/t6 — the EXPERIENCE kind gets a modifier class; the diagram keeps exactly
  // the class it had. Asymmetric on purpose: an acceptance check requires the
  // diagram slot to render BYTE-IDENTICALLY to what S003 ships, so the modifier is
  // additive for the new kind only. It gives the experience slot a stable handle for
  // tests and for any future styling, without touching the shipped peer.
  `var box=document.createElement('div');` +
  `box.className=slot.kind==='experience'?'insrc-dg-slot insrc-dg-slot--experience':'insrc-dg-slot';` +
  `var head=document.createElement('div');head.className='insrc-dg-slot-head';` +
  `head.textContent=slot.label;box.appendChild(head);` +
  `if(slot.state==='rendered'){box.appendChild(slot.body);}` +
  `else{var why=document.createElement('div');why.className='insrc-dg-slot-why';` +
  // NAMED, not generic: a silent omission is indistinguishable from a document
  // that legitimately has no diagram, which is the whole point of ac3.
  // S004/t6 — the NOUN comes from the slot's own kind. Reusing one mounter for both
  // peers is deliberate, but a frame that told a reviewer "this diagram could not be
  // shown" about an experience mock would be reusing it too far. sc4 already carries
  // the kind, so the frame reads it rather than assuming. The diagram's own text is
  // unchanged, which is what keeps its rendering byte-identical to what S003 ships.
  `why.textContent='This '+(slot.kind==='experience'?'experience mock':'diagram')` +
  `+' could not be shown here \u2014 '+slot.reason+'.';` +
  `box.appendChild(why);}` +
  `if(slot.linkOut){var a=document.createElement('div');a.className='insrc-dg-slot-link';` +
  `a.textContent='Full version: '+slot.linkOut.relPath;box.appendChild(a);}` +
  `return box;}` +
  `function dgMountSlot(hostEl,bodyEl,slot){` +
  `if(hostEl){while(hostEl.firstChild)hostEl.removeChild(hostEl.firstChild);}` +
  // ac2's dominant path: return before ANY element is created, so "no slot" is the
  // absence of DOM activity rather than the absence of something visible.
  `if(!slot||slot.state==='absent')return 'none';` +
  `var frame=dgFrame(slot);` +
  `var slug=slot.anchorSlug;` +
  // Found by the post-build code review: `querySelector('#'+slug)` THROWS a
  // SyntaxError whenever the slug starts with a digit, because a bare CSS
  // identifier may not. insrc documents number their headings — the format engine
  // renders `## 2. Contract details`, which slugifies to `2-contract-details` —
  // so the selector form would have failed on essentially EVERY real document,
  // silently, since the catch below degrades to default placement. Verified in
  // Chrome: `document.querySelector('#2-contract-details')` -> SyntaxError.
  //
  // Walking children and comparing `id` avoids CSS identifier syntax altogether.
  // It is also what the body actually is: a flat list of rendered blocks.
  `if(slug&&bodyEl&&bodyEl.children){` +
  `var h=null;var kids=bodyEl.children;` +
  `for(var ci=0;ci<kids.length;ci++){if(kids[ci]&&kids[ci].id===slug){h=kids[ci];break;}}` +
  // Inserted AFTER the heading it was anchored to, so the visual sits with the part
  // of the document that references it.
  `if(h&&h.parentNode){h.parentNode.insertBefore(frame,h.nextSibling);return 'in-section';}}` +
  `if(hostEl){hostEl.appendChild(frame);return 'default';}` +
  `return 'none';}`;

// ---------------------------------------------------------------------------
// S004/t2 — DOCS_UX_SOURCE. The FIFTH member of the DOCS_*_SOURCE family, after
// DOCS_BODY_RENDERER_SOURCE (:76), DOCS_SECTIONS_SOURCE (:111), DOCS_FR_SOURCE
// (:185) and DOCS_DIAGRAM_SOURCE (:369). Carried as SOURCE so the shell inlines
// it into its ONE nonce'd script and the tests `new Function`-evaluate it against
// DOM stubs.
//
// WHAT IT MIRRORS AND WHAT IT REFUSES. The authority is the daemon's
// renderUxMockDocument (src/workflow/artifacts/companion/ux.ts:482) and its
// elementHtml (:350). Its STRUCTURE and its `ux-*` class vocabulary are mirrored
// exactly — that is what makes the in-pane mock and the generated companion the
// same picture. Its METHOD is refused: the daemon builds HTML STRINGS because it
// writes a standalone file, while this builds the same tree with createElement
// and textContent. That is not a stylistic preference. It is what keeps the mock
// a DRAWING of a record rather than a path to the network, and it is the half of
// ac5 that no amount of escaping would give.
//
// It is also NOT uxDefinitionToIr (ux.ts:282). That function lowers a card into a
// node-and-edge DocumentIR, and publishing its output as an "experience mock"
// produced a mermaid picture of the card's JSON — ISSUE-85e6a58693579b6d, ~3.37 MB
// of graph where a 7 KB interface belonged. A committed guard asserts this
// renderer emits no node/edge construct, so that correction cannot be undone by
// someone reaching for the nearest existing function.
//
// Identifier prefix `ux`, load-bearing rather than tidy: all five strings share
// ONE scope, and S003 hit a real `dgEl` collision between a host const and a
// source-string function — a SyntaxError that breaks the entire webview and that
// tsc cannot see inside a template literal. The parse-coexistence test covers all
// five from this commit on.
//
// INERT at t2: these functions are defined and nothing calls them. t5 adds the
// slot factory, t6 the single mount call.
// ---------------------------------------------------------------------------

export const DOCS_UX_SOURCE =
  // S004/t4 — THE DEPTH BOUND, set from measurement rather than invented. The LLD
  // deliberately left the value open; t3's narrow-pane read is what decides it, and
  // the numbers below come from S004/evidence/t3-depth-measurement.md.
  //
  //   measured real maximum      ELEMENT NESTING depth 4 (records: 2, 4, 3, 4)
  //   cost per Container level   exactly 22px (1px border x2 + 10px padding x2)
  //   380px pane, card inner     362px, so a worst-case all-Container nesting
  //                              exhausts readable width at ~16 levels
  //   synthetic depth 9 and 14   both still render legibly; layout degrades
  //                              gradually and never clips or overlaps
  //
  // 24 is chosen because it is SIX TIMES the measured real maximum, so no plausible
  // growth in authored content reaches it; and because it sits well beyond the ~16
  // levels at which a narrow pane has no content width left, so by the time the
  // guard could engage the layout has already degraded on its own. That ordering is
  // the whole point: the bound is a SAFETY limit against malformed, cyclic or
  // hostile structure, never a presentation rule. Alternative a4 was rejected
  // precisely for blurring that line — it would have fired on the majority of real
  // records, which this cannot fire on at all.
  //
  // ONE named constant. A second hard-coded copy is what turns a reasoned bound back
  // into a number nobody chose.
  `var UX_DEPTH_MAX=24;` +
  // The slot's default label when the ref carries no title, mirroring S003's
  // DG_LABEL_DEFAULT. 'Experience mock' is the daemon's own name for this companion.
  `var UX_LABEL_DEFAULT='Experience mock';` +

  // --- the child list, read DEFENSIVELY --------------------------------------
  // Mirrors childrenOf (ux.ts:181-195) including its reason: a card body is read
  // from a STORED artifact, so it can predate a schema change or be hand-edited
  // past the type. `items` for Container and Column, `columns` for ColumnSet, and
  // a non-array degrades to EMPTY rather than throwing.
  `function uxKids(el){` +
  `var v=null;` +
  `if(el.type==='Container'||el.type==='Column')v=el.items;` +
  `else if(el.type==='ColumnSet')v=el.columns;` +
  `else return [];` +
  `return Array.isArray(v)?v:[];}` +

  // --- primitives ------------------------------------------------------------
  // Every element in this renderer is born here, and every string written here.
  // A recording stub proves it by capturing property writes, so "no markup" is
  // EXECUTED rather than grepped.
  `function uxEl(tag,cls){var e=document.createElement(tag);if(cls)e.className=cls;return e;}` +
  `function uxTextNode(tag,cls,text){var e=uxEl(tag,cls);e.textContent=text==null?'':String(text);return e;}` +
  // A BARE text child, for the places the daemon emits loose text inside an
  // element rather than wrapping it (a choice's title, an action's title).
  // createTextNode and textContent are the two non-parsing ways to put a string in
  // the DOM; neither can ever be read as markup, which is the invariant ac5 is
  // actually about. Wrapping these in an extra span would read the same and be
  // structurally WRONG — and the structural parity diff would catch it, which is
  // how this was found.
  `function uxText(host,text){host.appendChild(document.createTextNode(text==null?'':String(text)));}` +

  // --- one element -> one subtree --------------------------------------------
  // EXHAUSTIVE over the eight-member union, one branch each, in the daemon's
  // order. `depth` is carried so the bound can be checked before recursing.
  `function uxElement(el,depth){` +
  // A non-object or a missing `type` is a HOLE in an otherwise valid tree: it
  // degrades IN PLACE and its siblings still render. Checked before the branch is
  // chosen, exactly where the daemon checks it.
  `if(el===null||typeof el!=='object'||typeof el.type!=='string')` +
  `return uxTextNode('div','ux-unknown','unrenderable element: '+(el&&el.type!=null?String(el.type):'unknown'));` +
  // The depth guard. A SAFETY limit against malformed or hostile structure, not a
  // presentation rule — it names depth as the reason so a reviewer can tell a
  // guard from a truncation.
  `if(UX_DEPTH_MAX!==null&&depth>UX_DEPTH_MAX)` +
  `return uxTextNode('div','ux-unknown','unrenderable element: nesting deeper than '+UX_DEPTH_MAX+' levels');` +
  `var t=el.type;` +

  // TextBlock -> <p class="ux-text ...">. The modifier classes are the daemon's,
  // rule for rule (ux.ts:353-358): 23 isSubtle and 41 size/weight occurrences
  // across the four real records, so dropping them would flatten the emphasis the
  // author actually wrote.
  `if(t==='TextBlock'){` +
  `var tc='ux-text';` +
  `if(el.weight==='bolder')tc+=' ux-bolder';` +
  `if(el.weight==='lighter')tc+=' ux-lighter';` +
  `if(el.isSubtle===true)tc+=' ux-subtle';` +
  `if(el.size!=null)tc+=' ux-size-'+el.size;` +
  `if(el.color!=null)tc+=' ux-color-'+el.color;` +
  `return uxTextNode('p',tc,el.text);}` +

  // Container -> <div class="ux-container">children</div>
  `if(t==='Container'){var ct=uxEl('div','ux-container');uxAppendKids(ct,el,depth);return ct;}` +

  // ColumnSet -> <div class="ux-columnset">columns</div>. The CSS makes this a
  // flex row, so the columns sit SIDE BY SIDE — the most layout-dependent thing a
  // card expresses, and a vertical stack would misrepresent it.
  `if(t==='ColumnSet'){var cs=uxEl('div','ux-columnset');uxAppendKids(cs,el,depth);return cs;}` +

  // Column -> <div class="ux-column" style="flex:N 1 0">. Mirrors ux.ts:366: a
  // digits-only width becomes the flex grow factor, anything else falls back to
  // the constant 1, and an absent width sets no style at all. The grow factor is
  // the ONLY attribute value derived from the record anywhere in this renderer,
  // it is an integer or the literal 1, and it can never be record TEXT.
  `if(t==='Column'){var cw=uxEl('div','ux-column');` +
  `if(el.width!=null){var n=/^[0-9]+$/.test(String(el.width))?parseInt(String(el.width),10):1;` +
  `cw.style.flex=n+' 1 0';}` +
  `uxAppendKids(cw,el,depth);return cw;}` +

  // Image -> a PLACEHOLDER. The url is SHOWN and never fetched: no `img` element
  // is created and no `src` is set, so there is no code path that could reach the
  // network even if the CSP allowed it. This is the element where a renderer would
  // most naturally reach out, which is why ac5 is structural here rather than a
  // promise. Note what is deliberately NOT mirrored: the daemon sets
  // aria-label/title attributes from record text because a standalone file has no
  // other channel, while here the same strings are written as visible TEXT — so no
  // attribute is ever built from record content.
  `if(t==='Image'){var im=uxEl('div','ux-image');` +
  `var ic=uxTextNode('span','ux-image__icon','\u25a3');ic.setAttribute('aria-hidden','true');im.appendChild(ic);` +
  `var mt=uxEl('span','ux-image__meta');` +
  `mt.appendChild(uxTextNode('span','ux-image__alt',el.altText!=null?el.altText:'image'));` +
  `mt.appendChild(uxTextNode('span','ux-image__url',el.url));` +
  `im.appendChild(mt);return im;}` +

  // Input.Text -> a non-interactive field affordance. No `input` element: the
  // placeholder is TEXT inside a styled span, so the mock cannot be typed into and
  // cannot be mistaken for a working control.
  `if(t==='Input.Text'){var fl=uxEl('label','ux-field');` +
  `fl.appendChild(uxTextNode('span','ux-label',el.label!=null?el.label:el.id));` +
  `fl.appendChild(uxTextNode('span',el.isMultiline===true?'ux-input ux-input--multi':'ux-input',` +
  `el.placeholder!=null?el.placeholder:''));` +
  `return fl;}` +

  // Input.ChoiceSet -> each choice as text with its mark. No select, no option.
  // The mark distinguishes multi-select from single, as the daemon's does.
  `if(t==='Input.ChoiceSet'){var cf=uxEl('div','ux-field');` +
  `cf.appendChild(uxTextNode('span','ux-label',el.label!=null?el.label:el.id));` +
  `var ch=uxEl('div','ux-choices');` +
  `(Array.isArray(el.choices)?el.choices:[]).forEach(function(c){` +
  `var sp=uxEl('span','ux-choice');` +
  `var mk=uxTextNode('span','ux-choice__mark',el.isMultiSelect===true?'\u2610':'\u25cb');` +
  `mk.setAttribute('aria-hidden','true');sp.appendChild(mk);` +
  `uxText(sp,c&&c.title!=null?c.title:'');` +
  `ch.appendChild(sp);});` +
  `cf.appendChild(ch);return cf;}` +

  // ActionSet -> non-interactive chips. Submit and OpenUrl must be TELLABLE
  // APART — a reviewer needs to know which control commits and which navigates —
  // which is the correction ux.ts:393-399 records. No anchor and no href is
  // created: an OpenUrl shows its url as TEXT.
  `if(t==='ActionSet'){var as=uxEl('div','ux-actions');` +
  `(Array.isArray(el.actions)?el.actions:[]).forEach(function(a){` +
  `var isLink=a&&a.type==='Action.OpenUrl';` +
  `var bt=uxEl('span',isLink?'ux-btn ux-btn--link':'ux-btn ux-btn--submit');` +
  `uxText(bt,a&&a.title!=null?a.title:'');` +
  // An OpenUrl's TARGET is SHOWN, as a visible text node. The daemon carries it in
  // `title=` because a standalone file has no other channel, and mirroring that
  // would make it the only attribute in this renderer built from record text — so
  // ac5 stays ABSOLUTE and the url becomes visible CONTENT instead. The deciding
  // reason is this Story's own binding check: a tooltip cannot be read in a
  // screenshot, and the t3/t7 visual reads are what this Story cannot ship without.
  //
  // This is the ONE place the client's structure diverges from the daemon's, by
  // exactly one text node inside a ux-btn--link. The parity test STATES that
  // divergence and asserts it is that node and nothing else.
  // The url is its own ELEMENT, not a second text node. Two adjacent text nodes
  // merge into ONE anonymous flex item, so the chip's `gap` never applied between
  // them and the title ran straight into the url — 'Open the source
  // documenthttps://example.invalid/doc'. Caught by the t3 visual read, which is
  // exactly the class of defect no DOM assertion can see.
  `if(isLink){bt.appendChild(uxTextNode('span','ux-btn__url',a.url!=null?a.url:''));` +
  `var gl=uxTextNode('span','ux-btn__glyph','\u2197');` +
  `gl.setAttribute('aria-hidden','true');bt.appendChild(gl);}` +
  `as.appendChild(bt);});` +
  `return as;}` +

  // An element whose `type` is outside the union — a card authored against a newer
  // Adaptive Cards feature, or a producer that gains an element type before this
  // renderer does. It renders a VISIBLE ux-unknown NAMING the type. NOT a bare
  // `default` returning nothing: that silent fall-through is what this Epic has
  // already shipped once, and a reviewer must never approve a design with an
  // invisible hole in it.
  `return uxTextNode('div','ux-unknown','unrenderable element: '+t);}` +

  // --- children --------------------------------------------------------------
  `function uxAppendKids(host,el,depth){` +
  `uxKids(el).forEach(function(k){host.appendChild(uxElement(k,depth+1));});}` +

  // --- the card --------------------------------------------------------------
  // sc2's StructuredRenderer shape: { el, degradation? }. `degradation` stays
  // ABSENT — a card that cannot be drawn at all is the slot's 'unshowable' (t5),
  // and an element that cannot be drawn degrades in place above. Never throws: a
  // non-array body yields an empty card rather than taking the document down over
  // an adjunct.
  `function uxRenderCard(record){` +
  `var card=uxEl('div','ux-card');` +
  `var body=(record&&Array.isArray(record.body))?record.body:[];` +
  `body.forEach(function(e){card.appendChild(uxElement(e,1));});` +
  `return {el:card};}` +

  // --- sc4: the EXPERIENCE SLOT (S004/t5) ------------------------------------
  // Mirrors S003's dgPickRef / dgBuildDiagramSlot almost line for line, which is
  // the point: the two slots are peers in one region and must fail the same way.
  // Still INERT — t6 adds the single mount call.

  // The experience ref is the first `ux-mock` companion. This and dgPickRef
  // PARTITION the companions array: diagram kinds there, ux-mock here, and
  // CompanionKind has no fourth member — so no ref can feed both slots and none is
  // silently dropped. Matching loosely would hand the mock a diagram's label and
  // link-out, producing a slot that renders, looks right, and points the reviewer
  // at the wrong companion.
  `function uxPickRef(companions){` +
  `if(!companions||!(companions instanceof Array))return undefined;` +
  `for(var i=0;i<companions.length;i++){var c=companions[i];` +
  `if(c&&typeof c==='object'&&c.kind==='ux-mock')return c;}` +
  `return undefined;}` +

  `function uxLinkOut(ref){` +
  `if(!ref||typeof ref.relPath!=='string'||ref.relPath.length===0)return undefined;` +
  `return {relPath:ref.relPath,title:(typeof ref.title==='string'&&ref.title.length>0)?ref.title:ref.relPath};}` +

  // A record is DRAWABLE only if it is a card with a non-empty body. `body: []` and
  // a malformed record are both ABSENT, matching the undefined-or-empty convention
  // the other slots use.
  `function uxDrawable(record){` +
  `return !!(record&&typeof record==='object'&&Array.isArray(record.body)&&record.body.length>0);}` +

  `function uxBuildMockSlot(record,ref,anchorSlug){` +
  // THE ABSENT GATE COMES FIRST and returns before a single element is created, so
  // "no slot" is provable as the ABSENCE OF DOM ACTIVITY rather than as the absence
  // of something visible. This is the dominant path by a wide margin: 4 of 645
  // ledger bodies carry a uxDefinition at all.
  `var drawable=uxDrawable(record);` +
  `if(!drawable&&!ref)return {state:'absent'};` +
  `var label=(ref&&typeof ref.title==='string'&&ref.title.length>0)?ref.title:UX_LABEL_DEFAULT;` +
  `var link=uxLinkOut(ref);` +
  `if(!drawable){` +
  // A ref with no record this surface can draw from. The reason NAMES what was
  // referenced rather than failing generically, because a silent omission is
  // indistinguishable from a document that legitimately has no mock.
  `return {state:'unshowable',kind:'experience',label:label,reason:'its experience record is not available to this surface',linkOut:link,anchorSlug:anchorSlug};}` +
  // A renderer throw must never take the document down over an adjunct — k4 — so
  // the construction is wrapped and degrades to the same stated failure.
  `var built=null;try{built=uxRenderCard(record);}catch(err){built=null;}` +
  `if(!built||!built.el){` +
  `return {state:'unshowable',kind:'experience',label:label,reason:'the experience record could not be drawn',linkOut:link,anchorSlug:anchorSlug};}` +
  `var out={state:'rendered',kind:'experience',label:label,body:built.el,anchorSlug:anchorSlug};` +
  `if(link)out.linkOut=link;` +
  `return out;}`;

// ---------------------------------------------------------------------------
// sc4 (S003/t3) — THE COMPANION VISUAL SLOT. Owned by s3, consumed by s3 and s4.
//
// s4 dependsOn s3, which makes s3 the nearest common ancestor of the two visual
// Stories and therefore the owner of the frame they share. It exists so S003's
// diagram and S004's experience mock are labelled peers in one layout and share
// one failure presentation, and so k3's never-reserve-space rule is expressed
// ONCE: no record, no slot, no frame, no fetch.
//
// Types only here. The diagram's own layout, sizing, theming and SVG primitives
// stay private to s3 (t4/t5), so s4 reuses this frame without inheriting a single
// diagram-specific decision.
// ---------------------------------------------------------------------------

/** One companion reference, derived off the daemon's projected shape rather than
 *  re-imported, so this file stays one declaration deep from `ArtifactReviewView`
 *  exactly as DocsContent and the protocol variant do. */
export type CompanionRef = NonNullable<DocsContent['companions']>[number];

/** The companion kinds a document can reference — the daemon's CLOSED union,
 *  read off the ref rather than restated, so adding a member upstream surfaces
 *  here as a compile error instead of an unlabelled slot. */
export type CompanionRefKind = CompanionRef['kind'];

/**
 * Which visual a slot holds. COLLAPSES the three companion kinds onto two
 * reviewer-facing labels: both diagram kinds map to 'diagram', the mock maps to
 * 'experience'. S004 reads the label from here rather than deciding its own,
 * which is how "tell a mock apart from a diagram" is met without a second
 * contract.
 */
export type CompanionVisualKind = 'diagram' | 'experience';

/** The link-out to the authentic generated companion file. The pane NEVER reads
 *  or embeds `relPath`'s content — it only offers it. That is what keeps a
 *  3.3 MB foreign scripted HTML file, and the path-traversal surface of reading
 *  an arbitrary body-supplied path, outside this surface entirely. */
export interface CompanionLinkOut {
  readonly relPath: string;
  readonly title: string;
}

/**
 * EXACTLY THREE STATES, and the shape of the union is the enforcement:
 *
 *   'rendered'   — a visual was built from a record present on the document.
 *   'unshowable' — a companion was REFERENCED and could not be drawn, named.
 *   'absent'     — no slot at all.
 *
 * `absent` carries NO other member by construction. There is nothing to label,
 * nothing to link and nothing to size, so a caller cannot reserve space for a
 * companion that does not exist even by mistake — k3 becomes a type guarantee
 * rather than a convention a later Story has to remember.
 *
 * `linkOut` is optional on BOTH non-absent states, a deliberate widening of the
 * HLD sketch: the reviewer whose diagram could not be drawn is precisely the one
 * who most needs the authentic file, so withholding the link in the failure state
 * would be exactly the wrong way round.
 *
 * `body` is `unknown`, not HTMLElement, matching the shipped StructuredRenderer<T>
 * above. The renderers live in an exported SOURCE STRING with no TypeScript
 * boundary of its own and are tested against DOM stubs that are deliberately not
 * HTMLElements; an element bound here would be a type the implementation could
 * not honestly satisfy.
 */
export type CompanionSlotState =
  | {
      readonly state: 'rendered';
      readonly kind: CompanionVisualKind;
      readonly label: string;
      readonly body: unknown;
      readonly linkOut?: CompanionLinkOut | undefined;
    }
  | {
      readonly state: 'unshowable';
      readonly kind: CompanionVisualKind;
      readonly label: string;
      readonly reason: string;
      readonly linkOut?: CompanionLinkOut | undefined;
    }
  | { readonly state: 'absent' };

/**
 * Build a slot from a structured record plus the ref that may accompany it.
 *
 * The record decides whether anything can be DRAWN; the ref decides whether a
 * failure must be DECLARED, since a ref is the only evidence a visual was meant
 * to exist. A factory never throws: a malformed record, a dangling reference or a
 * renderer failure all resolve to 'unshowable', because taking the document down
 * over an adjunct would invert the rule that the body stays authoritative.
 */
export interface CompanionSlotFactory<TRecord> {
  readonly kind: CompanionVisualKind;
  build(
    record: TRecord | undefined,
    ref: CompanionRef | undefined,
    anchorSlug: string | undefined,
  ): CompanionSlotState;
}

/**
 * The reviewer-facing label for a companion kind, DERIVED from the ref and never
 * guessed. Exhaustive over the closed union with a `never` witness in the final
 * branch: adding a companion kind upstream makes this fail to compile rather than
 * silently producing an unlabelled slot. Deliberately NO bare `default` — a bare
 * default is what defeats exhaustiveness checking, and it has produced exactly
 * that class of silent fall-through on this Epic's surfaces before.
 */
export function companionVisualKind(kind: CompanionRefKind): CompanionVisualKind {
  switch (kind) {
    case 'diagram-mermaid':
    case 'diagram-html':
      return 'diagram';
    case 'ux-mock':
      return 'experience';
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/** Escape a value for safe embedding in an HTML attribute / the CSP meta content. */

export function createDocsReviewHost(deps: DocsReviewHostDeps): DocsReviewHost {
  const log = deps.logger ?? NOOP_LOGGER;
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
  // The same guard for the opened DOCUMENT: two quick opens must show the one requested
  // LAST, not whichever content IPC completes last. A separate counter from refreshSeq,
  // because a list refresh (every decision triggers one) must not discard an open.
  let openSeq = 0;
  // Story E202610138d4b90c9:S001: the document the pane shows. A decision is acted on for
  // this document only and is sent, like its re-read, by its path, never by its id, so
  // neither depends on the document still being pending.
  let opened: OpenDocument | undefined;
  // The nonce of the shell last rendered: an HTML companion's scripts run in its frame only
  // when they carry it.
  let shellNonce = '';
  // Story E202610131f74c81f:S001: the watch on the open document's files, named by the
  // document it is for; the quiet period running after a change; how many decisions are in
  // flight; and whether a change arrived while one was.
  let watch: { readonly key: string; dispose(): void } | undefined;
  let quiet: { cancel(): void } | undefined;
  let deciding = 0;
  let changedWhileDeciding = false;
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    return { cancel: () => clearTimeout(t) };
  });

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
      postUnavailable(err);
    }
  }

  /** A failed pending read: an empty list plus the inline unavailable notice. */
  function postUnavailable(err: unknown): void {
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

  /**
   * E2 S004 — openArtifact's own pending read. It bumps refreshSeq so a refresh
   * already in flight (open()'s, or the boot ping's) is dropped, and posts the
   * list from this answer while no newer refresh has started. Pending or
   * read-only is decided from this answer either way, so a later refresh that
   * supersedes it cannot turn a pending artifact read-only.
   */
  async function openArtifactFrom(target: { readonly artifactId: string; readonly mdPath: string }): Promise<void> {
    const mySeq = ++refreshSeq;
    let summary: DocsArtifactSummary | undefined;
    try {
      const artifacts = await deps.client.pending();
      if (mySeq === refreshSeq) {
        pending.clear();
        for (const a of artifacts) pending.set(a.id, a);
        post({ type: 'docs-list', artifacts });
      }
      summary = artifacts.find((a) => a.id === target.artifactId);
    } catch (err) {
      if (mySeq === refreshSeq) postUnavailable(err);
    }
    if (disposed) return;
    if (summary !== undefined) void openDoc(target.artifactId, { kind: summary.kind, reveal: true });
    else void openDoc(target.artifactId, { path: target.mdPath, readOnly: true, reveal: true });
  }

  /**
   * Derive the section index for an opened document. A throw here is NOT fatal:
   * the body still renders, it just has no navigation, so this degrades to an
   * empty index plus a notice rather than refusing to open the document. That is
   * the same rule the body renderer follows — degraded means less, never blank.
   *
   * Which document's message is posted at all is openDoc's concern (its openSeq
   * guard drops a superseded open). What this guarantees is narrower: the index
   * and the markdown ride one message, so they can never disagree.
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

  /** End the watch and anything waiting on it. A disposer that throws is logged. */
  function dropWatch(): void {
    quiet?.cancel();
    quiet = undefined;
    changedWhileDeciding = false;
    const w = watch;
    watch = undefined;
    if (w === undefined) return;
    try {
      w.dispose();
    } catch (err) {
      log.warn(`[docs-review] the watch on the open document could not be ended: ${String(err)}`);
    }
  }

  /** After a change: one re-read of the list and the document, once the files have been quiet. */
  function startQuiet(): void {
    quiet?.cancel();
    quiet = setTimer(() => {
      quiet = undefined;
      void refreshPending().then(() => reopen({ changed: true }));
    }, RELOAD_QUIET_MS);
  }

  /**
   * The ONE place the open document's record is assigned, so the watch always follows it:
   * kept when the same document is read again (ending and restarting it could miss a change
   * in between), replaced for another document, and ended when the record is cleared.
   */
  function setOpened(next: OpenDocument | undefined): void {
    opened = next;
    const key = next !== undefined && next.docPath !== undefined ? `${next.artifactId}\n${next.docPath}` : undefined;
    if (key === watch?.key) return;
    dropWatch();
    if (key === undefined || next === undefined || next.docPath === undefined || deps.watchDocument === undefined) return;
    try {
      // The markdown, and the artifact's record: a comment saved by another tool changes only the record.
      const w = deps.watchDocument([next.docPath, `.insrc/artifacts/${next.artifactId}.json`], () => {
        if (disposed || watch?.key !== key) return; // a watch the host no longer holds
        // During a decision the change is remembered; it is acted on when the decision settles.
        if (deciding > 0) changedWhileDeciding = true;
        else startQuiet();
      });
      watch = { key, dispose: () => w.dispose() };
    } catch (err) {
      log.warn(`[docs-review] ${next.docPath} is not watched for changes: ${String(err)}`);
    }
  }

  /**
   * Open one document. A list-row open passes no options; openArtifact passes the
   * kind from its own pending read, or, for an artifact not awaiting review, the
   * docs/ path to read and readOnly, which the webview shows with no decision control.
   */
  async function openDoc(
    artifactId: string,
    opts: { readonly kind?: string; readonly path?: string; readonly readOnly?: boolean; readonly reveal?: boolean; readonly changed?: boolean } = {},
  ): Promise<void> {
    // reveal: the reviewer asked for this document, so the pane brings it into view. Absent on
    // every re-read, which must never move the reviewer. changed: the re-read was started by
    // the watch.
    const marks = { ...(opts.reveal === true ? { reveal: true } : {}), ...(opts.changed === true ? { changed: true } : {}) };
    const commentable = COMMENTABLE_KINDS.has(opts.kind ?? pending.get(artifactId)?.kind ?? '');
    const readOnly = opts.readOnly === true ? { readOnly: true } : {};
    const mySeq = ++openSeq;
    try {
      const content = await deps.client.content(opts.path ?? artifactId);
      if (mySeq !== openSeq) return; // superseded by a newer open — drop this response
      const docPath = content.docPath !== undefined && content.docPath !== '' ? content.docPath : opts.path;
      const htmlCompanions = htmlCompanionsOf(content.companions);
      setOpened({
        artifactId,
        docPath,
        companions: htmlCompanions.map((c) => c.relPath),
        kind: opts.kind ?? pending.get(artifactId)?.kind ?? (opened?.artifactId === artifactId ? opened.kind : undefined),
        title: pending.get(artifactId)?.title ?? (opened?.artifactId === artifactId ? opened.title : undefined),
      });
      const documents: DocsDocumentTab[] = [
        { title: docPath !== undefined ? baseName(docPath) : 'Document', type: 'markdown', ...(docPath !== undefined ? { relPath: docPath } : {}) },
        ...htmlCompanions.map((c): DocsDocumentTab => ({ title: c.title, type: 'html', relPath: c.relPath })),
      ];
      // t5 — derive the index ONCE per opened document (not per interaction) and
      // post it on the SAME message as the markdown it came from. Deriving it
      // here, from `content.markdown`, is what makes the two inseparable.
      const { sections, degradation } = deriveSections(content.markdown);
      // The FIRST diagram-kind companion is this slot's ref; a ux-mock ref belongs
      // to the experience slot (S004) and is not this Story's to place.
      const diagramRef = (content.companions ?? []).find(
        (c) => c.kind === 'diagram-mermaid' || c.kind === 'diagram-html',
      );
      // S004/t1 — the experience slot's ref is the first ux-mock companion. The
      // two pickers PARTITION the companions array: diagram kinds above, 'ux-mock'
      // here, and CompanionKind has no fourth member, so no ref can feed both
      // slots and none is silently dropped.
      const uxRef = (content.companions ?? []).find((c) => c.kind === 'ux-mock');
      // One resolver over the index derived from THIS markdown, applied to both
      // refs — so the diagram and the mock resolve against the same section
      // identity rather than two.
      const resolveAnchor = createSectionResolver(sections);
      const diagramAnchorSlug = resolveAnchor(diagramRef?.ofSectionId);
      const experienceAnchorSlug = resolveAnchor(uxRef?.ofSectionId);
      post({
        type: 'docs-content',
        artifactId,
        markdown: content.markdown,
        openQuestions: content.openQuestions,
        blocked: content.blocked,
        commentable,
        ...readOnly,
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
        // S003/t2 — the diagram records and the companion refs ride the SAME
        // message, forwarded by REFERENCE on exactly the terms above: no clone,
        // no reshaping, no defaulting, no validation. The read path does not
        // validate either (validateErDefinition runs at ASSEMBLY inside the
        // generating workflow), so a malformed record arrives here intact and the
        // webview renderer is what must shape-check before it draws.
        //
        // Conditionally spread, so an absent record stays an ABSENT KEY across
        // the postMessage boundary rather than a key holding undefined — the same
        // single absence test (`=== undefined`) on both sides.
        ...(content.erDefinition !== undefined
          ? { erDefinition: content.erDefinition }
          : {}),
        ...(content.sequenceDefinition !== undefined
          ? { sequenceDefinition: content.sequenceDefinition }
          : {}),
        ...(content.companions !== undefined
          ? { companions: content.companions }
          : {}),
        // S003/t6 — resolve the diagram ref's ofSectionId HERE, with sc3's shipped
        // resolver over the index derived from THIS markdown, and post the slug.
        // Resolving in the webview would have to re-implement slugify and the
        // title-alias rule, minting a second section identity; this consumes the
        // one that already exists. An unresolvable id yields undefined and the slot
        // falls back to its default position rather than being dropped.
        ...(diagramAnchorSlug !== undefined ? { diagramAnchorSlug } : {}),
        // S004/t1 — the experience record rides THIS message on exactly the terms
        // its five siblings do: forwarded by REFERENCE, no clone, no reshaping, no
        // defaulting, no validation. Not validated here deliberately —
        // validateUxDefinition has two non-test call sites (artifact assembly and
        // the ux code-review dimension) and NEITHER is on the read path, so a
        // malformed record arrives intact and the webview renderer is what must
        // shape-check before it draws.
        ...(content.uxDefinition !== undefined
          ? { uxDefinition: content.uxDefinition }
          : {}),
        ...(experienceAnchorSlug !== undefined ? { experienceAnchorSlug } : {}),
        // Story E202610138d4b90c9:S001 — the saved comments and what the pane needs to
        // save new ones, forwarded by reference like the records above, and one entry per
        // document of the artifact.
        ...(content.docPath !== undefined ? { docPath: content.docPath } : {}),
        ...(content.contentVersion !== undefined ? { contentVersion: content.contentVersion } : {}),
        ...(content.feedback !== undefined ? { feedback: content.feedback } : {}),
        ...(content.reviewer !== undefined ? { reviewer: content.reviewer } : {}),
        ...(content.state !== undefined ? { state: content.state } : {}),
        documents,
        ...marks,
      });
    } catch (err) {
      log.warn(`[docs-review] content ${artifactId} failed: ${String(err)}`);
      // A superseded open's failure is not the CURRENT document's failure: posting it
      // would replace the document the reviewer is on with another one's error.
      if (mySeq !== openSeq) return;
      // The pane now shows this failure. A failed re-read of the open document keeps what
      // the host knows of it; a failed open of another one leaves nothing open.
      if (opened?.artifactId !== artifactId) setOpened(undefined);
      // A content-load failure means the reviewer never saw the body — suppress approve
      // (blocked:true) so the review gate is not defeated; request-changes stays available.
      post({
        type: 'docs-content',
        artifactId,
        markdown: `unavailable: ${errText(err)}`,
        openQuestions: [],
        blocked: true,
        commentable,
        ...readOnly,
        // An asked-for open that failed is shown where the reviewer will see it.
        ...(opts.reveal === true ? { reveal: true } : {}),
      });
    }
  }

  /**
   * Re-read the open document by its path, after the pending list was re-read: read-only
   * when it is no longer awaiting review. Used after a decision and when a rebuilt shell
   * sends its boot ping.
   */
  async function reopen(how: { readonly changed?: boolean } = {}): Promise<void> {
    const o = opened;
    if (o === undefined) return;
    const awaiting = pending.get(o.artifactId);
    const kind = awaiting?.kind ?? o.kind;
    if (o.docPath !== undefined) {
      await openDoc(o.artifactId, { path: o.docPath, ...(kind !== undefined ? { kind } : {}), readOnly: awaiting === undefined, ...how });
    } else if (awaiting !== undefined) {
      await openDoc(o.artifactId, how);
    }
  }

  /** A decision that was not recorded: one line for the pane. Nothing was written. */
  function refuse(artifactId: string, message: string): void {
    post({ type: 'docs-decision-result', artifactId, ok: false, message });
  }

  /** Hand the chat a decision message; whatever happens, the decision stays recorded. */
  function handOver(text: string): ChatHandOver {
    if (deps.notifyChat === undefined) return 'none';
    try {
      return deps.notifyChat(text);
    } catch (err) {
      log.warn(`[docs-review] the chat could not be told of a decision: ${String(err)}`);
      return 'failed';
    }
  }

  /**
   * Story E202610138d4b90c9:S001: one decision, one daemon call. The daemon records the
   * decision first and then the comments, so nothing here is done in two steps. It is acted
   * on for the open document only; approve and reject also need it to be awaiting review,
   * and send feedback does not.
   */
  async function decide(artifactId: string, decision: ReviewDecision, comments: readonly ReviewDecisionComment[]): Promise<void> {
    // A change to the document's files while this runs is remembered and acted on when it
    // settles, on every path: some of them do not read the document again themselves.
    deciding += 1;
    try {
      await decideNow(artifactId, decision, comments);
    } finally {
      deciding -= 1;
      if (deciding === 0 && changedWhileDeciding) {
        changedWhileDeciding = false;
        if (watch !== undefined) startQuiet();
      }
    }
  }

  async function decideNow(artifactId: string, decision: ReviewDecision, comments: readonly ReviewDecisionComment[]): Promise<void> {
    const o = opened;
    if (o === undefined || o.artifactId !== artifactId) {
      log.warn(`[docs-review] docs-decision: ${artifactId} is not the open document`);
      refuse(artifactId, 'Nothing was recorded: open the document before deciding on it.');
      void refreshPending();
      return;
    }
    if (decision !== 'feedback' && !pending.has(artifactId)) {
      log.warn(`[docs-review] docs-decision: ${artifactId} is not awaiting review`);
      refuse(artifactId, `Nothing was recorded: this document is not awaiting review, so it cannot be ${decision === 'approve' ? 'approved' : 'rejected'}. Feedback can still be sent.`);
      await refreshPending();
      await reopen();
      return;
    }
    if (o.docPath === undefined) {
      refuse(artifactId, "Nothing was recorded: the daemon did not name this document's path. Update the daemon and try again.");
      return;
    }
    let res: ReviewDecisionResult;
    try {
      res = await deps.client.decide(o.docPath, decision, comments);
    } catch (err) {
      log.warn(`[docs-review] decision ${artifactId} failed: ${String(err)}`);
      refuse(artifactId, `Nothing was recorded: ${errText(err)}`);
      // Re-fetch so the list reflects real approval state (k5 — never a client-side guess).
      // The document is re-read only when its place in the list changed, so a daemon that
      // is down does not replace the document the reviewer is on with an error.
      const was = pending.has(artifactId);
      await refreshPending();
      if (pending.has(artifactId) !== was) await reopen();
      return;
    }
    const chat = handOver(decisionChatMessage(o, res, comments));
    post({
      type: 'docs-decision-result',
      artifactId,
      ok: true,
      outcome: res.outcome,
      recorded: res.recorded,
      message: decisionResultLine(res, comments.length, chat),
    });
    await refreshPending();
    await reopen();
  }

  /**
   * Story E202610138d4b90c9:S001: the text of one HTML document of the open artifact, for
   * the pane's frame. Only a companion the open document lists is read. The frame inherits
   * the shell's CSP, so the page's scripts are given the shell's nonce. Any other path, an
   * absent reader or a failed read is answered with no html, and the pane shows the path.
   */
  async function openCompanion(artifactId: string, relPath: string): Promise<void> {
    const o = opened;
    let html: string | undefined;
    if (o === undefined || o.artifactId !== artifactId || !o.companions.includes(relPath)) {
      log.warn(`[docs-review] open-companion: ${relPath} is not a document of the open artifact`);
    } else if (deps.readCompanion !== undefined) {
      try {
        const text = await deps.readCompanion(relPath);
        if (typeof text === 'string') html = stampScriptNonce(text, shellNonce);
      } catch (err) {
        log.warn(`[docs-review] companion ${relPath} could not be read: ${String(err)}`);
      }
    }
    post({ type: 'docs-companion', artifactId, relPath, ...(html !== undefined ? { html } : {}) });
  }

  const renderShell = (): string => {
    const nonce = genNonce();
    shellNonce = nonce;
    // Story E202610138d4b90c9:S001 — the pane's own style. Every colour, font and border is
    // a VS Code theme variable, so the pane follows whichever theme is active and has no
    // switch of its own. The `--it-*` tokens the body, functional-requirement, diagram and
    // experience rules below are written in are DEFINED here from theme variables, so those
    // rules are unchanged. No literal colour anywhere: a hex or a colour name would be
    // wrong in one theme or another.
    //
    // LAYOUT: the body is a column the height of the pane. The header and the comment
    // panel take their own height and `.rv-scroll` takes the rest; it is the ONLY element
    // that scrolls, which is what keeps the comment panel in view at every scroll position.
    const style = `<style>` +
      `html,body{height:100%;margin:0;}*{box-sizing:border-box;}` +
      `body{` +
      `--it-bg:var(--vscode-editor-background);--it-fg:var(--vscode-editor-foreground);` +
      `--it-dim:var(--vscode-descriptionForeground);--it-accent:var(--vscode-textLink-foreground);` +
      `--it-warn:var(--vscode-editorWarning-foreground);--it-err:var(--vscode-errorForeground);` +
      `--it-ok:var(--vscode-charts-green);--it-sel:var(--vscode-editor-selectionBackground);` +
      `--it-border:var(--vscode-panel-border);--it-font:var(--vscode-font-family);` +
      `display:flex;flex-direction:column;overflow:hidden;padding:0;` +
      `background:var(--vscode-editor-background);color:var(--vscode-foreground);` +
      `font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);line-height:1.5;}` +
      `.rv-dim{color:var(--vscode-descriptionForeground);}.rv-sp{flex:1;}` +
      `.rv-badge{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:10px;padding:0 7px;font-size:11px;}` +
      // The header: which document, its kind and its state.
      `.rv-head{flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:6px 14px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);}` +
      `.rv-title{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:50%;}` +
      // The two views. Each fills the pane; the script shows one of them.
      `.rv-listview,.rv-docview{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}` +
      // The list view: a toolbar and a pager that keep their own height, and between them
      // the table, which is the view's one scrolling region. Its header row stays at the
      // top of that region.
      `.rv-tool{flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:8px 14px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);}` +
      `.rv-tool input{flex:1 1 220px;min-width:0;max-width:520px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:12px;padding:4px 10px;font:inherit;outline:none;}` +
      `.rv-tool input:focus{border-color:var(--vscode-focusBorder);}` +
      `.rv-tool input::placeholder{color:var(--vscode-input-placeholderForeground);}` +
      `.rv-tool select{background:var(--vscode-dropdown-background);color:var(--vscode-dropdown-foreground);border:1px solid var(--vscode-dropdown-border);border-radius:2px;padding:3px 6px;font:inherit;}` +
      `.rv-listnote{flex:0 0 auto;padding:10px 14px;color:var(--vscode-descriptionForeground);}` +
      `.rv-listnote.rv-err{color:var(--vscode-errorForeground);}` +
      `.rv-tablewrap{flex:1 1 auto;min-height:0;overflow-y:auto;}` +
      `.rv-table{width:100%;border-collapse:collapse;}` +
      `.rv-table th{position:sticky;top:0;text-align:left;font-weight:600;font-size:12px;padding:6px 14px;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);}` +
      `.rv-table td{padding:5px 14px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top;}` +
      `.rv-table tr:hover td{background:var(--vscode-list-hoverBackground);}` +
      `.rv-rowbtn{background:none;border:0;padding:0;font:inherit;color:var(--vscode-textLink-foreground);cursor:pointer;text-align:left;overflow-wrap:anywhere;}` +
      `.rv-rowbtn:hover{text-decoration:underline;}` +
      `.rv-rowbtn:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px;}` +
      `.rv-idcell{color:var(--vscode-descriptionForeground);font-family:var(--vscode-editor-font-family);font-size:12px;white-space:nowrap;}` +
      `.rv-numcell{text-align:right;white-space:nowrap;}` +
      `.rv-pager{flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:10px;padding:6px 14px;border-top:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);font-size:12px;}` +
      // One tab per document of the artifact: the markdown, then each HTML document.
      `.rv-tabs{display:flex;gap:2px;flex-wrap:wrap;}` +
      `.rv-tab{background:none;color:var(--vscode-descriptionForeground);border:0;border-bottom:2px solid var(--vscode-sideBar-background);border-radius:0;padding:3px 8px;font:inherit;cursor:pointer;}` +
      `.rv-tab.rv-on{color:var(--vscode-foreground);border-bottom-color:var(--vscode-focusBorder);}` +
      `.rv-tab:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px;}` +
      // An HTML document fills the region: its path, a line when it cannot be shown, and
      // the frame that holds the page.
      `.rv-html{height:100%;display:flex;flex-direction:column;gap:6px;padding:8px 14px 10px;}` +
      `.rv-html-note{color:var(--vscode-descriptionForeground);}` +
      `.rv-frame-host{flex:1 1 auto;min-height:0;}` +
      // The page in the frame is a STANDALONE document with its own palette, written for
      // a light page, and most set no background of their own: over the pane's dark
      // editor background their dark text would be unreadable. So the frame is given the
      // system's own page colour for a light scheme (`Canvas`), which is what such a page
      // gets when it is opened by itself. A system colour, not a literal one.
      `.rv-frame{display:block;width:100%;height:100%;border:1px solid var(--vscode-panel-border);border-radius:4px;color-scheme:light;background:Canvas;}` +
      // The document: the one scrolling region.
      `.rv-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;}` +
      `.rv-doc{position:relative;max-width:900px;margin:0 auto;padding:12px 56px 40px 28px;color:var(--vscode-editor-foreground);}` +
      `.insrc-docs-oq-item{color:var(--it-warn);margin:4px 0;}` +
      // The comment panel, styled as the chat panel's input: one rounded box holding the
      // field and round, icon-only buttons (the name is in the tooltip and the aria-label).
      `.rv-bar{flex:0 0 auto;border-top:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);padding:8px 14px 10px;}` +
      `.rv-meta{display:flex;gap:10px;align-items:center;margin-bottom:6px;font-size:12px;}` +
      `.rv-row{display:flex;gap:6px;align-items:flex-end;border:1px solid var(--vscode-input-border);border-radius:12px;background:var(--vscode-input-background);padding:6px 8px 6px 10px;}` +
      `.rv-row:focus-within{border-color:var(--vscode-focusBorder);}` +
      `.rv-row textarea{flex:1;min-width:0;resize:none;background:none;color:var(--vscode-input-foreground);border:0;outline:none;padding:5px 4px;font:inherit;line-height:1.5;}` +
      `.rv-row textarea::placeholder{color:var(--vscode-input-placeholderForeground);}` +
      `.rv-ic{width:30px;height:30px;padding:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;cursor:pointer;` +
      `background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-panel-border);}` +
      `.rv-ic:hover{background:var(--vscode-button-secondaryHoverBackground);}` +
      `.rv-ic:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px;}` +
      `.rv-ic:disabled{opacity:.45;cursor:default;}` +
      `.rv-ic svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;}` +
      `.rv-ic.rv-approve{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-button-background);}` +
      `.rv-ic.rv-approve:hover{background:var(--vscode-button-hoverBackground);}` +
      `.rv-ic.rv-reject{background:none;color:var(--vscode-errorForeground);border-color:var(--vscode-errorForeground);}` +
      `.rv-result{margin-top:6px;font-size:12px;min-height:18px;color:var(--vscode-descriptionForeground);}` +
      `.rv-result.rv-ok{color:var(--vscode-charts-green);}.rv-result.rv-err{color:var(--vscode-errorForeground);}` +
      // Inline comments. A marked passage, dashed while its comment is a draft; the round
      // button a selection offers; and the thread card under the passage's block.
      `mark.rv-anno{background:var(--vscode-editor-findMatchHighlightBackground);color:inherit;border-bottom:2px solid var(--vscode-editorWarning-foreground);border-radius:2px;cursor:pointer;}` +
      `mark.rv-anno.rv-draft{border-bottom-style:dashed;}` +
      `.rv-pop{position:absolute;z-index:5;display:none;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-editorWidget-border);box-shadow:0 2px 8px var(--vscode-widget-shadow);border-radius:16px;padding:3px;}` +
      `.rv-thread{margin:6px 0 10px;border:1px solid var(--vscode-editorWidget-border);border-radius:10px;overflow:hidden;background:var(--vscode-editorWidget-background);` +
      `color:var(--vscode-foreground);font-family:var(--vscode-font-family);font-size:13px;line-height:1.45;white-space:normal;}` +
      `.rv-q{padding:6px 10px;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-editorWidget-border);font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}` +
      `.rv-c{padding:7px 10px;border-bottom:1px solid var(--vscode-editorWidget-border);}` +
      `.rv-who{font-weight:600;}` +
      `.rv-tag{color:var(--vscode-descriptionForeground);font-size:11px;margin-left:6px;}` +
      `.rv-tag-draft{color:var(--vscode-editorWarning-foreground);}` +
      `.rv-text{white-space:pre-wrap;overflow-wrap:anywhere;}` +
      `.rv-x{float:right;background:none;color:var(--vscode-descriptionForeground);border:0;padding:0 4px;cursor:pointer;font:inherit;}` +
      `.rv-compose{padding:6px 8px;display:flex;gap:6px;align-items:center;}` +
      `.rv-compose textarea{flex:1;min-width:0;resize:none;height:30px;background:none;color:var(--vscode-input-foreground);border:0;outline:none;padding:5px 4px;font:inherit;line-height:1.5;}` +
      `.rv-ic.rv-sm{width:24px;height:24px;}.rv-ic.rv-sm svg{width:13px;height:13px;}` +
      // Saved comments: when and with which decision; the margin marker beside a commented
      // passage; and the strip of those with no passage, whose list is capped and scrolls
      // on its own so a long history cannot take the document's room.
      `.rv-when{color:var(--vscode-descriptionForeground);font-size:11px;margin-left:6px;}` +
      `.rv-tag-approve{color:var(--vscode-charts-green);}.rv-tag-reject{color:var(--vscode-errorForeground);}` +
      `.rv-hq{color:var(--vscode-descriptionForeground);font-style:italic;overflow-wrap:anywhere;}` +
      `.rv-marker{position:absolute;right:6px;height:22px;min-width:34px;padding:0 6px;display:flex;align-items:center;justify-content:center;gap:3px;font:inherit;font-size:11px;border-radius:11px;cursor:pointer;` +
      `background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-editorWidget-border);}` +
      `.rv-marker svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linejoin:round;}` +
      `.rv-marker.rv-draft{border-color:var(--vscode-editorWarning-foreground);color:var(--vscode-editorWarning-foreground);}` +
      `.rv-hist{flex:0 0 auto;border-top:1px solid var(--vscode-panel-border);background:var(--vscode-sideBar-background);}` +
      `.rv-hist summary{padding:5px 14px;cursor:pointer;color:var(--vscode-descriptionForeground);font-size:12px;}` +
      `.rv-hist-list{max-height:170px;overflow-y:auto;border-top:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background);}` +
      // The rendered document reads as an editor preview: headings in the editor's own
      // foreground with a rule under the first two levels, code in the editor's font.
      `#insrc-docs-body{font-size:14px;line-height:1.6;}` +
      `#insrc-docs-body h1,#insrc-docs-body h2,#insrc-docs-body h3,#insrc-docs-body h4,#insrc-docs-body h5,#insrc-docs-body h6{color:var(--vscode-editor-foreground);}` +
      `#insrc-docs-body h1,#insrc-docs-body h2{padding-bottom:4px;border-bottom:1px solid var(--vscode-panel-border);}` +
      `#insrc-docs-body code,#insrc-docs-body pre{font-family:var(--vscode-editor-font-family);}` +
      `#insrc-docs-body code{background:var(--vscode-textCodeBlock-background);border:0;color:var(--vscode-textPreformat-foreground);}` +
      `#insrc-docs-body pre{background:var(--vscode-textCodeBlock-background);}` +
      `#insrc-docs-body pre code{color:var(--vscode-editor-foreground);}` +
      `#insrc-docs-body th{background:var(--vscode-sideBar-background);}` +
      `#insrc-docs-body blockquote{border-left-color:var(--vscode-textBlockQuote-border);}` +
      `</style>`;
    // The markdown element rules the rendered body needs. renderStyle emits CSS
    // custom properties and surface classes only — no element rules — and the
    // .insrc-md stylesheet is not in scope on this surface, so they come from the
    // ONE shared rule set (markdown-style.ts) with this surface's own tokens.
    const mdStyle = `<style>${renderMarkdownStyle(DOCS_REVIEW_MARKDOWN_TOKENS)}` +
      // The plain-text fallback container: preserve the document's own newlines
      // (it is markdown source at that point) without the <pre> geometry.
      `.insrc-md a[data-url],.insrc-md a[data-path]{cursor:pointer;}` +
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
      `.insrc-fr{margin:6px 0;padding:0;list-style:none;}` +
      `.insrc-fr-item{border-left:2px solid var(--it-accent);padding:4px 0 4px 10px;margin:6px 0;white-space:normal;word-break:normal;}` +
      `.insrc-fr-id{display:block;color:var(--it-accent);font-family:var(--it-font);font-size:12px;}` +
      `.insrc-fr-stmt{display:block;color:var(--it-fg);font-family:var(--it-font);}` +
      `.insrc-fr-why{color:var(--it-dim);font-family:var(--it-font);font-size:12px;margin-top:3px;}` +
      `.insrc-fr-group-label{color:var(--it-fg);font-family:var(--it-font);font-weight:600;margin:12px 0 2px;}` +
      // S003/t4 — the diagram. `--it-*` variables ONLY, for the same reason the FR
      // block uses them: an undefined var() inside a shorthand invalidates the whole
      // declaration, which is how a border or a colour vanishes silently.
      //
      // SVG does NOT inherit `fill`/`stroke` from a font colour, so a box with no
      // explicit fill paints solid black and swallows its own labels. These rules are
      // therefore load-bearing rather than decorative, and t4 reads a screenshot to
      // confirm it — no assertion in the suite can see a black rectangle.
      `.insrc-dg{display:block;max-width:100%;margin:8px 0;overflow:visible;}` +
      `.insrc-dg-box{fill:var(--it-bg);stroke:var(--it-accent);stroke-width:1;}` +
      `.insrc-dg-box-rule{stroke:var(--it-accent);stroke-width:1;opacity:0.55;}` +
      `.insrc-dg-class{fill:var(--it-accent);font-family:var(--it-font);font-size:13px;font-weight:600;}` +
      `.insrc-dg-attr{fill:var(--it-fg);font-family:var(--it-font);font-size:11px;}` +
      `.insrc-dg-attr-dangling{fill:var(--it-dim);font-style:italic;}` +
      `.insrc-dg-edge-line{stroke:var(--it-dim);stroke-width:1;}` +
      `.insrc-dg-edge-return{stroke-dasharray:4 3;}` +
      `.insrc-dg-lifeline{stroke:var(--it-dim);stroke-width:1;opacity:0.35;stroke-dasharray:2 4;}` +
      `.insrc-dg-msg{fill:var(--it-fg);font-family:var(--it-font);font-size:11px;}` +
      `.insrc-dg-note{fill:var(--it-dim);font-family:var(--it-font);font-size:10px;}` +
      `.insrc-dg-rel{fill:var(--it-dim);font-family:var(--it-font);font-size:11px;}` +
      // The slot frame. `--it-*` only, and no shorthand carrying an undefined
      // var() — the S001 gotcha that makes a border vanish silently.
      `.insrc-dg-slot{border:1px solid var(--it-accent);border-radius:4px;padding:8px 10px;margin:10px 0;}` +
      `.insrc-dg-slot-head{color:var(--it-accent);font-family:var(--it-font);font-weight:600;font-size:12px;margin-bottom:6px;}` +
      `.insrc-dg-slot-why{color:var(--it-fg);font-family:var(--it-font);font-size:12px;white-space:normal;word-break:normal;}` +
      `.insrc-dg-slot-link{color:var(--it-dim);font-family:var(--it-font);font-size:11px;margin-top:6px;white-space:normal;word-break:break-word;}` +
      // S004/t2 — the experience mock. `--it-*` variables ONLY, and NO literal
      // colour anywhere: not a hex, not an rgb(), not a CSS colour name. This is
      // the one place the mirroring stops at structure. The daemon's UX_MOCK_STYLE
      // is a STANDALONE document's stylesheet and legitimately carries its own
      // palette (`.ux-subtle{color:#6b7684}` at ux.ts:436, among others); copying
      // that palette into a themed pane is the natural move and the wrong one — a
      // literal card background is invisible in a light theme and unreadable in a
      // high-contrast one. A card is almost entirely background, border and
      // subtle-text colour, so this matters more here than for the SVG diagram.
      // A mechanical scan enforces it, because the structural parity diff compares
      // tag, class and child order and is blind to style by design.
      //
      // GEOMETRY is mirrored from UX_MOCK_STYLE (ux.ts:425-473) — the flex row, the
      // gaps, the relative font sizes — because geometry is what makes the mock read
      // as an interface rather than a list. No shorthand carries an undefined var():
      // the S001 gotcha that makes a border vanish silently.
      `.ux-card{border:1px solid var(--it-border);border-radius:6px;padding:12px;font-family:var(--it-font);color:var(--it-fg);}` +
      `.ux-card>*+*{margin-top:10px;}` +
      `.ux-text{margin:0;white-space:normal;overflow-wrap:anywhere;}` +
      `.ux-bolder{font-weight:700;}.ux-lighter{font-weight:300;}` +
      `.ux-subtle{color:var(--it-dim);}` +
      `.ux-size-small{font-size:11px;}.ux-size-default{font-size:13px;}` +
      `.ux-size-medium{font-size:15px;}.ux-size-large{font-size:18px;}.ux-size-extraLarge{font-size:22px;}` +
      // The four Adaptive Cards colour roles map onto the theme ROLES rather than
      // onto a palette, so emphasis still means what the author meant in either
      // theme. Three map directly. `good` maps onto `--it-ok`, which this pane
      // defines from the theme's green (Story E202610138d4b90c9:S001). The fallback
      // to the accent is kept: a var() that resolved to nothing would silently drop
      // the declaration, which is how a border once vanished here.
      `.ux-color-accent{color:var(--it-accent);}.ux-color-good{color:var(--it-ok,var(--it-accent));}` +
      `.ux-color-warning{color:var(--it-warn);}.ux-color-attention{color:var(--it-err);}` +
      `.ux-container{border:1px solid var(--it-border);border-radius:5px;padding:10px;}` +
      `.ux-container>*+*{margin-top:10px;}` +
      // flex-direction stated EXPLICITLY rather than left to the row default. Not
      // redundancy: `display:flex` alone is satisfied by a column too, so without this
      // the only thing between a card and a vertically stacked ColumnSet was a
      // default — and a CSS-only mutation to `column` would leave every JS test green.
      // The build validation gate caught exactly that gap.
      `.ux-columnset{display:flex;flex-direction:row;gap:12px;align-items:flex-start;}` +
      `.ux-column{flex:1 1 0;min-width:0;}.ux-column>*+*{margin-top:10px;}` +
      `.ux-columnset:empty,.ux-container:empty{min-height:24px;}` +
      `.ux-image{display:flex;gap:10px;align-items:center;border:1px dashed var(--it-border);border-radius:5px;padding:8px;color:var(--it-dim);}` +
      `.ux-image__icon{font-size:18px;line-height:1;}` +
      `.ux-image__meta{display:flex;flex-direction:column;min-width:0;}` +
      `.ux-image__alt{font-size:12px;}` +
      `.ux-image__url{font-size:11px;color:var(--it-dim);overflow-wrap:anywhere;}` +
      `.ux-field{display:block;}` +
      `.ux-label{display:block;font-size:11px;font-weight:600;color:var(--it-fg);margin-bottom:3px;}` +
      `.ux-input{display:block;border:1px solid var(--it-border);border-radius:4px;padding:6px 8px;color:var(--it-dim);font-size:12px;min-height:30px;overflow-wrap:anywhere;}` +
      `.ux-input--multi{min-height:60px;}` +
      `.ux-choices{display:flex;flex-wrap:wrap;gap:14px;}` +
      `.ux-choice{display:inline-flex;align-items:center;gap:6px;font-size:12px;}` +
      `.ux-choice__mark{color:var(--it-dim);}` +
      `.ux-actions{display:flex;flex-wrap:wrap;gap:8px;padding-top:2px;}` +
      // A chip, deliberately NOT a button: the mock must not look clickable. The
      // submit/link distinction is carried by fill vs outline, so the two stay
      // tellable apart without colour alone doing the work.
      `.ux-btn{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--it-accent);border-radius:4px;padding:5px 10px;font-size:12px;font-weight:600;}` +
      `.ux-btn--submit{background:var(--it-accent);color:var(--it-bg);}` +
      `.ux-btn--link{color:var(--it-accent);}` +
      // The ONE client-only class in this fragment, and the only `ux-*` name not in
      // the daemon's stylesheet: the daemon has no url element because it puts the
      // url in `title=`. Dimmed and smaller so the chip still reads title-first.
      `.ux-btn__url{color:var(--it-dim);font-weight:400;overflow-wrap:anywhere;}` +
      `.ux-btn__glyph{font-weight:400;}` +
      // The visible admission of a gap. Dashed and in the error role, so it reads
      // as "this could not be drawn" and never as a design that simply has nothing
      // there — the whole point of refusing a bare `default`.
      `.ux-unknown{border:1px dashed var(--it-err);border-radius:5px;padding:8px;color:var(--it-err);font-size:11px;white-space:normal;}` +
      `</style>`;
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    const bootstrap =
      `const vs=acquireVsCodeApi();` +
      `const listEl=document.getElementById('insrc-docs-list');` +
      `const bodyEl=document.getElementById('insrc-docs-body');` +
      `const oqEl=document.getElementById('insrc-docs-oq');` +
      `const secEl=document.getElementById('insrc-docs-sections');` +
      `const noticeEl=document.getElementById('insrc-docs-notice');` +
      `const dgHostEl=document.getElementById('insrc-docs-diagram');` +
      `const uxHostEl=document.getElementById('insrc-docs-experience');` +
      // Story E202610138d4b90c9:S001 — the header and the comment panel. Every element is
      // in the shell's markup; the script only sets text, values and state on them.
      `const kindEl=document.getElementById('insrc-rv-kind');` +
      `const stateEl=document.getElementById('insrc-rv-state');` +
      `const whoEl=document.getElementById('insrc-rv-who');` +
      `const fieldEl=document.getElementById('insrc-rv-field');` +
      `const resultEl=document.getElementById('insrc-rv-result');` +
      `const scrollEl=document.getElementById('insrc-rv-scroll');` +
      `const btn={approve:document.getElementById('insrc-rv-approve'),reject:document.getElementById('insrc-rv-reject'),feedback:document.getElementById('insrc-rv-feedback')};` +
      // The tabs, and the two views of the region: the markdown document's hosts, and an
      // HTML document's path, note and frame.
      `const tabsEl=document.getElementById('insrc-rv-tabs');` +
      `const mdEl=document.getElementById('insrc-rv-md');` +
      `const htmlEl=document.getElementById('insrc-rv-html');` +
      `const htmlPathEl=document.getElementById('insrc-rv-html-path');` +
      `const htmlNoteEl=document.getElementById('insrc-rv-html-note');` +
      `const frameHostEl=document.getElementById('insrc-rv-frame');` +
      // Inline comments: the button a selection offers, and the line that counts the drafts.
      `const popEl=document.getElementById('insrc-rv-pop');` +
      `const popBtn=document.getElementById('insrc-rv-pop-btn');` +
      `const draftsEl=document.getElementById('insrc-rv-drafts');` +
      // The strip of saved comments that have no passage, above the comment panel.
      `const histEl=document.getElementById('insrc-rv-hist');` +
      `const histSumEl=document.getElementById('insrc-rv-hist-sum');` +
      `const histListEl=document.getElementById('insrc-rv-hist-list');` +
      // Story E202610131f74c81f:S001 — the two views, and the list view's controls.
      `const listViewEl=document.getElementById('insrc-rv-listview');` +
      `const docViewEl=document.getElementById('insrc-rv-docview');` +
      `const qEl=document.getElementById('insrc-rv-q');` +
      `const suggestEl=document.getElementById('insrc-rv-suggest');` +
      `const kindSelEl=document.getElementById('insrc-rv-kindsel');` +
      `const countEl=document.getElementById('insrc-rv-count');` +
      `const listNoteEl=document.getElementById('insrc-rv-listnote');` +
      `const prevEl=document.getElementById('insrc-rv-prev');` +
      `const nextEl=document.getElementById('insrc-rv-next');` +
      `const pageEl=document.getElementById('insrc-rv-page');` +
      `const backEl=document.getElementById('insrc-rv-back');` +
      `const titleEl=document.getElementById('insrc-rv-title');` +
      // items: the documents awaiting review. shown: the last docs-content message of the
      // document held.
      // busy: a decision was posted and its result has not arrived. sent: how many
      // comments that decision carried.
      `var items=[];var shown=null;var busy=false;var sent=0;` +
      // docs: the documents of the artifact shown. tab: the repo-relative path of the HTML
      // document on show, or '' for the markdown.
      `var docs=[];var tab='';` +
      `function rvOption(value,text){var o=document.createElement('option');o.value=value;o.textContent=text;return o;}` +
      `function rvKind(id){var i=id.indexOf('-');return i<0?id:id.slice(0,i);}` +
      `function rvSetResult(text,cls){resultEl.textContent=text;resultEl.className='rv-result'+(cls?' '+cls:'');}` +
      // Awaiting review: the document can be approved or rejected. A read-only open, or one
      // the daemon says is approved or rejected, takes feedback only.
      `function rvAwaiting(m){return !!m&&!!m.artifactId&&!m.readOnly&&(m.state===undefined||m.state==='pending');}` +
      `function renderBar(){var m=shown;var has=!!(m&&m.artifactId);var pend=rvAwaiting(m);` +
      `btn.feedback.disabled=busy||!has;` +
      `btn.reject.disabled=busy||!pend;` +
      // A blocked document was not seen in full, or its review stands against it: it is
      // not approvable from here.
      `btn.approve.disabled=busy||!pend||!!m.blocked;` +
      `btn.reject.style.display=(has&&!pend)?'none':'';btn.approve.style.display=(has&&!pend)?'none':'';` +
      `fieldEl.disabled=!has;` +
      `kindEl.textContent=has?rvKind(m.artifactId):'';kindEl.style.display=has?'':'none';` +
      `stateEl.textContent=!has?'':pend?(m.blocked?'pending review · blocked: it cannot be approved':'pending review'):` +
      `((m.state==='approved'?'approved':m.state==='rejected'?'rejected':'not awaiting review')+' · feedback only');` +
      `var r=m&&m.reviewer;whoEl.textContent=(r&&typeof r.name==='string')?('as '+r.name+(r.source==='git'?' (git user)':r.source==='os'?' (OS user)':'')):'';}` +
      // One decision: the button pressed, every inline draft, and the comment on the whole
      // document when there is one. Nothing is posted while an earlier decision is
      // unanswered, and send feedback with no comment at all posts nothing.
      `function rvSend(decision){if(busy||!shown||!shown.artifactId)return;` +
      // Every draft goes with the decision, then the comment on the whole document.
      `var text=String(fieldEl.value||'').trim();var comments=rvDraftComments();` +
      // On an HTML document's tab the comment is on that file: it names the file and has
      // no anchor and no version (the version is the markdown's). On the markdown it
      // carries the version the reviewer saw.
      `if(text){var c={comment:text};if(tab)c.file=tab;else if(typeof shown.contentVersion==='string')c.version=shown.contentVersion;comments.push(c);}` +
      `if(decision==='feedback'&&!comments.length){rvSetResult('Write a comment before sending feedback.','rv-err');return;}` +
      `busy=true;sent=comments.length;renderBar();rvSetResult('Sending…','');` +
      `vs.postMessage({v:1,payload:{type:'docs-decision',artifactId:shown.artifactId,decision:decision,comments:comments}});}` +
      `btn.approve.addEventListener('click',function(){rvSend('approve');});` +
      `btn.reject.addEventListener('click',function(){rvSend('reject');});` +
      `btn.feedback.addEventListener('click',function(){rvSend('feedback');});` +
      // The tabs: one per document, the markdown first. With one document there is
      // nothing to choose and no tab is shown. Titles are set as text.
      `function rvTabs(){while(tabsEl.firstChild)tabsEl.removeChild(tabsEl.firstChild);` +
      `tabsEl.style.display=docs.length>1?'':'none';if(docs.length<2)return;` +
      `docs.forEach(function(d){var rel=d.type==='html'?String(d.relPath||''):'';var on=rel===tab;` +
      `var b=document.createElement('button');b.className='rv-tab'+(on?' rv-on':'');b.textContent=String(d.title||rel||'Document');` +
      `b.setAttribute('type','button');b.setAttribute('role','tab');b.setAttribute('aria-selected',on?'true':'false');` +
      `if(rel)b.setAttribute('title',rel);` +
      `b.addEventListener('click',function(){rvShowTab(rel);});tabsEl.appendChild(b);});}` +
      `var companionFrame=null;` +
      `function rvDropFrame(){companionFrame=null;while(frameHostEl.firstChild)frameHostEl.removeChild(frameHostEl.firstChild);}` +
      // Show the markdown ('') or one HTML document. An HTML document is asked for from
      // the host each time its tab is chosen; until the answer arrives the tab shows its
      // path and a line.
      `function rvShowTab(rel){tab=rel;rvTabs();mdEl.style.display=rel?'none':'';htmlEl.style.display=rel?'':'none';rvDropFrame();` +
      `fieldEl.setAttribute('placeholder',rel?'Comment on '+rel+' (optional)…':'Comment on the whole document (optional)…');` +
      `rvHidePop();rvSync();` +
      `if(!rel||!shown)return;` +
      `htmlPathEl.textContent=rel;htmlNoteEl.textContent='Loading…';` +
      `vs.postMessage({v:1,payload:{type:'open-companion',artifactId:shown.artifactId,relPath:rel}});}` +
      // The host's answer. The page's text becomes the srcdoc of a frame that may run
      // scripts and NOTHING else: no same-origin, no forms, no popups, no top navigation.
      // The sandbox is set before the text, and both before the frame joins the document.
      // The frame inherits this page's CSP, so the page's scripts run only because the
      // host gave them this page's nonce, and it can load nothing from the network. With
      // no text the tab says the document cannot be shown and keeps its path.
      `function rvCompanion(m){if(!shown||m.artifactId!==shown.artifactId||m.relPath!==tab||!tab)return;rvDropFrame();` +
      `if(typeof m.html!=='string'){htmlNoteEl.textContent='This document cannot be shown here. Open the file to see it.';return;}` +
      `htmlNoteEl.textContent='';` +
      `var f=document.createElement('iframe');f.className='rv-frame';f.setAttribute('sandbox','allow-scripts');f.setAttribute('title',tab);` +
      `f.setAttribute('srcdoc',m.html);frameHostEl.appendChild(f);companionFrame=f;}` +
      // A click on a code reference inside the companion page. The page cannot reach the host, so it
      // posts to this window; the message is taken only from the frame shown now, only with a path of
      // sane length and a line that is a positive integer, and is then sent on as the same
      // open-code-ref a chat reference sends. The host decides whether the path may be opened.
      `function rvFrameMessage(d){if(!d||d.type!=='insrc-open-code-ref')return;` +
      `if(typeof d.path!=='string'||d.path.length<1||d.path.length>512)return;` +
      `if(d.line!==undefined&&!(typeof d.line==='number'&&d.line>0&&d.line<=10000000&&Math.floor(d.line)===d.line))return;` +
      `vs.postMessage({v:1,payload:d.line===undefined?{type:'open-code-ref',path:d.path}:{type:'open-code-ref',path:d.path,line:d.line}});}` +
      // The result of a decision: the buttons work again and the line says what happened.
      `function rvResult(m){if(!shown||m.artifactId!==shown.artifactId)return;busy=false;` +
      // Recorded with every comment: the drafts and the field are done with. Otherwise
      // (not recorded, or the comments were not saved) they are all kept, to send again.
      `if(m.ok&&m.recorded===sent){rvClearDrafts();fieldEl.value='';rvSync();}` +
      `renderBar();rvSetResult(String(m.message||''),m.ok?'rv-ok':'rv-err');}` +
      // docs-content: render the verbatim body + open questions, then the header and
      // the comment panel for this document.
      DOCS_BODY_RENDERER_SOURCE +
      // Epic babd84c6e2fb480a Story S001: one delegated click handler (defined by the renderer source above) posts a clicked
      // link or code reference to the host, which checks the target and opens it.
      `document.addEventListener('click',function(e){onLinkClick(e,function(p){vs.postMessage({v:1,payload:p});});});` +
      DOCS_SECTIONS_SOURCE +
      // S002/t2 — inlined after its two siblings, since its placement step (t5)
      // runs after both. INERT at t2: defined, nothing calls it yet.
      DOCS_FR_SOURCE +
      // S003/t4 — the fourth source string joins the SAME single nonce'd script.
      // INERT: it defines the derivation, the SVG writer and the slot factory, and
      // nothing calls them yet, so the rendered surface is unchanged by this commit.
      DOCS_DIAGRAM_SOURCE +
      // S004/t2 — the FIFTH source string joins the SAME single nonce'd script.
      // INERT: it defines the element dispatch and the card renderer, and nothing
      // calls them yet, so the rendered surface is unchanged but for the added
      // source text — which is why SHELL_BASELINE moves in THIS commit.
      DOCS_UX_SOURCE +
      // Story E202610138d4b90c9:S001 — the SIXTH source string in the same single nonce'd
      // script: the text model of the rendered document, anchors, and the inline drafts.
      DOCS_COMMENTS_SOURCE +
      // Story E202610131f74c81f:S001 — the SEVENTH: the list view and which view is on show.
      DOCS_LIST_SOURCE +
      // A content with no artifact id is the host's notice that the list could not be read:
      // it belongs to the list view and is not a document.
      `function renderContent(m){if(!m.artifactId){rvListNotice(m.markdown);return;}` +
      // A content for the document already shown is a reload in place: the reviewer's place
      // in the document region is taken before the body is rendered again and put back after.
      `var same=!!shown&&shown.artifactId===m.artifactId;` +
      `var top=same?scrollEl.scrollTop:0,before=same?shown.contentVersion:undefined;` +
      `var r=renderMarkdownBody(bodyEl,m.markdown||'');` +
      // Stamp FIRST, and let the stamped count gate the chooser. On the degraded
      // path the body is plain text with no heading elements, so nothing can be
      // stamped — rendering the chooser anyway would offer entries whose targets
      // do not exist and whose selection silently does nothing. A chooser that
      // cannot navigate is worse than no chooser, and "no targets" is the same
      // situation as "no headings", which already omits it entirely.
      `var stamped=stampSlugs(bodyEl,m.sections);` +
      // S002/t5 — THE single line that changes what a reviewer sees. Everything
      // before this task was additive and inert; reverting this call restores the
      // S001 surface exactly, with the types, the data path and the renderer all
      // still in place.
      //
      // AFTER stampSlugs is a correctness constraint, not a style one: the
      // stamper pairs headings to anchors BY TITLE through a pointer that only
      // advances (:117), so a tree mutated first could mis-pair every later
      // heading. BEFORE the chooser and the notice because the chooser is gated
      // on `stamped` (which placement cannot change — it adds and removes no
      // heading) and the notice may need to carry a placement degradation.
      //
      // The try/catch is a BACKSTOP for the unforeseen, not what makes placement
      // safe: t4 builds before it removes, so a construction throw cannot leave a
      // half-removed section. What this guard buys is that no failure here costs
      // the reviewer the chooser, the notice, the open questions or the controls.
      `var fr={placed:'none'};try{fr=placeFunctionalRequirements(bodyEl,m.functionalDefinition,m.sections,!!r.degradation.degraded);}catch(e){}` +
      // S003/t6 — THE single line that changes what a reviewer sees in this Story.
      // Everything t2-t5 added was additive and inert; reverting this call restores
      // the S002 surface exactly, with the types, the data path and BOTH derivations
      // still in place.
      //
      // AFTER stampSlugs for the same reason placement is: the stamper pairs
      // headings to anchors through a pointer that only advances, so a tree mutated
      // first could mis-pair every later heading — and this inserts a node INTO the
      // body when it anchors. BEFORE the chooser, which is gated on `stamped`, a
      // count this cannot change: the slot adds and removes no heading.
      //
      // The try/catch is a BACKSTOP for the unforeseen. What makes it safe is that
      // the factory never throws by design and the frame is built completely before
      // it is inserted; what the guard buys is that no failure here costs the
      // reviewer the body, the chooser, the notice, the open questions or the
      // controls.
      // Found in the hand check of E202610138d4b90c9:S001: a companion that has its own tab
      // was ALSO drawn inside the markdown. One that is offered as a tab is shown there only;
      // the slot in the body is for a diagram or mock that has no HTML document to open.
      `var tabbed=function(ref){return !!ref&&Array.isArray(m.documents)&&m.documents.some(function(d){return d&&d.type==='html'&&d.relPath===ref.relPath;});};` +
      `var dgSlot={state:'absent'};` +
      `try{if(!tabbed(dgPickRef(m.companions)))dgSlot=dgBuildDiagramSlot(` +
      `{erDefinition:m.erDefinition,sequenceDefinition:m.sequenceDefinition},` +
      `dgPickRef(m.companions),m.diagramAnchorSlug);}catch(e){dgSlot={state:'absent'};}` +
      `var dgPlaced='none';try{dgPlaced=dgMountSlot(dgHostEl,bodyEl,dgSlot);}catch(e){dgPlaced='none';}` +
      // S004/t6 — THE SINGLE CALL THAT CHANGES WHAT A REVIEWER SEES. Everything
      // before this task was additive and inert; removing these two lines restores
      // the S003 surface exactly.
      //
      // AFTER the diagram's mount, for the same two reasons that one sits after
      // stampSlugs: the slot inserts a node INTO the body when it anchors, and the
      // chooser is gated on a stamped count neither slot can change. Mounting the
      // experience second is also what puts it second in the region.
      //
      // REUSES s3's dgMountSlot UNCHANGED rather than minting a second mounter —
      // including its corrected id-walk anchor lookup, because querySelector('#'+slug)
      // throws on a digit-leading slug and insrc numbers its headings. A second
      // implementation would be a second place for that bug to come back.
      //
      // The try/catch is the same BACKSTOP: the factory never throws by design, and
      // what the guard buys is that no failure here costs the reviewer the body, the
      // chooser, the notice, the open questions, the controls or the DIAGRAM.
      `var uxSlot={state:'absent'};` +
      `try{if(!tabbed(uxPickRef(m.companions)))uxSlot=uxBuildMockSlot(m.uxDefinition,uxPickRef(m.companions),m.experienceAnchorSlug);}` +
      `catch(e){uxSlot={state:'absent'};}` +
      `var uxPlaced='none';try{uxPlaced=dgMountSlot(uxHostEl,bodyEl,uxSlot);}catch(e){uxPlaced='none';}` +
      `renderSectionChooser(secEl,stamped>0?m.sections:{anchors:[]},jumpToSection);` +
      // ac3: the notice comes from the POSTED state when the host declared one,
      // and otherwise from this render's own degradation — same shape either way.
      // Notice precedence, extended by ONE level rather than replaced: a
      // host-posted degradation wins, else the body renderer's, else placement's.
      // The reviewer is never shown two notices and never shown none when
      // something went wrong.
      `renderDegradationNotice(noticeEl,(m.degradation&&m.degradation.degraded)?m.degradation:(r.degradation&&r.degradation.degraded)?r.degradation:(fr.degradation||r.degradation));` +
      `while(oqEl.firstChild)oqEl.removeChild(oqEl.firstChild);` +
      `(m.openQuestions||[]).forEach(function(q){var d=document.createElement('div');d.className='insrc-docs-oq-item';d.textContent='? '+q;oqEl.appendChild(d);});` +
      // The document shown changed: an unanswered decision and the result line belonged to
      // the earlier one. A re-post of the SAME document (after a decision, or to a rebuilt
      // shell) keeps them, and the field and the drafts with them.
      `shown=m;` +
      // Its field and its drafts come from the saved state, where they are kept per artifact.
      `if(!same){busy=false;rvSetResult('','');rvLoad();}` +
      // The documents of this artifact. Another artifact, or an HTML document that is no
      // longer listed, goes back to the markdown; a re-post of the same artifact keeps the
      // tab on show, and its frame.
      `docs=Array.isArray(m.documents)?m.documents:[];` +
      `if(!same||!tab||!docs.some(function(d){return d&&d.type==='html'&&d.relPath===tab;})){rvShowTab('');}else{rvTabs();}` +
      // The body was rendered again: the saved comments and the drafts are put on their
      // passages, and the rest of the saved comments in the strip.
      `rvHidePop();rvPlaceAll();rvSync();` +
      `renderBar();` +
      // The reload in place. The line that says so is for a change made outside the pane
      // (the host marks that re-read changed) that gave a different document; the re-read
      // after the shell's own decision is not marked, so the decision's result line stays.
      `if(same){scrollEl.scrollTop=top;` +
      `if(m.changed===true&&m.contentVersion!==before){rvSetResult('This document changed on disk and was reloaded.','');}}` +
      // The header names the document. The reviewer is brought to it only when they asked
      // for it (reveal); a re-read updates what is held and leaves the view as it is.
      `var known=null;items.forEach(function(a){if(a.id===m.artifactId)known=a;});` +
      `titleEl.textContent=String((known&&known.title)||m.artifactId);` +
      `if(m.reveal===true){view='doc';if(listNote){listNote='';rvRows();}rvListSave();}` +
      `rvApplyView();}` +
      `window.addEventListener('message',function(e){` +
      // Whatever the companion frame sends is a reference click or nothing: never a host message.
      `if(companionFrame&&e.source===companionFrame.contentWindow){rvFrameMessage(e.data);return;}` +
      `var m=e.data&&e.data.payload;if(!m)return;` +
      `if(m.type==='docs-list'){renderList(m.artifacts);}` +
      `else if(m.type==='docs-content'){renderContent(m);}` +
      `else if(m.type==='docs-decision-result'){rvResult(m);}` +
      `else if(m.type==='docs-companion'){rvCompanion(m);}});` +
      `rvListLoad();renderTable();rvApplyView();rvShowTab('');renderBar();` +
      // request the pending list as soon as the script is live.
      `vs.postMessage({v:1,payload:{type:'open-doc',artifactId:''}});`;
    return (
      `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      `<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">` +
      `${style}${mdStyle}</head>` +
      `<body class="insrc-rv">` +
      // THE LIST VIEW: the documents awaiting review. The toolbar and the pager are outside
      // the table's scrolling region.
      `<div id="insrc-rv-listview" class="rv-listview">` +
      `<div class="rv-tool">` +
      `<input id="insrc-rv-q" type="search" list="insrc-rv-suggest" autocomplete="off" aria-label="Search documents" placeholder="Search title or id…">` +
      `<datalist id="insrc-rv-suggest"></datalist>` +
      `<select id="insrc-rv-kindsel" aria-label="Document type"></select>` +
      `<span class="rv-sp"></span><span id="insrc-rv-count" class="rv-dim"></span>` +
      `</div>` +
      `<div id="insrc-rv-listnote" class="rv-listnote" aria-live="polite"></div>` +
      `<div class="rv-tablewrap"><table class="rv-table"><thead><tr><th>Type</th><th>Title</th><th>Id</th><th>Open questions</th></tr></thead>` +
      `<tbody id="insrc-docs-list"></tbody></table></div>` +
      `<div class="rv-pager">` +
      `<button id="insrc-rv-prev" type="button" class="rv-ic rv-sm" aria-label="Previous page" title="Previous page"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M10 3L5 8l5 5"/></svg></button>` +
      `<span id="insrc-rv-page" class="rv-dim"></span>` +
      `<button id="insrc-rv-next" type="button" class="rv-ic rv-sm" aria-label="Next page" title="Next page"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 3l5 5-5 5"/></svg></button>` +
      `</div>` +
      `</div>` +
      // THE DOCUMENT VIEW.
      `<div id="insrc-rv-docview" class="rv-docview">` +
      // The header: outside the scrolling region.
      `<div class="rv-head">` +
      `<button id="insrc-rv-back" type="button" class="rv-ic rv-sm" aria-label="Back to the list" title="Back to the list"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M10 3L5 8l5 5"/></svg></button>` +
      `<span id="insrc-rv-title" class="rv-title"></span>` +
      `<span id="insrc-rv-kind" class="rv-badge"></span>` +
      `<span id="insrc-rv-state" class="rv-dim"></span>` +
      `<span class="rv-sp"></span>` +
      `<span id="insrc-rv-tabs" class="rv-tabs" role="tablist" aria-label="documents of this artifact"></span>` +
      `</div>` +
      // The one scrolling region: everything of the document, and nothing else.
      `<div id="insrc-rv-scroll" class="rv-scroll"><div id="insrc-rv-md" class="rv-doc">` +
      // The round button a selection offers; placed at the selection by the script.
      `<div id="insrc-rv-pop" class="rv-pop"><button id="insrc-rv-pop-btn" type="button" class="rv-ic" aria-label="Comment on the selected text" title="Comment on the selected text">` +
      `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg></button></div>` +
      // t6: the section chooser and the ac3 notice. Both are filled by DOM
      // construction with textContent — never markup — and the chooser host stays
      // EMPTY (no control at all) for a document with no headings.
      `<div id="insrc-docs-sections" aria-label="sections"></div>` +
      `<div id="insrc-docs-notice" aria-live="polite"></div>` +
      // A DIV, not a <pre>: marked emits newline-separated block elements, so a
      // preformatted container would render a literal blank line between every
      // block and set headings in the monospace face at body size.
      `<div id="insrc-docs-diagram" aria-label="design diagram"></div>` +
      // S004/t6 — the experience slot's host, immediately AFTER the diagram's so
      // the two sit as labelled peers in one companions region. Diagram first
      // because it answers "what is this made of" and the mock answers "what will
      // it feel like", and a reviewer reads structure before experience.
      `<div id="insrc-docs-experience" aria-label="experience mock"></div>` +
      `<div id="insrc-docs-body" class="insrc-docs-content" aria-label="artifact body"></div>` +
      `<div id="insrc-docs-oq" aria-label="open questions"></div>` +
      `</div>` +
      // An HTML document of the artifact: its path, a line when it cannot be shown, and
      // the host its frame is put into. The frame itself is made by the script, so the
      // markup holds no element that loads anything.
      `<div id="insrc-rv-html" class="rv-html">` +
      `<div id="insrc-rv-html-path" class="rv-dim"></div>` +
      `<div id="insrc-rv-html-note" class="rv-html-note" aria-live="polite"></div>` +
      `<div id="insrc-rv-frame" class="rv-frame-host"></div>` +
      `</div></div>` +
      // The saved comments that have no passage, collapsed until opened. Outside the
      // scrolling region, like the comment panel under it.
      `<details id="insrc-rv-hist" class="rv-hist"><summary id="insrc-rv-hist-sum"></summary>` +
      `<div id="insrc-rv-hist-list" class="rv-hist-list"></div></details>` +
      // The comment panel: outside the scrolling region, so it is in view at every scroll
      // position. Icon-only buttons; each one's name is its title and aria-label.
      `<div id="insrc-rv-bar" class="rv-bar">` +
      `<div class="rv-meta"><span id="insrc-rv-drafts" class="rv-dim"></span><span class="rv-sp"></span><span id="insrc-rv-who" class="rv-dim"></span></div>` +
      `<div class="rv-row">` +
      `<textarea id="insrc-rv-field" rows="2" maxlength="10000" aria-label="Comment on the whole document" placeholder="Comment on the whole document (optional)…"></textarea>` +
      `<button id="insrc-rv-feedback" type="button" class="rv-ic" aria-label="Send feedback" title="Send feedback: sends the comment; the document's state does not change">` +
      `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 8l11-5-4 11-2-4.5z"/></svg></button>` +
      `<button id="insrc-rv-reject" type="button" class="rv-ic rv-reject" aria-label="Reject" title="Reject: sends the comment and rejects this revision">` +
      `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>` +
      `<button id="insrc-rv-approve" type="button" class="rv-ic rv-approve" aria-label="Approve" title="Approve: sends the comment and approves">` +
      `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5l3.2 3.2L13 5"/></svg></button>` +
      `</div>` +
      `<div id="insrc-rv-result" class="rv-result" aria-live="polite"></div>` +
      `</div>` +
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
        // A rebuilt shell (the pane hidden and shown again) sends the ping too and has lost
        // its document: the open one is posted again, by its path, pending or not.
        if (msg.artifactId === '') {
          void refreshPending().then(() => reopen());
        } else if (pending.has(msg.artifactId)) {
          void openDoc(msg.artifactId, { reveal: true });
        } else {
          // A stale row (approved/evicted since the list was posted) -> refresh, drop the open.
          log.warn(`[docs-review] open-doc: unknown/stale artifact ${msg.artifactId}`);
          void refreshPending();
        }
        return;
      case 'docs-decision':
        if (typeof msg.artifactId !== 'string' || !isReviewDecision(msg.decision) || !Array.isArray(msg.comments)) return;
        void decide(msg.artifactId, msg.decision, msg.comments);
        return;
      case 'open-companion':
        if (typeof msg.artifactId !== 'string' || typeof msg.relPath !== 'string') return;
        void openCompanion(msg.artifactId, msg.relPath);
        return;
      case 'open-link':
        if (deps.links !== undefined) void deps.links.openLink(msg.url);
        return;
      case 'open-code-ref':
        if (deps.links !== undefined) void deps.links.openCodeRef(msg.path, msg.line);
        return;
      default:
        // any chat-slice / forward variant: accepted-but-ignored seam — never an error.
        return;
    }
  }

  /** Show the pane, creating it when there is none. quiet: without taking keyboard focus. */
  function show(quiet: boolean): void {
    disposed = false;
    if (channel !== undefined) {
      if (quiet) channel.reveal({ preserveFocus: true });
      else channel.reveal();
      void refreshPending();
      return;
    }
    channel = deps.createPanel({ viewType: VIEW_TYPE, title: 'insrc docs review', ...(quiet ? { quiet: true } : {}) });
    channel.onDidDispose(() => {
      disposed = true;
      channel = undefined;
      pending.clear();
      setOpened(undefined);
    });
    channel.onMessage(handleMessage);
    channel.setHtml(renderShell());
    // The webview boot ping also triggers refreshPending; post one now so a fast
    // consumer (test double) sees the list without waiting for the ping.
    void refreshPending();
  }

  const host: DocsReviewHost = {
    open(): void {
      show(false);
    },
    openArtifact(target): void {
      show(target.quiet === true);
      void openArtifactFrom(target);
    },
    dispose(): void {
      disposed = true;
      channel?.dispose();
      channel = undefined;
      pending.clear();
      setOpened(undefined);
    },
  };
  return host;
}

function isReviewDecision(v: unknown): v is ReviewDecision {
  return v === 'approve' || v === 'reject' || v === 'feedback';
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * The HTML companions among an artifact's companion refs, each once, in order. The refs
 * are not validated on the read path, so anything that is not a ref with a path ending in
 * .html is skipped rather than trusted.
 */
function htmlCompanionsOf(companions: DocsContent['companions']): Array<{ readonly relPath: string; readonly title: string }> {
  const out: Array<{ readonly relPath: string; readonly title: string }> = [];
  if (!Array.isArray(companions)) return out;
  for (const c of companions as readonly unknown[]) {
    if (typeof c !== 'object' || c === null) continue;
    const relPath = (c as { relPath?: unknown }).relPath;
    const title = (c as { title?: unknown }).title;
    if (typeof relPath !== 'string' || !/\.html$/i.test(relPath)) continue;
    if (out.some((x) => x.relPath === relPath)) continue;
    out.push({ relPath, title: typeof title === 'string' && title.trim() !== '' ? title : baseName(relPath) });
  }
  return out;
}

/**
 * Give every script tag that has no nonce the given one. An HTML companion is shown as the
 * srcdoc of a frame that inherits the pane's CSP, so only scripts carrying the pane's nonce
 * run there.
 */
export function stampScriptNonce(html: string, nonce: string): string {
  return html.replace(/<script\b(?![^>]*\bnonce\s*=)/gi, `<script nonce="${attr(nonce)}"`);
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
const noFullStop = (text: string): string => text.trim().replace(/\.+$/, '');
const oneLine = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

/** The line the pane shows after a decision the daemon recorded. */
function decisionResultLine(res: ReviewDecisionResult, sent: number, chat: ChatHandOver): string {
  const parts: string[] = [];
  const asFeedback = res.outcome === 'withheld' ? ' as feedback' : '';
  switch (res.outcome) {
    case 'approved': parts.push('Approved.'); break;
    case 'rejected': parts.push('Rejected.'); break;
    case 'withheld': parts.push(`Not approved: ${noFullStop(res.reason ?? 'the review gate withheld the approval')}.`); break;
    case 'recorded': parts.push('Feedback sent.'); break;
  }
  if (res.commentsError !== undefined) {
    parts.push(`The ${sent === 1 ? 'comment was' : 'comments were'} not saved: ${noFullStop(res.commentsError)}.`);
  } else if (sent > 0) {
    parts.push(`${plural(res.recorded, 'comment')} saved${asFeedback}.`);
  }
  if (typeof chat === 'object') {
    parts.push(`The chat could not be told: ${noFullStop(chat.note)}.`);
  } else {
    switch (chat) {
      case 'queued': parts.push('Sent to the chat; it waits its turn in the outbox.'); break;
      case 'failed': parts.push('The chat could not be told.'); break;
      case 'none': parts.push('No chat message was sent.'); break;
    }
  }
  return parts.join(' ');
}

/**
 * The one message the chat is handed after a decision: the decision and its outcome, the
 * artifact, the reviewer, and the new comments numbered in order, each with its quote and
 * section when it has them. With no comments it is the decision line alone.
 */
function decisionChatMessage(o: OpenDocument, res: ReviewDecisionResult, comments: readonly ReviewDecisionComment[]): string {
  const what = `${res.artifactId}${o.title !== undefined && o.title !== '' ? ` "${o.title}"` : ''}${o.docPath !== undefined ? ` (${o.docPath})` : ''}`;
  let head: string;
  switch (res.outcome) {
    case 'approved': head = `Review decision: approved ${what}, by ${res.author}.`; break;
    case 'rejected': head = `Review decision: rejected ${what}, by ${res.author}.`; break;
    case 'withheld': head = `Review decision: the approval of ${what} by ${res.author} was withheld: ${noFullStop(res.reason ?? 'the review gate withheld it')}.`; break;
    case 'recorded': head = `Review feedback on ${what}, by ${res.author}.`; break;
  }
  if (comments.length === 0) return head;
  const lines = [head];
  if (res.commentsError !== undefined) lines.push(`The comments below could not be saved: ${noFullStop(res.commentsError)}.`);
  else if (res.outcome === 'withheld') lines.push('The comments below were saved as feedback.');
  lines.push('Comments:');
  comments.forEach((c, i) => {
    const quote = typeof c.anchor?.quote === 'string' ? c.anchor.quote : undefined;
    const section = typeof c.anchor?.sectionSlug === 'string' && c.anchor.sectionSlug !== '' ? ` (section ${c.anchor.sectionSlug})` : '';
    const where = quote !== undefined
      ? `On "${oneLine(quote, 120)}"${section}: `
      : typeof c.file === 'string' && c.file !== '' && c.file !== o.docPath ? `On ${c.file}: ` : '';
    lines.push(`${i + 1}. ${where}${String(c.comment).trim()}`);
  });
  return lines.join('\n');
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
