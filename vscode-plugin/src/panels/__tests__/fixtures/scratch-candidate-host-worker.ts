import { parentPort } from 'node:worker_threads';
import { scratchSourceCodec } from '../../scratch-markdown.js';
import { candidateProbe } from './scratch-candidate-probe.js';
if(!parentPort)throw new Error('Probe requires owned worker port');
const port=parentPort,receive=candidateProbe(async()=>scratchSourceCodec,value=>port.postMessage(value));
port.on('message',value=>{void receive(value).catch(()=>{throw new Error('Candidate probe failed');});});
