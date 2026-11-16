/** Read-only historical review compatibility. No live review execution. */
import type { DesignAttempt } from "./contracts.js";
type Action = NonNullable<DesignAttempt['actions']>[number];
export function qualifiedDesignAction(action: Action): boolean { return action.validation === undefined || action.validation === 'qualified'; }
