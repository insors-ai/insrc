/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export function recoveryDirectory() {
 const repo = mkdtempSync(join(tmpdir(), 'insrc-recovery-'));
 return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}
import { twoBlockFixture } from './continuation-fixtures.js';
import { RecoveryStore } from '../recovery-store.js';
import type { RecoveryManifest } from '../recovery-types.js';
export function recoveryFixture(){
 const d=recoveryDirectory(),f=twoBlockFixture();
 const manifest:RecoveryManifest={version:1,runId:f.basis.runId,subjectDigest:f.basis.subject.subjectDigest,policyDigest:f.context.policy.digest,basis:f.basis,initial:f.context.state,policy:f.context.policy,compatibility:{engine:1,evidence:1,toolsDigest:'tools-v1',providerDigest:'provider-v1'},receipts:[]};
 const options={assertProcessOwner:()=>{},assertOwner:()=>{},readEvidence:f.context.ports.readEvidence};
 const store=new RecoveryStore(d.repo,manifest.runId,options);
 return {...d,...f,manifest,store,options};
}
