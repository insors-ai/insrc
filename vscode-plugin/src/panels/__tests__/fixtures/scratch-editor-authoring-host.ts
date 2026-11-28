/** Isolated native authoring qualification, using production host/renderer UI. */
import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { writeFile, readFile, mkdir, readdir, chmod } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { basename, join } from 'node:path';
import { createScratchStore } from '../../../chat/scratch-store.js';
import { createScratchHost } from '../../../chat/scratch-host.js';
import { createScratchChatTarget } from '../../../chat/scratch-chat-target.js';
import { createChatPanelHost, type ChatPanelChannel } from '../../../chat/chat-panel.js';
import { createInMemoryChatSessionStore } from '../../../chat/session-store.js';
import { createScratchPanels } from '../../scratch-panels.js';
import { createScratchRefresh } from '../../scratch-refresh.js';
import { registerScratchEditor, SCRATCH_EDITOR_VIEW_TYPE } from '../../scratch-editor-native.js';
import { ScratchRecoveryStore } from '../../scratch-editor-recovery.js';
import { ScratchLockPreference } from '../../scratch-editor-lock.js';
import { scratchDigest } from '../../scratch-editor-provider.js';
import { nativeBrowserAction } from './scratch-native-cdp.js';
import type { ScratchHostToEditor } from '../../scratch-editor-protocol.js';
import type { HostToWebview } from '../../../chat/protocol.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
const tick = () => new Promise<void>(r => setTimeout(r, 30));
async function until(check: () => boolean | Promise<boolean>, label: string) { for(let i=0;i<600;i++){if(await check())return;await tick();}throw new Error(label); }
export function activate() {}
export async function run() {
  const root=process.env['INSRC_NATIVE_FIXTURE_ROOT']!, port=Number(process.env['INSRC_NATIVE_DEBUG_PORT']), workspace=join(root,'workspace');
  const warnings:string[]=[], checks:Record<string,unknown>={}, frames:ScratchHostToEditor[]=[], incoming:any[]=[], chatIncoming:any[]=[], browseIncoming:any[]=[], chatPosts:any[]=[];
  const documents=new Map<string,{panel:vscode.WebviewPanel;session:string;uri:string}>();
  let stored:boolean|undefined, holdChatReady=false, submitted=0, chatCreates=0, browseCreates=0, completed=false;
  let chatPanel:vscode.WebviewPanel|undefined, browsePanel:vscode.WebviewPanel|undefined, chatTarget:ReturnType<typeof createScratchChatTarget>|undefined;
  let clipboard:ChildProcess|undefined;
  const store=createScratchStore({root:join(root,'scratches')}), recovery=new ScratchRecoveryStore(join(root,'recovery'));
  const windowApi=new Proxy(vscode.window,{get(target,key){if(key!=='registerCustomEditorProvider')return Reflect.get(target,key,target);return(viewType:string,provider:vscode.CustomTextEditorProvider,options:unknown)=>target.registerCustomEditorProvider(viewType,{resolveCustomTextEditor:async(doc,panel,token)=>{
    const webview=new Proxy(panel.webview,{get(target,key){if(key==='postMessage')return async(m:ScratchHostToEditor)=>{frames.push(m);return await target.postMessage(m);};if(key==='onDidReceiveMessage')return(fn:(m:unknown)=>unknown)=>target.onDidReceiveMessage(m=>{incoming.push(m);return fn(m);});const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;},set(target,key,value){return Reflect.set(target,key,value,target);}});
    const wrapped=new Proxy(panel,{get(target,key){if(key==='webview')return webview;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
    await provider.resolveCustomTextEditor(doc,wrapped,token);const session=panel.webview.html.match(/data-pane-session="([^"]+)"/)![1]!;documents.set(session,{panel,session,uri:doc.uri.toString()});panel.onDidDispose(()=>documents.delete(session));
  }},options as Parameters<typeof target.registerCustomEditorProvider>[2]);}});
  let applyHold:{hit:boolean;promise:Promise<void>;resolve:()=>void}|undefined;
  const workspaceApi=new Proxy(vscode.workspace,{get(target,key){if(key==='applyEdit')return async(...args:Parameters<typeof target.applyEdit>)=>{const held=applyHold;if(held){held.hit=true;await held.promise;}return await target.applyEdit(...args);};return Reflect.get(target,key,target);}});
  const api=new Proxy(vscode,{get(target,key){return key==='window'?windowApi:key==='workspace'?workspaceApi:Reflect.get(target,key,target);}});
  const native=registerScratchEditor({api,store,recovery,extensionPath:process.env['INSRC_NATIVE_FIXTURE_EXTENSION']!,preference:new ScratchLockPreference({get:<T>()=>stored as T|undefined,update:async(_key,value)=>{stored=value as boolean;}}),warn:m=>warnings.push(m),sendSelection:(text,assertCurrent)=>scratchHost.sendSelectionToChat(text,assertCurrent),refresh:()=>refresh.request()});
  const panels=createScratchPanels({store,editor:native,panels:({viewType,title})=>{
    browsePanel=vscode.window.createWebviewPanel(viewType,title,vscode.ViewColumn.Active,{enableScripts:true,retainContextWhenHidden:true});browseCreates++;const panel=browsePanel;
    return{setHtml:html=>{panel.webview.html=html;},reveal:preserve=>panel.reveal(undefined,preserve),onDidDispose:fn=>{panel.onDidDispose(fn);},onMessage:fn=>{panel.webview.onDidReceiveMessage(m=>{browseIncoming.push(m);fn(m);});},postMessage:m=>panel.webview.postMessage(m),dispose:()=>panel.dispose()};
  },logger:{warn:m=>warnings.push(m)}});
  const chatHost=createChatPanelHost({providers:{available:['claude'],get:()=>({async *run(){submitted++;throw new Error('Selection must never submit');},cancel:()=>{},decide:()=>{},capabilities:{resume:true}})},store:createInMemoryChatSessionStore(),cwd:()=>workspace,scratchpads:{enabled:true},deriveTitle:async()=>undefined,createPanel:({viewType,title}):ChatPanelChannel=>{
    chatPanel=vscode.window.createWebviewPanel(viewType,title,vscode.ViewColumn.Beside,{enableScripts:true,retainContextWhenHidden:true});chatCreates++;const panel=chatPanel;
    const target=createScratchChatTarget(m=>panel.webview.postMessage({v:1,payload:m}));chatTarget=target;
    panel.onDidDispose(()=>{target.dispose();if(chatPanel===panel)chatPanel=undefined;});
    panel.webview.onDidReceiveMessage((m:any)=>{chatIncoming.push(m);if(m?.payload?.type==='ready'&&!holdChatReady)target.markReady();if(m?.payload)scratchHost.onMessage(m.payload);});
    return{setHtml:html=>{panel.webview.html=html;},postMessage:m=>{chatPosts.push(m);void panel.webview.postMessage(m);},onMessage:fn=>{panel.webview.onDidReceiveMessage(fn);},onDidDispose:fn=>{panel.onDidDispose(fn);},reveal:opts=>panel.reveal(undefined,opts?.preserveFocus),dispose:()=>panel.dispose()};
  }});
  const scratchHost=createScratchHost({store,panels,chat:{open:()=>chatHost.open(),capture:()=>{assert.ok(chatTarget);return chatTarget;},ready:()=>chatTarget!.ready(),disposed:()=>!chatPanel,post:(m:HostToWebview)=>{chatPosts.push({v:1,payload:m});void chatPanel?.webview.postMessage({v:1,payload:m});}},promptTitle:async()=>undefined,refresh:()=>refresh.request(),logger:{warn:m=>warnings.push(m)}});
  const refresh=createScratchRefresh({browse:()=>panels.refreshBrowse(),menu:()=>scratchHost.refreshList(),warn:m=>warnings.push(m)});
  const saved=vscode.workspace.onDidSaveTextDocument(doc=>{void native.accepts(doc.uri).then(ok=>ok?refresh.request():undefined);});
  const open=async(id:string)=>{await native.openDocument(id);const session=[...documents.values()].find(p=>p.panel.active)?.session;assert.ok(session);return `main[data-pane-session="${session}"]`;};
  const act=(css:string,options:Parameters<typeof nativeBrowserAction>[2]={})=>nativeBrowserAction(port,css,options);
  const clipboardData=async(type:string,bytes:Buffer)=>{clipboard?.kill();clipboard=spawn(process.env['INSRC_XCLIP_BIN']!,['-quiet','-selection','clipboard','-t',type],{stdio:['pipe','ignore','pipe']});let failure='';clipboard.stderr?.on('data',b=>{failure+=String(b);});clipboard.stdin!.end(bytes);await new Promise(r=>setTimeout(r,100));assert.equal(clipboard.exitCode,null,failure);};
  const pick=async(pane:string,label:string,path:string)=>{
    await act(`${pane} [aria-label="${label}"]`,{click:true});
    const input='.quick-input-widget .quick-input-box input';
    await act(input,{click:true,keys:[{key:'a',ctrl:true}],text:path});
    await act(input,{keys:[{key:'Enter'}]});
    await new Promise(r=>setTimeout(r,150));
    const prompt=await act('.monaco-workbench',{expression:"const w=document.querySelector('.quick-input-widget');return w&&w.getBoundingClientRect().height>0?{text:w.innerText,value:w.querySelector('input')?.value}:null;"});
    if(prompt){const prompts=(checks['pickerPrompts']??=[]) as unknown[];prompts.push(prompt);await act(input,{keys:[{key:'Enter'}]});}
  };
  const select=async(pane:string)=>{return await act(`${pane} .ProseMirror`,{expression:"if(el.getAttribute('contenteditable')==='true')el.focus();const p=el.querySelector('p');if(!p)throw new Error('No paragraph');const range=document.createRange();range.selectNodeContents(p);getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'));return {text:p.textContent,editable:el.getAttribute('contenteditable')};"});};
  const sendClick=async(pane:string)=>{await act(`${pane} .scratch-selection-send`,{click:true});};
  const evidence=async(passed:boolean,extra={})=>{completed=passed;await writeFile(join(root,'authoring.json'),JSON.stringify({passed,vscode:vscode.version,platform:process.platform,privateDisplay:process.env['INSRC_NATIVE_PRIVATE_DISPLAY']==='1',checks,warnings,submitted,chatCreates,browseCreates,retainedRoot:root,...extra},null,2));};
  try {
    await mkdir(workspace,{recursive:true});const pickedImage=join(workspace,'picked.png'),pickedLink=join(workspace,'link target.md');await writeFile(pickedImage,png);await writeFile(pickedLink,'# Workspace target\n');
    const note=await store.createScratch('Native authoring','# Authoring\n\nSelected **bold** text 😀.\n'),resolved=await store.resolveScratch(note.id),uri=vscode.Uri.file(resolved.filePath);
    let pane=await open(note.id);const original=await readFile(resolved.filePath,'utf8');
    const selected=await select(pane);assert.equal(selected.editable,'false');assert.equal(chatCreates,0);assert.equal(submitted,0);assert.equal(await readFile(resolved.filePath,'utf8'),original);
    await sendClick(pane);await until(()=>!!chatPanel,'Send opened actual chat');await until(()=>chatIncoming.some(m=>m?.payload?.type==='ready'),'Actual chat ready');
    await until(async()=>{const r=await act('#insrc-input');return r.value===selected.text;},'Closed-chat Send inserted exact composer text');assert.equal(submitted,0);checks['lockedClosedChatSend']={exactText:selected.text,noSubmit:true,noSelectionWrite:true};
    documents.get(pane.match(/data-pane-session="([^"]+)"/)![1]!)!.panel.reveal();
    await act(`${pane} [aria-label="Edit scratchpad"]`,{click:true});await until(()=>stored===false,'Editable preference persisted');
    const sibling=await store.createScratch('Remembered editing','# Sibling\n');const siblingPane=await open(sibling.id);assert.equal((await act(`${siblingPane} .ProseMirror`,{expression:"return el.getAttribute('contenteditable');"})),'true');checks['rememberedMode']=true;
    pane=await open(note.id);await act('#insrc-input',{expression:"el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));return true;"});
    const editableSelection=await select(pane);assert.equal(editableSelection.editable,'true');
    await act(`${pane} .ProseMirror`,{keys:[{key:'Tab'},{key:'Enter'}]});
    await until(async()=> (await act('#insrc-input')).value===editableSelection.text,'Keyboard Send inserted into ready composer');assert.equal(submitted,0);checks['editableKeyboardSend']={exactText:editableSelection.text,noSubmit:true};
    chatPanel!.dispose();await until(()=>!chatPanel,'Chat disposed');holdChatReady=true;
    pane=await open(note.id);await select(pane);await sendClick(pane);await until(()=>!!chatPanel,'Delayed-ready chat opened');chatPanel!.dispose();await until(()=>!chatPanel,'Delayed chat disposed');
    await until(()=>frames.some(m=>m.type==='selection-result'&&!m.sent),'Disposed chat reports failed Send');const retained=await act(`${pane} .scratch-retained-selection`,{expression:'return {value:el.value,hidden:el.hidden};'});assert.equal(retained.value,editableSelection.text);assert.equal(retained.hidden,false);assert.equal(submitted,0);checks['disposedChatSendRetainsCapture']=true;holdChatReady=false;
    // Real OS clipboard paste and Chromium file-drop in the native webview.
    await act(pane,{expression:"window.__scratchNativeEvents=[];for(const type of ['paste','drop'])document.addEventListener(type,e=>window.__scratchNativeEvents.push({type, trusted:e.isTrusted, files:(e.clipboardData??e.dataTransfer)?.files.length??0}),true);return true;"});
    await act(`${pane} .ProseMirror`,{click:true});await clipboardData('image/png',png);await act(`${pane} .ProseMirror`,{keys:[{key:'v',ctrl:true}]});
    const doc=await vscode.workspace.openTextDocument(uri);await until(()=>doc.getText().includes('assets/'),'Real image paste produced portable source');
    const imageCount=()=> (doc.getText().match(/assets\//g)??[]).length;const afterPaste=imageCount();checks['realImagePaste']=true;
    await act(`${pane} .ProseMirror`,{dropFile:pickedImage});await until(()=>imageCount()>afterPaste,'Real file-drop produced portable source');checks['realFileDrop']=true;
    const beforePicker=imageCount();await act(`${pane} .ProseMirror p:last-child`,{click:true});await pick(pane,'Insert workspace image',pickedImage);await until(()=>imageCount()>beforePicker,'Actual native image picker inserted image');
    await act(`${pane} .ProseMirror p:last-child`,{click:true});await pick(pane,'Insert workspace link',pickedLink);await until(()=>doc.getText().includes('link%20target.md'),'Actual native workspace picker inserted portable link');
    await act(`${pane} .ProseMirror`,{click:true});await clipboardData('text/plain',Buffer.from('https://example.test/native-url'));await act(`${pane} .ProseMirror`,{keys:[{key:'v',ctrl:true}]});await until(()=>doc.getText().includes('https://example.test/native-url'),'Real URL paste inserts a Markdown link');await act(`${pane} a[href="https://example.test/native-url"]`);
    const assets=await readdir(join(root,'scratches','assets'));assert.ok(assets.length>=3);let exactImages=0;for(const file of assets){const bytes=await readFile(join(root,'scratches','assets',file));assert.deepEqual(bytes.subarray(0,8),png.subarray(0,8));if(bytes.equals(png))exactImages++;}assert.ok(exactImages>=2,'Picked and dropped files retain original bytes');
    const trustedEvents=await act(pane,{expression:'return window.__scratchNativeEvents;'});assert.ok(trustedEvents.some((e:any)=>e.type==='paste'&&e.trusted&&e.files===1));assert.ok(trustedEvents.some((e:any)=>e.type==='drop'&&e.trusted&&e.files===1));checks['trustedNativeEvents']=trustedEvents;
    assert.doesNotMatch(doc.getText(),/blob:|vscode-webview:|vscode-resource:/);checks['realPasteDropAndPickers']={assetCount:assets.length,portable:true,workspaceLink:true,urlPaste:true};
    const beforeFailure=doc.getText(),beforeFailureAssets=(await readdir(join(root,'scratches','assets'))).length;
    const beforeCancel=frames.length;await act(`${pane} [aria-label="Insert workspace image"]`,{click:true});await act('.quick-input-widget .quick-input-box input',{keys:[{key:'Escape'}]});
    await until(()=>frames.slice(beforeCancel).some(f=>f.type==='asset-result'&&f.href===''),'Real picker cancellation');assert.equal(doc.getText(),beforeFailure);
    const invalidImage=join(workspace,'invalid.png');await writeFile(invalidImage,'not image bytes');const errors=frames.filter(f=>f.type==='action-error').length;await pick(pane,'Insert workspace image',invalidImage);
    await until(()=>frames.filter(f=>f.type==='action-error').length>errors,'Actual picked invalid image is refused');assert.equal(doc.getText(),beforeFailure);assert.equal((await readdir(join(root,'scratches','assets'))).length,beforeFailureAssets);checks['realPickerCancelAndInvalidImageNoMutation']=true;
    assert.equal(await doc.save(),true);await until(()=>chatPosts.some(m=>m?.payload?.type==='scratch-list'),'Native save refreshed real menu');
    await until(async()=>await act(pane,{expression:"const images=[...document.querySelectorAll('.scratch-owned-image img')];return images.length>0&&images.every(i=>i.complete&&i.naturalWidth===1);"}),'Native image bytes render successfully');
    const policy=await act(pane,{expression:"return {csp:document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')?.content,rawInputs:document.querySelectorAll('.image-edit input').length,resizeControls:document.querySelectorAll('.image-resize-handle').length,images:[...document.querySelectorAll('.scratch-owned-image img')].map(i=>({src:i.src,width:i.naturalWidth}))};"});assert.match(policy.csp,/connect-src 'none'/);assert.equal(policy.rawInputs,0);assert.equal(policy.resizeControls,0);assert.ok(policy.images.every((i:any)=>i.src.startsWith('https://')&&i.src.includes('.vscode-cdn.net/')));checks['productionCspLocalImages']=policy;
    // A real large DOM selection exercises the host cap before composer insertion.
    const large=await store.createScratch('Large selection','# Large\n\n'+'😀'.repeat(20000)+'\n');const largePane=await open(large.id);await select(largePane);await sendClick(largePane);await until(()=>!!chatPanel,'Large Send opens chat');await until(async()=>Buffer.byteLength((await act('#insrc-input')).value??'','utf8')===65535,'Composer cap keeps complete emoji within UTF-8 budget');const capped=(await act('#insrc-input')).value;assert.ok(capped.endsWith('…'));assert.equal(submitted,0);checks['composerCap']={bytes:Buffer.byteLength(capped),endsWithEllipsis:true,noSubmit:true};
    await act('#insrc-scratch',{click:true});await until(async()=>String((await act('#insrc-scratchmenu',{expression:'return el.textContent;'}))??'').includes(note.name),'Actual chat menu contains note before deletion');
    // Native deletion uses actual browse buttons and the same host boundary.
    pane=await open(note.id);
    await vscode.commands.executeCommand('vscode.openWith',uri,SCRATCH_EDITOR_VIEW_TYPE,vscode.ViewColumn.Beside);
    await until(()=>[...documents.values()].filter(p=>p.uri===uri.toString()).length>=2,'Exact URI open across multiple groups');
    const unrelatedUri=vscode.Uri.file(join(workspace,'unrelated.md'));await writeFile(unrelatedUri.fsPath,'# Keep unrelated tab\n');const unrelated=await vscode.workspace.openTextDocument(unrelatedUri);await vscode.window.showTextDocument(unrelated,{viewColumn:vscode.ViewColumn.Beside,preview:false});
    await panels.openBrowse();await act(`.scratch-delete[data-id="${note.id}"]`,{click:true});await until(()=>browseIncoming.some(m=>m?.payload?.type==='scratch-delete'&&m.payload.id===note.id),'Actual browse delete click reached host');
    // The note was saved above, so this clean deletion closes every exact-URI tab.
    await until(async()=>readFile(resolved.filePath).then(()=>false,()=>true),'Clean browse delete unlinked note');assert.equal([...documents.values()].filter(p=>p.uri===uri.toString()).length,0);
    assert.ok(vscode.window.tabGroups.all.some(g=>g.tabs.some(t=>t.input instanceof vscode.TabInputText&&t.input.uri.toString()===unrelatedUri.toString())));
    const listState=await act('.scratch-table',{expression:`return [...el.querySelectorAll('tr[data-id]')].map(r=>r.dataset.id);`});assert.ok(!listState.includes(note.id));
    const menuState=await act('#insrc-scratchmenu',{expression:'return el.textContent;'});assert.ok(!menuState.includes(note.name));checks['cleanBrowseDelete']={allMatchingGroupsClosed:true,unrelatedTabRetained:true,browseAndMenuRefreshed:true};
    // Dirty cancellation is observable through the real browse control.
    const dirty=await store.createScratch('Dirty cancellation','# Dirty\n');const dirtyResolved=await store.resolveScratch(dirty.id);const dirtyPane=await open(dirty.id);await act(`${dirtyPane} .ProseMirror`,{click:true,text:'Retain dirty '});const dirtyDoc=await vscode.workspace.openTextDocument(vscode.Uri.file(dirtyResolved.filePath));await until(()=>dirtyDoc.isDirty,'Actual dirty edit');await refresh.request();await panels.openBrowse();const beforeWarnings=warnings.length;await act(`.scratch-delete[data-id="${dirty.id}"]`,{click:true});await until(()=>warnings.length>beforeWarnings,'Dirty native delete cancelled');assert.match(dirtyDoc.getText(),/Retain dirty/);assert.ok(await readFile(dirtyResolved.filePath));checks['dirtyDeleteCancelled']=true;
    // A delete queued behind an actual renderer edit must drain then cancel
    // on native dirty state, retaining both canonical text and on-disk source.
    const pending=await store.createScratch('Pending cancellation','# Pending\n'),pendingResolved=await store.resolveScratch(pending.id),pendingUri=vscode.Uri.file(pendingResolved.filePath);
    const pendingPane=await open(pending.id);let release!:()=>void;const gate={hit:false,promise:new Promise<void>(r=>{release=r;}),resolve:()=>release()};applyHold=gate;
    await act(`${pendingPane} .ProseMirror`,{click:true,text:'Pending retained '});await until(()=>gate.hit,'Native apply held');
    const deleting=native.deleteDocument(pending.id);await tick();assert.equal(await readFile(pendingResolved.filePath,'utf8'),'# Pending\n');gate.resolve();applyHold=undefined;
    assert.equal(await deleting,'cancelled');const pendingDoc=await vscode.workspace.openTextDocument(pendingUri);assert.match(pendingDoc.getText(),/Pending retained/);assert.ok(pendingDoc.isDirty);assert.equal(await readFile(pendingResolved.filePath,'utf8'),'# Pending\n');checks['pendingDeleteCancelled']=true;
    const recovered=await store.createScratch('Recovery cancellation','# Recovery\n'),recoveredPath=await store.resolveScratch(recovered.id),recoveredUri=vscode.Uri.file(recoveredPath.filePath);
    await recovery.retain(recoveredUri.toString(),{type:'draft',paneSessionId:'recovery_probe',draftSeq:1,editId:'edit_1',baseVersion:1,baseDigest:scratchDigest('# Recovery\n'),markdown:'# Retained recovery\n'});
    await open(recovered.id);assert.equal(await native.deleteDocument(recovered.id),'cancelled');assert.equal(await readFile(recoveredPath.filePath,'utf8'),'# Recovery\n');assert.equal((await recovery.list(recoveredUri.toString()))[0]?.draft.markdown,'# Retained recovery\n');checks['recoveryDeleteCancelled']=true;
    // Real filesystem failure after clean close; no injected delete result.
    const failed=await store.createScratch('Unlink failure','# Unlink stays\n'),failedPath=await store.resolveScratch(failed.id),failedUri=vscode.Uri.file(failedPath.filePath);await open(failed.id);
    await chmod(join(root,'scratches'),0o500);
    try{await assert.rejects(native.deleteDocument(failed.id),/EACCES|permission denied/);}finally{await chmod(join(root,'scratches'),0o700);}
    assert.equal(await readFile(failedPath.filePath,'utf8'),'# Unlink stays\n');assert.ok([...documents.values()].some(p=>p.uri===failedUri.toString()));checks['unlinkFailureReopenedSameFile']=true;
    const creates={chat:chatCreates,browse:browseCreates};chatPanel?.dispose();browsePanel?.dispose();await until(()=>!chatPanel,'Closed real chat');
    assert.equal(await dirtyDoc.save(),true);await refresh.request();assert.deepEqual({chat:chatCreates,browse:browseCreates},creates);assert.equal(chatPanel,undefined);checks['saveRefreshWithDisposedUiNoReopen']=true;
    const lastPane=await open(failed.id);await act(`${lastPane} [aria-label="Lock scratchpad"]`,{click:true});await until(()=>stored===true,'Locked preference remembered');
    const locked=await store.createScratch('Remembered locked mode','# Locked new pane\n');const lockedPane=await open(locked.id);assert.equal(await act(`${lockedPane} .ProseMirror`,{expression:"return el.getAttribute('contenteditable');"}),'false');checks['rememberedMode']={editableNewPane:true,lockedNewPane:true};
    completed=true;await evidence(true);
  } catch(error){await evidence(false,{error:String(error),stack:error instanceof Error?error.stack:undefined,frames:frames.slice(-30),incoming:incoming.slice(-30),chatIncoming:chatIncoming.slice(-10),browseIncoming,nativePanes:[...documents.values()].map(p=>({uri:p.uri,column:p.panel.viewColumn,active:p.panel.active})),tabGroups:vscode.window.tabGroups.all.map(g=>({column:g.viewColumn,tabs:g.tabs.map(t=>({input:t.input,dirty:t.isDirty}))})),documents:vscode.workspace.textDocuments.map(d=>({uri:d.uri.toString(),dirty:d.isDirty,text:d.getText()}))});throw error;}
  finally {
    applyHold?.resolve();clipboard?.kill();saved.dispose();refresh.dispose();chatHost.dispose();panels.dispose();await native.dispose();
    if(completed)for(const item of await store.listScratches()){const path=await store.resolveScratch(item.id);const doc=await vscode.workspace.openTextDocument(vscode.Uri.file(path.filePath));await vscode.window.showTextDocument(doc);await vscode.commands.executeCommand('workbench.action.files.revert');}
    for(const{panel}of documents.values())panel.dispose();
  }
}
