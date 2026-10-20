# Ontology mocks

Open [Domain explorer](ontology-viewer.html) to inspect the ontology or
[Ontology draft](ontology-editor.html) to edit and review it. Both are standalone
HTML files with the repository's Mermaid 10.9.1 and svg-pan-zoom 3.6.2 embedded.
They require no server or network access. The [HTML PRD](../ontology-builder-prd.html)
explains the proposed requirements and rendering approach.

The examples use fictional commerce data. Edits and review decisions stay in
memory and reset on reload; there is no daemon or repository write. The draft
form performs illustrative required-field checks, not SHACL validation.

## Viewer scenarios

- Select a graph node or explorer concept to inspect its definition and evidence.
- Choose View full entity model to inspect every captured field, including non-key and nested attributes, types, nullability, defaults, constraints, relationships, and source metadata.
- From Customer, switch between its domain model and technical representations; search fields or inspect the structured model source. Selecting an identifier opens its containing model.
- Open a source excerpt from the inspector. The billing field shows an existing `db_sql_describe` result and snapshot provenance.
- Open Evidence pipeline to inspect the existing discovery, schema, relationship, lineage, and drift steps, including steps not run.
- Switch between the graph and mapping table.
- Search by name or context; change the filter to include proposed and stale mappings.
- Zoom in, zoom out, or fit the focused graph.
- Open the editor from the main action or tab.

## Editor scenarios

- Select a concept, edit its name, context, or definition, and save a draft.
- Empty fields and definitions shorter than 25 characters are rejected by the fixture form.
- Open Review draft to compare the proposed definition with the active version.
- Activate only after checking the explicit review acknowledgement; discard keeps the active version.
- Inspect the identity-to-billing evidence and accept or reject the close-match proposal.
- Exact equivalence is unavailable in this mock because the two concepts have different lifecycles.

## Verification

Script syntax, search and filter logic, draft isolation, required-field checks,
activation guards, revision activation, mapping decisions, source dialog behavior,
and static HTML links and IDs were checked. The embedded Mermaid bundle is verified against the vendored source and every embedded script passes syntax checks. Visual layout, keyboard focus behavior, and zoom gestures still need browser verification.

The diagrams use strict security mode, generated node IDs, controlled host selection
handlers, and sanitized labels. These standalone files simulate VS Code theme colors;
a production webview must use the active VS Code theme, local resource URIs, and CSP.

## Regenerate

The editable source is `ontology-source/ontology.template.html`. From the repository
root, run `node docs/mocks/ontology-source/render.mjs` to rebuild both mocks and the
HTML PRD. The renderer embeds local runtimes using a replacement callback so vendor
JavaScript cannot be altered by dollar-pattern expansion. The mock theme follows
insrc terminal typography, surfaces, and terminal color tokens.
