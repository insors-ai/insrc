/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: infra.inventory.terraform
 *
 * Walk the scope for `*.tf` files and enumerate top-level
 * declarations: resource, data, module, provider, variable,
 * output. Blocks are located by a real HCL parser
 * (`@cdktf/hcl2json`, a WASM wrapper of tmccombs/hcl2json), not
 * regex -- so non-canonical-but-valid formatting (e.g. an indented
 * top-level block) is captured, where the old column-0-anchored
 * regex silently dropped it. Bodies are still treated as
 * structural inventory, not semantic analysis: we record the
 * block's type/name, not its arguments.
 *
 * A file that fails to parse (invalid HCL) is logged at debug and
 * skipped -- one bad file never aborts the run -- mirroring the
 * per-file try/catch+continue in inventory-kubernetes.
 *
 * `*.tfvars` files are scanned only as raw declaration files --
 * they contain assignments, not blocks, so they produce no
 * inventory entries (but their presence is noted in the files[]
 * summary).
 *
 * Output:
 *   { 'tf-inventory': {
 *       files:       Array<{ path, resourceCount, providerCount,
 *                            moduleCount, variableCount,
 *                            dataCount, outputCount }>,
 *       resources:   Array<{ file, type, name }>,
 *       data:        Array<{ file, type, name }>,
 *       modules:     Array<{ file, name }>,
 *       providers:   Array<{ file, name }>,
 *       variables:   Array<{ file, name }>,
 *       outputs:     Array<{ file, name }>,
 *       truncated:   boolean
 *     } }
 *
 * Deterministic. All lists sorted.
 */

import { readFile } from 'node:fs/promises';

import { parse } from '@cdktf/hcl2json';

import { getLogger } from '../../../shared/logger.js';
import type {
	TemplateExecuteArgs,
	TemplateExecuteResult,
	TemplateRuntime,
} from '../../executor/types.js';
import {
	readScopeRef,
	resolveRepoPath,
	walkFiles,
} from './_shared.js';

const TEMPLATE_ID = 'infra.inventory.terraform';
const log = getLogger('analyze:runtimes:infra:inventory-terraform');

const TF_EXT_RE     = /\.tf$/;
const TFVARS_EXT_RE = /\.tfvars$/;

interface TfRefTwoLabel  { readonly file: string; readonly type: string; readonly name: string; }
interface TfRefOneLabel  { readonly file: string; readonly name: string; }

/** Narrow an unknown value to a plain object (hcl2json block group) or `{}`. */
function asBlockMap(v: unknown): Record<string, unknown> {
	return (v !== null && typeof v === 'object' && !Array.isArray(v))
		? (v as Record<string, unknown>)
		: {};
}

interface TfFileSummary {
	readonly path:          string;
	readonly resourceCount: number;
	readonly providerCount: number;
	readonly moduleCount:   number;
	readonly variableCount: number;
	readonly dataCount:     number;
	readonly outputCount:   number;
}

export const infraInventoryTerraformRuntime: TemplateRuntime = {
	templateId: TEMPLATE_ID,

	async execute(args: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
		const scopeRef = readScopeRef(args, TEMPLATE_ID);
		const repoPath = resolveRepoPath(scopeRef, TEMPLATE_ID);

		const { files: walked, truncated } = await walkFiles(repoPath);

		const tfFiles = walked.filter(f =>
			TF_EXT_RE.test(f.relPath) || TFVARS_EXT_RE.test(f.relPath),
		);

		const resources: TfRefTwoLabel[] = [];
		const dataRefs:  TfRefTwoLabel[] = [];
		const modules:   TfRefOneLabel[] = [];
		const providers: TfRefOneLabel[] = [];
		const variables: TfRefOneLabel[] = [];
		const outputs:   TfRefOneLabel[] = [];

		const filesSeen = new Map<string, {
			res: number; data: number; mod: number;
			prov: number; vars: number; out: number;
		}>();

		const bumpFile = (path: string,
			field: 'res' | 'data' | 'mod' | 'prov' | 'vars' | 'out',
		): void => {
			let e = filesSeen.get(path);
			if (e === undefined) {
				e = { res: 0, data: 0, mod: 0, prov: 0, vars: 0, out: 0 };
				filesSeen.set(path, e);
			}
			e[field]++;
		};

		// Two-label blocks (resource / data): hcl2json shape is
		//   { <type>: { <name>: [ ...blocks ] } }
		// -> one {file,type,name} per distinct name key.
		const collectTwoLabel = (
			file: string, group: unknown, sink: TfRefTwoLabel[],
			field: 'res' | 'data',
		): void => {
			for (const [type, byName] of Object.entries(asBlockMap(group))) {
				for (const name of Object.keys(asBlockMap(byName))) {
					sink.push({ file, type, name });
					bumpFile(file, field);
				}
			}
		};

		// One-label blocks (module / provider / variable / output): hcl2json
		// shape is { <name>: [ ...blocks ] } -> one {file,name} per name key.
		const collectOneLabel = (
			file: string, group: unknown, sink: TfRefOneLabel[],
			field: 'mod' | 'prov' | 'vars' | 'out',
		): void => {
			for (const name of Object.keys(asBlockMap(group))) {
				sink.push({ file, name });
				bumpFile(file, field);
			}
		};

		for (const f of tfFiles) {
			let text: string;
			try {
				text = await readFile(f.absPath, 'utf8');
			} catch (err) {
				log.debug({ file: f.relPath, err: (err as Error).message }, 'inventory.terraform: read failed');
				continue;
			}

			// .tfvars files: just acknowledge presence in filesSeen so
			// the summary shows them as "0 of everything." They carry
			// value assignments, not blocks, so there is nothing to walk.
			if (TFVARS_EXT_RE.test(f.relPath)) {
				bumpFile(f.relPath, 'res'); // bump-then-decrement keeps the
				filesSeen.get(f.relPath)!.res--;  // file in the summary at zero counts
				continue;
			}

			// A file that fails to parse (invalid HCL) is dropped, not thrown
			// -- mirrors inventory-kubernetes's per-file YAML try/catch.
			let json: Record<string, unknown>;
			try {
				json = await parse(f.relPath, text);
			} catch (err) {
				log.debug({ file: f.relPath, err: (err as Error).message }, 'inventory.terraform: HCL parse failed -- skipping');
				continue;
			}

			collectTwoLabel(f.relPath, json['resource'], resources, 'res');
			collectTwoLabel(f.relPath, json['data'],     dataRefs,  'data');
			collectOneLabel(f.relPath, json['module'],   modules,   'mod');
			collectOneLabel(f.relPath, json['provider'], providers, 'prov');
			collectOneLabel(f.relPath, json['variable'], variables, 'vars');
			collectOneLabel(f.relPath, json['output'],   outputs,   'out');
		}

		const cmpTwo = (a: TfRefTwoLabel, b: TfRefTwoLabel): number => {
			if (a.file !== b.file) return a.file < b.file ? -1 : 1;
			if (a.type !== b.type) return a.type < b.type ? -1 : 1;
			return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
		};
		const cmpOne = (a: TfRefOneLabel, b: TfRefOneLabel): number => {
			if (a.file !== b.file) return a.file < b.file ? -1 : 1;
			return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
		};
		resources.sort(cmpTwo);
		dataRefs.sort(cmpTwo);
		modules.sort(cmpOne);
		providers.sort(cmpOne);
		variables.sort(cmpOne);
		outputs.sort(cmpOne);

		const files: TfFileSummary[] = Array.from(filesSeen.entries())
			.map(([path, e]): TfFileSummary => ({
				path,
				resourceCount: e.res,
				providerCount: e.prov,
				moduleCount:   e.mod,
				variableCount: e.vars,
				dataCount:     e.data,
				outputCount:   e.out,
			}))
			.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

		const inventory = {
			files,
			resources,
			data: dataRefs,
			modules,
			providers,
			variables,
			outputs,
			truncated,
		};

		log.info(
			{
				runId:         args.runId,
				taskId:        args.task.taskId,
				repoPath,
				tfFiles:       tfFiles.length,
				resourceCount: resources.length,
				providerCount: providers.length,
				moduleCount:   modules.length,
				variableCount: variables.length,
				dataCount:     dataRefs.length,
				outputCount:   outputs.length,
				truncated,
			},
			'infra.inventory.terraform: enumerated',
		);

		return {
			outputs: new Map<string, unknown>([['tf-inventory', inventory]]),
		};
	},
};
