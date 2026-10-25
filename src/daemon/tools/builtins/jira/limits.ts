/**
 * The finite bounds and the identifier patterns of the Jira tools. The op builder of the gh families has a minimum but no
 * maximum, no maxItems and no value patterns; the Jira input layer (input.ts) adds them from here.
 */

export const JIRA_LIMITS = {
  keysMax: 50,
  searchDefault: 50,
  searchMax: 500,
  projectDefault: 30,
  projectMax: 200,
  commentDefault: 50,
  commentMax: 200,
} as const;

/** The name of an issue type, a status or a link type: starts with a letter or digit, so it can never read as a flag. */
const NAME = /^[A-Za-z0-9][\w .,:/()'&-]*$/;

/** None of these allows a leading '-', so a value can never be read by acli as a flag. */
export const JIRA_PATTERNS = {
  workItemKey: /^[A-Z][A-Z0-9_]*-\d+$/,
  projectKey: /^[A-Z][A-Z0-9_]*$/,
  numericId: /^\d+$/,
  linkTypeName: NAME,
  statusName: NAME,
  /** An email address, an account id, '@me' or 'default'. */
  assignee: /^(?:@me|default|[A-Za-z0-9][^\s]*)$/,
} as const;

export type JiraPatternName = keyof typeof JIRA_PATTERNS;
