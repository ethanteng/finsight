"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import type { FinancesOverview } from '../types/finances-overview';

interface ReconnectNoticeProps {
  connectionHealth: FinancesOverview['connectionHealth'];
  /**
   * `chip` is a single inline line for dense cards; `banner` is a full-width row
   * matching the warning style already used on the Finances page.
   */
  variant?: 'chip' | 'banner';
  className?: string;
}

/** "Chase" / "Chase and Amex" / "Chase and 2 others" — never an unbounded list. */
function describeInstitutions(names: string[], total: number): string {
  if (names.length === 0) {
    // "connection", not "account": the count is of Plaid Items, and one broken
    // Item can cover several accounts. The profile page uses the same word.
    return total === 1 ? 'A connection needs' : `${total} connections need`;
  }
  if (names.length === 1 && total === 1) return `${names[0]} needs`;
  if (names.length === 2 && total === 2) return `${names[0]} and ${names[1]} need`;
  const remaining = total - 1;
  return `${names[0]} and ${remaining} other${remaining === 1 ? '' : 's'} need`;
}

/**
 * Unobtrusive prompt that some connection has to be re-authenticated, shown
 * wherever the user looks at their money rather than only on the accounts
 * screen. Without it a broken connection is invisible until someone happens to
 * navigate to Accounts & context, and its balances quietly go stale meanwhile.
 *
 * Renders nothing when there is nothing to fix, so callers can mount it
 * unconditionally.
 */
export default function ReconnectNotice({
  connectionHealth,
  variant = 'banner',
  className = '',
}: ReconnectNoticeProps) {
  const router = useRouter();
  const count = connectionHealth?.reauthRequiredCount ?? 0;
  if (count <= 0) return null;

  const subject = describeInstitutions(connectionHealth?.reauthRequiredInstitutions ?? [], count);
  const label = `${subject} to be reconnected`;

  // Both surfaces embed this inside a card that is itself a click target, so the
  // click must not bubble up and navigate somewhere else.
  const go = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.stopPropagation();
    event.preventDefault();
    router.push('/profile');
  };

  // Keyboard needs its own guard, and for a different reason than the click.
  // The dashboard card's own onKeyDown calls preventDefault() on Enter/Space,
  // which suppresses this button's native activation -- so the click that `go`
  // is attached to never fires, and the card navigates to /finances instead.
  // Stopping the key event here lets the button activate normally. Space
  // activates on keyup, so both phases have to be held back.
  const containKeys = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
  };

  const shared = 'text-left text-[#76510f] transition hover:bg-[#ffeab4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a72c] focus-visible:ring-offset-1';

  if (variant === 'chip') {
    return (
      <button
        type="button"
        onClick={go}
        onKeyDown={containKeys}
        onKeyUp={containKeys}
        title="Reconnect in Accounts & context"
        className={`inline-flex items-center gap-1.5 rounded-full bg-[#fff3ce] px-2 py-0.5 text-[11px] font-semibold ${shared} ${className}`}
      >
        <AlertCircle size={12} aria-hidden="true" />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={go}
      onKeyDown={containKeys}
      onKeyUp={containKeys}
      className={`flex w-full items-center gap-2 rounded-xl border border-[#d4a72c]/30 bg-[#fff3ce] px-4 py-3 text-sm font-medium ${shared} ${className}`}
    >
      <AlertCircle size={16} aria-hidden="true" className="shrink-0" />
      <span>{label}.</span>
      <span className="ml-auto shrink-0 whitespace-nowrap underline underline-offset-2">
        Accounts &amp; context
      </span>
    </button>
  );
}
