"use client";

import { useState } from 'react';
import { CalendarPlus, Pencil, Trash2 } from 'lucide-react';
import { useDialog } from '../ui/dialog';
import { fromGrouped, withCommas } from '../../lib/number-input';
import {
  RECURRENCE_LABELS,
  describeSchedule,
  formatCalendarDate,
  formatMoney,
} from '../../lib/cash-flow-format';
import type {
  CashFlowPlannedEventSummary,
  PlannedEventKind,
  PlannedEventRecurrence,
} from '../../types/cash-flow';

interface PlannedEventsPanelProps {
  apiUrl: string;
  events: CashFlowPlannedEventSummary[];
  today: string;
  onChanged: () => Promise<void> | void;
}

interface FormState {
  id: string | null;
  label: string;
  kind: PlannedEventKind;
  amount: string;
  startDate: string;
  recurrence: PlannedEventRecurrence;
  endDate: string;
}

const RECURRENCES = Object.keys(RECURRENCE_LABELS) as PlannedEventRecurrence[];

const fieldClass =
  'mt-1.5 w-full rounded-xl border border-[#102319]/15 bg-white px-3.5 py-2.5 text-sm text-[#102319] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319]';

function emptyForm(today: string): FormState {
  return { id: null, label: '', kind: 'expense', amount: '', startDate: today, recurrence: 'once', endDate: '' };
}

async function send(apiUrl: string, path: string, method: string, body?: unknown): Promise<Response> {
  const token = localStorage.getItem('auth_token');
  return fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export default function PlannedEventsPanel({ apiUrl, events, today, onChanged }: PlannedEventsPanelProps) {
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { showConfirm, showError, dialog } = useDialog();

  const update = (changes: Partial<FormState>) => setForm(current => (current ? { ...current, ...changes } : current));

  const startEdit = (event: CashFlowPlannedEventSummary) => {
    setError('');
    setForm({
      id: event.id,
      label: event.label,
      kind: event.kind,
      amount: withCommas(String(event.amount)),
      startDate: event.startDate,
      recurrence: event.recurrence,
      endDate: event.endDate ?? '',
    });
  };

  const submit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      const response = await send(apiUrl, form.id ? `/api/cash-flow/events/${encodeURIComponent(form.id)}` : '/api/cash-flow/events', form.id ? 'PUT' : 'POST', {
        label: form.label,
        kind: form.kind,
        amount: fromGrouped(form.amount),
        startDate: form.startDate,
        recurrence: form.recurrence,
        endDate: form.recurrence === 'once' ? null : form.endDate || null,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(typeof data.error === 'string' ? data.error : 'We couldn’t save that event. Please try again.');
        return;
      }
      setForm(null);
      await onChanged();
    } catch {
      setError('We couldn’t save that event. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (event: CashFlowPlannedEventSummary) => {
    const confirmed = await showConfirm({
      title: 'Remove this planned event?',
      message: `“${event.label}” will no longer be part of your forecast.`,
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    try {
      const response = await send(apiUrl, `/api/cash-flow/events/${encodeURIComponent(event.id)}`, 'DELETE');
      if (!response.ok && response.status !== 404) throw new Error('delete failed');
      await onChanged();
    } catch {
      await showError('We couldn’t remove that event. Please try again.');
    }
  };

  return (
    <section className="rounded-[1.6rem] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-sm sm:p-7" aria-labelledby="planned-events-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="planned-events-heading" className="text-lg font-semibold text-[#102319]">Planned events</h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[#5e6b63]">
            Add money you expect that your history can’t show: a bonus, a tuition bill, a planned purchase.
            Regular paychecks and bills are already in the forecast.
          </p>
        </div>
        {!form && (
          <button
            type="button"
            onClick={() => { setError(''); setForm(emptyForm(today)); }}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-[#102319] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#173c2c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2"
          >
            <CalendarPlus size={16} aria-hidden="true" />
            Add planned event
          </button>
        )}
      </div>

      {form && (
        <form onSubmit={submit} className="mt-5 grid gap-4 rounded-2xl border border-[#102319]/10 bg-[#f3f2e9] p-4 sm:grid-cols-2 sm:p-5" aria-label={form.id ? 'Edit planned event' : 'Add planned event'}>
          <label className="text-sm font-semibold text-[#102319] sm:col-span-2">
            Name
            <input
              className={fieldClass}
              value={form.label}
              maxLength={80}
              onChange={event => update({ label: event.target.value })}
              placeholder="e.g. Year-end bonus"
              required
            />
          </label>

          <fieldset className="text-sm font-semibold text-[#102319]">
            <legend>Direction</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-xl border border-[#102319]/10 bg-white p-1">
              {(['income', 'expense'] as const).map(kind => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={form.kind === kind}
                  onClick={() => update({ kind })}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${form.kind === kind ? 'bg-[#102319] text-white' : 'text-[#5e6b63] hover:bg-[#f3f2e9]'}`}
                >
                  {kind === 'income' ? 'Money in' : 'Money out'}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="text-sm font-semibold text-[#102319]">
            Amount
            <input
              className={fieldClass}
              inputMode="decimal"
              value={form.amount}
              onChange={event => update({ amount: withCommas(event.target.value) })}
              placeholder="$0"
              required
            />
          </label>

          <label className="text-sm font-semibold text-[#102319]">
            {form.recurrence === 'once' ? 'Date' : 'First date'}
            <input
              type="date"
              className={fieldClass}
              value={form.startDate}
              onChange={event => update({ startDate: event.target.value })}
              required
            />
          </label>

          <label className="text-sm font-semibold text-[#102319]">
            Repeats
            <select
              className={fieldClass}
              value={form.recurrence}
              onChange={event => update({ recurrence: event.target.value as PlannedEventRecurrence })}
            >
              {RECURRENCES.map(recurrence => (
                <option key={recurrence} value={recurrence}>{RECURRENCE_LABELS[recurrence]}</option>
              ))}
            </select>
          </label>

          {form.recurrence !== 'once' && (
            <label className="text-sm font-semibold text-[#102319]">
              Last date <span className="font-normal text-[#66736b]">(optional)</span>
              <input
                type="date"
                className={fieldClass}
                value={form.endDate}
                min={form.startDate}
                onChange={event => update({ endDate: event.target.value })}
              />
            </label>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-[#b84a3d]/25 bg-[#f8e8e3] px-3.5 py-2.5 text-sm text-[#8b3027] sm:col-span-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="min-h-10 rounded-full bg-[#102319] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#173c2c] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2"
            >
              {saving ? 'Saving…' : form.id ? 'Save changes' : 'Add to forecast'}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="min-h-10 rounded-full border border-[#102319]/15 bg-[#fffdf5] px-5 py-2 text-sm font-bold text-[#102319] transition hover:border-[#102319]/30"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {events.length === 0 ? (
        !form && <p className="mt-5 text-sm text-[#66736b]">No planned events yet.</p>
      ) : (
        <ul className="mt-5 divide-y divide-[#102319]/10">
          {events.map(event => (
            <li key={event.id} className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[#102319]">{event.label}</p>
                <p className="mt-0.5 text-xs text-[#66736b]">
                  {describeSchedule(event)}
                  {event.nextDate && event.recurrence !== 'once' ? ` · next ${formatCalendarDate(event.nextDate)}` : ''}
                  {!event.nextDate ? ' · already passed' : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold tabular-nums ${event.kind === 'income' ? 'text-[#28704d]' : 'text-[#9b4137]'}`}>
                  {event.kind === 'income' ? '+' : '−'}{formatMoney(event.amount, true)}
                </span>
                <button
                  type="button"
                  onClick={() => startEdit(event)}
                  aria-label={`Edit ${event.label}`}
                  className="rounded-full p-2 text-[#5e6b63] transition hover:bg-[#f3f2e9] hover:text-[#102319]"
                >
                  <Pencil size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(event)}
                  aria-label={`Remove ${event.label}`}
                  className="rounded-full p-2 text-[#5e6b63] transition hover:bg-[#f8e8e3] hover:text-[#8b3027]"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </section>
  );
}
