/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { ReviewedProfile, SourcePolicy } from './contracts.js';

export const INITIAL_LICENSE_IDS = ['MIT', 'Apache-2.0', 'CC0-1.0'] as const;
export interface PolicyDecision { status: 'eligible' | 'excluded' | 'unresolved'; reason: string; }
/** A recorded human decision, never license inference. All categories require review. */
export function profileDecision(policy: SourcePolicy, profile: ReviewedProfile | undefined, repositoryUrl: string): PolicyDecision {
  if (!policy.repositories.includes(repositoryUrl)) return { status: 'excluded', reason: 'Repository is not allowlisted.' };
  if (!profile) return { status: 'unresolved', reason: 'No exact file profile.' };
  if (profile.decision === 'excluded') return { status: 'excluded', reason: profile.reason };
  const category = policy.categories.find(item => item.id === profile.category);
  if (profile.decision !== 'eligible' || !profile.termsResolved || !profile.reviewedBy.trim() || !category
    || !profile.licenseIds.length || !profile.licenseEvidence.length || !profile.attribution.length
    || profile.licenseIds.some(id => !category.licenseIds.includes(id))
    || category.conditions.some(condition => !profile.conditions.includes(condition))) {
    return { status: 'unresolved', reason: 'File terms, category or obligations lack a complete reviewed decision.' };
  }
  return { status: 'eligible', reason: profile.reason };
}
