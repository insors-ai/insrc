import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScratchMarkdownVerifier, scratchSourceCodec } from '../scratch-markdown.js';
import { scratchDigest, ScratchDocumentController } from '../scratch-editor-provider.js';
import { ScratchRendererState } from '../scratch-editor-state.js';
import { ScratchValidationClient, type ScratchValidationIdentity } from '../scratch-validation-client.js';
import { scratchValidationEngine } from '../scratch-validation-engine.js';

const identity=(source:string,seq=1,version=1,paneSessionId='candidate'):ScratchValidationIdentity=>({paneSessionId,draftSeq:seq,editId:`edit_${seq}`,baseVersion:version,baseDigest:scratchDigest(source)});
const confirmation=(id:ScratchValidationIdentity,source:string)=>({...id,version:id.baseVersion+1,digest:scratchDigest(source),markdown:source});
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};};
function harness(intent?: ((document: ReturnType<typeof scratchSourceCodec.parse>)=>Promise<string>)) {
  const parses=new Map<string,number>(),sent:Record<string,unknown>[]=[],errors:unknown[]=[];
  let receive!:(value:unknown)=>void,failed!:()=>void,closed=false;
  const engine=scratchValidationEngine(async()=>({...scratchSourceCodec,parse:(text:string)=>{parses.set(text,(parses.get(text)??0)+1);return scratchSourceCodec.parse(text);}}),value=>queueMicrotask(()=>receive(value)),intent);
  const client=new ScratchValidationClient({post:value=>{sent.push(value as Record<string,unknown>);queueMicrotask(()=>{if(!closed)void engine(value).catch(e=>{errors.push(e);failed();});});},listen:(message,error)=>{receive=message;failed=error;return()=>{};},terminate:()=>{closed=true;}});
  const run=(source:string,draft:string,id=identity(source))=>client.run({source,draft,baseKey:`${id.baseVersion}:${id.baseDigest}`,identity:id,...(intent?{expectedIntent:'a'.repeat(64)}:{})});
  return{client,run,parses,sent,errors};
}

test('candidate proofs require successful full edits and retain one immutable handoff',()=>{
  const parses=new Map<string,number>(),codec={...scratchSourceCodec,parse:(s:string)=>{parses.set(s,(parses.get(s)??0)+1);return scratchSourceCodec.parse(s);}};
  const verifier=new ScratchMarkdownVerifier(codec),source='# Base\n',draft='# Candidate\n',key=`1:${scratchDigest(source)}`;
  const job=verifier.job(source,key);assert.equal(job.retainCandidate(draft,1),false,'A token or checked source alone is not a successful edit');
  assert.equal(job.validation.edit(source,draft,job.validation.parse(draft)).allowed,true);job.retainBase();assert.equal(job.retainCandidate(draft,1),true);
  const state=verifier as unknown as {base:unknown;candidate:{value:{source:string;inventory:{protectedSpans:unknown[]}}}|undefined};
  assert.ok(Object.isFrozen(state.candidate?.value));assert.ok(Object.isFrozen(state.candidate?.value.inventory));assert.ok(Object.isFrozen(state.candidate?.value.inventory.protectedSpans));assert.deepEqual(Object.keys(state.candidate!.value).sort(),['inventory','source']);
  assert.equal(verifier.acceptCandidate(99),false);assert.equal(verifier.acceptCandidate(1),true);
  verifier.discardCandidate();assert.equal(verifier.confirmCandidate(1,draft,`2:${scratchDigest(draft)}`),true,'Accepted apply survives newer staged input');
  parses.clear();const next=verifier.job(draft,`2:${scratchDigest(draft)}`);assert.equal(next.validation.edit(draft,'# Next\n',next.validation.parse('# Next\n')).allowed,true);assert.equal(parses.has(draft),false,'Confirmed fully checked candidate is next source proof');assert.equal(parses.get('# Next\n'),1,'Fresh candidate is still parsed');
  assert.equal(next.retainCandidate('# Next\n',2),true);assert.equal(verifier.confirmCandidate(2,'# Next\n','3:unaccepted'),false,'No canonical adoption before accepted provenance');
  for(let i=0;i<50;i++){const j=verifier.job(source,key),text=`# Candidate ${i}\n`;assert.equal(j.validation.edit(source,text,j.validation.parse(text)).allowed,true);j.retainBase();assert.equal(j.retainCandidate(text,i+10),true);assert.equal(state.candidate!.value.source,text);}
  assert.equal(Array.isArray(state.base),false);assert.equal(Array.isArray(state.candidate),false);
  const active=verifier.job(source,key);assert.equal(active.validation.edit(source,draft,active.validation.parse(draft)).allowed,true);verifier.invalidate();assert.equal(active.retainCandidate(draft,100),false);active.retainBase();assert.equal(state.base,undefined);assert.equal(state.candidate,undefined);
  const raw='```mermaid\ngraph TD\nA --> B\n```\n',aliased='~~~mermaid\ngraph TD\nA --> B\n~~~\n';
  const aliasVerifier=new ScratchMarkdownVerifier({parse:(text:string)=>text,serialize:(text:string)=>text,equivalent:(a:string,b:string)=>a.replace(/~~~|```/g,'')===b.replace(/~~~|```/g,'')});
  const alias=aliasVerifier.job(raw,'1:raw');assert.equal(alias.validation.check(raw).allowed,true);assert.equal(alias.validation.check(aliased).allowed,true);assert.equal(alias.validation.edit(raw,aliased,raw).allowed,false,'Full edit can refuse even when both independent round trips pass');assert.equal(alias.retainCandidate(aliased,500),false,'Protected-span failure never yields a candidate proof');
  const refused=verifier.job('---\ntitle: keep\n---\n','1:refused');assert.equal(refused.validation.edit('---\ntitle: keep\n---\n',draft,refused.validation.parse(draft)).allowed,false);assert.equal(refused.retainCandidate(draft,101),false);
});

test('candidate client binds executor identity canonical bytes digest and version without replay',async()=>{
  const source='# Base\n',draft='# Candidate\n';
  for(const mode of ['valid','unaccepted','forged','foreign','pane','sequence','edit','version','digest','bytes','invalidated','superseded','revoked','disposed'] as const){
    const h=harness(),id=identity(source);try{
      await h.client.ready;const result=await h.run(source,draft,id);assert.equal(result.allowed,true);assert.ok(result.ticket);const ticket=result.ticket;
      assert.ok(Object.isFrozen(ticket));assert.ok(Object.isFrozen(ticket.identity));
      let passed=ticket,actual=confirmation(id,draft);
      if(mode==='forged')passed={...ticket};
      if(mode==='foreign'){const other=harness();try{await other.client.ready;passed=(await other.run(source,draft,id)).ticket!;}finally{other.client.dispose();}}
      if(mode==='pane')actual={...actual,paneSessionId:'other'};
      if(mode==='sequence')actual={...actual,draftSeq:2};
      if(mode==='edit')actual={...actual,editId:'edit_2'};
      if(mode==='version')actual={...actual,version:3};
      if(mode==='digest')actual={...actual,digest:'b'.repeat(64)};
      if(mode==='bytes')actual={...actual,markdown:'# Changed\n'};
      if(mode!=='unaccepted')assert.equal(h.client.acceptCandidate(ticket),true);
      if(mode==='invalidated')h.client.invalidateBase();
      if(mode==='superseded')h.client.discardCandidate(); // pinned accepted handoff is preserved
      if(mode==='revoked')h.client.discardCandidate(true);
      if(mode==='disposed')h.client.dispose();
      const accepted=h.client.confirmCandidate(passed,actual);assert.equal(accepted,mode==='valid'||mode==='superseded',mode);
      if(mode==='forged'||mode==='foreign')assert.equal(h.client.confirmCandidate(ticket,confirmation(id,draft)),true,'Foreign ticket cannot consume a legitimate handoff');
      if(mode!=='disposed'){
        h.parses.clear();const follow=await h.run(draft,'# Latest\n',identity(draft,2,2));assert.equal(follow.allowed,true);
        const warm=['valid','superseded','forged','foreign'].includes(mode);assert.equal(h.parses.has(draft),!warm,mode);
        if(warm){assert.equal(h.client.confirmCandidate(ticket,confirmation(id,draft)),false,'Replay cannot clear or adopt newer state');}
      }
      assert.deepEqual(h.errors,[]);
    }finally{h.client.dispose();}
  }
  const h=harness();try{const id=identity(source),result=await h.run(source,source,id);assert.ok(result.ticket);assert.equal(h.client.acceptCandidate(result.ticket),true);assert.equal(h.client.confirmCandidate(result.ticket,{...id,version:1,digest:scratchDigest(source),markdown:source}),true,'No-op canonical confirmation keeps actual unchanged version');}finally{h.client.dispose();}
});

test('candidate invalidation during active intent prevents late cache repopulation',async()=>{
  const held=deferred(),entered=deferred(),source='# Base\n',draft='# Candidate\n';let first=true;
  const h=harness(async()=>{if(first){first=false;entered.resolve();await held.promise;}return 'a'.repeat(64);});
  try{const pending=h.run(source,draft);await entered.promise;h.client.invalidateBase();await new Promise(r=>setImmediate(r));held.resolve();const result=await pending;assert.equal(result.allowed,true);assert.equal(result.ticket,undefined,'Result may remain structurally allowed but cannot carry invalidated handoff');h.parses.clear();await h.run(source,draft);assert.equal(h.parses.get(source),1,'Late completion cannot repopulate cleared source proof');assert.deepEqual(h.errors,[]);}finally{held.resolve();h.client.dispose();}
});

test('canonical controller adopts only accepted successful exact native application',async()=>{
  const source='# Base\n',draft='# Candidate\n';
  for(const scenario of ['own-event','no-event','newer-typing','external','refused-apply','lost-ack'] as const){
    const h=harness();let document={version:1,markdown:source},adopted=0;let state!:ScratchRendererState;
    const controller=new ScratchDocumentController({read:()=>document,validation:{acceptCandidate:t=>h.client.acceptCandidate(t),confirmCandidate:(t,c)=>{const ok=h.client.confirmCandidate(t,c);if(ok)adopted++;return ok;},discardCandidate:f=>h.client.discardCandidate(f),invalidateBase:()=>h.client.invalidateBase()},admit:(s,d,b,id)=>h.client.run({source:s,draft:d,baseKey:`${b.version}:${b.digest}`,identity:id}),retainDraft:async()=>{},draftApplied:async()=>{},warn:()=>{},applyEdit:async edit=>{
      if(scenario==='refused-apply')return false;
      document={version:document.version+1,markdown:document.markdown.slice(0,edit.start)+edit.text+document.markdown.slice(edit.end)};
      if(scenario==='external')document={version:document.version+1,markdown:'# External\n'};
      if(scenario!=='no-event')controller.documentChanged();
      if(scenario==='newer-typing')state.stage('# Newer visible\n');return true;
    }});
    state=new ScratchRendererState('controller',controller.snapshot,value=>{void controller.receive('controller',value);});controller.addPane('controller',message=>{state.receive(message);return scenario==='lost-ack'&&message.type==='apply-ack'?false:true;},false);
    try{const seq=state.stage(draft);assert.equal(state.authorize(seq,1,scratchDigest(source)),true);await controller.flush();assert.equal(adopted,['external','refused-apply'].includes(scenario)?0:1,scenario);if(scenario==='newer-typing'){assert.equal(state.markdown,'# Newer visible\n');assert.equal(state.hasPending,true);}assert.deepEqual(h.errors,[]);}finally{await controller.dispose();h.client.dispose();}
  }
});

test('matching document state remains provisional until exact own acknowledgement',()=>{
  for(const mode of ['matching','wrong-event-digest','wrong-ack-digest','newer'] as const){
    const source='# Base\n',draft='# Candidate\n',digest=scratchDigest(draft),state=new ScratchRendererState('provisional',{version:1,digest:scratchDigest(source),markdown:source},()=>{});
    const seq=state.stage(draft);assert.equal(state.authorize(seq,1,scratchDigest(source),digest),true);
    if(mode==='newer')state.stage('# Newer visible\n');
    const event={type:'document-state',paneSessionId:'provisional',version:2,digest:mode==='wrong-event-digest'?'f'.repeat(64):digest,markdown:draft,locked:false};
    const observed=state.receive(event);assert.equal(state.snapshot.version,1,'No canonical base advance or proof adoption from change event');assert.equal(state.hasPending,true);
    if(mode==='wrong-event-digest'){assert.ok(observed.conflict);continue;}
    assert.equal(state.conflicted,false);const ack=state.receive({type:'apply-ack',paneSessionId:'provisional',draftSeq:1,editId:'edit_1',version:2,digest:mode==='wrong-ack-digest'?'f'.repeat(64):digest,markdown:draft});
    if(mode==='wrong-ack-digest'){assert.ok(ack.conflict);assert.equal(state.snapshot.version,1);}else{assert.equal(state.snapshot.version,2);if(mode==='newer'){assert.equal(state.markdown,'# Newer visible\n');assert.equal(state.phase,'waiting-idle');}else assert.equal(state.hasPending,false);}
  }
});
