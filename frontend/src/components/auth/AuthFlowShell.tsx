import Link from 'next/link';
import { Check, ShieldCheck } from 'lucide-react';
import SiteFooter from '../SiteFooter';

interface AuthFlowShellProps {
  eyebrow: string;
  title: string;
  description: string;
  asideTitle: string;
  asideDescription: string;
  benefits: string[];
  children: React.ReactNode;
}

export default function AuthFlowShell({
  eyebrow,
  title,
  description,
  asideTitle,
  asideDescription,
  benefits,
  children,
}: AuthFlowShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f1e8] text-[#123c2f]">
      <header className="border-b border-[#123c2f]/10 bg-[#f5f1e8]">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight" aria-label="Ask Linc home">
            <span className="grid h-9 w-9 place-items-center rounded-[10px_10px_10px_3px] bg-[#102319] text-lg font-bold text-[#d9ff6f]">L</span>
            <span className="text-xl">Ask Linc</span>
          </Link>
          <Link href="/login" className="text-sm font-semibold text-[#34594e] transition hover:text-[#123c2f]">
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,.95fr)]">
          <section className="relative hidden overflow-hidden bg-[#123c2f] px-12 py-16 text-[#f8f4e9] lg:flex lg:flex-col lg:justify-between">
            <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full border border-[#cfff68]/20" />
            <div className="absolute -right-10 top-10 h-80 w-80 rounded-full border border-[#cfff68]/10" />
            <div className="relative max-w-xl">
              <p className="mb-6 text-xs font-bold uppercase tracking-[0.2em] text-[#cfff68]">Secure account access</p>
              <h2 className="text-5xl font-semibold leading-[1.04] tracking-[-0.045em]">{asideTitle}</h2>
              <p className="mt-6 max-w-lg text-lg leading-8 text-white/65">{asideDescription}</p>
            </div>
            <ul className="relative space-y-5 text-sm text-white/80">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-center gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#cfff68]/15 text-[#cfff68]">
                    <Check size={15} />
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>
          </section>

          <section className="flex items-center justify-center px-5 py-12 sm:px-10 lg:px-16" aria-labelledby="auth-flow-heading">
            <div className="w-full max-w-md">
              <div className="mb-9">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[#477064]">{eyebrow}</p>
                <h1 id="auth-flow-heading" className="text-4xl font-semibold tracking-[-0.04em] text-[#123c2f]">{title}</h1>
                <p className="mt-3 text-base leading-7 text-[#607b72]">{description}</p>
              </div>
              {children}
              <div className="mt-8 flex items-center justify-center gap-2 text-xs text-[#71857f]">
                <ShieldCheck size={16} />
                Encrypted access. Your financial data stays protected.
              </div>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter variant="auth" />
    </div>
  );
}
