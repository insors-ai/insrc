/** Fixed test-only observations/parking around actual packaged code. Never
 * included in release entry points or built from document-controlled text. */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export async function scratchIdleProbeAssets(extension: string, root: string, phase: 'idle'|'validation'|'result') {
  const destination=join(root,'probe-assets',phase),out=join(destination,'out');
  await mkdir(out,{recursive:true});
  await cp(join(extension,'out','scratch-editor'),join(out,'scratch-editor'),{recursive:true});
  await cp(join(extension,'out','scratch-validation-host-worker.js'),join(out,'scratch-validation-host-worker.js'));
  const editorPath=join(out,'scratch-editor','editor.js'),workerPath=join(out,'scratch-editor','validator.js');
  const editor=await readFile(editorPath,'utf8'),worker=await readFile(workerPath,'utf8');
  const prefix=`{const probe=globalThis.__scratchIdleProbe={lastInputAt:0,trustedInputs:0,allTrusted:true,validates:0,held:null};document.addEventListener('beforeinput',event=>{if(event.inputType==='insertText'&&event.target?.closest?.('.scratch-pane')){probe.lastInputAt=Date.now();probe.trustedInputs++;probe.allTrusted=probe.allTrusted&&event.isTrusted;}},true);const NativeWorker=globalThis.Worker;globalThis.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.type==='insrc-qualification')probe.held=event.data;});}postMessage(message,...args){if(message?.type==='validate')probe.validates++;return super.postMessage(message,...args);}};}\n`;
  let suffix='';
  if(phase==='validation')suffix=`\n{const original=globalThis.onmessage;globalThis.onmessage=event=>{const result=original(event);if(event.data?.type==='validate'){postMessage({type:'insrc-qualification',phase:'validation',requestId:event.data.requestId});const end=Date.now()+30000;while(Date.now()<end){}}return result;};}`;
  if(phase==='result')suffix=`\n{const send=globalThis.postMessage.bind(globalThis);globalThis.postMessage=(message,...args)=>{if(message?.type==='result'){send({type:'insrc-qualification',phase:'result',requestId:message.requestId,allowed:message.allowed});const end=Date.now()+30000;while(Date.now()<end){}}else return send(message,...args);};}`;
  await writeFile(editorPath,prefix+editor);await writeFile(workerPath,worker+suffix);
  const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
  return{extensionPath:destination,evidence:{phase,baseEditor:hash(editor),baseWorker:hash(worker),instrumentedEditor:hash(prefix+editor),instrumentedWorker:hash(worker+suffix),instrumentation:phase==='idle'?'Observes native input and worker transfer only; original timer and worker bytes unchanged.':'Parks a real configured validation job at the named boundary after posting a test-only observed marker; never fabricates an admission result.'}};
}
