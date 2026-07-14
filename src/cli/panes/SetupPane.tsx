/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Setup pane — hardware detection + model recommendation. `a` writes the
 * recommended config; `p` pulls any missing models, streaming ollama's
 * progress into a log (never `stdio:inherit`, which would fight ink).
 */

import { Box, Text, useInput } from 'ink';
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import type { SystemInfo } from '../../shared/system-info.js';
import type { ModelRecommendation } from '../../shared/model-recommender.js';
import { useServices, useUi } from '../ui/context.js';
import { Panel, KeyHints, LogView } from '../ui/widgets.js';

export function SetupPane(): ReactElement {
	const svc = useServices();
	const ui = useUi();
	const [busy, setBusy] = useState(false);
	const [log, setLog] = useState<string[]>([]);

	const info = useMemo<SystemInfo>(() => svc.setup.detect(), [svc]);
	const rec = useMemo<ModelRecommendation>(() => svc.setup.recommend(info), [svc, info]);
	const toPull = useMemo<string[]>(() => svc.setup.modelsToPull(rec), [svc, rec]);

	useInput((input) => {
		if (input === 'a') {
			try { ui.toast(`config written to ${svc.setup.apply(rec)}`); }
			catch (err) { ui.toast(`✗ ${err instanceof Error ? err.message : String(err)}`); }
		} else if (input === 'p') {
			if (toPull.length === 0) { ui.toast('all recommended models already installed'); return; }
			setBusy(true); setLog([`pulling ${toPull.join(', ')}…`]); ui.capture(true);
			void svc.setup.pullModels(toPull, tick => setLog(l => [...l.slice(-40), `${tick.model}: ${tick.line}`]))
				.then(results => {
					const failed = results.filter(r => !r.ok);
					ui.toast(failed.length === 0 ? 'models pulled' : `✗ ${failed.map(f => f.model).join(', ')} failed`);
				})
				.finally(() => { setBusy(false); ui.capture(false); });
		}
	}, { isActive: !busy });

	return (
		<Panel title="Setup" active>
			<Box flexDirection="column">
				<Text bold>System</Text>
				<Text>  CPU   {info.cpu.model} ({info.cpu.cores} cores)</Text>
				<Text>  RAM   {Math.round(info.ram.totalMb / 1024)}GB total · {Math.round(info.ram.freeMb / 1024)}GB free</Text>
				<Text>  GPU   {info.gpu != null ? `${info.gpu.name} · ${Math.round(info.gpu.vramMb / 1024)}GB VRAM` : 'none detected'}</Text>
				<Text>  Ollama {info.ollama.available ? `v${info.ollama.version} (${info.ollama.models.length} models)` : 'not found'}</Text>
			</Box>
			<Box flexDirection="column" marginTop={1}>
				<Text bold>Recommendation <Text dimColor>({rec.tier})</Text></Text>
				<Text>  coder     {rec.coder.model} <Text dimColor>({rec.coder.params})</Text>{rec.coder.pull ? <Text color="yellow"> ← needs pull</Text> : <Text />}</Text>
				<Text>  embedding {rec.embedding.model} <Text dimColor>({rec.embedding.dims} dims)</Text>{rec.embedding.pull ? <Text color="yellow"> ← needs pull</Text> : <Text />}</Text>
				<Text>  context   {rec.context.shape} <Text dimColor>({rec.context.tokens} tokens)</Text></Text>
			</Box>

			{(busy || log.length > 0) && (
				<Box flexDirection="column" marginTop={1}>
					<Text dimColor>{busy ? '⏳ pulling…' : 'last pull:'}</Text>
					<LogView lines={log} />
				</Box>
			)}

			<Box marginTop={1}>
				<KeyHints hints={[['a', 'apply config'], ['p', `pull models${toPull.length > 0 ? ` (${toPull.length})` : ''}`]]} />
			</Box>
		</Panel>
	);
}
