/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import { InvestigationProgressSchema,InvestigationReplySchema } from './review-investigation.js';
import { digestValue } from '../workflow/code-review/investigation/identity.js';
const object=<T extends Record<string,import('@sinclair/typebox').TSchema>>(properties:T)=>Type.Object(properties,{additionalProperties:false});
/** The complete effective catalogue, also included in native budget/qualification digests. */
export function scopedReviewToolCatalog(indexed:boolean){
 return [
  {name:'review_read',description:'Read bounded pinned source, approved artifact or verified test evidence.',inputSchema:object({reference:Type.String({minLength:1,maxLength:4096})})},
  ...(indexed?[{name:'review_impact',description:'Discover callers of a qualified selected entity; partial results are not no-impact proof.',inputSchema:object({entityRef:Type.String({minLength:1,maxLength:4096})})}]:[]),
  {name:'review_progress',description:'Validate and durably checkpoint a block before acknowledgement.',inputSchema:object({progress:InvestigationProgressSchema})},
  {name:'review_reply',description:'Finish using accepted checkpoint receipts only; no new findings or coverage deltas.',inputSchema:object({reply:InvestigationReplySchema})}
 ];
}
/** Hash the actual JSON wire catalogue, excluding TypeBox's in-process symbol annotations. */
export const scopedReviewCatalogDigest=(indexed:boolean)=>digestValue(JSON.parse(JSON.stringify(scopedReviewToolCatalog(indexed))));
