import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ArtifactIds } from '../../../../artifact-ids.js';
import { emptyLifecycle } from '../../../../artifact-core/decode.js';
import { resolveArtifactMdPath } from '../../../../path-scheme.js';
import type { ArtifactKind } from '../../../../path-scheme.js';
import { artifactJsonPath } from '../../../../storage.js';
export const hash='aaaaaaaaaaaaaaaa',other='bbbbbbbbbbbbbbbb',time='2026-11-03T00:00:00.000Z';
export function subjectFixture(t: {after: (fn:()=>void)=>void}) {
 const repo=mkdtempSync(join(tmpdir(),'design-subject-'));t.after(()=>rmSync(repo,{recursive:true,force:true}));
 function put(kind: 'DEF'|'HLD'|'LLD'|'ISSUE'|'SPEC', body: Record<string,unknown>={summary:'Scope'}, meta: Record<string,unknown>={}, h=hash) {
  const id=ArtifactIds.make({kind,epicHash:h,...(kind==='LLD'?{story:'s1'}:{})});
  const standalone=meta['standalone']===true||kind==='ISSUE'||kind==='SPEC';
  const m={workflow:kind==='DEF'?'define':kind==='HLD'?'design.epic':kind==='LLD'?'design.story':kind==='ISSUE'?'issue':'brainstorm',
   [kind==='ISSUE'?'issueHash':kind==='SPEC'?'specHash':'epicHash']:h,
   ...(kind==='LLD'?{storyId:'s1'}:{}),epicCreatedAt:time,createdAt:time,epicSlug:'context',authoredBy:'controller',
   lifecycle:{...emptyLifecycle(1),status:'approved'},...meta};
  const json=artifactJsonPath(repo,id),md=resolveArtifactMdPath(repo,{epicHash:h,epicCreatedAt:time,...(kind==='LLD'?{story:'s1'}:{})},kind as ArtifactKind,standalone?'standalone':'epic','context');
  mkdirSync(dirname(json),{recursive:true});mkdirSync(dirname(md),{recursive:true});
  writeFileSync(json,JSON.stringify({meta:m,body,citations:[{id:'c1',kind:'stakeholder',ref:'Scope'}]}));
  writeFileSync(md,`<!-- insrc:artifact ${id} -->\n# ${kind}\n\n## Summary\nScope\n\n## Document-only concern\nImportant requirement\n`);
  return {id,json,md};
 }
 return {repo,put};
}

