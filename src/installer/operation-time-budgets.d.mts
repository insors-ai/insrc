import type { QualificationTimeBudgetPolicy } from './qualification-time-budgets.mjs';
export function operationTimeBudgets(): QualificationTimeBudgetPolicy;
export function qualificationAdmitted(): boolean;
export function admitQualification(profile: string, preload: string): QualificationTimeBudgetPolicy;
export function qualificationNodeArguments(args: string[]): string[];
