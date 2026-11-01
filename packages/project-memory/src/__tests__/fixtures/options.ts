import type { MemoryOptions } from '../../types.js';
export function options(dataDirectory: string): MemoryOptions {
  return { dataDirectory, models: { embeddingModel: 'local-test', embeddingDimension: 2, async complete() { return null; }, async embed() { return [0, 1]; } }, policy: { async bind(projectId) { return { projectId, root: '/project', scopeEpoch: '1' }; }, async admit(_binding, event) { return event; } }, logger: { write() {} }, limits: { maxEventBytes: 1024, segmentBytes: 4096, maxPendingBytes: 8192, modelTimeoutMs: 1000 } };
}
