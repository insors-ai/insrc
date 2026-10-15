/**
 * Epic babd84c6e2fb480a Story S001 — making the links and code references in rendered markdown
 * clickable, for the chat page and the review pane.
 *
 * One source string, inlined by render-registry.ts (the chat page) and docs-review-panel.ts
 * (the review pane), so the two cannot drift. It holds three functions of the page script:
 *
 * - guardMd(el): the scrub the page always ran (no href survives on a link, every image source is
 *   dropped), now also keeping an http(s) address in `data-url` and then calling linkifyMd. With no
 *   href on a handled link, nothing but our own click handler can open it.
 * - linkifyMd(el): wraps a code reference (a path with a known extension and an optional `:line`)
 *   in an anchor carrying `data-path` and `data-line`. Text under pre and under an anchor is left
 *   alone; inline code is linked only when its whole text is the reference.
 * - onLinkClick(e, post): one delegated click handler. It prevents the default and posts
 *   'open-link' or 'open-code-ref'; the host checks the target and opens it.
 *
 * The source is written for the page (ES5 style, no template literals) and carries no backtick.
 */
export const LINK_MARKUP_SOURCE = String.raw`
var CREF_EXT='ts|tsx|js|jsx|mjs|cjs|json|md|html|css|scss|py|go|java|scala|rs|rb|sh|yml|yaml|toml|sql|txt|xml|c|h|cpp|hpp|cs|kt|swift|lock';
var CREF_CORE='((?:[A-Za-z0-9_.@-]+/)*[A-Za-z0-9_@-][A-Za-z0-9_.@-]*\\.(?:'+CREF_EXT+'))(?::(\\d+)(?:-\\d+)?(?::\\d+)?)?';
var CREF_FIND=new RegExp('(?<![A-Za-z0-9_./@:-])'+CREF_CORE+'(?![A-Za-z0-9_])(?!\\.[A-Za-z0-9])','g');
var CREF_WHOLE=new RegExp('^'+CREF_CORE+'$');
function setCodeRef(a,m){a.setAttribute('data-path',m[1]);if(m[2])a.setAttribute('data-line',m[2]);}
function linkifyText(node){
var text=String(node.data||'');var parent=node.parentNode;if(!parent||text==='')return;
CREF_FIND.lastIndex=0;var at=0,found=false,m;
while((m=CREF_FIND.exec(text))!==null){
found=true;
if(m.index>at)parent.insertBefore(document.createTextNode(text.slice(at,m.index)),node);
var a=document.createElement('a');setCodeRef(a,m);a.textContent=m[0];parent.insertBefore(a,node);
at=m.index+m[0].length;}
if(!found)return;
if(at<text.length)parent.insertBefore(document.createTextNode(text.slice(at)),node);
parent.removeChild(node);}
function linkifyMd(el){
var kids=Array.prototype.slice.call(el.childNodes||[]);
for(var i=0;i<kids.length;i++){var k=kids[i];
if(k.nodeType===3){linkifyText(k);continue;}
if(k.nodeType!==1)continue;
var tag=String(k.tagName||'').toLowerCase();
if(tag==='a'||tag==='pre'||tag==='script'||tag==='style')continue;
if(tag==='code'){var w=CREF_WHOLE.exec(String(k.textContent||''));
if(w&&k.parentNode){var a=document.createElement('a');setCodeRef(a,w);k.parentNode.insertBefore(a,k);a.appendChild(k);}
continue;}
linkifyMd(k);}}
function guardMd(el){try{
var as=el.querySelectorAll('a');
for(var i=0;i<as.length;i++){var hr=as[i].getAttribute('href')||'';
as[i].removeAttribute('href');as[i].removeAttribute('data-url');as[i].removeAttribute('data-path');as[i].removeAttribute('data-line');
if(/^https?:/i.test(hr))as[i].setAttribute('data-url',hr);}
var ig=el.querySelectorAll('img');for(var j=0;j<ig.length;j++){ig[j].removeAttribute('src');ig[j].removeAttribute('srcset');}
linkifyMd(el);
}catch(e){}}
function onLinkClick(e,post){try{
var t=e&&e.target;
while(t&&t.nodeType===1){
if(String(t.tagName||'').toLowerCase()==='a'){
var u=t.getAttribute('data-url');var p=t.getAttribute('data-path');
if(u){e.preventDefault();post({type:'open-link',url:u});return;}
if(p){e.preventDefault();var l=parseInt(t.getAttribute('data-line')||'',10);
post(l>0?{type:'open-code-ref',path:p,line:l}:{type:'open-code-ref',path:p});return;}}
t=t.parentNode;}
}catch(x){}}
`;

/** The rule that makes a handled anchor read as a link though it has no href. */
export const LINK_MARKUP_STYLE = '.insrc-md a[data-url],.insrc-md a[data-path]{color:var(--link);text-decoration:underline;cursor:pointer;}';
