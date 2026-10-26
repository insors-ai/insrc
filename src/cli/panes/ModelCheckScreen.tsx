/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The unknown-model check screen (Epic ce99b72065d03b1b, Story s5), opened by the
 * Model Tiers pane for a model id its family does not serve. t7 wires the
 * hand-off; t8 fills in the check, the verdicts and the decision.
 */

import { Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { TierName } from '../../config/analyze.js';
import type { ModelDefinitionsResult } from '../services/models.js';
import { familyOf } from './model-tiers.js';
import { Panel, KeyHints } from '../ui/widgets.js';

export interface ModelCheckTarget {
	readonly tier:    TierName;
	readonly family:  string;
	readonly modelId: string;
}

export function ModelCheckScreen(props: { target: ModelCheckTarget; defs: ModelDefinitionsResult; onClose: (saved: boolean) => void }): ReactElement {
	const kind = familyOf(props.defs, props.target.family)?.cliKind ?? props.target.family;
	useInput((_input, key) => { if (key.escape) props.onClose(false); });
	return (
		<Panel title="Model Tiers" active>
			<Text bold>Check {props.target.modelId} through the {kind} CLI</Text>
			<KeyHints hints={[['esc', 'back']]} />
		</Panel>
	);
}
