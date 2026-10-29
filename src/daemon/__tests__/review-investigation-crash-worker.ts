/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFileSync } from 'node:fs';
import { InvestigationRepository } from '../review-investigation-repository.js';
import { lifecycleFor } from '../lifecycle-registry.js';
import { ArtifactStore } from '../../workflow/artifact-core/store.js';
import { createFileJournal } from '../../workflow/artifact-core/journal.js';
import { creationContextProvider } from '../../workflow/artifact-core/codecs.js';
import { writeAtomic } from '../../workflow/storage.js';
import { continuationFixture,progressFor,finalReply } from '../../workflow/code-review/investigation/__tests__/continuation-fixtures.js';
import type { InvestigationStart } from '../review-investigation-descriptor.js';
const [file,boundary]=process.argv.slice(2) as [string,string];
const start=JSON.parse(readFileSync(file,'utf8')) as InvestigationStart;
const lifecycle=lifecycleFor(start.repo);
const stop=(at:string)=>{process.send?.({boundary:at});process.kill(process.pid,'SIGSTOP');};
const canonical=new ArtifactStore({repoPath:start.repo,history:lifecycle.store.history,journal:createFileJournal(start.repo),contexts:creationContextProvider(start.repo,{rootKinds:['CR']}),writeHead:(path,bytes)=>{writeAtomic(path,bytes);if(boundary==='canonical-head'&&path.includes('/CR-'))stop(boundary);}});
const repository=new InvestigationRepository({repoId:start.repoId,repoPath:start.repo,canonical,processEpoch:'crash-child',assertRegistered:async()=>{},assertProcessOwner:()=>{},assertReady:async()=>{},daemonAdapter:async()=>({provider:continuationFixture().provider,modelLabel:'scripted-crash-fixture',assertQualified:async()=>{},drain:async()=>{},execute:async(turn,tools,_signal,runtime)=>{
 const ids:string[]=[];for(const ref of runtime.navigation!.sourceRefs)ids.push((await tools.read(ref)).evidenceId);
 const {store}=await repository.service.open(turn.runId),blocks=store.replay().basis.subject.packets.flatMap(p=>p.blocks);
 for(const block of blocks){await tools.progress({...progressFor(turn,block.blockId,runtime.state().sequence),disposition:'reviewed',evidenceIds:ids,coverageUpdates:boundary==='canonical-head'?runtime.state().ledger.coverage.map(row=>({...row,disposition:'satisfied',evidenceIds:ids,rationale:'Scripted crash fixture inspected pinned source',assessedByAttempt:turn.attemptId})):[]});if(boundary==='after-block')stop(boundary);}
 const state=runtime.state();return {...finalReply(turn,state.accepted.map(a=>a.receipt.progressId),state.sequence),next:{kind:'request-completion',remainingWork:[],reason:'Scripted crash fixture'}};
}})});
const accepted=await repository.start(start);await repository.advance(accepted.descriptor.runId);
throw Error('Crash boundary was not reached');
