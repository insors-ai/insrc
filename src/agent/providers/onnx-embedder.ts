/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * In-process ONNX embedder — the fallback used when Ollama is not
 * reachable or the configured embedding model isn't installed.
 *
 * Loads `nomic-ai/nomic-embed-text-v1.5` via `@huggingface/transformers`
 * (ONNX runtime, quantized q8). No external service dependency — the
 * model runs inside the daemon Node process. First use downloads the
 * model to the HuggingFace cache under `~/.cache/huggingface` (~140 MB);
 * subsequent boots hit the cache instantly.
 *
 * Output dim: 768 (nomic-embed-text-v1.5 supports Matryoshka truncation
 * down to 64, 128, 256, 512, but we standardise on the full 768 to
 * preserve retrieval quality).
 *
 * ## Why nomic
 *
 * MTEB retrieval score comparable to qwen3-embedding:0.6b (Ollama
 * default) while running in-process without a separate model server.
 * ~137 M params at q8, roughly 4x faster query embed than qwen3 for
 * ~1 point MTEB drop.
 *
 * ## Dim reconciliation
 *
 * Lance table schemas are set at daemon boot from
 * `loadLocalProviderConfig().embeddingDim`. If a user's config still
 * points at qwen3-embedding (embeddingDim=1024) but Ollama is
 * unavailable, the daemon-wide bootstrap logs a clear error and skips
 * writing vectors -- ONNX at 768 cannot write into a 1024-dim Lance
 * schema. Users must either install/start Ollama or update their
 * config to nomic + reindex. See `daemon/lifecycle.ts` for the
 * decision + logging.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { getLogger } from '../../shared/logger.js';

const log = getLogger('onnx-embedder');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** HuggingFace model id for the ONNX fallback embedder. */
export const ONNX_EMBEDDING_MODEL = 'nomic-ai/nomic-embed-text-v1.5';

/** Dim the ONNX fallback emits. Full nomic-embed-text-v1.5 output. */
export const ONNX_EMBEDDING_DIM = 768;

/** Prefix required by nomic-embed-text-v1.5 for search / retrieval
 *  queries. The model was trained with a distinct instruction prefix
 *  for each task; using the wrong prefix silently degrades ranking. */
const NOMIC_QUERY_PREFIX = 'search_query: ';
const NOMIC_DOCUMENT_PREFIX = 'search_document: ';

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

/** Lazy pipeline reference — first embed call warms it. */
let pipelinePromise: Promise<unknown> | undefined;

/**
 * Configure HuggingFace transformers cache location before it's imported
 * the first time. Points at `~/.insrc/models/hf-cache` so caches stay
 * under the daemon's data root instead of the user's default HF cache.
 */
function ensureCacheDir(): string {
	const cache = join(homedir(), '.insrc', 'models', 'hf-cache');
	if (!existsSync(cache)) mkdirSync(cache, { recursive: true });
	return cache;
}

async function getPipeline(): Promise<unknown> {
	if (pipelinePromise !== undefined) return pipelinePromise;

	pipelinePromise = (async () => {
		const cacheDir = ensureCacheDir();
		// Dynamic import so the transformers module isn't loaded on
		// installs that never fall back to ONNX (Ollama-path users pay
		// no import cost).
		const { pipeline, env } = await import('@huggingface/transformers');
		// Route model downloads + loads through our cache dir. `env` is
		// the shared config surface for transformers.js.
		env.cacheDir = cacheDir;
		env.allowLocalModels = true;
		env.allowRemoteModels = true;
		log.info({ model: ONNX_EMBEDDING_MODEL, cacheDir }, 'loading ONNX embedder (first use downloads ~140 MB)');
		const t0 = Date.now();
		const p = await pipeline('feature-extraction', ONNX_EMBEDDING_MODEL, {
			// q8 quantised weights -- ~140 MB vs ~550 MB fp32. Retrieval
			// quality regression is <0.5 MTEB points empirically.
			dtype: 'q8',
		});
		log.info({ elapsedMs: Date.now() - t0 }, 'ONNX embedder ready');
		return p;
	})();

	// If the load itself fails, clear the cache so a caller retry can
	// re-attempt from scratch.
	pipelinePromise.catch(err => {
		log.error({ err: (err as Error).message }, 'ONNX embedder failed to load');
		pipelinePromise = undefined;
	});

	return pipelinePromise;
}

// ---------------------------------------------------------------------------
// Public embed API
// ---------------------------------------------------------------------------

/**
 * Embed a single query string. Wraps with nomic's `search_query: `
 * prefix. Returns a 768-dim vector.
 *
 * The pipeline mean-pools token embeddings and L2-normalises the
 * output -- matches the way the model was trained.
 */
export async function onnxEmbedQuery(text: string): Promise<number[]> {
	const pipe = (await getPipeline()) as (
		input: string | string[],
		opts?: { pooling?: 'mean' | 'cls'; normalize?: boolean },
	) => Promise<{ data: Float32Array | number[] }>;
	const input = `${NOMIC_QUERY_PREFIX}${text}`;
	const out = await pipe(input, { pooling: 'mean', normalize: true });
	return Array.from(out.data as Float32Array);
}

/**
 * Embed a single document string. Wraps with nomic's
 * `search_document: ` prefix. Returns a 768-dim vector.
 */
export async function onnxEmbedDocument(text: string): Promise<number[]> {
	const pipe = (await getPipeline()) as (
		input: string | string[],
		opts?: { pooling?: 'mean' | 'cls'; normalize?: boolean },
	) => Promise<{ data: Float32Array | number[] }>;
	const input = `${NOMIC_DOCUMENT_PREFIX}${text}`;
	const out = await pipe(input, { pooling: 'mean', normalize: true });
	return Array.from(out.data as Float32Array);
}

/**
 * Batch-embed documents. The pipeline returns a stacked tensor whose
 * data field is a flat Float32Array of length (batchSize * 768) — we
 * chunk it back into per-doc arrays.
 */
export async function onnxEmbedDocuments(texts: string[]): Promise<number[][]> {
	if (texts.length === 0) return [];
	const pipe = (await getPipeline()) as (
		input: string[],
		opts?: { pooling?: 'mean' | 'cls'; normalize?: boolean },
	) => Promise<{ data: Float32Array }>;
	const prefixed = texts.map(t => `${NOMIC_DOCUMENT_PREFIX}${t}`);
	const out = await pipe(prefixed, { pooling: 'mean', normalize: true });
	const flat = out.data;
	const results: number[][] = [];
	for (let i = 0; i < texts.length; i++) {
		const start = i * ONNX_EMBEDDING_DIM;
		const end   = start + ONNX_EMBEDDING_DIM;
		results.push(Array.from(flat.subarray(start, end)));
	}
	return results;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/**
 * Return true if the ONNX embedder loads successfully. Used at boot to
 * confirm the fallback is actually usable before we announce it.
 *
 * The first invocation may take 10-30 s on cold cache (downloads
 * model); subsequent probes return in <100 ms.
 */
export async function isOnnxEmbedderAvailable(): Promise<boolean> {
	try {
		await getPipeline();
		return true;
	} catch {
		return false;
	}
}
