/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Ajv } from 'ajv';
import { canonicalData, UsageInputError } from './canonical.js';
import type { SourceCapability } from './types.js';

const string = { type: 'string', minLength: 1, maxLength: 256 };
const nullable = { anyOf: [{ type: 'null' }, string] };
const enumeration = (...values: string[]) => ({ type: 'string', enum: values });
const properties = {
  capabilityId: string, provider: string, transport: string, version: nullable, sourceRevision: nullable,
  evidenceRefs: { type: 'array', items: string, maxItems: 1024, uniqueItems: true },
  granularity: enumeration('model-call', 'invocation-total', 'cumulative-snapshot', 'unknown'),
  physicalCallCoverage: enumeration('complete', 'partial', 'unknown'),
  observedModelIdentity: enumeration('reported', 'requested-only', 'unknown'),
  inputConvention: enumeration('disjoint', 'inclusive-cache', 'exclusive-cache', 'unknown'),
  reasoningInOutput: { anyOf: [{ type: 'boolean' }, { const: 'unknown' }] },
  supportedCounterBuckets: { type: 'array', maxItems: 5, uniqueItems: true, items: enumeration('inputUncachedTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens', 'reasoningTokens') },
  baselineRequired: { type: 'boolean' },
  qualification: enumeration('source-inspected', 'recorded-fixture', 'unqualified'),
};
const shape = new Ajv({ strict: false }).compile({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

/** Validate a declaration, not the truth of its evidence or live native coverage. */
export function validateSourceCapability(input: unknown): readonly string[] {
  let value: SourceCapability;
  try { value = JSON.parse(canonicalData(input)) as SourceCapability; }
  catch (error) {
    return [`${error instanceof UsageInputError && error.code === 'resource-limit' ? 'resource-limit' : 'capability-invalid'}:/`];
  }
  if (!shape(value)) return [`capability-invalid:${shape.errors?.[0]?.instancePath || '/'}`];
  const notices: string[] = [];
  const qualified = (value.version !== null || value.sourceRevision !== null) && value.evidenceRefs.length > 0 && value.qualification !== 'unqualified';
  if (value.qualification !== 'unqualified' && !qualified) notices.push('capability-unqualified:/qualification');
  if (value.physicalCallCoverage === 'complete' && (!qualified || value.qualification !== 'source-inspected' || value.granularity !== 'model-call')) notices.push('capability-unqualified:/physicalCallCoverage');
  if (value.granularity === 'cumulative-snapshot' && !value.baselineRequired) notices.push('capability-invalid:/baselineRequired');
  return notices;
}
