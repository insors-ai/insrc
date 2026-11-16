/** Read-only historical review compatibility. No live review execution. */
/** Exclude exactly operational lifetime metadata, not input, results or pins. */
export function withoutReviewResourceGuard<T extends object>(attempt: T): Omit<T, 'resourceGuard'> {
    const { resourceGuard: _guard, ...evidence } = attempt as T & {
        resourceGuard?: unknown;
    };
    return evidence;
}
