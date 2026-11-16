/** Read-only historical review compatibility. No live review execution. */
import { requireReview } from "./contracts.js";
export function canonicalReviewStory(story: string, hash: string): string {
    const local = story.startsWith(`STORY-${hash}-`) ? story.slice(`STORY-${hash}-`.length) : story;
    requireReview(/^s\d+$/.test(local), 'storyId', 'Expected canonical story identity');
    return local;
}
