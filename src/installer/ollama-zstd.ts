/** Guard every frame before fzstd allocates its window. No system decompressor. */
import { createHash } from 'node:crypto';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { constants, createZstdDecompress } from 'node:zlib';
import type { ZstdDecompress } from 'node:zlib';
import { Decompress } from 'fzstd';
import xxhash from 'xxhash-wasm';
import type { XXHashAPI } from 'xxhash-wasm';
import { InstallerError } from './contracts.js';
import { parseOllamaPolicy } from './ollama-policy.js';
import type { OllamaPolicy } from './ollama-policy.js';

const unsafe = (message: string) => new InstallerError('archive-unsafe', message);
let hashes: Promise<XXHashAPI> | undefined;
class Bytes {
  readonly iterator: AsyncIterator<Uint8Array>;
  readonly hash = createHash('sha256');
  chunk: Buffer = Buffer.alloc(0);
  offset = 0; total = 0; ended = false;
  constructor(input: AsyncIterable<Uint8Array>, readonly maximum: number, readonly signal?: AbortSignal) { this.iterator = input[Symbol.asyncIterator](); }
  async take(length: number, allowEnd = false): Promise<Buffer | undefined> {
    const chunks: Buffer[] = []; let size = 0;
    while (size < length) {
      this.signal?.throwIfAborted();
      if (this.offset === this.chunk.length) {
        const item = await this.iterator.next(); this.signal?.throwIfAborted();
        if (item.done) { this.ended = true; if (allowEnd && size === 0) return undefined; throw unsafe('Truncated zstd frame'); }
        if (!item.value.length) continue;
        if (item.value.length > 65536) throw unsafe('Zstd input chunk exceeds 64 KiB');
        this.chunk = Buffer.from(item.value.buffer, item.value.byteOffset, item.value.byteLength); this.offset = 0;
        this.total += this.chunk.length; if (this.total > this.maximum) throw unsafe('Compressed payload exceeds policy'); this.hash.update(this.chunk);
      }
      const count = Math.min(length - size, this.chunk.length - this.offset);
      chunks.push(this.chunk.subarray(this.offset, this.offset + count)); this.offset += count; size += count;
    }
    return chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks, length);
  }
}

/** Streaming output is bounded by validated Zstd blocks (128 KiB). Only one
 * qualified frame is accepted; optional frame checksums are verified too. */
export async function* decodeOllamaZstd(input: AsyncIterable<Uint8Array>, policyInput: OllamaPolicy,
  signal?: AbortSignal): AsyncGenerator<Buffer> {
  const policy = parseOllamaPolicy(policyInput);
  if (policy.asset.format !== 'tar.zst') throw unsafe('Expected Linux tar.zst policy');
  const bytes = new Bytes(input, policy.asset.bytes, signal); let totalOutput = 0, frames = 0;
  let integrity: ZstdDecompress | undefined;
  try {
    while (true) {
      signal?.throwIfAborted(); const magic = await bytes.take(4, true); if (!magic) break;
      if (++frames > 1 || magic.readUInt32LE() !== 0xfd2fb528) throw unsafe('Unsupported or multiple zstd frames');
      const flag = (await bytes.take(1))![0]!;
      if (flag & 0x18) throw unsafe('Reserved zstd frame flags');
      const single = !!(flag & 0x20), checksum = !!(flag & 4), sizeFlag = flag >>> 6, dictionaryFlag = flag & 3;
      const window = single ? Buffer.alloc(0) : (await bytes.take(1))!;
      const dictionary = (await bytes.take(dictionaryFlag === 3 ? 4 : dictionaryFlag))!;
      if (dictionary.some(value => value !== 0)) throw unsafe('External zstd dictionaries are unsupported');
      const sizeBytes = sizeFlag === 0 ? (single ? 1 : 0) : 2 ** sizeFlag;
      const sizeData = (await bytes.take(sizeBytes))!;
      let content: bigint | undefined;
      if (sizeBytes) { content = 0n; for (let i = sizeBytes - 1; i >= 0; i--) content = (content << 8n) | BigInt(sizeData[i]!); if (sizeFlag === 1) content += 256n; }
      const windowBytes = single ? Number(content) : 2 ** (10 + (window[0]! >>> 3)) * (1 + (window[0]! & 7) / 8);
      if (!Number.isSafeInteger(windowBytes) || windowBytes < 0 || windowBytes > policy.limits.windowBytes || windowBytes > 2 ** 25
        || (content !== undefined && content > BigInt(policy.limits.expandedBytes - totalOutput))) throw unsafe('Zstd window/content size exceeds qualified bounds');
      const header = Buffer.concat([magic, Buffer.from([flag]), window, dictionary, sizeData]);
      signal?.throwIfAborted(); const api = await (hashes ??= xxhash()); signal?.throwIfAborted();
      const hash = api.create64(), outputHash = createHash('sha256'), integrityHash = createHash('sha256');
      let frameOutput = 0, queued = 0, integrityBytes = 0, integrityError: Error | undefined; const output: Buffer[] = [];
      // fzstd does not reject every malformed literals/sequence encoding. The
      // release-owned Node decoder strictly validates the same bounded frame;
      // compare streamed output without retaining a second payload in memory.
      integrity = createZstdDecompress({ chunkSize: 65536, params: { [constants.ZSTD_d_windowLogMax]: 25 } });
      integrity.on('error', error => { integrityError = error; });
      integrity.on('data', (chunk: Buffer) => {
        integrityBytes += chunk.length;
        if (integrityBytes > policy.limits.expandedBytes) integrity!.destroy(unsafe('Zstd integrity output exceeds bound'));
        else integrityHash.update(chunk);
      });
      const feedIntegrity = async (chunk: Buffer, final = false) => {
        signal?.throwIfAborted(); if (integrityError) throw integrityError;
        await new Promise<void>((resolve, reject) => {
          const failed = (error: Error) => { integrity!.removeListener('error', failed); reject(error); };
          integrity!.once('error', failed);
          const done = (error?: Error | null) => { integrity!.removeListener('error', failed); error ? reject(error) : resolve(); };
          if (final) integrity!.end(chunk, () => done()); else integrity!.write(chunk, done);
        });
        if (integrityError) throw integrityError; signal?.throwIfAborted();
      };
      await feedIntegrity(header);
      const decoder = new Decompress(chunk => {
        if (!chunk.length) return;
        if (chunk.length > 131072 || queued + chunk.length > 1024 * 1024 || totalOutput + chunk.length > policy.limits.expandedBytes) throw unsafe('Zstd output exceeds block/memory/expansion bound');
        const copy = Buffer.from(chunk); output.push(copy); queued += copy.length; frameOutput += copy.length; totalOutput += copy.length; hash.update(copy); outputHash.update(copy);
      });
      decoder.push(header);
      let last = false;
      while (!last) {
        signal?.throwIfAborted(); const block = (await bytes.take(3))!, value = block.readUIntLE(0, 3);
        last = !!(value & 1); const kind = (value >>> 1) & 3, count = value >>> 3;
        if (kind === 3 || (kind === 2 && count < 2) || count > Math.min(131072, windowBytes)) throw unsafe('Invalid zstd block type/size');
        const body = (await bytes.take(kind === 1 ? 1 : count))!;
        // Exactly one bounded encoded block is admitted at a time.
        const encoded = Buffer.concat([block, body]);
        await feedIntegrity(encoded); decoder.push(encoded);
        while (output.length) { const part = output.shift()!; queued -= part.length; signal?.throwIfAborted(); yield part; }
        await yieldTurn();
      }
      const expected = checksum ? (await bytes.take(4))! : Buffer.alloc(0);
      await feedIntegrity(expected, true);
      await new Promise<void>((resolve, reject) => {
        if (integrity!.readableEnded) { resolve(); return; }
        integrity!.once('end', resolve); integrity!.once('error', reject);
      });
      decoder.push(expected, true);
      if ((content !== undefined && BigInt(frameOutput) !== content)
        || (checksum && Number(hash.digest() & 0xffffffffn) !== expected.readUInt32LE())
        || integrityBytes !== frameOutput || integrityHash.digest('hex') !== outputHash.digest('hex')) throw unsafe('Zstd content length/checksum differs');
      while (output.length) { const part = output.shift()!; queued -= part.length; signal?.throwIfAborted(); yield part; }
    }
    if (!frames || bytes.total !== policy.asset.bytes || bytes.hash.digest('hex') !== policy.asset.sha256) throw unsafe('Compressed payload size/digest differs from policy');
  } catch (cause) {
    if (signal?.aborted) throw new InstallerError('cancelled', 'Ollama decoding cancelled', { cause });
    if (cause instanceof InstallerError) throw cause;
    throw new InstallerError('archive-unsafe', 'Malformed or unsupported bounded zstd payload', { cause });
  } finally {
    if (integrity && !integrity.closed) {
      const closed = new Promise<void>(resolve => integrity!.once('close', resolve)); integrity.destroy(); await closed;
    }
    if (!bytes.ended) await bytes.iterator.return?.();
  }
}
