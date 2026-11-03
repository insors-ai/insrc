/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { access, readFile } from 'node:fs/promises';
import { artifactJsonPath, buildArtifactId, defineArtifactId, issueArtifactId, lldArtifactId, planArtifactId } from '../../storage.js';
import type { StoryRoute } from './route.js';

const present = async (path: string): Promise<boolean> => access(path).then(() => true, () => false);

/**
 * Read which artifacts the Story's route produced from the project's stored artifacts, and the BUILD's task ids and focus.
 * A missing BUILD gives no task ids; a route without a Plan then cannot derive its unit and is refused by prepareReviewPacket.
 */
export async function readStoryRoute(project: string, epicHash: string, storyId: string): Promise<StoryRoute> {
	const has = (id: string) => present(artifactJsonPath(project, id));
	let taskIds: string[] = [], focus: string | undefined;
	try {
		const build = JSON.parse(await readFile(artifactJsonPath(project, buildArtifactId(epicHash, storyId)), 'utf8')) as { body?: { tasks?: { id?: unknown }[]; focus?: unknown } };
		taskIds = (build.body?.tasks ?? []).map(task => task.id).filter((id): id is string => typeof id === 'string');
		if (typeof build.body?.focus === 'string') focus = build.body.focus;
	} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
	return {
		epicHash, storyId, build: { taskIds, focus },
		plan: await has(planArtifactId(epicHash, storyId)), lld: await has(lldArtifactId(epicHash, storyId)),
		issue: await has(issueArtifactId(epicHash)), def: await has(defineArtifactId(epicHash)),
	};
}
