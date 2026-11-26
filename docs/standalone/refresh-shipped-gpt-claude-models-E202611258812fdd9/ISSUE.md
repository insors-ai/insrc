<!-- insrc:artifact ISSUE-8812fdd9dd65534a -->

# Refresh shipped GPT and Claude models

## What was asked

Update the repository model catalog so daemon releases ship the newer GPT and Claude model choices and defaults. Preserve existing saved pins.

## Why

The shipped catalog still defaults Codex to GPT-6 Astra and GPT-6.1 Sol and lists Claude Sonnet 5 and Fable 5.1 as the current entries for those model lines. [[c1]]

## Change

Ship GPT-6.2 Astra and Sol as Codex core and mid defaults. Map sonnet to Claude Sonnet 5.5 and list Fable 5.2. Keep prior IDs selectable, preserve explicit pins and effort during update, and verify live CLI availability, built asset delivery, installer defaults, and update reconciliation. [[c1]]

## Citations

- **[[c1]]** `code` `src/assets/models/cloud-model-catalog.json`
