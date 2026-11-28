import { editorViewCtx } from '@milkdown/kit/core';
import type { ScratchDraftProposal, ScratchEditorToHost } from '../../scratch-editor-protocol.js';
import { ScratchEditorPane } from '../../scratch-editor-webview.js';
import { createScratchCrepe } from '../../scratch-editor-webview.js';
import { scratchMilkdownCodec } from '../../scratch-markdown-milkdown.js';
import { scratchIntentDigest } from '../../scratch-markdown-codec.js';
import { ScratchValidationClient, createScratchBrowserValidator } from '../../scratch-validation-client.js';
import { checkScratchMarkdownEdit } from '../../scratch-markdown.js';
import { supportedScratchMarkdown, unsupportedScratchMarkdown } from './scratch-markdown-corpus.js';
const workerErrors:string[]=[];const NativeWorker=Worker;
globalThis.Worker=class extends NativeWorker{constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.addEventListener('error',e=>workerErrors.push(e.message));}};
const digest=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
async function run(){
  const violations:string[]=[];document.addEventListener('securitypolicyviolation',e=>violations.push(e.violatedDirective));
  const root=document.createElement('div');document.body.append(root);const editor=createScratchCrepe({root});await editor.create();
  const codec=editor.editor.action(scratchMilkdownCodec),production=createScratchBrowserValidator(JSON.parse(document.getElementById('scratch-validator-source')!.textContent!));
  const url=URL.createObjectURL(new Blob([JSON.parse(document.getElementById('candidate-probe-source')!.textContent!)],{type:'text/javascript'}));
  const worker=new Worker(url);let counts:[string,number][]=[];
  const probe=new ScratchValidationClient({post:value=>worker.postMessage(value),listen:(message,error)=>{worker.onmessage=e=>{if(e.data?.type==='candidate-probe')counts=e.data.counts;message(e.data);};worker.onerror=error;worker.onmessageerror=error;return()=>{worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;};},terminate:()=>{worker.terminate();URL.revokeObjectURL(url);}});
  const rows=[];let stage='start';
  try{
    for(const [name,client] of [['production',production],['instrumented',probe]] as const){
      stage=name+':first';const source='# Base\n',draft='# Candidate\n',next='# Latest\n';
      const id=async(text:string,seq:number,version:number)=>({paneSessionId:'browser-proof',draftSeq:seq,editId:`edit_${seq}`,baseVersion:version,baseDigest:await digest(text)});
      const firstId=await id(source,1,1),first=await client.run({source,draft,baseKey:`1:${firstId.baseDigest}`,identity:firstId,expectedIntent:await scratchIntentDigest(codec.parse(draft),codec.parse(draft).type.schema)});
      if(!first.allowed||!first.ticket||!client.acceptCandidate(first.ticket)||!client.confirmCandidate(first.ticket,{...firstId,version:2,digest:await digest(draft),markdown:draft}))throw new Error('Initial candidate proof/confirmation failed');
      stage=name+':warm';const secondId=await id(draft,2,2),second=await client.run({source:draft,draft:next,baseKey:`2:${secondId.baseDigest}`,identity:secondId,expectedIntent:await scratchIntentDigest(codec.parse(next),codec.parse(next).type.schema)});
      const warmCounts=counts;
      if(!second.allowed||!second.ticket||!client.acceptCandidate(second.ticket))throw new Error('Next candidate failed');
      const wrongDigest=client.confirmCandidate(second.ticket,{...secondId,version:3,digest:'f'.repeat(64),markdown:next});
      stage=name+':cold';const coldId=await id(next,3,3),cold=await client.run({source:next,draft:'# Cold\n',baseKey:`3:${coldId.baseDigest}`,identity:coldId,expectedIntent:await scratchIntentDigest(codec.parse('# Cold\n'),codec.parse('# Cold\n').type.schema)});
      const coldCounts=counts;
      stage=name+':wrongIntent';const wrongIntent=await client.run({source:next,draft:'# Cold\n',baseKey:`3:${coldId.baseDigest}`,identity:coldId,expectedIntent:'0'.repeat(64)});
      rows.push({name,allowed:first.allowed&&second.allowed&&cold.allowed,wrongDigest,wrongIntent:wrongIntent.allowed,warmSourceParses:name==='instrumented'?(warmCounts.find(([text])=>text===draft)?.[1]??0):null,warmDraftParses:name==='instrumented'?(warmCounts.find(([text])=>text===next)?.[1]??0):null,coldSourceParses:name==='instrumented'?(coldCounts.find(([text])=>text===next)?.[1]??0):null});
    }
    const corpus=[];let seq=10;
    for(const source of [...supportedScratchMarkdown,...unsupportedScratchMarkdown]){
      stage='corpus:'+seq;const parsed=codec.parse(source+'\nAdditional text.\n'),draft=codec.serialize(parsed),baseDigest=await digest(source),expected=checkScratchMarkdownEdit(source,draft,codec,parsed);
      const result=await production.run({source,draft,baseKey:`10:${baseDigest}`,identity:{paneSessionId:'browser-proof',draftSeq:seq,editId:`edit_${seq++}`,baseVersion:10,baseDigest},expectedIntent:await scratchIntentDigest(parsed,parsed.type.schema)});
      corpus.push({expected:expected.allowed,allowed:result.allowed,ticket:!!result.ticket});
    }
    stage='pane message ordering';
    const paneRoot=document.createElement('main');document.body.append(paneRoot);const sent:ScratchEditorToHost[]=[];
    const pane=new ScratchEditorPane(paneRoot,{paneSessionId:'pane-proof',post:message=>sent.push(message)});
    const until=async(check:()=>boolean)=>{for(let i=0;i<1500;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw new Error('Pane proof checkpoint: '+paneRoot.textContent);};
    const auth=(seq:number)=>sent.find((m):m is ScratchDraftProposal=>m.type==='draft'&&m.apply===true&&m.draftSeq===seq);
    const edit=(text:string)=>pane['crepe']!.editor.action(ctx=>{const view=ctx.get(editorViewCtx);view.dispatch(view.state.tr.insertText(text,2));});
    let paneChecks;
    try{
      const original='# Original\n';await pane.receive({type:'document-state',paneSessionId:'pane-proof',version:1,digest:await digest(original),markdown:original,locked:false});
      edit('first');await until(()=>!!auth(1));const first=auth(1)!,firstDigest=await digest(first.markdown),ack1={type:'apply-ack',paneSessionId:'pane-proof',draftSeq:1,editId:'edit_1',version:2,digest:firstDigest,markdown:first.markdown};
      await pane.receive({type:'document-state',paneSessionId:'pane-proof',version:2,digest:firstDigest,markdown:first.markdown,locked:false});if(pane['state']!.snapshot.version!==1||pane['state']!.conflicted)throw new Error('Matching change event was not provisional');
      await pane.receive(ack1);if(pane['state']!.snapshot.version!==2||pane['state']!.hasPending)throw new Error('Exact own ack not accepted');
      edit('second');await until(()=>!!auth(2));const held=pane['candidateProof'];if(!held)throw new Error('No second handoff');
      await pane.receive(ack1);if(pane['candidateProof']!==held)throw new Error('Duplicate old ack consumed current proof');
      await pane.receive({type:'admission-superseded',paneSessionId:'pane-proof',draftSeq:1,editId:'edit_1',baseVersion:2,baseDigest:firstDigest});if(pane['candidateProof']!==held)throw new Error('Ignored cancellation consumed current proof');
      const second=auth(2)!,secondDigest=await digest(second.markdown);await pane.receive({type:'document-state',paneSessionId:'pane-proof',version:3,digest:secondDigest,markdown:second.markdown,locked:false});
      edit('newer');const visible=pane['state']!.markdown;if(pane['candidateProof']!==held)throw new Error('New typing revoked accepted handoff');
      await pane.receive({type:'apply-ack',paneSessionId:'pane-proof',draftSeq:2,editId:'edit_2',version:3,digest:secondDigest,markdown:second.markdown});
      if(pane['state']!.conflicted||pane['state']!.markdown!==visible||!pane['state']!.hasPending||pane['state']!.snapshot.version!==3)throw new Error('Accepted old ack replaced or authorized newer text');
      paneChecks={provisional:true,ignoredDuplicate:true,ignoredCancellation:true,newerTextRetained:true,baseConfirmed:true};
    }finally{pane.dispose();}
    return{rows,corpus,violations,paneChecks};
  }catch(error){throw new Error(stage+': '+String(error)+' workers:'+JSON.stringify(workerErrors));}finally{production.dispose();probe.dispose();await editor.destroy();}
}
void run().then(result=>{const pre=document.createElement('pre');pre.id='scratch-result';pre.textContent=JSON.stringify(result);document.body.append(pre);},error=>{const pre=document.createElement('pre');pre.id='scratch-error';pre.textContent=String(error);document.body.append(pre);});
