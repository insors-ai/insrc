/**
 * Story E202610131f74c81f:S001 — the review pane's list view, as webview source.
 *
 * One string, inlined into the pane's single nonce'd script after the comment source (it
 * uses that source's rvEl and rvPutState, and the bootstrap's element lookups, `items`,
 * `shown` and rvOption). It holds:
 *
 *   - which of the pane's two views is on show: the LIST of documents awaiting review, or
 *     the DOCUMENT. The reviewer's choice is kept in the saved state; the document view is
 *     shown only while a document is held;
 *   - the list view: a search field that completes from titles and ids, a type select with
 *     counts, a table of RV_PAGE rows a page ordered by type then title, a pager, and a
 *     notice line (loading, nothing awaiting review, nothing matching, or the host's notice
 *     that the list could not be read).
 *
 * The whole list is already in the page, so searching, filtering and paging are done here,
 * with no message to the host. Every title and id is set as text.
 *
 * A raw template: it contains no backtick and no dollar-brace.
 */
export const DOCS_LIST_SOURCE = String.raw`
var RV_PAGE=25;var RV_SUGGEST=50;var RV_KINDS=['SPEC','DEF','HLD','LLD','PLAN','ISSUE','BUILD','CR'];
/* view: the view the reviewer chose. list: the list view's search text, type ('' for all)
   and page (from 1). listNote: the host's notice of a failed read. listed: a list has arrived. */
var view='list';var list={q:'',kind:'',page:1};var listNote='';var listed=false;
/* The saved search, type, page and view; anything of another shape is left at its default. */
function rvListLoad(){var s=null;try{s=vs.getState?vs.getState():null;}catch(err){s=null;}
var l=s&&s.list;if(!l||typeof l!=='object')return;
if(typeof l.q==='string')list.q=l.q;
if(typeof l.kind==='string')list.kind=l.kind;
if(typeof l.page==='number'&&l.page>=1&&Math.floor(l.page)===l.page)list.page=l.page;
if(l.view==='doc')view='doc';}
function rvListSave(){rvPutState('list',{q:list.q,kind:list.kind,page:list.page,view:view});}
function rvRank(k){var i=RV_KINDS.indexOf(String(k));return i<0?RV_KINDS.length:i;}
function rvCmp(a,b){return a<b?-1:a>b?1:0;}
/* The id a row shows: the work item's when the daemon gave one, else the artifact's. */
function rvIdOf(a){return (typeof a.workItemId==='string'&&a.workItemId)?a.workItemId:String(a.id);}
/* By type (the known types in their order, then any other by name), then by title. */
function rvOrdered(){return items.slice().sort(function(a,b){
return (rvRank(a.kind)-rvRank(b.kind))||rvCmp(String(a.kind),String(b.kind))||rvCmp(String(a.title||'').toLowerCase(),String(b.title||'').toLowerCase())||rvCmp(String(a.id),String(b.id));});}
/* The document view is shown only while a document is held; until then, the list. */
function rvApplyView(){var doc=view==='doc'&&!!shown&&!!shown.artifactId;
listViewEl.style.display=doc?'none':'flex';docViewEl.style.display=doc?'flex':'none';}
function rvSetView(v){view=v;rvApplyView();rvListSave();}
/* The type in force: the chosen one while a pending document has it, else all types. */
function rvKindInForce(all){return all.some(function(a){return String(a.kind)===list.kind;})?list.kind:'';}
/* The type select and the suggestions. Not rebuilt on a keystroke: that would close the
   suggestions the reviewer is choosing from. */
function rvFilters(){var all=rvOrdered(),counts={},kinds=[];
all.forEach(function(a){var k=String(a.kind);if(!counts[k]){counts[k]=0;kinds.push(k);}counts[k]++;});
var kind=rvKindInForce(all);
while(kindSelEl.firstChild)kindSelEl.removeChild(kindSelEl.firstChild);
kindSelEl.appendChild(rvOption('','All types ('+all.length+')'));
kinds.forEach(function(k){kindSelEl.appendChild(rvOption(k,k+' ('+counts[k]+')'));});
kindSelEl.value=kind;
while(suggestEl.firstChild)suggestEl.removeChild(suggestEl.firstChild);
var offered=0;
(kind?all.filter(function(a){return String(a.kind)===kind;}):all).forEach(function(a){
[String(a.title||''),rvIdOf(a)].forEach(function(text){if(!text||offered>=RV_SUGGEST)return;
var o=document.createElement('option');o.value=text;suggestEl.appendChild(o);offered++;});});}
/* The rows of the page on show, the count, the pager and the notice line. */
function rvRows(){var all=rvOrdered(),kind=rvKindInForce(all);
var ofKind=kind?all.filter(function(a){return String(a.kind)===kind;}):all;
var words=String(list.q||'').toLowerCase().split(/\s+/).filter(function(w){return !!w;});
var hits=ofKind.filter(function(a){var hay=(String(a.title||'')+' '+String(a.id)+' '+String(a.workItemId||'')).toLowerCase();
return words.every(function(w){return hay.indexOf(w)>=0;});});
var pages=Math.max(1,Math.ceil(hits.length/RV_PAGE)),page=Math.min(Math.max(1,list.page),pages);
/* A page beyond the last, or a type nothing has any more, is corrected once a list is here. */
if(listed){list.kind=kind;list.page=page;}
while(listEl.firstChild)listEl.removeChild(listEl.firstChild);
hits.slice((page-1)*RV_PAGE,page*RV_PAGE).forEach(function(a){var tr=document.createElement('tr');
var k=document.createElement('td');k.appendChild(rvEl('span','rv-badge',a.kind));tr.appendChild(k);
var t=document.createElement('td'),b=rvEl('button','rv-rowbtn',a.title||a.id);b.setAttribute('type','button');
b.addEventListener('click',function(){vs.postMessage({v:1,payload:{type:'open-doc',artifactId:a.id}});});
t.appendChild(b);tr.appendChild(t);
tr.appendChild(rvEl('td','rv-idcell',rvIdOf(a)));
tr.appendChild(rvEl('td','rv-numcell',typeof a.openQuestions==='number'?String(a.openQuestions):''));
listEl.appendChild(tr);});
countEl.textContent=listed?(hits.length+' of '+all.length+' document'+(all.length===1?'':'s')):'';
pageEl.textContent='Page '+page+' of '+pages;prevEl.disabled=page<=1;nextEl.disabled=page>=pages;
var note=listNote?listNote:!listed?'Loading the documents awaiting review…':!all.length?'No documents are awaiting review.':!hits.length?'No document matches.':'';
listNoteEl.textContent=note;listNoteEl.className='rv-listnote'+(listNote?' rv-err':'');listNoteEl.style.display=note?'':'none';
if(qEl.value!==list.q)qEl.value=list.q;
if(listed)rvListSave();}
function renderTable(){rvFilters();rvRows();}
/* docs-list: the documents awaiting review. A list that carries documents clears the notice. */
function renderList(l){items=Array.isArray(l)?l:[];listed=true;if(items.length)listNote='';renderTable();}
/* The host's notice that the list could not be read: shown in the list view, where the
   reviewer is; it never changes the view. */
function rvListNotice(text){listNote=String(text||'');listed=true;rvRows();}
qEl.addEventListener('input',function(){list.q=String(qEl.value||'');list.page=1;rvRows();});
kindSelEl.addEventListener('change',function(){list.kind=String(kindSelEl.value||'');list.page=1;renderTable();});
prevEl.addEventListener('click',function(){if(list.page>1){list.page--;rvRows();}});
nextEl.addEventListener('click',function(){list.page++;rvRows();});
backEl.addEventListener('click',function(){rvSetView('list');});
`;
