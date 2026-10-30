/**
 * Regenerate the manifest's catalog-backed settings from the daemon's settings
 * catalog (Epic ce99b72065d03b1b, Story s3).
 *
 * Every `insrc.<path>` key of `contributes.configuration` that mirrors a global
 * CONFIG_CATALOG row takes the row's type, default, enum and description — so
 * the model defaults and effort levels follow the model definitions file and no
 * model fact is written by hand. A row the catalog no longer has is removed; a
 * new row is added to the section titled with its group. Plugin-local keys
 * (insrc.chat.* and the per-role insrc.models.tasks.* axis, the key map's
 * isPluginLocalKey) are left alone. The tier rows (models.tiers.<tier>.runner /
 * .model / .effort) carry no enum and default '' (Epic ce99b72065d03b1b, Story s6):
 * their valid values come from the daemon's model definitions, and the extension
 * checks a tier edit against them.
 * Idempotent: a second run writes nothing.
 *
 * Run (the catalog is TypeScript): npx tsx scripts/sync-manifest-catalog.mjs [--check]
 *   --check  exit 1, writing nothing, when the manifest is out of date.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// SYNC_MANIFEST_PKG: another manifest to sync (tests run it on a temp copy).
const pkgPath = process.env.SYNC_MANIFEST_PKG ?? join(here, '..', 'package.json');
const { CONFIG_CATALOG } = await import(pathToFileURL(join(here, '..', '..', 'src', 'config', 'config-catalog.ts')).href);
const { isPluginLocalKey: isLocal } = await import(pathToFileURL(join(here, '..', 'src', 'config', 'key-map.ts')).href);

/** A tier row: its valid values are the daemon's definitions, not a list in the manifest. */
const TIER_ROW = /^models\.tiers\.([^.]+)\.(runner|model|effort)$/;
const isTierRow = (row) => TIER_ROW.test(row.path);
const TIER_FIELD = { runner: 'model family (runner)', model: 'model', effort: 'reasoning effort' };
/** A tier row's description, naming no family, model or effort (those are the daemon's). */
const tierDescription = (row) => { const [, tier, field] = TIER_ROW.exec(row.path); return `The ${tier} tier's ${TIER_FIELD[field]}.`; };
const TIER_NOTE = ' Valid values come from the daemon\'s model definitions; leave empty for the default. A model the family does not list is checked and approved with `insrc: Set model tier`; a family that runs its CLI on Ollama accepts only its listed models.';
const jsonType = (t) => (t === 'enum' ? 'string' : t);

/** The manifest with every catalog-backed key regenerated from `catalog`. */
export function syncManifest(pkg, catalog) {
	const out = structuredClone(pkg);
	const sections = Array.isArray(out.contributes.configuration) ? out.contributes.configuration : [out.contributes.configuration];
	const rows = new Map(catalog.map((o) => ['insrc.' + o.path, o]));
	const seen = new Set();
	for (const section of sections) {
		for (const key of Object.keys(section.properties ?? {})) {
			if (isLocal(key)) continue;
			const row = rows.get(key);
			if (row === undefined) { delete section.properties[key]; continue; }
			seen.add(key);
			section.properties[key] = schemaOf(section.properties[key], row);
		}
	}
	for (const [key, row] of rows) {
		if (seen.has(key)) continue;
		const section = sections.find((s) => s.title === row.group);
		if (section === undefined) throw new Error(`sync-manifest-catalog: no manifest section titled '${row.group}' for ${key}`);
		section.properties = { ...(section.properties ?? {}), [key]: schemaOf({}, row) };
	}
	return out;
}

/** A key's schema from its catalog row, keeping the existing key order. */
function schemaOf(existing, row) {
	if (isTierRow(row)) {
		const tier = { ...existing, type: 'string', default: '', markdownDescription: tierDescription(row) + TIER_NOTE, scope: 'machine' };
		delete tier.enum;
		return tier;
	}
	const next = { ...existing, type: jsonType(row.type), default: row.default, markdownDescription: row.desc, scope: 'machine' };
	if (row.type === 'enum') next.enum = [...row.enumValues];
	else delete next.enum;
	return next;
}

const before = readFileSync(pkgPath, 'utf8');
// The manifest keeps non-ASCII characters \u-escaped, as it is written.
const escape = (text) => text.replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const after = escape(JSON.stringify(syncManifest(JSON.parse(before), CONFIG_CATALOG), null, 2)) + '\n';
if (after === before) {
	console.log('[sync-manifest-catalog] manifest is up to date');
} else if (process.argv.includes('--check')) {
	console.error('[sync-manifest-catalog] the manifest differs from the settings catalog: run npx tsx scripts/sync-manifest-catalog.mjs');
	process.exit(1);
} else {
	writeFileSync(pkgPath, after);
	console.log('[sync-manifest-catalog] regenerated the catalog-backed settings in package.json');
}
