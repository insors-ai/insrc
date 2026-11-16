/** Historical cleanup payload only. No cleanup operation remains. */
export interface CleanupResult { deleted: string[]; retained: string[]; errors: string[]; }
