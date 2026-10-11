"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import TransactionCategoryModal from '../transactions/TransactionCategoryModal';
import type { CashFlowItemTransaction } from '../../types/cash-flow';
import { sendCashFlowRequest } from '../../lib/cash-flow-api';
import { formatCalendarDate, formatMoney } from '../../lib/cash-flow-format';
import { loginUrlForCurrentPage } from '../../lib/post-login-redirect';

/**
 * A transaction's category, which opens the category picker; the page reloads
 * once a new one is saved.
 */
export function CategoryButton({ transaction, flow, onChanged }: {
  transaction: CashFlowItemTransaction;
  /** Which way its amount moves money; for a transfer, `income` is money in. */
  flow: 'income' | 'spending';
  onChanged: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const saved = useRef(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Change category: ${transaction.label} on ${formatCalendarDate(transaction.date)}`}
        className="font-semibold text-[#49725a] underline decoration-dotted underline-offset-2 hover:text-[#102319]"
      >
        {transaction.category ?? 'Add a category'}
      </button>
      {editing && (
        <TransactionCategoryModal
          transaction={{
            id: transaction.id,
            name: transaction.label,
            date: transaction.date,
            // The picker signs money out as negative.
            amount: flow === 'spending' ? -transaction.amount : transaction.amount,
            category: transaction.categoryCodes ?? [],
            isUserCategory: Boolean(transaction.userCategory),
          }}
          onSaved={() => { saved.current = true; }}
          onClose={() => {
            setEditing(false);
            if (saved.current) {
              saved.current = false;
              void onChanged();
            }
          }}
        />
      )}
    </>
  );
}

/** What a transaction offers behind the icon on its line: the icon's accessible name, and what it opens. */
export interface TransactionChoices {
  label: string;
  content: React.ReactNode;
}

/** One transaction: its line, what shows below it, and the choices it opens. */
function TransactionRow({ transaction, flow, withLabels, onChanged, extra, choices }: {
  transaction: CashFlowItemTransaction;
  flow: 'income' | 'spending';
  withLabels: boolean;
  onChanged: () => Promise<void> | void;
  extra: React.ReactNode;
  choices: TransactionChoices | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="text-xs">
      <div className="flex items-start justify-between gap-3">
        {/* Each part wraps whole, so a phone's taller touch target takes a line of its own rather than stretching one. */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-1 break-words text-[#5e6b63]">
          <span>{formatCalendarDate(transaction.date)}</span>
          {withLabels && transaction.label && <span>· <span>{transaction.label}</span></span>}
          <span>· <CategoryButton transaction={transaction} flow={flow} onChanged={onChanged} /></span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-semibold tabular-nums text-[#102319]">{formatMoney(transaction.amount, true)}</span>
          {choices && (
            <button
              type="button"
              aria-expanded={open}
              aria-label={choices.label}
              title={choices.label}
              onClick={() => setOpen(shown => !shown)}
              className={`grid h-5 w-5 place-items-center self-center rounded-full text-[#49725a] hover:bg-[#ecece4] hover:text-[#102319] ${open ? 'bg-[#ecece4] text-[#102319]' : ''}`}
            >
              <MoreHorizontal size={14} aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
      {extra && <div className="mt-1">{extra}</div>}
      {open && choices?.content}
    </li>
  );
}

/**
 * The transactions behind one item: the latest the report carries, and every
 * one on request, fetched by the list's `transactionsRef`. Each transaction's
 * category opens the category picker, and the page reloads once it is saved.
 */
export default function TransactionList({
  transactions,
  count,
  transactionsRef,
  flow,
  apiUrl,
  withLabels,
  onChanged,
  renderExtra,
  renderChoices,
}: {
  /** The latest few, as the report lists them. */
  transactions: readonly CashFlowItemTransaction[];
  /** How many there are in all. */
  count: number;
  /** Names the whole list to the API; an older report has none, and lists only what it carries. */
  transactionsRef?: string;
  /** Which way the amounts move money; for a transfer, `income` is money in. */
  flow: 'income' | 'spending';
  apiUrl: string;
  /** Show each one's payee: a list of one payee's transactions needs none. */
  withLabels: boolean;
  /** Reload the report after a category changes. */
  onChanged: () => Promise<void> | void;
  /** What a transaction shows below its line: markers and actions. */
  renderExtra?: (transaction: CashFlowItemTransaction) => React.ReactNode;
  /** What a transaction offers behind the icon on its line; null for nothing. */
  renderChoices?: (transaction: CashFlowItemTransaction) => TransactionChoices | null;
}) {
  const [every, setEvery] = useState<CashFlowItemTransaction[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  // An open list refetches when the report reloads; keep only the latest response.
  const requestRef = useRef(0);

  const loadEvery = useCallback(async () => {
    if (!transactionsRef) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const response = await sendCashFlowRequest(apiUrl, `/api/cash-flow/transactions?ref=${encodeURIComponent(transactionsRef)}`, 'GET');
      // A newer fetch was started while this one was in flight; let it decide.
      if (requestId !== requestRef.current) return;
      // Signed out: back through sign-in to this page, as the page itself does.
      if (response.status === 401) {
        router.push(loginUrlForCurrentPage());
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'We couldn’t load them. Please try again.');
        return;
      }
      setEvery(Array.isArray(data.transactions) ? data.transactions : []);
      setExpanded(true);
    } catch {
      if (requestId !== requestRef.current) return;
      setError('We couldn’t load them. Please try again.');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [apiUrl, router, transactionsRef]);

  // A reloaded report may have changed the list: an open one is fetched again,
  // so a change made from it does not fold it away.
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  useEffect(() => {
    if (expandedRef.current) void loadEvery();
    else setEvery(null);
  }, [transactions, loadEvery]);

  if (transactions.length === 0) return null;
  const shown = expanded && every ? every : transactions;
  // The rest can be asked for by the list's ref; an older report has none, and says only how many there are.
  const more = count > transactions.length;
  const askable = more && Boolean(transactionsRef);

  return (
    <div className="mt-1.5">
      <ul className="space-y-1.5 border-l-2 border-[#102319]/10 pl-3">
        {shown.map(transaction => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            flow={flow}
            withLabels={withLabels}
            onChanged={onChanged}
            extra={renderExtra?.(transaction)}
            choices={renderChoices?.(transaction) ?? null}
          />
        ))}
      </ul>
      {(more || error) && (
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 pl-3 text-xs">
          {!(expanded && every) && <span className="text-[#66736b]">Showing the latest {transactions.length} of {count}.</span>}
          {askable && (expanded && every
            ? (
              <button type="button" onClick={() => setExpanded(false)} className="font-bold text-[#102319] underline">
                Show the latest {transactions.length}
              </button>
            )
            : (
              <button
                type="button"
                onClick={() => (every ? setExpanded(true) : void loadEvery())}
                disabled={loading}
                className="font-bold text-[#102319] underline disabled:opacity-60"
              >
                {loading ? 'Loading…' : `Show all ${count}`}
              </button>
            ))}
          {error && <span role="alert" className="text-[#8b3027]">{error}</span>}
        </div>
      )}
    </div>
  );
}
