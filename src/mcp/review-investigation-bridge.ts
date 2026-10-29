/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema,CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { InvestigationProgressSchema,InvestigationReplySchema } from '../shared/review-investigation.js';
import { digestValue } from '../workflow/code-review/investigation/identity.js';
import type { ScopedReviewBinding } from '../daemon/review-investigation-bridge.js';
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
export const scopedReviewCatalogDigest=(indexed:boolean)=>digestValue(scopedReviewToolCatalog(indexed));
/** Dedicated MCP server. Does not import/register the normal insrc tool surface or open databases. */
export function createScopedReviewMcpServer(binding:ScopedReviewBinding,indexed:boolean,forward:(command:unknown)=>Promise<unknown>){
 const catalog=scopedReviewToolCatalog(indexed),server=new Server({name:'insrc-scoped-review',version:'1'},{capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:catalog}));
 server.setRequestHandler(CallToolRequestSchema,async request=>{
  const tool=catalog.find(t=>t.name===request.params.name),args=request.params.arguments;
  if(!tool||!Value.Check(tool.inputSchema,args)||Buffer.byteLength(JSON.stringify(args))>1024*1024)return {isError:true,content:[{type:'text',text:'Invalid scoped review tool request.'}]};
  const {expiresAt:_,...common}=binding;
  const operation=tool.name==='review_read'?'read':tool.name==='review_impact'?'impact':tool.name==='review_progress'?'progress':'reply';
  try{const value=await forward({...common,operation,...args});return {content:[{type:'text',text:JSON.stringify(value)}]};}
  catch{return {isError:true,content:[{type:'text',text:'Scoped review operation refused.'}]};}
 });
 return server;
}
