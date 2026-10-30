/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema,CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Value } from '@sinclair/typebox/value';
import { scopedReviewToolCatalog } from '../shared/review-investigation-catalog.js';
export { scopedReviewToolCatalog,scopedReviewCatalogDigest } from '../shared/review-investigation-catalog.js';
import type { ScopedReviewBinding } from '../daemon/review-investigation-bridge.js';
import { compactToolError } from '../shared/review-investigation-compact.js';
import type { ReviewModelProtocol } from '../shared/review-investigation-compact.js';
/** Dedicated MCP server. Does not import/register the normal insrc tool surface or open databases. */
export function createScopedReviewMcpServer(binding:ScopedReviewBinding,indexed:boolean,forward:(command:unknown)=>Promise<unknown>,protocol:ReviewModelProtocol='bound-v1'){
 const catalog=scopedReviewToolCatalog(indexed,protocol),server=new Server({name:'insrc-scoped-review',version:'1'},{capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:catalog}));
 server.setRequestHandler(CallToolRequestSchema,async request=>{
  const tool=catalog.find(t=>t.name===request.params.name),args=request.params.arguments;
  if(!tool||!Value.Check(tool.inputSchema,args)||Buffer.byteLength(JSON.stringify(args))>1024*1024)return {isError:true,content:[{type:'text',text:protocol==='compact-v1'?JSON.stringify({code:'invalid-request',message:'Invalid compact review tool request.',hint:'Use the pinned tool schema without binding or sequence fields.',retryable:true}):'Invalid scoped review tool request.'}]};
  const {expiresAt:_,...common}=binding;
  const operation=tool.name==='review_read'?'read':tool.name==='review_impact'?'impact':tool.name==='review_progress'?'progress':'reply';
  try{const value=await forward({...common,...(protocol==='compact-v1'?{protocol}:{}),operation,...args});return {content:[{type:'text',text:JSON.stringify(value)}]};}
  catch(cause){return {isError:true,content:[{type:'text',text:protocol==='compact-v1'?JSON.stringify(compactToolError(cause,args)):'Scoped review operation refused.'}]};}
 });
 return server;
}
