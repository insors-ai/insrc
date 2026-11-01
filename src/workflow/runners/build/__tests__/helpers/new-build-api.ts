/** The build runners' git reads of the tool-registry version, in the shape helpers/build-scenarios.ts reads with. Not a test file. */
import { headFullSha } from '../../../../gates.js';
import { readBuildStart, resolveStoryRangeBase, resolveStoryRangeEnd, stampBuildStart } from '../../range-base.js';
import { headShortSha, persistBuildRecord } from '../../standalone-record.js';
import type { BuildApi } from './build-scenarios.js';

export const newBuildApi: BuildApi = {
	readBuildStart, stampBuildStart, resolveStoryRangeBase, resolveStoryRangeEnd, headShortSha, headFullSha,
	persistBuildRecord: (repo, rec) => persistBuildRecord(repo, rec as never),
};
