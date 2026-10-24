import { SaxesParser } from 'saxes';
import type { SaxesTagPlain } from 'saxes';
import { DecoderBudget } from './decoder-budget.js';
export interface XmlHandlers {
	readonly open?: ((tag: SaxesTagPlain) => void) | undefined;
	readonly text?: ((value: string) => void) | undefined;
	readonly close?: ((tag: SaxesTagPlain) => void) | undefined;
}
function admitXmlUnits(bytes: Buffer): void {
	let offset = 0;
	const end = (marker: string, start: number): number => {
		const at = bytes.indexOf(marker, start);
		if (at < 0)
			throw new Error('Invalid workbook XML');
		return at + marker.length;
	};
	while (offset < bytes.length) {
		const start = offset;
		if (bytes[offset] === 60) {
			if (bytes.subarray(offset, offset + 4).equals(Buffer.from('<!--')))
				offset = end('-->', offset + 4);
			else if (bytes.subarray(offset, offset + 9).equals(Buffer.from('<![CDATA[')))
				offset = end(']]>', offset + 9);
			else {
				if (bytes[offset + 1] === 33)
					throw new Error('unsupported-temporary');
				let quote = 0;
				offset++;
				while (offset < bytes.length) {
					const ch = bytes[offset++]!;
					if (quote) {
						if (ch === quote)
							quote = 0;
					}
					else if (ch === 34 || ch === 39)
						quote = ch;
					else if (ch === 62)
						break;
					if (offset - start > 64 * 1024)
						throw new Error('resource-limit');
				}
				if (bytes[offset - 1] !== 62)
					throw new Error('Invalid workbook XML');
			}
		}
		else {
			const next = bytes.indexOf(60, offset);
			offset = next < 0 ? bytes.length : next;
		}
		if (offset - start > 64 * 1024)
			throw new Error('resource-limit');
	}
}
/** No DTDs/custom entities; bounded tokens are admitted before entering the parser. */
export function* parseBoundedXmlChunks(bytes: Buffer, budget: DecoderBudget, handlers: XmlHandlers): Generator<void> {
	admitXmlUnits(bytes);
	const release = budget.reserve(bytes.length * 4 + 256 * 1024);
	try {
		const parser = new SaxesParser({ xmlns: false });
		let depth = 0, cellDepth = 0, cellSize = 0, stringDepth = 0, stringSize = 0;
		parser.on('doctype', () => {
			throw new Error('unsupported-temporary');
		});
		parser.on('xmldecl', decl => {
			if (decl.encoding && !/^utf-?8$/i.test(decl.encoding))
				throw new Error('unsupported-temporary');
		});
		parser.on('error', () => {
			throw new Error('Invalid workbook XML');
		});
		parser.on('opentag', tag => {
			if (++depth > 64 || Object.keys(tag.attributes).length > 128)
				throw new Error('resource-limit');
			const name = tag.name.split(':').at(-1);
			if (name === 'c') {
				cellDepth = depth;
				cellSize = 0;
			}
			if (name === 'si') {
				stringDepth = depth;
				stringSize = 0;
			}
			handlers.open?.(tag);
		});
		const text = (value: string): void => {
			const size = Buffer.byteLength(value);
			if (size > 64 * 1024)
				throw new Error('resource-limit');
			if (cellDepth && (cellSize += size) > 64 * 1024)
				throw new Error('resource-limit');
			if (stringDepth && (stringSize += size) > 64 * 1024)
				throw new Error('resource-limit');
			handlers.text?.(value);
		};
		parser.on('text', text);
		parser.on('cdata', text);
		parser.on('closetag', tag => {
			handlers.close?.(tag);
			if (depth === cellDepth)
				cellDepth = 0;
			if (depth === stringDepth)
				stringDepth = 0;
			depth--;
		});
		const decoder = new TextDecoder('utf-8', { fatal: true });
		for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
			parser.write(decoder.decode(bytes.subarray(offset, offset + 64 * 1024), { stream: true }));
			yield;
		}
		parser.write(decoder.decode());
		parser.close();
		yield;
	}
	finally {
		release();
	}
}
export function parseBoundedXml(bytes: Buffer, budget: DecoderBudget, handlers: XmlHandlers): void {
	for (const step of parseBoundedXmlChunks(bytes, budget, handlers))
		void step;
}
