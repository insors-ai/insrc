import { ScratchMarkdownVerifier, type ScratchMarkdownCodec } from './scratch-markdown.js';
import { SCRATCH_CODEC_VERSION, scratchValidationMessageFits, scratchValidationRequestFits, type ScratchCodecProof } from './scratch-validation-client.js';
import { SCRATCH_NOTE_BYTES, scratchUtf8Bytes } from './scratch-editor-protocol.js';

/** Fixed-code worker endpoint. The only accepted input is bounded Markdown and
 * identity data; no URL, path, command, module name or executable code. */
export function scratchValidationEngine<Document>(createCodec: () => Promise<ScratchMarkdownCodec<Document>>, post: (value: unknown) => void,
  intent?: (document: Document) => Promise<string>,
  qualify?: (codec: ScratchMarkdownCodec<Document>, source: string, draft: Document) => Promise<ScratchCodecProof>): (value: unknown) => Promise<void> {
  let epoch: string | undefined;
  let codec: ScratchMarkdownCodec<Document> | undefined;
  let base: { requestId: number; baseKey: string; source: string } | undefined;
  let busy = false;
  let verifier: ScratchMarkdownVerifier<Document> | undefined;
  return async value => {
    if (!value || typeof value !== 'object' || !scratchValidationMessageFits(value)) throw new Error('Invalid validation message');
    const message = value as Record<string, unknown>;
    const keys = Object.keys(message);
    if (message['type'] === 'init') {
      if (epoch !== undefined || keys.some(key => !['type', 'epoch', 'codecVersion'].includes(key)) || message['codecVersion'] !== SCRATCH_CODEC_VERSION ||
        typeof message['epoch'] !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(message['epoch'])) throw new Error('Invalid validation startup');
      epoch = message['epoch'];
      codec = await createCodec();
      verifier = new ScratchMarkdownVerifier(codec);
      post({ type: 'ready', epoch, codecVersion: SCRATCH_CODEC_VERSION }); return;
    }
    if (message['type'] === 'invalidate' && codec && message['epoch'] === epoch && keys.every(key => ['type', 'epoch'].includes(key))) {
      verifier!.invalidate(); return;
    }
    if (!codec || epoch !== message['epoch'] || busy || !Number.isSafeInteger(message['requestId']) || (message['requestId'] as number) < 1 ||
      typeof message['baseKey'] !== 'string' || message['baseKey'].length < 1 || message['baseKey'].length > 256) throw new Error('Invalid validation identity');
    const requestId = message['requestId'] as number, baseKey = message['baseKey'];
    if (message['type'] === 'base') {
      if (keys.some(key => !['type', 'epoch', 'requestId', 'baseKey', 'source'].includes(key)) || typeof message['source'] !== 'string' || scratchUtf8Bytes(message['source']) > SCRATCH_NOTE_BYTES) throw new Error('Invalid validation base');
      base = { requestId, baseKey, source: message['source'] }; return;
    }
    if (message['type'] !== 'validate' || keys.some(key => !['type', 'epoch', 'requestId', 'baseKey', 'draft', 'expectedIntent', 'qualification'].includes(key)) || !base || base.requestId !== requestId || base.baseKey !== baseKey || typeof message['draft'] !== 'string') throw new Error('Invalid validation candidate');
    const request = { source: base.source, draft: message['draft'], baseKey, ...(typeof message['expectedIntent'] === 'string' ? { expectedIntent: message['expectedIntent'] } : {}) };
    if (!scratchValidationRequestFits(request) || (intent && !request.expectedIntent) || (message['expectedIntent'] !== undefined && typeof message['expectedIntent'] !== 'string') ||
      (message['qualification'] !== undefined && (message['qualification'] !== true || !qualify))) throw new Error('Invalid validation intent');
    busy = true; base = undefined;
    try {
      const job = verifier!.job(request.source, baseKey);
      const parsed = job.validation.parse(request.draft);
      const intentMatches = !intent || await intent(parsed) === request.expectedIntent;
      const result = intentMatches ? job.validation.edit(request.source, request.draft, parsed)
        : { allowed: false, reason: 'The draft does not preserve the intended editor document.' };
      if (intentMatches) job.retainBase();
      const proof = message['qualification'] === true ? await qualify!(codec, request.source, parsed) : undefined;
      post({ type: 'result', epoch, requestId, baseKey, allowed: result.allowed, ...(!result.allowed ? { reason: result.reason } : {}), ...(proof ? { proof } : {}) });
    } finally { busy = false; }
  };
}
