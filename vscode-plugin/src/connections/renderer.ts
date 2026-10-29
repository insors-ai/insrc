/** Static CSP document; all dynamic text uses DOM text/value setters, never HTML or durable webview state. */
import { escapeHtml } from '../panels/html.js';

export const CONNECTION_MANAGER_SCRIPT=String.raw`(function(){
'use strict';
const api=acquireVsCodeApi(),body=document.body,viewId=body.getAttribute('data-view');
let generation=Number(body.getAttribute('data-generation')),model=null,formId=-1,shape='',page=0,restoreFocus=null,revealKey=null;
const byId=id=>document.getElementById(id),make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);return e;};
const clear=e=>{while(e.firstChild)e.removeChild(e.firstChild);};
const send=p=>api.postMessage(Object.assign({v:1,viewId:viewId,generation:generation},p));
const button=(text,fn)=>{const e=make('button',text);e.type='button';e.addEventListener('click',()=>{if(e.isConnected)fn();});return e;};
const human=s=>s.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[-_.]/g,' ').replace(/^./,c=>c.toUpperCase());
const label=(parent,text,input)=>{const id='cm-'+Math.random().toString(36).slice(2);input.id=id;const l=make('label',text);l.htmlFor=id;parent.appendChild(l);parent.appendChild(input);};
const valueAt=(o,path)=>path.reduce((v,k)=>v==null?undefined:v[k],o);
const fieldInputs=new Map(),secretControls=new Map();
const eraseSecrets=()=>{for(const controls of secretControls.values())for(const input of controls.inputs)input.value='';};
byId('root').addEventListener('change',e=>send({type:'root',value:e.target.value}));
byId('search').addEventListener('change',e=>send({type:'search',value:e.target.value}));
byId('search').addEventListener('keydown',e=>{if(e.key==='Enter')send({type:'search',value:e.target.value});});
for(const scope of ['all','saved','temporary'])byId('filter-'+scope).addEventListener('click',()=>send({type:'filter',value:scope}));
byId('refresh').addEventListener('click',()=>send({type:'refresh'}));
byId('add').addEventListener('click',()=>send({type:'add'}));
byId('clear-filter').addEventListener('click',()=>send({type:'clear-filter'}));
byId('close').addEventListener('click',()=>send({type:'close'}));
byId('save').addEventListener('click',()=>send({type:'save'}));
byId('test').addEventListener('click',()=>send({type:'test'}));
byId('cancel-test').addEventListener('click',()=>send({type:'cancel-test'}));
byId('remove').addEventListener('click',()=>send({type:'remove'}));
byId('id').addEventListener('input',e=>send({type:'id',value:e.target.value}));
byId('kind').addEventListener('change',e=>send({type:'kind',value:e.target.value}));
byId('scope').addEventListener('change',e=>send({type:'scope',value:e.target.value}));
const updateValue=(e,value)=>{if(model&&model.error||document.activeElement!==e)e.value=value===undefined?'':String(value);};
const options=(select,values,value)=>{const signature=JSON.stringify(values);if(select.getAttribute('data-options')!==signature){clear(select);for(const item of values){const o=make('option',item.label);o.value=item.value;o.disabled=!!item.disabled;select.appendChild(o);}select.setAttribute('data-options',signature);}select.value=value==null?'':String(value);};
const branchFor=(s,v)=>{let i=s.anyOf.findIndex(c=>Object.prototype.hasOwnProperty.call(c,'const')?v===c.const:c.type===typeof v);return i<0?0:i;};
const structure=(s,v)=>s.anyOf?[branchFor(s,v),structure(s.anyOf[branchFor(s,v)],v)]:s.type==='array'?(Array.isArray(v)?v.map(c=>structure(s.items,c)):[]):s.type==='object'?Object.fromEntries(Object.entries(s.properties||{}).map(([k,c])=>[k,structure(c,v&&v[k])])):null;
function buildFields(schema,path,parent,required){
 if(Object.prototype.hasOwnProperty.call(schema,'const'))return;
 const values=model.draft.publicValues,current=valueAt(values,path),part=path[path.length-1],name=part&&/^\d+$/.test(part)?'Item '+(Number(part)+1):human(part||'Fields');
 const sample=s=>Object.prototype.hasOwnProperty.call(s,'const')?s.const:s.enum?s.enum[0]:s.type==='object'?{}:s.type==='array'?[]:s.type==='boolean'?false:s.type==='integer'||s.type==='number'?(s.minimum||0):'';
 if(schema.anyOf){
  const group=make('fieldset');group.appendChild(make('legend',name));const choose=make('select');
  const branch=branchFor(schema,current);choose.setAttribute('data-focus',JSON.stringify(path)+':format');
  options(choose,schema.anyOf.map((s,i)=>({value:String(i),label:Object.prototype.hasOwnProperty.call(s,'const')?'Fixed value: '+String(s.const):human(s.type||'value')})),String(branch));label(group,name+' format',choose);
  choose.addEventListener('change',()=>{if(choose.isConnected)send({type:'field',path:path,value:sample(schema.anyOf[Number(choose.value)])});});
  buildFields(schema.anyOf[branch],path,group,required);parent.appendChild(group);return;
 }
 if(schema.type==='object'){
  const group=make('fieldset');group.appendChild(make('legend',path.length?name:'Connection fields'));parent.appendChild(group);
  for(const entry of Object.entries(schema.properties||{}))if(entry[0]!=='kind')buildFields(entry[1],path.concat(entry[0]),group,(schema.required||[]).includes(entry[0]));return;
 }
 if(schema.type==='array'){
  const group=make('fieldset');group.appendChild(make('legend',name+(required?' *':'')));parent.appendChild(group);const array=Array.isArray(current)?current:[];
  array.forEach((value,index)=>{const item=make('div');item.className='array-item';buildFields(schema.items,path.concat(String(index)),item,true);item.appendChild(button('Remove item '+(index+1),()=>send({type:'field',path:path,value:array.filter((_,i)=>i!==index)})));group.appendChild(item);});
  const add=button('Add '+name.toLowerCase()+' item',()=>send({type:'field',path:path,value:array.concat([sample(schema.items)])}));add.setAttribute('data-limit',String(array.length>=(schema.maxItems||16384)));add.disabled=!!model.blocked||!!model.draft.readOnly||array.length>=(schema.maxItems||16384);group.appendChild(add);
  if(!path.some(p=>/^\d+$/.test(p)))group.appendChild(button(model.draft.mode==='update'?'Keep original':'Use default',()=>send({type:'reset-field',path:path})));return;
 }
 const row=make('div');row.className='field';let input;
 if(schema.enum||schema.type==='boolean'){
  input=make('select');const choices=[{value:'',label:model.draft.mode==='update'?'Keep original':'Use default'}].concat((schema.enum||[true,false]).map(v=>({value:String(v),label:String(v)})));
  options(input,choices,current);input.addEventListener('change',()=>{if(!input.isConnected)return;if(input.value==='')send({type:'reset-field',path:path});else send({type:'field',path:path,value:schema.type==='boolean'?input.value==='true':['integer','number'].includes(schema.type)?Number(input.value):input.value});});
 }else{
  input=make('input');input.type=['number','integer'].includes(schema.type)?'number':'text';input.value=current===undefined?'':String(current);input.autocomplete='off';input.spellcheck=false;
  if(input.type==='number'){input.step=schema.type==='integer'?'1':'any';if(schema.minimum!==undefined)input.min=String(schema.minimum);if(schema.maximum!==undefined)input.max=String(schema.maximum);}
  if(schema.maxLength!==undefined)input.maxLength=schema.maxLength;
  input.addEventListener('input',()=>{if(!input.isConnected)return;let value=input.value;if(input.type==='number'){if(value===''){send({type:'reset-field',path:path});return;}value=Number(value);if(!Number.isFinite(value))return;}send({type:'field',path:path,value:value});});
 }
 input.setAttribute('data-field',JSON.stringify(path));input.setAttribute('aria-required',required?'true':'false');
 label(row,name+(required?' *':''),input);if(!path.some(p=>/^\d+$/.test(p)))row.appendChild(button(model.draft.mode==='update'?'Keep original':'Use default',()=>send({type:'reset-field',path:path})));
 if(schema.description)row.appendChild(make('small',schema.description));parent.appendChild(row);fieldInputs.set(JSON.stringify(path),{input:input,schema:schema,path:path});
}
function buildSecrets(){
 const parent=byId('credentials');eraseSecrets();clear(parent);secretControls.clear();const createdForm=model.formId;
 for(const credential of model.draft.credentials){
  const group=make('fieldset');group.appendChild(make('legend',human(credential.slot)));group.appendChild(make('p',credential.present?'Stored value present.':'No stored value.'));
  const action=make('select');label(group,'Credential action',action);options(action,['keep','replace','clear'].map(v=>({value:v,label:human(v)})),credential.action);
  const entry=make('div');entry.className='replacement';group.appendChild(entry);const inputs=[];
  const changed=()=>{if(!group.isConnected||model.formId!==createdForm)return;if(credential.format==='address-list'){const values=inputs.map(e=>e.value);send(values.some(v=>!v)?{type:'credential',slot:credential.slot,action:'replace',value:''}:{type:'credential-addresses',slot:credential.slot,values:values});}else send({type:'credential',slot:credential.slot,action:'replace',value:inputs[0].value});};
  const addInput=()=>{const row=make('div'),input=make('input');input.type='password';input.autocomplete='new-password';input.spellcheck=false;input.maxLength=16384;label(row,credential.format==='address-list'?'Replacement address':'Replacement value',input);entry.appendChild(row);inputs.push(input);input.addEventListener('input',()=>{if(input.isConnected&&inputs.includes(input))changed();});if(credential.format==='address-list')row.appendChild(button('Remove replacement address',()=>{const index=inputs.indexOf(input);if(index<0)return;input.value='';inputs.splice(index,1);entry.removeChild(row);if(!inputs.length){addInput();send({type:'credential',slot:credential.slot,action:'replace',value:''});}else changed();}));};
  addInput();if(credential.format==='address-list')entry.appendChild(button('Add replacement address',()=>{addInput();changed();inputs[inputs.length-1].focus();}));
  group.appendChild(make('small','Replace starts blank. Entered replacements stay only in workbench memory and are never echoed back. Keep retains the stored value; Clear removes it.'));
  action.addEventListener('change',()=>{if(!group.isConnected||model.formId!==createdForm)return;for(const input of inputs)input.value='';send(action.value==='replace'?{type:'credential',slot:credential.slot,action:'replace',value:''}:{type:'credential',slot:credential.slot,action:action.value});});
  parent.appendChild(group);secretControls.set(credential.slot,{action:action,entry:entry,inputs:inputs});
 }
}
function renderDraft(){
 const d=model.draft;byId('editor').hidden=!d;byId('no-selection').hidden=!!d;
 if(!d){if(formId!==-1){eraseSecrets();clear(byId('fields'));clear(byId('credentials'));fieldInputs.clear();secretControls.clear();}formId=-1;shape='';return;}
 if(formId!==model.formId){formId=model.formId;shape='';clear(byId('fields'));fieldInputs.clear();buildSecrets();byId('editor-title').focus();}
 const locked=model.blocked||d.readOnly||!model.list.canMutate;
 byId('editor-title').textContent=d.mode==='create'?'Add connection':'Edit connection';updateValue(byId('id'),d.key.id);byId('id').disabled=d.mode!=='create'||locked;
 options(byId('kind'),model.choices.map(c=>({value:c.kind,label:c.kind+' · '+c.family+(c.enabled?'':' · requires newer editor'),disabled:!c.enabled})),d.kind);byId('kind').disabled=d.mode!=='create'||locked;
 byId('scope').value=d.key.scope;byId('scope').disabled=d.mode!=='create'||locked;
 byId('family').textContent='Effective family: '+d.family;
 byId('scope-copy').textContent=d.key.scope==='temporary'?'Temporary connections survive repository, manager and Settings switches. They expire when this workbench ends, its lease expires, or the daemon restarts. Discard releases application-owned resources and preserves source data.':'Saved registrations persist for this repository. Delete removes the registration and obsolete application-owned credentials; source data is preserved.';
 byId('form-guidance').textContent=model.blocked?'Resolve the pending operation before editing this connection.':d.guidance||(!model.valid?'Complete required fields (*) and any replacement values to save.':'Test is optional. Save uses exactly the same input.');
 const nextShape=JSON.stringify(structure(d.publicInputSchema,d.publicValues));if(shape!==nextShape){const active=document.activeElement&&document.activeElement.getAttribute('data-field'),format=document.activeElement&&document.activeElement.getAttribute('data-focus');shape=nextShape;clear(byId('fields'));fieldInputs.clear();buildFields(d.publicInputSchema,[],byId('fields'),false);if(active&&fieldInputs.has(active))fieldInputs.get(active).input.focus();else if(format)for(const control of byId('fields').querySelectorAll('select'))if(control.getAttribute('data-focus')===format)control.focus();}
 for(const field of fieldInputs.values()){updateValue(field.input,valueAt(d.publicValues,field.path));field.input.disabled=locked;}
 for(const control of byId('fields').querySelectorAll('button,select,input'))control.disabled=locked||control.getAttribute('data-limit')==='true';
 for(const control of byId('credentials').querySelectorAll('button'))control.disabled=locked;
 for(const credential of d.credentials){const controls=secretControls.get(credential.slot);if(!controls)continue;controls.action.value=credential.action;controls.action.disabled=locked;controls.entry.hidden=credential.action!=='replace';for(const input of controls.inputs){if(credential.action!=='replace')input.value='';input.disabled=locked;}}
 byId('save').disabled=!model.list.canMutate||!model.valid||model.blocked||d.readOnly;byId('test').disabled=byId('save').disabled||model.test.status==='testing';
 byId('test-status').textContent=model.test.message+(model.test.tookMs===null?'':' ('+Math.round(model.test.tookMs)+' ms)')+(model.test.cleanupUnverified?' Worker cleanup is not yet verified.':'');
 byId('cancel-test').hidden=model.test.status!=='testing';
}
function renderOperations(){
 const parent=byId('operations');clear(parent);
 for(const r of model.operations){const card=make('section');card.className='operation';card.appendChild(make('h3',r.key.id+' · '+r.key.scope));
  card.appendChild(make('p',r.removal?r.removal.safeMessage:r.phase==='committed'?(r.outcome.registration==='persisted'?'Saved registration committed.':'Temporary registration committed.'):'Operation '+r.phase.replace(/-/g,' ')+'.'));
  const problems={'duplicate-id':'A connection with this ID already exists. Choose a different ID.','busy':'The connection is in use. Retry after current work finishes.','conflict':'The stored revision changed. Refresh and reopen it before trying again.','registry-unreadable':'The registration store could not be read safely. Repair it before retrying.','secret-unavailable':'Stored credentials are unavailable. Re-enter them explicitly.','session-expired':'The temporary owner ended. Its private input has been erased.','upgrade-required':'Upgrade or enable compatible connection management before continuing.','transport-error':'Delivery was lost. Check the original operation; do not create a replacement request.','reconciliation-required':'Reconcile the original operation before making a new attempt.'};
  if(r.errorCode&&problems[r.errorCode])card.appendChild(make('p',problems[r.errorCode]));
  if(r.outcome){card.appendChild(make('p','Registration: '+r.outcome.registration+' · Activation: '+r.outcome.activation+' · Credential cleanup: '+r.outcome.credentialCleanup+' · List refresh: '+r.refresh));if(r.removal)card.appendChild(make('p','Resource cleanup: '+r.removal.resourceCleanup));}
  const action=(text,name)=>{const b=button(text,()=>send({type:'operation',recordId:r.recordId,action:name}));b.disabled=r.busy;card.appendChild(b);};
  if(['unknown','pending','not-seen','reconciliation-required'].includes(r.phase))action('Check original operation','reconcile');
  if(r.canReplay)action('Replay identical original request','replay');
  if(r.phase==='committed'){if(['pending','failed'].includes(r.outcome.activation))action('Retry activation','activation');if(r.outcome.credentialCleanup==='pending'||r.removal&&r.removal.state==='removed-cleanup-pending')action('Retry original cleanup','cleanup');if(r.refresh==='failed')action('Retry list refresh','refresh');}
  if(r.canDismiss)action('Dismiss completed card','dismiss');parent.appendChild(card);
 }
}
function renderDialog(){
 const dialog=byId('confirmation'),show=model.dirty||!!model.confirmation;
 if(!show){if(dialog.open&&dialog.close)dialog.close();dialog.hidden=true;if(restoreFocus&&restoreFocus.isConnected)restoreFocus.focus();restoreFocus=null;return;}
 byId('confirm-title').textContent=model.dirty?'Discard unsaved changes?':model.confirmation.action+' connection?';
 byId('confirm-message').textContent=model.dirty?'Discard clears only this unsaved draft. Cancel keeps every field and returns to editing.':model.confirmation.message;
 byId('confirm-target').textContent=model.dirty?'':model.confirmation.key.repoRoot+' · '+model.confirmation.key.scope+' · '+model.confirmation.key.id+' · revision '+model.confirmation.expectedRevision;
 byId('confirm-accept').textContent=model.dirty?'Discard unsaved draft':model.confirmation.action;dialog.hidden=false;
 if(!dialog.open){restoreFocus=document.activeElement;if(dialog.showModal)dialog.showModal();byId('confirm-cancel').focus();}
}
byId('confirm-cancel').addEventListener('click',()=>send(model.dirty?{type:'dirty',decision:'cancel'}:{type:'removal',decision:'cancel'}));
byId('confirm-accept').addEventListener('click',()=>send(model.dirty?{type:'dirty',decision:'discard'}:{type:'removal',decision:'confirm'}));
byId('confirmation').addEventListener('cancel',e=>{e.preventDefault();send(model.dirty?{type:'dirty',decision:'cancel'}:{type:'removal',decision:'cancel'});});
function render(m){
 if(model&&model.draft&&!m.draft&&m.operations.some(r=>r.outcome&&r.outcome.registration!=='removed'))revealKey=JSON.stringify(model.draft.key);
 model=m;generation=m.generation;const list=m.list;
 options(byId('root'),[{value:'',label:'Select a registered repository',disabled:!!list.repoRoot}].concat(list.roots.map(r=>({value:r,label:r}))),list.repoRoot);byId('root').disabled=m.dirty||!!m.confirmation;
 updateValue(byId('search'),list.search);for(const scope of ['all','saved','temporary']){byId('filter-'+scope).textContent=human(scope)+' ('+list.counts[scope]+')';byId('filter-'+scope).setAttribute('aria-pressed',String(list.filter===scope));}
 const statuses={'loading':'Loading connections…','ready':'Connections ready.','empty-registry':'No connections in this repository. Add a saved or temporary connection.','empty-filter':'No connections match this filter and search.','read-error':'Connections could not be read. Last known rows are stale and cannot be changed.','offline':'Daemon offline or connection owner expired. Last known rows are stale and cannot be changed.','no-repository':'Select a daemon-registered repository. Register a repository through insrc if none are listed.','upgrade-required':'Connection management requires a compatible daemon and enabled management support.'};
 byId('list-status').textContent=statuses[list.listState];byId('counts').textContent=list.matchingCount+' matching · '+list.counts.all+' total'+(list.stale?' · stale':'');byId('clear-filter').hidden=list.listState!=='empty-filter';
 byId('add').disabled=!list.canMutate||!m.choices.some(c=>c.enabled);byId('error').textContent=m.error;byId('notice').textContent=m.notice;
 const parent=byId('rows'),focused=document.activeElement&&document.activeElement.getAttribute('data-row');clear(parent);if(page*200>=m.rows.length)page=0;
 for(const row of m.rows.slice(page*200,page*200+200)){const b=button(row.label+' · '+row.kind+' · '+row.key.scope,()=>send({type:'select',key:row.key,revision:row.revision}));b.className='connection-row';b.disabled=!list.canMutate;b.setAttribute('data-row',JSON.stringify([row.key,row.revision]));b.setAttribute('aria-pressed',String(row.selected));parent.appendChild(b);if(focused===b.getAttribute('data-row'))b.focus();}
 byId('previous').disabled=page===0;byId('next').disabled=(page+1)*200>=m.rows.length;byId('page').textContent=m.rows.length?'Rows '+(page*200+1)+'–'+Math.min(m.rows.length,(page+1)*200)+' of '+m.rows.length:'';
 const selected=m.rows.find(r=>r.selected);byId('remove').disabled=!list.canMutate||!selected;byId('remove').textContent=selected&&selected.key.scope==='temporary'?'Discard selected':'Delete selected';
 renderDraft();renderOperations();renderDialog();
 if(revealKey&&!m.dirty&&!m.confirmation){const done=m.operations.find(r=>JSON.stringify(r.key)===revealKey&&r.phase==='committed'&&r.refresh==='complete');if(done){const row=Array.from(parent.children).find(e=>e.getAttribute('aria-pressed')==='true');if(row)row.focus();revealKey=null;}}
}
byId('previous').addEventListener('click',()=>{page=Math.max(0,page-1);if(model)render(model);});byId('next').addEventListener('click',()=>{page++;if(model)render(model);});
window.addEventListener('message',event=>{const m=event.data;if(m&&m.type==='render'&&m.view&&m.view.viewId===viewId)try{render(m.view);}catch{byId('error').textContent='This connection view could not be rendered. Reopen Connections.';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){eraseSecrets();send({type:'cancel-test'});}});
window.addEventListener('pagehide',eraseSecrets);
send({type:'ready'});
})();`;

export function connectionManagerDocument(nonce:string,viewId:string,generation:number):string {
 if(!/^[A-Za-z0-9+/=_-]{16,128}$/.test(nonce)||!Number.isSafeInteger(generation)||generation<0)throw new Error('Invalid connection view identity.');
 const n=escapeHtml(nonce);
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${n}'; style-src 'nonce-${n}'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>Connections</title><style nonce="${n}">
 :root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;padding:18px;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size,13px)}button,input,select{font:inherit;color:inherit}button{padding:7px 10px;margin:3px;border:1px solid var(--vscode-button-border,var(--vscode-contrastBorder,transparent));background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border-radius:3px;cursor:pointer}button:hover{background:var(--vscode-button-secondaryHoverBackground)}button:disabled{opacity:.55;cursor:default}button[aria-pressed=true]{outline:1px solid var(--vscode-focusBorder);background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}input,select{padding:6px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,var(--vscode-contrastBorder,transparent));border-radius:2px;max-width:100%}:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}h1{font-size:22px;margin:0}h2{font-size:17px}h3{font-size:14px}header,.toolbar,.pager{display:flex;align-items:center;gap:8px;flex-wrap:wrap}header{justify-content:space-between;margin-bottom:18px}.manager{display:grid;grid-template-columns:minmax(15rem,.9fr) minmax(20rem,1.4fr);gap:20px}.list,.detail{min-width:0;border:1px solid var(--vscode-panel-border,var(--vscode-contrastBorder));padding:14px;border-radius:4px}.root-control{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}#rows{display:flex;flex-direction:column;gap:5px;max-height:55vh;overflow:auto}.connection-row{text-align:left;overflow-wrap:anywhere}.field{display:grid;grid-template-columns:minmax(7rem,1fr) minmax(9rem,2fr) auto;align-items:center;gap:7px;margin:8px 0}.field small{grid-column:1/-1}fieldset{border:1px solid var(--vscode-panel-border,var(--vscode-contrastBorder));margin:12px 0;padding:10px;min-width:0}legend{padding:0 5px}.replacement label{display:block;margin-top:6px}.replacement input{width:100%}.operation{border-left:3px solid var(--vscode-focusBorder);padding:8px 12px;margin:12px 0;background:var(--vscode-sideBar-background)}small,#counts,#family{color:var(--vscode-descriptionForeground)}#error{color:var(--vscode-errorForeground)}#scope-copy{padding:10px;background:var(--vscode-textBlockQuote-background);border-left:3px solid var(--vscode-textBlockQuote-border,var(--vscode-focusBorder))}dialog{color:var(--vscode-foreground);background:var(--vscode-editorWidget-background,var(--vscode-editor-background));border:2px solid var(--vscode-focusBorder);max-width:min(90vw,40rem)}dialog::backdrop{background:#0007}#confirm-target{overflow-wrap:anywhere}#save{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}[hidden]{display:none!important}@media(max-width:760px){.manager{grid-template-columns:1fr}.field{grid-template-columns:1fr}.field small{grid-column:1}#rows{max-height:30vh}}@media(forced-colors:active){button,input,select,.list,.detail,fieldset{border:1px solid CanvasText}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
 </style></head><body data-view="${escapeHtml(viewId)}" data-generation="${generation}"><header><h1>Connections</h1><button type="button" id="close">Close manager</button></header><p id="error" role="alert"></p><p id="notice" role="status"></p><div class="root-control"><label for="root">Registered repository</label><select id="root"></select></div><main class="manager"><section class="list" aria-labelledby="list-title"><h2 id="list-title">Connection registrations</h2><nav class="toolbar" aria-label="Connection scope filter"><button id="filter-all">All (0)</button><button id="filter-saved">Saved (0)</button><button id="filter-temporary">Temporary (0)</button></nav><div class="root-control"><label for="search">Search by ID, driver or label</label><input id="search" type="search" autocomplete="off"></div><div class="toolbar"><button id="refresh">Refresh</button><button id="add" disabled>Add connection</button><button id="clear-filter" hidden>Clear filters</button></div><p id="counts"></p><p id="list-status" role="status" aria-live="polite">Choose a registered repository.</p><div id="rows" aria-label="Connections"></div><div class="pager"><button id="previous">Previous</button><span id="page"></span><button id="next">Next</button></div><button id="remove" disabled>Delete selected</button></section><section class="detail" aria-label="Connection draft and operations"><div id="operations" aria-label="Operation recovery"></div><p id="no-selection">Select a connection to edit, or add a saved or temporary registration.</p><section id="editor" hidden><h2 id="editor-title" tabindex="-1">Connection draft</h2><div class="field"><label for="id">Connection ID *</label><input id="id" autocomplete="off" maxlength="16384"></div><div class="field"><label for="kind">Driver</label><select id="kind"></select></div><div class="field"><label for="scope">Connection scope</label><select id="scope"><option value="saved">Saved</option><option value="temporary">Temporary</option></select></div><p id="family"></p><p id="scope-copy"></p><p id="form-guidance" role="status"></p><div id="fields"></div><div id="credentials"></div><div class="toolbar"><button id="test">Test (optional)</button><button id="cancel-test" hidden>Cancel test</button><button id="save">Save connection</button></div><p id="test-status" role="status" aria-live="polite"></p></section></section></main><dialog id="confirmation" hidden aria-labelledby="confirm-title" aria-describedby="confirm-message"><h2 id="confirm-title"></h2><p id="confirm-message"></p><p id="confirm-target"></p><button id="confirm-cancel" autofocus>Cancel</button><button id="confirm-accept"></button></dialog><script nonce="${n}">${CONNECTION_MANAGER_SCRIPT}</script></body></html>`;
}
