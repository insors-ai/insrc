import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveArtifactMdPath } from '../../../path-scheme.js';
import { artifactJsonPath } from '../../../storage.js';
import { prepareDesignSubject } from '../subject.js';
import { designCheckpointPath } from '../checkpoint.js';
import { DesignProgressTracker } from '../progress.js';
import type { DesignReviewCheckpoint, DesignAdmissionCheckpoint } from '../contracts.js';

export function designFixture(t:{after:(fn:()=>void)=>void},author:'controller'|'daemon'='controller'){
 const repo=mkdtempSync(join(tmpdir(),'design-review-'));t.after(()=>rmSync(repo,{recursive:true,force:true}));
 const hash='aaaaaaaaaaaaaaaa',id=`LLD-${hash}-s1`,time='2026-11-03T00:00:00.000Z';
 const json=artifactJsonPath(repo,id),md=resolveArtifactMdPath(repo,{epicHash:hash,epicCreatedAt:time,story:'s1'},'LLD','standalone','fixture');
 mkdirSync(dirname(json),{recursive:true});mkdirSync(dirname(md),{recursive:true});
 writeFileSync(json,JSON.stringify({meta:{epicHash:hash,storyId:'s1',epicCreatedAt:time,createdAt:time,epicSlug:'fixture',standalone:true,authoredBy:author},body:{summary:'Review scope',requirements:[{id:'r1',statement:'The feature works'}]},citations:[]}));
 writeFileSync(md,`<!-- insrc:artifact ${id} -->\n# LLD\n\n## Summary\nReview scope\n`);
 const prepared=prepareDesignSubject(repo,json),path=designCheckpointPath(repo,'review-1'),tracker=new DesignProgressTracker(path);
 const checkpoint:DesignReviewCheckpoint={schemaVersion:1,reviewId:'review-1',project:repo,artifactId:id,subject:prepared.subject,submitted:{artifactPath:json,attempt:1},attempts:[{number:1,status:'pending',baseline:prepared.baseline,inventory:prepared.inventory,completedChunks:[],progress:tracker.snapshot(),startedAt:time}]};
 return {repo,json,md,id,path,prepared,tracker,checkpoint};
}

export function admissionFixture(f: ReturnType<typeof designFixture>): DesignAdmissionCheckpoint {
 const time = '2026-11-09T00:00:00.000Z';
 return { schemaVersion: 2, project: f.repo, reviewId: 'review-1', attempts: [{
  phase: 'admission', validation: 'unverified', number: 1, reviewer: 'daemon', status: 'pending',
  operation: 'start', actionId: 'start-1', submitted: { artifactPath: f.json, attempt: 1 },
  acceptedAt: time, startedAt: time,
  progress: { phase: 'admission', totalChunks: 0, completedChunks: 0, checkpointPath: f.path, sequence: 0, observedAt: time, freshness: 'stored' },
 }] };
}
