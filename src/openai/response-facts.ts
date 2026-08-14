import { canonicalFactMap, validateCanonicalFactPack, type CanonicalFactPack } from './canonical-facts';
import type { AskLincResponse, ResponseKeyNumber } from './structured-response';

export interface FactResponseValidationResult {
  valid: boolean;
  issues: string[];
  invalidKeyNumbers: string[];
  invalidSummary: boolean;
}

const FACT_ALIASES: Record<string, string> = {
  investment_total: 'total_investments',
  portfolio_total: 'portfolio_value',
  monthly_income: 'average_monthly_income',
  monthly_expense: 'average_monthly_expenses',
  monthly_expenses: 'average_monthly_expenses',
};

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function approximatelyEqual(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 0.01;
}

/** Replace model-authored metadata with the exact server-side fact contract. */
export function canonicalizeResponseNumbers(
  response: AskLincResponse,
  pack: CanonicalFactPack
): AskLincResponse {
  if (!response.key_numbers) return response;
  const facts = canonicalFactMap(pack);
  const keyNumbers: Record<string, ResponseKeyNumber> = {};
  for (const [key, metric] of Object.entries(response.key_numbers)) {
    const normalized = normalizedKey(key);
    const value = typeof metric === 'number' ? metric : metric.value;
    const provenance = typeof metric === 'number' ? '' : metric.provenance;
    const factId = provenance || FACT_ALIASES[normalized] || normalized;
    const fact = facts.get(factId);
    keyNumbers[key] = fact && fact.displayable !== false && approximatelyEqual(value, fact.value)
      ? { value: fact.value, unit: fact.unit, provenance: fact.id }
      : typeof metric === 'number'
        ? { value: metric, unit: fact?.unit || 'usd', provenance }
        : metric;
  }
  return { ...response, key_numbers: keyNumbers };
}

function parseMagnitude(value: string, magnitude?: string): number {
  const parsed = Number(value.replace(/,/g, ''));
  const normalized = magnitude?.toLowerCase();
  if (normalized === 'k' || normalized === 'thousand') return parsed * 1_000;
  if (normalized === 'm' || normalized === 'million') return parsed * 1_000_000;
  if (normalized === 'b' || normalized === 'billion') return parsed * 1_000_000_000;
  return parsed;
}

/** Validate every structured number and every money/percentage in user-facing prose. */
export function validateResponseFacts(
  response: AskLincResponse,
  pack: CanonicalFactPack
): FactResponseValidationResult {
  const issues = validateCanonicalFactPack(pack);
  const invalidKeyNumbers: string[] = [];
  let invalidSummary = !response.summary?.trim();
  if (invalidSummary) issues.push('The response summary is empty.');
  const facts = canonicalFactMap(pack);

  for (const [key, metric] of Object.entries(response.key_numbers || {})) {
    const normalizedMetric = typeof metric === 'number'
      ? { value: metric, unit: 'usd' as const, provenance: '' }
      : metric;
    const fact = facts.get(normalizedMetric.provenance);
    if (!fact || fact.displayable === false) {
      issues.push(`${key} does not cite a canonical fact.`);
      invalidKeyNumbers.push(key);
      continue;
    }
    if (!approximatelyEqual(normalizedMetric.value, fact.value)) {
      issues.push(`${key} must equal cited fact ${fact.id}.`);
      invalidKeyNumbers.push(key);
    }
    if (normalizedMetric.unit !== fact.unit) {
      issues.push(`${key} must use unit ${fact.unit}.`);
      invalidKeyNumbers.push(key);
    }
  }

  const prose = [response.summary, ...(response.insights || []), ...(response.suggested_actions || [])].join('\n');
  const numericClaims = [
    ...Array.from(prose.matchAll(/(-?)\$\s*(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|[kmb])?/gi))
      .map((match) => ({
        value: (match[1] === '-' ? -1 : 1) * parseMagnitude(match[2], match[3]),
        unit: 'usd' as const,
      })),
    ...Array.from(prose.matchAll(/(-?\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|[kmb])?\s*%/gi))
      .map((match) => ({ value: parseMagnitude(match[1], match[2]), unit: 'percent' as const })),
    ...Array.from(prose.matchAll(/(-?\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion)\s+dollars?\b/gi))
      .map((match) => ({ value: parseMagnitude(match[1], match[2]), unit: 'usd' as const })),
  ];
  for (const claim of numericClaims) {
    const supported = pack.facts.some((fact) => fact.displayable !== false && fact.unit === claim.unit && approximatelyEqual(fact.value, claim.value));
    if (!supported) {
      issues.push(`User-facing ${claim.unit} value ${claim.value} is not present in the canonical fact pack.`);
      invalidSummary = true;
    }
  }

  const genericNumberPattern = /-?\d[\d,]*(?:\.\d+)?\s*(?:thousand|million|billion|[kmb])?/gi;
  for (const match of prose.matchAll(genericNumberPattern)) {
    const index = match.index ?? 0;
    const prefix = prose.slice(Math.max(0, index - 3), index).trimEnd();
    const afterMatch = prose.slice(index + match[0].length);
    const suffix = afterMatch.trimStart();
    // Currency and percentage claims were checked with their units above.
    if (prefix.endsWith('$') || /^%/.test(suffix) || /^(?:dollars?)\b/i.test(suffix)) continue;
    const parsed = match[0].match(/^(-?\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|[kmb])?$/i);
    if (!parsed) continue;
    const magnitude = parsed[2]?.toLowerCase();
    if (magnitude && /^[kmb]$/.test(magnitude)) {
      // Avoid treating account types (401k) or words like "markets" as magnitudes.
      if (/^[a-z]/i.test(afterMatch)) continue;
      const digits = parsed[1].replace(/,/g, '').replace(/^-/, '');
      if (!/\s/.test(match[0])) {
        if (/^(401|403|457)/.test(digits)) continue;
        if (digits.length > 3) continue;
      }
    }
    const bareValue = Number(parsed[1].replace(/,/g, ''));
    if (!magnitude && Number.isInteger(bareValue) && bareValue >= 1900 && bareValue <= 2099) {
      // Calendar years in historical context are not financial claims.
      continue;
    }
    const value = parseMagnitude(parsed[1], parsed[2]);
    const supported = pack.facts.some((fact) => fact.displayable !== false && approximatelyEqual(fact.value, value));
    if (!supported) {
      issues.push(`User-facing numeric value ${value} is not present in the canonical fact pack.`);
      invalidSummary = true;
    }
  }

  if (invalidKeyNumbers.length > 0) invalidSummary = true;
  return {
    valid: issues.length === 0,
    issues: Array.from(new Set(issues)),
    invalidKeyNumbers: Array.from(new Set(invalidKeyNumbers)),
    invalidSummary,
  };
}
