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

/** Red / yellow / green, the whole vocabulary of the scorecard. */
export type Grade = 'green' | 'yellow' | 'red';

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
  /** The worse of what the system checked and what the user said. */
  grade: Grade;
  /** One plain sentence explaining that grade. */
  gradeReason: string;
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

const TIER_LABELS: Record<RoutedContextTier, string> = {
  accountsIncluded: 'account balances',
  transactionDetailsIncluded: 'transaction detail',
  investmentDetailsIncluded: 'investment holdings',
  marketContextRequested: 'market context',
  searchContextRequested: 'search context',
};

const GRADE_RANK: Record<Grade, number> = { green: 0, yellow: 1, red: 2 };

function worse(left: Grade, right: Grade): Grade {
  return GRADE_RANK[right] > GRADE_RANK[left] ? right : left;
}

/**
 * What the deterministic check thought of the answer. Replacing an answer is
 * the outright failure; trimming it, or needing a second pass to find the data,
 * is the warning.
 */
function systemGrade(fields: Pick<Observation, 'outcome' | 'escalated' | 'unsupportedValues'>): Grade {
  if (fields.outcome === 'replaced') return 'red';
  if (fields.outcome === 'salvaged' || fields.escalated || fields.unsupportedValues > 0) return 'yellow';
  return 'green';
}

/** What the user thought, on the 1-5 scale they are shown. Null when unrated. */
function userGrade(rating: number | null): Grade | null {
  if (rating === null) return null;
  if (rating <= 2) return 'red';
  if (rating === 3) return 'yellow';
  return 'green';
}

/**
 * Grade an answer on the worse of the two verdicts. A five-star answer we could
 * not verify is still a problem, and so is a verified answer the user disliked
 * — taking the worse of the two keeps either signal from hiding the other.
 */
function gradeOf(fields: Pick<Observation, 'outcome' | 'escalated' | 'unsupportedValues' | 'rating'>): {
  grade: Grade;
  gradeReason: string;
} {
  const fromSystem = systemGrade(fields);
  const fromUser = userGrade(fields.rating);
  const grade = fromUser === null ? fromSystem : worse(fromSystem, fromUser);

  // Name the signal that actually set the grade, so the reason never contradicts
  // the colour beside it.
  const userExplains = fromUser !== null && GRADE_RANK[fromUser] >= GRADE_RANK[fromSystem];
  if (grade === 'red') {
    if (fromSystem === 'red') return { grade, gradeReason: 'We could not back up the answer, so it was replaced' };
    return { grade, gradeReason: `The user rated it ${fields.rating}/5` };
  }
  if (grade === 'yellow') {
    if (userExplains && fromUser === 'yellow') return { grade, gradeReason: 'The user rated it 3/5' };
    if (fields.outcome === 'salvaged') return { grade, gradeReason: 'Parts of the answer had to be trimmed to keep it verifiable' };
    if (fields.escalated) return { grade, gradeReason: 'The first attempt was missing data and had to be retried' };
    return { grade, gradeReason: 'The answer used numbers we could not trace to a source' };
  }
  return {
    grade,
    gradeReason: fromUser === 'green'
      ? `Verified, and the user rated it ${fields.rating}/5`
      : 'Verified on the first attempt, not yet rated',
  };
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

  const core = {
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

  return { ...core, ...gradeOf(core) };
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

const GRADE_POINTS: Record<Grade, number> = { green: 100, yellow: 60, red: 0 };

/** The one number on the panel: the average of every answer's grade. */
function scoreOf(observations: readonly Observation[]): number | null {
  if (observations.length === 0) return null;
  return Math.round(average(observations.map((observation) => GRADE_POINTS[observation.grade]))!);
}

/** Where the score sits on the light. A run of yellows lands on yellow, not red. */
function statusOf(score: number | null): Grade | 'unknown' {
  if (score === null) return 'unknown';
  if (score >= 80) return 'green';
  if (score >= 55) return 'yellow';
  return 'red';
}

export interface ScorecardReason {
  id: string;
  /** Plain English, ready to render. */
  label: string;
  severity: Grade;
  answers: number;
  /** Share of graded answers this affects, 0-1. */
  share: number;
  /** Extra context, e.g. which data the retries went back for. */
  detail: string | null;
  /** One real question showing the problem, so it can be read rather than trusted. */
  example: { id: string; question: string } | null;
}

/**
 * Why the score is not 100 — counted over answers rather than over tiers, so a
 * reader can act on the list without knowing what a context tier is.
 */
function reasonsFor(observations: readonly Observation[]): ScorecardReason[] {
  const graded = observations.length;
  if (graded === 0) return [];

  const definitions: Array<{
    id: string;
    label: string;
    severity: Grade;
    matches: (observation: Observation) => boolean;
    detail?: (matched: Observation[]) => string | null;
  }> = [
    {
      id: 'replaced',
      label: 'Answers we could not back up, so the user got a fallback instead',
      severity: 'red',
      matches: (observation) => observation.outcome === 'replaced',
    },
    {
      id: 'lowRating',
      label: 'Answers the user rated 1 or 2 out of 5',
      severity: 'red',
      matches: (observation) => observation.rating !== null && observation.rating <= 2,
    },
    {
      id: 'salvaged',
      label: 'Answers trimmed because part of them could not be verified',
      severity: 'yellow',
      matches: (observation) => observation.outcome === 'salvaged',
    },
    {
      id: 'escalated',
      label: 'Answers that needed a second attempt to find the right data',
      severity: 'yellow',
      matches: (observation) => observation.escalated,
      detail: (matched) => {
        const counts = new Map<RoutedContextTier, number>();
        for (const observation of matched) {
          for (const tier of observation.widened) counts.set(tier, (counts.get(tier) ?? 0) + 1);
        }
        const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
        if (ranked.length === 0) return null;
        return `usually went back for ${ranked.slice(0, 2).map(([tier]) => TIER_LABELS[tier]).join(' and ')}`;
      },
    },
    {
      // The salvage and replace buckets already carry every other untraceable
      // answer, so this bucket is what keeps a passed-but-unsourced answer from
      // being graded yellow and then explained by nothing.
      id: 'unsupportedValues',
      label: 'Answers that used numbers we could not trace to a source',
      severity: 'yellow',
      matches: (observation) => observation.outcome === 'passed' && observation.unsupportedValues > 0,
    },
    {
      id: 'mixedRating',
      label: 'Answers the user rated 3 out of 5',
      severity: 'yellow',
      matches: (observation) => observation.rating === 3,
    },
  ];

  return definitions
    .map((definition) => {
      const matched = observations.filter(definition.matches);
      return {
        id: definition.id,
        label: definition.label,
        severity: definition.severity,
        answers: matched.length,
        share: round(matched.length / graded)!,
        detail: matched.length > 0 && definition.detail ? definition.detail(matched) : null,
        // Newest first already, so the first match is the freshest example.
        example: matched[0] ? { id: matched[0].id, question: matched[0].question } : null,
      };
    })
    .filter((reason) => reason.answers > 0)
    .sort((left, right) =>
      GRADE_RANK[right.severity] - GRADE_RANK[left.severity] || right.answers - left.answers);
}

export interface Scorecard {
  /** 0-100, or null before any answer has been graded. */
  score: number | null;
  status: Grade | 'unknown';
  /** One sentence a non-engineer can act on. */
  headline: string;
  answers: number;
  counts: Record<Grade, number>;
  /**
   * The newest batch of answers against the one before it. Both batch scores are
   * reported because neither equals `score` above, which averages the whole
   * window — a trend shown as a bare delta would read as if the headline moved.
   */
  trend: {
    recentScore: number;
    previousScore: number;
    delta: number;
    comparedAnswers: number;
  } | null;
  reasons: ScorecardReason[];
}

/** Needs two batches of this size before a move is worth showing as a trend. */
const MIN_TREND_BATCH = 5;

function trendFor(observations: readonly Observation[]): Scorecard['trend'] {
  const batch = Math.floor(observations.length / 2);
  if (batch < MIN_TREND_BATCH) return null;
  // Observations are newest first, so the head is the recent batch.
  const recent = scoreOf(observations.slice(0, batch));
  const previous = scoreOf(observations.slice(batch, batch * 2));
  if (recent === null || previous === null) return null;
  return { recentScore: recent, previousScore: previous, delta: recent - previous, comparedAnswers: batch };
}

function headlineFor(score: number | null, counts: Record<Grade, number>, answers: number): string {
  if (score === null) return 'No answers with evidence yet — the score appears once questions come in.';
  const good = counts.green;
  const bad = counts.red;
  if (score >= 80) {
    return `${good} of the last ${answers} answers were solid${bad > 0 ? `, and ${bad} went wrong` : ' and none went wrong'}.`;
  }
  if (score >= 55) {
    return `${good} of the last ${answers} answers were solid, but ${counts.yellow} came out shaky${bad > 0 ? ` and ${bad} went wrong` : ''}.`;
  }
  return `${bad} of the last ${answers} answers went wrong. Read the reasons below before shipping anything else.`;
}

function buildScorecard(observations: readonly Observation[]): Scorecard {
  const counts: Record<Grade, number> = { green: 0, yellow: 0, red: 0 };
  for (const observation of observations) counts[observation.grade] += 1;
  const score = scoreOf(observations);

  return {
    score,
    status: statusOf(score),
    headline: headlineFor(score, counts, observations.length),
    answers: observations.length,
    counts,
    trend: trendFor(observations),
    reasons: reasonsFor(observations),
  };
}

export interface AnswerQualityReport {
  /** The simple read: one score, one colour, and what is dragging it down. */
  scorecard: Scorecard;
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
    scorecard: buildScorecard(observations),
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
