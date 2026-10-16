/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E20261016f52996c2:S001 — the page script that makes a code reference in a docgen or
 * companion page clickable inside the review pane's frame.
 *
 * The pane shows the page in a sandboxed srcdoc frame, so a click there never reaches the pane's
 * own handler. This script marks each element whose own text holds a code reference (a path with
 * a directory part and an optional `:N`, `:N-M` or `:N:C`), and on a click posts
 * `{ type: 'insrc-open-code-ref', path, line? }` to the parent. The pane forwards it to the host
 * only from its own frame, and the host checks the path (that check is the trust boundary).
 *
 * The extension list and the shape of a reference are the chat page's (`link-markup.ts`
 * `CREF_EXT` / `CREF_CORE`), except that the directory part is required here, so a bare file name
 * in a diagram is not turned into a link. A test pins the two together.
 *
 * Two page facts shape it. The pan/zoom viewport captures the pointer on pointerdown, so a click
 * on a box inside it is delivered to the viewport; the element and position are therefore
 * recorded at pointerdown, in the capture phase. And the pan/zoom drag must keep working, so the
 * script stops no event, leaves pointer capture alone, and treats a press that moved more than 4
 * pixels as a drag; a click with no press before it (the keyboard, detail 0) uses its own target.
 * Marking is repeatable: an element whose text no longer holds a reference loses its mark, so the
 * diagram's source text, marked before the diagram is drawn, does not stay marked once the
 * diagram replaces it. Marking sets attributes only (the page's style gives a marked element its
 * pointer cursor); it never splits or edits a text node.
 *
 * It imports from neither page shell, so both can inline it. The source is ES5-style and holds
 * no backtick and no `</script`.
 */
export const CODE_REF_SCRIPT = String.raw`
(function(){
var EXT='ts|tsx|js|jsx|mjs|cjs|json|md|html|css|scss|py|go|java|scala|rs|rb|sh|yml|yaml|toml|sql|txt|xml|c|h|cpp|hpp|cs|kt|swift|lock';
var RE=new RegExp('(?<![A-Za-z0-9_./@:-])((?:[A-Za-z0-9_.@-]+/)+[A-Za-z0-9_@-][A-Za-z0-9_.@-]*\\.(?:'+EXT+'))(?::(\\d+)(?:-\\d+)?(?::\\d+)?)?(?![A-Za-z0-9_])(?!\\.[A-Za-z0-9])');
var DRAG=4;
function ownText(el){var s='',k=el.childNodes||[];
for(var i=0;i<k.length;i++){if(k[i].nodeType===3)s+=String(k[i].data||'');}
return s;}
function markCodeRefs(){try{
var all=document.querySelectorAll('*');
for(var i=0;i<all.length;i++){var el=all[i];
var tag=String(el.tagName||'').toLowerCase();
if(tag==='script'||tag==='style')continue;
var m=RE.exec(ownText(el));
if(!m){
if(el.getAttribute('data-insrc-path')){el.removeAttribute('data-insrc-path');el.removeAttribute('data-insrc-line');}
continue;}
el.setAttribute('data-insrc-path',m[1]);
if(m[2])el.setAttribute('data-insrc-line',m[2]);else if(el.removeAttribute)el.removeAttribute('data-insrc-line');
}
}catch(e){}}
function markedFrom(t){
while(t&&t.nodeType===1){if(t.getAttribute('data-insrc-path'))return t;t=t.parentNode;}
return null;}
var down=null;
document.addEventListener('pointerdown',function(e){
if(e.button!==undefined&&e.button!==0){down=null;return;}
down={t:e.target,x:e.clientX,y:e.clientY};},true);
document.addEventListener('click',function(e){try{
var d=down;down=null;
var t=e.target;
if(d&&e.detail!==0){var dx=e.clientX-d.x,dy=e.clientY-d.y;
if(dx*dx+dy*dy>DRAG*DRAG)return;
t=d.t;}
var el=markedFrom(t);if(!el)return;
var msg={type:'insrc-open-code-ref',path:el.getAttribute('data-insrc-path')};
var line=el.getAttribute('data-insrc-line');
if(line)msg.line=Number(line);
var p=window.parent;
if(p&&p!==window)p.postMessage(msg,'*');
}catch(x){}},true);
window.insrcMarkCodeRefs=markCodeRefs;
markCodeRefs();
})();
`;
