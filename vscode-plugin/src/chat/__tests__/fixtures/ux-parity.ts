/**
 * S004/t2 — SHARED fixtures for the cross-process UX parity harness.
 *
 * ONE source of card bodies, consumed by BOTH sides of the comparison: the
 * daemon's `renderUxMockDocument` (imported from src/workflow/artifacts/companion/
 * ux.ts) and the client's `uxRenderCard` (lifted out of DOCS_UX_SOURCE and
 * `new Function`-evaluated). Sharing the fixtures is the point — if each side
 * carried its own, the diff would compare two authors' intentions rather than two
 * renderers, and a drift could hide in the fixture rather than show in the result.
 *
 * These live in the PLUGIN test tree rather than beside the daemon's tests
 * (where S003's er-parity.ts sits) for one reason: S004 must touch no file under
 * `src/`, which is what makes it the only Story in this Epic needing no daemon
 * rebuild. The plugin test tree already imports across the boundary, so the
 * daemon renderer is reachable from here without putting anything there.
 */

/** Minimal shape — the fixtures are deliberately plain data, asserted against the
 *  daemon's own UxDefinition type at the point of use rather than re-declared. */
export interface UxFixture {
  readonly name: string;
  readonly why: string;
  readonly card: { type: 'AdaptiveCard'; version?: string; body: readonly unknown[] };
}

/**
 * Eight fixtures, one per union member as the PRIMARY subject, plus the two
 * arrangements the structural diff exists to protect: a nested ColumnSet (where
 * "every element present, nested wrongly" is the plausible failure) and a card
 * mixing every member at once.
 */
export const UX_PARITY_FIXTURES: readonly UxFixture[] = [
  {
    name: 'textblock-modifiers',
    why: 'Every modifier the daemon maps — weight, size, colour, isSubtle — on one card. 23 isSubtle and 41 size/weight occurrences across the real records, so a renderer that drops them flattens real authored emphasis.',
    card: {
      type: 'AdaptiveCard',
      body: [
        { type: 'TextBlock', text: 'plain' },
        { type: 'TextBlock', text: 'bolder', weight: 'bolder' },
        { type: 'TextBlock', text: 'lighter', weight: 'lighter' },
        { type: 'TextBlock', text: 'subtle', isSubtle: true },
        { type: 'TextBlock', text: 'small', size: 'small' },
        { type: 'TextBlock', text: 'extraLarge', size: 'extraLarge' },
        { type: 'TextBlock', text: 'accent', color: 'accent' },
        { type: 'TextBlock', text: 'attention', color: 'attention' },
        { type: 'TextBlock', text: 'all at once', weight: 'bolder', size: 'large', color: 'good', isSubtle: true },
      ],
    },
  },
  {
    name: 'container-nesting',
    why: 'A Container inside a Container: the child list comes from `items`, and the border/padding geometry is what makes grouping readable.',
    card: {
      type: 'AdaptiveCard',
      body: [
        {
          type: 'Container',
          items: [
            { type: 'TextBlock', text: 'outer' },
            { type: 'Container', items: [{ type: 'TextBlock', text: 'inner' }] },
          ],
        },
      ],
    },
  },
  {
    name: 'columnset-widths',
    why: 'The most layout-dependent thing a card expresses. A numeric width becomes the flex grow factor, a keyword falls back to 1, and an absent width sets no style — three distinct outcomes in one fixture.',
    card: {
      type: 'AdaptiveCard',
      body: [
        {
          type: 'ColumnSet',
          columns: [
            { type: 'Column', width: 2, items: [{ type: 'TextBlock', text: 'wide' }] },
            { type: 'Column', width: 'stretch', items: [{ type: 'TextBlock', text: 'keyword' }] },
            { type: 'Column', items: [{ type: 'TextBlock', text: 'no width' }] },
          ],
        },
      ],
    },
  },
  {
    name: 'columnset-nested-arrangement',
    why: 'THE fixture the structural diff exists for: a ColumnSet whose Column holds another ColumnSet. Every element could be present with the right class and nested wrongly — the one failure mode a class-vocabulary check cannot see and a screenshot might not either.',
    card: {
      type: 'AdaptiveCard',
      body: [
        {
          type: 'ColumnSet',
          columns: [
            {
              type: 'Column',
              width: 1,
              items: [
                { type: 'TextBlock', text: 'left' },
                {
                  type: 'ColumnSet',
                  columns: [
                    { type: 'Column', items: [{ type: 'TextBlock', text: 'left-left' }] },
                    { type: 'Column', items: [{ type: 'TextBlock', text: 'left-right' }] },
                  ],
                },
              ],
            },
            { type: 'Column', width: 1, items: [{ type: 'TextBlock', text: 'right' }] },
          ],
        },
      ],
    },
  },
  {
    name: 'image-placeholder',
    why: 'The element where a renderer would most naturally reach out. The url is SHOWN and never fetched, so no img element and no src may exist on either side.',
    card: {
      type: 'AdaptiveCard',
      body: [
        { type: 'Image', url: 'https://example.invalid/shot.png', altText: 'A screenshot' },
        { type: 'Image', url: 'https://example.invalid/no-alt.png' },
      ],
    },
  },
  {
    name: 'inputs',
    why: 'Input.Text single and multiline, and Input.ChoiceSet single-select and multi-select — four affordances that must read as fields without being interactive.',
    card: {
      type: 'AdaptiveCard',
      body: [
        { type: 'Input.Text', id: 'note', label: 'Reviewer note', placeholder: 'why this is approved' },
        { type: 'Input.Text', id: 'long', label: 'Detail', placeholder: 'longer', isMultiline: true },
        { type: 'Input.ChoiceSet', id: 'verdict', label: 'Verdict', choices: [{ title: 'Approve' }, { title: 'Request changes' }] },
        { type: 'Input.ChoiceSet', id: 'dims', label: 'Dimensions', isMultiSelect: true, choices: [{ title: 'Adherence' }, { title: 'Coverage' }] },
      ],
    },
  },
  {
    name: 'actions',
    why: 'Submit and OpenUrl must be TELLABLE APART — the correction ux.ts:393-399 records, because the old label joined both titles into one indistinguishable string.',
    card: {
      type: 'AdaptiveCard',
      body: [
        {
          type: 'ActionSet',
          actions: [
            { type: 'Action.Submit', title: 'Approve' },
            { type: 'Action.OpenUrl', title: 'Open companion', url: 'https://example.invalid/companion.html' },
          ],
        },
      ],
    },
  },
  {
    name: 'every-member',
    why: 'All eight union members on one card, in the daemon’s declaration order. The four real records between them use all eight plus both action types, so a renderer handling only the common ones fails three of the four.',
    card: {
      type: 'AdaptiveCard',
      version: '1.5',
      body: [
        { type: 'TextBlock', text: 'Heading', size: 'large', weight: 'bolder' },
        {
          type: 'Container',
          items: [
            {
              type: 'ColumnSet',
              columns: [
                { type: 'Column', width: 2, items: [{ type: 'Image', url: 'https://example.invalid/a.png', altText: 'a' }] },
                { type: 'Column', width: 1, items: [{ type: 'Input.Text', id: 'q', label: 'Q', placeholder: 'p' }] },
              ],
            },
            { type: 'Input.ChoiceSet', id: 'c', label: 'C', choices: [{ title: 'one' }, { title: 'two' }] },
          ],
        },
        { type: 'ActionSet', actions: [{ type: 'Action.Submit', title: 'Go' }] },
      ],
    },
  },
];

/**
 * THE POSITIVE CONTROL. Structurally a sibling of `columnset-nested-arrangement`
 * — the SAME elements with the SAME classes — but the inner ColumnSet is hoisted
 * out of the Column and made a sibling of it. A comparison that cannot tell this
 * apart from the real fixture is not an instrument, so a committed test asserts
 * the diff FAILS on it.
 */
export const UX_RENESTED_FIXTURE: UxFixture = {
  name: 'columnset-nested-arrangement--RENESTED',
  why: 'Same elements, same classes, different ARRANGEMENT. The diff must reject this.',
  card: {
    type: 'AdaptiveCard',
    body: [
      {
        type: 'ColumnSet',
        columns: [
          { type: 'Column', width: 1, items: [{ type: 'TextBlock', text: 'left' }] },
          {
            type: 'ColumnSet',
            columns: [
              { type: 'Column', items: [{ type: 'TextBlock', text: 'left-left' }] },
              { type: 'Column', items: [{ type: 'TextBlock', text: 'left-right' }] },
            ],
          },
          { type: 'Column', width: 1, items: [{ type: 'TextBlock', text: 'right' }] },
        ],
      },
    ],
  },
};
