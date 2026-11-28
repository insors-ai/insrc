import { scratchValidationEngine } from './scratch-validation-engine.js';
import { createScratchBackgroundCodec, scratchIntentDigest, scratchCodecProof } from './scratch-markdown-codec.js';
const endpoint = globalThis as unknown as { postMessage(value: unknown): void; onmessage: ((event: MessageEvent) => void) | null };
const receive = scratchValidationEngine(createScratchBackgroundCodec, value => endpoint.postMessage(value), scratchIntentDigest, scratchCodecProof);
endpoint.onmessage = event => { void receive(event.data).catch(() => { throw new Error('Background Markdown validation failed.'); }); };
