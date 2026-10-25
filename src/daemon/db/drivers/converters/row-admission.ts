/** Conservative decoded-value accounting without allocating a serialized copy. */
export function decodedValueBytes(value: unknown, limit: number): number {
	let bytes = 0, nodes = 0;
	const stack = new Set<object>();
	const charge = (n: number) => {
		bytes += n;
		if (!Number.isSafeInteger(bytes) || bytes > limit)
			throw new Error('Decoded row exceeds memory budget');
	};
	const visit = (item: unknown, depth: number): void => {
		if (++nodes > 100000 || depth > 64)
			throw new Error('Decoded row exceeds memory budget');
		if (item === null || item === undefined) {
			charge(4);
			return;
		}
		if (typeof item === 'string') {
			charge(item.length * 2 + 8);
			return;
		}
		if (typeof item === 'number' || typeof item === 'bigint') {
			charge(24);
			return;
		}
		if (typeof item === 'boolean') {
			charge(4);
			return;
		}
		if (ArrayBuffer.isView(item)) {
			charge(item.byteLength + 32);
			return;
		}
		if (item instanceof Date) {
			charge(24);
			return;
		}
		if (typeof item !== 'object')
			throw new Error('Unsupported decoded value');
		if (stack.has(item))
			throw new Error('Unsupported circular decoded value');
		stack.add(item);
		charge(24);
		try {
			for (const key in item) {
				if (!Object.hasOwn(item, key))
					continue;
				charge(key.length * 2 + 16);
				visit((item as Record<string, unknown>)[key], depth + 1);
			}
		}
		finally {
			stack.delete(item);
		}
	};
	visit(value, 0);
	return bytes;
}
