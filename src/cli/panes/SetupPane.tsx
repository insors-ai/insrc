/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Setup pane — hardware detection + model recommendation. `a` writes the
 * recommended config; `p` pulls any missing models, streaming ollama's
 * progress into the shared bottom message box via ui.task (never
 * `stdio:inherit`, which would fight ink). The local model is the one the
 * daemon's definitions name (models.definitions); without the daemon the pane
 * says it cannot recommend one and offers neither apply nor pull.
 */

import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import type { SystemInfo } from '../../shared/system-info.js';
import type { LocalModelChoice, ModelRecommendation } from '../../shared/model-recommender.js';
import { CANNOT_RECOMMEND, localModelFrom } from '../services/setup.js';
import { useServices, useUi, useCaptured } from '../ui/context.js';
import { Panel, KeyHints } from '../ui/widgets.js';

export function SetupPane(): ReactElement {
	const svc = useServices();
	const ui = useUi();
	const captured = useCaptured();
	const [busy, setBusy] = useState(false);

	const info = useMemo<SystemInfo>(() => svc.setup.detect(), [svc]);
	// undefined = still asking the daemon; null = it could not answer (or names no local model).
	const [local, setLocal] = useState<LocalModelChoice | null | undefined>(undefined);
	useEffect(() => {
		let live = true;
		svc.models.definitions()
			.then(defs => { if (live) setLocal(localModelFrom(defs) ?? null); })
			.catch(() => { if (live) setLocal(null); });
		return () => { live = false; };
	}, [svc]);
	const rec = useMemo<ModelRecommendation | undefined>(() => (local ? svc.setup.recommend(info, local) : undefined), [svc, info, local]);
	const toPull = useMemo<string[]>(() => (rec !== undefined ? svc.setup.modelsToPull(rec) : []), [svc, rec]);

	useInput((input) => {
		if (rec === undefined) return;
		if (input === 'a') {
			try { ui.toast(`config written to ${svc.setup.apply(rec)}`); }
			catch (err) { ui.toast(`✗ ${err instanceof Error ? err.message : String(err)}`); }
		} else if (input === 'p') {
			if (toPull.length === 0) { ui.toast('all recommended models already installed'); return; }
			setBusy(true); ui.capture(true);
			const task = ui.task(`pulling ${toPull.join(', ')}…`);
			void svc.setup.pullModels(toPull, tick => task.push(`${tick.model}: ${tick.line}`))
				.then(results => {
					const failed = results.filter(r => !r.ok);
					if (failed.length === 0) task.done('models pulled');
					else task.fail(`${failed.map(f => f.model).join(', ')} failed`);
				})
				.finally(() => { setBusy(false); ui.capture(false); });
		}
	}, { isActive: !busy && !captured });

	return (
		<Panel title="Setup" active>
			<Box flexDirection="column">
				<Text bold>System</Text>
				<Text>  CPU   {info.cpu.model} ({info.cpu.cores} cores)</Text>
				<Text>  RAM   {Math.round(info.ram.totalMb / 1024)}GB total · {Math.round(info.ram.freeMb / 1024)}GB free</Text>
				<Text>  GPU   {info.gpu != null ? `${info.gpu.name} · ${Math.round(info.gpu.vramMb / 1024)}GB VRAM` : 'none detected'}</Text>
				<Text>  Ollama {info.ollama.available ? `v${info.ollama.version} (${info.ollama.models.length} models)` : 'not found'}</Text>
			</Box>
			{rec === undefined
				? <Box marginTop={1}><Text {...(local === null ? { color: 'yellow' } : { dimColor: true })}>{local === null ? CANNOT_RECOMMEND : 'asking the daemon for the local model…'}</Text></Box>
				: <>
			<Box flexDirection="column" marginTop={1}>
				<Text bold>Recommendation <Text dimColor>({rec.tier})</Text></Text>
				<Text>  local     {rec.coder.model}{rec.coder.params !== '' ? <Text dimColor> ({rec.coder.params})</Text> : <Text />}{rec.coder.pull ? <Text color="yellow"> ← needs pull</Text> : <Text />}</Text>
				<Text>  embedding {rec.embedding.model} <Text dimColor>({rec.embedding.dims} dims)</Text>{rec.embedding.pull ? <Text color="yellow"> ← needs pull</Text> : <Text />}</Text>
				<Text>  context   {rec.context.shape} <Text dimColor>({rec.context.tokens} tokens)</Text></Text>
			</Box>

			<Box marginTop={1}>
				<KeyHints hints={[['a', 'apply config'], ['p', `pull models${toPull.length > 0 ? ` (${toPull.length})` : ''}`]]} />
			</Box>
				</>}
		</Panel>
	);
}
