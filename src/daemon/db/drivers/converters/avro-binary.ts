import type avsc from 'avsc';
/** Bounds lengths/counts/depth before avsc may allocate decoded objects. */
export class AvroCursor {
	constructor(readonly bytes: Buffer, public offset = 0) {
	}
	skip(size: number): void {
		if (!Number.isSafeInteger(size) || size < 0 || this.offset + size > this.bytes.length)
			throw new Error('Invalid Avro framing');
		this.offset += size;
	}
	long(): number {
		let encoded = 0n;
		for (let i = 0; i < 10; i++) {
			this.skip(1);
			const byte = this.bytes[this.offset - 1]!;
			encoded |= BigInt(byte & 127) << BigInt(i * 7);
			if (!(byte & 128)) {
				const value = (encoded >> 1n) ^ -(encoded & 1n);
				if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER))
					throw new Error('unsupported-temporary');
				return Number(value);
			}
		}
		throw new Error('Invalid Avro integer');
	}
	text(): void {
		const length = this.long();
		if (length > 64 * 1024)
			throw new Error('resource-limit');
		this.skip(length);
	}
}
interface Structure {
	fields?: {
		name: string;
		type: avsc.Type;
	}[];
	types?: avsc.Type[];
	itemsType?: avsc.Type;
	valuesType?: avsc.Type;
	size?: number;
	symbols?: string[];
}
export function avroStructure(type: avsc.Type): Structure {
	return type as avsc.Type & Structure;
}
export function validateAvroSchema(type: avsc.Type, ancestors = new Set<avsc.Type>(), depth = 0): void {
	if (depth > 32 || ancestors.has(type))
		throw new Error('unsupported-temporary');
	const structure = avroStructure(type);
	if ((structure.fields?.length ?? 0) > 4096 || (structure.types?.length ?? 0) > 64 || (structure.size ?? 0) > 64 * 1024)
		throw new Error('resource-limit');
	const children = structure.fields?.map(f => f.type) ?? structure.types ?? (structure.itemsType ? [structure.itemsType] : structure.valuesType ? [structure.valuesType] : []);
	const next = new Set(ancestors);
	next.add(type);
	for (const child of children)
		validateAvroSchema(child, next, depth + 1);
}
export function validateAvroRecord(type: avsc.Type, cursor: AvroCursor): number {
	let nodes = 0;
	const visit = (current: avsc.Type, depth: number): void => {
		if (++nodes > 16 * 1024 || depth > 32)
			throw new Error('resource-limit');
		const shape = avroStructure(current), kind = current.typeName;
		if (kind.startsWith('union')) {
			const branch = shape.types?.[cursor.long()];
			if (!branch)
				throw new Error('Invalid Avro union');
			visit(branch, depth + 1);
			return;
		}
		switch (kind) {
			case 'null': return;
			case 'boolean':
				cursor.skip(1);
				return;
			case 'int':
			case 'long':
				cursor.long();
				return;
			case 'float':
				cursor.skip(4);
				return;
			case 'double':
				cursor.skip(8);
				return;
			case 'bytes':
			case 'string':
				cursor.text();
				return;
			case 'fixed':
				cursor.skip(shape.size!);
				return;
			case 'enum': {
				const index = cursor.long();
				if (index < 0 || index >= (shape.symbols?.length ?? 0))
					throw new Error('Invalid Avro enum');
				return;
			}
			case 'record':
				for (const field of shape.fields ?? [])
					visit(field.type, depth + 1);
				return;
			case 'array':
			case 'map': {
				let total = 0;
				for (;;) {
					let count = cursor.long();
					if (count === 0)
						return;
					let end: number | undefined;
					if (count < 0) {
						count = -count;
						const size = cursor.long();
						if (size < 0 || size > cursor.bytes.length - cursor.offset)
							throw new Error('Invalid Avro collection');
						end = cursor.offset + size;
					}
					total += count;
					if (total > 16 * 1024)
						throw new Error('resource-limit');
					for (let i = 0; i < count; i++) {
						if (kind === 'map')
							cursor.text();
						visit((kind === 'map' ? shape.valuesType : shape.itemsType)!, depth + 1);
					}
					if (end !== undefined && end !== cursor.offset)
						throw new Error('Invalid Avro collection');
				}
			}
			default: throw new Error('unsupported-temporary');
		}
	};
	visit(type, 0);
	return nodes;
}
