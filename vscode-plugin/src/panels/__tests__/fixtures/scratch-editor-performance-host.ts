/** Recorded-host probe: real native input, production validators, no delayed clocks. */
import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { cpus, availableParallelism, totalmem, freemem, loadavg, release } from 'node:os';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { registerScratchEditor } from '../../scratch-editor-native.js';
import { createScratchStore } from '../../../chat/scratch-store.js';
import { ScratchRecoveryStore } from '../../scratch-editor-recovery.js';
import { ScratchLockPreference } from '../../scratch-editor-lock.js';
import { SCRATCH_NOTE_BYTES, SCRATCH_MESSAGE_BYTES } from '../../scratch-editor-protocol.js';
import { nativeBrowserAction } from './scratch-native-cdp.js';
import { scratchIdleProbeAssets } from './scratch-idle-native-assets.js';

export function activate() {}
export async function run() {
  const root=process.env['INSRC_NATIVE_FIXTURE_ROOT']!,port=Number(process.env['INSRC_NATIVE_DEBUG_PORT']);
  const bytes=SCRATCH_NOTE_BYTES,count=20;
  const hardware={date:new Date().toISOString(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,availableParallelism:availableParallelism(),totalmem:totalmem(),freemem:freemem(),loadavg:loadavg(),os:process.platform,release:release(),vscode:vscode.version,electron:process.versions.electron,node:process.version,display:process.env['DISPLAY'],privateDisplay:process.env['INSRC_NATIVE_PRIVATE_DISPLAY']==='1'};
  // Observation-only fixed prefix in copied assets; no timer, result or production
  // bytes are replaced. The real worker still performs every fidelity check.
  const assets=await scratchIdleProbeAssets(process.env['INSRC_NATIVE_FIXTURE_EXTENSION']!,root,'idle');
  const editorPath=join(assets.extensionPath,'out','scratch-editor','editor.js'),editor=await readFile(editorPath,'utf8');
  const prefix=`{const state=globalThis.__scratchPerfWorker={active:0,events:[]};const Parent=globalThis.Worker;globalThis.Worker=class extends Parent{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.type==='result'){state.active--;state.events.push({kind:'result',at:performance.now(),requestId:event.data.requestId,allowed:event.data.allowed});}});}postMessage(message,...args){if(message?.type==='validate'){state.active++;state.events.push({kind:'start',at:performance.now(),requestId:message.requestId});}return super.postMessage(message,...args);}};}\n`;
  await writeFile(editorPath,prefix+editor);
  const probe={...assets.evidence,observedEditor:createHash('sha256').update(prefix+editor).digest('hex'),observationOnly:true};
  const warnings:string[]=[],store=createScratchStore({root:join(root,'scratches')}),recovery=new ScratchRecoveryStore(join(root,'recovery'));
  const host=registerScratchEditor({api:vscode,extensionPath:assets.extensionPath,store,recovery,preference:new ScratchLockPreference({get:<T>()=>false as T,update:async()=>{}}),warn:m=>warnings.push(m)});
  const header='# Performance\n\n',unit='Readable scratchpad text with words and spaces. ';
  const source=header+unit.repeat(Math.ceil(bytes/unit.length)).slice(0,bytes-header.length-2)+'Z\n';
  assert.equal(Buffer.byteLength(source),bytes);
  let result:Record<string,unknown>={passed:false,hardware,bytes,noteBound:SCRATCH_NOTE_BYTES,messageBound:SCRATCH_MESSAGE_BYTES,warnings,probe},doc:vscode.TextDocument|undefined;
  const selector='.scratch-pane .ProseMirror';
  const inspect=()=>nativeBrowserAction(port,selector,{timeoutMs:60000,expression:'return {samples:window.__scratchPerf.samples,worker:window.__scratchPerfWorker};'});
  const until=async(check:()=>Promise<boolean>,label:string)=>{const end=Date.now()+30000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,20));}throw new Error(label);};
  const persist=async()=>{result={...result,...await inspect()};await writeFile(join(root,'performance-progress.json'),JSON.stringify(result,null,2));};
  let sequence=0;
  const type=async(group:string)=>{sequence++;const value=sequence%2?'x':'y';await nativeBrowserAction(port,selector,{timeoutMs:60000,expression:`el.focus();window.__scratchPerf.group=${JSON.stringify(group)};const node=el.querySelector('p').firstChild;const range=document.createRange();range.setStart(node,0);range.setEnd(node,1);getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));return true;`,text:value});return sequence;};
  const waitAck=async(id:number)=>{await until(async()=>{const s=await inspect();return s.samples[id-1]?.ackMs!==null&&s.samples[id-1]?.renderMs!==null;},`Missing render/ack for sequence ${id}`);assert.equal(Buffer.byteLength(doc!.getText()),bytes);assert.equal(doc!.getText().slice(header.length,header.length+1),id%2?'x':'y');await persist();};
  try {
    const note=await store.createScratch('Performance reference',source),resolved=await store.resolveScratch(note.id),uri=vscode.Uri.file(resolved.filePath);
    const opening=performance.now();await host.openDocument(note.id);result['openMs']=performance.now()-opening;result['sourcePath']=resolved.filePath;
    doc=await vscode.workspace.openTextDocument(uri);assert.equal(doc.getText(),source);assert.equal(doc.isDirty,false);assert.equal(await readFile(resolved.filePath,'utf8'),source);
    await nativeBrowserAction(port,selector,{timeoutMs:60000,expression:`
      const state={samples:[],current:null,group:'ordinary'};window.__scratchPerf=state;
      document.addEventListener('beforeinput',event=>{if(!el.contains(event.target)||event.inputType!=='insertText')return;const sample={id:state.samples.length+1,group:state.group,started:performance.now(),renderMs:null,receiptMs:null,ackMs:null,trusted:event.isTrusted,requested:false,workerActiveAtInput:window.__scratchPerfWorker.active};state.current=sample;state.samples.push(sample);},true);
      document.addEventListener('keydown',event=>{if(event.ctrlKey&&event.key.toLowerCase()==='s'&&state.current)state.current.actionAt=performance.now();},true);
      new MutationObserver(()=>{const sample=state.current;if(sample&&!sample.requested){sample.requested=true;requestAnimationFrame(()=>{sample.renderMs=performance.now()-sample.started;});}}).observe(el,{characterData:true,childList:true,subtree:true});
      window.addEventListener('message',event=>{const m=event.data,sample=state.samples[m?.draftSeq-1];if(!sample)return;if(m.type==='receipt'&&sample.receiptMs===null)sample.receiptMs=performance.now()-sample.started;if(m.type==='apply-ack'){sample.ackMs=performance.now()-sample.started;if(sample.actionAt!==undefined)sample.actionAckMs=performance.now()-sample.actionAt;}});
      return true;`});
    for(let i=0;i<count;i++)await waitAck(await type('ordinary'));
    // Do not assert budgets until every scenario has been recorded, including
    // superseded edits. A missing/slow acknowledgement is never filtered out.
    for(const [group,edits,gap] of [['sustained',12,50],['burst',5,0]] as const){
      const before=(await inspect()).worker.events.length;
      for(let i=0;i<edits;i++){await type(group);if(gap)await new Promise(r=>setTimeout(r,gap));}
      const during=await inspect();assert.equal(during.worker.events.length,before,`${group}: no full validation during continuous typing`);
      await waitAck(sequence);
    }
    await type('resumed');await until(async()=>((await inspect()).worker.active)>0,'No actual running configured validator');
    await type('resumed');const resumed=await inspect();assert.ok(resumed.samples.at(-1).workerActiveAtInput>0,'Trusted input must occur during an actual running validator');await waitAck(sequence);
    await type('explicit-save');await nativeBrowserAction(port,selector,{keys:[{key:'s',ctrl:true}]});await waitAck(sequence);
    await until(async()=>!doc!.isDirty,'Explicit native Save did not save the acknowledged full-bound note');
    const captured=await inspect(),samples=captured.samples as any[];
    assert.equal(samples.length,count+12+5+2+1);assert.ok(samples.every(s=>s.trusted&&Number.isFinite(s.renderMs)&&Number.isFinite(s.receiptMs)));
    const ordinary=samples.filter(s=>s.group==='ordinary');const renders=ordinary.map(s=>s.renderMs).sort((a,b)=>a-b),acks=ordinary.map(s=>s.ackMs).sort((a,b)=>a-b);
    const medianRenderMs=(renders[9]!+renders[10]!)/2,p95AckMs=acks[18]!;
    const groups=['sustained','burst','resumed','explicit-save'].map(group=>{const rows=samples.filter(s=>s.group===group),latest=rows.at(-1)!;assert.ok(Number.isFinite(latest.ackMs));const superseded=rows.filter(s=>s!==latest&&s.ackMs===null).map(s=>s.id);return {group,latestSequence:latest.id,latestAckMs:latest.ackMs,actionAckMs:latest.actionAckMs,superseded,allSamples:rows};});
    const budgetMet=medianRenderMs<=150&&p95AckMs<=1000&&groups.filter(g=>g.group!=='explicit-save').every(g=>g.latestAckMs<=1000);
    result={...result,...captured,passed:budgetMet,budgetMet,groups,medianRenderMs,p95AckMs,targets:{medianRenderMs:150,p95AckMs:1000},noteSizeRetained:true,noInitializationWrite:true,method:'Trusted native beforeinput to first ProseMirror DOM mutation requestAnimationFrame; same renderer clock to exact host apply-ack. Ordinary and latest-burst clocks include 300ms gap. All superseded edits retained with null acknowledgements; explicit action clock starts at trusted Save keydown.'};
    await writeFile(join(root,'performance.json'),JSON.stringify(result,null,2));assert.ok(budgetMet,`Performance budget failed: median render ${medianRenderMs.toFixed(1)}ms; p95 ack ${p95AckMs.toFixed(1)}ms`);
  } catch(error) {try{await persist();}catch{/* Preserve original failure if renderer is unavailable. */}result={...result,error:String(error),stack:error instanceof Error?error.stack:undefined};await writeFile(join(root,'performance.json'),JSON.stringify(result,null,2));throw error;}
  finally {await host.dispose();if(doc?.isDirty){await vscode.window.showTextDocument(doc,{preview:false});await vscode.commands.executeCommand('workbench.action.files.revert');}}
}
