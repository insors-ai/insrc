import type { MemoryFailure, MemoryFailureCode } from './types.js';
/** Safe fixed messages; native errors and private payloads are never echoed. */
export class MemoryError extends Error implements MemoryFailure {
  constructor(readonly code: MemoryFailureCode, message: string, readonly retryable = false) {
    super(message); this.name = 'MemoryError';
  }
}
