# Decisions for ISSUE-eedc4519199b24b4

Decisions the project owner made in chat on 2026-11-09 while this design was reviewed.

## Unit status must be real, and the board reads it

The owner chose to make Epic, Story and Task status real and have the board read it, rather than keep deriving status from design and build records.

## A failed Task holds back its Story unless the approval carries an explicit override

Asked whether a Task whose last build round failed should hold back its Story, the owner chose: hold it back unless the approval carries an explicit override.

The common model's DEF (`docs/epics/one-common-model-every-artifact-E202610192f27754d/DEF.md`, k8 and ac9) requires a Story's Tasks to be complete, and mentions an explicit override only for the code review. This decision deliberately extends that override: the same explicit reason given on the BUILD approval also waives failed or unfinished Tasks, and is recorded on the approval.
