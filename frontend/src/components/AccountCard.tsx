"use client";

/**
 * One account row, whichever provider it came from.
 *
 * The accounts page used to draw these twice: once for Plaid accounts and once
 * for SnapTrade accounts, in two sections with two nearly-identical blocks of
 * JSX that had already drifted apart (different font sizes, a different
 * "no balance" story, health markers in different columns). Now that the page
 * lists every account together, they have to be the same card -- otherwise the
 * single list reads as two lists that happen to be adjacent.
 *
 * Health is deliberately not computed here. It belongs to the provider that
 * reported the account: a Plaid Item's health says nothing about a SnapTrade
 * authorization at the same firm, and conflating them is how a healthy Fidelity
 * connection ends up painted broken because the *other* Fidelity connection is
 * disabled. Callers work it out and pass the answer in.
 */

import React from 'react';

export interface AccountCardProps {
  /** The account's own name, as the provider reports it. */
  name: string;
  /** A short pill beside the name, e.g. "Closed". */
  badge?: string | null;
  badgeTitle?: string;
  /**
   * Connection health for this one account. `null` renders no marker at all,
   * which is not the same as healthy: it means nothing authoritative is known,
   * and a green tick would be a claim we cannot make.
   */
  health?: { ok: boolean; title: string } | null;
  /** The metadata line under the name: institution, type, subtype. */
  detail: React.ReactNode;
  /** A line under the detail, e.g. what being closed means for the totals. */
  note?: React.ReactNode;
  /** What is wrong with this account's connection, in the user's terms. */
  issue?: string | null;
  /** `null`/`undefined` means the provider reported no figure — not zero. */
  balance?: number | null;
  /** Shown in place of a figure when there is none. */
  balanceFallback?: string;
  balanceFallbackTitle?: string;
  /** A caveat under the figure, e.g. that it is summed from positions. */
  balanceNote?: string | null;
  balanceNoteTitle?: string;
  /** Fades the card for accounts that no longer count toward the totals. */
  dimmed?: boolean;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

export default function AccountCard({
  name,
  badge,
  badgeTitle,
  health,
  detail,
  note,
  issue,
  balance,
  balanceFallback,
  balanceFallbackTitle,
  balanceNote,
  balanceNoteTitle,
  dimmed = false,
}: AccountCardProps) {
  const hasBalance = typeof balance === 'number';

  return (
    <div
      className={`rounded-lg border border-gray-600 bg-gray-700 p-4${dimmed ? ' opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="min-w-0 break-words font-medium text-white">{name}</div>
            {badge && (
              <span
                className="rounded-full border border-yellow-700 bg-yellow-900/20 px-2 py-0.5 text-xs font-medium text-yellow-300"
                title={badgeTitle}
              >
                {badge}
              </span>
            )}
          </div>
          <div className="mt-1 flex min-w-0 items-start gap-2 text-sm text-gray-400">
            {/* A fixed-width column for the marker, so the metadata below every
                card starts at the same x position whether or not that account
                has known health. */}
            {health ? (
              health.ok ? (
                <span className="w-4 shrink-0 text-center text-green-400" title={health.title}>
                  ✓
                </span>
              ) : (
                <span className="w-4 shrink-0 text-center text-red-400" title={health.title}>
                  ✗
                </span>
              )
            ) : (
              <span className="w-4 shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0 break-words">{detail}</div>
          </div>
          {note && <div className="mt-1 text-xs text-yellow-300">{note}</div>}
          {issue && <div className="mt-1 text-xs text-red-400">{issue}</div>}
        </div>
        {hasBalance ? (
          <div className="shrink-0 text-right">
            <div className="font-semibold text-white">{formatCurrency(balance as number)}</div>
            {balanceNote && (
              <div className="text-xs text-gray-400" title={balanceNoteTitle}>
                {balanceNote}
              </div>
            )}
          </div>
        ) : balanceFallback ? (
          /* Distinguish "we have no figure" from "$0". A blank cell reads as a
             rendering bug, which is how it was reported. */
          <div className="shrink-0 text-right text-sm text-gray-400" title={balanceFallbackTitle}>
            {balanceFallback}
          </div>
        ) : null}
      </div>
    </div>
  );
}
