/**
 * Answer quality and context-routing report.
 *
 * The in-memory metrics in observability/llm-metrics are process-local, reset on
 * deploy, and carry no link to the question that produced them or to what the
 * user thought of the answer. This report reads the persisted evidence manifests
 * on Conversation instead, and joins them to feedback scores, so the question
 * "is our context routing costing users good answers?" can be looked at directly
 * rather than inferred from aggregate rates.
 */

import {
  ROUTED_CONTEXT_TIERS,
  widenedContextTiers,
  type EvidenceManifest,
  type RoutedContextTier,
} from '../openai/show-the-math-types';

export interface AnswerQualityConversation {
  id: string;
  question: string;
  createdAt: Date | string;
  showTheMathData?: unknown;
  feedback?: Array<{ score: number; createdAt: Date | string }>;
}

interface Observation {
  id: string;
  createdAt: string;
  question: string;
  rating: number | null;
  outcome: 'passed' | 'salvaged' | 'replaced';
  grounded: boolean;
  escalated: boolean;
  /** What routing selected, before any widening. */
  routedSelection: Partial<Record<RoutedContextTier, boolean>>;
  withheld: RoutedContextTier[];
  /** Tiers the retry's widening switched on — the ones an escalation implicates. */
  widened: RoutedContextTier[];
  unsupportedValues: number;
}

interface Aggregate {
  samples: number;
  missRate: number | null;
  ratedSamples: number;
  averageRating: number | null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number | null, places = 3): number | null {
  if (value === null) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function manifestOf(showTheMathData: unknown): EvidenceManifest | null {
  if (!showTheMathData || typeof showTheMathData !== 'object') return null;
  const manifest = (showTheMathData as { evidenceManifest?: unknown }).evidenceManifest;
  if (!manifest || typeof manifest !== 'object') return null;
  return manifest as EvidenceManifest;
}

/** The most recent score wins: users can re-rate an answer. */
function latestRating(feedback: AnswerQualityConversation['feedback']): number | null {
  if (!feedback || feedback.length === 0) return null;
  const sorted = [...feedback].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
  const score = sorted[0]?.score;
  return typeof score === 'number' && Number.isFinite(score) ? score : null;
}

function toObservation(conversation: AnswerQualityConversation): Observation | null {
  const manifest = manifestOf(conversation.showTheMathData);
  if (!manifest) return null;

  // Score the selection routing predicted, not the widened read that corrected
  // it — a recovery is evidence the prediction was wrong, not that it was right.
  const routedSelection = (manifest.routedContextSelection ?? manifest.contextSelection ?? {}) as
    Partial<Record<RoutedContextTier, boolean>>;
  const deterministic = manifest.validation?.deterministic;
  const escalated = manifest.contextEscalated === true;

  return {
    id: conversation.id,
    createdAt: new Date(conversation.createdAt).toISOString(),
    question: conversation.question,
    rating: latestRating(conversation.feedback),
    // Manifests written before salvage existed record only valid/invalid.
    outcome: deterministic?.outcome ?? (deterministic?.valid === false ? 'replaced' : 'passed'),
    grounded: deterministic?.valid !== false,
    escalated,
    routedSelection,
    withheld: ROUTED_CONTEXT_TIERS.filter((tier) => routedSelection[tier] === false),
    widened: escalated ? widenedContextTiers(manifest) : [],
    unsupportedValues: (deterministic?.issues || []).filter((issue) =>
      issue.endsWith('is not present in the canonical fact pack.')).length,
  };
}

/**
 * An answer "missed" a tier when it failed to ground under the context routing
 * chose, or when the retry had to switch that specific tier on. A successful
 * escalation still counts, because the widening is the record of routing having
 * guessed wrong — but only against the tiers it actually widened.
 */
function missed(observation: Observation, tier: RoutedContextTier): boolean {
  return !observation.grounded || observation.widened.includes(tier);
}

function aggregate(observations: Observation[], tier: RoutedContextTier): Aggregate {
  const ratings = observations
    .map((observation) => observation.rating)
    .filter((rating): rating is number => rating !== null);
  return {
    samples: observations.length,
    missRate: observations.length === 0
      ? null
      : round(observations.filter((observation) => missed(observation, tier)).length / observations.length),
    ratedSamples: ratings.length,
    averageRating: round(average(ratings), 2),
  };
}

function ratingFor(observations: Observation[]) {
  const ratings = observations
    .map((observation) => observation.rating)
    .filter((rating): rating is number => rating !== null);
  return { samples: observations.length, ratedSamples: ratings.length, averageRating: round(average(ratings), 2) };
}

export interface AnswerQualityReport {
  window: {
    from: string | null;
    to: string | null;
    conversations: number;
    withManifest: number;
    rated: number;
  };
  quality: {
    groundedRate: number | null;
    escalationRate: number | null;
    averageRating: number | null;
    byOutcome: Record<'passed' | 'salvaged' | 'replaced', ReturnType<typeof ratingFor>>;
    byEscalation: Record<'escalated' | 'notEscalated', ReturnType<typeof ratingFor>>;
  };
  routing: Record<RoutedContextTier, {
    withheld: Aggregate;
    supplied: Aggregate;
    /** Positive means answers failed to ground more often when this was withheld. */
    excessMissWhenWithheld: number | null;
    /** Positive means users rated answers worse when this was withheld. */
    ratingPenaltyWhenWithheld: number | null;
  }>;
  recent: Observation[];
}

export function buildAnswerQualityReport(
  conversations: readonly AnswerQualityConversation[],
  recentLimit = 50
): AnswerQualityReport {
  const observations = conversations
    .map(toObservation)
    .filter((observation): observation is Observation => observation !== null)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const rated = observations.filter((observation) => observation.rating !== null);
  const outcomeGroup = (outcome: Observation['outcome']) =>
    ratingFor(observations.filter((observation) => observation.outcome === outcome));

  const routing = Object.fromEntries(ROUTED_CONTEXT_TIERS.map((tier) => {
    const withheld = observations.filter((observation) => observation.routedSelection[tier] === false);
    const supplied = observations.filter((observation) => observation.routedSelection[tier] === true);
    const withheldAggregate = aggregate(withheld, tier);
    const suppliedAggregate = aggregate(supplied, tier);
    const bothMeasured = withheldAggregate.missRate !== null && suppliedAggregate.missRate !== null;
    const bothRated = withheldAggregate.averageRating !== null && suppliedAggregate.averageRating !== null;
    return [tier, {
      withheld: withheldAggregate,
      supplied: suppliedAggregate,
      excessMissWhenWithheld: bothMeasured
        ? round(withheldAggregate.missRate! - suppliedAggregate.missRate!)
        : null,
      ratingPenaltyWhenWithheld: bothRated
        ? round(suppliedAggregate.averageRating! - withheldAggregate.averageRating!, 2)
        : null,
    }];
  })) as AnswerQualityReport['routing'];

  return {
    window: {
      from: observations[observations.length - 1]?.createdAt ?? null,
      to: observations[0]?.createdAt ?? null,
      conversations: conversations.length,
      withManifest: observations.length,
      rated: rated.length,
    },
    quality: {
      groundedRate: observations.length === 0
        ? null
        : round(observations.filter((observation) => observation.grounded).length / observations.length),
      escalationRate: observations.length === 0
        ? null
        : round(observations.filter((observation) => observation.escalated).length / observations.length),
      averageRating: round(average(rated.map((observation) => observation.rating!)), 2),
      byOutcome: {
        passed: outcomeGroup('passed'),
        salvaged: outcomeGroup('salvaged'),
        replaced: outcomeGroup('replaced'),
      },
      byEscalation: {
        escalated: ratingFor(observations.filter((observation) => observation.escalated)),
        notEscalated: ratingFor(observations.filter((observation) => !observation.escalated)),
      },
    },
    routing,
    recent: observations.slice(0, recentLimit),
  };
}
