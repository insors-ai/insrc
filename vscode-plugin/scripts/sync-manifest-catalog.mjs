/**
 * Regenerate the manifest's backend-derived settings from the daemon's settings
 * catalog and role taxonomy (Epic ce99b72065d03b1b, Story s3; ISSUE-1e2052060dec3efb).
 *
 * syncManifest v3 owns the WHOLE backend-derived manifest surface:
 *  - ONE shared row map — every CONFIG_CATALOG row whose `insrc.<path>` key is not
 *    plugin-local (the key map's isPluginLocalKey: `insrc.chat.*` and the
 *    `insrc.models.tasks.*` prefix) — drives BOTH update and insertion of
 *    catalog-backed keys, so the two cannot drift apart. A row the catalog no
 *    longer has is removed; a new row is added to the section titled with its
 *    group, and a missing group section is CREATED (never thrown).
 *  - A separate taxonomy pass owns the ENTIRE per-role prefix: every
 *    `insrc.models.tasks.*` key in every section is deleted, then the canonical
 *    per-role section is regenerated from buildPerRoleKeyMap() (created if
 *    missing; existing key order kept, new roles appended in taxonomy order).
 *  - Duplicate-titled sections consolidate losslessly: the FIRST keeps its title
 *    and all section-level metadata; properties merge first-wins in section
 *    order, so distinct local keys of later duplicates survive. The same
 *    NON-ROLE key with conflicting schemas in duplicate sections is refused with
 *    a `sync-duplicate-conflict` diagnostic (role keys are exempt — the taxonomy
 *    pass regenerates them canonically).
 *  - Plugin-local keys are preserved everywhere, including inside the canonical
 *    per-role section. Stored setting VALUES are never rewritten — schemas and
 *    defaults only. The tier rows (models.tiers.<tier>.runner/.model/.effort)
 *    carry no enum and default '' (Epic ce99b72065d03b1b, Story s6): their valid
 *    values come from the daemon's model definitions, and the extension checks a
 *    tier edit against them.
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
const { isPluginLocalKey: isLocal, buildPerRoleKeyMap, PER_ROLE_PATH_PREFIX } = await import(pathToFileURL(join(here, '..', 'src', 'config', 'key-map.ts')).href);

/** A tier row: its valid values are the daemon's definitions, not a list in the manifest. */
const TIER_ROW = /^models\.tiers\.([^.]+)\.(runner|model|effort)$/;
const isTierRow = (row) => TIER_ROW.test(row.path);
const TIER_FIELD = { runner: 'model family (runner)', model: 'model', effort: 'reasoning effort' };
/** A tier row's description, naming no family, model or effort (those are the daemon's). */
const tierDescription = (row) => { const [, tier, field] = TIER_ROW.exec(row.path); return `The ${tier} tier's ${TIER_FIELD[field]}.`; };
const TIER_NOTE = ' Valid values come from the daemon\'s model definitions; leave empty for the default. A model the family does not list is checked and approved with `insrc: Set model tier`; a family whose CLI runs on a host accepts only its listed models.';
/** A doorway from these flat fields into the grouped Model Tiers panel (Story S001) — VS Code
 *  markdown command links only work in the manifest, so this stays local to the sync script. */
const MODEL_TIERS_PANEL_LINK = '[Open the grouped Model Tiers editor →](command:insrc.status.modelTiers)\n\n';
const jsonType = (t) => (t === 'enum' ? 'string' : t);

/** The native-key prefix of the per-role axis the taxonomy pass owns. */
const ROLE_KEY_PREFIX = 'insrc.' + PER_ROLE_PATH_PREFIX;
const isRoleKey = (key) => key.startsWith(ROLE_KEY_PREFIX);

/**
 * Merge duplicate-titled sections into the first of each title, losslessly: the
 * first keeps its title and ALL section-level metadata; properties merge
 * first-wins in section order, so distinct local keys of later duplicates
 * survive. The same non-role key with CONFLICTING schemas in duplicate sections
 * is refused — it cannot be repaired safely (role keys are exempt: the taxonomy
 * pass regenerates them canonically). Returns the consolidated section list.
 */
function consolidateSections(sections) {
	const out = [];
	const firstByTitle = new Map(); // title -> { slot, index } of the first section with it
	for (let index = 0; index < sections.length; index++) {
		const section = sections[index];
		const title = section.title;
		if (title === undefined || !firstByTitle.has(title)) {
			firstByTitle.set(title, { slot: out.length, index });
			out.push(section);
			continue;
		}
		const first = out[firstByTitle.get(title).slot];
		const firstIndex = firstByTitle.get(title).index;
		const firstProps = (first.properties ??= {});
		for (const [key, schema] of Object.entries(section.properties ?? {})) {
			if (key in firstProps) {
				if (!isRoleKey(key) && JSON.stringify(firstProps[key]) !== JSON.stringify(schema)) {
					throw new Error(`sync-manifest-catalog: sync-duplicate-conflict: '${key}' is declared with conflicting schemas in the duplicate sections titled '${title}' (#${firstIndex + 1} and #${index + 1}); resolve the conflict by hand`);
				}
				continue; // first wins
			}
			firstProps[key] = schema;
		}
	}
	return out;
}

/** The canonical per-role section, regenerated from the role taxonomy: existing
 *  key order is kept (role keys re-derived in place, local keys untouched), new
 *  roles are appended in taxonomy order, and every per-role key elsewhere is
 *  deleted first — a misplaced or duplicated role key cannot survive. */
function syncPerRoleSections(sections) {
	const roleEntries = buildPerRoleKeyMap();
	const roleByKey = new Map(roleEntries.map((e) => [e.nativeKey, e]));
	const canonicalTitle = roleEntries[0].option.group;
	const roleSchema = (e) => ({ type: 'string', enum: [...e.option.enumValues], default: e.option.default, markdownDescription: e.option.desc, scope: 'machine' });
	let canonical = sections.find((s) => s.title === canonicalTitle);
	const oldProps = { ...(canonical?.properties ?? {}) };
	// The taxonomy pass owns the whole prefix: delete every per-role key from every section.
	for (const section of sections) {
		if (!section.properties) continue;
		for (const key of Object.keys(section.properties)) if (isRoleKey(key)) delete section.properties[key];
	}
	if (canonical === undefined) {
		canonical = { title: canonicalTitle, properties: {} };
		sections.push(canonical);
	}
	const next = {};
	for (const [key, schema] of Object.entries(oldProps)) {
		if (isRoleKey(key)) {
			const role = roleByKey.get(key);
			if (role !== undefined) next[key] = roleSchema(role); // retired/duplicated role key dropped or re-derived in place
		} else {
			next[key] = schema; // local keys preserved in place
		}
	}
	for (const entry of roleEntries) if (!(entry.nativeKey in next)) next[entry.nativeKey] = roleSchema(entry); // new roles appended in taxonomy order
	canonical.properties = next;
}

/** The manifest with the whole backend-derived surface regenerated from `catalog`. */
export function syncManifest(pkg, catalog) {
	const out = structuredClone(pkg);
	const raw = out.contributes.configuration;
	const wasArray = Array.isArray(raw);
	let sections = wasArray ? raw : [raw];
	// Duplicate-titled sections consolidate losslessly (first keeps title + section
	// metadata, properties first-wins; conflicting duplicate non-role schemas refuse).
	sections = consolidateSections(sections);
	// ONE shared row map — catalog rows whose insrc.<path> key is not plugin-local —
	// drives BOTH update and insertion.
	const rows = new Map(catalog.filter((o) => !isLocal('insrc.' + o.path)).map((o) => ['insrc.' + o.path, o]));
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
		let section = sections.find((s) => s.title === row.group);
		if (section === undefined) { section = { title: row.group, properties: {} }; sections.push(section); } // missing group section created, never thrown
		section.properties = { ...(section.properties ?? {}), [key]: schemaOf({}, row) };
	}
	// The taxonomy pass owns the ENTIRE per-role prefix.
	syncPerRoleSections(sections);
	out.contributes.configuration = wasArray || sections.length > 1 ? sections : sections[0];
	return out;
}

/** A key's schema from its catalog row, keeping the existing key order. */
function schemaOf(existing, row) {
	if (isTierRow(row)) {
		const tier = { ...existing, type: 'string', default: '', markdownDescription: MODEL_TIERS_PANEL_LINK + tierDescription(row) + TIER_NOTE, scope: 'machine' };
		delete tier.enum;
		return tier;
	}
	const desc = row.path === 'models.coreFloor' ? MODEL_TIERS_PANEL_LINK + row.desc : row.desc;
	const next = { ...existing, type: jsonType(row.type), default: row.default, markdownDescription: desc, scope: 'machine' };
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
