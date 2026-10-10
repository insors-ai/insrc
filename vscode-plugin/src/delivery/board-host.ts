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
 * renders the status and one screen at a time (its breadcrumb, filters, stage
 * sections, rows and item tabs) as text (textContent only) and posts only
 * BoardUpMessage envelopes. vscode-free: extension.ts supplies the panel.
 *
 * The item details (E2 s4): a story's or issue's screen is built from the
 * details memory (details-memory.ts). The host tells the memory the item of
 * each state it keeps (null on any other screen), routes open-evidence to it,
 * and starts a new memory with each panel.
 */

import { attr, type ChatPanelChannel, type ChatPanelLogger } from '../chat/chat-panel.js';
import type { Envelope } from '../chat/protocol.js';
import { isPlaceable, unknownStages } from './board-model.js';
import { parseBoardUpMessage, type BoardUpMessage } from './board-protocol.js';
import {
  boardDownMessages, currentEntry, currentItemId, initialBoardState, reduceBoardState, refreshAnnouncement, screenAnnouncement, shownSnapshot,
  type BoardEvent, type BoardState, type NavIntent,
} from './board-state.js';
import type { DeliveryClient, DeliveryResult } from './delivery-client.js';
import type { DeliverySnapshot } from './delivery-contract.js';
import { createDetailsMemory, type DetailsMemory } from './details-memory.js';
import { errorText } from './guards.js';
import { DISPLAY_LABELS, msBetween, plural } from './labels.js';

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
  `let model=null,shownEntry=null,shownKind=null,narrow=false,head=null,top=null,bodyEl=null,search=null;`,
  `const isNarrow=function(){const w=document.documentElement.clientWidth;return typeof w==='number'&&w>0&&w<=480;};`,
  `window.addEventListener('scroll',function(){if(shownEntry!==null)scrollOf[shownEntry]=window.scrollY||0;});`,
  `window.addEventListener('resize',function(){if(model!==null&&isNarrow()!==narrow)render(model);});`,
  // Escape on an epic's board or an item's screen goes back, unless the reader is typing in the search box.
  `main.addEventListener('keydown',function(e){if(e.key==='Escape'&&model!==null&&model.back!==null&&document.activeElement!==search){e.preventDefault();send({type:'back'});}});`,
  // A re-render keeps focus on the element with the same data-key.
  `const keyed=function(e,k){e.setAttribute('data-key',k);return e;};`,
  `const focusedKey=function(){const a=document.activeElement;return a&&a.getAttribute?a.getAttribute('data-key'):null;};`,
  `const findKey=function(root,k){if(root.getAttribute&&root.getAttribute('data-key')===k)return root;for(const c of root.children){const f=findKey(c,k);if(f)return f;}return null;};`,
  // The breadcrumb: the wordmark, then earlier crumbs as buttons back to their trail entry, separators, and the current
  // place. A narrow pane leaves the wordmark out and shows only the back step and the current place.
  `const here=function(text){const s=make('span',text,'here');s.setAttribute('aria-current','page');return s;};`,
  `function renderCrumbs(m){clear(crumbsEl);const last=m.crumbs[m.crumbs.length-1];`,
  `if(narrow){if(m.back!==null){crumbsEl.appendChild(keyed(button(m.back.label,function(){send({type:'back'});},'crumb'),'crumb-back'));crumbsEl.appendChild(make('span','/','sep'));}crumbsEl.appendChild(here(last.label));return;}`,
  `crumbsEl.appendChild(make('span','insrc','wordmark'));`,
  `m.crumbs.forEach(function(c,i){if(i>0)crumbsEl.appendChild(make('span','/','sep'));`,
  `if(i===m.crumbs.length-1)crumbsEl.appendChild(here(c.label));`,
  `else if(c.index<last.index)crumbsEl.appendChild(keyed(button(c.label,function(){send({type:'go-to-crumb',index:c.index});},'crumb'),'crumb-'+i));`,
  `else crumbsEl.appendChild(make('span',c.label,'crumb'));});}`,
  // The filter bar: the four views (on one of the four views only), Needs attention, and the search box.
  `function buildFilters(f,back){const bar=make('div',undefined,'filterbar');if(back!==null)bar.appendChild(keyed(button(back.label,function(){send({type:'back'});},'btn ghost back'),'back'));`,
  `if(f.views){const g=make('nav',undefined,'seg');g.setAttribute('aria-label','Show');const views=[];`,
  `for(const v of VIEWS){const b=keyed(button(L.views[v],function(){send({type:'set-view',view:v});},'view'),'view-'+v);b.setAttribute('data-view',v);`,
  `b.addEventListener('keydown',function(e){const step=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(step===0)return;e.preventDefault();views[(VIEWS.indexOf(v)+step+VIEWS.length)%VIEWS.length].focus();});views.push(b);g.appendChild(b);}bar.appendChild(g);}`,
  `const att=keyed(button(L.needsAttention,function(){send({type:'set-attention',on:att.getAttribute('aria-pressed')!=='true'});},'toggle attention'),'attention');bar.appendChild(att);`,
  `search=keyed(make('input',undefined,'search'),'search');search.setAttribute('type','search');search.setAttribute('aria-label','Search');`,
  `search.addEventListener('input',function(){send({type:'set-search',search:String(search.value)});});bar.appendChild(search);return bar;}`,
  `function markFilters(f){if(f===null||head===null)return;`,
  `for(const b of head.querySelectorAll('button.view')){if(b.getAttribute('data-view')===f.view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}`,
  `const att=head.querySelectorAll('button.attention')[0];if(att){att.setAttribute('aria-pressed',f.needsAttentionOnly?'true':'false');att.textContent=f.needsAttentionOnly?L.needsAttention+' \\u00d7':L.needsAttention;}`,
  `if(search!==null){search.setAttribute('placeholder',f.searchPlaceholder);if(document.activeElement!==search)search.value=f.search;}}`,
  // State panels: the status panel goes to the banner or, with nothing to show behind it, replaces the screen; a
  // view's no-matches panel replaces its list area.
  `const WARN_PANELS=['refresh-failed','unavailable','partial'];`,
  `function renderPanel(box,p){const d=make('div',undefined,WARN_PANELS.indexOf(p.kind)>=0?'panel warnp':'panel');d.setAttribute('data-kind',p.kind);d.setAttribute('role','note');`,
  `d.appendChild(make('h3',p.title));if(p.text)d.appendChild(make('p',p.text));`,
  `if(p.stale)d.appendChild(pill('Stale','warning'));`,
  `if(p.affected&&p.affected.length>0){const dis=make('details');dis.appendChild(make('summary','Inspect affected records'));const ul=make('ul');`,
  `for(const a of p.affected){const li=make('li');if(a.artifactIds.length>0)li.appendChild(make('code',a.artifactIds.join(', ')));li.appendChild(make('span',(a.artifactIds.length>0?' \\u2014 ':'')+a.text));ul.appendChild(li);}dis.appendChild(ul);d.appendChild(dis);}`,
  `const acts=make('div',undefined,'panel-actions');`,
  `if(p.action==='retry')acts.appendChild(button('Retry',function(){send({type:'refresh'});},'btn'));`,
  `if(p.action==='clear-filters')acts.appendChild(button('Clear filters',function(){if(search!==null)search.value='';send({type:'clear-filters'});},'btn primary'));`,
  `if(acts.firstChild)d.appendChild(acts);box.appendChild(d);}`,
  // Cards: kicker, title, epic line, task summary, badges; a card opens its item's screen.
  `const cardsOnScreen=function(){return Array.prototype.slice.call(main.querySelectorAll('li.card'));};`,
  `const moveFocus=function(from,step){const cards=cardsOnScreen();const next=cards[cards.indexOf(from)+step];if(next)next.focus();};`,
  `function renderCard(c,showEpic){const li=keyed(make('li',undefined,'card'),'item-'+c.itemId);li.setAttribute('data-item-id',c.itemId);li.setAttribute('aria-label',c.accessibleLabel);li.setAttribute('tabindex','0');`,
  `li.appendChild(make('div',KICKER[c.kind]+' \\u00b7 '+c.compactId,'kicker'));li.appendChild(make('div',c.title,'t'));`,
  `const epicLine=!showEpic?'':c.standalone?'Standalone':c.epicTitle===null?'':c.epicTitle;`,
  `const line=[epicLine,c.taskSummary===null?'':c.taskSummary.label].filter(function(t){return t!=='';}).join(' \\u00b7 ');if(line!=='')li.appendChild(make('div',line,'muted'));`,
  `if(c.badges.length>0){const pills=make('div',undefined,'pills');for(const b of c.badges){const t=pill(b.label,b.tone);t.setAttribute('data-kind',b.kind);pills.appendChild(t);}li.appendChild(pills);}`,
  `const open=function(){send({type:'open-item',itemId:c.itemId});};li.addEventListener('click',open);`,
  `li.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}else if(e.key==='ArrowDown'){e.preventDefault();moveFocus(li,1);}else if(e.key==='ArrowUp'){e.preventDefault();moveFocus(li,-1);}});return li;}`,
  // A stage box: a <details> whose summary shows the label, any hint, and the count at the right. The board screens
  // and the Issues screen share it, and the reader's own open or closed choice is kept per trail entry and stage.
  `function accBox(sec,noun){const d=make('details',undefined,'acc');d.setAttribute('data-stage',sec.stage);if(sec.total===0)d.setAttribute('data-empty','');const k=model.entryId+':'+sec.stage;`,
  `if(Object.prototype.hasOwnProperty.call(openOf,k)?openOf[k]:sec.defaultOpen)d.setAttribute('open','');`,
  `d.addEventListener('toggle',function(){openOf[k]=d.getAttribute('open')!==null;});`,
  `const s=keyed(make('summary'),'stage-'+sec.stage);s.appendChild(make('span',sec.label,'stage-label'));`,
  `const hint=sec.emptyText!==null?sec.emptyText:sec.hint;if(hint!==null)s.appendChild(make('span','\\u00b7 '+hint,'hint muted'));`,
  `const n=make('span',String(sec.total),'pill count');n.setAttribute('aria-label',plural(sec.total,noun[0],noun[1]));s.appendChild(n);d.appendChild(s);return d;}`,
  `function renderSection(sec,showEpic){const d=accBox(sec,['item','items']);`,
  `if(sec.cards.length>0){const ul=make('ul',undefined,'cards');ul.setAttribute('aria-label',sec.label);for(const c of sec.cards)ul.appendChild(renderCard(c,showEpic));d.appendChild(ul);}`,
  `if(sec.hiddenCount>0)d.appendChild(button('Show '+sec.hiddenCount+' more',function(){send({type:'show-more',stage:sec.stage});},'more'));return d;}`,
  // The empty stages folded into one line: always under Needs attention, and in a narrow pane as one closed box.
  `function renderFold(b){if(b.fold.text==='')return;if(b.fold.always){bodyEl.appendChild(make('p',b.fold.text,'fold'));return;}`,
  `const d=make('details',undefined,'acc fold');const k=model.entryId+':fold';if(openOf[k])d.setAttribute('open','');d.addEventListener('toggle',function(){openOf[k]=d.getAttribute('open')!==null;});`,
  `d.appendChild(keyed(make('summary',L.otherStages),'stage-fold'));d.appendChild(make('p',b.fold.text,'empty-line'));bodyEl.appendChild(d);}`,
  // An epic's completion: the label over a meter that names its denominator.
  `function completion(r){const box=make('div',undefined,'completion');box.appendChild(make('span',r.completionLabel,'muted'));`,
  `const meter=make('div',undefined,'meter');meter.setAttribute('role','meter');meter.setAttribute('aria-label',r.completionLabel);`,
  `meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax',String(r.storiesTotal));meter.setAttribute('aria-valuenow',String(r.storiesComplete));`,
  `const fill=make('span');fill.setAttribute('style','width:'+(r.storiesTotal===0?0:Math.round(100*r.storiesComplete/r.storiesTotal))+'%');meter.appendChild(fill);box.appendChild(meter);return box;}`,
  `const countsOf=function(r){return [plural(r.storiesTotal,'story','stories'),plural(r.taskCount,'task','tasks')].concat(r.issueCount>0?[plural(r.issueCount,'issue','issues')]:[]);};`,
  // An epic's board leads with the epic: kicker, heading and count pills on the left, its completion on the right.
  `function epicHead(title,r){const box=make('div',undefined,'between head');const left=make('div');left.appendChild(make('div','EPIC \\u00b7 '+r.compactId,'kicker'));`,
  `const h=keyed(make('h1',title),'title');h.setAttribute('tabindex','-1');left.appendChild(h);const pills=make('div',undefined,'pills');`,
  `for(const c of countsOf(r))pills.appendChild(make('span',c,'pill'));pills.appendChild(pill(r.attentionLabel,r.attentionTone,'pill attention-count'));left.appendChild(pills);`,
  `box.appendChild(left);box.appendChild(completion(r));return box;}`,
  `function renderTotals(label,showAll){const p=make('p',label,'count-line');if(showAll)p.appendChild(button('Show all',function(){send({type:'set-attention',on:false});},'link show-all'));bodyEl.appendChild(p);}`,
  // A board screen: the totals, then the six stages (or the no-matches panel). An epic's header is in the screen's top.
  `function renderStages(b){renderTotals(b.totalsLabel,b.showAll);if(b.emptyPanel!==null){renderPanel(bodyEl,b.emptyPanel);return;}`,
  `const showEpic=b.epic===null&&!(model.filters!==null&&model.filters.view==='standalone');const fold=b.fold.always||narrow;`,
  `for(const sec of b.sections){if(fold&&sec.total===0)continue;bodyEl.appendChild(renderSection(sec,showEpic));}if(fold)renderFold(b);}`,
  // The Epics screen: one row per epic (the name, the completion, the attention pill), each opening that epic's board.
  `function renderEpics(b){renderTotals(b.totalsLabel,false);if(b.emptyPanel!==null)renderPanel(bodyEl,b.emptyPanel);`,
  `else{const rows=make('div',undefined,'rows');rows.setAttribute('role','list');rows.setAttribute('aria-label','Epics');for(const r of b.rows){`,
  `const row=keyed(button('',function(){send({type:'open-epic',epicItemId:r.epicItemId});},'row'),'epic-'+r.epicItemId);row.setAttribute('data-epic',r.epicItemId);row.setAttribute('role','listitem');`,
  `const name=make('div');name.appendChild(make('div','EPIC \\u00b7 '+r.compactId,'kicker'));name.appendChild(make('div',r.title,'name'));name.appendChild(make('div',countsOf(r).join(' \\u00b7 '),'muted'));`,
  `row.appendChild(name);row.appendChild(completion(r));row.appendChild(pill(r.attentionLabel,r.attentionTone,'pill attention-count'));rows.appendChild(row);}bodyEl.appendChild(rows);}`,
  `const p=make('p','Work outside any epic is under ','muted standalone-link');p.appendChild(button(L.views.standalone,function(){send({type:'set-view',view:'standalone'});},'link'));bodyEl.appendChild(p);}`,
  // The Issues screen: the same stage boxes, each holding its issues' rows; a row opens the issue's screen.
  `function issueRow(e){const row=keyed(button('',function(){send({type:'open-item',itemId:e.card.itemId});},'row issue-row'),'item-'+e.card.itemId);row.setAttribute('data-item-id',e.card.itemId);row.setAttribute('aria-label',e.card.accessibleLabel);row.setAttribute('role','listitem');`,
  `const name=make('div');name.appendChild(make('div','ISSUE \\u00b7 '+e.card.compactId,'kicker'));name.appendChild(make('div',e.card.title,'name'));`,
  `const what=e.parent!==null?'Corrects '+e.parent.title:e.parentNotice!==null?e.parentNotice:e.card.standalone?'Standalone':'';`,
  `const fix=e.fixStories.length===0?'no fix story yet':e.fixStories.map(function(f){return 'fix story '+f.title+(f.stageLabel===null?'':' \\u00b7 '+f.stageLabel);}).join('; ');`,
  `name.appendChild(make('div',[what,fix].filter(function(t){return t!=='';}).join(' \\u00b7 '),'muted'));row.appendChild(name);const pills=make('div',undefined,'pills');`,
  `for(const b of e.card.badges){const t=pill(b.label,b.tone);t.setAttribute('data-kind',b.kind);pills.appendChild(t);}row.appendChild(pills);return row;}`,
  `function renderIssues(b){renderTotals(b.totalsLabel,b.showAll);if(b.emptyPanel!==null){renderPanel(bodyEl,b.emptyPanel);return;}const fold=b.fold.always||narrow;`,
  `for(const sec of b.sections){if(fold&&sec.total===0)continue;const d=accBox(sec,['issue','issues']);`,
  `if(sec.issues.length>0){const rows=make('div',undefined,'rows');rows.setAttribute('role','list');rows.setAttribute('aria-label',sec.label);for(const e of sec.issues)rows.appendChild(issueRow(e));d.appendChild(rows);}bodyEl.appendChild(d);}`,
  `if(fold)renderFold(b);}`,
  // A story's or issue's screen. Its head: the kicker, the heading, then the chips with the stage pill first.
  `function itemHead(d){const head=make('div',undefined,'head');head.appendChild(make('div',d.kicker,'kicker'));`,
  `const h=keyed(make('h1',model.title),'title');h.setAttribute('tabindex','-1');head.appendChild(h);`,
  `if(d.chips.length>0){const pills=make('div',undefined,'pills');for(const c of d.chips){const e=pill(c.label,c.tone,c.kind==='stage'?'pill stage-pill':'pill');e.setAttribute('data-kind',c.kind);pills.appendChild(e);}head.appendChild(pills);}return head;}`,
  // Any conflict comes straight after the head, before the tabs and any task.
  `function conflictBox(d){if(d.conflict===null)return null;const box=make('div',undefined,'warnbox');box.setAttribute('role','note');box.appendChild(make('b',d.conflict.headline));box.appendChild(make('p',d.conflict.text));return box;}`,
  `const backButton=function(){return model.back===null?null:keyed(button(model.back.label,function(){send({type:'back'});},'btn ghost back'),'back');};`,
  `const label=function(text){return make('div',text,'label');};`,
  `const link=function(text,payload,key){const b=keyed(button(text,function(){send(payload);},'link'),key);return b;};`,
  `const openLink=function(l){return l.kind==='epic'?{type:'open-epic',epicItemId:l.itemId}:{type:'open-item',itemId:l.itemId};};`,
  `function whyBox(box,d){if(d.stageReason===null)return;box.appendChild(label('Why this stage?'));const why=make('div',undefined,'why');why.appendChild(make('p',d.stageReason.text));`,
  `if(d.stageReason.artifactIds.length>0)why.appendChild(make('p','From '+d.stageReason.artifactIds.join(', '),'muted'));box.appendChild(why);}`,
  // The artifact chain: each row is the kind, the record and its review, and the approval as a tone pill.
  `function chainList(box,d){if(d.chain.length===0)return;box.appendChild(label('Artifact chain'));const ul=make('ul',undefined,'chain');ul.setAttribute('aria-label','Artifact chain');`,
  `for(const r of d.chain){const li=make('li');li.setAttribute('data-status',r.status);li.appendChild(make('b',r.kind));`,
  `li.appendChild(make('span',r.artifactId===null?'\\u2014':r.artifactId+(r.note===null?'':' \\u00b7 '+r.note),'muted'));li.appendChild(pill(r.label,r.tone));ul.appendChild(li);}box.appendChild(ul);}`,
  `function taskList(box,d){box.appendChild(label('Planned tasks'));`,
  `if(d.taskCounts!==null){const k=d.taskCounts;box.appendChild(make('p',k.passed+' passed, '+k.failed+' failed, '+k.unrecorded+' unrecorded, '+k.unplanned+' unplanned','task-counts muted'));}`,
  `if(d.tasks.length===0)box.appendChild(make('p','No task plan recorded yet.','muted'));`,
  `const list=make('div');list.setAttribute('role','list');list.setAttribute('aria-label','Tasks');`,
  `for(const t of d.tasks){const row=make('details',undefined,'task');row.setAttribute('role','listitem');row.setAttribute('data-item-id',t.taskItemId);`,
  `row.appendChild(make('summary',t.title===null?t.taskItemId:t.title));const pills=make('div',undefined,'pills');pills.appendChild(pill(t.resultLabel,t.resultTone));`,
  `if(t.dependsOn!==null)pills.appendChild(pill(t.dependsOn.length===0?'No dependencies':'Depends on '+t.dependsOn.join(', '),'neutral'));row.appendChild(pills);`,
  `if(t.acceptanceChecks!==null&&t.acceptanceChecks.length>0){const cl=make('ul',undefined,'checks');cl.setAttribute('aria-label','Acceptance checks');for(const c of t.acceptanceChecks)cl.appendChild(make('li',c));row.appendChild(cl);}`,
  `list.appendChild(row);}box.appendChild(list);if(d.planNotice!==null)box.appendChild(make('p',d.planNotice,'plan-notice'));}`,
  // Every record behind the item: the record, its approval, its review (with any override), and how it opens.
  `function recordsTable(box,d){box.appendChild(label('Records'));if(d.evidence.length===0){box.appendChild(make('p','No records yet.','muted'));return;}const wrap=make('div',undefined,'table-wrap');const t=make('table',undefined,'records');`,
  `const hr=make('tr');for(const h of ['Record','Approval','Review',''])hr.appendChild(make('th',h));const thead=make('thead');thead.appendChild(hr);t.appendChild(thead);const tb=make('tbody');`,
  `for(const r of d.evidence){const tr=make('tr');tr.setAttribute('data-artifact-id',r.artifactId);const rec=make('td');rec.appendChild(make('b',r.kindLabel));rec.appendChild(make('span',' '));rec.appendChild(make('span',r.artifactId,'kicker'));tr.appendChild(rec);`,
  `const appr=make('td',r.approvalLabel);if(r.approvedAt!==null)appr.appendChild(make('span',' \\u00b7 '+r.approvedAt,'muted'));tr.appendChild(appr);`,
  `const rev=make('td',r.reviewLabel===null?'\\u2014':r.reviewLabel);if(r.overrideLabel!==null)rev.appendChild(make('span',' \\u00b7 '+r.overrideLabel,'muted override'));tr.appendChild(rev);`,
  `const cell=make('td');cell.appendChild(keyed(button(r.opensIn==='review-pane'?'Open in review':'Open read-only',function(){send({type:'open-evidence',itemId:d.itemId,artifactId:r.artifactId});},'btn'),'open-'+r.artifactId));tr.appendChild(cell);tb.appendChild(tr);}`,
  `t.appendChild(tb);wrap.appendChild(t);box.appendChild(wrap);}`,
  `function recordsTab(box,d){recordsTable(box,d);`,
  `if(d.notices.length>0){box.appendChild(label('Notices'));for(const n of d.notices){const w=make('div',undefined,'warnbox notice');w.textContent=n;box.appendChild(w);}}`,
  `if(d.sourceIds.length>0)box.appendChild(make('p','Sources: '+d.sourceIds.join(', '),'source-ids muted'));`,
  `if(d.openedRecord!==null){box.appendChild(label('Record '+d.openedRecord.artifactId));box.appendChild(make('pre',d.openedRecord.text,'opened-record'));}}`,
  // The story screen's tabs (role=tab, roving tabindex, Left/Right between them); a narrow pane uses the short labels.
  `const TABS=['overview','evidence','linked'];`,
  `function renderTabs(current){const bar=make('nav',undefined,'subtabs');bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Story');const tabs=[];`,
  `for(const t of TABS){const b=keyed(button(narrow?L.itemTabs[t].short:L.itemTabs[t].long,function(){send({type:'set-item-tab',tab:t});},'tab'),'tab-'+t);b.setAttribute('role','tab');b.setAttribute('data-tab',t);`,
  `b.setAttribute('aria-selected',t===current?'true':'false');b.setAttribute('tabindex',t===current?'0':'-1');`,
  `b.addEventListener('keydown',function(e){const step=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(step===0)return;e.preventDefault();tabs[(TABS.indexOf(t)+step+TABS.length)%TABS.length].focus();});tabs.push(b);bar.appendChild(b);}bodyEl.appendChild(bar);}`,
  `const twoCols=function(){const cols=make('div',undefined,'cols');const left=make('div',undefined,'col-main');const side=make('div',undefined,'col-side');cols.appendChild(left);cols.appendChild(side);return {cols:cols,left:left,side:side};};`,
  `function renderStory(b){const d=b.details;const back=backButton();if(back!==null)bodyEl.appendChild(back);bodyEl.appendChild(itemHead(d));const c=conflictBox(d);if(c!==null)bodyEl.appendChild(c);`,
  `renderTabs(b.tab);const panel=make('div',undefined,'tab-panel');panel.setAttribute('role','tabpanel');panel.setAttribute('data-tab',b.tab);bodyEl.appendChild(panel);`,
  `if(b.tab==='overview'){const k=twoCols();taskList(k.left,d);whyBox(k.side,d);chainList(k.side,d);panel.appendChild(k.cols);return;}`,
  `if(b.tab==='evidence'){recordsTab(panel,d);return;}`,
  // Linked work: only recorded links, each opening its own screen; the issues correcting the story beside them.
  `const k=twoCols();panel.appendChild(k.cols);`,
  `const section=function(box,title,rows,empty){box.appendChild(label(title));if(rows.length===0){box.appendChild(make('div',empty,'item muted'));return;}const list=make('div',undefined,'linked');for(const r of rows){const it=make('div',undefined,'item');it.appendChild(r);list.appendChild(it);}box.appendChild(list);};`,
  `if(b.epic!==null){const e=b.epic;const row=make('div',undefined,'between');const l=link(e.title,{type:'open-epic',epicItemId:e.epicItemId},'epic-'+e.epicItemId);l.setAttribute('data-epic',e.epicItemId);row.appendChild(l);row.appendChild(make('span',e.completionLabel,'muted'));section(k.left,'Epic',[row],'');}`,
  `else{const parent=d.linked.filter(function(l){return l.relation==='parent';});if(parent.length>0)section(k.left,'Part of',parent.map(function(l){return link(l.title,{type:'open-item',itemId:l.itemId},'item-'+l.itemId);}),'');}`,
  `const corrects=d.linked.filter(function(l){return l.relation==='corrects';});if(corrects.length>0)section(k.left,'Corrects',corrects.map(function(l){return link(l.title,{type:'open-item',itemId:l.itemId},'item-'+l.itemId);}),'');`,
  // Children: one with a screen of its own opens it; a task has none, so it is named here and expanded on Overview & tasks.
  `const children=d.linked.filter(function(l){return l.relation==='child';});if(children.length>0)section(k.left,'Children',children.map(function(l){`,
  `if(l.kind==='task')return make('span','TASK · '+l.title+' · on '+L.itemTabs.overview.long,'muted');const r=link(KICKER[l.kind]+' · '+l.title,openLink(l),'item-'+l.itemId);r.setAttribute('data-item-id',l.itemId);return r;}),'');`,
  `section(k.side,'Issues correcting this story',d.correctedBy.map(function(l){const row=make('div',undefined,'between');const r=link('ISSUE \\u00b7 '+l.title,openLink(l),'item-'+l.itemId);r.setAttribute('data-item-id',l.itemId);row.appendChild(r);if(l.stageLabel!==null)row.appendChild(make('span',l.stageLabel,'pill stage-pill'));return row;}),'No issue records this story as its parent.');}`,
  // The issue screen: Back and what it corrects on one line, its head, then its fix stories and records beside why and the chain.
  `function renderIssue(b){const d=b.details,e=b.entry;const line=make('div',undefined,'between');const back=backButton();line.appendChild(back!==null?back:make('span'));`,
  `if(e.parent!==null)line.appendChild(keyed(button('Open what it corrects \\u2192',function(){send(openLink(e.parent));},'btn'),'corrects'));else if(e.parentNotice!==null)line.appendChild(pill('Unresolved parent','warning'));bodyEl.appendChild(line);`,
  `bodyEl.appendChild(itemHead(d));const c=conflictBox(d);if(c!==null)bodyEl.appendChild(c);const k=twoCols();`,
  `k.left.appendChild(label('Corrects'));if(e.parent!==null)k.left.appendChild(make('div','Corrects '+e.parent.title+(e.parent.stageLabel===null?'':' \\u00b7 '+e.parent.stageLabel),'item'));`,
  `else if(e.parentNotice!==null)k.left.appendChild(make('div',e.parentNotice,'warnbox parent-notice'));else k.left.appendChild(make('div','No parent recorded.','item muted'));`,
  `k.left.appendChild(label('Fix stories'));if(e.fixStories.length===0)k.left.appendChild(make('div','No fix story yet','item no-fix muted'));`,
  `else{const list=make('div');list.setAttribute('role','list');list.setAttribute('aria-label','Fix stories');for(const f of e.fixStories){const it=make('div',undefined,'item between');it.setAttribute('role','listitem');const r=link('STORY \\u00b7 '+f.title,{type:'open-item',itemId:f.itemId},'item-'+f.itemId);r.setAttribute('data-item-id',f.itemId);it.appendChild(r);if(f.stageLabel!==null)it.appendChild(make('span',f.stageLabel,'pill stage-pill'));list.appendChild(it);}k.left.appendChild(list);}`,
  `recordsTable(k.left,d);whyBox(k.side,d);chainList(k.side,d);bodyEl.appendChild(k.cols);}`,
  `function renderItem(b){if(b.kind==='story')renderStory(b);else renderIssue(b);}`,
  `function firstTarget(){return main.querySelectorAll('h1')[0]||findKey(head,'view-'+(model.filters===null?'':model.filters.view))||null;}`,
  `function render(m){const fresh=m.entryId!==shownEntry||m.body.kind!==shownKind;model=m;narrow=isNarrow();renderCrumbs(m);`,
  `const keep=fresh?null:focusedKey();`,
  `if(fresh){clear(main);search=null;head=make('div',undefined,'screen-head');bodyEl=make('div',undefined,'screen-body');main.appendChild(head);main.appendChild(bodyEl);main.setAttribute('data-screen',m.body.kind);`,
  `top=make('div',undefined,'screen-top');head.appendChild(top);if(m.filters!==null)head.appendChild(buildFilters(m.filters,m.back));}`,
  `clear(top);`,
  // The four list screens lead with their filter bar and have no heading; an epic's board leads with the epic.
  `if(m.body.kind==='stages'&&m.body.epic!==null)top.appendChild(epicHead(m.title,m.body.epic));`,
  `markFilters(m.filters);clear(bodyEl);`,
  `switch(m.body.kind){case 'stages':renderStages(m.body);break;case 'epics':renderEpics(m.body);break;case 'issues':renderIssues(m.body);break;default:renderItem(m.body);}`,
  `if(keep!==null){const f=findKey(main,keep)||findKey(crumbsEl,keep);if(f)f.focus();}`,
  // A new screen starts at the top with its first focus target focused: its heading, or on a list screen (which has
  // none) the chosen view. A screen the reader returned to gets its scroll back and focuses what was opened from it,
  // or that first target when the opener is no longer shown.
  `if(fresh){shownEntry=m.entryId;shownKind=m.body.kind;const target=firstTarget();`,
  `if(m.restored){window.scrollTo(0,scrollOf[m.entryId]||0);const o=m.focusItemId===null?null:findKey(bodyEl,'item-'+m.focusItemId)||findKey(bodyEl,'epic-'+m.focusItemId);const f=o||target;if(f)f.focus();}`,
  `else{window.scrollTo(0,0);if(target)target.focus();}}}`,
  `window.addEventListener('message',function(e){`,
  `const msg=e.data;if(!msg||msg.v!==1||!msg.payload)return;const p=msg.payload;`,
  `if(p.type==='status'){const s=p.status;`,
  `const line=s.state==='loading'?'Refreshing\\u2026'+(s.freshnessLabel?' \\u00b7 '+s.freshnessLabel:''):s.freshnessLabel||s.message||'';`,
  `status.textContent=line+(s.stale?' (stale)':'');status.setAttribute('data-state',s.state);clear(banner);`,
  // With nothing to show behind it the panel replaces the screen; otherwise it sits above the screen, which stays.
  `const panel=s.panel||null;if(panel!==null&&panel.placement==='body'){clear(main);clear(crumbsEl);crumbsEl.appendChild(make('span','insrc','wordmark'));crumbsEl.appendChild(here('Delivery'));model=null;shownEntry=null;shownKind=null;head=null;top=null;bodyEl=null;search=null;main.setAttribute('data-screen','panel');renderPanel(main,panel);}`,
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
 * The board's one stylesheet (E2 s5; screens, ISSUE-348d4663; the mocks' look, ISSUE-7405471c), under the existing
 * style-src 'unsafe-inline'. It is the approved mocks' product stylesheet (docs/plans/delivery-board-screen-mocks.html,
 * '.appbar' to '.center', without the gallery chrome), selector for selector, with colours only from VS Code's
 * --vscode-* variables. Three mock rules would hide content and are replaced: the details marker goes with
 * list-style:none on the summary alone, the segmented group rounds its first and last buttons instead of clipping
 * with overflow:hidden, and the wordmark is left out of the narrow breadcrumb by the script, not hidden. The mocks'
 * anchors are the board's buttons ('.seg a' becomes '.seg button', '.subtabs a' becomes '.subtabs button'), so those
 * rules also reset the button look. div.page is the size container, as the mocks' editor tab is, so its container
 * rules reach .body: the story's columns stack below 760 px, rows drop to two then one column, the search box takes a
 * full line. Every grid keeps a minimum width, the body never shrinks below 320 px, and the records table scrolls
 * sideways in its wrapper. Density changes spacing and the small text size only.
 */
export const BOARD_STYLE = [
  `*{box-sizing:border-box;}`,
  `html,body{margin:0;}`,
  `body{background:var(--vscode-editor-background);color:var(--vscode-foreground);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);line-height:1.45;min-width:320px;}`,
  `:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px;}`,
  `ul{margin:0;padding:0;list-style:none;}`,
  `h1,h2,h3{font-weight:600;}`,
  // A heading takes focus only so a screen reader starts there; it is not a control, so it draws no focus ring.
  `h1:focus{outline:none;}`,
  `.page{container-type:inline-size;min-width:320px;}`,
  // App bar.
  `.appbar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 14px;padding:8px 16px;border-bottom:1px solid var(--vscode-panel-border);}`,
  `.crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0;}`,
  `.wordmark{font-weight:700;color:var(--vscode-textLink-foreground);}`,
  `.crumbs .sep{color:var(--vscode-descriptionForeground);}`,
  `.crumbs .here{color:var(--vscode-foreground);font-weight:600;overflow-wrap:anywhere;}`,
  `.crumbs button{background:none;border:0;padding:0;font-size:inherit;color:var(--vscode-textLink-foreground);}`,
  `.crumbs button:hover{text-decoration:underline;}`,
  `.appbar-tools{display:flex;align-items:center;gap:10px;color:var(--vscode-descriptionForeground);font-size:12px;}`,
  `#status{margin:0;}`,
  `button,.btn{font:inherit;font-size:12px;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);border:1px solid transparent;border-radius:4px;padding:3px 10px;cursor:pointer;display:inline-block;}`,
  `button:hover{background:var(--vscode-button-secondaryHoverBackground,var(--vscode-button-secondaryBackground));}`,
  `.btn.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);}`,
  `.btn.ghost{background:none;color:var(--vscode-textLink-foreground);padding:3px 0;}`,
  `.btn.ghost:hover{background:none;text-decoration:underline;}`,
  `.link{background:none;border:0;padding:0;font-size:inherit;color:var(--vscode-textLink-foreground);text-align:left;}`,
  `.link:hover{background:none;text-decoration:underline;}`,
  `.body{padding:14px 16px 18px;}`,
  `#banner .panel{margin:10px 16px 0;}`,
  // Filter bar: the four views as one segmented group, Needs attention, the search box.
  `.filterbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 10px;}`,
  `.seg{display:inline-flex;flex-wrap:wrap;border:1px solid var(--vscode-panel-border);border-radius:6px;}`,
  `.seg button{padding:4px 12px;font-size:12px;background:none;border:0;border-radius:0;border-right:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);}`,
  `.seg button:first-child{border-radius:5px 0 0 5px;}`,
  `.seg button:last-child{border-right:0;border-radius:0 5px 5px 0;}`,
  `.seg button[aria-current="page"],.seg button[aria-pressed="true"]{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground);font-weight:600;}`,
  `.toggle{border-radius:999px;padding:3px 12px;font-size:12px;border:1px solid var(--vscode-panel-border);background:none;color:var(--vscode-descriptionForeground);}`,
  `.toggle[aria-pressed="true"]{border-color:var(--vscode-inputValidation-warningBorder);background:var(--vscode-inputValidation-warningBackground);color:var(--vscode-editorWarning-foreground);}`,
  `.search{margin-left:auto;min-width:200px;padding:4px 8px;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));background:var(--vscode-input-background);color:var(--vscode-input-foreground);border-radius:4px;font:inherit;font-size:12px;}`,
  `.count-line{color:var(--vscode-descriptionForeground);font-size:12px;margin:0 0 12px;}`,
  `.count-line .link{margin-left:8px;}`,
  // Pills, kicker, meter. The label carries the meaning; the tone only tints it.
  `.pill{display:inline-block;border-radius:999px;padding:0 8px;font-size:11px;line-height:18px;border:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);white-space:nowrap;}`,
  `.ok,[data-tone="success"]{color:var(--vscode-testing-iconPassed);border-color:var(--vscode-testing-iconPassed);}`,
  `.warn,[data-tone="warning"]{color:var(--vscode-editorWarning-foreground);background:var(--vscode-inputValidation-warningBackground);border-color:var(--vscode-inputValidation-warningBorder);}`,
  `.bad,[data-tone="danger"]{color:var(--vscode-errorForeground);background:var(--vscode-inputValidation-errorBackground);border-color:var(--vscode-inputValidation-errorBorder);}`,
  `[data-tone="neutral"]{color:var(--vscode-descriptionForeground);}`,
  `.stage-pill{color:var(--vscode-foreground);border-color:var(--vscode-focusBorder);}`,
  `.pills{display:flex;flex-wrap:wrap;gap:5px;align-items:center;}`,
  `.kicker{font:11px/1.4 var(--vscode-editor-font-family);letter-spacing:.3px;color:var(--vscode-descriptionForeground);overflow-wrap:anywhere;}`,
  `.muted{color:var(--vscode-descriptionForeground);font-size:var(--small);}`,
  `.meter{height:5px;border-radius:3px;background:var(--vscode-panel-border);margin-top:5px;}`,
  `.meter span{display:block;height:5px;border-radius:3px;background:var(--vscode-testing-iconPassed);}`,
  // Stage boxes: a native <details>; its summary always shows the label, any hint and the count.
  `.acc{border:1px solid var(--vscode-panel-border);border-radius:6px;margin:0 0 8px;background:var(--vscode-editor-background);}`,
  `.acc>summary{list-style:none;display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:8px 12px;cursor:pointer;font-weight:600;}`,
  `.acc>summary::before{content:"\\25B8";color:var(--vscode-descriptionForeground);width:10px;}`,
  `.acc[open]>summary::before{content:"\\25BE";}`,
  `.acc>summary .count{margin-left:auto;}`,
  `.acc>summary .hint{font-weight:400;}`,
  `.acc[data-empty] summary{color:var(--vscode-descriptionForeground);font-weight:500;}`,
  `.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr));gap:var(--gap);padding:0 12px 12px;}`,
  `.card{display:block;border:1px solid var(--vscode-panel-border);border-radius:6px;padding:var(--pad);background:var(--vscode-editorWidget-background);color:var(--vscode-foreground);overflow-wrap:anywhere;cursor:pointer;}`,
  `.card:hover{border-color:var(--vscode-focusBorder);}`,
  `.card .t{font-weight:600;margin:2px 0 3px;}`,
  `.card .pills{margin-top:6px;}`,
  `.empty-line{padding:0 12px 10px 34px;color:var(--vscode-descriptionForeground);font-size:12px;}`,
  `.more{margin:0 12px 12px;}`,
  `.fold{color:var(--vscode-descriptionForeground);font-size:12px;margin:0 0 8px;}`,
  // List rows (epics, issues): the name in a column at least 220 px wide.
  `.rows{border-top:1px solid var(--vscode-panel-border);}`,
  `.row{display:grid;grid-template-columns:minmax(220px,1fr) 150px auto;gap:6px 20px;align-items:center;padding:12px 4px;border-bottom:1px solid var(--vscode-panel-border);color:var(--vscode-foreground);}`,
  `button.row{width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--vscode-panel-border);border-radius:0;font-size:inherit;overflow-wrap:anywhere;}`,
  `.row:hover,button.row:hover{background:var(--vscode-list-hoverBackground);}`,
  `.row .name{font-weight:600;color:var(--vscode-textLink-foreground);}`,
  `.issue-row{grid-template-columns:minmax(220px,1fr) auto;}`,
  `.acc .rows{margin:0 12px 12px;}`,
  `.standalone-link{margin:12px 0;}`,
  // A story's or issue's screen.
  `.head{margin:0 0 12px;}`,
  `.head h1{font-size:19px;line-height:1.3;margin:3px 0 8px;letter-spacing:-.2px;overflow-wrap:anywhere;}`,
  `.subtabs{display:flex;flex-wrap:wrap;gap:4px 18px;border-bottom:1px solid var(--vscode-panel-border);margin:14px 0 14px;font-size:12px;}`,
  `.subtabs button{padding:7px 0;background:none;border:0;border-bottom:2px solid transparent;border-radius:0;color:var(--vscode-descriptionForeground);}`,
  `.subtabs button[aria-selected="true"]{color:var(--vscode-foreground);border-bottom-color:var(--vscode-focusBorder);font-weight:600;}`,
  `.cols{display:grid;grid-template-columns:minmax(340px,1.45fr) minmax(280px,1fr);gap:22px;align-items:start;}`,
  `.label{font-size:10px;font-weight:650;letter-spacing:1px;text-transform:uppercase;color:var(--vscode-descriptionForeground);margin:0 0 8px;}`,
  `* + .label{margin-top:16px;}`,
  `.task{border-top:1px solid var(--vscode-panel-border);padding:8px 0;}`,
  `.task:last-of-type{border-bottom:1px solid var(--vscode-panel-border);}`,
  `.task>summary{cursor:pointer;font-weight:600;}`,
  `.task p{margin:6px 0;}`,
  `.checks{list-style:none;padding:0;margin:6px 0;font-size:12px;}`,
  `.checks li::before{content:"\\2610  ";color:var(--vscode-descriptionForeground);}`,
  `.why{background:var(--vscode-textBlockQuote-background);border-left:3px solid var(--vscode-textLink-foreground);border-radius:0 4px 4px 0;padding:9px 12px;margin:0 0 6px;}`,
  `.why p{margin:4px 0;}`,
  `.chain{list-style:none;margin:0;padding:0;}`,
  `.chain li{display:grid;grid-template-columns:52px minmax(80px,1fr) auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--vscode-panel-border);}`,
  `.chain b{font-size:12px;}`,
  `.warnbox{border-left:3px solid var(--vscode-inputValidation-warningBorder);background:var(--vscode-inputValidation-warningBackground);border-radius:0 4px 4px 0;padding:9px 12px;margin:12px 0;}`,
  `.warnbox p{margin:4px 0 0;}`,
  `.item{padding:9px 0;border-bottom:1px solid var(--vscode-panel-border);}`,
  `.item:last-child{border-bottom:0;}`,
  `.between{display:flex;justify-content:space-between;align-items:center;gap:8px;}`,
  `table.records{width:100%;border-collapse:collapse;font-size:12px;}`,
  `.records th{text-align:left;font-weight:600;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-panel-border);padding:6px 6px 6px 0;}`,
  `.records td{border-bottom:1px solid var(--vscode-panel-border);padding:8px 6px 8px 0;vertical-align:top;}`,
  `pre{white-space:pre-wrap;overflow-wrap:anywhere;}`,
  // Layouts by the board's own width (a VS Code tab or sidebar), not the window.
  `@container (max-width:760px){.cols{grid-template-columns:minmax(0,1fr);}.row{grid-template-columns:minmax(0,1fr) 120px;}.row>:last-child{grid-column:1/-1;justify-self:start;}.issue-row{grid-template-columns:minmax(0,1fr);}.search{margin-left:0;flex:1 1 100%;min-width:0;}.head.between{flex-wrap:wrap;}}`,
  `@container (max-width:480px){.row{grid-template-columns:minmax(0,1fr);}.seg button{padding:4px 9px;}.body{padding:12px;}}`,
  // State panels: in the banner above a screen, or in place of it.
  `.panel{border:1px solid var(--vscode-panel-border);border-radius:6px;padding:14px 16px;background:var(--vscode-editorWidget-background);}`,
  `.panel.warnp{border-left:3px solid var(--vscode-inputValidation-warningBorder);background:var(--vscode-inputValidation-warningBackground);}`,
  `.panel h3{font-size:14px;margin:0 0 4px;}`,
  `.panel p{margin:4px 0;}`,
  `.panel-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}`,
  `.table-wrap{overflow-x:auto;}`,
  `table.records{min-width:620px;}`,
  `.center{text-align:center;padding:26px 16px;}`,
  // The footer: the announcement line and the density control, small and muted.
  `.foot{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:4px 14px;padding:6px 16px;border-top:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);font-size:11px;}`,
  `#announce{margin:0;min-height:1em;}`,
  `.foot .seg button{padding:1px 8px;font-size:11px;}`,
  `body[data-density="comfortable"]{--gap:8px;--pad:9px 10px;--small:12px;}`,
  `body[data-density="compact"]{--gap:4px;--pad:4px 8px;--small:11px;font-size:0.92em;}`,
  `body:not([data-density]){--gap:8px;--pad:9px 10px;--small:12px;}`,
].join('');

export function renderBoardDocument(nonce: string): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">` +
    `<title>${BOARD_TITLE}</title><style>${BOARD_STYLE}</style></head><body><div class="page">` +
    // App bar: the breadcrumb (the script puts the wordmark first); the freshness line, the read-only marker, refresh.
    `<header class="appbar"><nav id="crumbs" class="crumbs" aria-label="Breadcrumb"></nav>` +
    // The status line keeps role=status but is not a live region: #announce is the one announcer (s5).
    `<div class="appbar-tools"><p id="status" role="status"></p><span class="readonly">Read-only</span>` +
    `<button id="refresh" type="button">Refresh</button></div></header>` +
    // A failed refresh over a shown board and partial evidence sit here, above the screen, which stays usable.
    `<div id="banner"></div>` +
    // One screen at a time: each screen message replaces what is here.
    `<main id="main" class="body"></main>` +
    // The footer: the one live region and the density control, small and out of the way.
    `<footer class="foot"><p id="announce" aria-live="polite" aria-atomic="true"></p>` +
    `<div class="seg density" role="group" aria-label="Density">` +
    `<button id="density-compact" type="button" aria-pressed="false">Compact</button>` +
    `<button id="density-comfortable" type="button" aria-pressed="true">Comfortable</button>` +
    `</div></footer></div>` +
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

  /** Reduce and apply; an event the reducer treats as a no-op (the same state back) posts nothing. */
  function dispatch(event: BoardEvent): void {
    const next = reduceBoardState(state, event);
    if (next !== state) apply(next);
  }

  /** How long since a refresh started, for the log: 'N ms', or says so when a clock reading cannot be parsed. */
  function elapsed(since: string): string {
    const ms = msBetween(since, deps.now());
    return ms === null ? 'an unmeasurable time (unreadable clock)' : `${ms} ms`;
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
      const answer = result.ok ? plural(n, 'item', 'items') : result.failure.kind;
      log.warn(`delivery board: dropped the answer to refresh ${seq} (${answer}); refresh ${state.latestSeq} is newer (${elapsed(started)})`);
      return;
    }
    if (!result.ok) {
      log.error(`delivery board: refresh ${seq} ${result.failure.kind} after ${elapsed(started)}: ${result.failure.message}`);
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
    if (seq !== state.latestSeq) return;
    const text = refreshAnnouncement(state, deps.now());
    if (text !== null) announce(text);
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

  /**
   * Navigate, then announce once when the screen changed: 'Opened: …', 'Epic: …' or 'Showing …' for a new screen,
   * 'Back to …' for a return. Posted after the state is kept, so a failure here is only logged by the message handler.
   */
  function go(intent: NavIntent): void {
    const before = currentEntry(state.selection).id;
    dispatch({ type: 'navigate', intent });
    if (currentEntry(state.selection).id === before) return;
    const shown = shownSnapshot(state.status);
    const text = shown === null ? null
      : screenAnnouncement(state, shown.snapshot, DISPLAY_LABELS, intent.type === 'back' || intent.type === 'go-to-crumb' ? 'back' : 'opened');
    if (text !== null) announce(text);
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
      case 'set-view': go({ type: 'set-view', view: msg.view }); return;
      case 'open-epic': open(msg.epicItemId, true); return;
      case 'open-item': open(msg.itemId, false); return;
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
