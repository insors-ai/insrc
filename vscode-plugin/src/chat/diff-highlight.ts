/**
 * Epic 00d80121c593053c Story S001 — syntax highlighting for the chat's diff widget: the page-side
 * pieces that do not touch the DOM.
 *
 * One source string, inlined by render-registry.ts into the chat page, holding two pure functions:
 *
 * - diffLang(path): the highlight.js language for a changed file, by its extension (matched without
 *   regard to case) or, for a few well-known names, by the file name; undefined for anything else.
 * - hljsRuns(html): turns the markup highlight.js returns into per-line runs of `{ text, cls }`. It
 *   reads only what highlight.js emits (a span with a class, a span close, the five entities and text)
 *   and returns undefined at anything else, so nothing but text is ever built from it. Nested spans
 *   flatten with the innermost class winning, a span that crosses a newline continues on the next line,
 *   a multi-class span such as `hljs-title function_` uses its first hljs class, and a span with no
 *   hljs class takes the class of the span around it.
 *
 * Reusable: nothing here knows about the diff widget, so a later Story can point fenced code blocks at
 * it. Written for the page (ES5 style, no template literals) and carrying no backtick.
 */
export const DIFF_HIGHLIGHT_SOURCE = String.raw`
var DIFF_EXT_LANG={ts:'typescript',tsx:'typescript',mts:'typescript',cts:'typescript',js:'javascript',jsx:'javascript',mjs:'javascript',cjs:'javascript',json:'json',jsonc:'json',py:'python',go:'go',java:'java',scala:'scala',sc:'scala',sh:'bash',bash:'bash',zsh:'bash',yml:'yaml',yaml:'yaml',css:'css',html:'xml',htm:'xml',xml:'xml',svg:'xml',md:'markdown',markdown:'markdown'};
var DIFF_NAME_LANG={dockerfile:'dockerfile',makefile:'makefile',gnumakefile:'makefile'};
function diffLang(path){
var p=String(path||'');var base=p.slice(p.lastIndexOf('/')+1).toLowerCase();
if(Object.prototype.hasOwnProperty.call(DIFF_NAME_LANG,base))return DIFF_NAME_LANG[base];
if(base.indexOf('dockerfile.')===0)return 'dockerfile';
var dot=base.lastIndexOf('.');if(dot<0)return undefined;
var ext=base.slice(dot+1);
return Object.prototype.hasOwnProperty.call(DIFF_EXT_LANG,ext)?DIFF_EXT_LANG[ext]:undefined;}
var HLJS_ENT={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#x27;':"'"};
function hljsRuns(html){
var lines=[[]];var stack=[];var re=/<span class="([^"<>&]*)">|<\/span>|&(?:amp|lt|gt|quot|#x27);|[^<&\n]+|\n|[<&]/g;
var m;
function cur(){return stack.length?stack[stack.length-1]:undefined;}
function add(text){var line=lines[lines.length-1];var c=cur();var last=line[line.length-1];
if(last&&last.cls===c)last.text+=text;else line.push(c===undefined?{text:text}:{text:text,cls:c});}
while((m=re.exec(html))!==null){
var t=m[0];
if(m[1]!==undefined){var cls=undefined;var parts=m[1].split(' ');
for(var i=0;i<parts.length;i++){if(parts[i].indexOf('hljs-')===0){cls=parts[i];break;}}
stack.push(cls!==undefined?cls:cur());continue;}
if(t==='</span>'){if(!stack.length)return undefined;stack.pop();continue;}
if(t==='\n'){lines.push([]);continue;}
if(t.charAt(0)==='&'){if(!Object.prototype.hasOwnProperty.call(HLJS_ENT,t))return undefined;add(HLJS_ENT[t]);continue;}
if(t==='<')return undefined;
add(t);}
if(stack.length)return undefined;
return lines;}
`;
