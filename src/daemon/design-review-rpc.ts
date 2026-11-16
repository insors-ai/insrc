import { reviewUnavailable } from '../workflow/review-unavailable.js';
export async function designReviewStep(..._args: readonly unknown[]): Promise<never> { return reviewUnavailable('design'); }
export async function designReviewOperation(..._args: readonly unknown[]): Promise<never> { return reviewUnavailable('design'); }
