/** The Story change set of the tool-registry version, in the shape helpers/story-scenarios.ts reads with. Not a test file. */
import { changedFiles } from '../../changed-files.js';
import { mergeInProgress, newestStoryCommit, storyChangeSet } from '../../story-commits.js';
import type { StoryApi } from './story-scenarios.js';

export const newStoryApi: StoryApi = { storyChangeSet, newestStoryCommit, mergeInProgress, changedFiles: (repo, opts) => changedFiles(repo, opts) };
