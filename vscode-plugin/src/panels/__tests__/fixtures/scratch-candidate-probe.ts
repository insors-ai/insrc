/** Test-only parse counters around the actual codec and production engine. */
import type { ScratchMarkdownCodec } from '../../scratch-markdown.js';
import { scratchValidationEngine } from '../../scratch-validation-engine.js';
export function candidateProbe<Document>(factory:()=>Promise<ScratchMarkdownCodec<Document>>,post:(value:unknown)=>void,intent?:((document:Document)=>Promise<string>)){
  const counts=new Map<string,number>();
  return scratchValidationEngine(async()=>{const codec=await factory();return{...codec,parse:(source:string)=>{counts.set(source,(counts.get(source)??0)+1);return codec.parse(source);}};},value=>{
    if((value as {type?:string}).type==='result'){post({type:'candidate-probe',counts:[...counts]});counts.clear();}post(value);
  },intent);
}
