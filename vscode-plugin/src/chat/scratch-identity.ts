/** sc1: one identity per legacy scratchpad, independent of the active workspace.
 * S007 owns persisted associations and must preserve these identities when moving notes. */
export interface ScratchpadRef {
  readonly repo: string;
  readonly stableId: string;
}

export const HOME_SCRATCHPAD_SCOPE = 'insrc:scratchpads:home';
