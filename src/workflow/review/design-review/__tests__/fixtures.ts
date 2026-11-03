import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveArtifactMdPath } from '../../../path-scheme.js';
import { artifactJsonPath } from '../../../storage.js';
import { prepareDesignSubject } from '../subject.js';
import { designCheckpointPath } from '../checkpoint.js';
import { DesignProgressTracker } from '../progress.js';
import type { DesignReviewCheckpoint } from '../contracts.js';

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
