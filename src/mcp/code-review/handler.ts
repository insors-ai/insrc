import { createPersistentIpcClient } from '../../shared/ipc-client.js';
import type { Socket } from 'node:net';
import type { StepClient } from '../../shared/step-context.js';
import type { StepMcpEnvelope } from '../forward-step.js';
import { errorEnvelope } from '../forward-step.js';
import { resolveRepoPath } from '../resolve-repo.js';

/** One MCP session owns separate persistent connections for independent review ids. */
export class CodeReviewConnections {
 private readonly owners = new Map<string, ReturnType<typeof createPersistentIpcClient>>();
 constructor(private readonly deps: {connect?: (()=>Socket) | undefined; resolveRepo?: ((repo:string|undefined)=>Promise<string|undefined>) | undefined} = {}) {}
 close():void{for(const owner of this.owners.values())owner.close();this.owners.clear();}
 async call(raw:Record<string,unknown>, client:StepClient|undefined, signal?:AbortSignal):Promise<StepMcpEnvelope>{
  const repo=await(this.deps.resolveRepo??resolveRepoPath)(typeof raw['repo']==='string'?raw['repo']:undefined);
  if(!repo)return errorEnvelope('no-repo','TaskReviewInputError','Review requires a project path',false);
  const args={...raw,repo},key=JSON.stringify([repo,raw['reviewId']]);
  let owner=this.owners.get(key);
  if(!owner){owner=createPersistentIpcClient(this.deps.connect);this.owners.set(key,owner);}
  try{
   const response=await owner.call<StepMcpEnvelope>('step.call',{tool:'insrc_code_review_step',args,context:{cwd:repo,envRepo:repo,...(client?{client}:{})}},{stream:true,signal});
   // Terminal feedback is durable; a later continuation must explicitly resume.
   const value=JSON.parse(response.content[0]?.text??'null') as {kind?:string;crPublication?:string}|null;
   if(value?.crPublication==='complete'){owner.close();this.owners.delete(key);}
   return response;
  }catch(error){if(owner.closed||signal?.aborted){owner.close();if(this.owners.get(key)===owner)this.owners.delete(key);}return errorEnvelope('review-request-failed','TaskReviewError',error instanceof Error?error.message:String(error),false);}
 }
}
