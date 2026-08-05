/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Debug pane (sc1 scaffold, Story s1) — a peer pane hosting three inner
 * sections (Daemon / MCP / Logs), one shown full-height at a time. The section
 * registry comes from the injected `debug` facade; the pane maps each section
 * id to its view component locally, so no React type lives in the services
 * layer. For s1 every section is a placeholder; s2-s5 swap in the real views.
 *
 * Inner-section navigation uses ←/→ (the outer switcher owns 1-6/Tab), gated on
 * `!useCaptured()` so a modal text field suspends it just like every other pane.
 */

import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import type { ReactElement } from 'react';

import type { DebugSectionId, DebugPaneProps } from '../services/debug-types.js';
import { useCaptured } from '../ui/context.js';
import { Panel, KeyHints } from '../ui/widgets.js';

/** Placeholder section bodies keyed by id. Typed as a Partial string map so a
 *  section whose id has no view (a future/renamed id) falls through to the
 *  inline 'unknown section' guard rather than throwing. s2-s5 replace these. */
const SECTION_VIEWS: Partial<Record<string, () => ReactElement>> = {
	daemon: () => <Text dimColor>Daemon diagnostics — coming soon.</Text>,
	mcp:    () => <Text dimColor>MCP diagnostics — coming soon.</Text>,
	logs:   () => <Text dimColor>Log viewer — coming soon.</Text>,
};

export function DebugPane(props: DebugPaneProps): ReactElement {
	const captured = useCaptured();
	const sections = props.services.debug.sections ?? [];
	const [active, setActive] = useState<DebugSectionId>(sections[0]?.id ?? 'daemon');

	useInput((_input, key) => {
		if (sections.length === 0) return;
		const idx = Math.max(0, sections.findIndex(s => s.id === active));
		if (key.rightArrow) {
			const next = sections[(idx + 1) % sections.length]!.id;
			setActive(prev => (next === prev ? prev : next));
		} else if (key.leftArrow) {
			const next = sections[(idx - 1 + sections.length) % sections.length]!.id;
			setActive(prev => (next === prev ? prev : next));
		}
	}, { isActive: !captured });

	const View = SECTION_VIEWS[active];

	return (
		<Panel title="Debug" active>
			<Box>
				{sections.map((s, i) => (
					<Text key={s.id}>
						{i > 0 ? '  ' : ''}
						<Text color={s.id === active ? 'cyan' : 'gray'} bold={s.id === active} underline={s.id === active}>
							{s.title}
						</Text>
					</Text>
				))}
			</Box>
			<Box marginTop={1}>
				{View !== undefined
					? <View />
					: <Text color="yellow">unknown section: {active}</Text>}
			</Box>
			<Box marginTop={1}>
				<KeyHints hints={[['←/→', 'section']]} />
			</Box>
		</Panel>
	);
}
