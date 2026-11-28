import { ScratchMarkdownVerifier, type ScratchMarkdownCodec } from './scratch-markdown.js';
import { SCRATCH_CODEC_VERSION, scratchValidationMessageFits, scratchValidationRequestFits, type ScratchCodecProof, type ScratchValidationIdentity, scratchValidationIdentity, sameScratchValidationIdentity } from './scratch-validation-client.js';
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
  let handoff: { requestId: number; baseKey: string; identity: ScratchValidationIdentity; digest: string; changed: boolean; accepted: boolean } | undefined;
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
    if (codec && message['epoch'] === epoch && ['invalidate','discard'].includes(String(message['type'])) && keys.every(key => ['type','epoch', ...(message['type'] === 'discard' ? ['revoke'] : [])].includes(key)) && (message['revoke'] === undefined || message['revoke'] === true)) {
      if (message['type'] === 'invalidate') { verifier!.invalidate(); handoff = undefined; }
      else { verifier!.discardCandidate(message['revoke'] === true); if (message['revoke'] === true || !handoff?.accepted) handoff = undefined; }
      return;
    }
    if (codec && message['epoch'] === epoch && (message['type'] === 'accept' || message['type'] === 'confirm')) {
      const confirm = message['type'] === 'confirm';
      const allowed = ['type','epoch','requestId','baseKey','identity', ...(confirm ? ['source','version','digest'] : [])];
      if (keys.some(key => !allowed.includes(key)) || !scratchValidationIdentity(message['identity'])) throw new Error('Invalid proof control');
      const matches = handoff && handoff.requestId === message['requestId'] && handoff.baseKey === message['baseKey'] && sameScratchValidationIdentity(handoff.identity, message['identity']);
      if (!matches || !handoff) return; // replayed/foreign control cannot consume another handoff
      if (!confirm) { handoff.accepted = verifier!.acceptCandidate(handoff.requestId); return; }
      if (!handoff.accepted || typeof message['source'] !== 'string' || scratchUtf8Bytes(message['source']) > SCRATCH_NOTE_BYTES ||
        message['digest'] !== handoff.digest || message['version'] !== handoff.identity.baseVersion + (handoff.changed ? 1 : 0) ||
        !verifier!.confirmCandidate(handoff.requestId, message['source'], `${message['version']}:${message['digest']}`)) verifier!.invalidate();
      handoff = undefined; return;
    }
    if (!codec || epoch !== message['epoch'] || busy || !Number.isSafeInteger(message['requestId']) || (message['requestId'] as number) < 1 ||
      typeof message['baseKey'] !== 'string' || message['baseKey'].length < 1 || message['baseKey'].length > 256) throw new Error('Invalid validation identity');
    const requestId = message['requestId'] as number, baseKey = message['baseKey'];
    if (message['type'] === 'base') {
      if (keys.some(key => !['type', 'epoch', 'requestId', 'baseKey', 'source'].includes(key)) || typeof message['source'] !== 'string' || scratchUtf8Bytes(message['source']) > SCRATCH_NOTE_BYTES) throw new Error('Invalid validation base');
      base = { requestId, baseKey, source: message['source'] }; return;
    }
    if (message['type'] !== 'validate' || keys.some(key => !['type', 'epoch', 'requestId', 'baseKey', 'draft', 'expectedIntent', 'qualification', 'identity'].includes(key)) || !base || base.requestId !== requestId || base.baseKey !== baseKey || typeof message['draft'] !== 'string') throw new Error('Invalid validation candidate');
    const request = { source: base.source, draft: message['draft'], baseKey, ...(typeof message['expectedIntent'] === 'string' ? { expectedIntent: message['expectedIntent'] } : {}), ...(message['identity'] !== undefined ? { identity: message['identity'] as ScratchValidationIdentity } : {}) };
    if (!scratchValidationRequestFits(request) || (intent && !request.expectedIntent) || (message['expectedIntent'] !== undefined && typeof message['expectedIntent'] !== 'string') ||
      (message['qualification'] !== undefined && (message['qualification'] !== true || !qualify))) throw new Error('Invalid validation intent');
    busy = true; base = undefined;
    try {
      const job = verifier!.job(request.source, baseKey);
      if (!handoff?.accepted) handoff = undefined;
      const parsed = job.validation.parse(request.draft);
      const intentMatches = !intent || await intent(parsed) === request.expectedIntent;
      const result = intentMatches ? job.validation.edit(request.source, request.draft, parsed)
        : { allowed: false, reason: 'The draft does not preserve the intended editor document.' };
      if (intentMatches) job.retainBase();
      const proof = message['qualification'] === true ? await qualify!(codec, request.source, parsed) : undefined;
      let candidateDigest: string | undefined;
      if (result.allowed && request.identity) {
        const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(request.draft));
        const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
        if (job.retainCandidate(request.draft, requestId)) {
          candidateDigest = digest;
          handoff = { requestId, baseKey, identity: Object.freeze({ ...request.identity }), digest, changed: request.source !== request.draft, accepted: false };
        }
      }
      post({ type: 'result', epoch, requestId, baseKey, allowed: result.allowed, ...(!result.allowed ? { reason: result.reason } : {}), ...(proof ? { proof } : {}), ...(candidateDigest ? { candidateDigest } : {}) });
    } finally { busy = false; }
  };
}
