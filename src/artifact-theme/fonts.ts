/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Packaged Poppins (OFL-1.1) as base64 data-URI @font-face rules, so generated
 * artifacts embed the brand typeface OFFLINE — no Google Fonts/CDN request at
 * runtime (NFR3). The woff2 files ship under src/assets/fonts/poppins (see its
 * OFL.txt); copy-assets.mjs mirrors them into out/assets/fonts.
 *
 * Read at GENERATION time (the daemon/renderer reads the bytes and inlines
 * them); a missing asset degrades to the CSS fallback stack, never to a fetch.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** src/artifact-theme/fonts.ts → src/assets/fonts/poppins (out/… → out/assets/…). */
export const FONT_ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts', 'poppins');

/** The three packaged weights. */
export const POPPINS_WEIGHTS = [
	{ weight: 400, file: 'poppins-400.woff2', cssWeight: 400 },
	{ weight: 600, file: 'poppins-600.woff2', cssWeight: 600 },
	{ weight: 700, file: 'poppins-700.woff2', cssWeight: 700 },
] as const;

/** The sans-serif fallback stack used in every font-family declaration. */
export const FALLBACK_FONT_STACK = 'Poppins, Arial, Helvetica, sans-serif';

/**
 * The @font-face CSS embedding each packaged weight as a base64 data URI.
 * When a woff2 cannot be read, its rule is OMITTED and the fallback stack
 * carries the text (readable degradation, NFR3) — never a remote request.
 */
export function fontFaceCss(dir: string = FONT_ASSET_DIR): string {
	const rules: string[] = [];
	for (const w of POPPINS_WEIGHTS) {
		try {
			const b64 = readFileSync(join(dir, w.file)).toString('base64');
			rules.push(
				`@font-face{font-family:'Poppins';font-style:normal;font-weight:${w.cssWeight};font-display:swap;` +
				`src:url(data:font/woff2;base64,${b64}) format('woff2');}`,
			);
		} catch {
			// missing asset → fallback stack only
		}
	}
	return rules.join('\n');
}
