import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import test from 'node:test';

const home = resolve(process.env.INSRC_TEST_ONNX_HOME ?? 'node_modules/.cache/insrc-onnx-home');
const model = join(home, '.insrc/models/hf-cache/nomic-ai/nomic-embed-text-v1.5/onnx/model_quantized.onnx');

test('Daemon produces a 768-component local embedding with the patched native graph', {
  skip: existsSync(model) ? false : 'Populate the isolated ONNX model cache before native qualification',
}, () => {
  const script = `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { onnxEmbedQuery, ONNX_EMBEDDING_DIM } from './src/agent/providers/onnx-embedder.ts';

    // Fail if Transformers tries to download any file instead of using the cache.
    globalThis.fetch = () => { throw new Error('Unexpected network access during ONNX inference'); };
    const require = createRequire(import.meta.url);
    const transformersRequire = createRequire(require.resolve('@huggingface/transformers'));
    const sharp = transformersRequire('sharp');
    const pixels = await sharp(Buffer.from([255, 0, 0]), {
      raw: { width: 1, height: 1, channels: 3 },
    }).raw().toBuffer();
    assert.deepEqual(pixels, Buffer.from([255, 0, 0]));
    const vector = await onnxEmbedQuery('local native dependency security qualification');
    assert.equal(vector.length, ONNX_EMBEDDING_DIM);
    assert.ok(vector.every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...vector) - 1) < 0.01);
  `;
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    env, timeout: 30_000, stdio: 'pipe',
  });
});
