import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import type * as OnnxRuntime from 'onnxruntime-node';
import type sharp from 'sharp';

const require = createRequire(import.meta.url);
const transformersRequire = createRequire(require.resolve('@huggingface/transformers'));

// ONNX IR 8, opset 13, one Abs node over a three-element float tensor.
const model = Buffer.from(
  'CAg6OAoLCgF4EgF5IgNBYnMSB2ZpeHR1cmVaDwoBeBIKCggIARIECgIIA2IPCgF5EgoKCAgBEgQKAggDQgIQDQ==',
  'base64',
);

test('Transformers resolves working native Sharp and ONNX bindings without network access', async () => {
  const image = transformersRequire('sharp') as typeof sharp;
  const pixels = await image(Buffer.from([255, 0, 0]), { raw: { width: 1, height: 1, channels: 3 } }).raw().toBuffer();
  assert.deepEqual(pixels, Buffer.from([255, 0, 0]));

  const runtime = transformersRequire('onnxruntime-node') as typeof OnnxRuntime;
  const session = await runtime.InferenceSession.create(model, { executionProviders: ['cpu'] });
  try {
    const result = await session.run({ x: new runtime.Tensor('float32', Float32Array.of(-1, 2, -3), [3]) });
    assert.ok(result.y);
    assert.deepEqual(Array.from(result.y.data), [1, 2, 3]);
  } finally {
    await session.release();
  }
});
