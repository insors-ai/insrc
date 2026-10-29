/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { randomUUID } from 'node:crypto';
import type { RecoveryStore } from '../recovery-store.js';
import { foldRecoveryLifecycle } from '../recovery-lifecycle.js';
import { ledgerDigest } from '../ledger-identity.js';
/** Low-level event fixture; the public callback surface is added by the later task. */
export async function acceptPublication(store:RecoveryStore,leaseId:string,generation:number,intentRef:string,checkpointDigest:string){
 return store.journal.exclusive(()=>{
  const v=store.replay();store.assertLease(v,leaseId,generation);const intent=store.journal.read(intentRef);
  const payload={version:1,leaseId,wallMs:Date.now(),intentRef,intentDigest:ledgerDigest(intent),checkpointDigest};const staged=store.journal.stage(payload);
  const input={eventId:randomUUID(),generation,kind:'publication-intent' as const,subjectDigest:v.manifest.subjectDigest,policyDigest:v.manifest.policyDigest,payloadRef:staged.reference};
  const event={...input,version:1 as const,ordinal:v.eventOrdinal+1,previousDigest:v.eventDigest,runId:v.manifest.runId,digest:'candidate'};
  foldRecoveryLifecycle(v,event,payload,r=>store.journal.read(r));store.journal.append(input);return store.replay();
 });
}
