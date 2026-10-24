/** Validate BSON structure before the library materializes any object graph. */
export function validateBsonDocument(bytes: Buffer): void {
	let fields = 0;
	const requireBytes = (offset: number, count: number, end: number): void => {
		if (count < 0 || offset + count > end)
			throw new Error('Invalid BSON framing');
	};
	const cstring = (offset: number, end: number): number => {
		const zero = bytes.indexOf(0, offset);
		if (zero < offset || zero >= end || zero - offset > 64 * 1024)
			throw new Error('resource-limit');
		return zero + 1;
	};
	const string = (offset: number, end: number): number => {
		requireBytes(offset, 4, end);
		const size = bytes.readInt32LE(offset);
		if (size < 1 || size > 64 * 1024)
			throw new Error('resource-limit');
		requireBytes(offset + 4, size, end);
		if (bytes[offset + 4 + size - 1] !== 0)
			throw new Error('Invalid BSON string');
		return offset + 4 + size;
	};
	const document = (start: number, end: number, depth: number): number => {
		if (depth > 32)
			throw new Error('resource-limit');
		requireBytes(start, 5, end);
		const size = bytes.readInt32LE(start), stop = start + size;
		if (size < 5 || stop > end || bytes[stop - 1] !== 0)
			throw new Error('Invalid BSON framing');
		let offset = start + 4;
		while (offset < stop - 1) {
			const type = bytes[offset++]!;
			if (++fields > 16 * 1024)
				throw new Error('resource-limit');
			offset = cstring(offset, stop - 1);
			let count = 0;
			switch (type) {
				case 1:
				case 9:
				case 17:
				case 18:
					count = 8;
					break;
				case 2:
				case 13:
				case 14:
					offset = string(offset, stop - 1);
					break;
				case 3:
				case 4:
					offset = document(offset, stop - 1, depth + 1);
					break;
				case 5: {
					requireBytes(offset, 5, stop - 1);
					const length = bytes.readInt32LE(offset);
					if (length < 0)
						throw new Error('Invalid BSON binary');
					count = 5 + length;
					break;
				}
				case 6:
				case 10:
				case 127:
				case 255: break;
				case 7:
					count = 12;
					break;
				case 8:
					count = 1;
					break;
				case 11:
					offset = cstring(cstring(offset, stop - 1), stop - 1);
					break;
				case 12:
					offset = string(offset, stop - 1);
					count = 12;
					break;
				case 15: {
					requireBytes(offset, 4, stop - 1);
					const total = bytes.readInt32LE(offset), scopeEnd = offset + total;
					if (total < 14 || scopeEnd > stop - 1)
						throw new Error('Invalid BSON scope');
					const scope = string(offset + 4, scopeEnd);
					if (document(scope, scopeEnd, depth + 1) !== scopeEnd)
						throw new Error('Invalid BSON scope');
					offset = scopeEnd;
					break;
				}
				case 16:
					count = 4;
					break;
				case 19:
					count = 16;
					break;
				default: throw new Error('Unsupported BSON type');
			}
			requireBytes(offset, count, stop - 1);
			offset += count;
		}
		if (offset !== stop - 1)
			throw new Error('Invalid BSON framing');
		return stop;
	};
	if (document(0, bytes.length, 0) !== bytes.length)
		throw new Error('Invalid BSON framing');
}
