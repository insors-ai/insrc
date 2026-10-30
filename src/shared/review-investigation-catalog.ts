/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import { InvestigationProgressSchema,InvestigationReplySchema } from './review-investigation.js';
import { digestValue } from '../workflow/code-review/investigation/identity.js';
import { CompactReadSchema, CompactProgressSchema, CompactReplySchema } from './review-investigation-compact.js';
import type { ReviewModelProtocol } from './review-investigation-compact.js';
const object=<T extends Record<string,import('@sinclair/typebox').TSchema>>(properties:T)=>Type.Object(properties,{additionalProperties:false});
/** The complete effective catalogue, also included in native budget/qualification digests. */
export function scopedReviewToolCatalog(indexed:boolean,protocol:ReviewModelProtocol='bound-v1'){
 if(protocol!=='bound-v1'&&protocol!=='compact-v1')throw Error('Unsupported review model protocol');
 if(protocol==='compact-v1')return [
  {name:'review_read',description:'Read a displayed changed span, pinned context, artifact or test. An absent changed side has no evidence; use context for surrounding code.',inputSchema:CompactReadSchema},
  ...(indexed?[{name:'review_impact',description:'Discover pinned callers of a changed entity; partial or empty results do not prove no impact.',inputSchema:object({entityRef:Type.String({minLength:1,maxLength:4096})})}]:[]),
  {name:'review_progress',description:'Assess explicit expectation members and durably checkpoint this block before changing focus. Evidence and expectation aliases come from the host; finding references are zero-based indexes in this request.',inputSchema:object({progress:CompactProgressSchema})},
  {name:'review_reply',description:'Finish or yield using accepted progress only. Unresolved work pauses; CLI output is only an acknowledgement.',inputSchema:object({reply:CompactReplySchema})}
 ];
 return [
  {name:'review_read',description:'Read bounded pinned source, approved artifact or verified test evidence.',inputSchema:object({reference:Type.String({minLength:1,maxLength:4096})})},
  ...(indexed?[{name:'review_impact',description:'Discover callers of a qualified selected entity. Returns evidence and accepted progress/coverage identities; unavailable or partial results are not no-impact proof.',inputSchema:object({entityRef:Type.String({minLength:1,maxLength:4096})})}]:[]),
  {name:'review_progress',description:'Validate and durably checkpoint a block before acknowledgement.',inputSchema:object({progress:InvestigationProgressSchema})},
  {name:'review_reply',description:'Finish using accepted checkpoint receipts only; no new findings or coverage deltas.',inputSchema:object({reply:InvestigationReplySchema})}
 ];
}
/** Hash the actual JSON wire catalogue, excluding TypeBox's in-process symbol annotations. */
export const scopedReviewCatalogDigest=(indexed:boolean,protocol:ReviewModelProtocol='bound-v1')=>digestValue(JSON.parse(JSON.stringify(scopedReviewToolCatalog(indexed,protocol))));
