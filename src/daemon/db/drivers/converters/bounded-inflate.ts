/** Account for Node's chunk collector AND concatenated result before inflation. */
import { inflateRawSync } from 'node:zlib';
import type { DecoderBudget } from './decoder-budget.js';
// Covers the bounded native window/state, chunk-list metadata and Buffer slab slack.
const WORKSPACE = 128 * 1024, CHUNK = 64 * 1024;
export function boundedInflateRaw(input: Buffer, budget: DecoderBudget, maximum: number): {
	bytes: Buffer;
	release: () => void;
} {
	const available = budget.limit - budget.snapshot().retained;
	const chunkSize = Math.min(CHUNK, Math.floor((available - WORKSPACE) / 4));
	const limit = Math.min(maximum, Math.floor((available - WORKSPACE - 2 * chunkSize) / 2));
	if (!Number.isSafeInteger(maximum) || maximum <= 0 || chunkSize < 64 || limit <= 0)
		throw new Error('resource-limit');
	// processChunkSync can allocate one extra chunk before checking its output
	// limit, then Buffer.concat can coexist with every preceding output chunk.
	const reservation = budget.reserve(2 * (limit + chunkSize) + WORKSPACE);
	try {
		const bytes = inflateRawSync(input, { chunkSize, maxOutputLength: limit });
		// A short slice may retain a whole output chunk (or pooled backing slab).
		reservation.shrinkTo(bytes.buffer.byteLength + 128);
		return { bytes, release: reservation };
	}
	catch {
		reservation();
		throw new Error('resource-limit');
	}
}
