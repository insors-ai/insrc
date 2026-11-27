/** Fixed local timing policy. Select the profile before starting Node.
 * Importing this module performs no I/O or process/application initialization. */
const profile = process.env.INSRC_QUALIFICATION_PROFILE ?? 'normal';
if (profile !== 'normal' && profile !== 'slow-vm') {
  throw Object.assign(new Error('INSRC_QUALIFICATION_PROFILE must be normal or slow-vm'),
    { code: 'qualification-profile-invalid' });
}
const slow = profile === 'slow-vm';
const scope = (buildMs, fileMs, runMs, cleanupMs) => Object.freeze({ buildMs, fileMs, runMs, cleanupMs });

/** One immutable snapshot per process; explicit scope overrides remain separate. */
export const QUALIFICATION_TIME_BUDGETS = Object.freeze({
  profile,
  coordinator: slow ? scope(2_400_000, 2_400_000, 14_400_000, 30_000) : scope(600_000, 600_000, 5_400_000, 5_000),
  manager: slow ? scope(2_400_000, 2_400_000, 14_400_000, 120_000) : scope(600_000, 600_000, 5_400_000, 5_000),
  qualification: slow ? scope(7_200_000, 7_200_000, 18_000_000, 300_000) : scope(3_600_000, 3_600_000, 7_200_000, 5_000),
  git: slow ? scope(2_400_000, 120_000, 180_000, 30_000) : scope(600_000, 30_000, 40_000, 5_000),
  runtime: Object.freeze({ acquisitionMs: slow ? 2_400_000 : 600_000,
    verificationMs: slow ? 480_000 : 120_000, resourceDrainMs: slow ? 30_000 : 5_000 }),
});
