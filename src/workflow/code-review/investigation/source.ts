/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isInvestigationRuntimePath } from '../../../shared/review-runtime-paths.js';
import { TextDecoder } from 'node:util';
import { hashBytes } from '../../../design/corpus/canonical.js';
import { treeEntry } from '../../../design/corpus/sources/git-reader.js';
import { ReviewGitReader, assertOid, assertRepoPath } from './git-packets.js';
import { identifySubject, snapshotValue, freezeValue, digestValue } from './identity.js';
import { SUBJECT_LIMITS, SubjectPreparationError } from './types.js';
import type { ReviewSubjectV1, ReviewReadReceiptV1 } from './types.js';
import type { SubjectPreparationDeps } from './subject.js';

export interface SourceReadLimits { readonly bytes?: number | undefined; readonly lines?: number | undefined; }
export type ReviewSourceReference =
 | { readonly kind: 'blob'; readonly oid: string; readonly start: number; readonly end: number }
 | { readonly kind: 'context'; readonly path: string; readonly start: number; readonly end: number }
 | { readonly kind: 'artifact'; readonly artifactId: string; readonly start: number; readonly end: number };
/** JSON references are data, never shell/Git revision expressions. A block blob and a context path are distinct roles. */
export function sourceReference(reference: ReviewSourceReference): string {
 return JSON.stringify(snapshotValue(reference));
}
function parseReference(value: string): ReviewSourceReference {
 let ref: unknown;
 try { ref = JSON.parse(value); } catch (cause) { throw new SubjectPreparationError('invalid-input', 'Malformed source reference.', { cause }); }
 if (!ref || typeof ref !== 'object' || Array.isArray(ref)) throw new SubjectPreparationError('invalid-input', 'Invalid source reference.');
 const r = ref as Record<string, unknown>;
 const key = r['kind'] === 'blob' ? 'oid' : r['kind'] === 'context' ? 'path' : r['kind'] === 'artifact' ? 'artifactId' : null;
 if (!key || Object.keys(r).sort().join(',') !== [key,'kind','start','end'].sort().join(',') || typeof r[key] !== 'string'
  || !Number.isSafeInteger(r['start']) || !Number.isSafeInteger(r['end']) || (r['start'] as number) < 1 || (r['end'] as number) < (r['start'] as number)) {
  throw new SubjectPreparationError('invalid-input', 'Reference requires a known kind and finite inclusive line range.');
 }
 return r as unknown as ReviewSourceReference;
}
async function contextBlob(reader: ReviewGitReader, subject: ReviewSubjectV1, path: string): Promise<string> {
 assertRepoPath(path); if(isInvestigationRuntimePath(path))throw new SubjectPreparationError('invalid-input','Private review runtime is not source context.'); const segments = path.split('/');
 if (segments.length > 64) throw new SubjectPreparationError('resource-limit', 'Context path is too deep.');
 let tree = subject.contextTree;
 for (const [index, name] of segments.entries()) {
  let entry: { mode: string; oid: string };
  try { entry = treeEntry(await reader.object(tree,'tree'),name,tree.length/2); }
  catch (cause) {
   if (cause instanceof SubjectPreparationError) throw cause;
   throw new SubjectPreparationError('invalid-object','Pinned context path is unavailable.',{cause});
  }
  if (index < segments.length-1) {
   if (entry.mode !== '40000') throw new SubjectPreparationError('unsupported-change','Context parent must be a Git tree.');
   tree=entry.oid;
  } else {
   if (!['100644','100755'].includes(entry.mode)) throw new SubjectPreparationError('unsupported-change','Only regular pinned context files are readable.');
   return entry.oid;
  }
 }
 throw new SubjectPreparationError('invalid-input','Empty context reference.');
}

/** Trusted read receipt, not a coverage judgment. Reads cannot promote context to changed scope. */
export async function readReviewSource(subjectInput: ReviewSubjectV1, reference: string, limits: SourceReadLimits, deps: SubjectPreparationDeps): Promise<ReviewReadReceiptV1> {
 const subject=snapshotValue(subjectInput), {subjectId,subjectDigest,...projection}=subject;
 const expected=identifySubject(projection);
 if (subjectId!==expected.subjectId || subjectDigest!==expected.subjectDigest) throw new SubjectPreparationError('stale-contract','Subject digest mismatch.');
 const ref=parseReference(reference), byteLimit=limits.bytes??SUBJECT_LIMITS.sourceBytes, lineLimit=limits.lines??SUBJECT_LIMITS.sourceLines;
 if (![byteLimit,lineLimit].every(v=>Number.isSafeInteger(v)&&v>0) || byteLimit>SUBJECT_LIMITS.sourceBytes || lineLimit>SUBJECT_LIMITS.sourceLines) {
  throw new SubjectPreparationError('invalid-input','Read limits may only lower positive hard bounds.');
 }
 const reader=new ReviewGitReader(deps.repoPath,deps.runGit);
 let bytes: Uint8Array, contentRef: string;
 if (ref.kind==='artifact') {
  const pin=subject.contracts.find(a=>a.artifactId===ref.artifactId);
  if (!pin) throw new SubjectPreparationError('invalid-input','Artifact reference is outside the subject.');
  const work=await deps.readWork({repoId:subject.repoId,rootArtifactId:subject.rootArtifactId,storyId:subject.storyId,buildArtifactId:subject.build.artifactId,selections:[]});
  const actual=work.contracts.find(a=>a.artifactId===pin.artifactId);
  if (!actual || digestValue(actual)!==digestValue(pin) || typeof work.contractText[pin.artifactId]!=='string') throw new SubjectPreparationError('stale-contract','Pinned artifact changed.');
  await deps.assertFresh(work);
  bytes=Buffer.from(work.contractText[pin.artifactId]!,'utf8'); contentRef=`artifact:${pin.artifactId}@${pin.revision}#${pin.contentDigest}`;
 } else {
  const oid=ref.kind==='blob'?ref.oid:await contextBlob(reader,subject,ref.path);
  assertOid(oid);
  if (ref.kind==='blob' && !subject.packets.some(p=>p.blocks.some(b=>b.oldBlob===oid||b.newBlob===oid))) throw new SubjectPreparationError('invalid-input','Blob is not selected changed scope; use a pinned context path for context.');
  bytes=await reader.object(oid,'blob'); contentRef=`git-blob:${oid}`;
 }
 const sourceDigest=hashBytes(bytes);
 const result=(text:string|null,lines:readonly[number,number]|null,completeness:ReviewReadReceiptV1['completeness'],limitations:readonly string[]):ReviewReadReceiptV1=>freezeValue({reference,sourceDigest,contentRef,text,lines,completeness,limitations});
 if (bytes.includes(0)) return result(null,null,'unavailable',['Binary source; textual line navigation unavailable.']);
 let text:string;
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return result(null,null,'unavailable',['Source is not UTF-8 text.']);}
 const all=text.split('\n');if(text.endsWith('\n')||text==='')all.pop();
 const end=Math.min(ref.end,ref.start+lineLimit-1,all.length), selected:string[]=[];let used=0;
 for(let line=ref.start;line<=end;line++){
  const entry=all[line-1]!+(line<all.length||text.endsWith('\n')?'\n':'');const size=Buffer.byteLength(entry);
  if(used+size>byteLimit)break;selected.push(entry);used+=size;
 }
 const actualEnd=ref.start+selected.length-1;
 const complete=actualEnd===ref.end || (all.length===0 && ref.start===1);
 const limitations=complete?[]:[`Requested lines ${ref.start}-${ref.end}; bounded by available source, ${lineLimit} lines and ${byteLimit} bytes.`];
 return result(selected.join(''),selected.length?[ref.start,actualEnd]:null,complete?'complete':'partial',limitations);
}
