/**
 * System hardware detection — CPU, RAM, GPU, VRAM.
 * Used by the model recommender and setup wizard.
 */

import os from 'node:os';
import { execSync } from 'node:child_process';

export interface GpuInfo {
  name: string;
  vramMb: number;
  vramFreeMb: number;
  driver: string;
  cuda: string;
  backend: 'cuda' | 'metal' | 'vulkan' | 'cpu';
  unifiedMemory: boolean;  // true for Apple Silicon (CPU+GPU share RAM)
}

export interface SystemInfo {
  cpu: {
    model: string;
    cores: number;
    threads: number;
    speedMhz: number;
  };
  ram: {
    totalMb: number;
    freeMb: number;
    availableMb: number;
  };
  gpu: GpuInfo | null;
  os: {
    platform: string;
    release: string;
    arch: string;
  };
  ollama: {
    available: boolean;
    version: string | null;
    models: OllamaModel[];
    runningModels: OllamaRunningModel[];
    env: OllamaEnv;
  };
}

export interface OllamaEnv {
  numGpu: number | null;          // OLLAMA_NUM_GPU
  maxLoadedModels: number | null; // OLLAMA_MAX_LOADED_MODELS
  numParallel: number | null;     // OLLAMA_NUM_PARALLEL
  flashAttention: boolean | null; // OLLAMA_FLASH_ATTENTION
  kvCacheType: string | null;     // OLLAMA_KV_CACHE_TYPE (f16, q8_0, q4_0)
  debug: boolean;                 // OLLAMA_DEBUG
  host: string | null;            // OLLAMA_HOST
  vulkan: boolean;                // OLLAMA_VULKAN
  gpuOverhead: string | null;     // OLLAMA_GPU_OVERHEAD
  maxVram: string | null;         // OLLAMA_MAX_VRAM
  serviceManaged: boolean;        // running as systemd service
  raw: Record<string, string>;    // all OLLAMA_* env vars found
}

export interface OllamaModel {
  name: string;
  size: number;         // bytes
  parameterSize: string; // e.g. "30.5B"
  quantization: string;  // e.g. "Q4_K_M"
  family: string;
}

export interface OllamaRunningModel {
  name: string;
  size: number;
  processor: string;  // "100% GPU", "100% CPU", "50% GPU/50% CPU"
  vram: number;       // bytes on GPU
}

/**
 * Detect GPU info. Platform-aware:
 * - Linux/Windows: nvidia-smi for NVIDIA GPUs
 * - macOS: Apple Silicon detection via sysctl (unified memory, Metal backend)
 */
function detectGpu(): GpuInfo | null {
  const platform = os.platform();

  // macOS — Apple Silicon or Intel
  if (platform === 'darwin') {
    return detectAppleSiliconGpu();
  }

  // Linux/Windows — NVIDIA
  return detectNvidiaGpu();
}

function detectAppleSiliconGpu(): GpuInfo | null {
  const arch = os.arch();
  if (arch !== 'arm64') {
    // Intel Mac — no Metal GPU acceleration for LLMs
    return null;
  }

  try {
    // Get chip name
    let chipName = 'Apple Silicon';
    try {
      chipName = execSync('sysctl -n machdep.cpu.brand_string', {
        timeout: 3000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch { /* fallback */ }

    // Get GPU core count (useful for performance estimation)
    let gpuCores = 0;
    try {
      const spJson = execSync('system_profiler SPDisplaysDataType -json', {
        timeout: 5000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      });
      const sp = JSON.parse(spJson) as { SPDisplaysDataType?: Array<{ sppci_cores?: string }> };
      const coresStr = sp.SPDisplaysDataType?.[0]?.sppci_cores ?? '';
      gpuCores = parseInt(coresStr, 10) || 0;
    } catch { /* ignore */ }

    // Unified memory — GPU uses ~75% of total RAM
    const totalRamMb = Math.round(os.totalmem() / (1024 * 1024));
    const effectiveVramMb = Math.round(totalRamMb * 0.75);
    const freeRamMb = Math.round(os.freemem() / (1024 * 1024));

    const name = gpuCores > 0 ? `${chipName} (${gpuCores}-core GPU)` : chipName;

    return {
      name,
      vramMb: effectiveVramMb,
      vramFreeMb: Math.round(freeRamMb * 0.75),
      driver: 'Metal',
      cuda: '',
      backend: 'metal',
      unifiedMemory: true,
    };
  } catch {
    return null;
  }
}

function detectNvidiaGpu(): GpuInfo | null {
  try {
    const output = execSync(
      'nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv,noheader,nounits',
      { timeout: 5000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();

    if (!output) return null;

    // Take first GPU if multiple
    const line = output.split('\n')[0]!.trim();
    const [name, totalStr, freeStr, driver] = line.split(',').map(s => s.trim());

    // Get CUDA version separately
    let cuda = '';
    try {
      const smiOutput = execSync('nvidia-smi', { timeout: 5000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      const cudaMatch = smiOutput.match(/CUDA Version:\s+([\d.]+)/);
      if (cudaMatch) cuda = cudaMatch[1]!;
    } catch { /* ignore */ }

    return {
      name: name ?? 'Unknown',
      vramMb: parseInt(totalStr ?? '0', 10),
      vramFreeMb: parseInt(freeStr ?? '0', 10),
      driver: driver ?? '',
      cuda,
      backend: 'cuda',
      unifiedMemory: false,
    };
  } catch {
    return null;
  }
}

/**
 * Detect Ollama environment configuration.
 * - Linux: reads from systemd service environment
 * - macOS: reads from launchctl plist or ~/.zshrc
 * - All: reads from process environment
 */
function detectOllamaEnv(): OllamaEnv {
  const raw: Record<string, string> = {};
  let serviceManaged = false;
  const platform = os.platform();

  if (platform === 'linux') {
    // Check systemd service environment
    try {
      const serviceEnv = execSync(
        'systemctl show ollama --property=Environment',
        { timeout: 3000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      ).trim();

      if (serviceEnv.startsWith('Environment=')) {
        serviceManaged = true;
        const envStr = serviceEnv.replace('Environment=', '');
        for (const pair of envStr.split(/\s+/)) {
          const eq = pair.indexOf('=');
          if (eq > 0) {
            const key = pair.slice(0, eq);
            const val = pair.slice(eq + 1);
            if (key.startsWith('OLLAMA_') || key.startsWith('GGML_')) {
              raw[key] = val;
            }
          }
        }
      }
    } catch { /* not systemd or no service */ }
  } else if (platform === 'darwin') {
    // Check launchctl for Ollama env (macOS app or homebrew service)
    try {
      const plistPath = `${os.homedir()}/Library/LaunchAgents/com.ollama.ollama.plist`;
      const plist = execSync(`defaults read "${plistPath}" EnvironmentVariables 2>/dev/null || true`, {
        timeout: 3000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (plist) {
        serviceManaged = true;
        // Parse plist output: "KEY" = "VALUE";
        for (const match of plist.matchAll(/"(OLLAMA_\w+)"\s*=\s*"([^"]*)"/g)) {
          raw[match[1]!] = match[2]!;
        }
      }
    } catch { /* no plist */ }

    // Also check ~/.zshrc for exports
    try {
      const zshrc = execSync(`grep '^export OLLAMA_' ~/.zshrc 2>/dev/null || true`, {
        timeout: 3000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      for (const line of zshrc.split('\n')) {
        const m = line.match(/^export\s+(OLLAMA_\w+)=["']?([^"'\s]+)/);
        if (m) raw[m[1]!] = m[2]!;
      }
    } catch { /* ignore */ }
  }

  // Also check process environment
  for (const [key, val] of Object.entries(process.env)) {
    if ((key.startsWith('OLLAMA_') || key.startsWith('GGML_')) && val !== undefined) {
      raw[key] = val;
    }
  }

  const getNum = (key: string): number | null => {
    const v = raw[key];
    return v !== undefined ? parseInt(v, 10) : null;
  };
  const getBool = (key: string): boolean => raw[key] === '1' || raw[key] === 'true';

  return {
    numGpu: getNum('OLLAMA_NUM_GPU'),
    maxLoadedModels: getNum('OLLAMA_MAX_LOADED_MODELS'),
    numParallel: getNum('OLLAMA_NUM_PARALLEL'),
    flashAttention: raw['OLLAMA_FLASH_ATTENTION'] !== undefined ? getBool('OLLAMA_FLASH_ATTENTION') : null,
    kvCacheType: raw['OLLAMA_KV_CACHE_TYPE'] ?? null,
    debug: getBool('OLLAMA_DEBUG'),
    host: raw['OLLAMA_HOST'] ?? null,
    vulkan: getBool('OLLAMA_VULKAN'),
    gpuOverhead: raw['OLLAMA_GPU_OVERHEAD'] ?? null,
    maxVram: raw['OLLAMA_MAX_VRAM'] ?? null,
    serviceManaged,
    raw,
  };
}

/**
 * Detect Ollama availability, version, and installed models.
 */
function detectOllama(): SystemInfo['ollama'] {
  const result: SystemInfo['ollama'] = {
    available: false,
    version: null,
    models: [],
    runningModels: [],
    env: detectOllamaEnv(),
  };

  // Version
  try {
    result.version = execSync('ollama --version', {
      timeout: 5000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim().replace(/^ollama version\s+/i, '');
    result.available = true;
  } catch {
    return result;
  }

  // Installed models
  try {
    const tagsJson = execSync('curl -s http://localhost:11434/api/tags', {
      timeout: 5000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    const tags = JSON.parse(tagsJson) as { models?: Array<{
      name: string;
      size: number;
      details?: { parameter_size?: string; quantization_level?: string; family?: string };
    }> };

    result.models = (tags.models ?? []).map(m => ({
      name: m.name,
      size: m.size,
      parameterSize: m.details?.parameter_size ?? '',
      quantization: m.details?.quantization_level ?? '',
      family: m.details?.family ?? '',
    }));
  } catch { /* ignore */ }

  // Running models
  try {
    const psJson = execSync('curl -s http://localhost:11434/api/ps', {
      timeout: 5000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    const ps = JSON.parse(psJson) as { models?: Array<{
      name: string;
      size: number;
      size_vram: number;
      details?: { parameter_size?: string };
    }> };

    result.runningModels = (ps.models ?? []).map(m => {
      const totalSize = m.size || 1;
      const vramPct = Math.round((m.size_vram / totalSize) * 100);
      const cpuPct = 100 - vramPct;
      let processor = '100% CPU';
      if (vramPct >= 95) processor = '100% GPU';
      else if (vramPct > 0) processor = `${vramPct}% GPU/${cpuPct}% CPU`;

      return {
        name: m.name,
        size: m.size,
        processor,
        vram: m.size_vram,
      };
    });
  } catch { /* ignore */ }

  return result;
}

/**
 * Gather full system information.
 */
export function getSystemInfo(): SystemInfo {
  const cpus = os.cpus();
  const firstCpu = cpus[0];

  return {
    cpu: {
      model: firstCpu?.model ?? 'Unknown',
      cores: cpus.length,
      threads: cpus.length,
      speedMhz: firstCpu?.speed ?? 0,
    },
    ram: {
      totalMb: Math.round(os.totalmem() / (1024 * 1024)),
      freeMb: Math.round(os.freemem() / (1024 * 1024)),
      availableMb: Math.round(os.freemem() / (1024 * 1024)), // approximation
    },
    gpu: detectGpu(),
    os: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
    },
    ollama: detectOllama(),
  };
}
