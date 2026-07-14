/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Runtime: infra.inventory.terraform
 *
 * Walk the scope for `*.tf` files and regex-extract top-level
 * declarations: resource, data, module, provider, variable,
 * output. Bodies are NOT parsed -- this is structural inventory,
 * not semantic analysis.
 *
 * No HCL parser dependency (the project doesn't ship one). The
 * regex covers the canonical formatting (`type "name"` and
 * `"type" "name"`); files with unusual / minified layouts may
 * under-report. Trade-off accepted: lighter dep tree, "good
 * enough" for inventory.
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

// Match a top-level HCL block at column 0 (line start). Allows
// arbitrary leading whitespace on the first arg/quote.
//   resource "<type>" "<name>" {
//   data     "<type>" "<name>" {
const TWO_LABEL_BLOCK_RE = /^(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*\{/gm;
//   module    "<name>" {
//   provider  "<name>" {
//   variable  "<name>" {
//   output    "<name>" {
const ONE_LABEL_BLOCK_RE = /^(module|provider|variable|output)\s+"([^"]+)"\s*\{/gm;

interface TfRefTwoLabel  { readonly file: string; readonly type: string; readonly name: string; }
interface TfRefOneLabel  { readonly file: string; readonly name: string; }

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

		for (const f of tfFiles) {
			let text: string;
			try {
				text = await readFile(f.absPath, 'utf8');
			} catch (err) {
				log.debug({ file: f.relPath, err: (err as Error).message }, 'inventory.terraform: read failed');
				continue;
			}

			// .tfvars files: just acknowledge presence in filesSeen so
			// the summary shows them as "0 of everything." No regex match
			// (assignments, not blocks).
			if (TFVARS_EXT_RE.test(f.relPath)) {
				bumpFile(f.relPath, 'res'); // bump-then-decrement keeps the
				filesSeen.get(f.relPath)!.res--;  // file in the summary at zero counts
				continue;
			}

			for (const m of text.matchAll(TWO_LABEL_BLOCK_RE)) {
				const kind = m[1]!; const type = m[2]!; const name = m[3]!;
				if (kind === 'resource') {
					resources.push({ file: f.relPath, type, name });
					bumpFile(f.relPath, 'res');
				} else {
					dataRefs.push({ file: f.relPath, type, name });
					bumpFile(f.relPath, 'data');
				}
			}
			for (const m of text.matchAll(ONE_LABEL_BLOCK_RE)) {
				const kind = m[1]!; const name = m[2]!;
				switch (kind) {
					case 'module':   modules.push({   file: f.relPath, name }); bumpFile(f.relPath, 'mod');  break;
					case 'provider': providers.push({ file: f.relPath, name }); bumpFile(f.relPath, 'prov'); break;
					case 'variable': variables.push({ file: f.relPath, name }); bumpFile(f.relPath, 'vars'); break;
					case 'output':   outputs.push({   file: f.relPath, name }); bumpFile(f.relPath, 'out');  break;
				}
			}
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
