import { writeFile } from 'node:fs/promises';
/** Development-test instrumentation for this run's isolated Electron window. */
export async function focusNativeScratchEditor(port: number, _title: string, options: { action?: 'save' | 'undo' | 'redo'; expectedText?: string } = {}): Promise<{ text: string; editable: string }> {
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
        const probe = `(() => { const el = document.querySelector('.scratch-pane .ProseMirror[contenteditable="true"]'); if (!el) return null; const block = el.querySelector('h1,h2,h3,p,li') ?? el; const r = block.getBoundingClientRect(); return { text: el.textContent, editable: el.getAttribute('contenteditable'), x: r.x, y: r.y, width: r.width, height: r.height, scale: window.devicePixelRatio }; })()`;
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
          return { text: value.text, editable: value.editable };
        }
      }
      await new Promise(r => setTimeout(r, 50));
    }
    const evidence = process.env['INSRC_NATIVE_EVIDENCE'];
    if (evidence) { const shot = await call('Page.captureScreenshot', { format: 'png' }); await writeFile(`${evidence}.png`, Buffer.from(shot.data, 'base64')); }
    throw new Error(`Native view focus was not confirmed: ${JSON.stringify(diagnostic)}`);
  } finally { socket.close(); }
}
