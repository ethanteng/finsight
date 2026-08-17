/**
 * Plain-language answer quality report built from persisted evidence manifests.
 *
 * It separates the three places an answer can go wrong: context planning,
 * evidence grounding, and the delivered result. A primary-tool expansion is a
 * normal pre-answer safety mechanism, not a bad answer; a post-answer expansion
 * is a recovered miss because the first generation lacked context.
 */

import { CONTEXT_PACK_IDS, type ContextPackId } from '../openai/context-packs';
import type { EvidenceManifest } from '../openai/show-the-math-types';

export interface AnswerQualityConversation {
  id: string;
  question: string;
  createdAt: Date | string;
  showTheMathData?: unknown;
  feedback?: Array<{ score: number; createdAt: Date | string }>;
}

export type DeliveryStatus = 'clean' | 'recovered' | 'failed';

export interface AnswerQualityObservation {
  id: string;
  createdAt: string;
  question: string;
  rating: number | null;
  deliveryStatus: DeliveryStatus;
  statusReason: string;
  outcome: 'passed' | 'salvaged' | 'replaced';
  grounded: boolean;
  plannerSource: 'context_planner' | 'fallback_all' | 'legacy';
  selectedPacks: ContextPackId[];
  finalPacks: ContextPackId[];
  toolAddedPacks: ContextPackId[];
  primaryToolOutcome: 'accepted' | 'expanded' | 'failed' | 'not_run';
  lateExpansion: boolean;
}

function manifestOf(showTheMathData: unknown): EvidenceManifest | null {
  if (!showTheMathData || typeof showTheMathData !== 'object') return null;
  const manifest = (showTheMathData as { evidenceManifest?: unknown }).evidenceManifest;
  return manifest && typeof manifest === 'object' ? manifest as EvidenceManifest : null;
}

/** The most recent rating wins because users can change a rating. */
function latestRating(feedback: AnswerQualityConversation['feedback']): number | null {
  if (!feedback || feedback.length === 0) return null;
  const latest = [...feedback].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  )[0]?.score;
  return typeof latest === 'number' && Number.isFinite(latest) ? latest : null;
}

function deliveryStatus(args: {
  outcome: AnswerQualityObservation['outcome'];
  rating: number | null;
  lateExpansion: boolean;
}): Pick<AnswerQualityObservation, 'deliveryStatus' | 'statusReason'> {
  if (args.outcome === 'replaced') {
    return { deliveryStatus: 'failed', statusReason: 'The generated answer could not be verified, so the user received a fallback.' };
  }
  if (args.rating !== null && args.rating <= 2) {
    return { deliveryStatus: 'failed', statusReason: `The user rated this answer ${args.rating}/5.` };
  }
  if (args.outcome === 'salvaged') {
    return { deliveryStatus: 'recovered', statusReason: 'Unsupported parts were removed before the answer reached the user.' };
  }
  if (args.lateExpansion) {
    return { deliveryStatus: 'recovered', statusReason: 'The first generation lacked evidence; the system loaded all remaining packs and regenerated.' };
  }
  if (args.rating === 3) {
    return { deliveryStatus: 'recovered', statusReason: 'The answer was verified, but the user rated it 3/5.' };
  }
  if (args.rating !== null) {
    return { deliveryStatus: 'clean', statusReason: `Verified and rated ${args.rating}/5 by the user.` };
  }
  return { deliveryStatus: 'clean', statusReason: 'Verified before delivery; not yet rated.' };
}

function toObservation(conversation: AnswerQualityConversation): AnswerQualityObservation | null {
  const manifest = manifestOf(conversation.showTheMathData);
  if (!manifest) return null;
  const deterministic = manifest.validation?.deterministic;
  const outcome = deterministic?.outcome ?? (deterministic?.valid === false ? 'replaced' : 'passed');
  const rating = latestRating(conversation.feedback);
  const planning = manifest.contextPlanning;
  const plannerSource = planning?.source ?? 'legacy';
  const selectedPacks = planning?.selectedPacks ?? [];
  const finalPacks = planning?.finalPacks ?? selectedPacks;
  const toolAddedPacks = planning?.primaryTool?.addedPacks ?? [];
  const primaryToolOutcome = planning?.primaryTool?.outcome
    ?? (toolAddedPacks.length > 0 ? 'expanded' : 'not_run');
  const lateExpansion = manifest.contextEscalated === true;
  return {
    id: conversation.id,
    createdAt: new Date(conversation.createdAt).toISOString(),
    question: conversation.question,
    rating,
    outcome,
    grounded: deterministic?.valid !== false,
    plannerSource,
    selectedPacks,
    finalPacks,
    toolAddedPacks,
    primaryToolOutcome,
    lateExpansion,
    ...deliveryStatus({ outcome, rating, lateExpansion }),
  };
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 1000) / 1000;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 100) / 100;
}

function headline(counts: Record<DeliveryStatus, number>, total: number): string {
  if (total === 0) return 'No answers with evidence have been recorded yet.';
  if (counts.failed > 0) {
    return `${counts.clean} of ${total} answers were delivered cleanly; ${counts.failed} failed and need review.`;
  }
  if (counts.recovered > 0) {
    return `${counts.clean} of ${total} answers were delivered cleanly; ${counts.recovered} were corrected before delivery.`;
  }
  return `All ${total} answers were verified and delivered without a recovery.`;
}

export interface AnswerQualityReport {
  window: {
    from: string | null;
    to: string | null;
    conversations: number;
    withEvidence: number;
  };
  delivery: {
    total: number;
    clean: number;
    recovered: number;
    failed: number;
    cleanRate: number | null;
    headline: string;
  };
  evidence: {
    verified: number;
    salvaged: number;
    replaced: number;
    verifiedRate: number | null;
  };
  planning: {
    semanticPlans: number;
    fallbackPlans: number;
    plannerAccepted: number;
    primaryToolExpanded: number;
    primaryToolFailed: number;
    lateExpanded: number;
    plannerAcceptedRate: number | null;
    averagePlannerMs: number | null;
    byPack: Record<ContextPackId, {
      selectedInitially: number;
      addedByPrimaryTool: number;
      presentFinally: number;
    }>;
  };
  users: {
    rated: number;
    positive: number;
    neutral: number;
    negative: number;
    averageRating: number | null;
  };
  recent: AnswerQualityObservation[];
}

export function buildAnswerQualityReport(
  conversations: readonly AnswerQualityConversation[],
  recentLimit = 50
): AnswerQualityReport {
  const observations = conversations
    .map(toObservation)
    .filter((observation): observation is AnswerQualityObservation => observation !== null)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const counts: Record<DeliveryStatus, number> = { clean: 0, recovered: 0, failed: 0 };
  observations.forEach((observation) => { counts[observation.deliveryStatus] += 1; });

  const semantic = observations.filter((observation) => observation.plannerSource === 'context_planner');
  const fallback = observations.filter((observation) => observation.plannerSource === 'fallback_all');
  const plannerAccepted = semantic.filter(
    (observation) => observation.primaryToolOutcome !== 'failed'
      && observation.toolAddedPacks.length === 0
      && !observation.lateExpansion
  ).length;
  const toolExpanded = semantic.filter((observation) => observation.toolAddedPacks.length > 0).length;
  const toolFailed = semantic.filter((observation) => observation.primaryToolOutcome === 'failed').length;
  const lateExpanded = observations.filter((observation) => observation.lateExpansion).length;

  const byPack = Object.fromEntries(CONTEXT_PACK_IDS.map((pack) => [pack, {
    selectedInitially: observations.filter((observation) => observation.selectedPacks.includes(pack)).length,
    addedByPrimaryTool: observations.filter((observation) => observation.toolAddedPacks.includes(pack)).length,
    presentFinally: observations.filter((observation) => observation.finalPacks.includes(pack)).length,
  }])) as AnswerQualityReport['planning']['byPack'];

  const manifests = conversations
    .map((conversation) => manifestOf(conversation.showTheMathData))
    .filter((manifest): manifest is EvidenceManifest => manifest !== null);
  const plannerDurations = manifests
    .map((manifest) => manifest.contextPlanning?.durationMs)
    .filter((duration): duration is number => typeof duration === 'number' && Number.isFinite(duration));
  const ratings = observations
    .map((observation) => observation.rating)
    .filter((rating): rating is number => rating !== null);
  const verified = observations.filter((observation) => observation.outcome === 'passed').length;
  const salvaged = observations.filter((observation) => observation.outcome === 'salvaged').length;
  const replaced = observations.filter((observation) => observation.outcome === 'replaced').length;

  return {
    window: {
      from: observations[observations.length - 1]?.createdAt ?? null,
      to: observations[0]?.createdAt ?? null,
      conversations: conversations.length,
      withEvidence: observations.length,
    },
    delivery: {
      total: observations.length,
      ...counts,
      cleanRate: rate(counts.clean, observations.length),
      headline: headline(counts, observations.length),
    },
    evidence: {
      verified,
      salvaged,
      replaced,
      verifiedRate: rate(verified, observations.length),
    },
    planning: {
      semanticPlans: semantic.length,
      fallbackPlans: fallback.length,
      plannerAccepted,
      primaryToolExpanded: toolExpanded,
      primaryToolFailed: toolFailed,
      lateExpanded,
      plannerAcceptedRate: rate(plannerAccepted, semantic.length),
      averagePlannerMs: average(plannerDurations),
      byPack,
    },
    users: {
      rated: ratings.length,
      positive: ratings.filter((rating) => rating >= 4).length,
      neutral: ratings.filter((rating) => rating === 3).length,
      negative: ratings.filter((rating) => rating <= 2).length,
      averageRating: average(ratings),
    },
    recent: observations.slice(0, recentLimit),
  };
}
