import { writeFile } from 'node:fs/promises';
/** Development-test instrumentation for this run's isolated Electron window. */
export async function focusNativeScratchEditor(port: number, _title: string, options: { action?: 'save' | 'undo' | 'redo'; expectedText?: string; insertText?: string } = {}): Promise<{ text: string; editable: string; status: string }> {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl?: string }[];
  const target = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!target?.webSocketDebuggerUrl) throw new Error('No isolated VS Code page target');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => { socket.addEventListener('open', () => resolve(), { once: true }); socket.addEventListener('error', () => reject(new Error('DevTools connection failed')), { once: true }); });
  let id = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  const contexts: { id: number; sessionId?: string }[] = [];
  socket.addEventListener('message', event => {
    const msg = JSON.parse(String(event.data));
    if (msg.method === 'Runtime.executionContextCreated') contexts.push({ id: msg.params.context.id, ...(msg.sessionId ? { sessionId: msg.sessionId } : {}) });
    if (msg.id) { const request = pending.get(msg.id); pending.delete(msg.id); if (msg.error) request?.reject(new Error(msg.error.message)); else request?.resolve(msg.result); }
  });
  const call = (method: string, params: unknown = {}, sessionId?: string): Promise<any> => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params, ...(sessionId ? { sessionId } : {}) })); });
  try {
    await call('Page.bringToFront');
    await call('Runtime.enable');
    const { targetInfos } = await call('Target.getTargets');
    for (const info of targetInfos) if (info.type === 'iframe') {
      const { sessionId } = await call('Target.attachToTarget', { targetId: info.targetId, flatten: true });
      await call('Runtime.enable', {}, sessionId);
    }
    let diagnostic: unknown = { contexts: contexts.length };
    for (let i = 0; i < 100; i++) {
      for (const context of [...contexts]) {
        const probe = `(() => { const el = document.querySelector('.scratch-pane .ProseMirror[contenteditable="true"]'); if (!el) return null; const block = el.querySelector('h1,h2,h3,p,li') ?? el; const r = block.getBoundingClientRect(); return { text: el.textContent, editable: el.getAttribute('contenteditable'), status: document.querySelector('.scratch-status')?.textContent ?? '', x: r.x, y: r.y, width: r.width, height: r.height, scale: window.devicePixelRatio }; })()`;
        const result = await call('Runtime.evaluate', { contextId: context.id, returnByValue: true, expression: probe }, context.sessionId).catch(() => undefined);
        const value = result?.result?.value;
        if (value) diagnostic = { value, context };
        if (!value || options.expectedText && !value.text.includes(options.expectedText)) continue;
        const point = { x: (value.x + Math.min(20, value.width / 2)) * value.scale, y: (value.y + Math.min(20, value.height / 2)) * value.scale, button: 'left', clickCount: 1 };
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point }, context.sessionId);
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point }, context.sessionId);
        await new Promise(r => setTimeout(r, 100));
        const focused = await call('Runtime.evaluate', { contextId: context.id, returnByValue: true, expression: `({ inside: !!document.querySelector('.scratch-pane .ProseMirror')?.contains(document.activeElement), hasFocus: document.hasFocus(), active: document.activeElement?.tagName, className: document.activeElement?.className })` }, context.sessionId);
        diagnostic = { value, context, point, focused: focused.result.value };
        if (focused.result.value?.inside && focused.result.value?.hasFocus) {
          if (options.action) {
            const key = options.action === 'save' ? 's' : options.action === 'redo' ? 'Z' : 'z';
            const code = options.action === 'save' ? 'KeyS' : 'KeyZ';
            const virtual = options.action === 'save' ? 83 : 90;
            const modifiers = options.action === 'redo' ? 10 : 2;
            await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual, modifiers }, context.sessionId);
            await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual, modifiers }, context.sessionId);
          }
          if (options.insertText !== undefined) await call('Input.insertText', { text: options.insertText }, context.sessionId);
          return { text: value.text, editable: value.editable, status: value.status };
        }
      }
      await new Promise(r => setTimeout(r, 50));
    }
    const evidence = process.env['INSRC_NATIVE_EVIDENCE'];
    if (evidence) { const shot = await call('Page.captureScreenshot', { format: 'png' }); await writeFile(`${evidence}.png`, Buffer.from(shot.data, 'base64')); }
    throw new Error(`Native view focus was not confirmed: ${JSON.stringify(diagnostic)}`);
  } finally { socket.close(); }
}

/** Real native renderer input for authoring tests. Expressions inspect/select
 * actual DOM; keyboard, mouse, paste and file-drop use Chromium input events. */
export async function nativeBrowserAction(port: number, selector: string, options: {
  expression?: string; click?: boolean; text?: string; keys?: { key: string; ctrl?: boolean; shift?: boolean }[]; dropFile?: string;
} = {}): Promise<any> {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json() as {type:string;webSocketDebuggerUrl?:string}[];
  const target = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl); if (!target?.webSocketDebuggerUrl) throw new Error('No native page');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve,reject) => { const timer = setTimeout(() => reject(new Error('Native debugger open timeout')),5000); socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Native debugger failed'));},{once:true}); });
  let id=0; const contexts:{id:number;sessionId?:string}[]=[], pending=new Map<number,{resolve:(x:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  socket.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.method==='Runtime.executionContextCreated')contexts.push({id:m.params.context.id,...(m.sessionId?{sessionId:m.sessionId}:{})});if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p){clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}}});
  const call=(method:string,params:unknown={},sessionId?:string):Promise<any>=>new Promise((resolve,reject)=>{const next=++id;const timer=setTimeout(()=>{pending.delete(next);reject(new Error(`Native ${method} timeout`));},5000);pending.set(next,{resolve,reject,timer});socket.send(JSON.stringify({id:next,method,params,...(sessionId?{sessionId}:{})}));});
  try {
    await call('Page.bringToFront');await call('Runtime.enable');
    const attached=new Set<string>();
    const attachFrames=async()=>{const{targetInfos}=await call('Target.getTargets');for(const info of targetInfos)if(info.type==='iframe'&&!attached.has(info.targetId)){try{const{sessionId}=await call('Target.attachToTarget',{targetId:info.targetId,flatten:true});await call('Runtime.enable',{},sessionId);attached.add(info.targetId);}catch{/* a disposed frame is not the requested UI */}}};
    for(let n=0;n<100;n++) {
      if(n%5===0)await attachFrames();
      for(const context of [...contexts]) {
        const found=await call('Runtime.evaluate',{contextId:context.id,returnByValue:true,expression:`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;if(${Boolean(options.click||options.dropFile)})el.scrollIntoView({block:'center',inline:'center'});const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`},context.sessionId).catch(()=>undefined);
        const rect=found?.result?.value;if(!rect || ((options.click||options.dropFile)&&(!rect.width||!rect.height)))continue;
        const evaluate=async(expression:string)=>{const r=await call('Runtime.evaluate',{contextId:context.id,returnByValue:true,expression:`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;${expression}})()`},context.sessionId);if(r.exceptionDetails)throw new Error(r.exceptionDetails.text+JSON.stringify(r.exceptionDetails.exception));return r.result?.value;};
        const point={x:rect.x+Math.min(20,rect.width/2),y:rect.y+Math.min(12,rect.height/2)};
        if(options.click){await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1},context.sessionId);await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1},context.sessionId);}
        let value=options.expression?await evaluate(options.expression):await evaluate('return {text:el.textContent,value:el.value,focused:document.activeElement===el};');
        for(const key of options.keys??[]) {
          const name=key.key, code=name===' '?'Space':name.length===1?`Key${name.toUpperCase()}`:name;
          const virtual=name==='Enter'?13:name==='Tab'?9:name==='Escape'?27:name===' '?32:name.toUpperCase().charCodeAt(0);
          const modifiers=(key.ctrl?2:0)+(key.shift?8:0);
          await call('Input.dispatchKeyEvent',{type:'keyDown',key:name,code,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual,modifiers},context.sessionId);
          await call('Input.dispatchKeyEvent',{type:'keyUp',key:name,code,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual,modifiers},context.sessionId);
        }
        if(options.text!==undefined)await call('Input.insertText',{text:options.text},context.sessionId);
        if(options.dropFile){const data={items:[],files:[options.dropFile],dragOperationsMask:1};for(const type of ['dragEnter','dragOver','drop'])await call('Input.dispatchDragEvent',{type,...point,data},context.sessionId);}
        return value;
      }
      await new Promise(r=>setTimeout(r,30));
    }
    throw new Error(`Native selector not found: ${selector}`);
  } finally {for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Native debugger closed'));}pending.clear();socket.close();}
}
