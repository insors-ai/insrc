/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitEnvironment } from '../../../../design/corpus/sources/git-reader.js';
import { ReviewGitReader, readCommitPacket } from '../git-packets.js';
import { readApprovedWork } from '../work.js';
import type { VerifiedWorkInputs, VerifiedWorkArtifact } from '../work.js';
import type { PrepareReviewRequest, ScopeAttestation } from '../types.js';
export function fixture() {
 const dir = mkdtempSync(join(tmpdir(), 'review-packets-'));
 const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env: { ...gitEnvironment(), GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' }, encoding: 'utf8' }).trim();
 git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
 const write = (path: string, value: string | Uint8Array) => writeFileSync(join(dir, path), value);
 const commit = () => { git('add', '--all'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
 return { dir, git, write, commit, close: () => rmSync(dir, { recursive: true, force: true }) };
}

export async function subjectFixture() {
 const f = fixture(); f.write('a.txt', 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n'); const parent = f.commit();
 f.write('a.txt','ONE\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nTEN\n'); const commit = f.commit();
 const request: PrepareReviewRequest = { repoId: 'repo', rootArtifactId: 'DEF-root', storyId: 's1', buildArtifactId: 'BUILD-root-s1',
  selections: [{commitId:commit,parentId:parent,attestationRef:'scope-1'}] };
 const artifact = (id: string): VerifiedWorkArtifact => ({ artifactId:id,path:`docs/${id}.md`,revision:1,contentDigest:'a'.repeat(64),repoId:'repo',rootArtifactId:'DEF-root',storyId:'s1',status:'approved',approvedRevision:1,body:{},text:'approved text' });
 const plan = {...artifact('PLAN-root-s1'),body:{tasks:[{id:'t1',title:'Title',summary:'Detailed summary',order:1,dependsOn:[],acceptanceChecks:['check one','check two']} ]}};
 const inputs: VerifiedWorkInputs = {build:{artifactId:request.buildArtifactId,revision:1,sourceCommit:commit,repoId:'repo',rootArtifactId:'DEF-root',storyId:'s1'},route:'planned',plan,upstream:[artifact('LLD-root-s1')]};
 const packet = await readCommitPacket(new ReviewGitReader(f.dir),commit,parent);
 const proof: ScopeAttestation={ref:'scope-1',commitId:commit,parentId:parent,rootArtifactId:'DEF-root',storyId:'s1',buildArtifactId:request.buildArtifactId,sourceCommit:commit,exclusive:false,blockIds:[packet.blocks[0]!.blockId]};
 let current=inputs, attestation=proof;
 const deps={repoPath:f.dir, readWork:(r:PrepareReviewRequest)=>readApprovedWork(r,{readVerifiedInputs:async()=>current}),readAttestation:async()=>attestation,assertFresh:async()=>{}};
 return {...f, request, inputs, packet, deps, proof, commitId:commit,parentId:parent,setInputs:(v:VerifiedWorkInputs)=>{current=v;},setProof:(v:ScopeAttestation)=>{attestation=v;}};
}

