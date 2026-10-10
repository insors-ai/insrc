/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The delivery board's host (E2 s1): one editor-tab webview panel over the
 * board state.
 *
 * The host owns the panel channel and the board state. Every refresh stamps the
 * next request number, asks the delivery client for a snapshot and dispatches
 * the answer to reduceBoardState; after every dispatch it posts the
 * down-messages derived from the new state. A superseded answer is logged
 * through warn(), a failed or timed-out one through error(). Once the panel is
 * disposed an outstanding answer is discarded without being dispatched, posted
 * or logged, and the next open() starts a new panel with a fresh state.
 *
 * Navigation (ISSUE-348d4663): every reader intent becomes a navigate event
 * over the state's trail of screens, after the host has checked any id it
 * names against the shown snapshot. Paging lives in each trail entry. Every
 * derive keeps the new state only when it renders, each screen change is
 * announced once, and items whose stage is not one of the six are logged once
 * per applied refresh.
 *
 * The document is CSP-locked (default-src 'none') with one nonce'd script that
 * renders the status and the board's columns, cards and controls as text
 * (textContent only) and posts only BoardUpMessage envelopes. vscode-free: extension.ts supplies the panel.
 *
 * The item details (E2 s4): a story's or issue's screen is built from the
 * details memory (details-memory.ts). The host tells the memory the item of
 * each state it keeps (null on any other screen), routes open-evidence to it,
 * and starts a new memory with each panel.
 */

import { attr, type ChatPanelChannel, type ChatPanelLogger } from '../chat/chat-panel.js';
import type { Envelope } from '../chat/protocol.js';
import { isPlaceable, placeableCount, titleOf, unknownStages } from './board-model.js';
import { parseBoardUpMessage, type BoardUpMessage, type ListView } from './board-protocol.js';
import {
  boardDownMessages, currentEntry, currentItemId, initialBoardState, reduceBoardState, shownSnapshot, statusView,
  type BoardEvent, type BoardState, type NavIntent,
} from './board-state.js';
import type { DeliveryClient, DeliveryResult } from './delivery-client.js';
import type { DeliverySnapshot } from './delivery-contract.js';
import { createDetailsMemory, type DetailsMemory } from './details-memory.js';
import { errorText } from './guards.js';
import { DISPLAY_LABELS, labelOf } from './labels.js';

export const BOARD_VIEW_TYPE = 'insrc.deliveryBoard';
export const BOARD_TITLE = 'Delivery board';

export interface DeliveryBoardHostDeps {
  readonly createPanel: (opts: { readonly viewType: string; readonly title: string }) => ChatPanelChannel;
  readonly client: DeliveryClient;
  readonly logger: ChatPanelLogger;
  /** ISO-8601 time; stamps failures and measures elapsed time. */
  readonly now: () => string;
  readonly genNonce: () => string;
  /** The review pane, when the chat setting created one; a review-view record opens there. */
  readonly reviewPane?: { openArtifact(target: { readonly artifactId: string; readonly mdPath: string }): void } | undefined;
}

export interface DeliveryBoardHost {
  open(): void;
  dispose(): void;
}


/** The labels the webview shows on its own controls, from the same table as every view (sc4). */
const SCRIPT_LABELS = {
  views: DISPLAY_LABELS.views,
  itemTabs: DISPLAY_LABELS.itemTabs,
  needsAttention: DISPLAY_LABELS.needsAttention,
  otherStages: DISPLAY_LABELS.otherStages,
};

/**
 * The webview script (screens, ISSUE-348d4663). Each screen message replaces the screen: on a new trail entry #main
 * is cleared and rebuilt; a re-render of the same entry (a refresh, a filter) rebuilds the screen's body and keeps
 * its head, so the search box keeps focus while the reader types. Everything shown is set with textContent, and the
 * only messages posted are board up-messages. The webview keeps presentation memory only: the scroll of each trail
 * entry, the stage sections the reader opened or closed, and whether the pane is narrow (<= 480 px), which shortens
 * the breadcrumb and folds the empty stages.
 */
export const BOARD_WEBVIEW_SCRIPT = [
  `(function(){`,
  `const vs=acquireVsCodeApi();`,
  `const send=function(p){vs.postMessage({v:1,payload:p});};`,
  `const L=${JSON.stringify(SCRIPT_LABELS)};`,
  `const VIEWS=['all','epics','standalone','issues'];`,
  `const byId=function(id){return document.getElementById(id);};`,
  `const crumbsEl=byId('crumbs'),status=byId('status'),banner=byId('banner'),main=byId('main'),announceEl=byId('announce');`,
  `const make=function(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.setAttribute('class',cls);return e;};`,
  `const clear=function(n){while(n.firstChild)n.removeChild(n.firstChild);};`,
  `const button=function(text,onClick,cls){const b=make('button',text,cls);b.setAttribute('type','button');b.addEventListener('click',onClick);return b;};`,
  `const pill=function(text,tone,cls){const e=make('span',text,cls||'pill');e.setAttribute('data-tone',tone);return e;};`,
  `const plural=function(n,one,many){return n+' '+(n===1?one:many);};`,
  `const KICKER={story:'STORY',issue:'ISSUE',epic:'EPIC',task:'TASK'};`,
  `byId('refresh').addEventListener('click',function(){send({type:'refresh'});});`,
  // Presentation memory: scroll per trail entry, the reader's section toggles per entry and stage, the narrow flag.
  `const scrollOf={},openOf={};`,
  `let model=null,shownEntry=null,shownKind=null,narrow=false,head=null,bodyEl=null,search=null;`,
  `const isNarrow=function(){const w=document.documentElement.clientWidth;return typeof w==='number'&&w>0&&w<=480;};`,
  `window.addEventListener('scroll',function(){if(shownEntry!==null)scrollOf[shownEntry]=window.scrollY||0;});`,
  `window.addEventListener('resize',function(){if(model!==null&&isNarrow()!==narrow)render(model);});`,
  // Escape on an epic's board or an item's screen goes back, unless the reader is typing in the search box.
  `main.addEventListener('keydown',function(e){if(e.key==='Escape'&&model!==null&&model.back!==null&&document.activeElement!==search){e.preventDefault();send({type:'back'});}});`,
  // A re-render keeps focus on the element with the same data-key.
  `const keyed=function(e,k){e.setAttribute('data-key',k);return e;};`,
  `const focusedKey=function(){const a=document.activeElement;return a&&a.getAttribute?a.getAttribute('data-key'):null;};`,
  `const findKey=function(root,k){if(root.getAttribute&&root.getAttribute('data-key')===k)return root;for(const c of root.children){const f=findKey(c,k);if(f)return f;}return null;};`,
  // The breadcrumb: earlier crumbs are buttons back to their trail entry, the last is the current place. A narrow
  // pane shows only the back step and the current place.
  `function renderCrumbs(m){clear(crumbsEl);const last=m.crumbs[m.crumbs.length-1];`,
  `const current=function(text){const s=make('span',text,'crumb current');s.setAttribute('aria-current','page');return s;};`,
  `if(narrow){if(m.back!==null)crumbsEl.appendChild(keyed(button(m.back.label,function(){send({type:'back'});},'crumb'),'crumb-back'));crumbsEl.appendChild(current(last.label));return;}`,
  `m.crumbs.forEach(function(c,i){if(i>0)crumbsEl.appendChild(make('span','/','sep'));`,
  `if(i===m.crumbs.length-1)crumbsEl.appendChild(current(c.label));`,
  `else if(c.index<last.index)crumbsEl.appendChild(keyed(button(c.label,function(){send({type:'go-to-crumb',index:c.index});},'crumb'),'crumb-'+i));`,
  `else crumbsEl.appendChild(make('span',c.label,'crumb'));});}`,
  // The filter bar: the four views (on one of the four views only), Needs attention, and the search box.
  `function buildFilters(f){const bar=make('div',undefined,'filters');`,
  `if(f.views){const g=make('div',undefined,'views');g.setAttribute('role','group');g.setAttribute('aria-label','View');`,
  `for(const v of VIEWS){const b=keyed(button(L.views[v],function(){send({type:'set-view',view:v});},'view'),'view-'+v);b.setAttribute('data-view',v);g.appendChild(b);}bar.appendChild(g);}`,
  `const att=keyed(button(L.needsAttention,function(){send({type:'set-attention',on:att.getAttribute('aria-pressed')!=='true'});},'chip attention'),'attention');bar.appendChild(att);`,
  `search=keyed(make('input',undefined,'search'),'search');search.setAttribute('type','search');search.setAttribute('aria-label','Search');`,
  `search.addEventListener('input',function(){send({type:'set-search',search:String(search.value)});});bar.appendChild(search);return bar;}`,
  `function markFilters(f){if(f===null||head===null)return;`,
  `for(const b of head.querySelectorAll('button.view'))b.setAttribute('aria-pressed',b.getAttribute('data-view')===f.view?'true':'false');`,
  `const att=head.querySelectorAll('button.attention')[0];if(att){att.setAttribute('aria-pressed',f.needsAttentionOnly?'true':'false');att.textContent=f.needsAttentionOnly?L.needsAttention+' \\u00d7':L.needsAttention;}`,
  `if(search!==null){search.setAttribute('placeholder',f.searchPlaceholder);if(document.activeElement!==search)search.value=f.search;}}`,
  // State panels: the status panel goes to the banner or, with nothing to show behind it, replaces the screen; a
  // view's no-matches panel replaces its list area.
  `function renderPanel(box,p){const d=make('div',undefined,'panel');d.setAttribute('data-kind',p.kind);d.setAttribute('role','note');`,
  `d.appendChild(make('p',p.title,'panel-title'));if(p.text)d.appendChild(make('p',p.text));`,
  `if(p.stale)d.appendChild(pill('Stale','warning'));`,
  `if(p.affected&&p.affected.length>0){const dis=make('details');dis.appendChild(make('summary','Inspect affected records'));const ul=make('ul');`,
  `for(const a of p.affected){const li=make('li');if(a.artifactIds.length>0)li.appendChild(make('code',a.artifactIds.join(', ')));li.appendChild(make('span',(a.artifactIds.length>0?' \\u2014 ':'')+a.text));ul.appendChild(li);}dis.appendChild(ul);d.appendChild(dis);}`,
  `const acts=make('div',undefined,'panel-actions');`,
  `if(p.action==='retry')acts.appendChild(button('Retry',function(){send({type:'refresh'});}));`,
  `if(p.action==='clear-filters')acts.appendChild(button('Clear filters',function(){if(search!==null)search.value='';send({type:'clear-filters'});}));`,
  `if(acts.firstChild)d.appendChild(acts);box.appendChild(d);}`,
  // Cards: kicker, title, epic line, task summary, badges; a card opens its item's screen.
  `const cardsOnScreen=function(){return Array.prototype.slice.call(main.querySelectorAll('li.card'));};`,
  `const moveFocus=function(from,step){const cards=cardsOnScreen();const next=cards[cards.indexOf(from)+step];if(next)next.focus();};`,
  `function renderCard(c,showEpic){const li=keyed(make('li',undefined,'card'),'item-'+c.itemId);li.setAttribute('data-item-id',c.itemId);li.setAttribute('aria-label',c.accessibleLabel);li.setAttribute('tabindex','0');`,
  `li.appendChild(make('div',KICKER[c.kind]+' \\u00b7 '+c.compactId,'kicker'));li.appendChild(make('div',c.title,'card-title'));`,
  `const epicLine=!showEpic?'':c.standalone?'Standalone':c.epicTitle===null?'':c.epicTitle;if(epicLine!=='')li.appendChild(make('div',epicLine,'card-epic'));`,
  `if(c.taskSummary!==null)li.appendChild(make('div',c.taskSummary.label,'card-tasks'));`,
  `const badges=make('ul',undefined,'badges');for(const b of c.badges){const t=make('li',b.label,'badge');t.setAttribute('data-tone',b.tone);t.setAttribute('data-kind',b.kind);badges.appendChild(t);}li.appendChild(badges);`,
  `const open=function(){send({type:'open-item',itemId:c.itemId});};li.addEventListener('click',open);`,
  `li.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}else if(e.key==='ArrowDown'){e.preventDefault();moveFocus(li,1);}else if(e.key==='ArrowUp'){e.preventDefault();moveFocus(li,-1);}});return li;}`,
  // A stage section: a <details> whose summary always shows the label, the count and any attention hint.
  `function renderSection(sec,showEpic){const d=make('details',undefined,'stage');d.setAttribute('data-stage',sec.stage);const k=model.entryId+':'+sec.stage;`,
  `if(Object.prototype.hasOwnProperty.call(openOf,k)?openOf[k]:sec.defaultOpen)d.setAttribute('open','');`,
  `d.addEventListener('toggle',function(){openOf[k]=d.getAttribute('open')!==null;});`,
  `const s=keyed(make('summary'),'stage-'+sec.stage);s.appendChild(make('span',sec.label,'stage-label'));const n=make('span',String(sec.total),'count');n.setAttribute('aria-label',plural(sec.total,'item','items'));s.appendChild(n);`,
  `if(sec.emptyText!==null)s.appendChild(make('span',sec.emptyText,'muted'));if(sec.hint!==null)s.appendChild(pill(sec.hint,'warning','pill hint'));d.appendChild(s);`,
  `if(sec.cards.length>0){const ul=make('ul',undefined,'cards');ul.setAttribute('aria-label',sec.label);for(const c of sec.cards)ul.appendChild(renderCard(c,showEpic));d.appendChild(ul);}`,
  `if(sec.hiddenCount>0)d.appendChild(button('Show '+sec.hiddenCount+' more',function(){send({type:'show-more',stage:sec.stage});},'more'));return d;}`,
  `function renderEpicSummary(r){const box=make('div',undefined,'epic-summary');`,
  `box.appendChild(make('p',[plural(r.storiesTotal,'story','stories'),plural(r.taskCount,'task','tasks')].concat(r.issueCount>0?[plural(r.issueCount,'issue','issues')]:[]).join(' \\u00b7 '),'counts muted'));`,
  `box.appendChild(make('p',r.completionLabel,'completion muted'));const meter=make('span',undefined,'meter');meter.setAttribute('role','meter');meter.setAttribute('aria-label',r.completionLabel);`,
  `meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax',String(r.storiesTotal));meter.setAttribute('aria-valuenow',String(r.storiesComplete));`,
  `const fill=make('span');fill.setAttribute('style','width:'+(r.storiesTotal===0?0:Math.round(100*r.storiesComplete/r.storiesTotal))+'%');meter.appendChild(fill);box.appendChild(meter);`,
  `box.appendChild(pill(r.attentionLabel,r.attentionTone,'pill attention-count'));return box;}`,
  `function renderTotals(label,showAll){const p=make('p',label,'totals');if(showAll)p.appendChild(button('Show all',function(){send({type:'set-attention',on:false});},'link show-all'));bodyEl.appendChild(p);}`,
  // A board screen: the epic's own summary on its board, the totals, then the six stages (or the no-matches panel).
  `function renderStages(b){if(b.epic!==null){const k=make('div','EPIC \\u00b7 '+b.epic.compactId,'kicker');bodyEl.appendChild(k);bodyEl.appendChild(renderEpicSummary(b.epic));}`,
  `renderTotals(b.totalsLabel,b.showAll);if(b.emptyPanel!==null){renderPanel(bodyEl,b.emptyPanel);return;}`,
  `const showEpic=b.epic===null&&!(model.filters!==null&&model.filters.view==='standalone');const fold=b.fold.always||narrow;`,
  `for(const sec of b.sections){if(fold&&sec.total===0)continue;bodyEl.appendChild(renderSection(sec,showEpic));}`,
  `if(fold&&b.fold.text!==''){if(b.fold.always)bodyEl.appendChild(make('p',b.fold.text,'fold muted'));`,
  `else{const d=make('details',undefined,'stage fold');const k=model.entryId+':fold';if(openOf[k])d.setAttribute('open','');d.addEventListener('toggle',function(){openOf[k]=d.getAttribute('open')!==null;});`,
  `d.appendChild(keyed(make('summary',L.otherStages),'stage-fold'));d.appendChild(make('p',b.fold.text,'muted'));bodyEl.appendChild(d);}}}`,
  // The Epics screen: each whole row opens that epic's board.
  `function renderEpics(b){renderTotals(b.totalsLabel,false);if(b.emptyPanel!==null)renderPanel(bodyEl,b.emptyPanel);`,
  `else{const ul=make('ul',undefined,'rows');ul.setAttribute('aria-label','Epics');for(const r of b.rows){const li=make('li');`,
  `const row=keyed(button('',function(){send({type:'open-epic',epicItemId:r.epicItemId});},'epic-row'),'epic-'+r.epicItemId);row.setAttribute('data-epic',r.epicItemId);`,
  `row.appendChild(make('span','EPIC \\u00b7 '+r.compactId,'kicker'));row.appendChild(make('span',r.title,'row-title'));row.appendChild(renderEpicSummary(r));li.appendChild(row);ul.appendChild(li);}bodyEl.appendChild(ul);}`,
  `const p=make('p','Work outside any epic is under ','muted standalone-link');p.appendChild(button(L.views.standalone,function(){send({type:'set-view',view:'standalone'});},'link'));bodyEl.appendChild(p);}`,
  // The Issues screen: a list in stage order; a row opens the issue's screen.
  `function renderIssues(b){renderTotals(b.totalsLabel,false);if(b.emptyPanel!==null){renderPanel(bodyEl,b.emptyPanel);return;}`,
  `const ul=make('ul',undefined,'rows');ul.setAttribute('aria-label','Issues');for(const e of b.issues){const li=make('li');`,
  `const row=keyed(button('',function(){send({type:'open-item',itemId:e.card.itemId});},'issue-row'),'item-'+e.card.itemId);row.setAttribute('data-item-id',e.card.itemId);row.setAttribute('aria-label',e.card.accessibleLabel);`,
  `row.appendChild(make('span','ISSUE \\u00b7 '+e.card.compactId,'kicker'));row.appendChild(make('span',e.card.title,'row-title'));`,
  `const what=e.parent!==null?'Corrects '+e.parent.title:e.parentNotice!==null?e.parentNotice:e.card.standalone?'Standalone':'';`,
  `const fix=e.fixStories.length===0?'no fix story yet':e.fixStories.map(function(f){return 'fix story '+f.title+(f.stageLabel===null?'':' \\u00b7 '+f.stageLabel);}).join('; ');`,
  `row.appendChild(make('span',[what,fix].filter(function(t){return t!=='';}).join(' \\u00b7 '),'muted'));const pills=make('span',undefined,'badges');pills.appendChild(pill(e.stageLabel,'neutral'));`,
  `for(const b of e.card.badges){const t=pill(b.label,b.tone,'badge');t.setAttribute('data-kind',b.kind);pills.appendChild(t);}row.appendChild(pills);li.appendChild(row);ul.appendChild(li);}bodyEl.appendChild(ul);}`,
  // A story's or issue's screen (the full screens are t5's).
  `function renderItem(b){bodyEl.appendChild(make('div',b.details.kicker,'kicker'));}`,
  `function render(m){const fresh=m.entryId!==shownEntry||m.body.kind!==shownKind;model=m;narrow=isNarrow();renderCrumbs(m);`,
  `const keep=fresh?null:focusedKey();`,
  `if(fresh){clear(main);search=null;head=make('div',undefined,'screen-head');bodyEl=make('div',undefined,'screen-body');main.appendChild(head);main.appendChild(bodyEl);main.setAttribute('data-screen',m.body.kind);`,
  `if(m.back!==null)head.appendChild(keyed(button(m.back.label,function(){send({type:'back'});},'back'),'back'));`,
  `const h=keyed(make('h1',m.title,'screen-title'),'title');h.setAttribute('tabindex','-1');head.appendChild(h);if(m.filters!==null)head.appendChild(buildFilters(m.filters));}`,
  `else head.querySelectorAll('h1.screen-title').forEach(function(h){h.textContent=m.title;});`,
  `markFilters(m.filters);clear(bodyEl);`,
  `switch(m.body.kind){case 'stages':renderStages(m.body);break;case 'epics':renderEpics(m.body);break;case 'issues':renderIssues(m.body);break;default:renderItem(m.body);}`,
  `if(keep!==null){const f=findKey(main,keep)||findKey(crumbsEl,keep);if(f)f.focus();}`,
  // A new screen starts at the top with its heading focused; a screen the reader returned to gets its scroll back and
  // focuses what was opened from it.
  `if(fresh){shownEntry=m.entryId;shownKind=m.body.kind;const h=head.querySelectorAll('h1.screen-title')[0];`,
  `if(m.restored){window.scrollTo(0,scrollOf[m.entryId]||0);const o=m.focusItemId===null?null:findKey(bodyEl,'item-'+m.focusItemId)||findKey(bodyEl,'epic-'+m.focusItemId);(o||h).focus();}`,
  `else{window.scrollTo(0,0);h.focus();}}}`,
  `window.addEventListener('message',function(e){`,
  `const msg=e.data;if(!msg||msg.v!==1||!msg.payload)return;const p=msg.payload;`,
  `if(p.type==='status'){const s=p.status;`,
  `const line=s.state==='loading'?'Refreshing\\u2026'+(s.freshnessLabel?' \\u00b7 '+s.freshnessLabel:''):s.freshnessLabel||s.message||'';`,
  `status.textContent=line+(s.stale?' (stale)':'');status.setAttribute('data-state',s.state);clear(banner);`,
  // With nothing to show behind it the panel replaces the screen; otherwise it sits above the screen, which stays.
  `const panel=s.panel||null;if(panel!==null&&panel.placement==='body'){clear(main);clear(crumbsEl);crumbsEl.appendChild(make('span','Delivery','crumb current'));model=null;shownEntry=null;shownKind=null;head=null;bodyEl=null;search=null;main.setAttribute('data-screen','panel');renderPanel(main,panel);}`,
  `else if(panel!==null)renderPanel(banner,panel);return;}`,
  `if(p.type==='screen'){render(p.model);return;}`,
  // The one live region (s5): cleared, then set, so a repeated text is announced again.
  `if(p.type==='announce'){announceEl.textContent='';announceEl.textContent=String(p.text);return;}`,
  `});`,
  // Density (s5) lives in the webview's own state, kept by VS Code across reloads, and is mirrored to the host.
  `const DENSITIES=['compact','comfortable'];`,
  `const savedState=function(){try{const st=vs.getState();return st&&typeof st==='object'?st:{};}catch(e){return {};}};`,
  `const applyDensity=function(d){document.body.setAttribute('data-density',d);for(const x of DENSITIES)byId('density-'+x).setAttribute('aria-pressed',x===d?'true':'false');};`,
  `const chooseDensity=function(d){applyDensity(d);try{vs.setState(Object.assign({},savedState(),{density:d}));}catch(e){}send({type:'set-density',density:d});};`,
  `for(const d of DENSITIES)byId('density-'+d).addEventListener('click',function(){chooseDensity(d);});`,
  `const restored=savedState().density;`,
  `const initialDensity=restored==='compact'||restored==='comfortable'?restored:'comfortable';`,
  `applyDensity(initialDensity);send({type:'set-density',density:initialDensity});`,
  `send({type:'ready'});`,
  `})();`,
].join('');

/**
 * The board's one stylesheet (E2 s5, restyled to the PRD's mocks A-F by ISSUE-b2687832), under the existing style-src
 * 'unsafe-inline'. Theme colours come only from VS Code's --vscode-* variables: the PRD's tones map to the testing,
 * warning, error and description colours over the input-validation and widget backgrounds. Wide panes set the six
 * board columns side by side and, when an item is open, the details as a side column; below 600 px the same sections
 * stack into one list grouped by stage, empty stages wrapping onto one compact line after the others. No rule hides
 * content: the DOM is the same at every width and density, and only the [hidden] details pane is out of view while
 * nothing is selected. Density changes spacing and font size only.
 */
export const BOARD_STYLE = [
  `body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0;padding:0 16px 16px;line-height:1.45;}`,
  `button{font:inherit;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);border:1px solid var(--vscode-contrastBorder,transparent);border-radius:4px;padding:3px 10px;cursor:pointer;}`,
  `button:hover{background:var(--vscode-button-secondaryHoverBackground);}`,
  `button[aria-pressed="true"]{color:var(--vscode-button-foreground);background:var(--vscode-button-background);}`,
  `input,select{font:inherit;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,transparent);border-radius:4px;padding:3px 8px;}`,
  `:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px;}`,
  // App bar: wordmark and breadcrumb on the left, freshness, read-only marker, refresh and density on the right.
  `.appbar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px 16px;margin:0 -16px;padding:8px 16px;background:var(--vscode-sideBar-background,var(--vscode-editorWidget-background));border-bottom:1px solid var(--vscode-panel-border);}`,
  `.brand,.appbar-tools,.density{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}`,
  `.wordmark{font-weight:700;color:var(--vscode-textLink-foreground);}`,
  `.crumb,#status,.readonly,#totals,.muted{color:var(--vscode-descriptionForeground);font-size:var(--small);}`,
  `#status{margin:0;}`,
  `.page-title{font-size:1.4em;font-weight:600;margin:14px 0 2px;}`,
  `.announce{color:var(--vscode-descriptionForeground);font-size:var(--small);margin:0;min-height:1em;}`,
  // Underline tabs.
  `.tabs{display:flex;gap:18px;border-bottom:1px solid var(--vscode-panel-border);margin:10px 0 0;}`,
  `.tabs button{background:none;border:0;border-bottom:2px solid transparent;border-radius:0;padding:6px 0;color:var(--vscode-descriptionForeground);}`,
  `.tabs button[aria-pressed="true"],.tabs button[aria-selected="true"]{background:none;color:var(--vscode-foreground);border-bottom-color:var(--vscode-focusBorder);font-weight:600;}`,
  // Chip toolbar: search, scope chips and the attention chip.
  `.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0;}`,
  `.chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}`,
  `.chip{border-radius:999px;padding:2px 10px;font-size:var(--small);border:1px solid var(--vscode-panel-border);background:var(--vscode-editorWidget-background);color:var(--vscode-descriptionForeground);}`,
  `.chip[aria-pressed="true"]{border-color:var(--vscode-focusBorder);background:var(--vscode-list-activeSelectionBackground,var(--vscode-button-background));color:var(--vscode-list-activeSelectionForeground,var(--vscode-button-foreground));}`,
  // Tone pills: the label carries the meaning, the tone only tints it.
  `.badges{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 0;padding:0;list-style:none;}`,
  `.badge,.pill,.count{display:inline-block;border-radius:999px;padding:0 8px;font-size:var(--small);border:1px solid var(--vscode-panel-border);background:var(--vscode-editorWidget-background);color:var(--vscode-descriptionForeground);}`,
  `[data-tone="success"]{color:var(--vscode-testing-iconPassed);border-color:var(--vscode-testing-iconPassed);}`,
  `[data-tone="warning"]{color:var(--vscode-editorWarning-foreground);background:var(--vscode-inputValidation-warningBackground);border-color:var(--vscode-inputValidation-warningBorder);}`,
  `[data-tone="danger"]{color:var(--vscode-errorForeground);background:var(--vscode-inputValidation-errorBackground);border-color:var(--vscode-inputValidation-errorBorder);}`,
  `[data-tone="neutral"]{color:var(--vscode-descriptionForeground);}`,
  // State panels.
  `.panel{border:1px solid var(--vscode-panel-border);border-radius:6px;padding:12px 16px;margin:10px 0;background:var(--vscode-editorWidget-background);}`,
  `.panel[data-kind="unavailable"],.panel[data-kind="refresh-failed"],.panel[data-kind="partial"]{border-left:3px solid var(--vscode-inputValidation-warningBorder);background:var(--vscode-inputValidation-warningBackground);}`,
  `.panel-title{font-weight:600;margin:0 0 4px;}`,
  `.panel-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}`,
  `.link{background:none;border:0;padding:0;color:var(--vscode-textLink-foreground);text-align:left;}`,
  `.link:hover{background:none;text-decoration:underline;}`,
  `.row-title{font-weight:600;font-size:1em;}`,
  `.details-head h2{font-size:1.15em;margin:2px 0 6px;}`,
  `.details-chips{margin:8px 0;}`,
  `.panel p{margin:4px 0;}`,
  // Layout: the details pane precedes the board in the DOM, so a narrow pane shows it first.
  `.layout{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start;}`,
  `#details{border:1px solid var(--vscode-panel-border);border-radius:6px;padding:var(--pad) 14px;background:var(--vscode-editorWidget-background);overflow-wrap:anywhere;}`,
  `#details pre{white-space:pre-wrap;overflow-wrap:anywhere;}`,
  `.details-conflict{border-left:3px solid var(--vscode-inputValidation-warningBorder);background:var(--vscode-inputValidation-warningBackground);color:var(--vscode-foreground);border-radius:0 4px 4px 0;padding:8px 12px;margin:10px 0;}`,
  `.why{background:var(--vscode-textBlockQuote-background);border-left:3px solid var(--vscode-textLink-foreground);border-radius:0 4px 4px 0;padding:8px 12px;margin:8px 0;}`,
  `.chain{list-style:none;margin:6px 0;padding:0;}`,
  `.chain li{display:grid;grid-template-columns:4.5em minmax(0,1fr);gap:8px;padding:6px 0;border-bottom:1px solid var(--vscode-panel-border);}`,
  `.task{border-top:1px solid var(--vscode-panel-border);padding:6px 0;}`,
  `.task summary{cursor:pointer;font-weight:600;}`,
  `.task-checks{list-style:none;padding:0;margin:6px 0;}`,
  `.task-checks li::before{content:"\\2610  ";color:var(--vscode-descriptionForeground);}`,
  // Board: six equal columns; each column heading carries a count chip.
  `.board{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:var(--gap);align-items:start;}`,
  `.board ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:var(--gap);}`,
  `.board ul.badges{flex-direction:row;flex-wrap:wrap;gap:4px;}`,
  // The epics and issues views list rows, not columns.
  `.board[data-view="epics"],.board[data-view="issues"]{display:block;}`,
  `.issue{border-bottom:1px solid var(--vscode-panel-border);padding:10px 0;}`,
  `.board h2{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:var(--small);font-weight:600;margin:0 0 8px;}`,
  `.card{border:1px solid var(--vscode-panel-border);border-radius:6px;background:var(--vscode-editorWidget-background);padding:var(--pad);overflow-wrap:anywhere;cursor:pointer;}`,
  `.card:hover{border-color:var(--vscode-focusBorder);}`,
  `.kicker{font-family:var(--vscode-editor-font-family);font-size:0.8em;letter-spacing:0.3px;color:var(--vscode-descriptionForeground);}`,
  `.card-title{font-weight:600;margin:2px 0;}`,
  `.card-epic,.card-tasks{color:var(--vscode-descriptionForeground);font-size:var(--small);}`,
  // Epic rollup rows: name and counts, the completion meter, the attention chip.
  `.epic-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(7rem,9rem) auto;gap:8px 18px;align-items:center;padding:12px 0;border-bottom:1px solid var(--vscode-panel-border);}`,
  `.epic-row h2{font-size:1em;margin:2px 0;}`,
  `.epic-row p{margin:0;}`,
  `.meter{height:5px;border-radius:3px;background:var(--vscode-panel-border);margin-top:6px;}`,
  `.meter>span{display:block;height:5px;border-radius:3px;background:var(--vscode-testing-iconPassed);}`,
  `body[data-density="comfortable"]{--gap:10px;--pad:8px;--small:0.9em;}`,
  `body[data-density="compact"]{--gap:4px;--pad:3px;--small:0.85em;font-size:0.92em;}`,
  `body:not([data-density]){--gap:10px;--pad:8px;--small:0.9em;}`,
  // Wide: an open item sits in a side column beside the board.
  `@media (min-width:1000px){.layout:has(> #details:not([hidden])){grid-template-columns:minmax(0,1fr) minmax(18rem,26rem);}#details{grid-column:2;grid-row:1;position:sticky;top:8px;}.board{grid-column:1;grid-row:1;}}`,
  // Narrow: one list grouped by stage; empty stages wrap onto one compact line after the others.
  `@media (max-width:600px){.board{display:flex;flex-wrap:wrap;gap:12px 8px;}.board>section{flex:1 0 100%;}.board>section[data-empty="true"]{order:1;flex:0 0 auto;}.board>section[data-empty="true"] h2{margin:0;}.board h2{font-size:1em;margin:8px 0 4px;}.epic-row{grid-template-columns:minmax(0,1fr) minmax(6rem,8rem);}.epic-row>:last-child{grid-column:1/-1;}}`,
].join('');

export function renderBoardDocument(nonce: string): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">` +
    `<title>${BOARD_TITLE}</title><style>${BOARD_STYLE}</style></head><body>` +
    // App bar: wordmark and breadcrumb; the freshness line, the read-only marker, refresh and density.
    `<header class="appbar"><div class="brand"><span class="wordmark">insrc</span><nav id="crumbs" class="crumbs" aria-label="Breadcrumb"></nav></div>` +
    // The status line keeps role=status but is not a live region: #announce is the one announcer (s5).
    `<div class="appbar-tools"><p id="status" role="status"></p><span class="readonly">Read-only</span>` +
    `<button id="refresh" type="button">Refresh</button>` +
    `<div class="density" role="group" aria-label="Density">` +
    `<button id="density-compact" type="button" aria-pressed="false">Compact</button>` +
    `<button id="density-comfortable" type="button" aria-pressed="true">Comfortable</button>` +
    `</div></div></header>` +
    `<p id="announce" class="announce" aria-live="polite" aria-atomic="true"></p>` +
    // A failed refresh over a shown board and partial evidence sit here, above the screen, which stays usable.
    `<div id="banner"></div>` +
    // One screen at a time: each screen message replaces what is here.
    `<main id="main"></main>` +
    `<script nonce="${attr(nonce)}">${BOARD_WEBVIEW_SCRIPT}</script></body></html>`
  );
}

export function createDeliveryBoardHost(deps: DeliveryBoardHostDeps): DeliveryBoardHost {
  /** The injected logger, made safe: logging never throws into the board's own paths. */
  const log: ChatPanelLogger = {
    warn: (m) => { try { deps.logger.warn(m); } catch { /* a failing logger must not break the board */ } },
    error: (m) => { try { deps.logger.error(m); } catch { /* a failing logger must not break the board */ } },
  };
  let channel: ChatPanelChannel | undefined;
  let state: BoardState = initialBoardState();
  let nextSeq = 0;
  /** Bumped on every dispose; an answer from an earlier panel generation is discarded. */
  let generation = 0;
  /** The details memory (s4); a new one with each panel. */
  const newMemory = (): DetailsMemory => createDetailsMemory({
    client: deps.client, log, labels: DISPLAY_LABELS, reviewPane: deps.reviewPane, rerender: applyAfterRead,
  });
  let memory = newMemory();

  /** A re-derive after an answer arrives; a throw is logged, and apply() leaves the board as it was. */
  function applyAfterRead(what: string): void {
    try {
      apply(state);
    } catch (err) {
      log.error(`delivery board: ${what} could not be shown: ${errorText(err)}`);
    }
  }

  /**
   * Derive the messages first; the new state is kept only when its messages can be built, so a bad snapshot or
   * navigation never becomes the board's, and a throw while deriving leaves it as it was and posts nothing. Posting
   * itself is fire-and-forget (ChatPanelChannel.postMessage never rejects inward).
   */
  function apply(next: BoardState): void {
    const shown = shownSnapshot(next.status)?.snapshot ?? null;
    const messages = boardDownMessages(next, DISPLAY_LABELS, deps.now(), id => (shown === null ? null : memory.model(shown, id)));
    // Told before anything is kept, so a throw here leaves state as it was and posts nothing.
    memory.kept(shown, currentItemId(next.selection));
    state = next;
    for (const m of messages) channel?.postMessage(m);
  }

  function dispatch(event: BoardEvent): void {
    apply(reduceBoardState(state, event));
  }

  function elapsedMs(since: string): number {
    const ms = Date.parse(deps.now()) - Date.parse(since);
    return Number.isFinite(ms) ? Math.max(0, ms) : 0;
  }

  async function refresh(): Promise<void> {
    const gen = generation;
    const seq = ++nextSeq;
    const started = deps.now();
    try {
      dispatch({ type: 'refresh-requested', seq });
    } catch (err) {
      // The loading state could not be shown; state is unchanged, so no request is made for it.
      log.error(`delivery board: refresh ${seq} could not start: ${errorText(err)}`);
      return;
    }
    // The client resolves every failure to a typed result; a throw is turned into one so the board never stays on 'loading'.
    let result: DeliveryResult<DeliverySnapshot>;
    try {
      result = await deps.client.snapshot();
    } catch (err) {
      result = { ok: false, failure: { kind: 'read-failed', message: errorText(err) } };
    }
    if (gen !== generation || channel === undefined) return;   // the panel was closed meanwhile
    const at = deps.now();
    if (seq !== state.latestSeq) {
      const n = result.ok ? result.value.items.length : 0;
      const answer = result.ok ? `${n} item${n === 1 ? '' : 's'}` : result.failure.kind;
      log.warn(`delivery board: dropped the answer to refresh ${seq} (${answer}); refresh ${state.latestSeq} is newer (${elapsedMs(started)} ms)`);
      return;
    }
    if (!result.ok) {
      log.error(`delivery board: refresh ${seq} ${result.failure.kind} after ${elapsedMs(started)} ms: ${result.failure.message}`);
    }
    let applied = false;
    try {
      dispatch({ type: 'snapshot-arrived', seq, result, at });
      applied = true;
    } catch (err) {
      // A snapshot that slipped past the client's checks but cannot be rendered: state still holds the previous
      // board, so this shows a failed refresh over it rather than a frozen board.
      const message = errorText(err);
      log.error(`delivery board: refresh ${seq} could not be applied: ${message}`);
      try {
        dispatch({ type: 'snapshot-arrived', seq, result: { ok: false, failure: { kind: 'read-failed', message } }, at });
      } catch (again) {
        // Last resort: the board keeps whatever it last posted.
        log.error(`delivery board: refresh ${seq} failure could not be shown: ${errorText(again)}`);
      }
    }
    // Outside the tries, like the stage log below: an announcement that cannot be posted is only logged.
    try {
      announceRefresh(seq);
    } catch (err) {
      log.error(`delivery board: refresh ${seq} result could not be announced: ${errorText(err)}`);
    }
    // Outside the try: a failure to log must never turn a board that rendered into a failed refresh.
    if (applied && result.ok) {
      try {
        logUnknownStages(seq, result.value);
      } catch (err) {
        log.error(`delivery board: refresh ${seq} unknown stages could not be listed: ${errorText(err)}`);
      }
    }
  }

  /** Fire-and-forget refresh: every step after its await is already guarded, and anything else is still logged. */
  function startRefresh(): void {
    refresh().catch((err: unknown) => log.error(`delivery board: refresh failed unexpectedly: ${errorText(err)}`));
  }

  /**
   * One announcement per settled refresh (s5): the snapshot-wide counts when ready, else the status message; led by
   * the notice when the refresh removed what the reader was viewing.
   */
  function announceRefresh(seq: number): void {
    if (seq !== state.latestSeq || state.status.state === 'loading') return;
    const shown = shownSnapshot(state.status);
    if (state.status.state === 'ready' && shown !== null) {
      const n = placeableCount(shown.snapshot);
      const attention = shown.snapshot.items.filter(i => isPlaceable(i) && i.needsAttention).length;
      const lead = state.selectionNotice === null ? '' : `${state.selectionNotice} `;
      announce(`${lead}Board refreshed: ${n} item${n === 1 ? '' : 's'}, ${attention} needing attention`);
      return;
    }
    const message = statusView(state.status, deps.now()).message;
    if (message !== null) announce(message);
  }

  /** The sc3 'announce' message, written by the webview into its one live region. */
  function announce(text: string): void {
    channel?.postMessage({ v: 1, payload: { type: 'announce', text } });
  }

  /** Once per applied refresh: the items left off the board because their stage is not one of the six. */
  function logUnknownStages(seq: number, snapshot: DeliverySnapshot): void {
    const unknown = unknownStages(snapshot);
    if (unknown.size === 0) return;
    const named = [...unknown].map(([stage, n]) => `${stage} (${n})`).join(', ');
    log.warn(`delivery board: refresh ${seq} left items with unknown stages off the board: ${named}`);
  }

  /** The shown snapshot's item with this id, if any. */
  function itemOnBoard(id: string) {
    return shownSnapshot(state.status)?.snapshot.items.find(i => i.id === id);
  }

  /** The screen the reader is on, in words, for the announcement (s5). */
  function screenWords(s: BoardState, opened: boolean): string | null {
    const screen = currentEntry(s.selection).screen;
    if (screen.kind === 'list') return opened ? `Showing ${DISPLAY_LABELS.views[screen.view]}` : DISPLAY_LABELS.views[screen.view];
    const item = itemOnBoard(screen.kind === 'epic' ? screen.epicItemId : screen.itemId);
    if (item === undefined) return null;
    if (screen.kind === 'epic') return opened ? `Epic: ${titleOf(item)}` : titleOf(item);
    const stage = item.stage === null ? '' : ` \u00b7 ${labelOf(DISPLAY_LABELS.stage, item.stage.stage)}`;
    return opened ? `Opened: ${titleOf(item)}${stage}` : titleOf(item);
  }

  /**
   * Navigate, then announce once when the screen changed: 'Opened: …', 'Epic: …' or 'Showing …' for a new screen,
   * 'Back to …' for a return. Posted after the state is kept, so a failure here is only logged by the message handler.
   */
  function go(intent: NavIntent): void {
    const before = currentEntry(state.selection).id;
    dispatch({ type: 'navigate', intent });
    if (currentEntry(state.selection).id === before) return;
    const back = intent.type === 'back' || intent.type === 'go-to-crumb';
    const words = screenWords(state, !back);
    if (words !== null) announce(back ? `Back to ${words}` : words);
  }

  /** open-epic must name an epic on the board; open-item a story or issue on it, and an epic id opens the epic. */
  function open(id: string, asEpic: boolean): void {
    const item = itemOnBoard(id);
    if (item !== undefined && item.kind === 'epic') { go({ type: 'open-epic', epicItemId: id }); return; }
    if (!asEpic && item !== undefined && isPlaceable(item)) { go({ type: 'open-item', itemId: id }); return; }
    log.warn('delivery board: ignored a link to an item that is not on the board');
  }

  function handle(msg: BoardUpMessage): void {
    switch (msg.type) {
      case 'ready': apply(state); return;
      case 'refresh': startRefresh(); return;
      // The old tabs' 'board' is All work until the screens replace them (t4).
      case 'set-view': go({ type: 'set-view', view: msg.view === 'board' ? 'all' : msg.view }); return;
      case 'open-epic': open(msg.epicItemId, true); return;
      case 'open-item': open(msg.itemId, false); return;
      // The old page's messages, mapped onto the trail until t7 removes them.
      case 'set-scope': {
        const view: ListView = msg.scope.kind === 'standalone' ? 'standalone' : 'all';
        if (msg.scope.kind === 'epic') open(msg.scope.epicItemId, true);
        else go({ type: 'set-view', view });
        return;
      }
      case 'select-item': open(msg.itemId, false); return;
      case 'close-details': if (currentItemId(state.selection) !== null) go({ type: 'back' }); return;
      case 'set-item-tab': go({ type: 'set-item-tab', tab: msg.tab }); return;
      case 'back': go({ type: 'back' }); return;
      case 'go-to-crumb': go({ type: 'go-to-crumb', index: msg.index }); return;
      case 'set-search': dispatch({ type: 'navigate', intent: { type: 'set-search', search: msg.search } }); return;
      case 'set-attention': dispatch({ type: 'navigate', intent: { type: 'set-attention', on: msg.on } }); return;
      // Clears the search and the attention filter of the screen shown; its paging resets like any filter change.
      case 'clear-filters': dispatch({ type: 'navigate', intent: { type: 'clear-filters' } }); return;
      case 'show-more': dispatch({ type: 'navigate', intent: { type: 'show-more', stage: msg.stage } }); return;
      case 'set-density': dispatch({ type: 'set-density', density: msg.density }); return;
      case 'open-evidence': memory.openEvidence(msg.itemId, msg.artifactId); return;
    }
  }

  function reset(): void {
    generation++;
    channel = undefined;
    state = initialBoardState();
    nextSeq = 0;
    memory.dispose();
    memory = newMemory();
  }

  return {
    open(): void {
      if (channel !== undefined) {
        channel.reveal();
        startRefresh();
        return;
      }
      const opened = deps.createPanel({ viewType: BOARD_VIEW_TYPE, title: BOARD_TITLE });
      channel = opened;
      opened.onDidDispose(() => { if (channel === opened) reset(); });
      opened.onMessage(raw => {
        const msg = parseBoardUpMessage(raw);
        if (msg === null) {
          log.warn('delivery board: ignored a malformed webview message');
          return;
        }
        try {
          handle(msg);
        } catch (err) {
          // apply() keeps state and paging only when they render, so the board stays as it was.
          log.error(`delivery board: ${msg.type} could not be shown: ${errorText(err)}`);
        }
      });
      opened.setHtml(renderBoardDocument(deps.genNonce()));
      startRefresh();
    },
    dispose(): void {
      const open = channel;
      reset();
      open?.dispose();
    },
  };
}
