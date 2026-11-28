import { get } from 'node:https';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { InstallerError } from './contracts.js';
import type { ReleaseAsset } from './release-descriptor.js';
import { BUNDLE_LIMITS, httpsUrl } from './release-descriptor.js';
import { operationTimeBudgets } from './operation-time-budgets.mjs';
export interface DownloadResponse { status: number; location?: string | undefined; body: Readable; closed?: Promise<void> | undefined }
/** Internal deterministic test seam; never selected by an untrusted request. */
export type DownloadTransport = (url: URL, signal: AbortSignal) => Promise<DownloadResponse>;
export const httpsDownloadTransport: DownloadTransport = (url, signal) => new Promise((resolve, reject) => {
  let close!: () => void, failure: Error | undefined, ended = false;
  const closed = new Promise<void>(resolve => { close = resolve; });
  const request = get(url, { signal, agent: false, headers: { 'user-agent': 'insrc-installer/1', accept: 'application/octet-stream' } }, response => {
    response.on('error', () => {});
    resolve({ status: response.statusCode ?? 0, location: response.headers.location, body: response, closed });
  });
  request.on('error', error => { failure = error; if (ended) reject(error); });
  request.once('close', () => { ended = true; close(); if (failure) reject(failure); });
});
async function closeResponse(response: DownloadResponse): Promise<void> {
  const body = response.body; body.on('error', () => {});
  const closed = body.closed ? Promise.resolve() : new Promise<void>(resolve => body.once('close', resolve));
  body.destroy(); await closed;
  try { await response.closed; } catch (cause) { throw new InstallerError('resource-close-uncertain', 'Download transport closure is unconfirmed', { cause }); }
}
async function responseFor(url: string, signal: AbortSignal, send: DownloadTransport): Promise<DownloadResponse> {
  let current = httpsUrl(url);
  for (let count = 0; count <= 8; count++) {
    signal.throwIfAborted(); const response = await send(current, signal);
    response.body.on('error', () => {});
    if (response.closed) void response.closed.catch(() => {}); // observed again by closeResponse
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await closeResponse(response);
      if (!response.location) throw new InstallerError('download-invalid', 'Redirect lacks location');
      current = httpsUrl(new URL(response.location, current).href); continue;
    }
    if (response.status !== 200) { await closeResponse(response); throw new InstallerError('download-invalid', `Release HTTP status ${response.status}`); }
    return response;
  }
  throw new InstallerError('download-invalid', 'Too many HTTPS redirects');
}
function deadline(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(operationTimeBudgets().runtime.acquisitionMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
export async function downloadVerifiedAsset(asset: ReleaseAsset, destination: string, options: { signal?: AbortSignal | undefined; transport?: DownloadTransport | undefined } = {}): Promise<void> {
  return downloadBoundedAsset(asset, destination, BUNDLE_LIMITS.compressed, deadline(options.signal), options.transport);
}
/** Shared streaming mechanism. Each owning policy supplies its own fixed cap and
 * deadline; the S1 public helper above retains its original acceptance limit. */
export async function downloadBoundedAsset(asset: ReleaseAsset, destination: string, maximum: number, signal: AbortSignal, send?: DownloadTransport): Promise<void> {
  const { url, bytes: expectedBytes, sha256: expectedHash } = asset;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || !Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > maximum || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new InstallerError('download-invalid', 'Invalid bounded release asset');
  const response = await responseFor(url, signal, send ?? httpsDownloadTransport), input = response.body, hash = createHash('sha256'); let total = 0;
  const counter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    total += chunk.length;
    if (total > expectedBytes) { callback(new InstallerError('download-invalid', 'Download exceeds declared byte bound')); return; }
    hash.update(chunk); callback(null, chunk);
  } });
  try { signal.throwIfAborted(); await pipeline(input, counter, createWriteStream(destination, { flags: 'wx', mode: 0o600 }), { signal }); }
  finally { await closeResponse(response); }
  if (total !== expectedBytes || hash.digest('hex') !== expectedHash) throw new InstallerError('download-invalid', 'Download size or digest mismatch');
}
export async function downloadJson(url: string, options: { signal?: AbortSignal | undefined; transport?: DownloadTransport | undefined } = {}): Promise<unknown> {
  const signal = deadline(options.signal), response = await responseFor(url, signal, options.transport ?? httpsDownloadTransport), body = response.body, chunks: Buffer[] = []; let bytes = 0;
  const abort = () => body.destroy(new InstallerError('cancelled', 'Download cancelled'));
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    for await (const chunk of body) {
      const buffer = Buffer.from(chunk as Uint8Array); bytes += buffer.length;
      if (bytes > BUNDLE_LIMITS.descriptorBytes) throw new InstallerError('download-invalid', 'Release JSON exceeds bound'); chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally { signal.removeEventListener('abort', abort); await closeResponse(response); }
}
