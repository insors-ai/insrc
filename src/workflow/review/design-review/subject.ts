/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { constants, openSync, closeSync, fstatSync, readSync, realpathSync, existsSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { ArtifactIds } from '../../artifact-ids.js';
import { decodeArtifactHead } from '../../artifact-core/decode.js';
import { approvalStateOf } from '../../artifact-core/approval-view.js';
import { resolveDocsMarkdown } from '../../artifact-content.js';
import { artifactJsonPath, ARTIFACT_ID_MARKER_RE, readEpicDefinitionCore, resolveEpicAnchor } from '../../storage.js';
import { resolveArtifactMdPath } from '../../path-scheme.js';
import type { ArtifactKind } from '../../path-scheme.js';
import { authorPartyOf, otherParty } from '../party.js';
import { DESIGN_LIMITS, DesignInventorySchema, DesignSubjectSchema, DesignReviewContextError, DesignReviewError, decodeDesign, requireDesign } from './contracts.js';
import type { DesignBaseline, DesignReviewInventory, DesignReviewSubject, DesignWorkflowContext } from './contracts.js';

interface Head { meta: Record<string, unknown>; body: Record<string, unknown>; citations?: unknown[] | undefined; }
export interface PreparedDesignSubject { subject: DesignReviewSubject; baseline: DesignBaseline; inventory: DesignReviewInventory; }
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
function context(condition: unknown, message: string): asserts condition {
 if (!condition) throw new DesignReviewContextError(message);
}
function inside(root: string, path: string): boolean {
 const rel = relative(root, path);
 return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}
/** Bound the opened file, not a prior stat result; never follow a leaf symlink. */
export function readDesignFile(project: string, path: string): string {
 context(inside(project, path) && realpathSync(path) === path, `Noncanonical or escaping artifact path: ${path}`);
 const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
 try {
  const stat = fstatSync(fd);
  context(stat.isFile() && stat.size <= DESIGN_LIMITS.subjectBytes, `Artifact file exceeds limit or is not regular: ${path}`);
  const buffer = Buffer.alloc(stat.size + 1);
  let size = 0;
  while (size < buffer.length) {
   const n = readSync(fd, buffer, size, buffer.length - size, null);
   if (n === 0) break;
   size += n;
  }
  context(size <= stat.size, `Artifact changed while reading: ${path}`);
  return buffer.subarray(0, size).toString('utf8');
 } finally { closeSync(fd); }
}
function headAt(project: string, id: string): { head: Head; raw: string; path: string } {
 const key = ArtifactIds.parse(id);
 context(key, `Invalid artifact identity: ${id}`);
 const path = artifactJsonPath(project, id), raw = readDesignFile(project, path);
 const head = decodeArtifactHead(id, raw).head as unknown as Head;
 const declaredHash = key.kind === 'SPEC' ? head.meta['specHash'] : key.kind === 'ISSUE' ? head.meta['issueHash'] : head.meta['epicHash'];
 context(declaredHash === undefined || declaredHash === key.epicHash, `Artifact hash disagrees with ${id}`);
 context(head.meta['storyId'] === undefined || head.meta['storyId'] === key.story, `Story identity disagrees with ${id}`);
 return { head, raw, path };
}
function documentFor(project: string, id: string, head: Head): string {
 const key = ArtifactIds.parse(id)!;
 const root = readEpicDefinitionCore(project, key.epicHash);
 const anchor = typeof head.meta['epicCreatedAt'] === 'string' ? head.meta['epicCreatedAt'] : resolveEpicAnchor(project, key.epicHash);
 context(anchor, `No canonical work-item anchor for ${id}`);
 const standalone = key.kind === 'SPEC' || head.meta['standalone'] === true || root.standalone === true || root.headKind === 'ISSUE' || root.headKind === 'LLD';
 const slug = typeof head.meta['epicSlug'] === 'string' ? head.meta['epicSlug'] : root.epicSlug ?? key.epicHash;
 const path = resolveArtifactMdPath(project, { epicHash: key.epicHash, epicCreatedAt: anchor, ...(key.story ? { story: key.story } : {}) }, key.kind as ArtifactKind, standalone ? 'standalone' : 'epic', slug);
 const bounded = resolveDocsMarkdown(project, path);
 context('realPath' in bounded, `Missing canonical document for ${id}: ${path}`);
 const raw = readDesignFile(project, bounded.realPath);
 context(ARTIFACT_ID_MARKER_RE.exec(raw)?.[1] === id, `Document marker does not match ${id}`);
 return bounded.realPath;
}
function explicitIssueIds(head: Head): string[] {
 const envelope = head.meta['envelope'] as { parent?: {entityId?: string}; references?: {entityId?: string; relation?: string}[] } | undefined;
 const result: string[] = [];
 const hash = head.meta['issueHash'];
 if (typeof hash === 'string') result.push(ArtifactIds.make({kind:'ISSUE',epicHash:hash}));
 if (envelope?.parent?.entityId?.startsWith('ISSUE-')) result.push(envelope.parent.entityId);
 for (const ref of envelope?.references ?? []) if (ref.relation === 'derived-from' && ref.entityId?.startsWith('ISSUE-')) result.push(ref.entityId);
 return [...new Set(result)];
}
function workflowFor(project: string, id: string, head: Head): DesignWorkflowContext {
 const key = ArtifactIds.parse(id)!;
 const defId = ArtifactIds.make({kind:'DEF',epicHash:key.epicHash}), issueId = ArtifactIds.make({kind:'ISSUE',epicHash:key.epicHash});
 const hasDef = existsSync(artifactJsonPath(project,defId)), hasIssue = existsSync(artifactJsonPath(project,issueId));
 // Unlike the display helper's best-effort fallback, malformed present roots must not change review requirements.
 if (hasDef) headAt(project,defId);
 if (hasIssue) headAt(project,issueId);
 context(!(hasDef && hasIssue), 'Conflicting DEF and ISSUE roots require explicit reconciliation');
 const provenance = explicitIssueIds(head);
 context(provenance.length <= 1, 'Conflicting originating ISSUE references');
 const originatingIssue = provenance[0] ?? (hasIssue ? issueId : undefined);
 context(!hasDef || !originatingIssue, 'Epic root conflicts with originating ISSUE provenance');
 const root = readEpicDefinitionCore(project,key.epicHash);
 let kind: DesignWorkflowContext['kind'];
 if (key.kind === 'DEF' || key.kind === 'HLD' || hasDef) kind = 'epic';
 else if (originatingIssue) kind = 'issue';
 else {
  context(head.meta['standalone'] !== false && head.meta['sizeClass'] !== 'bugfix', 'Missing Epic/ISSUE provenance; cannot downgrade to standalone');
  context(root.headKind === 'LLD', 'No canonical standalone LLD root');
  kind = 'standalone';
 }
 const requiredReferences: DesignWorkflowContext['requiredReferences'] = [];
 const availableReferences: DesignWorkflowContext['availableReferences'] = [];
 function required(role: string, targetId: string): Head {
  const loaded = headAt(project,targetId);
  context(approvalStateOf(loaded.head.meta) === 'approved', `Required ${role} is not approved: ${targetId}`);
  requiredReferences.push({ role, artifactId:targetId, path:documentFor(project,targetId,loaded.head) });
  return loaded.head;
 }
 let scopeHead = head;
 if (kind === 'epic' && key.kind !== 'DEF') {
  scopeHead = required('definition',defId);
  if (key.kind === 'LLD') {
   context(Array.isArray(scopeHead.body['stories']) && scopeHead.body['stories'].some((s: {id?: string})=>s?.id === key.story), `Story ${key.story} missing from DEF`);
   required('hld',ArtifactIds.make({kind:'HLD',epicHash:key.epicHash}));
  }
 }
 if (kind === 'issue') scopeHead = required('originating_issue',originatingIssue!);
 const seeds = new Set<string>();
 for (const source of [head,scopeHead]) {
  const seed = source.meta['seededFromSpec'];
  if (typeof seed === 'string') seeds.add(seed.startsWith('SPEC-') ? seed : ArtifactIds.make({kind:'SPEC',epicHash:seed}));
  const envelope = source.meta['envelope'] as { references?: {entityId?: string; relation?: string}[] } | undefined;
  for (const ref of envelope?.references ?? []) if (ref.relation === 'derived-from' && ref.entityId?.startsWith('SPEC-')) seeds.add(ref.entityId);
 }
 for (const seed of seeds) required('seed_spec',seed);
 // Correction targets and other available references remain context, never new workflow ancestors.
 for (const source of [head,scopeHead]) {
  const envelope = source.meta['envelope'] as {references?: {entityId?: string}[]; parent?: {entityId?: string}} | undefined;
  const references = [...(envelope?.references ?? []), ...(envelope?.parent ? [envelope.parent] : [])];
  for (const ref of references) {
   const targetId = ref.entityId;
   if (!targetId || !ArtifactIds.parse(targetId) || requiredReferences.some(r=>r.artifactId === targetId) || targetId === id) continue;
   try { const loaded=headAt(project,targetId); const path=documentFor(project,targetId,loaded.head); if(!availableReferences.some(r=>r.path===path)) availableReferences.push({role:'context',path}); }
   catch { /* Optional unavailable context is not a fabricated required ancestor. */ }
  }
 }
 return { kind, rootArtifactId:kind==='epic'?defId:kind==='issue'?originatingIssue!:id,
  requiredReferences, availableReferences,
  notApplicableRoles: ['PLAN','TASKS','BUILD','CR',...(kind==='epic'?[]:['DEF','HLD','sibling_stories'])],
 };
}
const pointer = (value: string) => value.replace(/~/g,'~0').replace(/\//g,'~1');
export function designInventory(head: Head, markdown: string): DesignReviewInventory {
 const units: DesignReviewInventory['units'] = [];
 const seen = new Set<string>();
 function add(selector: string, title: string, kind: DesignReviewInventory['units'][number]['kind']): void {
  if (!seen.has(selector)) { seen.add(selector); units.push({id:selector,selector,title,kind}); }
 }
 for (const key of Object.keys(head.body)) add(`/body/${pointer(key)}`,key,/Definition|companions|adherence/.test(key)?'visual':'section');
 function identified(value: unknown, selector: string): void {
  if (Array.isArray(value)) value.forEach((row,i)=>{
   const p=`${selector}/${i}`;
   if (row && typeof row==='object' && 'id' in row && typeof row.id==='string') add(p,row.id,selector.includes('stories')?'story':selector.toLowerCase().includes('contract')?'contract':'requirement');
   identified(row,p);
  });
  else if(value && typeof value==='object') for(const [key,row] of Object.entries(value)) identified(row,`${selector}/${pointer(key)}`);
 }
 identified(head.body,'/body');
 (head.citations??[]).forEach((_row,i)=>add(`/citations/${i}`,`Citation ${i+1}`,'citation'));
 const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z]/g,'');
 markdown.split('\n').forEach((line,i)=>{
  const heading=/^##\s+(.+)$/.exec(line)?.[1];
  if(heading&&!['contents','references','citations'].includes(normalize(heading))&&!Object.keys(head.body).some(k=>normalize(k)===normalize(heading)))add(`document:line:${i+1}`,heading,'section');
 });
 return decodeDesign(DesignInventorySchema,{units});
}
/** Filesystem-only preparation; the daemon RPC owns repo registration and all DB access. */
export function prepareDesignSubject(repo: string, artifactPath: string): PreparedDesignSubject {
 try {
  const project=realpathSync(repo), supplied=resolve(project,artifactPath);
  let id: string | undefined, suppliedDocument: string | undefined;
  if(supplied.endsWith('.md')) {
   const safe=resolveDocsMarkdown(project,supplied);context('realPath' in safe,'Invalid design document path');
   suppliedDocument=safe.realPath;id=ARTIFACT_ID_MARKER_RE.exec(readDesignFile(project,suppliedDocument))?.[1];
  } else if(supplied.endsWith('.json')&&inside(join(project,'.insrc/artifacts'),supplied)) id=basename(supplied,'.json');
  context(id,'Expected canonical artifact JSON or marked docs markdown');
  const key=ArtifactIds.parse(id);context(key,'Invalid design artifact id');
  requireDesign(['DEF','HLD','LLD'].includes(key.kind),'design_review_not_applicable','Design review applies only to an existing DEF, HLD or LLD');
  const loaded=headAt(project,id);context(suppliedDocument!==undefined||supplied===loaded.path,'Noncanonical artifact JSON path');
  const workflow=workflowFor(project,id,loaded.head), documentPath=documentFor(project,id,loaded.head);
  context(!suppliedDocument||suppliedDocument===documentPath,'Document is not the canonical representation of this subject');
  const document=readDesignFile(project,documentPath), author=authorPartyOf(loaded.head.meta);
  context(author!=='unknown','Artifact author party is unknown');
  const subject=decodeDesign(DesignSubjectSchema,{project,artifactId:id,kind:key.kind,canonicalPath:loaded.path,documentPath,reviewer:otherParty(author),workflow});
  const baseline: DesignBaseline={subjectFingerprints:{canonical:sha(loaded.raw),document:sha(document)},contentIdentity:sha(`${loaded.raw}\0${document}`),reviewedContent:{canonical:loaded.raw,document},capturedAt:new Date().toISOString()};
  const inventory=designInventory(loaded.head,document);
  assertDesignSubjectUnchanged(subject,baseline);
  return {subject,baseline,inventory};
 } catch(error) {
  if(error instanceof DesignReviewError) throw error;
  throw new DesignReviewContextError(error instanceof Error?error.message:'Unable to resolve design context');
 }
}
export function assertDesignSubjectUnchanged(subject: DesignReviewSubject, baseline: DesignBaseline, owned?: {canonicalBefore?:string|undefined;canonicalAfter?:string|undefined}): void {
 try {
  const current={canonical:sha(readDesignFile(subject.project,subject.canonicalPath)),document:sha(readDesignFile(subject.project,subject.documentPath))};
  const own=owned?.canonicalBefore===baseline.subjectFingerprints.canonical&&owned?.canonicalAfter===current.canonical;
  requireDesign((current.canonical===baseline.subjectFingerprints.canonical||own)&&current.document===baseline.subjectFingerprints.document,'artifact_changed','Reviewed artifact changed; a user-approved full restart is required');
 } catch(error) {
  if(error instanceof DesignReviewError&&error.code==='artifact_changed')throw error;
  throw new DesignReviewError('artifact_changed','Reviewed artifact is no longer readable or canonical');
 }
}
