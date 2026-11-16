/** Read-only historical review compatibility. No live review execution. */
import type { ReviewReport, Finding } from "./types.js";
export interface ReviewArtifactResult {
    readonly report: ReviewReport;
    readonly applied: readonly never[];
    readonly skipped: readonly never[];
    readonly pendingUser: readonly Finding[];
}
