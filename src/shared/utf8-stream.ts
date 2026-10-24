import { StringDecoder } from 'node:string_decoder';
import type { Readable } from 'node:stream';

/** Decode each stream independently while preserving raw byte counts for limits and metrics. */
export function onUtf8Data(stream: Readable | null | undefined, receive: (text: string, bytes: number) => void): void {
	if (stream === null || stream === undefined) return;
	const decoder = new StringDecoder('utf8');
	stream.on('data', (chunk: Buffer | string) => {
		const raw = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
		receive(decoder.write(raw), raw.length);
	});
	stream.once('end', () => {
		const tail = decoder.end();
		if (tail !== '') receive(tail, 0);
	});
}
