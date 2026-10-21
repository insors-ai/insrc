/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The one mapping from a legacy provenance comment's place (an anchor on a file, optionally a line span) to the Feedback
 * anchor (s5). The Feedback shape has no file, so a comment on a companion file stays on the parent artifact with the
 * file's path in `section`; `sectionSlug` becomes `section`, joined to the file as `file#slug` for a companion.
 */

import type { Feedback } from '../artifact-core/types.js';
import type { FeedbackAnchor, ProvenanceTarget } from '../artifacts/provenance/types.js';

export function feedbackAnchorOf(
	anchor: FeedbackAnchor | undefined,
	target: Pick<ProvenanceTarget, 'file' | 'segment'>,
	ownDocument: boolean,
): Feedback['anchor'] {
	const slug = anchor?.sectionSlug;
	const section = ownDocument ? slug : (slug !== undefined ? `${target.file}#${slug}` : target.file);
	if (anchor === undefined && section === undefined && target.segment === undefined) return undefined;
	return {
		...(anchor !== undefined ? { quote: anchor.quote } : {}),
		...(anchor?.prefix !== undefined ? { prefix: anchor.prefix } : {}),
		...(anchor?.suffix !== undefined ? { suffix: anchor.suffix } : {}),
		...(section !== undefined ? { section } : {}),
		...(target.segment !== undefined ? { lines: [target.segment.startLine, target.segment.endLine] as const } : {}),
	};
}
