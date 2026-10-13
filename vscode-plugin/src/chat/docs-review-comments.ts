/**
 * Story E202610138d4b90c9:S001 — the review pane's inline comments, as webview source.
 *
 * One string, inlined into the pane's single nonce'd script after the bootstrap's
 * element lookups (it reads `bodyEl`, `mdEl`, `fieldEl`, `vs`, `shown` and `tab` from that
 * scope). It holds:
 *
 *   - the text model of a rendered document: a BLOCK is a paragraph, list item, cell,
 *     heading, quote or code block; its text is the text nodes it holds outside any
 *     nested block, in document order. A passage is a block and two offsets into that
 *     text, so it survives the inline markup (bold, code, links) inside the block;
 *   - the anchor of a passage: its quote, the slug of the heading above it, and up to
 *     RV_CONTEXT characters of the block's text on each side;
 *   - finding an anchor again in a document (rvFind), which is how a draft is put back
 *     after the document is rendered again and how a saved comment is placed;
 *   - drafts: the comments written and not yet sent. They are kept per artifact in the
 *     webview's saved state, so hiding the pane, or the shell being rebuilt, loses none;
 *   - the saved comments of the document: those with an anchor are put on their passages
 *     with a margin marker that counts them and open as a thread, oldest first; the rest
 *     are listed in the whole-document strip in time order.
 *
 * Nothing here assigns markup: every element is made with createElement and every
 * comment, quote and name is set as text.
 *
 * A raw template, so the backslashes of the regular expressions and the \u escapes reach
 * the script as written. It contains no backtick and no dollar-brace.
 */
export const DOCS_COMMENTS_SOURCE = String.raw`
var RV_BLOCKS={P:1,LI:1,TD:1,TH:1,H1:1,H2:1,H3:1,H4:1,H5:1,H6:1,BLOCKQUOTE:1,PRE:1,DD:1,DT:1};
var RV_QUOTE_MAX=500;var RV_CONTEXT=40;var RV_SVG='http://www.w3.org/2000/svg';
function rvTag(n){return n&&n.nodeType===1?String(n.tagName).toUpperCase():'';}
function rvClassHas(n,name){return !!n&&typeof n.className==='string'&&(' '+n.className+' ').indexOf(' '+name+' ')>=0;}
function rvIsMark(n){return rvTag(n)==='MARK'&&rvClassHas(n,'rv-anno');}
function rvIsHeading(n){return /^H[1-6]$/.test(rvTag(n));}
/* Not document text: a thread card, and a diagram or mock drawn into the body. */
function rvIsAdjunct(n){return rvClassHas(n,'rv-thread')||rvClassHas(n,'insrc-dg-slot');}
/* The innermost block holding a node; null outside the document body or inside an adjunct. */
function rvBlockOf(node){var n=node,b=null;
while(n&&n!==bodyEl){if(rvIsAdjunct(n))return null;if(!b&&RV_BLOCKS[rvTag(n)])b=n;n=n.parentNode;}
return n===bodyEl?b:null;}
/* The child of the document body a node is in. */
function rvTopOf(node){var n=node;while(n&&n.parentNode!==bodyEl)n=n.parentNode;return n||null;}
function rvMarkOf(node){var n=node;while(n&&n!==bodyEl){if(rvIsMark(n))return n;n=n.parentNode;}return null;}
function rvInside(el,node){var n=node;while(n){if(n===el)return true;n=n.parentNode;}return false;}
/* A block's own text nodes, in order: those of nested blocks belong to the nested block. */
function rvTexts(el,out){out=out||[];
for(var c=el.firstChild;c;c=c.nextSibling){if(c.nodeType===3)out.push(c);else if(c.nodeType===1&&!RV_BLOCKS[rvTag(c)])rvTexts(c,out);}
return out;}
function rvTextOf(el){return rvTexts(el).map(function(t){return String(t.data);}).join('');}
function rvBlocksIn(el,out){out=out||[];if(rvIsAdjunct(el))return out;if(RV_BLOCKS[rvTag(el)])out.push(el);
for(var c=el.firstChild;c;c=c.nextSibling){if(c.nodeType===1)rvBlocksIn(c,out);}
return out;}
/* The document's own Feedback section lists the saved comments: it is not commented on
   and no comment is placed in it. */
function rvIsFeedbackHeading(h){return /^\s*(\d+[.)]?\s+)?feedback\s*$/i.test(rvTextOf(h)||String(h.textContent||''));}
/* Every child of the body with the slug of the heading at or above it, and whether it is
   in the Feedback section. One pass. */
function rvTops(fn){var slug='',fb=false,level=0;
for(var c=bodyEl.firstChild;c;c=c.nextSibling){if(c.nodeType!==1)continue;
if(rvIsHeading(c)){var lv=Number(rvTag(c).slice(1));
if(fb&&lv<=level)fb=false;
if(rvIsFeedbackHeading(c)){fb=true;level=lv;}
if(c.id)slug=String(c.id);}
if(fn(c,slug,fb)===false)return;}}
function rvPlaceOf(top){var place={slug:'',feedback:false};
rvTops(function(c,slug,fb){if(c===top){place={slug:slug,feedback:fb};return false;}});return place;}
/* The offset, in a block's text, of one end of a selection: a text node and an offset
   into it, or an element and an index among its children. -1 when it is not in the block. */
function rvOffsetIn(block,node,offset){var total=0,found=-1;
(function walk(el){var i=0;
for(var c=el.firstChild;c&&found<0;c=c.nextSibling,i++){
if(el===node&&i===offset){found=total;return;}
if(c.nodeType===3){if(c===node){found=total+Math.min(offset,String(c.data).length);return;}total+=String(c.data).length;}
else if(c.nodeType===1&&!RV_BLOCKS[rvTag(c)]){walk(c);}}
if(found<0&&el===node)found=total;})(block);
return found;}
/* Whether a passage touches text that is already marked. */
function rvCutsMark(block,start,end){var pos=0,cut=false;
rvTexts(block).forEach(function(t){var len=String(t.data).length;if(Math.max(start,pos)<Math.min(end,pos+len)&&rvMarkOf(t))cut=true;pos+=len;});
return cut;}
/* Mark a passage: each piece of text it covers is wrapped in its own mark, so inline
   markup inside the passage is left as it is. Returns the marks. */
function rvWrap(block,start,end,cls){var marks=[],pos=0;
rvTexts(block).forEach(function(t){var data=String(t.data),len=data.length,a=Math.max(start,pos),b=Math.min(end,pos+len);
if(a<b){var p=t.parentNode,m=document.createElement('mark');m.className=cls;
m.appendChild(document.createTextNode(data.slice(a-pos,b-pos)));
if(a>pos)p.insertBefore(document.createTextNode(data.slice(0,a-pos)),t);
p.insertBefore(m,t);
if(b<pos+len)p.insertBefore(document.createTextNode(data.slice(b-pos)),t);
p.removeChild(t);marks.push(m);}
pos+=len;});
return marks;}
function rvUnwrap(marks){(marks||[]).forEach(function(m){var p=m.parentNode;if(!p)return;
while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m);});}
/* The passage a selection covers, with its anchor; null when no comment can be made on
   it: no document is open (a notice is shown instead), it is not inside one block of the markdown document, it is in the Feedback
   section, it is blank or longer than RV_QUOTE_MAX, or it touches a marked passage. */
function rvPassage(range){if(!range||tab||!shown||!shown.artifactId)return null;
var block=rvBlockOf(range.startContainer);if(!block||block!==rvBlockOf(range.endContainer))return null;
var top=rvTopOf(block);if(!top)return null;var place=rvPlaceOf(top);if(place.feedback)return null;
var s=rvOffsetIn(block,range.startContainer,range.startOffset),e=rvOffsetIn(block,range.endContainer,range.endOffset);
if(s<0||e<0)return null;if(e<s){var x=s;s=e;e=x;}
var text=rvTextOf(block);
while(s<e&&/\s/.test(text.charAt(s)))s++;while(e>s&&/\s/.test(text.charAt(e-1)))e--;
if(e<=s||e-s>RV_QUOTE_MAX)return null;
if(rvCutsMark(block,s,e))return null;
var anchor={quote:text.slice(s,e)};if(place.slug)anchor.sectionSlug=place.slug;
var pre=text.slice(Math.max(0,s-RV_CONTEXT),s),suf=text.slice(e,e+RV_CONTEXT);
if(pre)anchor.prefix=pre;if(suf)anchor.suffix=suf;
return {block:block,start:s,end:e,anchor:anchor};}
/* Where an anchor's quote is in the document now: first in the anchor's section with
   its prefix and suffix, then anywhere in that section, then anywhere when it occurs
   exactly once. An anchor with no section is looked for in the whole document. The
   Feedback section is never searched. */
function rvFind(anchor){var q=String((anchor&&anchor.quote)||'');if(!q)return null;
var pre=String(anchor.prefix||''),suf=String(anchor.suffix||''),want=String(anchor.sectionSlug||'');
var inSection=[],all=[];
rvTops(function(top,slug,fb){if(fb)return;
rvBlocksIn(top).forEach(function(b){var text=rvTextOf(b),from=0,i;
while((i=text.indexOf(q,from))>=0){
var hit={block:b,start:i,end:i+q.length,
exact:text.slice(Math.max(0,i-pre.length),i)===pre&&text.slice(i+q.length,i+q.length+suf.length)===suf};
all.push(hit);if(!want||slug===want)inSection.push(hit);from=i+1;}});});
var exact=inSection.filter(function(h){return h.exact;});
if(exact.length)return exact[0];
if(inSection.length)return inSection[0];
return all.length===1?all[0]:null;}
function rvEl(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;}
/* A round, icon-only button: its name is its title and aria-label. */
function rvIconButton(path,label,cls){var b=document.createElement('button');b.className='rv-ic rv-sm'+(cls?' '+cls:'');
b.setAttribute('type','button');b.setAttribute('title',label);b.setAttribute('aria-label',label);
var svg=document.createElementNS(RV_SVG,'svg');svg.setAttribute('viewBox','0 0 16 16');svg.setAttribute('aria-hidden','true');
var p=document.createElementNS(RV_SVG,'path');p.setAttribute('d',path);svg.appendChild(p);b.appendChild(svg);return b;}

/* ---- threads: the saved comments and the drafts of one passage ---- */
/* A thread is one passage: its anchor, the saved comments placed on it (oldest first) and
   the comments drafted on it. block, start, end and marks are where it is in the document
   as rendered now (no block when its quote is not there); card is its open thread card. */
var rvThreads=[];var rvPending=null;
/* The saved comments with no passage: those on the whole document, on an HTML document of
   the artifact, and those whose quote is no longer in the document. rvSkipped counts the
   saved entries that could not be read. */
var rvStrip=[];var rvSkipped=0;var rvMarkerEls=[];
function rvDraftCount(){var n=0;rvThreads.forEach(function(th){n+=th.drafts.length;});return n;}
function rvWho(){var r=shown&&shown.reviewer;return (r&&typeof r.name==='string'&&r.name)?r.name:'you';}
function rvSameAnchor(a,b){return a.quote===b.quote&&(a.sectionSlug||'')===(b.sectionSlug||'')&&(a.prefix||'')===(b.prefix||'')&&(a.suffix||'')===(b.suffix||'');}
function rvThreadFor(anchor){for(var i=0;i<rvThreads.length;i++){if(rvSameAnchor(rvThreads[i].anchor,anchor))return rvThreads[i];}
var th={anchor:anchor,saved:[],drafts:[],block:null,start:-1,end:-1,marks:[],card:null,open:false};rvThreads.push(th);return th;}
function rvThreadAt(hit){for(var i=0;i<rvThreads.length;i++){var th=rvThreads[i];if(th.block===hit.block&&th.start===hit.start&&th.end===hit.end)return th;}return null;}
function rvPut(th,hit){th.block=hit.block;th.start=hit.start;th.end=hit.end;th.marks=rvWrap(hit.block,hit.start,hit.end,'rv-anno');}
/* Dashed while the passage has a draft, or nothing saved yet; solid when it has only saved comments. */
function rvRestyle(th){var cls='rv-anno'+((th.drafts.length||!th.saved.length)?' rv-draft':'');th.marks.forEach(function(m){m.className=cls;});}
function rvCloseThread(th){if(th.card&&th.card.parentNode)th.card.parentNode.removeChild(th.card);th.card=null;th.open=false;}
function rvDropThread(th){rvCloseThread(th);rvUnwrap(th.marks);th.marks=[];th.block=null;var i=rvThreads.indexOf(th);if(i>=0)rvThreads.splice(i,1);}
/* A passage with neither a saved comment nor a draft is no longer a thread. */
function rvSettle(th,reopen){if(!th.drafts.length&&!th.saved.length){rvDropThread(th);return;}
rvRestyle(th);if(reopen)rvOpenThread(th);else rvCloseThread(th);}
/* A saved entry the pane can show: its author, time and comment are all text. */
function rvReadable(e){return !!e&&typeof e==='object'&&typeof e.author==='string'&&typeof e.timestamp==='string'&&typeof e.comment==='string';}
/* The time of a saved comment, in the reader's own time; as stored when it is not a time. */
function rvWhen(ts){var d=new Date(ts);if(isNaN(d.getTime()))return String(ts);
function p(n){return (n<10?'0':'')+n;}
return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());}
function rvDecisionOf(e){return e.decision==='approve'?'approved':e.decision==='reject'?'rejected':e.decision==='feedback'?'feedback':((typeof e.kind==='string'&&e.kind)?e.kind:'comment');}
/* Made on another version of the document than the one shown. */
function rvEarlier(e){var v=e.target&&e.target.version;return typeof v==='string'&&v!==''&&!!shown&&typeof shown.contentVersion==='string'&&v!==shown.contentVersion;}
/* One saved comment: who, when, the decision it was saved with and a note, then (from the
   caller) its quote and its text. All set as text. */
function rvSavedRow(e,note){var row=rvEl('div','rv-c');
row.appendChild(rvEl('span','rv-who',e.author));row.appendChild(rvEl('span','rv-when',rvWhen(e.timestamp)));
row.appendChild(rvEl('span','rv-tag'+(e.decision==='approve'?' rv-tag-approve':e.decision==='reject'?' rv-tag-reject':''),rvDecisionOf(e)+(note?' · '+note:'')));
return row;}
/* The thread card, under the block of the passage: the quote, the saved comments oldest
   first, each draft with a control to remove it, and a field with round add and close
   buttons. */
function rvOpenThread(th,focus){rvCloseThread(th);var card=rvEl('div','rv-thread');
card.appendChild(rvEl('div','rv-q','“'+th.anchor.quote+'”'));
th.saved.forEach(function(e){var row=rvSavedRow(e,rvEarlier(e)?'on an earlier revision':'');row.appendChild(rvEl('div','rv-text',e.comment));card.appendChild(row);});
th.drafts.forEach(function(d,i){var row=rvEl('div','rv-c');
var x=rvEl('button','rv-x','✕');x.setAttribute('type','button');x.setAttribute('title','Remove this draft');x.setAttribute('aria-label','Remove this draft');
x.addEventListener('click',function(){th.drafts.splice(i,1);rvSettle(th,true);rvSync();});
row.appendChild(x);row.appendChild(rvEl('span','rv-who',rvWho()));row.appendChild(rvEl('span','rv-tag rv-tag-draft','draft, not sent'));
row.appendChild(rvEl('div','rv-text',d.text));card.appendChild(row);});
var comp=rvEl('div','rv-compose'),ta=document.createElement('textarea');
ta.setAttribute('rows','1');ta.setAttribute('maxlength','10000');ta.setAttribute('placeholder','Comment on this text…');ta.setAttribute('aria-label','Comment on the selected text');
var add=rvIconButton('M8 3v10M3 8h10','Add this comment as a draft');
var close=rvIconButton('M4 4l8 8M12 4l-8 8','Close');
function addDraft(){var v=String(ta.value||'').trim();if(!v)return;th.drafts.push({text:v});rvRestyle(th);rvOpenThread(th,true);rvSync();}
add.addEventListener('click',addDraft);
ta.addEventListener('keydown',function(e){if(e&&e.key==='Enter'&&!e.shiftKey){if(e.preventDefault)e.preventDefault();addDraft();}});
/* Closing a passage that has no comment takes its mark away. */
close.addEventListener('click',function(){rvSettle(th,false);rvSync();});
comp.appendChild(ta);comp.appendChild(add);comp.appendChild(close);card.appendChild(comp);
var top=th.block?rvTopOf(th.block):null;
if(top&&top.parentNode===bodyEl)bodyEl.insertBefore(card,top.nextSibling);else bodyEl.appendChild(card);
th.card=card;th.open=true;
if(focus&&typeof ta.focus==='function'){try{ta.focus();}catch(err){}}}
/* The margin markers: one beside each commented passage, with the number of its comments.
   A click opens the thread, or closes it. Placed level with the passage when the page can
   say where that is. */
function rvMarkers(){rvMarkerEls.forEach(function(b){if(b.parentNode)b.parentNode.removeChild(b);});rvMarkerEls=[];
rvThreads.forEach(function(th){var n=th.saved.length+th.drafts.length;if(!th.block||!th.marks.length||!n)return;
var b=document.createElement('button');b.className='rv-marker'+(th.drafts.length?' rv-draft':'');b.setAttribute('type','button');
var label=n+' comment'+(n===1?'':'s')+' on this text'+(th.drafts.length?', '+th.drafts.length+' not sent':'');
b.setAttribute('title',label);b.setAttribute('aria-label',label);
var svg=document.createElementNS(RV_SVG,'svg');svg.setAttribute('viewBox','0 0 16 16');svg.setAttribute('aria-hidden','true');
var p=document.createElementNS(RV_SVG,'path');p.setAttribute('d','M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z');svg.appendChild(p);b.appendChild(svg);
b.appendChild(rvEl('span','rv-n',String(n)));
try{var r=th.marks[0].getBoundingClientRect(),base=mdEl.getBoundingClientRect();b.style.top=(r.top-base.top)+'px';}catch(err){}
b.addEventListener('click',function(){if(th.card)rvCloseThread(th);else rvOpenThread(th);rvMarkers();});
mdEl.appendChild(b);rvMarkerEls.push(b);});}
/* The strip above the comment panel: the saved comments with no passage, oldest first.
   Hidden when there is nothing to say. */
function rvStripRender(){while(histListEl.firstChild)histListEl.removeChild(histListEl.firstChild);
var n=rvStrip.length;histEl.style.display=(n||rvSkipped)?'':'none';
histSumEl.textContent='Earlier comments on the whole document ('+n+')'+(rvSkipped?' · '+rvSkipped+' saved comment'+(rvSkipped===1?'':'s')+' could not be shown':'');
rvStrip.forEach(function(s){var row=rvSavedRow(s.e,s.note);
if(s.quote)row.appendChild(rvEl('div','rv-hq','“'+s.quote+'”'));
row.appendChild(rvEl('div','rv-text',s.e.comment));histListEl.appendChild(row);});}
/* Put the saved comments and the drafts on the document as rendered now. The body was
   rendered again, so earlier marks, cards and markers are gone with it. */
function rvPlaceAll(){
rvThreads.forEach(function(th){th.saved=[];th.marks=[];th.card=null;th.block=null;th.start=-1;th.end=-1;});
rvStrip=[];rvSkipped=0;
var list=(shown&&Array.isArray(shown.feedback))?shown.feedback:[],valid=[];
list.forEach(function(e,i){if(rvReadable(e))valid.push({e:e,i:i,t:Date.parse(e.timestamp)});else rvSkipped++;});
/* Oldest first; entries of one time (one decision) stay in the order they were saved. */
valid.sort(function(a,b){var x=isNaN(a.t)||isNaN(b.t)?(a.e.timestamp<b.e.timestamp?-1:a.e.timestamp>b.e.timestamp?1:0):a.t-b.t;return x||a.i-b.i;});
valid.forEach(function(v){var e=v.e,a=e.anchor,file=(e.target&&typeof e.target.file==='string')?e.target.file:'';
/* On an HTML document of the artifact: a whole-document comment that names the file. */
if(/\.html$/i.test(file)&&file!==shown.docPath){rvStrip.push({e:e,note:'on '+file.slice(file.lastIndexOf('/')+1)});return;}
if(!a||typeof a.quote!=='string'||!a.quote){rvStrip.push({e:e,note:rvEarlier(e)?'on an earlier revision':''});return;}
var hit=rvFind(a),th=hit?rvThreadAt(hit):null;
if(hit&&!th){if(rvCutsMark(hit.block,hit.start,hit.end))hit=null;else{th=rvThreadFor(a);rvPut(th,hit);}}
/* Its quote is not in the document any more: listed with the quote it was made on. */
if(!hit){rvStrip.push({e:e,quote:a.quote,note:'on an earlier revision'});return;}
th.saved.push(e);});
/* The drafts: on a passage that already has a thread, they join it. */
rvThreads.slice().forEach(function(th){if(th.block||!th.drafts.length)return;var hit=rvFind(th.anchor);if(!hit)return;
var at=rvThreadAt(hit);
if(at&&at!==th){at.drafts=at.drafts.concat(th.drafts);at.open=at.open||th.open;th.drafts=[];return;}
if(!rvCutsMark(hit.block,hit.start,hit.end))rvPut(th,hit);});
rvThreads=rvThreads.filter(function(th){return th.saved.length||th.drafts.length;});
rvThreads.forEach(function(th){rvRestyle(th);if(th.open&&th.block)rvOpenThread(th);else th.open=false;});
rvStripRender();rvMarkers();}
/* The saved state: per artifact, the whole-document field and the drafts. */
function rvStored(){try{var s=vs.getState?vs.getState():null;return (s&&s.rv&&typeof s.rv==='object')?s.rv:{};}catch(err){return {};}}
function rvSave(){if(!shown||!shown.artifactId)return;var all=rvStored(),drafts=[];
rvThreads.forEach(function(th){th.drafts.forEach(function(d){drafts.push({anchor:th.anchor,text:d.text});});});
var field=String(fieldEl.value||'');
if(drafts.length||field)all[shown.artifactId]={field:field,drafts:drafts};else delete all[shown.artifactId];
try{if(vs.setState)vs.setState({rv:all});}catch(err){}}
/* Another artifact is shown: its own field and drafts are taken from the saved state. */
function rvLoad(){rvThreads=[];rvPending=null;var saved=shown&&shown.artifactId?rvStored()[shown.artifactId]:null;
fieldEl.value=(saved&&typeof saved.field==='string')?saved.field:'';
((saved&&Array.isArray(saved.drafts))?saved.drafts:[]).forEach(function(d){
if(!d||!d.anchor||typeof d.anchor.quote!=='string'||typeof d.text!=='string'||!d.text)return;
rvThreadFor(d.anchor).drafts.push({text:d.text});});}
/* The drafts as comments, in the order they were made: each with its anchor and the
   version of the document it was made on. */
function rvDraftComments(){var out=[];
rvThreads.forEach(function(th){th.drafts.forEach(function(d){var a={quote:th.anchor.quote};
if(th.anchor.sectionSlug)a.sectionSlug=th.anchor.sectionSlug;if(th.anchor.prefix)a.prefix=th.anchor.prefix;if(th.anchor.suffix)a.suffix=th.anchor.suffix;
var c={comment:d.text,anchor:a};if(shown&&typeof shown.contentVersion==='string')c.version=shown.contentVersion;out.push(c);});});
return out;}
/* Every draft was saved: none is left, in the document or in the saved state. A passage
   that has saved comments keeps its thread. */
function rvClearDrafts(){rvThreads.slice().forEach(function(th){th.drafts=[];rvSettle(th,!!th.card);});}
/* The line above the field, the markers and the saved state, after any change to the drafts. */
function rvSync(){var n=rvDraftCount(),lost=0;rvThreads.forEach(function(th){if(!th.block)lost+=th.drafts.length;});
draftsEl.textContent=n?(n+' inline comment'+(n===1?'':'s')+' drafted'+(lost?' ('+lost+' on text that is no longer in the document)':'')+'. Sent with the button you press.'):(tab?'':'Select text in the document to comment on it.');
rvMarkers();rvSave();}
function rvHidePop(){rvPending=null;popEl.style.display='none';}
/* A selection was made or changed: offer the comment button when a comment can be made on it. */
function rvOnSelect(e){if(e&&e.target&&rvInside(popEl,e.target))return;
var sel=window.getSelection?window.getSelection():null,range=null;
if(sel&&!sel.isCollapsed&&sel.rangeCount>0){try{range=sel.getRangeAt(0);}catch(err){range=null;}}
rvPending=rvPassage(range);
if(!rvPending){popEl.style.display='none';return;}
/* 'block', not '': the style sheet hides the button until there is a passage. */
popEl.style.display='block';
/* Under the end of the selection, when the page can say where that is. */
try{var rect=range.getBoundingClientRect(),base=mdEl.getBoundingClientRect();
popEl.style.left=Math.max(0,rect.left-base.left)+'px';popEl.style.top=(rect.bottom-base.top+4)+'px';}catch(err){}}
document.addEventListener('mouseup',rvOnSelect);
document.addEventListener('keyup',rvOnSelect);
/* The comment button: mark the passage and open its thread, with the field ready. */
popBtn.addEventListener('click',function(){var p=rvPending;rvHidePop();if(!p)return;
var th=rvThreadFor(p.anchor);
if(!th.marks.length)rvPut(th,p);
rvRestyle(th);
try{var sel=window.getSelection?window.getSelection():null;if(sel&&sel.removeAllRanges)sel.removeAllRanges();}catch(err){}
rvOpenThread(th,true);rvSync();});
/* A marked passage: a click opens its thread, or closes it. */
bodyEl.addEventListener('click',function(e){var m=rvMarkOf(e&&e.target);if(!m)return;
var sel=window.getSelection?window.getSelection():null;if(sel&&sel.isCollapsed===false)return;
for(var i=0;i<rvThreads.length;i++){var th=rvThreads[i];if(th.marks.indexOf(m)>=0){if(th.card)rvCloseThread(th);else rvOpenThread(th);rvMarkers();return;}}});
fieldEl.addEventListener('input',rvSave);
/* The markers are level with their passages, which move when the pane is resized. */
window.addEventListener('resize',rvMarkers);
`;
