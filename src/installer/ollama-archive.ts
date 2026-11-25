import { extractOllamaTarZstd } from './ollama-tar.js';
import { extractOllamaZip } from './ollama-zip.js';
import { materializeOllamaAliases } from './ollama-layout.js';
import { parseOllamaPolicy } from './ollama-policy.js';
import type { OllamaPolicy } from './ollama-policy.js';
import type { InventoryFile } from './release-descriptor.js';
/** All archive output remains an unpublished private stage. */
export async function extractOllamaArchive(archive: string, destination: string, input: OllamaPolicy,
  signal?: AbortSignal): Promise<InventoryFile[]> {
  const policy = parseOllamaPolicy(input);
  const extracted = policy.asset.format === 'tar.zst' ? await extractOllamaTarZstd(archive, destination, policy, signal)
    : await extractOllamaZip(archive, destination, policy, signal);
  return materializeOllamaAliases(destination, extracted, policy, signal);
}
