"use client";

import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Pencil, Trash2 } from 'lucide-react';
import { useDialog } from '../ui/dialog';
import { sendCashFlowRequest as send } from '../../lib/cash-flow-api';
import { fromGrouped, withCommas } from '../../lib/number-input';
import {
  RECURRENCE_LABELS,
  cardName,
  cashAccountName,
  describeCardPlan,
  describeSchedule,
  formatCalendarDate,
  formatMoney,
} from '../../lib/cash-flow-format';
import type {
  CardPaymentMode,
  CashFlowCardSummary,
  CashFlowPlannedEventSummary,
  CashFlowPositionAccount,
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
  /** The user's cash accounts, for choosing where planned income or an expense lands, and what a transfer moves between. */
  cashAccounts?: CashFlowPositionAccount[];
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
  /** The card a card payment pays. */
  accountId: string;
  /**
   * The cash account income or an expense lands in. Empty is "the primary
   * account": the event is saved without one, so it keeps following the
   * primary account rather than being pinned to whichever is primary today.
   */
  cashAccountId: string;
  /** The cash accounts a transfer moves money from and to. */
  fromAccountId: string;
  toAccountId: string;
  paymentMode: CardPaymentMode;
}

const RECURRENCES = Object.keys(RECURRENCE_LABELS) as PlannedEventRecurrence[];
const CARD_RECURRENCES: PlannedEventRecurrence[] = ['once', 'monthly'];

const KIND_LABELS: Record<PlannedEventKind, string> = {
  income: 'Money in',
  expense: 'Money out',
  transfer: 'Transfer',
  card_payment: 'Pay a card',
};

const fieldClass =
  'mt-1.5 w-full rounded-xl border border-[#102319]/15 bg-white px-3.5 py-2.5 text-sm text-[#102319] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102319]';

function emptyForm(today: string): FormState {
  return {
    id: null, label: '', labelIsAutomatic: false, kind: 'expense', amount: '', startDate: today, recurrence: 'once',
    endDate: '', accountId: '', cashAccountId: '', fromAccountId: '', toAccountId: '', paymentMode: 'full',
  };
}

function automaticLabel(card: CashFlowCardSummary | undefined, mode: CardPaymentMode): string {
  if (!card) return '';
  return mode === 'full' ? `Pay off ${card.name}` : `${card.name} payment`;
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
      {/* Four options don't fit one row on a phone, so they take two there. */}
      <div
        className={`mt-1.5 grid gap-1 rounded-xl border border-[#102319]/10 bg-white p-1 ${options.length > 3 ? 'grid-cols-2 sm:grid-cols-4' : ''}`}
        style={options.length > 3 ? undefined : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
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
  cashAccounts = [],
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
  const cashAccountById = new Map(cashAccounts.map(account => [account.id, account]));
  // Planned income and expenses land in the primary account unless the user chooses another.
  const primaryCashAccount = cashAccounts.find(account => account.primary) ?? cashAccounts[0];
  const choosesAccount = cashAccounts.length > 1;
  const accountLabel = (id: string | null | undefined) => {
    const account = id ? cashAccountById.get(id) : undefined;
    return account ? cashAccountName(account) : 'an account no longer connected';
  };
  // A new transfer starts out of the primary account and into savings, if there is one.
  const defaultRoute = () => {
    const fromAccountId = primaryCashAccount?.id ?? '';
    const others = cashAccounts.filter(account => account.id !== fromAccountId);
    const toAccountId = (others.find(account => account.subtype === 'savings') ?? others[0])?.id ?? '';
    return { fromAccountId, toAccountId };
  };

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
      update({
        kind,
        ...(kind === 'transfer' && !form?.fromAccountId && !form?.toAccountId && defaultRoute()),
        ...(form?.labelIsAutomatic && { label: '', labelIsAutomatic: false }),
      });
    }
  };

  const startEdit = (event: CashFlowPlannedEventSummary) => {
    setError('');
    // A disconnected cash account is no longer in the picker; such an event,
    // like one saved without an account, follows the primary account, so save
    // never sends an id the server would reject.
    const connected = (id: string | null | undefined) => (id && cashAccountById.has(id) ? id : '');
    const cashAccountId = event.kind === 'income' || event.kind === 'expense' ? connected(event.accountId) : '';
    setForm({
      id: event.id,
      label: event.label,
      labelIsAutomatic: false,
      kind: event.kind,
      amount: event.amount ? withCommas(String(event.amount)) : '',
      startDate: event.startDate,
      recurrence: event.recurrence,
      endDate: event.endDate ?? '',
      accountId: event.kind === 'card_payment' ? event.accountId ?? '' : '',
      cashAccountId,
      // A side no longer connected is left for the user to choose again.
      fromAccountId: event.kind === 'transfer' ? connected(event.accountId) : '',
      toAccountId: event.kind === 'transfer' ? connected(event.toAccountId) : '',
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
        // With one cash account there is nothing to choose, and an event saved
        // without one follows the primary account if more are connected later.
        ...(isCard
          ? { accountId: form.accountId, paymentMode: form.paymentMode }
          : form.kind === 'transfer'
            ? { accountId: form.fromAccountId, toAccountId: form.toAccountId }
            : choosesAccount && { accountId: form.cashAccountId || null }),
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

  // A transfer needs two cash accounts; one already saved stays editable if an account has since gone.
  const kinds: PlannedEventKind[] = [
    'income',
    'expense',
    ...(choosesAccount || form?.kind === 'transfer' ? ['transfer' as const] : []),
    ...(cards.length > 0 ? ['card_payment' as const] : []),
  ];
  const isCardForm = form?.kind === 'card_payment';
  const isTransferForm = form?.kind === 'transfer';
  const sameAccount = Boolean(isTransferForm && form.fromAccountId && form.fromAccountId === form.toAccountId);
  // A card with no usual pace is projected only under a monthly plan; a
  // one-time payment counts once one exists, and on its own does nothing.
  const formCard = isCardForm ? cardById.get(form.accountId) : undefined;
  const oneTimeAloneIgnored = Boolean(
    form && formCard && formCard.behavior === 'unknown' && formCard.balance !== null && form.recurrence === 'once'
      && !events.some(event => event.kind === 'card_payment' && event.accountId === formCard.accountId
        && event.recurrence === 'monthly' && event.id !== form.id)
  );
  // The forecast already pays this card's statements in full, so paying it in
  // full adds nothing to savings: there is no interest for it to stop. Unless
  // another plan sets a monthly amount, which can leave part of a statement
  // unpaid; paying in full takes precedence over it and stops that interest.
  const alreadyPaidInFull = Boolean(form && formCard && formCard.behavior === 'pays_in_full' && form.paymentMode === 'full'
    && !events.some(event => event.kind === 'card_payment' && event.accountId === formCard.accountId
      && event.id !== form.id && event.recurrence === 'monthly' && event.paymentMode === 'fixed'));

  return (
    <section ref={sectionRef} className="scroll-mt-28 rounded-[1.6rem] border border-[#102319]/10 bg-[#fffdf5] p-5 shadow-sm sm:p-7" aria-labelledby="planned-events-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="planned-events-heading" className="text-lg font-semibold text-[#102319]">Planned events</h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[#5e6b63]">
            Add money you expect that your history can’t show: a bonus, a tuition bill, a planned purchase
            {choosesAccount ? ', a move to savings' : ''}{cards.length > 0 ? ', or paying down a credit card' : ''}. Regular
            paychecks and bills are already in the forecast.
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

          {isTransferForm && (
            <>
              {([['From', 'fromAccountId'], ['To', 'toAccountId']] as const).map(([fieldLabel, field]) => (
                <label key={field} className="text-sm font-semibold text-[#102319]">
                  {fieldLabel}
                  <select className={fieldClass} value={form[field]} onChange={event => update({ [field]: event.target.value })} required>
                    {!form[field] && <option value="" disabled>Choose an account</option>}
                    {cashAccounts.map(account => <option key={account.id} value={account.id}>{cashAccountName(account)}</option>)}
                  </select>
                </label>
              ))}
            </>
          )}

          <label className="text-sm font-semibold text-[#102319] sm:col-span-2">
            Name
            <input
              className={fieldClass}
              value={form.label}
              maxLength={80}
              onChange={event => update({ label: event.target.value, labelIsAutomatic: false })}
              placeholder={isCardForm ? 'e.g. Pay off my card' : isTransferForm ? 'e.g. Move to savings' : 'e.g. Year-end bonus'}
              required
            />
          </label>

          {!isCardForm && !isTransferForm && choosesAccount && (
            <label className="text-sm font-semibold text-[#102319] sm:col-span-2">
              Account
              <select
                className={fieldClass}
                value={form.cashAccountId}
                onChange={event => update({ cashAccountId: event.target.value })}
              >
                {primaryCashAccount && <option value="">Primary account ({cashAccountName(primaryCashAccount)})</option>}
                {cashAccounts.map(account => <option key={account.id} value={account.id}>{cashAccountName(account)}</option>)}
              </select>
            </label>
          )}

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

          {alreadyPaidInFull && (
            <p className="text-xs leading-5 text-[#76510f] sm:col-span-2">
              {form.recurrence === 'once'
                ? 'You already pay this card in full each month, so paying it off now only takes the money out of your cash sooner. It won’t change what you’re expected to save.'
                : 'You already pay this card in full each month, and your forecast already assumes you will, so this plan won’t change what you’re expected to save.'}
            </p>
          )}

          {oneTimeAloneIgnored && (
            <p className="text-xs leading-5 text-[#76510f] sm:col-span-2">
              We haven’t seen what you usually pay this card, so a one-time payment alone won’t project it. Add a monthly
              payment to see its balance and interest.
            </p>
          )}

          {sameAccount && (
            <p className="text-xs leading-5 text-[#76510f] sm:col-span-2">Choose two different accounts.</p>
          )}

          {isTransferForm && (
            <p className="text-xs leading-5 text-[#5e6b63] sm:col-span-2">
              Moves money between your own accounts, so it changes what each one holds, not what you’re expected to
              save. Transfers you already make regularly are in the forecast.
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
              disabled={saving || sameAccount}
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
                    {event.kind === 'transfer' && ` · ${accountLabel(event.accountId)} to ${accountLabel(event.toAccountId)}`}
                    {(event.kind === 'income' || event.kind === 'expense') && choosesAccount && (() => {
                      const account = event.accountId ? cashAccountById.get(event.accountId) : primaryCashAccount;
                      return account ? ` · ${cashAccountName(account)}` : ' · account no longer connected';
                    })()}
                    {event.nextDate && event.recurrence !== 'once' ? ` · next ${formatCalendarDate(event.nextDate)}` : ''}
                    {!event.nextDate ? ' · already passed' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold tabular-nums ${event.kind === 'income' ? 'text-[#28704d]' : event.kind === 'expense' ? 'text-[#9b4137]' : 'text-[#102319]'}`}>
                    {event.kind === 'card_payment'
                      ? (event.paymentMode === 'full' ? 'In full' : formatMoney(event.amount, true))
                      : event.kind === 'transfer'
                        ? formatMoney(event.amount, true)
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
