/** Execute the real static script. DOM setters never accept HTML; no persistent-state API exists. */
import { runInNewContext } from 'node:vm';
import { CONNECTION_MANAGER_SCRIPT } from '../../renderer.js';
import type { ConnectionPanel,ConnectionRenderView } from '../../types.js';

export class Element {
 children:Element[]=[];parent:Element|null=null;attrs:Record<string,string>={};listeners=new Map<string,((event:any)=>void)[]>();
 value='';type='';hidden=false;disabled=false;open=false;className='';htmlFor='';autocomplete='';spellcheck=false;id='';#text='';
 constructor(readonly tag:string,readonly dom:RendererHarness){}
 get textContent():string{return this.#text+this.children.map(c=>c.textContent).join('');}
 set textContent(text:string){this.#text=String(text);for(const c of this.children)c.parent=null;this.children=[];}
 contains(element:Element|null):boolean{return !!element&&this.dom.all(this).includes(element);}
 get firstChild():Element|null{return this.children[0]??null;}
 get isConnected():boolean{return this===this.dom.body||!!this.parent?.isConnected;}
 appendChild(child:Element):Element{child.parent?.removeChild(child);this.children.push(child);child.parent=this;return child;}
 removeChild(child:Element):Element{this.children=this.children.filter(c=>c!==child);child.parent=null;return child;}
 setAttribute(key:string,value:string):void{this.attrs[key]=String(value);}
 getAttribute(key:string):string|null{return this.attrs[key]??null;}
 addEventListener(type:string,fn:(event:any)=>void):void{this.listeners.set(type,[...this.listeners.get(type)??[],fn]);}
 fire(type:string,event:Record<string,unknown>={}):void{for(const fn of this.listeners.get(type)??[])fn({target:this,preventDefault:()=>{},...event});}
 focus():void{this.dom.activeElement=this;}
 showModal():void{this.open=true;}
 close():void{this.open=false;}
 querySelectorAll(selector:string):Element[]{return this.dom.all(this).filter(e=>e!==this&&selector.split(',').some(s=>{const m=/^(\w+)(?:\[type=([^\]]+)\])?$/.exec(s.trim());return !!m&&e.tag===m[1]&&(!m[2]||e.type===m[2]);}));}
 set innerHTML(_value:string){throw new Error('Connection renderer used innerHTML');}
 get innerHTML():never{throw new Error('Connection renderer read innerHTML');}
}
export class RendererHarness {
 body=new Element('body',this);activeElement:Element|null=null;elements=new Map<string,Element>();posted:unknown[]=[];hidden=false;errors:string[]=[];sinkCalls:string[]=[];
 #window=new Map<string,(e:{data:unknown})=>void>();#document=new Map<string,()=>void>();
 constructor(html:string,post:(message:unknown)=>void=()=>{}){
  for(const m of html.matchAll(/<([a-z]+)[^>]*\sid="([^"]+)"[^>]*>/g)){const e=new Element(m[1]!,this);e.id=m[2]!;this.elements.set(e.id,e);this.body.appendChild(e);}
  this.body.setAttribute('data-view',/data-view="([^"]+)"/.exec(html)![1]!);this.body.setAttribute('data-generation',/data-generation="(\d+)"/.exec(html)![1]!);
  const self=this;
  const document={body:this.body,getElementById:(id:string)=>this.elements.get(id),createElement:(tag:string)=>new Element(tag,this),createElementNS:(_ns:string,tag:string)=>new Element(tag,this),get activeElement(){return self.activeElement;},get hidden(){return self.hidden;},querySelectorAll:(s:string)=>this.body.querySelectorAll(s),addEventListener:(k:string,fn:()=>void)=>this.#document.set(k,fn)};
  const poison=(name:string)=>new Proxy(()=>{}, {get:()=>{this.sinkCalls.push(name);throw new Error('Forbidden renderer sink');},apply:()=>{this.sinkCalls.push(name);throw new Error('Forbidden renderer sink');}});
  runInNewContext(CONNECTION_MANAGER_SCRIPT,{document,window:{addEventListener:(k:string,fn:(event:{data:unknown})=>void)=>this.#window.set(k,fn),localStorage:poison('localStorage'),sessionStorage:poison('sessionStorage'),indexedDB:poison('indexedDB')},localStorage:poison('localStorage'),sessionStorage:poison('sessionStorage'),indexedDB:poison('indexedDB'),fetch:poison('fetch'),navigator:{sendBeacon:poison('telemetry')},console:poison('console'),acquireVsCodeApi:()=>({postMessage:(value:unknown)=>{const copied=structuredClone(value);this.posted.push(copied);post(copied);},getState:()=>{this.sinkCalls.push('getState');throw new Error('Persistent state read');},setState:()=>{this.sinkCalls.push('setState');throw new Error('Persistent state write');}})});
 }
 row(index:number):Element{return this.el('rows').children[index]!.children[0]!;}
 rowRemove(index:number):Element{return this.el('rows').children[index]!.children[1]!;}
 selectedRemove():Element{const row=this.all(this.el('rows')).find(e=>e.getAttribute('data-row')&&e.getAttribute('aria-pressed')==='true');if(!row)throw new Error('No selected connection row');return row.parent!.children[1]!;}
 all(root=this.body):Element[]{return[root,...root.children.flatMap(c=>this.all(c))];}
 el(id:string):Element{const e=this.elements.get(id);if(!e)throw new Error('Missing DOM control '+id);return e;}
 deliver(value:unknown):void{this.#window.get('message')?.({data:structuredClone(value)});}
 input(id:string,value:string):void{const e=this.el(id);e.focus();e.value=value;e.fire('input');}
 choose(id:string,value:string):void{const e=this.el(id);e.focus();e.value=value;e.fire('change');}
 click(id:string):void{const e=this.el(id);e.focus();e.fire('click');}
 hide():void{this.hidden=true;this.#document.get('visibilitychange')?.();}
}
export class FakeConnectionPanel implements ConnectionPanel {
 html='';dom:RendererHarness|null=null;posts:{type:string;view:ConnectionRenderView}[]=[];disposed=false;reveals=0;
 #listeners:((message:unknown)=>void)[]=[];#disposals:(()=>void)[]=[];#visibility:((visible:boolean)=>void)[]=[];
 setHtml(html:string):void{this.html=html;this.dom=new RendererHarness(html,message=>this.emit(message));}
 postMessage(value:unknown):void{this.posts.push(structuredClone(value) as {type:string;view:ConnectionRenderView});this.dom?.deliver(value);}
 onMessage(listener:(message:unknown)=>void):void{this.#listeners.push(listener);}
 onDidDispose(listener:()=>void):void{this.#disposals.push(listener);}
 onVisibility(listener:(visible:boolean)=>void):void{this.#visibility.push(listener);}
 emit(message:unknown):void{for(const listener of this.#listeners)listener(message);}
 visibility(visible:boolean):void{for(const listener of this.#visibility)listener(visible);}
 reveal():void{this.reveals++;}
 dispose():void{if(this.disposed)return;this.disposed=true;for(const listener of this.#disposals)listener();}
 get view():ConnectionRenderView{return this.posts.at(-1)!.view;}
}
