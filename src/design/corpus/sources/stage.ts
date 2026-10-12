/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/** Separate I/O orchestrator. Never re-export through the pure sources/index.ts. */
import { isAbsolute } from 'node:path';
import { CORPUS_LIMITS } from '../canonical.js';
import type { ValidationResult } from '../contracts.js';
import { decodeSourcePolicy } from './contracts.js';
import { decodeSourceRequest, requiredSourcePaths, stageSources } from './eligibility.js';
import type { SourceRequest, StagedSources } from './eligibility.js';
import { readPinnedSources } from './git-reader.js';
import type { ReaderOptions } from './git-reader.js';
import type { SourceAcquisition } from './assessment.js';
import { failure, problem } from './validation-primitives.js';

export interface LocalSourceRequest { readonly localRepository: string; readonly request: unknown; }
export interface LocalStaging { readonly stages: StagedSources[]; readonly imports: SourceAcquisition[]; }
/** No durable writes: return snapshots for independent assessment and later package installation. */
export async function stageLocalSources(policyInput: unknown, inputs: readonly LocalSourceRequest[], options: ReaderOptions = {}): Promise<ValidationResult<LocalStaging>> {
  const policy = decodeSourcePolicy(policyInput); if (!policy.ok) return policy;
  if (!Array.isArray(inputs) || inputs.length > CORPUS_LIMITS.files) return failure([problem('limit.exceeded', '/inputs', 'Import count exceeds limit.')]);
  const requests: { localRepository: string; request: SourceRequest; paths: string[] }[] = [];
  let count = 0, bytes = 0;
  // Validate every selected/evidence path before starting any acquisition.
  for (const input of inputs) {
    if (!input || typeof input.localRepository !== 'string' || !isAbsolute(input.localRepository)) return failure([problem('path.invalid', '/localRepository', 'Expected absolute local repository path.')]);
    const request = decodeSourceRequest(input.request); if (!request.ok) return request;
    const paths = requiredSourcePaths(policy.value, request.value); if (!paths.ok) return paths;
    count += paths.value.length;
    if (count > (options.limits?.files ?? CORPUS_LIMITS.files)) return failure([problem('limit.exceeded', '/inputs', 'Combined source/evidence count exceeds limit.')]);
    requests.push({ localRepository: input.localRepository, request: request.value, paths: paths.value });
  }
  const stages: StagedSources[] = [], imports: SourceAcquisition[] = [];
  for (const input of requests) {
    const remaining = (options.limits?.bytes ?? CORPUS_LIMITS.packageBytes) - bytes;
    if (remaining < 1 && input.paths.length) return failure([problem('limit.exceeded', '/inputs', 'No remaining source-byte budget.')]);
    const acquired = await readPinnedSources(input.localRepository, { ...input.request, paths: input.paths },
      { ...options, limits: { ...options.limits, bytes: Math.max(1, remaining) } });
    if (!acquired.ok) return acquired;
    bytes += acquired.value.reduce((sum, file) => sum + file.bytes.byteLength, 0);
    if (bytes > (options.limits?.bytes ?? CORPUS_LIMITS.packageBytes)) return failure([problem('limit.exceeded', '/inputs', 'Combined source/evidence bytes exceed limit.')]);
    const stage = stageSources(policy.value, input.request, acquired.value); if (!stage.ok) return stage;
    stages.push(stage.value);
    // Reassessment snapshots contain only admitted bytes; rejected acquisition data never escapes staging.
    imports.push({ request: { ...input.request, paths: [...stage.value.report.admitted] },
      blobs: stage.value.admitted.map(source => ({ path: source.source.path, bytes: new Uint8Array(source.bytes) })) });
  }
  return { ok: true, value: { stages, imports } };
}
