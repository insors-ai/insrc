/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RecoveryStore } from '../recovery-store.js';
import { createRepoLifecycle } from '../../../artifact-core/repo-lifecycle.js';
import { ArtifactStore } from '../../../artifact-core/store.js';
import { createFileJournal } from '../../../artifact-core/journal.js';
import { creationContextProvider } from '../../../artifact-core/codecs.js';
import { writeAtomic } from '../../../storage.js';
import { completeInvestigationReview } from '../completion-receipt.js';
import type { CompletionValidationContext } from '../completion-types.js';
const [repo,runId,leaseId,intentRef,point]=process.argv.slice(2) as [string,string,string,string,string];
const crash=()=>{writeFileSync(join(repo,'crash-point'),point);process.exit(86);};
let armReceipt=false,store:RecoveryStore;
store=new RecoveryStore(repo,runId,{currentCompatibility:{engine:1,evidence:1,toolsDigest:'tools-v1',providerDigest:'provider-v1'},
 processEpoch:'test-daemon',assertProcessOwner:()=>{},assertOwner:()=>{},readEvidence:async()=>{throw Error('No source reads during recovery');},
 fault:phase=>{if(point==='receipt'&&armReceipt&&phase==='blob-directory-synced')crash();if(point==='terminal'&&phase==='event-synced'&&store.status().state==='completed')crash();}});
const view=store.replay(),lifecycle=createRepoLifecycle(repo);
const canonical=new ArtifactStore({repoPath:repo,history:lifecycle.history,journal:createFileJournal(repo),contexts:creationContextProvider(repo,{rootKinds:['CR']}),
 writeHead:(path,bytes)=>{if(point==='canonical-stage')crash();writeAtomic(path,bytes);if(point==='canonical-head')crash();}});
const context:CompletionValidationContext={subjectDigest:view.manifest.subjectDigest,policyDigest:view.manifest.policyDigest,compatibility:view.manifest.compatibility,
 build:{...view.basis.subject.build,meta:{authoredBy:'controller'}},reviewerParty:'daemon',expectationConflicts:[],assertFresh:async()=>{}};
let reads=0;
await completeInvestigationReview(store,leaseId,1,intentRef,context,{canonical,actor:{id:'insrc:daemon',kind:'agent',properties:{}},current:async()=>{
 reads++;if(point==='intent'&&reads===1)crash();if(reads===2)armReceipt=true;
 return {context,buildRecord:{meta:{revision:1},body:{commit:view.basis.subject.build.sourceCommit}}};
}});
throw Error(`Crash point ${point} was not reached.`);
