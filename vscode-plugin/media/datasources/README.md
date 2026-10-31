# Datasource identification artwork

Original SVGs are pinned to upstream revisions in `sources.json`, with byte hashes, source URLs, type mappings and licenses. Collection license texts are included beside them. Brand names and product marks belong to their respective owners; use here identifies the corresponding datasource and does not imply endorsement.

Sources: Simple Icons (CC0, with Apache-2.0 where explicitly identified in its icon metadata), Devicon (MIT), vscode-icons (MIT), and SVG Logos (CC0). The source files are unmodified; the generated runtime catalog supplies Simple Icons brand colors and isolates internal SVG IDs per instance. A white backing tile keeps the original artwork visible in light/dark/high-contrast themes.

BSON uses MongoDB's mark; Feather uses Apache Arrow's. CSV/TSV share the established CSV file icon, JSON/JSONL/NDJSON share the JSON format mark, fixed-width uses a text-file icon, and XLSX uses Excel artwork. These formats do not receive invented product logos. Names remain visible alongside every icon.

Regenerate the runtime catalog offline from the pinned local files:

```sh
python3 scripts/generate-connection-datasource-icons.py
```

The renderer constructs an allowlisted SVG node tree with DOM APIs. It never injects downloaded markup or makes runtime network requests.
