import { reviewUnavailable } from '../../workflow/review-unavailable.js';
export async function handleDesignReviewStep(..._args: readonly unknown[]): Promise<never> { return reviewUnavailable('design'); }
