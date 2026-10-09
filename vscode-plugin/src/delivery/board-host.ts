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
 * The host also keeps the board's paging (E2 s2): show-more raises one
 * column's page, and a scope, search or attention change resets it. Every
 * derive keeps the new state only when it renders, and items whose stage is
 * not one of the six are logged once per applied refresh.
 *
 * The document is CSP-locked (default-src 'none') with one nonce'd script that
 * renders the status and the board's columns, cards and controls as text
 * (textContent only) and posts only BoardUpMessage envelopes. vscode-free: extension.ts supplies the panel.
 *
 * The item details (E2 s4): while an item is selected, every derive also posts
 * its details after the view message, from the details memory
 * (details-memory.ts). The host tells the memory each state it keeps, routes
 * open-evidence to it, and starts a new memory with each panel.
 */

import { attr, type ChatPanelChannel, type ChatPanelLogger } from '../chat/chat-panel.js';
import type { Envelope } from '../chat/protocol.js';
import { isPlaceable, placeableCount, showMore, titleOf, unknownStages, type BoardPaging } from './board-model.js';
import { parseBoardUpMessage, type BoardDownMessage, type BoardScope, type BoardUpMessage } from './board-protocol.js';
import {
  boardDownMessages, initialBoardState, reduceBoardState, shownSnapshot, statusView,
  type BoardEvent, type BoardSelection, type BoardState,
} from './board-state.js';
import type { DeliveryClient, DeliveryResult } from './delivery-client.js';
import type { DeliverySnapshot } from './delivery-contract.js';
import { createDetailsMemory, type DetailsMemory } from './details-memory.js';
import { errorText } from './guards.js';
import { DISPLAY_LABELS } from './labels.js';

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


/**
 * The webview script. Everything shown is set with textContent, and the only
 * messages posted are board up-messages: ready, refresh, set-search,
 * set-scope, set-attention, show-more, set-view (the tabs), select-item (a
 * card in any view, a follow link or a linked item in the details),
 * close-details and open-evidence (the details pane, s4).
 */
export const BOARD_WEBVIEW_SCRIPT = [
  `(function(){`,
  `const vs=acquireVsCodeApi();`,
  `const send=function(p){vs.postMessage({v:1,payload:p});};`,
  `const byId=function(id){return document.getElementById(id);};`,
  `const status=byId('status'),totals=byId('totals'),board=byId('board'),details=byId('details'),panel=byId('panel');`,
  `const search=byId('search'),scopeChips=byId('scope-chips'),attentionChip=byId('attention-chip');`,
  `const make=function(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.setAttribute('class',cls);return e;};`,
  `const clear=function(n){while(n.firstChild)n.removeChild(n.firstChild);};`,
  `const button=function(text,onClick){const b=make('button',text);b.setAttribute('type','button');b.addEventListener('click',onClick);return b;};`,
  `const pill=function(text,tone,cls){const e=make('span',text,cls||'pill');e.setAttribute('data-tone',tone);return e;};`,
  `const KIND={story:'Story',issue:'Issue',epic:'Epic',task:'Task'};`,
  `const KICKER={story:'STORY',issue:'ISSUE',epic:'EPIC',task:'TASK'};`,
  `byId('refresh').addEventListener('click',function(){send({type:'refresh'});});`,
  `search.addEventListener('input',function(){send({type:'set-search',search:String(search.value)});});`,
  // The Needs attention chip: posts set-attention and shows the choice with aria-pressed.
  `const markAttention=function(on){attentionChip.setAttribute('aria-pressed',on?'true':'false');};`,
  `attentionChip.addEventListener('click',function(){const on=attentionChip.getAttribute('aria-pressed')!=='true';markAttention(on);send({type:'set-attention',on:on});});`,
  // A scope value: 'all', 'standalone' or 'epic:<id>'; the pressed scope chip shows the reader's current choice.
  `let scopeValue='all';`,
  `const scopeOf=function(v){return v==='all'?{kind:'all'}:v==='standalone'?{kind:'standalone'}:{kind:'epic',epicItemId:v.slice(5)};};`,
  `const markScope=function(v){scopeValue=v;for(const c of scopeChips.children)c.setAttribute('aria-pressed',c.getAttribute('data-scope')===v?'true':'false');};`,
  `const chooseScope=function(v){markScope(v);send({type:'set-scope',scope:scopeOf(v)});};`,
  // The scope chips are rebuilt from each board; the reader's current choice is kept.
  `function renderScope(options){const current=scopeValue;clear(scopeChips);`,
  `const add=function(value,text){const c=make('button',text,'chip');c.setAttribute('type','button');c.setAttribute('data-scope',value);c.setAttribute('aria-pressed',value===current?'true':'false');`,
  `c.addEventListener('click',function(){chooseScope(value);});scopeChips.appendChild(c);};`,
  `add('all','All work');add('standalone','Standalone');`,
  `for(const o of options)add('epic:'+o.epicItemId,o.title);`,
  // An epic the reader scoped to that a refresh removed stays selectable, so the reader sees why nothing matches.
  `if(current.indexOf('epic:')===0&&!options.some(function(o){return 'epic:'+o.epicItemId===current;}))add(current,'Epic no longer on the board');`,
  `}`,
  // Keyboard (s5): every card is focusable; Enter or Space selects it, the arrows move between the cards in document order.
  `const cardsOnBoard=function(){return Array.prototype.slice.call(board.querySelectorAll('li.card'));};`,
  `const moveFocus=function(from,step){const cards=cardsOnBoard();const next=cards[cards.indexOf(from)+step];if(next)next.focus();};`,
  `const onCardKey=function(li,id){return function(e){`,
  `if(e.key==='Enter'||e.key===' '){e.preventDefault();send({type:'select-item',itemId:id});}`,
  `else if(e.key==='ArrowDown'){e.preventDefault();moveFocus(li,1);}else if(e.key==='ArrowUp'){e.preventDefault();moveFocus(li,-1);}};};`,
  `function renderCard(c){const li=make('li',undefined,'card');li.setAttribute('data-item-id',c.itemId);li.setAttribute('aria-label',c.accessibleLabel);li.setAttribute('tabindex','0');`,
  `li.appendChild(make('div',KICKER[c.kind]+' \u00b7 '+c.compactId,'kicker'));`,
  `li.appendChild(make('div',c.title,'card-title'));`,
  `const epicLine=c.standalone?'Standalone':c.epicTitle===null?'':'Epic: '+c.epicTitle;if(epicLine!=='')li.appendChild(make('div',epicLine,'card-epic'));`,
  `if(c.taskSummary!==null)li.appendChild(make('div',c.taskSummary.label,'card-tasks'));`,
  `const badges=make('ul',undefined,'badges');`,
  `for(const b of c.badges){const t=make('li',b.label,'badge');t.setAttribute('data-tone',b.tone);t.setAttribute('data-kind',b.kind);badges.appendChild(t);}`,
  `li.appendChild(badges);li.addEventListener('click',function(){send({type:'select-item',itemId:c.itemId});});li.addEventListener('keydown',onCardKey(li,c.itemId));return li;}`,
  // View tabs: each posts set-view; the shown view's tab is marked pressed.
  `const TABS={board:byId('tab-board'),epics:byId('tab-epics'),issues:byId('tab-issues')};`,
  // Tabs (role=tab): the shown view's tab is selected and in the tab order; Left and Right move between the tabs.
  `const VIEWS=['board','epics','issues'];`,
  `for(const v of VIEWS){TABS[v].addEventListener('click',function(){send({type:'set-view',view:v});});`,
  `TABS[v].addEventListener('keydown',function(e){const step=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(step===0)return;e.preventDefault();`,
  `TABS[VIEWS[(VIEWS.indexOf(v)+step+VIEWS.length)%VIEWS.length]].focus();});}`,
  `let shownView='board';`,
  `function markTab(view){shownView=view;board.setAttribute('data-view',view);for(const v of VIEWS){TABS[v].setAttribute('aria-selected',v===view?'true':'false');TABS[v].setAttribute('tabindex',v===view?'0':'-1');}}`,
  // State panels (s5 mock F): #panel holds the status panel, then the current view's no-matches panel.
  `const statusPanel=make('div');const matchPanel=make('div');panel.appendChild(statusPanel);panel.appendChild(matchPanel);`,
  `function renderPanel(box,p){clear(box);if(p===null||p===undefined)return;const d=make('div',undefined,'panel');d.setAttribute('data-kind',p.kind);d.setAttribute('role','note');`,
  `d.appendChild(make('p',p.title,'panel-title'));if(p.text)d.appendChild(make('p',p.text));`,
  `if(p.stale){const st=make('span','Stale','pill');st.setAttribute('data-tone','warning');d.appendChild(st);}`,
  `if(p.affected&&p.affected.length>0){const dis=make('details');dis.appendChild(make('summary','Inspect affected records'));const ul=make('ul');`,
  `for(const a of p.affected){const li=make('li');if(a.artifactIds.length>0)li.appendChild(make('code',a.artifactIds.join(', ')));li.appendChild(make('span',(a.artifactIds.length>0?' \u2014 ':'')+a.text));ul.appendChild(li);}dis.appendChild(ul);d.appendChild(dis);}`,
  `const acts=make('div',undefined,'panel-actions');`,
  `if(p.action==='retry')acts.appendChild(button('Retry',function(){send({type:'refresh'});}));`,
  `if(p.action==='clear-filters')acts.appendChild(button('Clear filters',function(){search.value='';markAttention(false);send({type:'clear-filters'});}));`,
  `if(acts.firstChild)d.appendChild(acts);box.appendChild(d);}`,
  `const NO_MATCHES={kind:'no-matches',title:'Nothing matches this view',text:'Work exists, but none matches the current search, scope and attention filter.',action:'clear-filters',stale:false,affected:[]};`,
  `const NO_ISSUES={kind:'no-issues',title:'No issues on the board',text:'There are no issues on the board.',action:null,stale:false,affected:[]};`,
  `const plural=function(n,one,many){return n+' '+(n===1?one:many);};`,
  // A follow link: a button whose text names the item; clicking it posts select-item with the item's id.
  `function linkButton(l){const b=make('button',KIND[l.kind]+' \u00b7 '+l.title+(l.stageLabel===null?'':' \u00b7 '+l.stageLabel),'link');`,
  `b.setAttribute('type','button');b.setAttribute('data-item-id',l.itemId);b.addEventListener('click',function(){send({type:'select-item',itemId:l.itemId});});return b;}`,
  // An epic rollup row (s3, mock A): kicker, title, counts; the completion meter; the attention chip. The title opens
  // the epic's board (the 'Not in an epic' row opens the standalone scope).
  `function renderRow(r){const sec=make('section',undefined,'epic-row');if(r.epicItemId!==null)sec.setAttribute('data-epic',r.epicItemId);`,
  `const main=make('div',undefined,'row-main');`,
  `if(r.compactId!==null)main.appendChild(make('div','EPIC \u00b7 '+r.compactId,'kicker'));`,
  `const h=make('h2');const open=make('button',r.title,'row-title link');open.setAttribute('type','button');`,
  `open.addEventListener('click',function(){chooseScope(r.epicItemId===null?'standalone':'epic:'+r.epicItemId);send({type:'set-view',view:'board'});});`,
  `h.appendChild(open);main.appendChild(h);`,
  `main.appendChild(make('p',[plural(r.storiesTotal,'story','stories'),plural(r.taskCount,'task','tasks')].concat(r.issueCount>0?[plural(r.issueCount,'issue','issues')]:[]).join(' \u00b7 '),'counts muted'));`,
  `sec.appendChild(main);`,
  `const prog=make('div',undefined,'row-progress');prog.appendChild(make('p',r.completionLabel,'completion muted'));`,
  `const meter=make('div',undefined,'meter');meter.setAttribute('role','meter');meter.setAttribute('aria-label',r.completionLabel);`,
  `meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax',String(r.storiesTotal));meter.setAttribute('aria-valuenow',String(r.storiesComplete));`,
  `const fill=make('span');fill.setAttribute('style','width:'+(r.storiesTotal===0?0:Math.round(100*r.storiesComplete/r.storiesTotal))+'%');meter.appendChild(fill);`,
  `prog.appendChild(meter);sec.appendChild(prog);`,
  `const att=make('span',r.attentionLabel,'pill attention');att.setAttribute('data-tone',r.attentionTone);sec.appendChild(att);`,
  `return sec;}`,
  `function renderEpics(m){markTab('epics');renderScope(m.scopeOptions);clear(board);`,
  `totals.textContent=plural(m.totals.items,'item','items')+', '+m.totals.needsAttention+' needing attention';`,
  `for(const r of m.epics)board.appendChild(renderRow(r));`,
  `if(m.notInEpic.total>0)board.appendChild(renderRow(m.notInEpic));`,
  `renderPanel(matchPanel,m.emptySelection?NO_MATCHES:null);}`,
  `function renderIssue(e){const sec=make('section',undefined,'issue');sec.setAttribute('data-item-id',e.card.itemId);`,
  `const cards=make('ul');cards.appendChild(renderCard(e.card));sec.appendChild(cards);`,
  `sec.appendChild(make('p','Stage: '+e.stageLabel,'issue-stage'));`,
  `if(e.parent!==null){const p=make('p','Corrects: ','parent');p.appendChild(linkButton(e.parent));sec.appendChild(p);}`,
  `else if(e.parentNotice!==null)sec.appendChild(make('p',e.parentNotice,'parent-notice'));`,
  `sec.appendChild(make('h3','Fix stories'));`,
  `if(e.fixStories.length===0)sec.appendChild(make('p','No fix stories yet','no-fix'));`,
  `else{const ul=make('ul');ul.setAttribute('aria-label','Fix stories');for(const f of e.fixStories){const li=make('li');li.appendChild(linkButton(f));ul.appendChild(li);}sec.appendChild(ul);}`,
  `return sec;}`,
  `function renderIssues(m){markTab('issues');renderScope(m.scopeOptions);clear(board);`,
  `totals.textContent=plural(m.totals.issues,'issue','issues')+', '+m.totals.needsAttention+' needing attention';`,
  `for(const e of m.issues)board.appendChild(renderIssue(e));`,
  `renderPanel(matchPanel,m.emptySelection?NO_MATCHES:m.issues.length===0?NO_ISSUES:null);}`,
  `function renderBoard(m){markTab('board');renderScope(m.scopeOptions);clear(board);`,
  `totals.textContent=plural(m.totals.items,'item','items')+', '+m.totals.needsAttention+' needing attention';`,
  // Every stage heading carries its label and a count chip; an empty stage is marked so a narrow pane wraps it last.
  `for(const col of m.columns){const sec=make('section',undefined,'column');sec.setAttribute('data-stage',col.stage);sec.setAttribute('data-empty',col.total===0?'true':'false');`,
  `const h=make('h2');h.appendChild(make('span',col.label,'stage-label'));const count=make('span',String(col.total),'count');count.setAttribute('aria-label',plural(col.total,'item','items'));h.appendChild(count);sec.appendChild(h);`,
  `const ul=make('ul');ul.setAttribute('aria-label',col.label);for(const c of col.cards)ul.appendChild(renderCard(c));sec.appendChild(ul);`,
  `if(col.hiddenCount>0){const more=make('button','Show '+col.hiddenCount+' more');more.setAttribute('type','button');`,
  `more.addEventListener('click',function(){send({type:'show-more',stage:col.stage});});sec.appendChild(more);}`,
  `board.appendChild(sec);}`,
  `renderPanel(matchPanel,m.emptySelection?NO_MATCHES:null);}`,
  // The details pane (s4): every field as text, the opened record in a <pre>; a null model clears it.
  `const RELATION={parent:'Parent',child:'Child',corrects:'Corrects'};`,

  // Focus (s5): opening an item's details focuses their heading; closing them returns focus to that item's card, or to
  // the shown view's tab when the card is gone. Escape inside the details closes them.
  `let detailsOf=null,lastHeading=null;`,
  `details.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();send({type:'close-details'});}});`,
  `const returnFocus=function(id){const card=cardsOnBoard().filter(function(c){return c.getAttribute('data-item-id')===id;})[0];if(card)card.focus();else TABS[shownView].focus();};`,
  // Mock B: kicker, title and close; the chips; the conflict box first; 'Why this stage?'; tasks as disclosures; the
  // artifact chain; then the records, notices, links and sources.
  `function renderDetails(m){clear(details);if(m===null){details.setAttribute('hidden','');lastHeading=null;if(detailsOf!==null){const id=detailsOf;detailsOf=null;returnFocus(id);}return;}details.removeAttribute('hidden');`,
  `details.setAttribute('data-item-id',m.itemId);`,
  `const head=make('div',undefined,'details-head');head.appendChild(make('div',m.kicker,'kicker'));`,
  `const heading=make('h2',m.title);heading.setAttribute('tabindex','-1');head.appendChild(heading);details.appendChild(head);`,
  `details.appendChild(button('Close details',function(){send({type:'close-details'});}));`,
  `if(m.chips.length>0){const chips=make('div',undefined,'chips details-chips');for(const c of m.chips){const e=pill(c.label,c.tone);e.setAttribute('data-kind',c.kind);chips.appendChild(e);}details.appendChild(chips);}`,
  `if(m.conflict!==null){const box=make('div',undefined,'details-conflict');box.setAttribute('role','note');box.appendChild(make('strong',m.conflict.headline));box.appendChild(make('p',m.conflict.text));details.appendChild(box);}`,
  `if(m.stageReason!==null){const why=make('div',undefined,'why');why.appendChild(make('strong','Why this stage?'));why.appendChild(make('p',m.stageReason.text));`,
  `if(m.stageReason.artifactIds.length>0)why.appendChild(make('p','From '+m.stageReason.artifactIds.join(', '),'muted'));details.appendChild(why);}`,
  `if(m.tasks.length>0||m.taskCounts!==null){details.appendChild(make('h3','Tasks'));`,
  `if(m.taskCounts!==null){const k=m.taskCounts;details.appendChild(make('p',k.passed+' passed, '+k.failed+' failed, '+k.unrecorded+' unrecorded, '+k.unplanned+' unplanned','task-counts muted'));}`,
  `const list=make('div');list.setAttribute('role','list');list.setAttribute('aria-label','Tasks');`,
  `for(const t of m.tasks){const row=make('details',undefined,'task');row.setAttribute('role','listitem');row.setAttribute('data-item-id',t.taskItemId);`,
  `row.appendChild(make('summary',t.title===null?t.taskItemId:t.title));`,
  `const chips=make('div',undefined,'chips');chips.appendChild(pill(t.resultLabel,t.resultTone));`,
  `if(t.dependsOn!==null)chips.appendChild(pill(t.dependsOn.length===0?'No dependencies':'Depends on '+t.dependsOn.join(', '),'neutral'));row.appendChild(chips);`,
  `if(t.acceptanceChecks!==null&&t.acceptanceChecks.length>0){const cl=make('ul',undefined,'task-checks');cl.setAttribute('aria-label','Acceptance checks');for(const c of t.acceptanceChecks)cl.appendChild(make('li',c));row.appendChild(cl);}`,
  `list.appendChild(row);}details.appendChild(list);}`,
  `if(m.planNotice!==null)details.appendChild(make('p',m.planNotice,'plan-notice'));`,
  `if(m.chain.length>0){details.appendChild(make('h3','Artifact chain'));const ul=make('ul',undefined,'chain');ul.setAttribute('aria-label','Artifact chain');`,
  `for(const r of m.chain){const li=make('li');li.setAttribute('data-status',r.status);li.appendChild(make('strong',r.kind));const body=make('div');body.appendChild(pill(r.label,r.tone));`,
  `if(r.artifactId!==null)body.appendChild(make('div',r.artifactId+(r.note===null?'':' \u00b7 '+r.note),'muted'));li.appendChild(body);ul.appendChild(li);}details.appendChild(ul);}`,
  `if(m.evidence.length>0){details.appendChild(make('h3','Records'));const ul=make('ul');ul.setAttribute('aria-label','Records');`,
  `for(const r of m.evidence){const li=make('li',undefined,'record');li.setAttribute('data-artifact-id',r.artifactId);`,
  `li.appendChild(make('span',[r.kindLabel+' '+r.artifactId,r.approvalLabel].concat(r.reviewLabel===null?[]:[r.reviewLabel]).concat(r.overrideLabel===null?[]:[r.overrideLabel]).join(' \u00b7 ')));`,
  `li.appendChild(button(r.opensIn==='review-pane'?'Open in review':'Open read-only',function(){send({type:'open-evidence',itemId:m.itemId,artifactId:r.artifactId});}));`,
  `ul.appendChild(li);}details.appendChild(ul);}`,
  `if(m.notices.length>0){details.appendChild(make('h3','Notices'));const ul=make('ul');for(const n of m.notices)ul.appendChild(make('li',n,'notice'));details.appendChild(ul);}`,
  `if(m.linked.length>0){details.appendChild(make('h3','Linked'));const ul=make('ul');`,
  `for(const l of m.linked){const li=make('li');li.appendChild(button(RELATION[l.relation]+': '+l.title,function(){send({type:'select-item',itemId:l.itemId});}));ul.appendChild(li);}details.appendChild(ul);}`,
  `if(m.sourceIds.length>0)details.appendChild(make('p','Sources: '+m.sourceIds.join(', '),'source-ids muted'));`,
  `if(m.openedRecord!==null){details.appendChild(make('h3','Record '+m.openedRecord.artifactId));details.appendChild(make('pre',m.openedRecord.text,'opened-record'));}`,
  // A re-render of the same item (its plan or a record arrived) keeps focus on the heading if the old heading had it.
  `const keep=m.itemId===detailsOf&&lastHeading!==null&&document.activeElement===lastHeading;lastHeading=heading;`,
  `if(m.itemId!==detailsOf||keep){detailsOf=m.itemId;heading.focus();}}`,
  `window.addEventListener('message',function(e){`,
  `const m=e.data;if(!m||m.v!==1||!m.payload)return;const p=m.payload;`,
  // The app bar's freshness line; the status panel carries the explanation and its action.
  `if(p.type==='status'){const s=p.status;`,
  `const line=s.state==='loading'?'Refreshing\u2026'+(s.freshnessLabel?' \u00b7 '+s.freshnessLabel:''):s.freshnessLabel||s.message||'';`,
  `status.textContent=line+(s.stale?' (stale)':'');status.setAttribute('data-state',s.state);`,
  `renderPanel(statusPanel,s.panel);return;}`,
  `if(p.type==='board'){renderBoard(p.model);return;}`,
  `if(p.type==='epics'){renderEpics(p.model);return;}`,
  `if(p.type==='issues'){renderIssues(p.model);return;}`,
  `if(p.type==='details'){renderDetails(p.model);return;}`,
  // The one live region (s5): cleared, then set, so a repeated text is announced again.
  `if(p.type==='announce'){announceEl.textContent='';announceEl.textContent=String(p.text);return;}`,
  `});`,
  // Density (s5) lives in the webview's own state, kept by VS Code across reloads, and is mirrored to the host.
  `const announceEl=byId('announce');`,
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
    // App bar (mock A): wordmark and breadcrumb; the freshness line, the read-only marker, refresh and density.
    `<header class="appbar"><div class="brand"><span class="wordmark">insrc</span><span class="crumb">Workspace / Delivery</span></div>` +
    // The status line keeps role=status but is not a live region: #announce is the one announcer (s5).
    `<div class="appbar-tools"><p id="status" role="status"></p><span class="readonly">Read-only</span>` +
    `<button id="refresh" type="button">Refresh</button>` +
    `<div class="density" role="group" aria-label="Density">` +
    `<button id="density-compact" type="button" aria-pressed="false">Compact</button>` +
    `<button id="density-comfortable" type="button" aria-pressed="true">Comfortable</button>` +
    `</div></div></header>` +
    `<h1 class="page-title">${BOARD_TITLE}</h1>` +
    `<p id="announce" class="announce" aria-live="polite" aria-atomic="true"></p>` +
    `<nav class="tabs" role="tablist" aria-label="Views">` +
    `<button id="tab-board" type="button" role="tab" aria-selected="true" tabindex="0">Board</button>` +
    `<button id="tab-epics" type="button" role="tab" aria-selected="false" tabindex="-1">Epics</button>` +
    `<button id="tab-issues" type="button" role="tab" aria-selected="false" tabindex="-1">Issues</button>` +
    `</nav>` +
    // Chip toolbar (mock A): search, the scope chips and the Needs attention chip.
    `<div class="toolbar">` +
    `<input id="search" type="search" aria-label="Search work items" placeholder="Search">` +
    `<div id="scope-chips" class="chips" role="group" aria-label="Scope"></div>` +
    `<button id="attention-chip" class="chip" type="button" aria-pressed="false">Needs attention</button>` +
    `</div>` +
    `<p id="totals"></p>` +
    `<div id="panel"></div>` +
    `<div class="layout"><aside id="details" aria-label="Item details" hidden></aside><div id="board" class="board"></div></div>` +
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
  /** The visible card limit per column; reset by a scope, search or attention change, kept across refreshes. */
  let paging: BoardPaging = {};
  let nextSeq = 0;
  /** Bumped on every dispose; an answer from an earlier panel generation is discarded. */
  let generation = 0;
  /** The details memory (s4); a new one with each panel. */
  const newMemory = (): DetailsMemory => createDetailsMemory({
    client: deps.client, log, labels: DISPLAY_LABELS, reviewPane: deps.reviewPane, rerender: applyAfterRead,
  });
  let memory = newMemory();

  /** The details message for a state: posted while an item is selected and a snapshot is shown. */
  function detailsMessage(s: BoardState): Envelope<BoardDownMessage> | null {
    const shown = shownSnapshot(s.status);
    const id = s.selection.selectedItemId;
    if (shown === null || id === null) return null;
    return { v: 1, payload: { type: 'details', model: memory.model(shown.snapshot, id) } };
  }

  /** A re-derive after an answer arrives; a throw is logged, and apply() leaves the board as it was. */
  function applyAfterRead(what: string): void {
    try {
      apply(state, paging);
    } catch (err) {
      log.error(`delivery board: ${what} could not be shown: ${errorText(err)}`);
    }
  }

  /**
   * Derive the messages first; the new state and paging are kept only when their messages can be built, so a bad
   * snapshot or selection never becomes the board's, and a throw while deriving leaves both as they were and posts
   * nothing. Posting itself is fire-and-forget (ChatPanelChannel.postMessage never rejects inward).
   */
  function apply(next: BoardState, nextPaging: BoardPaging): void {
    const details = detailsMessage(next);
    const now = deps.now();
    const messages = details === null
      ? boardDownMessages(next, DISPLAY_LABELS, nextPaging, now)
      : [...boardDownMessages(next, DISPLAY_LABELS, nextPaging, now), details];
    state = next;
    paging = nextPaging;
    memory.kept(shownSnapshot(next.status)?.snapshot ?? null, next.selection.selectedItemId);
    for (const m of messages) channel?.postMessage(m);
  }

  function dispatch(event: BoardEvent, nextPaging: BoardPaging = paging): void {
    apply(reduceBoardState(state, event), nextPaging);
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

  /** One announcement per settled refresh (s5): the snapshot-wide counts when ready, else the status message. */
  function announceRefresh(seq: number): void {
    if (seq !== state.latestSeq || state.status.state === 'loading') return;
    const shown = shownSnapshot(state.status);
    if (state.status.state === 'ready' && shown !== null) {
      const n = placeableCount(shown.snapshot);
      const attention = shown.snapshot.items.filter(i => isPlaceable(i) && i.needsAttention).length;
      announce(`Board refreshed: ${n} item${n === 1 ? '' : 's'}, ${attention} needing attention`);
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

  /** An epic scope must name an epic in the shown snapshot. */
  function knownScope(scope: BoardScope): boolean {
    if (scope.kind !== 'epic') return true;
    const shown = shownSnapshot(state.status);
    return shown !== null && shown.snapshot.items.some(i => i.kind === 'epic' && i.id === scope.epicItemId);
  }

  /** A followed link must name an item in the shown snapshot. */
  function onBoard(itemId: string): boolean {
    const shown = shownSnapshot(state.status);
    return shown !== null && shown.snapshot.items.some(i => i.id === itemId);
  }

  /** Posted after the state is kept, so a failure here is only logged by the message handler (s5). */
  function announceSelection(itemId: string): void {
    const item = shownSnapshot(state.status)?.snapshot.items.find(i => i.id === itemId);
    if (item === undefined) return;
    announce(`Selected: ${titleOf(item)}${item.stage === null ? '' : ` \u00b7 ${DISPLAY_LABELS.stage[item.stage.stage] ?? item.stage.stage}`}`);
  }

  function select(selection: BoardSelection, nextPaging: BoardPaging = paging): void {
    dispatch({ type: 'selection-changed', selection }, nextPaging);
  }

  function handle(msg: BoardUpMessage): void {
    const sel = state.selection;
    switch (msg.type) {
      case 'ready': apply(state, paging); return;
      case 'refresh': startRefresh(); return;
      case 'set-view': select({ ...sel, view: msg.view }); return;
      case 'set-scope':
        if (!knownScope(msg.scope)) {
          log.warn('delivery board: ignored a scope naming an epic that is not on the board');
          return;
        }
        select({ ...sel, scope: msg.scope }, {});
        return;
      case 'set-search': select({ ...sel, search: msg.search }, {}); return;
      case 'set-attention': select({ ...sel, needsAttentionOnly: msg.on }, {}); return;
      // Clears the search and the attention filter, keeps the scope and the view; paging resets like any filter change.
      case 'clear-filters': select({ ...sel, search: '', needsAttentionOnly: false }, {}); return;
      case 'select-item':
        if (!onBoard(msg.itemId)) {
          log.warn('delivery board: ignored a link to an item that is not on the board');
          return;
        }
        select({ ...sel, selectedItemId: msg.itemId });
        if (msg.itemId !== sel.selectedItemId) announceSelection(msg.itemId);
        return;
      case 'close-details':
        select({ ...sel, selectedItemId: null });
        channel?.postMessage({ v: 1, payload: { type: 'details', model: null } });
        return;
      case 'set-density': select({ ...sel, density: msg.density }); return;
      case 'show-more': apply(state, showMore(paging, msg.stage)); return;
      case 'open-evidence': memory.openEvidence(msg.itemId, msg.artifactId); return;
    }
  }

  function reset(): void {
    generation++;
    channel = undefined;
    state = initialBoardState();
    paging = {};
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
