import { parentPort } from 'node:worker_threads';
import { scratchValidationEngine } from './scratch-validation-engine.js';
import { scratchSourceCodec } from './scratch-markdown.js';
if (!parentPort) throw new Error('Markdown worker requires an owned parent port');
const port = parentPort;
const receive = scratchValidationEngine(() => Promise.resolve(scratchSourceCodec), value => port.postMessage(value));
port.on('message', value => { void receive(value).catch(() => { throw new Error('Background Markdown validation failed.'); }); });
