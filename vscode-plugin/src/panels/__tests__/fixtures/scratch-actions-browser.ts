import { scratchBrowserDigest } from './scratch-browser-digest.js';
import { ScratchEditorPane } from '../../scratch-editor-webview.js';
import type { ScratchDraftProposal, ScratchEditorToHost, ScratchHostToEditor } from '../../scratch-editor-protocol.js';
import { editorViewCtx } from '@milkdown/kit/core';

const tick = () => new Promise<void>(resolve => setTimeout(resolve,10));
async function until(check:()=>boolean, label:string):Promise<void> {for(let i=0;!check()&&i<500;i++)await tick();if(!check())throw new Error(label);}
async function make(id:string, workerSuffix='', holdConfirmation=false) {
  const root=document.createElement('main');document.body.append(root);
  const frames:ScratchEditorToHost[]=[], events:string[]=[], source='# Base\n\nSelectable paragraph.\n';
  let version=1, canonical=source, applied=0, latest=0, locked=false;
  let lastLock: Extract<ScratchHostToEditor,{type:'lock-state'}>|undefined, cancelledLock: Extract<ScratchHostToEditor,{type:'lock-state'}>|undefined;
  let lockRequest: Extract<ScratchEditorToHost,{type:'lock'}>|undefined;
  const pane=new ScratchEditorPane(root,{paneSessionId:id,post:message=>{
    frames.push(message);events.push(message.type==='draft'?`draft:${message.draftSeq}:${message.apply}`:message.type);
    if(message.type==='draft')latest=Math.max(latest,message.draftSeq);
    if(message.type==='lock') {lockRequest=message;void finishLock();}
    if(message.type==='lock-cancel'){if(lockRequest?.requestId===message.requestId)lockRequest=undefined;cancelledLock={type:'lock-state',paneSessionId:id,requestId:message.requestId,locked,success:lastLock?.requestId===message.requestId&&lastLock.success===true,message:'Actual lock state synchronized.'};if(!holdConfirmation)void pane.receive(cancelledLock);}
    if(message.type==='send-selection')queueMicrotask(()=>{void pane.receive({type:'selection-result',paneSessionId:id,requestId:message.requestId,sent:true,message:'Selection inserted once.'});});
  }});
  async function finishLock():Promise<void>{const request=lockRequest;if(!request||applied<request.draftSeq)return;lockRequest=undefined;const success=latest===request.draftSeq;locked=success?request.locked:locked;events.push(`lock-committed:${success}`);lastLock={type:'lock-state',paneSessionId:id,requestId:request.requestId,locked,success,message:success?'':'Capture changed; lock refused.'};if(!holdConfirmation)await pane.receive(lastLock);}
  const script=document.head.querySelector('#scratch-validator-source')!, trusted=script.textContent!;
  if(workerSuffix)script.textContent=JSON.stringify((JSON.parse(trusted) as string)+workerSuffix);
  try{await pane.receive({type:'document-state',paneSessionId:id,version:1,digest:await scratchBrowserDigest(source),markdown:source,locked:false});}finally{script.textContent=trusted;}
  const authorizations=()=>frames.filter((message):message is ScratchDraftProposal=>message.type==='draft'&&message.apply===true);
  const edit=(text:string)=>pane['crepe']!.editor.action(ctx=>{const view=ctx.get(editorViewCtx);view.dispatch(view.state.tr.insertText(text,view.state.doc.content.size-1));});
  const key=(key:string)=>root.querySelector('.ProseMirror')!.dispatchEvent(new KeyboardEvent('keydown',{key,ctrlKey:true,bubbles:true,cancelable:true}));
  const ack=async(sequence:number)=>{const draft=authorizations().find(d=>d.draftSeq===sequence);if(!draft)throw new Error('Missing admitted generation');if(canonical!==draft.markdown)version++;canonical=draft.markdown;applied=sequence;events.push(`ack:${sequence}`);await pane.receive({type:'apply-ack',paneSessionId:id,draftSeq:sequence,editId:draft.editId,version,digest:await scratchBrowserDigest(canonical),markdown:canonical});await finishLock();};
  const select=()=>{const paragraph=root.querySelector('.ProseMirror p')!,range=document.createRange();range.selectNodeContents(paragraph);const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));return paragraph.textContent!;};
  return{pane,root,frames,events,edit,key,ack,select,authorizations,async releaseLock(original:boolean){const result=original?lastLock:cancelledLock;if(!result)throw new Error('No held lock reply');await pane.receive(result);},get locked(){return locked;},async dispose(){await pane.dispose();root.remove();}};
}
async function run():Promise<unknown>{
  const actions=[];
  for(const [action,key]of [['save','s'],['undo','z'],['redo','y']] as const){
    const h=await make(action);try{h.edit(' edit');const start=performance.now();h.key(key);await until(()=>h.authorizations().length===1,`${action} did not expedite`);const validationMs=performance.now()-start,before=h.frames.filter(m=>m.type===action).length;await h.ack(1);await until(()=>h.frames.some(m=>m.type===action),`${action} missing`);actions.push({action,validationMs,before,events:h.events,request:h.frames.find(m=>m.type===action),draft:h.authorizations()[0]?.markdown});}finally{await h.dispose();}
  }
  const send=await make('send');let sent;
  try{send.edit(' edit');const selected=send.select(),button=send.root.querySelector<HTMLButtonElement>('.scratch-selection-send')!;button.click();button.click();await until(()=>send.authorizations().length===1,'Send did not expedite');const before=send.frames.filter(m=>m.type==='send-selection').length;await send.ack(1);await until(()=>send.frames.some(m=>m.type==='send-selection'),'Send missing');sent={selected,before,messages:send.frames.filter(m=>m.type==='send-selection'),events:send.events};}finally{await send.dispose();}
  const lock=await make('lock');let locking;
  try{lock.edit(' edit');lock.root.querySelector<HTMLButtonElement>('nav button')!.click();const immediate={readonly:lock.pane['crepe']!.readonly,actualLocked:lock.locked};await until(()=>lock.authorizations().length===1,'Readonly lock barrier prevented validation');const before=lock.locked;await lock.ack(1);await until(()=>lock.pane['locked'],'Lock did not commit');locking={immediate,before,locked:lock.locked,events:lock.events,readonly:lock.pane['crepe']!.readonly};}finally{await lock.dispose();}
  const confirmationFaults=[];
  for(const original of [false,true]){
    const h=await make(original?'delayed_confirmation':'dropped_confirmation','',true);
    try{
      h.edit(' retained');h.root.querySelector<HTMLButtonElement>('nav button')!.click();
      const editable:string[]=[];const observer=new MutationObserver(()=>editable.push(h.root.querySelector('.ProseMirror')!.getAttribute('contenteditable')!));observer.observe(h.root.querySelector('.ProseMirror')!,{attributes:true,attributeFilter:['contenteditable']});
      await until(()=>h.authorizations().length===1,'Lock fault capture missing');await h.ack(1);assertLocked();
      function assertLocked(){if(!h.locked)throw new Error('Host did not commit lock before confirmation fault');}
      if(original)h.pane['cancelLock']('Delayed confirmation qualification');else await new Promise(resolve=>setTimeout(resolve,20_050));
      await tick();
      const uncertain={readonly:h.pane['crepe']!.readonly,displayedLocked:h.pane['locked'],transition:!!h.pane['lockTransition'],status:h.root.querySelector('[role=alert]')?.textContent,cancel:h.frames.some(m=>m.type==='lock-cancel')};
      await h.releaseLock(original);await tick();observer.disconnect();
      confirmationFaults.push({original,uncertain,editable,actualLocked:h.locked,displayedLocked:h.pane['locked'],readonly:h.pane['crepe']!.readonly,transition:!!h.pane['lockTransition']});
    }finally{await h.dispose();}
  }
  const newer=[];
  for(const action of ['save','send']as const){const h=await make(`newer_${action}`);try{h.edit(' first');let selected='';if(action==='save')h.key('s');else{selected=h.select();h.root.querySelector<HTMLButtonElement>('.scratch-selection-send')!.click();}await until(()=>h.authorizations().length===1,'Initial captured validation missing');h.edit(' newer');await tick();await h.ack(1);await until(()=>h.authorizations().some(d=>d.draftSeq===2),'Latest typing did not receive its own fresh check');await h.pane.receive({type:'receipt',paneSessionId:`newer_${action}`,draftSeq:2,editId:'edit_2'});const retained=h.root.querySelector<HTMLTextAreaElement>('.scratch-retained-selection')!;newer.push({action,selected,requests:h.frames.filter(m=>m.type==='save'||m.type==='send-selection'),markdown:h.pane['crepe']!.getMarkdown(),status:h.root.querySelector('[role=alert]')?.textContent,retained:retained.value,retainedVisible:!retained.hidden});}finally{await h.dispose();}}
  const native=await make('native');let nativeSave;
  try{native.edit(' native');const waiting=native.pane.receive({type:'flush-request',paneSessionId:'native',requestId:'native_flush'});await until(()=>native.authorizations().length===1,'Native flush missing');const before=native.frames.filter(m=>m.type==='flush-ready').length;await native.ack(1);await waiting;nativeSave={before,messages:native.frames.filter(m=>m.type==='flush-ready'),events:native.events};}finally{await native.dispose();}
  const failures=[];
  for(const kind of ['worker','dispose-validation','dispose-ack']as const){
    const suffix=kind==='worker'?`\n{const original=onmessage;onmessage=e=>{if(e.data?.type==='validate')throw new Error('qualification failure');return original(e);};}`:kind==='dispose-validation'?`\n{const original=onmessage;onmessage=e=>{if(e.data?.type==='validate'){const end=Date.now()+1000;while(Date.now()<end){}}return original(e);};}`:'';
    const h=await make(kind,suffix);try{h.edit(' retained');h.key('s');if(kind==='worker'){await until(()=>h.pane['failed'],'Worker failure was not visible');failures.push({kind,requests:h.frames.filter(m=>m.type==='save'),retained:h.frames.filter(m=>m.type==='draft').at(-1),markdown:h.pane['crepe']!.getMarkdown(),readonly:h.pane['crepe']!.readonly,status:h.root.querySelector('[role=alert]')?.textContent});}else{if(kind==='dispose-ack')await until(()=>h.authorizations().length===1,'No admitted draft before disposal');else await tick();await h.pane.dispose();await tick();failures.push({kind,requests:h.frames.filter(m=>m.type==='save'),retained:h.frames.filter(m=>m.type==='draft').at(-1),waiting:h.pane['flusher'].waiting});}}finally{await h.dispose();}
  }
  const closingLock=await make('dispose_lock');
  try{closingLock.edit(' retained');closingLock.root.querySelector<HTMLButtonElement>('nav button')!.click();await until(()=>closingLock.authorizations().length===1,'Lock disposal admission missing');await closingLock.pane.dispose();await closingLock.ack(1);failures.push({kind:'dispose-lock',requests:closingLock.frames.filter(m=>m.type==='save'),retained:closingLock.frames.filter(m=>m.type==='draft').at(-1),waiting:closingLock.pane['flusher'].waiting,actualLocked:closingLock.locked,cancelled:closingLock.frames.some(m=>m.type==='lock-cancel')});}finally{await closingLock.dispose();}
  return{actions,sent,locking,confirmationFaults,newer,nativeSave,failures};
}
void run().then(result=>{const pre=document.createElement('pre');pre.id='scratch-result';pre.textContent=JSON.stringify(result);document.body.append(pre);}).catch(error=>{const pre=document.createElement('pre');pre.id='scratch-error';pre.textContent=String(error)+'\n'+(error instanceof Error?error.stack:'');document.body.append(pre);});
