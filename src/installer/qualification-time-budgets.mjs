/** Explicit trusted qualification preloader. Production code must import the
 * environment-independent operation policy instead of this selector. */
import { admitQualification } from './operation-time-budgets.mjs';
export const QUALIFICATION_TIME_BUDGETS = admitQualification(
  process.env.INSRC_QUALIFICATION_PROFILE ?? 'normal', import.meta.url);
