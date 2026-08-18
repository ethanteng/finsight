import { extractCurrentAge } from '../retirement-analytics/retirement-language';

export const PERSONAL_CONTEXT_FIELDS = [
  'preferredName',
  'age',
  'city',
  'stateOrProvince',
  'country',
  'householdStatus',
  'dependentCount',
  'dependentAges',
  'occupation',
  'industry',
  'employmentStatus',
  'retirementStatus',
] as const;

export type PersonalContextField = (typeof PERSONAL_CONTEXT_FIELDS)[number];
export type PersonalContextSource = 'conversation' | 'manual' | 'legacy';

export const HOUSEHOLD_STATUSES = [
  'single',
  'partnered',
  'married',
  'separated',
  'divorced',
  'widowed',
] as const;

export const EMPLOYMENT_STATUSES = [
  'employed',
  'self-employed',
  'unemployed',
  'student',
  'homemaker',
  'retired',
  'other',
] as const;

export const RETIREMENT_STATUSES = [
  'not-retired',
  'partially-retired',
  'retired',
] as const;

export interface PersonalContextValues {
  preferredName?: string;
  age?: number;
  city?: string;
  stateOrProvince?: string;
  country?: string;
  householdStatus?: (typeof HOUSEHOLD_STATUSES)[number];
  dependentCount?: number;
  dependentAges?: number[];
  occupation?: string;
  industry?: string;
  employmentStatus?: (typeof EMPLOYMENT_STATUSES)[number];
  retirementStatus?: (typeof RETIREMENT_STATUSES)[number];
}

export interface PersonalContextFact<T = unknown> {
  value: T;
  observedAt: string;
  source: PersonalContextSource;
  sourceConversationId?: string;
}

export type PersonalContextFacts = Partial<Record<PersonalContextField, PersonalContextFact>>;

export interface StoredHomeContext {
  address: string | null;
  rentCastValue: number | null;
  manualValue: number | null;
  valueLow: number | null;
  valueHigh: number | null;
  lastUpdated: string | null;
}

export interface StoredPersonalContextDocument {
  kind: 'linc_personal_context';
  schemaVersion: 1;
  facts: PersonalContextFacts;
  home: StoredHomeContext | null;
  updatedAt: string;
}

export interface PersonalContextOperation {
  field: PersonalContextField;
  action: 'set' | 'clear';
  stringValue: string | null;
  numberValue: number | null;
  numberListValue: number[];
  evidence: string;
}

const STRING_FIELDS = new Set<PersonalContextField>([
  'preferredName',
  'city',
  'stateOrProvince',
  'country',
  'householdStatus',
  'occupation',
  'industry',
  'employmentStatus',
  'retirementStatus',
]);
const NUMBER_FIELDS = new Set<PersonalContextField>(['age', 'dependentCount']);
const NUMBER_LIST_FIELDS = new Set<PersonalContextField>(['dependentAges']);

const STRING_LIMITS: Partial<Record<PersonalContextField, number>> = {
  preferredName: 80,
  city: 100,
  stateOrProvince: 100,
  country: 100,
  occupation: 140,
  industry: 140,
};

function validIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function cleanString(field: PersonalContextField, value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) return undefined;
  const limit = STRING_LIMITS[field] ?? 40;
  if (cleaned.length > limit) return undefined;
  if (field === 'preferredName' && !/^[\p{L}\p{M} .'’-]+$/u.test(cleaned)) return undefined;
  if (
    ['city', 'stateOrProvince', 'country'].includes(field)
    && !/^[\p{L}\p{M} .,'’-]+$/u.test(cleaned)
  ) return undefined;
  if (
    ['occupation', 'industry'].includes(field)
    && /[$€£¥%]|\b(?:earn(?:s|ed|ing)?|salary|income|net worth|account balance|risk tolerance|financial goal)\b/i.test(cleaned)
  ) return undefined;
  if (field === 'householdStatus' && !(HOUSEHOLD_STATUSES as readonly string[]).includes(cleaned)) return undefined;
  if (field === 'employmentStatus' && !(EMPLOYMENT_STATUSES as readonly string[]).includes(cleaned)) return undefined;
  if (field === 'retirementStatus' && !(RETIREMENT_STATUSES as readonly string[]).includes(cleaned)) return undefined;
  return cleaned;
}

function cleanNumber(field: PersonalContextField, value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
  if (field === 'age' && value >= 0 && value <= 120) return value;
  if (field === 'dependentCount' && value >= 0 && value <= 20) return value;
  return undefined;
}

function cleanNumberList(field: PersonalContextField, value: unknown): number[] | undefined {
  if (field !== 'dependentAges' || !Array.isArray(value) || value.length > 20) return undefined;
  const ages = value.filter((age): age is number => Number.isInteger(age) && age >= 0 && age <= 100);
  if (ages.length !== value.length) return undefined;
  return [...ages].sort((left, right) => left - right);
}

export function normalizePersonalContextValue(
  field: PersonalContextField,
  value: unknown
): PersonalContextValues[PersonalContextField] | undefined {
  if (STRING_FIELDS.has(field)) return cleanString(field, value);
  if (NUMBER_FIELDS.has(field)) return cleanNumber(field, value);
  if (NUMBER_LIST_FIELDS.has(field)) return cleanNumberList(field, value);
  return undefined;
}

function validFact(field: PersonalContextField, value: unknown): value is PersonalContextFact {
  if (!value || typeof value !== 'object') return false;
  const fact = value as PersonalContextFact;
  return normalizePersonalContextValue(field, fact.value) !== undefined
    && validIsoDate(fact.observedAt)
    && ['conversation', 'manual', 'legacy'].includes(fact.source);
}

export function parseStoredPersonalContextDocument(raw: string): StoredPersonalContextDocument | null {
  if (!raw.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPersonalContextDocument>;
    if (parsed.kind !== 'linc_personal_context' || parsed.schemaVersion !== 1 || !parsed.facts) return null;
    const facts: PersonalContextFacts = {};
    for (const field of PERSONAL_CONTEXT_FIELDS) {
      const fact = parsed.facts[field];
      if (validFact(field, fact)) {
        facts[field] = {
          value: normalizePersonalContextValue(field, fact.value),
          observedAt: fact.observedAt,
          source: fact.source,
          ...(typeof fact.sourceConversationId === 'string' && fact.sourceConversationId.length <= 200
            ? { sourceConversationId: fact.sourceConversationId }
            : {}),
        };
      }
    }
    const rawHome = parsed.home && typeof parsed.home === 'object'
      ? parsed.home as Partial<StoredHomeContext>
      : null;
    const home = rawHome && typeof rawHome.address === 'string' && rawHome.address.trim().length <= 500
      ? {
          address: rawHome.address.trim() || null,
          rentCastValue: finiteNullableNumber(rawHome.rentCastValue),
          manualValue: finiteNullableNumber(rawHome.manualValue),
          valueLow: finiteNullableNumber(rawHome.valueLow),
          valueHigh: finiteNullableNumber(rawHome.valueHigh),
          lastUpdated: validIsoDate(rawHome.lastUpdated) ? rawHome.lastUpdated : null,
        }
      : null;
    return {
      kind: 'linc_personal_context',
      schemaVersion: 1,
      facts,
      home,
      updatedAt: validIsoDate(parsed.updatedAt) ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

function finiteNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function serializePersonalContextDocument(
  facts: PersonalContextFacts,
  home: StoredHomeContext | null,
  updatedAt = new Date().toISOString()
): string {
  const document: StoredPersonalContextDocument = {
    kind: 'linc_personal_context',
    schemaVersion: 1,
    facts,
    home,
    updatedAt,
  };
  return JSON.stringify(document);
}

export function personalContextValues(facts: PersonalContextFacts): PersonalContextValues {
  const values: PersonalContextValues = {};
  for (const field of PERSONAL_CONTEXT_FIELDS) {
    const fact = facts[field];
    if (fact) (values as Record<string, unknown>)[field] = fact.value;
  }
  return values;
}

function legacyFact(value: unknown, observedAt: string): PersonalContextFact {
  return { value, observedAt, source: 'legacy' };
}

/**
 * Best-effort, deliberately conservative import from the former prose profile.
 * It only recognizes direct, common biographical statements and never imports
 * balances, institutions, spending, goals, addresses, or investment behavior.
 */
export function personalContextFromLegacyText(raw: string, observedAt = new Date().toISOString()): PersonalContextFacts {
  const facts: PersonalContextFacts = {};
  const age = extractCurrentAge(raw);
  if (age != null && age >= 0 && age <= 120) facts.age = legacyFact(age, observedAt);

  const name = raw.match(/\b(?:my name is|please call me|call me)\s+([A-Z][A-Za-z'’-]{1,39})(?=\s*[,.;]|\s+(?:and|a|an|the)\b)/i);
  if (name?.[1]) facts.preferredName = legacyFact(name[1], observedAt);

  const location = raw.match(/\b(?:live|lives|living|located|based)\s+in\s+([A-Za-z .'-]{2,80}?)(?:,\s*([A-Z]{2}|[A-Za-z .'-]{2,60}?))?(?=\s*(?:[.;\n]|$|,\s*(?:and|where)\b|\b(?:and|where)\b))/i);
  if (location?.[1]) facts.city = legacyFact(location[1].trim(), observedAt);
  if (location?.[2]) facts.stateOrProvince = legacyFact(location[2].trim(), observedAt);

  const householdPatterns: Array<[RegExp, PersonalContextValues['householdStatus']]> = [
    [/\bmarried\b/i, 'married'],
    [/\b(?:partnered|domestic partner)\b/i, 'partnered'],
    [/\bdivorced\b/i, 'divorced'],
    [/\bseparated\b/i, 'separated'],
    [/\bwidowed\b/i, 'widowed'],
    [/\bsingle\b/i, 'single'],
  ];
  const household = householdPatterns.find(([pattern]) => pattern.test(raw));
  if (household) facts.householdStatus = legacyFact(household[1], observedAt);

  const dependentCount = raw.match(/\b(\d{1,2})\s+(?:children|kids|dependents)\b/i);
  if (dependentCount) {
    const count = Number(dependentCount[1]);
    if (count <= 20) facts.dependentCount = legacyFact(count, observedAt);
  }

  const occupation = raw.match(/\b(?:work(?:s|ing)? as|employed as)\s+(?:a|an)?\s*([^,.;\n]{2,100}?)(?=\s+(?:earning|making|with\s+(?:an?\s+)?(?:income|salary)|at\s+(?:an?\s+)?salary|and\s+(?:earn|make|live|have|am|is))\b|[,.;\n]|$)/i);
  if (occupation?.[1]) facts.occupation = legacyFact(occupation[1].trim(), observedAt);

  if (/\bself-employed\b/i.test(raw)) facts.employmentStatus = legacyFact('self-employed', observedAt);
  else if (/\bunemployed\b/i.test(raw)) facts.employmentStatus = legacyFact('unemployed', observedAt);
  else if (/\bretired\b/i.test(raw)) facts.employmentStatus = legacyFact('retired', observedAt);
  else if (/\b(?:employed|works? as|working as)\b/i.test(raw)) facts.employmentStatus = legacyFact('employed', observedAt);

  if (/\bpartially retired\b/i.test(raw)) facts.retirementStatus = legacyFact('partially-retired', observedAt);
  else if (/\bretired\b/i.test(raw)) facts.retirementStatus = legacyFact('retired', observedAt);

  return facts;
}

export function formatPersonalContextForModel(facts: PersonalContextFacts): string {
  const values = personalContextValues(facts);
  const lines: string[] = [];
  if (values.preferredName) lines.push(`- Preferred name: ${values.preferredName}`);
  if (values.age != null) lines.push(`- The user is ${values.age} years old.`);
  const location = [values.city, values.stateOrProvince, values.country].filter(Boolean).join(', ');
  if (location) lines.push(`- Location: ${location}`);
  if (values.householdStatus) lines.push(`- Household status: ${values.householdStatus}`);
  if (values.dependentCount != null) lines.push(`- Dependents: ${values.dependentCount}`);
  if (values.dependentAges?.length) lines.push(`- Dependent ages: ${values.dependentAges.join(', ')}`);
  if (values.occupation) lines.push(`- Occupation: ${values.occupation}`);
  if (values.industry) lines.push(`- Industry: ${values.industry}`);
  if (values.employmentStatus) lines.push(`- Employment status: ${values.employmentStatus}`);
  if (values.retirementStatus) lines.push(`- Retirement status: ${values.retirementStatus}`);
  return lines.join('\n');
}

function normalizedEvidenceIsPresent(question: string, evidence: string): boolean {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  const normalizedEvidence = normalize(evidence);
  return normalizedEvidence.length >= 2 && normalize(question).includes(normalizedEvidence);
}

function evidenceDirectlySupportsOperation(
  operation: PersonalContextOperation,
  value?: PersonalContextValues[PersonalContextField]
): boolean {
  const evidence = operation.evidence;
  if (operation.action === 'clear') {
    return /\b(?:forget|remove|clear|do not remember|don't remember|no longer|not\s+\w+\s+anymore)\b/i.test(evidence)
      && /\b(?:i|i'm|i’ve|i've|my|me|we|we're|our)\b/i.test(evidence);
  }

  switch (operation.field) {
    case 'preferredName':
      return /\b(?:my name is|call me|i go by|i prefer to be called)\b/i.test(evidence);
    case 'age': {
      if (typeof value !== 'number') return false;
      const age = String(value);
      return new RegExp(`\\b(?:i\\s+am|i'm)\\s+(?:currently\\s+)?${age}\\b|\\bmy age is\\s+${age}\\b|\\bi (?:just )?turned\\s+${age}\\b`, 'i').test(evidence);
    }
    case 'city':
    case 'stateOrProvince':
    case 'country':
      return /\b(?:i\s+(?:live|reside)|i'm\s+(?:living|based|located)|i\s+am\s+(?:living|based|located)|i (?:just )?moved to|my (?:city|state|province|country|location))\b/i.test(evidence);
    case 'householdStatus': {
      if (typeof value !== 'string') return false;
      const status = value.replace('-', '[- ]');
      return new RegExp(`\\b(?:i'm|i\\s+am|we're|we\\s+are)\\s+${status}\\b|\\bmy household status is\\s+${status}\\b`, 'i').test(evidence);
    }
    case 'dependentCount':
    case 'dependentAges':
      return /\b(?:i|we)\s+have\s+(?:(?![.;]).){0,60}\b(?:child|children|kid|kids|dependent|dependents)\b|\b(?:my|our)\s+(?:child|children|kid|kids|dependent|dependents)\b/i.test(evidence);
    case 'occupation':
      return /\b(?:i\s+(?:work|am employed)\s+as|i'm\s+(?:a|an)|i\s+am\s+(?:a|an)|my (?:job|occupation|role) is)\b/i.test(evidence);
    case 'industry':
      return /\b(?:i\s+work\s+in|i'm\s+in|i\s+am\s+in|my industry is)\b/i.test(evidence);
    case 'employmentStatus': {
      if (typeof value !== 'string') return false;
      const status = value.replace('-', '[- ]');
      return new RegExp(`\\b(?:i'm|i\\s+am)\\s+${status}\\b|\\bmy employment status is\\s+${status}\\b`, 'i').test(evidence);
    }
    case 'retirementStatus':
      if (value === 'retired') return /\b(?:i'm|i\s+am)\s+retired\b|\b(?:i've|i\s+have)\s+retired\b/i.test(evidence);
      if (value === 'partially-retired') return /\b(?:i'm|i\s+am)\s+partially[- ]retired\b/i.test(evidence);
      if (value === 'not-retired') return /\b(?:i'm|i\s+am)\s+not\s+retired\b/i.test(evidence);
      return false;
    default:
      return false;
  }
}

export function applyPersonalContextOperations(
  existing: PersonalContextFacts,
  operations: readonly PersonalContextOperation[],
  args: { question: string; conversationId: string; observedAt: string }
): PersonalContextFacts {
  const updated: PersonalContextFacts = { ...existing };
  for (const operation of operations) {
    if (!(PERSONAL_CONTEXT_FIELDS as readonly string[]).includes(operation.field)) continue;
    if (!normalizedEvidenceIsPresent(args.question, operation.evidence)) continue;
    if (operation.action === 'clear') {
      delete updated[operation.field];
      if (operation.field === 'dependentCount') delete updated.dependentAges;
      continue;
    }

    let candidate: unknown;
    if (STRING_FIELDS.has(operation.field)) candidate = operation.stringValue;
    else if (NUMBER_FIELDS.has(operation.field)) candidate = operation.numberValue;
    else candidate = operation.numberListValue;
    const value = normalizePersonalContextValue(operation.field, candidate);
    if (value === undefined) continue;
    if (!evidenceDirectlySupportsOperation(operation, value)) continue;
    updated[operation.field] = {
      value,
      observedAt: args.observedAt,
      source: 'conversation',
      sourceConversationId: args.conversationId,
    };
  }

  const dependentCount = updated.dependentCount?.value;
  const dependentAges = updated.dependentAges?.value;
  if (typeof dependentCount === 'number' && Array.isArray(dependentAges) && dependentAges.length > dependentCount) {
    updated.dependentCount = {
      ...updated.dependentCount!,
      value: dependentAges.length,
    };
  }
  return updated;
}

export function replacePersonalContextManually(
  input: Record<string, unknown>,
  observedAt = new Date().toISOString()
): PersonalContextFacts {
  const unknownField = Object.keys(input).find(
    field => !(PERSONAL_CONTEXT_FIELDS as readonly string[]).includes(field)
  );
  if (unknownField) throw new Error(`Invalid personal context field: ${unknownField}`);

  const facts: PersonalContextFacts = {};
  for (const field of PERSONAL_CONTEXT_FIELDS) {
    const rawValue = input[field];
    if (rawValue === null || rawValue === undefined || rawValue === '') continue;
    const value = normalizePersonalContextValue(field, rawValue);
    if (value === undefined) throw new Error(`Invalid personal context value for ${field}`);
    facts[field] = { value, observedAt, source: 'manual' };
  }
  const dependentCount = facts.dependentCount?.value;
  const dependentAges = facts.dependentAges?.value;
  if (typeof dependentCount === 'number' && Array.isArray(dependentAges) && dependentAges.length > dependentCount) {
    throw new Error('Invalid personal context: dependent count cannot be lower than the number of dependent ages provided');
  }
  return facts;
}
