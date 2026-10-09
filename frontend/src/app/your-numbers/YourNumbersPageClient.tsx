"use client";

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CircleAlert, LoaderCircle } from 'lucide-react';
import AuthenticatedPageHeader from '../../components/authenticated/AuthenticatedPageHeader';
import ManualAccountList from '../../components/ManualAccountList';
import type { ManualAccount } from '../../types/manual-account';
import { clearStoredUserTimeZone } from '../../lib/browser-time-zone';
import { CONNECT_ACCOUNTS_PATH } from '../../lib/connect-accounts';
import { loginUrlForCurrentPage } from '../../lib/post-login-redirect';
import { readField, type DisplayInputRequestField } from '../../lib/input-request';
import {
  failureMessage,
  sendSignedInRequest,
  type FigureCoverage,
  type StatedFigureKey,
  type StatedFigures,
} from '../../lib/your-numbers';

type LoadState = 'loading' | 'ready' | 'error';

interface Overrides {
  monthlyIncome: number | null;
  monthlyExpense: number | null;
}

/** Remembered personal context, as the profile API returns it; only the age is edited here. */
type Memory = Record<string, unknown> & { age?: number };

type Field = DisplayInputRequestField & { hint?: string };

/** The plan's fields, with the bounds Your numbers accepts (see `src/services/stated-figures.ts`). */
const PLAN_FIELDS: Array<Field & { id: StatedFigureKey }> = [
  { id: 'retirementAge', label: 'Age you plan to retire', kind: 'age', required: false, minimum: 30, maximum: 95, sentence: '{value}', hint: 'Linc assumes 65 until you set one.' },
  { id: 'annualRetirementSpending', label: 'What you expect to spend a year in retirement', kind: 'usd_per_year', required: false, minimum: 1_000, maximum: 10_000_000, sentence: '{value}', hint: 'In today\'s dollars.' },
  { id: 'annualContribution', label: 'What you save a year until you retire', kind: 'usd_per_year', required: false, minimum: 0, maximum: 5_000_000, sentence: '{value}' },
  { id: 'retirementIncome', label: 'Pension or other income a year from when you retire', kind: 'usd_per_year', required: false, minimum: 0, maximum: 10_000_000, sentence: '{value}', hint: 'Not Social Security; that has its own line.' },
  { id: 'socialSecurityAnnual', label: 'Social Security a year', kind: 'usd_per_year', required: false, minimum: 0, maximum: 250_000, sentence: '{value}' },
  { id: 'socialSecurityStartAge', label: 'Age Social Security starts', kind: 'age', required: false, minimum: 50, maximum: 80, sentence: '{value}', hint: 'Linc assumes 67.' },
  { id: 'planThroughAge', label: 'Plan through age', kind: 'age', required: false, minimum: 60, maximum: 110, sentence: '{value}', hint: 'Linc assumes 95.' },
  {
    id: 'allocation',
    label: 'Preset mix for market-history tests',
    kind: 'choice',
    required: false,
    options: [
      { value: 'conservative', label: 'Conservative (40% stocks)' },
      { value: 'balanced', label: 'Balanced (60% stocks)' },
      { value: 'growth', label: 'Growth (80% stocks)' },
    ],
    sentence: '{value}',
    hint: 'Used until your linked holdings can be tested instead. Balanced until you choose.',
  },
];

const AGE_FIELD: Field = { id: 'age', label: 'Your age', kind: 'age', required: false, minimum: 18, maximum: 110, sentence: '{value}' };
const MONTHLY_FIELDS: Array<Field & { id: keyof Overrides }> = [
  { id: 'monthlyIncome', label: 'Take-home pay a month', kind: 'usd', required: false, minimum: 0, maximum: 10_000_000, sentence: '{value}' },
  { id: 'monthlyExpense', label: 'Spending a month', kind: 'usd', required: false, minimum: 0, maximum: 10_000_000, sentence: '{value}' },
];

function textFor(field: Field, value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return field.kind === 'usd' || field.kind === 'usd_per_year' ? Math.round(value).toLocaleString('en-US') : String(value);
}

function savedNote(savedAt: string, source: 'page' | 'answer'): string {
  // UTC, matching the server's savedOn wording so a figure saved near midnight
  // does not show as a different calendar day on the page than in an answer.
  const date = new Date(savedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return source === 'answer' ? `Saved ${date} from an answer` : `Saved ${date}`;
}

interface FieldInputProps {
  field: Field;
  text: string;
  onChange: (text: string) => void;
  note?: string;
  error?: string;
  needed?: boolean;
  disabled?: boolean;
}

function FieldInput({ field, text, onChange, note, error, needed, disabled }: FieldInputProps) {
  const inputId = useId();
  const noteId = `${inputId}-note`;
  const shownNote = error ?? note ?? field.hint;
  const money = field.kind === 'usd' || field.kind === 'usd_per_year';
  const suffix = field.kind === 'usd_per_year' ? 'a year' : field.kind === 'usd' ? 'a month' : undefined;
  return (
    <div className="min-w-0">
      <label htmlFor={inputId} className="flex items-center gap-2 text-sm font-semibold text-[#102319]">
        {field.label}
        {needed && <span className="rounded-full bg-[#fde9c8] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#7a4a12]">Needed</span>}
      </label>
      <div className={`mt-1.5 flex items-center rounded-xl border bg-[#f9f8f0] px-3 focus-within:ring-2 focus-within:ring-[#49725a]/30 ${error ? 'border-[#b84a3d]/60' : needed ? 'border-[#d9a441]/70' : 'border-[#102319]/15'}`}>
        {money && <span className="mr-1 text-sm text-[#5e6b63]" aria-hidden="true">$</span>}
        {field.kind === 'choice' ? (
          <select
            id={inputId}
            value={text}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={shownNote ? noteId : undefined}
            className="w-full bg-transparent py-2.5 text-sm text-[#102319] outline-none"
          >
            <option value="">Not set</option>
            {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : (
          <input
            id={inputId}
            type="text"
            inputMode={field.kind === 'age' ? 'numeric' : 'decimal'}
            autoComplete="off"
            value={text}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={shownNote ? noteId : undefined}
            className="w-full min-w-0 bg-transparent py-2.5 text-sm text-[#102319] outline-none"
          />
        )}
        {suffix && <span className="ml-2 shrink-0 text-sm text-[#5e6b63]" aria-hidden="true">{suffix}</span>}
      </div>
      {shownNote && <p id={noteId} className={`mt-1 text-xs ${error ? 'text-[#8b3027]' : 'text-[#66736b]'}`}>{shownNote}</p>}
    </div>
  );
}

/** Read every field's text; values for the filled ones, a message for each that does not read. */
function readAll(fields: readonly Field[], texts: Record<string, string>) {
  const values: Record<string, number | string | null> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const reading = readField(field, texts[field.id] ?? '');
    if (reading.status === 'ok') values[field.id] = reading.value;
    else if (reading.status === 'invalid') errors[field.id] = reading.message;
    else values[field.id] = null;
  }
  return { values, errors };
}

function Section({ title, description, children }: { title: string; description: React.ReactNode; children: React.ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="rounded-[1.5rem] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-[0_12px_40px_rgba(16,35,25,0.05)] sm:p-7">
      <h2 id={headingId} className="text-xl font-semibold tracking-[-0.02em] text-[#102319]">{title}</h2>
      <div className="mt-1 text-sm leading-6 text-[#5e6b63]">{description}</div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SaveRow({ saving, status, onSave, label = 'Save' }: { saving: boolean; status: string | null; onSave: () => void; label?: string }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-full bg-[#102319] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#173c2c] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? <><LoaderCircle className="animate-spin" size={16} />Saving</> : label}
      </button>
      {status && <p className="text-sm text-[#486657]" role="status">{status}</p>}
    </div>
  );
}

/**
 * Your numbers: everything Ask Linc plans with when no linked account says it,
 * in one place the user can come back to. Balances are manual accounts,
 * monthly figures are the Finances overrides and age is remembered context;
 * only the retirement plan is stored here. What a decision cannot be answered
 * without, and no account covers, is marked as needed.
 */
export default function YourNumbersPageClient() {
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  const [state, setState] = useState<LoadState>('loading');
  const [figures, setFigures] = useState<StatedFigures>({});
  const [coverage, setCoverage] = useState<FigureCoverage | null>(null);
  const [manualAccounts, setManualAccounts] = useState<ManualAccount[]>([]);
  const [overrides, setOverrides] = useState<Overrides>({ monthlyIncome: null, monthlyExpense: null });
  const [memory, setMemory] = useState<Memory | null>(null);

  const [planTexts, setPlanTexts] = useState<Record<string, string>>({});
  const [monthlyTexts, setMonthlyTexts] = useState<Record<string, string>>({});
  const [ageText, setAgeText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, string | null>>({});

  const goToLogin = useCallback(() => router.push(loginUrlForCurrentPage()), [router]);

  const loadManualAccounts = useCallback(async () => {
    const response = await sendSignedInRequest(API_URL, '/api/manual-accounts', 'GET');
    if (response.ok) setManualAccounts((await response.json()).data ?? []);
  }, [API_URL]);

  const load = useCallback(async () => {
    let token: string | null = null;
    try { token = localStorage.getItem('auth_token'); } catch { token = null; }
    if (!token) {
      goToLogin();
      return;
    }
    try {
      const [figuresResponse, accountsResponse, overridesResponse, profileResponse] = await Promise.all([
        sendSignedInRequest(API_URL, '/api/stated-figures', 'GET'),
        sendSignedInRequest(API_URL, '/api/manual-accounts', 'GET'),
        sendSignedInRequest(API_URL, '/api/finances/overrides', 'GET'),
        sendSignedInRequest(API_URL, '/profile', 'GET'),
      ]);
      if ([figuresResponse, accountsResponse, overridesResponse, profileResponse].some((response) => response.status === 401)) {
        goToLogin();
        return;
      }
      if (!figuresResponse.ok) throw new Error('Failed to load your numbers');
      const figuresData = await figuresResponse.json();
      const loadedFigures: StatedFigures = figuresData.figures ?? {};
      setFigures(loadedFigures);
      setCoverage(figuresData.coverage ?? null);
      setPlanTexts(Object.fromEntries(PLAN_FIELDS.map((field) => [field.id, textFor(field, loadedFigures[field.id]?.value)])));

      if (accountsResponse.ok) setManualAccounts((await accountsResponse.json()).data ?? []);
      if (overridesResponse.ok) {
        const data = await overridesResponse.json();
        const loaded = { monthlyIncome: data.monthlyIncome ?? null, monthlyExpense: data.monthlyExpense ?? null };
        setOverrides(loaded);
        setMonthlyTexts(Object.fromEntries(MONTHLY_FIELDS.map((field) => [field.id, textFor(field, loaded[field.id])])));
      }
      if (profileResponse.ok) {
        const loadedMemory: Memory = (await profileResponse.json()).memory ?? {};
        setMemory(loadedMemory);
        setAgeText(textFor(AGE_FIELD, typeof loadedMemory.age === 'number' ? loadedMemory.age : null));
      }
      setState('ready');
    } catch (error) {
      console.error('Error loading your numbers:', error);
      setState('error');
    }
  }, [API_URL, goToLogin]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasEnteredInvestments = manualAccounts.some((account) => account.type === 'investment');
  const needed = useMemo(() => ({
    age: typeof memory?.age !== 'number',
    invested: coverage !== null && coverage.investments === null && !hasEnteredInvestments,
    retirementSpending: figures.annualRetirementSpending === undefined,
    monthlySpending: coverage !== null && !coverage.spendingFromTransactions && overrides.monthlyExpense === null,
  }), [memory, coverage, hasEnteredInvestments, figures, overrides]);
  const neededLabels = [
    needed.age && 'your age',
    needed.invested && 'what you have invested',
    needed.retirementSpending && 'what retirement will cost',
    needed.monthlySpending && 'what you spend a month',
  ].filter((item): item is string => Boolean(item));

  const setStatusFor = (section: string, message: string | null) => setStatus((current) => ({ ...current, [section]: message }));

  const saveAge = async () => {
    if (!memory) return;
    const reading = readField(AGE_FIELD, ageText);
    if (reading.status === 'invalid') {
      setErrors((current) => ({ ...current, age: reading.message }));
      return;
    }
    setErrors(({ age: _cleared, ...rest }) => rest);
    const next: Memory = { ...memory };
    if (reading.status === 'ok') next.age = reading.value as number;
    else delete next.age;
    setSaving('age');
    try {
      const response = await sendSignedInRequest(API_URL, '/profile', 'PUT', { memory: next });
      if (!response.ok) throw new Error(await failureMessage(response, 'Your age could not be saved.'));
      setMemory((await response.json()).memory ?? next);
      setStatusFor('age', 'Saved.');
    } catch (failure) {
      setStatusFor('age', failure instanceof Error ? failure.message : 'Your age could not be saved.');
    } finally {
      setSaving(null);
    }
  };

  const saveMonthly = async () => {
    const { values, errors: problems } = readAll(MONTHLY_FIELDS, monthlyTexts);
    setErrors((current) => ({ ...Object.fromEntries(Object.entries(current).filter(([key]) => !(key in values) && !(key in problems))), ...problems }));
    if (Object.keys(problems).length > 0) return;
    setSaving('monthly');
    try {
      const response = await sendSignedInRequest(API_URL, '/api/finances/overrides', 'PUT', values);
      if (!response.ok) throw new Error(await failureMessage(response, 'Your monthly figures could not be saved.'));
      const data = await response.json();
      setOverrides({ monthlyIncome: data.monthlyIncome ?? null, monthlyExpense: data.monthlyExpense ?? null });
      setStatusFor('monthly', 'Saved.');
    } catch (failure) {
      setStatusFor('monthly', failure instanceof Error ? failure.message : 'Your monthly figures could not be saved.');
    } finally {
      setSaving(null);
    }
  };

  const savePlan = async () => {
    const { values, errors: problems } = readAll(PLAN_FIELDS, planTexts);
    setErrors((current) => ({ ...Object.fromEntries(Object.entries(current).filter(([key]) => !(key in values) && !(key in problems))), ...problems }));
    if (Object.keys(problems).length > 0) return;
    // Only what changed: an untouched figure keeps the date it was saved.
    const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) =>
      (figures[key as StatedFigureKey]?.value ?? null) !== value
    ));
    if (Object.keys(changes).length === 0) {
      setStatusFor('plan', 'Nothing has changed.');
      return;
    }
    setSaving('plan');
    try {
      const response = await sendSignedInRequest(API_URL, '/api/stated-figures', 'PUT', { figures: changes, source: 'page' });
      if (!response.ok) throw new Error(await failureMessage(response, 'Your plan could not be saved.'));
      setFigures((await response.json()).figures ?? {});
      setStatusFor('plan', 'Saved. Linc will plan with these from your next question.');
    } catch (failure) {
      setStatusFor('plan', failure instanceof Error ? failure.message : 'Your plan could not be saved.');
    } finally {
      setSaving(null);
    }
  };

  const handleLogout = () => {
    try { localStorage.removeItem('auth_token'); } catch { /* nothing to clear */ }
    clearStoredUserTimeZone();
    router.push('/login');
  };

  const investmentsNote = coverage?.investments === 'linked' || coverage?.investments === 'linked_and_entered'
    ? 'Your linked investment accounts already give Linc your balances and holdings.'
    : 'Linc reads balances from linked accounts. Until you link one, add what you have here, and every answer will say it used the figure you entered.';

  return (
    <div className="authenticated-site min-h-screen">
      <AuthenticatedPageHeader
        activePage="profile"
        eyebrow="Your numbers"
        title="The figures Linc plans with"
        onLogout={handleLogout}
      />
      <main className="mx-auto max-w-[960px] space-y-6 px-5 py-10 sm:px-6 md:py-12">
        <div className="authenticated-intro">
          <h2>Answer once, and Linc remembers.</h2>
          <p>Linc answers from your linked accounts first. Anything they cannot say, it takes from here, and every answer says which of your figures it used. Change them any time.</p>
        </div>

        {state === 'loading' && (
          <div className="flex items-center gap-2 py-10 text-sm text-[#5e6b63]"><LoaderCircle className="animate-spin" size={18} />Loading your numbers…</div>
        )}
        {state === 'error' && (
          <div role="alert" className="rounded-2xl border border-[#b84a3d]/25 bg-[#fff2ed] p-5 text-sm text-[#8b3027]">Your numbers could not be loaded. Refresh to try again.</div>
        )}

        {state === 'ready' && (
          <>
            {neededLabels.length > 0 && (
              <div className="flex items-start gap-3 rounded-2xl border border-[#d9a441]/40 bg-[#fff8e8] p-4 text-sm text-[#6b4a12]" role="note">
                <CircleAlert size={18} className="mt-0.5 shrink-0" />
                <p>Still needed for most decisions: {neededLabels.join(', ')}. Linc asks for these when a question needs them; filling them in here means it will not have to.</p>
              </div>
            )}

            <Section title="About you" description="Remembered with the rest of what Linc knows about you, on Accounts & context.">
              <div className="max-w-xs">
                <FieldInput
                  field={AGE_FIELD}
                  text={ageText}
                  onChange={setAgeText}
                  error={errors.age}
                  needed={needed.age}
                  disabled={saving === 'age'}
                />
              </div>
              <SaveRow saving={saving === 'age'} status={status.age ?? null} onSave={() => void saveAge()} />
            </Section>

            <Section
              title="What you have"
              description={<>{investmentsNote} <Link href={CONNECT_ACCOUNTS_PATH} className="font-semibold text-[#397052] underline">Link an account</Link></>}
            >
              {needed.invested && (
                <p className="mb-4 rounded-xl border border-[#d9a441]/50 bg-[#fff8e8] px-4 py-3 text-sm text-[#6b4a12]">
                  <span className="font-semibold">Needed for retirement answers:</span> add what you have invested as an investment account.
                </p>
              )}
              <ManualAccountList accounts={manualAccounts} onRefresh={() => void loadManualAccounts()} />
            </Section>

            <Section
              title="Each month"
              description={coverage?.spendingFromTransactions
                ? 'Linc reads these from your linked transactions. A figure set here replaces what it reads, on this page, on Finances and in every answer.'
                : 'With no linked transactions to read them from, these are what Linc plans with. The same figures appear on Finances.'}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {MONTHLY_FIELDS.map((field) => (
                  <FieldInput
                    key={field.id}
                    field={field}
                    text={monthlyTexts[field.id] ?? ''}
                    onChange={(text) => setMonthlyTexts((current) => ({ ...current, [field.id]: text }))}
                    error={errors[field.id]}
                    needed={field.id === 'monthlyExpense' && needed.monthlySpending}
                    disabled={saving === 'monthly'}
                  />
                ))}
              </div>
              <SaveRow saving={saving === 'monthly'} status={status.monthly ?? null} onSave={() => void saveMonthly()} />
            </Section>

            <Section title="Your retirement plan" description="Linc plans with these unless a question says otherwise. Leave one blank and it uses the assumption shown, and says so.">
              <div className="grid gap-4 sm:grid-cols-2">
                {PLAN_FIELDS.map((field) => {
                  const saved = figures[field.id];
                  return (
                    <FieldInput
                      key={field.id}
                      field={field}
                      text={planTexts[field.id] ?? ''}
                      onChange={(text) => setPlanTexts((current) => ({ ...current, [field.id]: text }))}
                      note={saved ? savedNote(saved.savedAt, saved.source) : undefined}
                      error={errors[field.id]}
                      needed={field.id === 'annualRetirementSpending' && needed.retirementSpending}
                      disabled={saving === 'plan'}
                    />
                  );
                })}
              </div>
              <SaveRow saving={saving === 'plan'} status={status.plan ?? null} onSave={() => void savePlan()} label="Save plan" />
            </Section>

            <Link href="/app" className="inline-flex items-center gap-2 text-sm font-semibold text-[#102319] hover:underline">
              Ask Linc a question <ArrowRight size={16} />
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
