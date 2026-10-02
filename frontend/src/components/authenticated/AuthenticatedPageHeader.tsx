"use client";

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChartNoAxesCombined, MessageSquareText, Settings, WalletCards } from 'lucide-react';
import BetaBadge from './BetaBadge';
import UpgradeAccountButton, {
  parseUpgradeAction,
  useUpgradeEligibility,
  type UpgradeAction,
} from './UpgradeAccountButton';

type ActivePage = 'app' | 'finances' | 'cash-flow' | 'profile' | 'admin';

interface AuthenticatedPageHeaderProps {
  activePage: ActivePage;
  eyebrow: string;
  title: string;
  /** Shown beside the title, e.g. a Beta label. */
  badge?: ReactNode;
  email?: string;
  /**
   * What to offer this account, for a page that has already loaded its billing
   * state; null for nothing. Left undefined, the header asks for it itself;
   * passing it spares the page a second identical request.
   */
  upgradeAction?: UpgradeAction | null;
  homeHref?: string;
  onLogout?: () => void;
}

// Four links share the phone-width row, so the longest gets a shorter name there.
const links = [
  { href: '/app', label: 'Decisions', page: 'app' as const, icon: MessageSquareText },
  { href: '/finances', label: 'Finances', page: 'finances' as const, icon: WalletCards },
  { href: '/cash-flow', label: 'Cash flow', page: 'cash-flow' as const, icon: ChartNoAxesCombined, beta: true },
  { href: '/profile', label: 'Accounts & context', mobileLabel: 'Accounts', page: 'profile' as const, icon: Settings },
];

export default function AuthenticatedPageHeader({
  activePage,
  eyebrow,
  title,
  badge,
  email,
  upgradeAction,
  homeHref = '/app',
  onLogout,
}: AuthenticatedPageHeaderProps) {
  const showNavLinks = activePage !== 'admin';
  // Admin pages are operator tooling; an upgrade CTA there is noise, and asking
  // for the account's billing state to decide that would be a wasted request.
  // A caller that already knows spares one too.
  const fetchedAction = useUpgradeEligibility(activePage !== 'admin' && upgradeAction === undefined);
  // A page-supplied value is still wire JSON underneath — narrow it the same
  // way the fetch path does, so an unknown action never becomes a link.
  const action = upgradeAction === undefined ? fetchedAction : parseUpgradeAction(upgradeAction);

  return (
    <header className="authenticated-header sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex min-h-[86px] max-w-[1200px] items-center gap-6 px-5 sm:px-6">
        <Link className="authenticated-brand shrink-0" href={homeHref} aria-label="Ask Linc workspace">
          <span className="authenticated-brand-mark" aria-hidden="true">L</span>
          <span>Ask Linc</span>
        </Link>

        {showNavLinks && (
          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex" aria-label="Workspace navigation">
            {links.map(({ href, label, page, icon: Icon, beta }) => (
              <Link
                key={href}
                href={href}
                aria-current={activePage === page ? 'page' : undefined}
                className={`authenticated-nav-link ${activePage === page ? 'is-active' : ''}`}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
                {beta && <BetaBadge tone={activePage === page ? 'dark' : 'light'} />}
              </Link>
            ))}
          </nav>
        )}

        <div className="ml-auto flex min-w-0 items-center gap-4">
          {action && <UpgradeAccountButton action={action} />}
          {email && <span className="hidden max-w-52 truncate text-xs text-[#66736b] xl:block">{email}</span>}
          {onLogout && (
            <button className="authenticated-sign-out" onClick={onLogout} type="button">
              Sign out
            </button>
          )}
        </div>
      </div>

      {showNavLinks && (
        <div className="border-t border-[#102319]/10 lg:hidden">
          <nav className="authenticated-mobile-nav mx-auto grid max-w-[1200px] grid-cols-[repeat(4,minmax(0,1fr))] gap-1 px-3 py-2 sm:px-4" aria-label="Workspace navigation">
            {links.map(({ href, label, mobileLabel, page }) => (
              <Link
                key={href}
                href={href}
                aria-current={activePage === page ? 'page' : undefined}
                className={`authenticated-nav-link ${activePage === page ? 'is-active' : ''}`}
              >
                {mobileLabel ?? label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <div className="mx-auto flex max-w-[1200px] items-end justify-between gap-4 px-5 py-5 sm:px-6">
        <div>
          <p className="authenticated-eyebrow">{eyebrow}</p>
          <div className="flex items-center gap-3">
            <h1 className="authenticated-page-title">{title}</h1>
            {badge && <span className="mt-1.5">{badge}</span>}
          </div>
        </div>
      </div>
    </header>
  );
}
