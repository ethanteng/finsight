"use client";

import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Pencil, Trash2 } from 'lucide-react';
import { useDialog } from '../ui/dialog';
import { fromGrouped, withCommas } from '../../lib/number-input';
import {
  RECURRENCE_LABELS,
  cardName,
  describeCardPlan,
  describeSchedule,
  formatCalendarDate,
  formatMoney,
} from '../../lib/cash-flow-format';
import type {
  CardPaymentMode,
  CashFlowCardSummary,
  CashFlowPlannedEventSummary,
  PlannedEventKind,
  PlannedEventRecurrence,
} from '../../types/cash-flow';

/** Ask the panel to open its form on a card payment for this card. */
export interface CardPaymentRequest {
  accountId: string;
  /** Changes on every request, so asking twice for the same card opens the form twice. */
  requestId: number;
}

interface PlannedEventsPanelProps {
  apiUrl: string;
  events: CashFlowPlannedEventSummary[];
  cards?: CashFlowCardSummary[];
  cardPaymentRequest?: CardPaymentRequest | null;
  today: string;
  /** The first day the forecast covers: anything planned before it doesn't change the forecast. */
  forecastStart: string;
  onChanged: () => Promise<void> | void;
}

interface FormState {
  id: string | null;
  label: string;
  /** The label was filled in for the user and follows the card and mode until they edit it. */
  labelIsAutomatic: boolean;
  kind: PlannedEventKind;
  amount: string;
  startDate: string;
  recurrence: PlannedEventRecurrence;
  endDate: string;
  accountId: string;
  paymentMode: CardPaymentMode;
}

const RECURRENCES = Object.keys(RECURRENCE_LABELS) as PlannedEventRecurrence[];
const CARD_RECURRENCES: PlannedEventRecurrence[] = ['once', 'monthly'];

const KIND_LABELS: Record<PlannedEventKind, string> = {
  income: 'Money in',
  expense: 'Money out',
  card_payment: 'Pay a card',
};

const fieldClass =
  'mt-1.5 w-full rounded-xl border border-[#102319]/15 bg-white px-3.5 py-2.5 text-sm text-[#102319] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319]';

function emptyForm(today: string): FormState {
  return {
    id: null, label: '', labelIsAutomatic: false, kind: 'expense', amount: '', startDate: today, recurrence: 'once',
    endDate: '', accountId: '', paymentMode: 'full',
  };
}

function automaticLabel(card: CashFlowCardSummary | undefined, mode: CardPaymentMode): string {
  if (!card) return '';
  return mode === 'full' ? `Pay off ${card.name}` : `${card.name} payment`;
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

function Toggle<T extends string>({ legend, options, value, onChange }: {
  legend: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="text-sm font-semibold text-[#102319]">
      <legend>{legend}</legend>
      <div className={`mt-1.5 grid gap-1 rounded-xl border border-[#102319]/10 bg-white p-1`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`rounded-lg px-2 py-2 text-sm font-semibold transition ${value === option.value ? 'bg-[#102319] text-white' : 'text-[#5e6b63] hover:bg-[#f3f2e9]'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function PlannedEventsPanel({
  apiUrl,
  events,
  cards = [],
  cardPaymentRequest = null,
  today,
  forecastStart,
  onChanged,
}: PlannedEventsPanelProps) {
  // A new event starts on the first day the forecast covers, which is
  // tomorrow when today's transactions are already in.
  const firstDate = forecastStart > today ? forecastStart : today;
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const sectionRef = useRef<HTMLElement>(null);
  const { showConfirm, showError, dialog } = useDialog();
  const cardById = new Map(cards.map(card => [card.accountId, card]));

  const update = (changes: Partial<FormState>) => setForm(current => {
    if (!current) return current;
    const next = { ...current, ...changes };
    // A filled-in label follows the card and mode until the user writes their own.
    if (next.kind === 'card_payment' && next.labelIsAutomatic && changes.label === undefined) {
      next.label = automaticLabel(cardById.get(next.accountId), next.paymentMode);
    }
    return next;
  });

  // "Plan a payment" on a card opens the form on that card.
  useEffect(() => {
    if (!cardPaymentRequest) return;
    const card = cards.find(item => item.accountId === cardPaymentRequest.accountId);
    setError('');
    setForm({
      ...emptyForm(firstDate),
      kind: 'card_payment',
      accountId: cardPaymentRequest.accountId,
      // With no usual pace, only a monthly plan lets the card be projected.
      recurrence: card?.behavior === 'unknown' ? 'monthly' : 'once',
      label: automaticLabel(card, 'full'),
      labelIsAutomatic: true,
    });
    sectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    // Only a new request should reopen the form; cards and dates change with every reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardPaymentRequest?.requestId]);

  const chooseKind = (kind: PlannedEventKind) => {
    if (kind === 'card_payment') {
      const accountId = form?.accountId || cards[0]?.accountId || '';
      const automatic = !form?.label || Boolean(form?.labelIsAutomatic);
      update({
        kind,
        accountId,
        recurrence: CARD_RECURRENCES.includes(form?.recurrence ?? 'once') ? form?.recurrence : 'once',
        labelIsAutomatic: automatic,
        ...(automatic && { label: automaticLabel(cardById.get(accountId), form?.paymentMode ?? 'full') }),
      });
    } else {
      update({ kind, ...(form?.labelIsAutomatic && { label: '', labelIsAutomatic: false }) });
    }
  };

  const startEdit = (event: CashFlowPlannedEventSummary) => {
    setError('');
    setForm({
      id: event.id,
      label: event.label,
      labelIsAutomatic: false,
      kind: event.kind,
      amount: event.amount ? withCommas(String(event.amount)) : '',
      startDate: event.startDate,
      recurrence: event.recurrence,
      endDate: event.endDate ?? '',
      accountId: event.accountId ?? '',
      paymentMode: event.paymentMode ?? 'full',
    });
  };

  const submit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    const isCard = form.kind === 'card_payment';
    try {
      const response = await send(apiUrl, form.id ? `/api/cash-flow/events/${encodeURIComponent(form.id)}` : '/api/cash-flow/events', form.id ? 'PUT' : 'POST', {
        label: form.label,
        kind: form.kind,
        amount: isCard && form.paymentMode === 'full' ? 0 : fromGrouped(form.amount),
        startDate: form.startDate,
        recurrence: form.recurrence,
        endDate: form.recurrence === 'once' ? null : form.endDate || null,
        ...(isCard && { accountId: form.accountId, paymentMode: form.paymentMode }),
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

  const kinds: PlannedEventKind[] = cards.length > 0 ? ['income', 'expense', 'card_payment'] : ['income', 'expense'];
  const isCardForm = form?.kind === 'card_payment';

  return (
    <section ref={sectionRef} className="scroll-mt-28 rounded-[1.6rem] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-sm sm:p-7" aria-labelledby="planned-events-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="planned-events-heading" className="text-lg font-semibold text-[#102319]">Planned events</h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[#5e6b63]">
            Add money you expect that your history can’t show: a bonus, a tuition bill, a planned purchase
            {cards.length > 0 ? ', or paying down a credit card' : ''}. Regular paychecks and bills are already in the forecast.
          </p>
        </div>
        {!form && (
          <button
            type="button"
            onClick={() => { setError(''); setForm(emptyForm(firstDate)); }}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-[#102319] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#173c2c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319] focus-visible:ring-offset-2"
          >
            <CalendarPlus size={16} aria-hidden="true" />
            Add planned event
          </button>
        )}
      </div>

      {form && (
        <form onSubmit={submit} className="mt-5 grid gap-4 rounded-2xl border border-[#102319]/10 bg-[#f3f2e9] p-4 sm:grid-cols-2 sm:p-5" aria-label={form.id ? 'Edit planned event' : 'Add planned event'}>
          <div className="sm:col-span-2">
            <Toggle legend="Type" options={kinds.map(kind => ({ value: kind, label: KIND_LABELS[kind] }))} value={form.kind} onChange={chooseKind} />
          </div>

          {isCardForm && (
            <>
              <label className="text-sm font-semibold text-[#102319]">
                Card
                <select className={fieldClass} value={form.accountId} onChange={event => update({ accountId: event.target.value })} required>
                  {cards.map(card => <option key={card.accountId} value={card.accountId}>{cardName(card)}</option>)}
                </select>
              </label>
              <Toggle
                legend="Pay"
                options={[{ value: 'full', label: 'In full' }, { value: 'fixed', label: 'A set amount' }]}
                value={form.paymentMode}
                onChange={paymentMode => update({ paymentMode })}
              />
            </>
          )}

          <label className="text-sm font-semibold text-[#102319] sm:col-span-2">
            Name
            <input
              className={fieldClass}
              value={form.label}
              maxLength={80}
              onChange={event => update({ label: event.target.value, labelIsAutomatic: false })}
              placeholder={isCardForm ? 'e.g. Pay off my card' : 'e.g. Year-end bonus'}
              required
            />
          </label>

          {(!isCardForm || form.paymentMode === 'fixed') && (
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
          )}

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
              {(isCardForm ? CARD_RECURRENCES : RECURRENCES).map(recurrence => (
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

          {(form.recurrence === 'once' ? form.startDate !== '' && form.startDate < forecastStart : form.endDate !== '' && form.endDate < forecastStart) && (
            <p className="text-xs leading-5 text-[#76510f] sm:col-span-2">
              The forecast starts on {formatCalendarDate(forecastStart)}, so this won’t change it.
            </p>
          )}

          {isCardForm && (
            <p className="text-xs leading-5 text-[#5e6b63] sm:col-span-2">
              {form.paymentMode === 'full'
                ? (form.recurrence === 'once'
                  ? 'Pays off everything the card owes on that day.'
                  : 'Pays each statement in full, so the card stops charging interest.')
                : (form.recurrence === 'once'
                  ? 'An extra payment on top of what you usually pay.'
                  : 'Paid every month in place of what you usually pay.')}
            </p>
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
          {events.map(event => {
            const card = event.kind === 'card_payment' ? cardById.get(event.accountId ?? '') : undefined;
            return (
              <li key={event.id} className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#102319]">{event.label}</p>
                  <p className="mt-0.5 text-xs text-[#66736b]">
                    {event.kind === 'card_payment' ? describeCardPlan(event) : describeSchedule(event)}
                    {event.kind === 'card_payment' && (card ? ` · ${cardName(card)}` : ' · card no longer connected')}
                    {event.nextDate && event.recurrence !== 'once' ? ` · next ${formatCalendarDate(event.nextDate)}` : ''}
                    {!event.nextDate ? ' · already passed' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold tabular-nums ${event.kind === 'income' ? 'text-[#28704d]' : event.kind === 'expense' ? 'text-[#9b4137]' : 'text-[#102319]'}`}>
                    {event.kind === 'card_payment'
                      ? (event.paymentMode === 'full' ? 'In full' : formatMoney(event.amount, true))
                      : `${event.kind === 'income' ? '+' : '−'}${formatMoney(event.amount, true)}`}
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
            );
          })}
        </ul>
      )}
      {dialog}
    </section>
  );
}
