import Link from 'next/link';
import { BarChart3, MessageSquareText, Settings, WalletCards } from 'lucide-react';

type ActivePage = 'app' | 'finances' | 'transactions' | 'profile' | 'admin';

interface AuthenticatedPageHeaderProps {
  activePage: ActivePage;
  eyebrow: string;
  title: string;
  email?: string;
  homeHref?: string;
  onLogout?: () => void;
}

const links = [
  { href: '/app', label: 'Decisions', page: 'app' as const, icon: MessageSquareText },
  { href: '/finances', label: 'Finances', page: 'finances' as const, icon: WalletCards },
  { href: '/transactions', label: 'Transactions', page: 'transactions' as const, icon: BarChart3 },
  { href: '/profile', label: 'Accounts & profile', page: 'profile' as const, icon: Settings },
];

export default function AuthenticatedPageHeader({
  activePage,
  eyebrow,
  title,
  email,
  homeHref = '/app',
  onLogout,
}: AuthenticatedPageHeaderProps) {
  return (
    <header className="authenticated-header sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex min-h-[86px] max-w-[1200px] items-center gap-6 px-5 sm:px-6">
        <Link className="authenticated-brand shrink-0" href={homeHref} aria-label="Ask Linc workspace">
          <span className="authenticated-brand-mark" aria-hidden="true">L</span>
          <span>Ask Linc</span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex" aria-label="Workspace navigation">
          {links.map(({ href, label, page, icon: Icon }) => (
            <Link
              key={href}
              href={homeHref === '/demo' && page === 'app' ? '/demo' : href}
              aria-current={activePage === page ? 'page' : undefined}
              className={`authenticated-nav-link ${activePage === page ? 'is-active' : ''}`}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-4">
          {email && <span className="hidden max-w-52 truncate text-xs text-[#66736b] xl:block">{email}</span>}
          {onLogout && (
            <button className="authenticated-sign-out" onClick={onLogout} type="button">
              Sign out
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-[#102319]/10 lg:hidden">
        <nav className="mx-auto grid max-w-[1200px] grid-cols-2 gap-1 px-4 py-2" aria-label="Workspace navigation">
          {links.map(({ href, label, page, icon: Icon }) => (
            <Link
              key={href}
              href={homeHref === '/demo' && page === 'app' ? '/demo' : href}
              aria-current={activePage === page ? 'page' : undefined}
              className={`authenticated-nav-link ${activePage === page ? 'is-active' : ''}`}
            >
              <Icon size={15} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mx-auto flex max-w-[1200px] items-end justify-between gap-4 px-5 py-5 sm:px-6">
        <div>
          <p className="authenticated-eyebrow">{eyebrow}</p>
          <h1 className="authenticated-page-title">{title}</h1>
        </div>
      </div>
    </header>
  );
}
