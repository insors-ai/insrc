import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { boundedInflateRaw } from '../drivers/converters/bounded-inflate.js';
import { DecoderBudget } from '../drivers/converters/decoder-budget.js';
test('CM-S1-S: real inflater output chunks and concatenation are admitted before allocation including cap overshoot', () => {
	for (const oversized of [false, true]) {
		const input = deflateRawSync(Buffer.alloc(oversized ? 2 * 1024 * 1024 : 256 * 1024, 7)), budget = new DecoderBudget(8 * 1024 * 1024), alloc = Buffer.allocUnsafe, concat = Buffer.concat;
		let allocated = 0, concatenating = false;
		const allocation = mock.method(Buffer, 'allocUnsafe', (size: number) => {
			if (!concatenating) {
				allocated += size;
				assert(allocated <= budget.snapshot().retained, 'all native chunks fit the pre-admitted peak');
			}
			return alloc(size);
		});
		const join = mock.method(Buffer, 'concat', (list: readonly Uint8Array[], length?: number) => {
			const size = length ?? list.reduce((n, b) => n + b.byteLength, 0);
			allocated += size;
			assert(allocated <= budget.snapshot().retained, 'concat coexists with all native chunks within the admitted peak');
			concatenating = true;
			try {
				return concat(list, length);
			}
			finally {
				concatenating = false;
			}
		});
		try {
			if (oversized) {
				assert.throws(() => boundedInflateRaw(input, budget, 32 * 1024), /resource-limit/);
				assert.equal(budget.snapshot().retained, 0);
			}
			else {
				const result = boundedInflateRaw(input, budget, 1024 * 1024);
				assert.equal(result.bytes.length, 256 * 1024);
				assert(allocated > result.bytes.length, 'observes both chunks and final concatenation');
				assert.equal(budget.snapshot().retained, result.bytes.buffer.byteLength + 128);
				result.release();
				assert.equal(budget.snapshot().retained, 0);
			}
		}
		finally {
			allocation.mock.restore();
			join.mock.restore();
		}
	}
});
