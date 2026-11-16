/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { TextDecoder } from 'node:util';
import type { ReviewChange, selectedCode } from '../code-review/task-review/packet.js';
import type { StagedPacketBlob } from './staged-packet-sources.js';
import type { PreparedWindow } from './prepared-views.js';
import { PreparedViewReader } from './prepared-views.js';
import type { MemoryLease } from './preparation-memory.js';

/** Decodes bounded chunks and retains selected after text only. The existing
 * selectedCode shape remains the prompt contract; before text stays in Git. */
export async function selectedCodeWindow(reader: PreparedViewReader, change: ReviewChange<StagedPacketBlob>): Promise<PreparedWindow<ReturnType<typeof selectedCode>>> {
 const leases: MemoryLease[] = [];
 const segments: readonly { after?: readonly [number, number] | undefined; deletionAt?: number | undefined }[] = change.segments;
 try {
  leases.push(reader.memory.reserve(change.segments.length * 256 + 1024, 'selected code metadata'));
  const parts = segments.map(() => [] as string[]), sizes = segments.map(() => 0);
  if (change.after && segments.some(s => s.after)) {
   const decoder = new TextDecoder('utf8', { fatal: true }); let line = 1;
   const consume = (text: string) => {
    let start = 0;
    while (start < text.length) {
     const newline = text.indexOf('\n', start), end = newline < 0 ? text.length : newline + 1;
     for (const [i, segment] of segments.entries()) if (segment.after && line >= segment.after[0] && line <= segment.after[1]) {
      leases.push(reader.memory.reserve((end - start) * 2 + 64, 'selected after text fragment'));
      parts[i]!.push(text.slice(start, end)); sizes[i]! += end - start;
     }
     if (newline >= 0) line++;
     start = end;
    }
   };
   for await (const chunk of reader.chunks(change.after.content)) {
    const scratch = reader.memory.reserve(chunk.value.byteLength * 2 + 128, 'selected code chunk decoding');
    try { consume(decoder.decode(chunk.value, { stream: true })); } finally { scratch.release(); chunk.release(); }
   }
   const final = reader.memory.reserve(128, 'selected code decoder completion');
   try { consume(decoder.decode()); } finally { final.release(); }
  }
  const blocks = segments.map((segment, i) => {
   if (!segment.after) return { deletionAt: segment.deletionAt, deleted: true as const };
   leases.push(reader.memory.reserve(sizes[i]! * 2 + 64, 'selected after block assembly'));
   return { lines: segment.after, code: parts[i]!.join('') };
  });
  const provenance = 'origin' in change ? { origin: { commit: change.origin.commit, parent: change.origin.parent, path: change.origin.path, previousPath: change.origin.previousPath, segments: change.origin.segments }, findingScope: change.findingScope }
   : { parent: change.parent, previousPath: change.previousPath, limitations: change.limitations };
  return reader.retainWindow({ commit: change.commit, path: change.path, ...provenance, blocks, deletedFile: change.after === null }, leases);
 } catch (error) { for (const lease of leases) lease.release(); throw error; }
}
