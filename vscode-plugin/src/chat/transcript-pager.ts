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
 *   to the bottom only when the view was at the bottom before the append, so a reader who has
 *   scrolled up is left where they are.
 * - Which rows are held. Each node is stamped with the absolute transcript index of the row it
 *   belongs to (the host posts it with every live row). When more than MAX_HELD_ROWS rows are held
 *   and the view is at the bottom, the oldest nodes are removed, back to the start of a turn (a
 *   user row), leaving about KEEP_ROWS. With no user row to cut at, the cut is plain. The removed
 *   rows' keys and pending tool rows are forgotten in the registry, so the rows render again when
 *   their page is loaded back.
 */

/** A session's view is trimmed once it holds more rows than this. Fixed: not a setting. */
export const MAX_HELD_ROWS = 300;
/** About how many rows a trim leaves. Fixed: not a setting. */
export const KEEP_ROWS = 200;
/** How close to the end (in px) the view must be to count as "at the bottom". */
export const BOTTOM_SLACK_PX = 4;

/**
 * The pager factory as source: `function(term){...}` returning the pager. `term` is the scrolling
 * transcript element. The registry is handed over afterwards with `attach(reg)`, because the
 * registry is built on a line() that appends through this pager.
 */
export function transcriptPagerWebviewSource(): string {
  return `function(term){
var MAX=${MAX_HELD_ROWS},KEEP=${KEEP_ROWS},SLACK=${BOTTOM_SLACK_PX};
var reg=null,sid='',first=0,last=-1,total=0,rendering=false;
function attach(r){reg=r;}
function atBottom(){return term.scrollHeight-term.scrollTop-term.clientHeight<=SLACK;}
function toBottom(){term.scrollTop=term.scrollHeight;}
function append(node){var follow=!rendering&&atBottom();term.appendChild(node);if(follow)toBottom();return node;}
function stamp(from,rowIndex){
if(typeof rowIndex==='number'&&rowIndex>last)last=rowIndex;
var idx=typeof rowIndex==='number'?rowIndex:last;
var kids=term.children;for(var i=from;i<kids.length;i++)kids[i].__row=idx;
if(last+1>total)total=last+1;}
function isUserRow(n){return (' '+(n.className||'')+' ').indexOf(' insrc-msg--user ')>=0;}
function rowOf(n){return typeof n.__row==='number'?n.__row:first;}
function trimIfNeeded(){
if(rendering||!atBottom()||last-first+1<=MAX)return false;
var target=last-KEEP+1,kids=term.children,cut=target,i;
for(i=kids.length-1;i>=0;i--){var r=rowOf(kids[i]);
if(r<=target&&r>first&&isUserRow(kids[i])){if(last-r+1<=MAX)cut=r;break;}}
var gone=[];
while(term.firstChild&&rowOf(term.firstChild)<cut)gone.push(term.removeChild(term.firstChild));
if(gone.length===0)return false;
first=cut;
if(reg){reg.forgetKeysBefore(cut);reg.forgetPendingIn(gone);}
toBottom();return true;}
function track(rowIndex,fn){var from=term.children.length;try{return fn();}finally{stamp(from,rowIndex);trimIfNeeded();}}
function reset(sessionId,firstIndex,totalRows){
sid=sessionId||'';first=typeof firstIndex==='number'&&firstIndex>0?firstIndex:0;last=first-1;
total=typeof totalRows==='number'?totalRows:0;rendering=false;toBottom();}
function state(){return {sessionId:sid,first:first,last:last,total:total};}
return {attach:attach,append:append,stamp:stamp,track:track,trimIfNeeded:trimIfNeeded,reset:reset,atBottom:atBottom,state:state};}`;
}
