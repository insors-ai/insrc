/**
 * Fault tolerance — barrel export.
 *
 * Re-exports health monitoring, Ollama fault handling, and daemon fault handling.
 */

export {
  HealthMonitor,
  DEFAULT_CHECK_INTERVAL_MS,
  type ComponentState,
  type ComponentHealth,
  type HealthSnapshot,
  type HealthChangeCallback,
} from './health.js';

export {
  classifyOllamaError,
  formatOllamaFault,
  isOllamaDown,
  type OllamaFaultKind,
  type OllamaFault,
} from './ollama.js';

export {
  classifyDaemonError,
  formatDaemonFault,
  attemptRestart,
  tryReconnect,
  annotateStale,
  isGraphPotentiallyStale,
  RESTART_TIMEOUT_MS,
  type DaemonFaultKind,
  type DaemonFault,
} from './daemon.js';
