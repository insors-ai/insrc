import { designReviewStep } from '../design-review-rpc.js';
import type { TrustedRpcContext } from '../request-context.js';
export async function handleDesignReviewStep(raw:unknown,trusted?:TrustedRpcContext){
 return{content:[{type:'text' as const,text:JSON.stringify(await designReviewStep(raw,trusted))}]};
}
