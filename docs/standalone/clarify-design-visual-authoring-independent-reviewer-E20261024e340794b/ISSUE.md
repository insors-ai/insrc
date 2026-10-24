<!-- insrc:artifact ISSUE-e340794b16e4d4b3 -->

# Clarify design visual authoring and independent reviewer checks

## Reproduction

Read the front-door steering and HLD/LLD guides when designing a substantial data model or UI: existing-code diagrams route to docgen, but proposed ER/sequence/component/UX companion definitions are not explained. Review a design lacking those definitions: steering does not instruct an independent necessity assessment or checking the actual generated file/link/rendered content. Expected: conditional generation where helpful and reviewer findings when missing visuals impede assessment, with no blanket diagram requirement.

## Root cause

Canonical steering describes docgen for existing code and workflow mechanics without exposing the existing structured design-companion authoring path or independent artifact-necessity checks. The design-review adapter builds its prompt from a review template, so reviewer guidance must reach that actual prompt as well as the steering.

## Fix intent

Clarify proposed-design visual routing and structured definition ownership in steering/design guides. Instruct design reviewers to assess ER, sequence, component and UX needs independently of whether a definition exists; inspect available companion files, links, rendering and design consistency, qualify unavailable rendering, request author corrections, and grade omissions by material ambiguity. Preserve the three-round cap, synchronize shipped steering copies and add focused prompt regression checks; no new renderer or storage/API contract.

## Citations

- **[[c1]]** `code` `src/prompts/steering-block.md`
- **[[c2]]** `code` `src/workflow/review-pipeline/design-review.ts`
- **[[c3]]** `stakeholder` `User request: fix the identified visual-authoring and reviewer artifact-check gaps.`
