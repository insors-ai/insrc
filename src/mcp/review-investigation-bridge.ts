/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema,CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Value } from '@sinclair/typebox/value';
import { scopedReviewToolCatalog } from '../shared/review-investigation-catalog.js';
export { scopedReviewToolCatalog,scopedReviewCatalogDigest } from '../shared/review-investigation-catalog.js';
import type { ScopedReviewBinding } from '../daemon/review-investigation-bridge.js';
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
