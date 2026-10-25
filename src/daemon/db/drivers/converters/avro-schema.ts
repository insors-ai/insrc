/** Bound schema graphs before avsc allocates fields or generates decoder functions. */
export function validateAvroSchemaDefinition(schema: unknown): void {
	const named = new Map<string, Record<string, unknown>>(), names = new WeakMap<object, string>();
	let nodes = 0;
	const primitives = new Set(['null', 'boolean', 'int', 'long', 'float', 'double', 'bytes', 'string']);
	const qualified = (name: string, namespace: string) => name.includes('.') ? name : namespace ? namespace + '.' + name : name;
	const namespaceOf = (name: string) => name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : '';
	const object = (value: unknown): Record<string, unknown> => {
		if (!value || typeof value !== 'object' || Array.isArray(value))
			throw new Error('unsupported-temporary');
		return value as Record<string, unknown>;
	};
	const collect = (value: unknown, namespace: string, depth: number): void => {
		if (++nodes > 16384 || depth > 32)
			throw new Error('resource-limit');
		if (typeof value === 'string')
			return;
		if (Array.isArray(value)) {
			if (value.length === 0 || value.length > 64)
				throw new Error('resource-limit');
			for (const branch of value)
				collect(branch, namespace, depth + 1);
			return;
		}
		const item = object(value), kind = item['type'];
		if (typeof kind !== 'string') {
			collect(kind, namespace, depth + 1);
			return;
		}
		if (['record', 'enum', 'fixed'].includes(kind)) {
			if (typeof item['name'] !== 'string' || !item['name'] || (item['namespace'] !== undefined && typeof item['namespace'] !== 'string'))
				throw new Error('unsupported-temporary');
			const name = qualified(item['name'], typeof item['namespace'] === 'string' ? item['namespace'] : namespace);
			if (named.has(name))
				throw new Error('unsupported-temporary');
			named.set(name, item);
			names.set(item, name);
			namespace = namespaceOf(name);
			if (item['aliases'] !== undefined && (!Array.isArray(item['aliases']) || item['aliases'].length > 64))
				throw new Error('resource-limit');
		}
		if (kind === 'record') {
			const fields = item['fields'];
			if (!Array.isArray(fields) || fields.length > 4096)
				throw new Error('resource-limit');
			for (const field of fields)
				collect(object(field)['type'], namespace, depth + 1);
		}
		else if (kind === 'array')
			collect(item['items'], namespace, depth + 1);
		else if (kind === 'map')
			collect(item['values'], namespace, depth + 1);
		else if (kind === 'fixed') {
			const size = item['size'];
			if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0 || size > 65536)
				throw new Error('resource-limit');
		}
		else if (kind === 'enum') {
			if (!Array.isArray(item['symbols']) || item['symbols'].length > 16384)
				throw new Error('resource-limit');
		}
	};
	collect(schema, '', 0);
	nodes = 0;
	const visit = (value: unknown, namespace: string, ancestors: Set<object>, depth: number): void => {
		if (++nodes > 16384 || depth > 32)
			throw new Error('resource-limit');
		if (typeof value === 'string') {
			if (primitives.has(value))
				return;
			const definition = named.get(qualified(value, namespace)) ?? named.get(value);
			if (!definition)
				throw new Error('unsupported-temporary');
			visit(definition, namespace, ancestors, depth + 1);
			return;
		}
		if (Array.isArray(value)) {
			for (const branch of value)
				visit(branch, namespace, ancestors, depth + 1);
			return;
		}
		const item = object(value);
		if (ancestors.has(item))
			throw new Error('unsupported-temporary');
		const next = new Set(ancestors);
		next.add(item);
		const name = names.get(item);
		if (name)
			namespace = namespaceOf(name);
		const kind = item['type'];
		if (kind === 'record')
			for (const field of item['fields'] as unknown[])
				visit(object(field)['type'], namespace, next, depth + 1);
		else if (kind === 'array')
			visit(item['items'], namespace, next, depth + 1);
		else if (kind === 'map')
			visit(item['values'], namespace, next, depth + 1);
		else if (kind !== 'enum' && kind !== 'fixed')
			visit(kind, namespace, next, depth + 1);
	};
	if (object(schema)['type'] !== 'record')
		throw new Error('unsupported-temporary');
	visit(schema, '', new Set(), 0);
}
