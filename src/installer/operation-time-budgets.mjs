/** Production policy performs no environment selection. Only an explicitly loaded
 * qualification preloader may admit one of the fixed policies in this process.
 * The private symbol also covers separately bundled/compiled control modules;
 * it is not a request, receipt, environment flag or cross-process capability. */
const scope = (buildMs, fileMs, runMs, cleanupMs) => Object.freeze({ buildMs, fileMs, runMs, cleanupMs });

/** One immutable snapshot per process; explicit scope overrides remain separate. */
function policy(profile) {
  const slow = profile === 'slow-vm';
  return Object.freeze({
  profile,
  coordinator: slow ? scope(2_400_000, 2_400_000, 14_400_000, 30_000) : scope(600_000, 600_000, 5_400_000, 5_000),
  manager: slow ? scope(2_400_000, 2_400_000, 14_400_000, 120_000) : scope(600_000, 600_000, 5_400_000, 5_000),
  qualification: slow ? scope(7_200_000, 7_200_000, 18_000_000, 300_000) : scope(3_600_000, 3_600_000, 7_200_000, 5_000),
  git: slow ? scope(2_400_000, 120_000, 180_000, 30_000) : scope(600_000, 30_000, 40_000, 5_000),
  runtime: Object.freeze({ acquisitionMs: slow ? 2_400_000 : 600_000,
    verificationMs: slow ? 480_000 : 120_000, resourceDrainMs: slow ? 30_000 : 5_000 }),
  });
}

const policies = Object.freeze({ normal: policy('normal'), 'slow-vm': policy('slow-vm') });
const contextKey = Symbol.for('insrc.qualification-time-context.v1');
const invalid = message => Object.assign(new Error(message), { code: 'qualification-profile-invalid' });
export function operationTimeBudgets() {
  return policies[globalThis[contextKey]?.profile ?? 'normal'];
}
export function qualificationAdmitted() { return globalThis[contextKey] !== undefined; }
/** Internal preloader admission, never called by production entrypoints. */
export function admitQualification(profile, preload) {
  if (!Object.hasOwn(policies, profile)) throw invalid('INSRC_QUALIFICATION_PROFILE must be normal or slow-vm');
  const previous = globalThis[contextKey];
  if (previous && previous.profile !== profile) throw invalid('Qualification profile conflicts with the admitted process policy');
  if (!previous) Object.defineProperty(globalThis, contextKey, { value: Object.freeze({ profile, preload }) });
  return policies[profile];
}
/** Propagation requires the parent's explicit admission, not its ambient env.
 * Each fresh Node process executes the same trusted preloader before its entry. */
export function qualificationNodeArguments(args) {
  const context = globalThis[contextKey];
  if (!context || (args[0] === '--import' && args[1] === context.preload)) return args;
  return ['--import', context.preload, ...args];
}
