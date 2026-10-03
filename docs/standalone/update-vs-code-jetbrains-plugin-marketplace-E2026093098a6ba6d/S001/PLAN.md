<!-- insrc:artifact PLAN-98a6ba6d74975153-S001 -->

# Plan: E2026093098a6ba6d:S001

## Summary

**Epic:** `update-vs-code-jetbrains-plugin-marketplace`
**LLD run:** `wf-1790770074659-svqfc0`
**LLD effective hash:** `98a6ba6d7497...`

Building this Story is three small, independent documentation edits plus one verification pass. Two touch the VS Code plugin (a new Requirements section + Getting Started link in README.md, and a light reword of the one-line package.json description), one touches the JetBrains source plugin.xml <description> CDATA (an Ollama <li> in the Requirements list + a Getting Started link). No code changes; the only 'tests' are smoke checks — JSON/XML well-formedness, the exact URL present, Ollama facts matching the code defaults, and the diff staying inside the three intended files (never the generated build/ plugin.xml copies).

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add a Requirements section + Getting Started link to the VS Code README | S | — | smoke: README Requirements section names Ollama (required-embeddings / optional-core) + contains the getting-started URL; smoke: README Ollama facts match code defaults (qwen3-embedding:0.6b / nomic-embed-text-v1.5 / qwen3.6:27b or claude/codex CLI), no overstatement | [[c4]] [[c5]] [[c6]] |
| 2 | **`t2`** Reword the package.json one-line description | S | — | smoke: package.json description reads local-first / Ollama-backed as plain prose (no Markdown link); smoke: package.json parses as valid JSON after the edit | [[c7]] |
| 3 | **`t3`** Add an Ollama <li> + Getting Started link to the JetBrains source plugin.xml <description> | S | — | smoke: source plugin.xml Requirements <ul> gains an Ollama <li> + the getting-started URL inside the <description> CDATA; smoke: source plugin.xml stays well-formed XML with a valid CDATA <description>; no build/ copy touched | [[c1]] [[c8]] |
| 4 | **`t4`** Verify syntax + diff scope | S | `t1`, `t2`, `t3` | smoke: package.json valid JSON + source plugin.xml well-formed XML/CDATA; smoke: diff limited to README.md + package.json + source plugin.xml (no code file, no build/ copy) | [[c2]] [[c9]] |

### 1.1 E2026093098a6ba6d:S001:T001 — Add a Requirements section + Getting Started link to the VS Code README

In vscode-plugin/README.md, insert a compact '## Requirements' section between the lead paragraph and '## First run': Node, a Claude/AI host, and Ollama with its role split — REQUIRED for local embeddings (default qwen3-embedding:0.6b; ONNX nomic-embed-text-v1.5 no-Ollama alternative) and OPTIONAL for the core model (Ollama qwen3.6:27b, otherwise the claude/codex CLI) — plus a 'Full setup → Getting Started' link to https://insrc.insors.io/getting-started.html. Reuse the existing Markdown heading/list style; additive only, existing content untouched.

**Acceptance checks:**
- README.md has a new '## Requirements' (or '## Prerequisites') section listing Node, an AI host, and Ollama
- The Ollama entry states REQUIRED for local embeddings and OPTIONAL for the core model, with model facts matching code defaults (qwen3-embedding:0.6b / nomic-embed-text-v1.5 / qwen3.6:27b or claude/codex CLI)
- The exact link https://insrc.insors.io/getting-started.html appears in the README
- No pre-existing README content (lead, First run, command list, uninstall note) is removed or altered in meaning

### 1.2 E2026093098a6ba6d:S001:T002 — Reword the package.json one-line description

Lightly reword vscode-plugin/package.json line-4 `description` to hint at the local-first / Ollama-backed nature. Keep it a single valid JSON string in plain prose (no Markdown link — links don't render in the sidebar blurb).

**Acceptance checks:**
- package.json line-4 description reads as local-first / Ollama-backed
- The description contains no Markdown link syntax
- package.json still parses as valid JSON

### 1.3 E2026093098a6ba6d:S001:T003 — Add an Ollama <li> + Getting Started link to the JetBrains source plugin.xml <description>

In jetbrains-plugin/src/main/resources/META-INF/plugin.xml (the SOURCE descriptor only — never the generated build/**/plugin.xml copies), add an Ollama <li> to the existing Requirements <ul> (required for local embeddings; optional for the core model via the claude/codex CLI) and a short 'Getting started' line linking https://insrc.insors.io/getting-started.html inside the <description> CDATA. Keep the HTML/XML well-formed.

**Acceptance checks:**
- The source plugin.xml Requirements <ul> gains an Ollama <li> (required-embeddings / optional-core wording)
- The exact link https://insrc.insors.io/getting-started.html appears inside the <description> CDATA
- The edit is only in src/main/resources/META-INF/plugin.xml, NOT any jetbrains-plugin/build/**/plugin.xml copy
- plugin.xml remains well-formed XML with a valid CDATA <description>

### 1.4 E2026093098a6ba6d:S001:T004 — Verify syntax + diff scope

Verify package.json parses as JSON, plugin.xml is well-formed XML, both the README and the source plugin.xml contain the exact Getting Started URL, and the diff is limited to the three intended files (no .ts/.kt/.java code file changed, no build/ plugin.xml copy touched).

**Acceptance checks:**
- python json.load on vscode-plugin/package.json succeeds
- an XML well-formedness parse of the source plugin.xml succeeds
- grep finds https://insrc.insors.io/getting-started.html in both README.md and the source plugin.xml
- git diff --name-only lists only vscode-plugin/README.md, vscode-plugin/package.json, and jetbrains-plugin/src/main/resources/META-INF/plugin.xml

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| vscode-plugin/README.md has a Requirements section naming Ollama (required for local embeddings / optional for the core model) + a https://insrc.insors.io/getting-started.html link | `t1` |
| jetbrains plugin.xml Requirements <ul> gains an Ollama <li> + a Getting Started link to the same URL | `t3` |
| the package.json line-4 description stays plain prose (no unrendered Markdown link) but reads local-first / Ollama-backed | `t2` |
| the Ollama facts match the code defaults (qwen3-embedding:0.6b, ONNX nomic-embed-text-v1.5, core optional via claude/codex CLI) — no overstatement | `t1`, `t3` |
| package.json parses as valid JSON after the description edit | `t2`, `t4` |
| plugin.xml stays well-formed XML with a valid <description> CDATA (patchPluginXml/verifyPlugin would fail otherwise) — grep confirms the edit is in src/main/resources/META-INF/plugin.xml, NOT the generated build/ copies | `t3`, `t4` |
| no code file (.ts/.kt/.java) changed; grep confirms the diff is limited to README.md + package.json + the source plugin.xml | `t4` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 invariant c1 — edit ONLY the source jetbrains-plugin/src/main/resources/META-INF/plugin.xml, never the generated build/**/plugin.xml copies`
- **[[c2]]** `prior-artifact` `LLD S001 invariant c2 — docs/prose only, no code file change, no daemon rebuild; effective on next Marketplace publish`
- **[[c4]]** `prior-artifact` `LLD S001 dataModelChange — vscode-plugin/README.md: add a Requirements section + Getting Started link`
- **[[c5]]** `prior-artifact` `LLD S001 invariant c3 — accurate Ollama facts: required for local embeddings (qwen3-embedding:0.6b / ONNX nomic-embed-text-v1.5), optional for the core model (qwen3.6:27b or claude/codex CLI)`
- **[[c6]]** `analyze-bundle` `plan s1 structural-map — README.md insertion point between the lead paragraph and '## First run'; getting-started URL from site/CNAME (insrc.insors.io)`
- **[[c7]]** `prior-artifact` `LLD S001 dataModelChange — vscode-plugin/package.json:4: lightly reword the one-line description (plain prose, no link)`
- **[[c8]]** `prior-artifact` `LLD S001 dataModelChange — jetbrains source plugin.xml <description> CDATA: add an Ollama <li> to the Requirements <ul> + a Getting Started link`
- **[[c9]]** `prior-artifact` `LLD S001 testStrategy — verify JSON/XML well-formedness + exact URL present + diff scope limited to the three intended files`
