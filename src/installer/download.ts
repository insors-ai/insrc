import { get } from 'node:https';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { InstallerError } from './contracts.js';
import type { ReleaseAsset } from './release-descriptor.js';
import { BUNDLE_LIMITS, httpsUrl } from './release-descriptor.js';
export interface DownloadResponse { status: number; location?: string | undefined; body: Readable }
/** Internal deterministic test seam; never selected by an untrusted request. */
export type DownloadTransport = (url: URL, signal: AbortSignal) => Promise<DownloadResponse>;
const transport: DownloadTransport = (url, signal) => new Promise((resolve, reject) => {
  const request = get(url, { signal, headers: { 'user-agent': 'insrc-installer/1', accept: 'application/octet-stream' } }, response => resolve({ status: response.statusCode ?? 0, location: response.headers.location, body: response }));
  request.on('error', reject);
});
async function responseFor(url: string, signal: AbortSignal, send: DownloadTransport): Promise<Readable> {
  let current = httpsUrl(url);
  for (let count = 0; count <= 8; count++) {
    signal.throwIfAborted(); const response = await send(current, signal);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      response.body.destroy();
      if (!response.location) throw new InstallerError('download-invalid', 'Redirect lacks location');
      current = httpsUrl(new URL(response.location, current).href); continue;
    }
    if (response.status !== 200) { response.body.destroy(); throw new InstallerError('download-invalid', `Release HTTP status ${response.status}`); }
    return response.body;
  }
  throw new InstallerError('download-invalid', 'Too many HTTPS redirects');
}
function deadline(signal?: AbortSignal): AbortSignal { return signal ? AbortSignal.any([signal, AbortSignal.timeout(600_000)]) : AbortSignal.timeout(600_000); }
export async function downloadVerifiedAsset(asset: ReleaseAsset, destination: string, options: { signal?: AbortSignal | undefined; transport?: DownloadTransport | undefined } = {}): Promise<void> {
  const { url, bytes: expectedBytes, sha256: expectedHash } = asset;
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > BUNDLE_LIMITS.compressed || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new InstallerError('download-invalid', 'Invalid bounded release asset');
  const signal = deadline(options.signal), input = await responseFor(url, signal, options.transport ?? transport), hash = createHash('sha256'); let total = 0;
  const counter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    total += chunk.length;
    if (total > expectedBytes) { callback(new InstallerError('download-invalid', 'Download exceeds declared byte bound')); return; }
    hash.update(chunk); callback(null, chunk);
  } });
  await pipeline(input, counter, createWriteStream(destination, { flags: 'wx', mode: 0o600 }), { signal });
  if (total !== expectedBytes || hash.digest('hex') !== expectedHash) throw new InstallerError('download-invalid', 'Download size or digest mismatch');
}
export async function downloadJson(url: string, options: { signal?: AbortSignal | undefined; transport?: DownloadTransport | undefined } = {}): Promise<unknown> {
  const signal = deadline(options.signal), body = await responseFor(url, signal, options.transport ?? transport), chunks: Buffer[] = []; let bytes = 0;
  const abort = () => body.destroy(new InstallerError('cancelled', 'Download cancelled'));
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    for await (const chunk of body) {
      const buffer = Buffer.from(chunk as Uint8Array); bytes += buffer.length;
      if (bytes > BUNDLE_LIMITS.descriptorBytes) throw new InstallerError('download-invalid', 'Release JSON exceeds bound'); chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally { signal.removeEventListener('abort', abort); body.destroy(); }
}
