/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Setup service — hardware detection, model recommendation, config
 * apply, and model pulls. Extracted from the former
 * `cli/commands/setup.ts`. The pull uses `spawn` + a progress callback
 * (never `stdio:inherit`, which would fight ink for the terminal).
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { getSystemInfo, type SystemInfo } from '../../shared/system-info.js';
import {
	recommendModels,
	toConfig,
	type ModelRecommendation,
} from '../../shared/model-recommender.js';
import { PATHS } from '../../shared/paths.js';

export function detect(): SystemInfo {
	return getSystemInfo();
}

export function recommend(info: SystemInfo): ModelRecommendation {
	return recommendModels(info);
}

/** Merge the recommendation into the existing config (existing values
 *  win for user keys; model fields always refreshed). Returns the
 *  config path written. Mirrors the old `applyConfig`. */
export function apply(rec: ModelRecommendation): string {
	const recommended = toConfig(rec);
	let existing: Record<string, unknown> = {};
	if (existsSync(PATHS.config)) {
		try { existing = JSON.parse(readFileSync(PATHS.config, 'utf-8')) as Record<string, unknown>; }
		catch { /* start fresh */ }
	}
	const existingModels = (existing['models'] as Record<string, unknown> | undefined) ?? {};
	const merged = {
		...recommended,
		...existing,
		models: {
			...recommended.models,
			...existingModels,
			local:        recommended.models.local,
			embedding:    recommended.models.embedding,
			embeddingDim: recommended.models.embeddingDim,
			context:      recommended.models.context,
			tiers: {
				...recommended.models.tiers,
				...((existingModels['tiers'] as Record<string, unknown> | undefined) ?? {}),
			},
		},
	};
	writeFileSync(PATHS.config, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
	return PATHS.config;
}

/** Which recommended models still need pulling. */
export function modelsToPull(rec: ModelRecommendation): string[] {
	const out: string[] = [];
	if (rec.coder.pull) out.push(rec.coder.model);
	if (rec.embedding.pull) out.push(rec.embedding.model);
	return out;
}

export interface PullTick {
	readonly model: string;
	readonly line:  string;
}

export interface PullResult {
	readonly model: string;
	readonly ok:    boolean;
	readonly error?: string;
}

/** Pull the given models sequentially via `ollama pull`, streaming each
 *  stdout/stderr line to `onProgress`. Never inherits the terminal. */
export async function pullModels(
	models: readonly string[],
	onProgress: (tick: PullTick) => void,
): Promise<PullResult[]> {
	const results: PullResult[] = [];
	for (const model of models) {
		results.push(await pullOne(model, onProgress));
	}
	return results;
}

function pullOne(model: string, onProgress: (tick: PullTick) => void): Promise<PullResult> {
	return new Promise<PullResult>(resolve => {
		const child = spawn('ollama', ['pull', model], { stdio: ['ignore', 'pipe', 'pipe'] });
		const emit = (chunk: Buffer): void => {
			for (const line of chunk.toString().split(/\r?\n/)) {
				const trimmed = line.trim();
				if (trimmed.length > 0) onProgress({ model, line: trimmed });
			}
		};
		child.stdout.on('data', emit);
		child.stderr.on('data', emit);
		child.on('error', err => resolve({ model, ok: false, error: err.message }));
		child.on('close', code => resolve(
			code === 0 ? { model, ok: true } : { model, ok: false, error: `exit ${code}` },
		));
	});
}
