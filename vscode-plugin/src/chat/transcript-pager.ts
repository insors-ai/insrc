/**
 * Story E20261012ddc4ede1:S001 — the webview's transcript pager.
 *
 * The chat webview holds a bounded window of a session's transcript, not all of it. This module is
 * the webview-side logic for that window, shipped as an embeddable function source (the pattern
 * render-registry.ts uses) so it runs inside the shell's one inline script and is tested against
 * the shared fake DOM. CSP-safe: no import, no remote origin, no vscode reference.
 *
 * The pager owns two things:
 *
 * - Every append to the transcript element goes through `append(node)`. A new row scrolls the view
 *   to the bottom only while the view is following the bottom, so a reader who has scrolled up is
 *   left where they are. Following is remembered, not measured at each append: the renderers
 *   append a row empty and fill it afterwards, so the view is often short of the bottom by the
 *   last row's height without the reader having moved. It ends only when the view is found above
 *   where the pager last put it (the reader scrolled up) and starts again at the bottom. `track`
 *   moves a following view to the bottom once more after the row is filled.
 * - Which rows are held. Each node is stamped with the absolute transcript index of the row it
 *   belongs to (the host posts it with every live row). When more than MAX_HELD_ROWS rows are held
 *   and the view is at the bottom, the oldest nodes are removed, back to the start of a turn (a
 *   user row), leaving about KEEP_ROWS. With no user row to cut at, the cut is plain. The removed
 *   rows' keys and pending tool rows are forgotten in the registry, so the rows render again when
 *   their page is loaded back.
 *
 * Older rows come back a page at a time. While rows older than the first held one exist, a 'load
 * earlier' bar says how many; a click on it, or scrolling to the top, posts one `load-older` for
 * the first held index (never a second while one is waiting; the wait gives up after
 * LOAD_WAIT_MS). The host's `transcript-page` is rendered through the registry above the held
 * rows, in order, and the scroll position is moved by the height added, so the row the reader was
 * looking at stays where it was. A page that is not for the shown session, or does not end at the
 * first held index, is discarded.
 */

/** A session's view is trimmed once it holds more rows than this. Fixed: not a setting. */
export const MAX_HELD_ROWS = 300;
/** About how many rows a trim leaves. Fixed: not a setting. */
export const KEEP_ROWS = 200;
/** How close to the end (in px) the view must be to count as "at the bottom". */
export const BOTTOM_SLACK_PX = 4;
/** How long the pager waits for a requested page before it lets the reader ask again. */
export const LOAD_WAIT_MS = 5000;

/**
 * The pager factory as source: `function(term,o){...}` returning the pager. `term` is the scrolling
 * transcript element. `o` (all optional) carries `bar`, the 'load earlier' element; `post`, which
 * sends a message to the host; and `setTimeout` / `clearTimeout` (the globals by default). The
 * registry is handed over afterwards with `attach(reg)`, because the registry is built on a line()
 * that appends through this pager.
 */
export function transcriptPagerWebviewSource(): string {
  return `function(term,o){
o=o||{};
var MAX=${MAX_HELD_ROWS},KEEP=${KEEP_ROWS},SLACK=${BOTTOM_SLACK_PX},WAIT=${LOAD_WAIT_MS};
var bar=o.bar||null,post=o.post||function(){};
var later=o.setTimeout||function(f,ms){return setTimeout(f,ms);},cancel=o.clearTimeout||function(t){clearTimeout(t);};
var reg=null,sid='',first=0,last=-1,total=0,rendering=false,loading=false,timer=null,pinned=true,pinTop=0;
function attach(r){reg=r;}
function atBottom(){return term.scrollHeight-term.scrollTop-term.clientHeight<=SLACK;}
function toBottom(){term.scrollTop=term.scrollHeight;pinned=true;pinTop=term.scrollTop;}
function following(){
if(atBottom()){pinned=true;pinTop=term.scrollTop;}
else if(pinned&&term.scrollTop<pinTop)pinned=false;
return pinned;}
function append(node){var follow=!rendering&&following();term.appendChild(node);if(follow)toBottom();return node;}
function showBar(){if(!bar)return;
if(first>0){bar.textContent='\\u2191 Load earlier messages ('+first+' older)';bar.style.display='';}
else{bar.textContent='';bar.style.display='none';}}
function stamp(from,rowIndex){
if(typeof rowIndex==='number'&&rowIndex>last)last=rowIndex;
var idx=typeof rowIndex==='number'?rowIndex:last;
var kids=term.children;for(var i=from;i<kids.length;i++)kids[i].__row=idx;
if(last+1>total)total=last+1;}
function isUserRow(n){return (' '+(n.className||'')+' ').indexOf(' insrc-msg--user ')>=0;}
function rowOf(n){return typeof n.__row==='number'?n.__row:first;}
function trimIfNeeded(){
if(rendering||!following()||last-first+1<=MAX)return false;
var target=last-KEEP+1,kids=term.children,cut=target,i;
for(i=kids.length-1;i>=0;i--){var r=rowOf(kids[i]);
if(r<=target&&r>first&&isUserRow(kids[i])){if(last-r+1<=MAX)cut=r;break;}}
var gone=[];
while(term.firstChild&&rowOf(term.firstChild)<cut)gone.push(term.removeChild(term.firstChild));
if(gone.length===0)return false;
first=cut;
if(reg){reg.forgetKeysBefore(cut);reg.forgetPendingIn(gone);}
showBar();toBottom();return true;}
function track(rowIndex,fn){var from=term.children.length;try{return fn();}finally{stamp(from,rowIndex);if(!rendering&&following())toBottom();trimIfNeeded();}}
function endLoad(){loading=false;if(timer!==null){cancel(timer);timer=null;}}
function requestOlder(){
if(loading||first<=0||sid==='')return false;
loading=true;timer=later(function(){timer=null;loading=false;},WAIT);
post({type:'load-older',sessionId:sid,before:first});return true;}
function renderOne(row,idx){
var from=term.children.length;
try{reg.appendKeyed(reg.toViewModel(row),'r'+idx);}
catch(e){try{reg.renderRow({kind:'fallback',text:row&&row.text!=null?String(row.text):'',collapsible:false});}catch(_){}}
var kids=term.children;for(var j=from;j<kids.length;j++)kids[j].__row=idx;}
function prepend(page){
if(!reg||!page||page.sessionId!==sid||page.before!==first)return false;
endLoad();
if(typeof page.total==='number'&&page.total>total)total=page.total;
var rows=page.rows||[],start=page.firstIndex;
if(rows.length===0||typeof start!=='number'||start<0||start>=first){showBar();return false;}
following();
var oldTop=term.scrollTop,oldHeight=term.scrollHeight,held=term.children.length,anchor=term.firstChild;
rendering=true;
try{reg.withIsolatedPending(function(){for(var i=0;i<rows.length;i++)renderOne(rows[i],start+i);});}
finally{rendering=false;}
if(anchor){var fresh=[];for(var k=held;k<term.children.length;k++)fresh.push(term.children[k]);
for(var m=0;m<fresh.length;m++)term.insertBefore(fresh[m],anchor);}
first=start;showBar();
term.scrollTop=oldTop+(term.scrollHeight-oldHeight);
if(pinned)pinTop=term.scrollTop;
return true;}
function onScroll(){if(term.scrollTop<=SLACK&&first>0)requestOlder();if(following()&&atBottom())trimIfNeeded();}
function reset(sessionId,firstIndex,totalRows){
sid=sessionId||'';first=typeof firstIndex==='number'&&firstIndex>0?firstIndex:0;last=first-1;
total=typeof totalRows==='number'?totalRows:0;rendering=false;endLoad();showBar();toBottom();}
function state(){return {sessionId:sid,first:first,last:last,total:total,loading:loading};}
term.addEventListener('scroll',onScroll);
if(bar)bar.addEventListener('click',function(){requestOlder();});
showBar();
return {attach:attach,append:append,stamp:stamp,track:track,trimIfNeeded:trimIfNeeded,reset:reset,prepend:prepend,requestOlder:requestOlder,atBottom:atBottom,state:state};}`;
}
