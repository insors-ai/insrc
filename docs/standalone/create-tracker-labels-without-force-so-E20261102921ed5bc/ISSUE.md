<!-- insrc:artifact ISSUE-921ed5bc6e27e50f -->

# Create tracker labels without force so a push needs no approval

## Reproduction

Push an Epic to GitHub with the tracker enabled (insrc workflow tracker push, or the tracker step of a team Story) with no approval client attached, or with a TUI that is not watching. The label step calls gh_label create with force:true. Observed: the call is classed destructive, asks for approval, and is denied with 'no-client' or times out after 300 s, so the push stops at the first label. Expected: creating the labels the tracker needs is routine setup and needs no approval.

## Root cause

ghCreateLabel in src/workflow/tracker/registry-table.ts runs gh_label with op create and force:true, to make an existing label not an error. In src/daemon/tools/builtins/gh/helpers.ts ghApprovalClass raises a common op to destructive when any of the inputs force, clobber, visibility, newName, newTag or extraArgs is set, and gh_label create is common (src/daemon/tools/builtins/gh/resources.ts). So the tracker's own call is destructive, which always asks and is denied with no client.

## Fix intent

Create each label without force. A create that fails because the label already exists counts as success (the label is there), found by listing the repository labels for that exact name. A denial is still thrown and never swallowed, and a failure for any other reason still answers false. The approval class of gh_label is not changed: a real forced overwrite still asks.

## Citations

- **[[c1]]** `code` `src/workflow/tracker/registry-table.ts`
- **[[c2]]** `code` `src/daemon/tools/builtins/gh/helpers.ts`
- **[[c3]]** `code` `src/daemon/tools/builtins/gh/resources.ts`
