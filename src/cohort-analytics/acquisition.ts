import type { Prisma } from '@prisma/client';
import { getPrismaClient } from '../prisma-client';
import type { CohortWindow } from './types';

// Only signup-adjacent first decisions are evidence of an old calculator signup.
// A calculator attached to an established account must not change its acquisition.
const SIGNUP_SEED_WINDOW_MS = 10 * 60_000;
const ID_CHUNK = 1000;
const CAMPAIGN_SELECT = {
  utmSource: true, utmMedium: true, utmCampaign: true,
  gclid: true, gbraid: true, wbraid: true,
} as const;

export const COHORT_ACQUISITION_SELECT = {
  acquisition: { select: { source: true, ...CAMPAIGN_SELECT } },
  conversations: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 1,
    select: { origin: true, createdAt: true, calculatorLeadToken: true },
  },
} satisfies Prisma.UserSelect;

type CampaignData = {
  utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null;
  gclid?: string | null; gbraid?: string | null; wbraid?: string | null;
};
export interface AcquisitionUser {
  email: string;
  createdAt: Date;
  acquisition?: (CampaignData & { source: string }) | null;
  /** The first decision of any origin, not the first calculator decision. */
  conversations?: Array<{ origin: string; createdAt: Date; calculatorLeadToken: string | null }>;
}
export interface ResolvedAcquisition extends CampaignData {
  source: string;
  evidence: 'recorded' | 'recovered' | 'unknown';
}
export interface HistoricalLead extends CampaignData {
  token: string; email: string; createdAt: Date;
}
const SOURCES: Record<string, string> = {
  calculator_coast_fire: 'coast_fire_calculator',
  calculator_retirement: 'retirement_calculator',
};

export function resolveCohortAcquisition(user: AcquisitionUser, lead?: HistoricalLead): ResolvedAcquisition {
  if (user.acquisition) return { ...user.acquisition, evidence: 'recorded' };
  const first = user.conversations?.[0];
  const delay = first ? first.createdAt.getTime() - user.createdAt.getTime() : -1;
  const source = first && SOURCES[first.origin];
  if (!source || delay < 0 || delay > SIGNUP_SEED_WINDOW_MS) {
    return { source: 'direct_or_unknown', evidence: 'unknown' };
  }
  // Source can be inferred from a seed predating lead-token storage. Campaign
  // evidence requires the exact seed's lead, never an email-only/latest-lead join.
  const matched = lead && lead.token === first.calculatorLeadToken
    && lead.email.trim().toLowerCase() === user.email.trim().toLowerCase()
    && lead.createdAt <= user.createdAt;
  return {
    source, evidence: 'recovered',
    ...(matched ? {
      utmSource: lead.utmSource, utmMedium: lead.utmMedium, utmCampaign: lead.utmCampaign,
      gclid: lead.gclid, gbraid: lead.gbraid, wbraid: lead.wbraid,
    } : {}),
  };
}

export function matchesAcquisition(value: ResolvedAcquisition, window: CohortWindow): boolean {
  if (window.source && window.source !== 'all' && value.source !== window.source) return false;
  if (window.campaign && value.utmCampaign !== window.campaign) return false;
  if (window.channel === 'google_ads') {
    return Boolean(value.gclid || value.gbraid || value.wbraid)
      || (value.utmSource?.toLowerCase() === 'google'
        && ['cpc', 'ppc', 'paid', 'display'].includes(value.utmMedium?.toLowerCase() ?? ''));
  }
  return true;
}

/** Read-only reporting fallback. Never creates acquisition rows or Ads milestones. */
export async function filterByAcquisition<T extends AcquisitionUser>(users: T[], window: CohortWindow) {
  const leads = new Map<string, HistoricalLead>();
  if (window.channel === 'google_ads' || window.campaign) {
    const db = getPrismaClient();
    for (const [origin, kind] of [['calculator_coast_fire', 'coast'], ['calculator_retirement', 'retirement']] as const) {
      const tokens = [...new Set(users.filter(user => {
        const resolved = resolveCohortAcquisition(user);
        return resolved.evidence === 'recovered' && user.conversations?.[0]?.origin === origin
          && (!window.source || window.source === 'all' || window.source === resolved.source);
      }).flatMap(user => user.conversations?.[0]?.calculatorLeadToken ? [user.conversations[0].calculatorLeadToken] : []))];
      for (let index = 0; index < tokens.length; index += ID_CHUNK) {
        const query = { where: { token: { in: tokens.slice(index, index + ID_CHUNK) } },
          select: { token: true, email: true, createdAt: true, ...CAMPAIGN_SELECT } };
        const rows = kind === 'coast' ? await db.coastFireLead.findMany(query) : await db.retirementLead.findMany(query);
        for (const row of rows) leads.set(`${origin}:${row.token}`, row);
      }
    }
  }
  return users.flatMap(user => {
    const first = user.conversations?.[0];
    const acquisition = resolveCohortAcquisition(user, first ? leads.get(`${first.origin}:${first.calculatorLeadToken}`) : undefined);
    return matchesAcquisition(acquisition, window) ? [{ user, acquisition }] : [];
  });
}
