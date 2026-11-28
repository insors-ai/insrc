import { createScratchBackgroundCodec, scratchIntentDigest } from '../../scratch-markdown-codec.js';
import { candidateProbe } from './scratch-candidate-probe.js';
const endpoint=self as unknown as {postMessage(value:unknown):void;onmessage:((event:MessageEvent)=>void)|null};
const receive=candidateProbe(createScratchBackgroundCodec,value=>endpoint.postMessage(value),doc=>scratchIntentDigest(doc,doc.type.schema));
endpoint.onmessage=event=>{void receive(event.data).catch(()=>{throw new Error('Candidate probe failed');});};
