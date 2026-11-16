/** Read-only historical review compatibility. No live review execution. */
import type { CodePreparationCheckpoint, DesignPreparationCheckpoint } from "./preparation-checkpoint.js";
export type PreparationHistory = CodePreparationCheckpoint | DesignPreparationCheckpoint;
