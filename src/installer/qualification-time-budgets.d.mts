export interface QualificationScopeBudgets {
  readonly buildMs: number;
  readonly fileMs: number;
  readonly runMs: number;
  readonly cleanupMs: number;
}
export interface QualificationTimeBudgetPolicy {
  readonly profile: 'normal' | 'slow-vm';
  readonly coordinator: QualificationScopeBudgets;
  readonly manager: QualificationScopeBudgets;
  readonly qualification: QualificationScopeBudgets;
  readonly git: QualificationScopeBudgets;
  readonly runtime: Readonly<{ acquisitionMs: number; verificationMs: number; resourceDrainMs: number }>;
}
export const QUALIFICATION_TIME_BUDGETS: QualificationTimeBudgetPolicy;
