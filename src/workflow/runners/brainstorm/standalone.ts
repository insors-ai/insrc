/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Standalone invocation context for the `brainstorm` stage (Epic
 * `frame-epic-new-pre-workflow-brainstorm`, Story S001 — sc2).
 *
 * Brainstorm runs BEFORE `define` / `design.story`, so unlike the design
 * runners it has no parent Epic or approved upstream artifact to read: its
 * only input is the user's rough one-line idea. The peer to design-story's
 * richer `StandaloneStoryContext` is therefore deliberately minimal — a single
 * `focus` string. The elicitation-behaviour stories (S002–S005) build the
 * working statement / questions on top of this seed; this scaffold story only
 * defines the shape.
 */

/** The seed for a standalone brainstorm run: the rough idea to elicit into a spec. */
export interface StandaloneBrainstormContext {
	readonly focus: string;
}

/** Build the standalone context from a run's focus string. Pure; no params
 *  reshape is needed since brainstorm's only standalone input is the idea. */
export function standaloneBrainstormContext(focus: string): StandaloneBrainstormContext {
	return { focus };
}
