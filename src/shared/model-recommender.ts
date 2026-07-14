/**
 * Model recommender — suggests optimal local models based on hardware.
 *
 * Analyzes GPU VRAM, RAM, and installed Ollama models to recommend:
 * - Coder model (for agent inference)
 * - Embedding model (for indexing + search)
 * - Context window size
 * - Budget shape name
 */

import type { SystemInfo } from './system-info.js';

// ---------------------------------------------------------------------------
// Recommendation output
// ---------------------------------------------------------------------------

export interface ModelRecommendation {
  coder: {
    model: string;
    pull: boolean;      // true if not already installed
    params: string;     // e.g. "30.5B"
    quantization: string;
    vramNeeded: number; // MB approximate
  };
  embedding: {
    model: string;
    pull: boolean;
    dims: number;
    vramNeeded: number;
  };
  context: {
    tokens: number;
    shape: '4k' | '8k' | '16k' | '32k' | '64k' | '128k';
    maxOutput: number;
  };
  tier: 'minimal' | 'basic' | 'standard' | 'advanced' | 'premium';
  notes: string[];     // human-readable reasoning
  ollamaOptimizations: OllamaOptimization[];
}

export interface OllamaOptimization {
  issue: string;       // what's wrong or suboptimal
  fix: string;         // human-readable fix description
  command: string;     // exact command to run
  impact: 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------------
// Model catalog
// ---------------------------------------------------------------------------

interface ModelProfile {
  name: string;
  params: string;
  quantization: string;
  vramMb: number;    // approximate VRAM usage at base context
  quality: number;   // 1-10 relative quality score
}

const CODER_MODELS: ModelProfile[] = [
  { name: 'qwen3-coder:1.5b',  params: '1.5B',  quantization: 'Q4_K_M', vramMb: 1200,  quality: 3 },
  { name: 'qwen3-coder:8b',    params: '8B',     quantization: 'Q4_K_M', vramMb: 5500,  quality: 5 },
  { name: 'qwen3-coder:14b',   params: '14B',    quantization: 'Q4_K_M', vramMb: 9000,  quality: 7 },
  { name: 'qwen3-coder:latest', params: '30.5B', quantization: 'Q4_K_M', vramMb: 13500, quality: 9 },
  { name: 'codestral:latest',   params: '22.2B', quantization: 'Q4_0',   vramMb: 14000, quality: 8 },
];

interface EmbeddingProfile {
  name: string;
  dims: number;
  vramMb: number;
  quality: number;
}

const EMBEDDING_MODELS: EmbeddingProfile[] = [
  { name: 'nomic-embed-text',       dims: 768,  vramMb: 300,  quality: 4 },
  { name: 'qwen3-embedding:0.6b',   dims: 1024, vramMb: 800,  quality: 6 },
  { name: 'qwen3-embedding:4b',     dims: 2560, vramMb: 3700, quality: 9 },
];

// ---------------------------------------------------------------------------
// Context shapes based on available VRAM after model loading
// ---------------------------------------------------------------------------

interface ContextShape {
  tokens: number;
  shape: '4k' | '8k' | '16k' | '32k' | '64k' | '128k';
  maxOutput: number;
  kvOverheadMb: number; // approximate additional KV cache memory
}

const CONTEXT_SHAPES: ContextShape[] = [
  { tokens: 4096,   shape: '4k',   maxOutput: 2048,  kvOverheadMb: 100 },
  { tokens: 8192,   shape: '8k',   maxOutput: 4096,  kvOverheadMb: 200 },
  { tokens: 16384,  shape: '16k',  maxOutput: 8192,  kvOverheadMb: 450 },
  { tokens: 32768,  shape: '32k',  maxOutput: 8192,  kvOverheadMb: 900 },
  { tokens: 65536,  shape: '64k',  maxOutput: 16384, kvOverheadMb: 1800 },
  { tokens: 131072, shape: '128k', maxOutput: 16384, kvOverheadMb: 3600 },
];

// ---------------------------------------------------------------------------
// Recommender logic
// ---------------------------------------------------------------------------

export function recommendModels(info: SystemInfo): ModelRecommendation {
  const notes: string[] = [];
  const gpu = info.gpu;
  const ramMb = info.ram.totalMb;
  const installed = new Set(info.ollama.models.map(m => m.name));

  // Compute usable VRAM based on platform
  let usableVram: number;
  if (gpu?.unifiedMemory) {
    // Apple Silicon: unified memory, ~75% of total RAM is effective VRAM
    // But we need to leave room for OS + apps (~4GB)
    usableVram = Math.max(0, gpu.vramMb - 4000);
    notes.push(`${gpu.name}, Unified Memory: ${ramMb}MB RAM (~${usableVram}MB usable for models)`);
    notes.push(`Backend: Metal`);
  } else if (gpu) {
    // Discrete GPU: reserve ~2GB for desktop/display
    usableVram = Math.max(0, gpu.vramMb - 2000);
    notes.push(`GPU: ${gpu.name}, VRAM: ${gpu.vramMb}MB (${usableVram}MB usable)`);
    if (gpu.cuda) notes.push(`Backend: CUDA ${gpu.cuda}`);
  } else {
    usableVram = 0;
    notes.push('GPU: none detected — CPU-only mode');
  }
  notes.push(`RAM: ${ramMb}MB`);

  // Ollama swaps models — only one loaded at a time.
  // Pick coder and embedding independently against full usable VRAM.
  // Context shape is based on VRAM remaining after coder (the larger model).

  // 1. Pick embedding model
  const embedding = pickEmbedding(usableVram, ramMb, installed, notes);

  // 2. Pick coder model against full usable VRAM (not reduced by embedding)
  const coder = pickCoder(usableVram, ramMb, installed, notes);

  // 3. Pick context shape based on VRAM remaining after coder (the model in use)
  const vramRemaining = usableVram - coder.vramNeeded;
  const context = pickContext(vramRemaining, ramMb, notes);

  // 4. Determine tier
  const tier = classifyTier(coder, embedding, context);

  // 5. Analyze Ollama configuration
  const ollamaOptimizations = analyzeOllamaConfig(info, coder, context);

  return { coder, embedding, context, tier, notes, ollamaOptimizations };
}

function pickEmbedding(
  vramMb: number,
  ramMb: number,
  installed: Set<string>,
  notes: string[],
): ModelRecommendation['embedding'] {
  // Pick the best embedding model that fits in VRAM (models swap, full VRAM available)
  let best = EMBEDDING_MODELS[0]!; // nomic as fallback

  for (const m of EMBEDDING_MODELS) {
    if (m.vramMb <= vramMb) {
      best = m;
    } else if (ramMb > 16000 && m.vramMb <= 1000) {
      // Can run on CPU if enough RAM
      best = m;
    }
  }

  notes.push(`Embedding: ${best.name} (${best.dims} dims, ~${best.vramMb}MB)`);

  return {
    model: best.name,
    pull: !installed.has(best.name),
    dims: best.dims,
    vramNeeded: best.vramMb,
  };
}

function pickCoder(
  vramMb: number,
  ramMb: number,
  installed: Set<string>,
  notes: string[],
): ModelRecommendation['coder'] {
  let best = CODER_MODELS[0]!; // 1.5b fallback

  for (const m of CODER_MODELS) {
    if (m.vramMb <= vramMb) {
      best = m;
    }
  }

  // If no GPU but lots of RAM, can still use larger model on CPU (slow)
  if (vramMb === 0 && ramMb >= 32000) {
    const cpuModel = CODER_MODELS.find(m => m.vramMb <= ramMb * 0.4);
    if (cpuModel && cpuModel.quality > best.quality) {
      best = cpuModel;
      notes.push('No GPU detected — coder model will run on CPU (slower inference)');
    }
  }

  // Prefer already-installed model if quality is close
  const installedAlternative = CODER_MODELS.find(
    m => installed.has(m.name) && m.vramMb <= vramMb && m.quality >= best.quality - 1,
  );
  if (installedAlternative && installedAlternative.quality >= best.quality - 1) {
    best = installedAlternative;
    notes.push(`Using already-installed ${best.name}`);
  }

  notes.push(`Coder: ${best.name} (${best.params}, ~${best.vramMb}MB)`);

  return {
    model: best.name,
    pull: !installed.has(best.name),
    params: best.params,
    quantization: best.quantization,
    vramNeeded: best.vramMb,
  };
}

function pickContext(
  vramRemainingMb: number,
  ramMb: number,
  notes: string[],
): ModelRecommendation['context'] {
  let best = CONTEXT_SHAPES[0]!; // 4k fallback

  for (const s of CONTEXT_SHAPES) {
    if (s.kvOverheadMb <= vramRemainingMb) {
      best = s;
    } else if (s.kvOverheadMb <= vramRemainingMb + (ramMb * 0.1)) {
      // Can spill a bit to RAM
      best = s;
    }
  }

  notes.push(`Context: ${best.shape} (${best.tokens} tokens, ~${best.kvOverheadMb}MB KV cache)`);

  return {
    tokens: best.tokens,
    shape: best.shape,
    maxOutput: best.maxOutput,
  };
}

function classifyTier(
  coder: ModelRecommendation['coder'],
  embedding: ModelRecommendation['embedding'],
  context: ModelRecommendation['context'],
): ModelRecommendation['tier'] {
  const score = (
    (coder.vramNeeded >= 13000 ? 3 : coder.vramNeeded >= 8000 ? 2 : 1) +
    (embedding.dims >= 2560 ? 2 : embedding.dims >= 1024 ? 1 : 0) +
    (context.tokens >= 32768 ? 2 : context.tokens >= 16384 ? 1 : 0)
  );

  if (score >= 7) return 'premium';
  if (score >= 5) return 'advanced';
  if (score >= 3) return 'standard';
  if (score >= 2) return 'basic';
  return 'minimal';
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Ollama configuration analysis
// ---------------------------------------------------------------------------

function analyzeOllamaConfig(
  info: SystemInfo,
  coder: ModelRecommendation['coder'],
  context: ModelRecommendation['context'],
): OllamaOptimization[] {
  const opts: OllamaOptimization[] = [];
  const env = info.ollama.env;
  const hasGpu = info.gpu !== null;
  const isMac = info.os.platform === 'darwin';
  const isMetal = info.gpu?.backend === 'metal';
  const isSystemd = env.serviceManaged;

  // Helper: generate platform-appropriate env command
  const setEnvCmd = (key: string, value: string): string => {
    if (isMac) {
      return `launchctl setenv ${key} ${value}\n# Persist: add to ~/.zshrc:\nexport ${key}=${value}\n# Then restart Ollama app`;
    }
    return isSystemd
      ? `sudo systemctl edit ollama\n# Add under [Service]:\nEnvironment="${key}=${value}"\n# Then: sudo systemctl daemon-reload && sudo systemctl restart ollama`
      : `export ${key}=${value}  # Add to ~/.bashrc or shell profile`;
  };

  const removeEnvCmd = (key: string): string => {
    if (isMac) {
      return `launchctl unsetenv ${key}\n# Remove from ~/.zshrc\n# Then restart Ollama app`;
    }
    return isSystemd
      ? `sudo systemctl edit ollama\n# Remove the line: Environment="${key}=..."\n# Then: sudo systemctl daemon-reload && sudo systemctl restart ollama`
      : `unset ${key}  # Remove from ~/.bashrc`;
  };

  // 1. Flash attention — significant speedup for long contexts
  if (hasGpu && env.flashAttention !== true) {
    opts.push({
      issue: 'Flash attention is not enabled — slower inference for long contexts',
      fix: 'Enable flash attention for faster inference (especially at 16K+ context)',
      command: setEnvCmd('OLLAMA_FLASH_ATTENTION', '1'),
      impact: 'high',
    });
  }

  // 2. KV cache quantization — reduces memory usage, allows larger context
  if (hasGpu && env.kvCacheType !== 'q8_0' && env.kvCacheType !== 'q4_0') {
    const vramTight = (info.gpu?.vramMb ?? 0) < coder.vramNeeded + 2000;
    if (vramTight || context.tokens >= 32768) {
      opts.push({
        issue: `KV cache uses f16 (default) — uses ${Math.round(context.tokens * 0.03)}MB+ ${isMetal ? 'memory' : 'VRAM'} for ${context.shape} context`,
        fix: `Quantize KV cache to q8_0 (halves KV ${isMetal ? 'memory' : 'VRAM'}, minimal quality loss) — allows larger context`,
        command: setEnvCmd('OLLAMA_KV_CACHE_TYPE', 'q8_0'),
        impact: 'high',
      });
    }
  }

  // 3. Vulkan set but CUDA available — CUDA is faster (Linux only)
  if (!isMac && hasGpu && env.vulkan && info.gpu?.cuda) {
    opts.push({
      issue: 'OLLAMA_VULKAN=1 is set but CUDA is available — CUDA backend is faster',
      fix: 'Remove OLLAMA_VULKAN to use CUDA (auto-detected)',
      command: removeEnvCmd('OLLAMA_VULKAN'),
      impact: 'medium',
    });
  }

  // 4. No GPU but OLLAMA_NUM_GPU is set high (not applicable to Mac — Metal auto-manages)
  if (!isMac && !hasGpu && env.numGpu !== null && env.numGpu > 0) {
    opts.push({
      issue: `OLLAMA_NUM_GPU=${env.numGpu} but no GPU detected — wasted setting`,
      fix: 'Remove OLLAMA_NUM_GPU or set to 0 for CPU-only mode',
      command: setEnvCmd('OLLAMA_NUM_GPU', '0'),
      impact: 'low',
    });
  }

  // 5. GPU available but NUM_GPU not set or too low (Linux only — Mac uses Metal automatically)
  if (!isMac && hasGpu && env.numGpu !== null && env.numGpu < 99 && env.numGpu < 32) {
    opts.push({
      issue: `OLLAMA_NUM_GPU=${env.numGpu} — limiting GPU layer offload`,
      fix: 'Set to 99 to offload maximum layers to GPU',
      command: setEnvCmd('OLLAMA_NUM_GPU', '99'),
      impact: 'medium',
    });
  }

  // 6. Large memory available but no OLLAMA_MAX_LOADED_MODELS for concurrent embedding + coder
  if (info.ram.totalMb > 32000 && env.maxLoadedModels === null) {
    opts.push({
      issue: 'OLLAMA_MAX_LOADED_MODELS not set — only 1 model loaded at a time (coder and embedding swap)',
      fix: `Set to 2 to keep both models loaded (uses more ${isMetal ? 'memory' : 'VRAM/RAM'} but avoids swap latency)`,
      command: setEnvCmd('OLLAMA_MAX_LOADED_MODELS', '2'),
      impact: 'medium',
    });
  }

  // 7. Num parallel — for concurrent agent requests
  if (env.numParallel === null || env.numParallel < 2) {
    opts.push({
      issue: `OLLAMA_NUM_PARALLEL=${env.numParallel ?? 1} — only 1 concurrent request (blocks during indexing)`,
      fix: 'Set to 4 to allow parallel requests (agent + embedder can run simultaneously)',
      command: setEnvCmd('OLLAMA_NUM_PARALLEL', '4'),
      impact: 'medium',
    });
  }

  // 8. Ollama not installed
  if (!info.ollama.available) {
    opts.push({
      issue: 'Ollama is not installed',
      fix: 'Install Ollama for local LLM inference',
      command: isMac
        ? 'brew install ollama\n# Or download from https://ollama.com/download/mac'
        : 'curl -fsSL https://ollama.com/install.sh | sh',
      impact: 'high',
    });
  }

  // 9. macOS-specific: Apple Silicon with low memory warning
  if (isMetal && info.ram.totalMb < 16000) {
    opts.push({
      issue: `Only ${Math.round(info.ram.totalMb / 1024)}GB unified memory — models will be constrained`,
      fix: 'Consider using smaller models (8B or below) and 4K-8K context for acceptable speed',
      command: '# No action needed — the recommended models above account for this',
      impact: 'medium',
    });
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Config generation from recommendation
// ---------------------------------------------------------------------------

export interface RecommendedConfig {
  ollama: { host: string };
  models: {
    local: string;
    embedding: string;
    embeddingDim: number;
    tiers: { fast: string; standard: string; powerful: string };
    context: {
      local: number;
      localMaxOutput: number;
      claude: number;
      claudeMaxOutput: number;
      charsPerToken: number;
    };
  };
}

export function toConfig(rec: ModelRecommendation): RecommendedConfig {
  return {
    ollama: { host: 'http://localhost:11434' },
    models: {
      local: rec.coder.model,
      embedding: rec.embedding.model,
      embeddingDim: rec.embedding.dims,
      tiers: {
        fast: 'claude-haiku-4-5',
        standard: 'claude-sonnet-4-6',
        powerful: 'claude-opus-4-6',
      },
      context: {
        local: rec.context.tokens,
        localMaxOutput: rec.context.maxOutput,
        claude: 200000,
        claudeMaxOutput: 8192,
        charsPerToken: 3,
      },
    },
  };
}
