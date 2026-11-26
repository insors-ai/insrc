/** Release-owned distribution metadata, independent of delivery/consent code. */
import nodePolicy from './runtime-policy.json' with { type: 'json' };
export const ollamaDistributionAsset = Object.freeze({
  url: 'https://github.com/ollama/ollama/releases/download/v0.40.18/ollama-linux-arm64.tar.zst',
  sha256: '63f01dae3b65641866991e75e2aecb7aed8a4041f4c2c3c7d92862c5a47ebed6',
  bytes: 1704011634,
  format: 'tar.zst' as const,
});
const distributionHashes = new Set<string>([
  ...Object.values(nodePolicy.archives), ...Object.values(nodePolicy.profiles).map(profile => profile.nodeSha256),
  nodePolicy.supplemental.headers.sha256, ...Object.values(nodePolicy.supplemental.libraries).map(asset => asset.sha256),
  ollamaDistributionAsset.sha256,
]);
export function isDistributionArtifact(sha256: string): boolean { return distributionHashes.has(sha256); }
