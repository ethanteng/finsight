"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarChart3, ChevronRight, Landmark, LogOut, Menu, MessageSquareText, Newspaper, Plus, Settings, WalletCards, X } from 'lucide-react';
import FinanceQA from '../../components/FinanceQA';
import FinancialOverview from '../../components/FinancialOverview';
import MarketNewsModal from '../../components/MarketNewsModal';
import { resetPlaidLinkInitialization } from '../../components/PlaidLinkButton';
import { identifyUser, resetUserIdentity } from '../../lib/heycatch';

interface PromptHistory { id: string; question: string; answer: string; timestamp: number }
interface SubscriptionStatus { status: string; tier: string; message: string; isActive: boolean; accessLevel: 'full' | 'none'; upgradeRequired: boolean; expiresAt?: string }

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function AppPageClient() {
  const [promptHistory, setPromptHistory] = useState<PromptHistory[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [showMarketNewsModal, setShowMarketNewsModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const router = useRouter();

  const expireSession = useCallback(() => {
    localStorage.removeItem('auth_token');
    resetUserIdentity();
    router.push('/login?message=' + encodeURIComponent('Your session has expired. Please log in again.'));
  }, [router]);

  const checkSubscriptionStatus = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/stripe/subscription-status`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) return expireSession();
      if (res.ok) {
        const data = await res.json();
        if (data.accessLevel !== 'full') {
          localStorage.removeItem('auth_token');
          router.push(`/login?message=${encodeURIComponent(data.message)}`);
          return;
        }
        setSubscriptionStatus({ ...data, message: data.message || '', isActive: data.status === 'active', accessLevel: data.accessLevel || 'none', upgradeRequired: data.upgradeRequired || false });
      } else if (res.status === 403) {
        const data = await res.json();
        localStorage.removeItem('auth_token');
        router.push(`/login?message=${encodeURIComponent(data.message)}`);
      }
    } catch (error) {
      console.error('Failed to check subscription status:', error);
    }
  }, [expireSession, router]);

  const loadConversationHistory = useCallback(async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    setHistoryError(false);
    try {
      const res = await fetch(`${API_URL}/conversations`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) return expireSession();
      if (!res.ok) throw new Error(`History request failed (${res.status})`);
      const data = await res.json();
      const history: PromptHistory[] = data.conversations.map((conversation: PromptHistory) => ({
        id: conversation.id, question: conversation.question, answer: conversation.answer, timestamp: conversation.timestamp,
      }));
      setPromptHistory(history);
      setSelectedPrompt(history[0] || null);
    } catch (error) {
      console.error('Failed to load conversation history:', error);
      setHistoryError(true);
    }
  }, [expireSession]);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (!token) return router.push('/login');
      try {
        const res = await fetch(`${API_URL}/auth/verify`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return expireSession();
        const data = await res.json();
        setIsAuthenticated(true);
        setUserEmail(data.user.email);
        identifyUser(data.user);
        await checkSubscriptionStatus(token);
      } catch (error) {
        console.error('Auth check failed:', error);
        expireSession();
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, [checkSubscriptionStatus, expireSession, router]);

  useEffect(() => { if (isAuthenticated) loadConversationHistory(); }, [isAuthenticated, loadConversationHistory]);

  const handleLogout = () => {
    resetPlaidLinkInitialization();
    localStorage.removeItem('auth_token');
    resetUserIdentity();
    router.push('/login');
  };
  const hasMarketNewsAccess = subscriptionStatus?.tier === 'standard' || subscriptionStatus?.tier === 'premium';
  const relativeDate = (timestamp: number) => {
    const hours = (Date.now() - new Date(timestamp).getTime()) / 3_600_000;
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${Math.floor(hours)}h ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  if (isLoading) return (
    <main className="min-h-screen bg-[#f5f1e8] grid place-items-center text-[#123c2f]" aria-busy="true">
      <div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#123c2f]/20 border-t-[#123c2f]" /><p className="font-medium">Preparing your workspace…</p></div>
    </main>
  );
  if (!isAuthenticated) return null;

  return (
    <div className="app-workspace min-h-screen bg-[#f5f1e8] text-[#17372e]">
      <header className="sticky top-0 z-40 flex h-16 items-center border-b border-[#17372e]/10 bg-[#f5f1e8]/95 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setMobileNavOpen(!mobileNavOpen)} className="rounded-full p-2 hover:bg-[#17372e]/5" aria-label="Toggle navigation">{mobileNavOpen ? <X /> : <Menu />}</button>
        <span className="ml-3 text-xl font-semibold tracking-tight">Ask Linc</span>
        <button onClick={() => setSelectedPrompt(null)} className="ml-auto rounded-full bg-[#c9f46b] p-2 text-[#123c2f]" aria-label="Start a new decision"><Plus /></button>
      </header>

      <aside className={`${mobileNavOpen ? 'flex' : 'hidden'} fixed inset-y-16 left-0 z-30 w-full flex-col bg-[#123c2f] text-[#f8f4e9] lg:inset-y-0 lg:flex lg:w-72`}>
        <div className="hidden h-20 items-center border-b border-white/10 px-6 lg:flex"><span className="text-2xl font-semibold tracking-tight">Ask Linc</span><span className="ml-2 rounded-full bg-[#c9f46b] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#123c2f]">{subscriptionStatus?.tier || 'member'}</span></div>
        <nav className="space-y-1 px-4 py-5" aria-label="Primary navigation">
          <button onClick={() => { setSelectedPrompt(null); setMobileNavOpen(false); }} className="flex w-full items-center gap-3 rounded-xl bg-[#c9f46b] px-4 py-3 font-semibold text-[#123c2f]"><Plus size={18} />New decision</button>
          <Link href="/app" className="mt-4 flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 font-medium"><MessageSquareText size={18} />Decisions</Link>
          <Link href="/finances" className="flex items-center gap-3 rounded-xl px-4 py-3 text-white/70 hover:bg-white/10 hover:text-white"><WalletCards size={18} />Finances</Link>
          <Link href="/transactions" className="flex items-center gap-3 rounded-xl px-4 py-3 text-white/70 hover:bg-white/10 hover:text-white"><BarChart3 size={18} />Transactions</Link>
          <Link href="/profile" className="flex items-center gap-3 rounded-xl px-4 py-3 text-white/70 hover:bg-white/10 hover:text-white"><Settings size={18} />Accounts & profile</Link>
          {hasMarketNewsAccess && <button onClick={() => setShowMarketNewsModal(true)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-white/70 hover:bg-white/10 hover:text-white"><Newspaper size={18} />Market context</button>}
        </nav>
        <section className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 px-4 py-5" aria-labelledby="recent-decisions">
          <div className="mb-3 flex items-center justify-between px-2"><h2 id="recent-decisions" className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">Recent decisions</h2><span className="text-xs text-white/40">{promptHistory.length}</span></div>
          {historyError ? <button onClick={loadConversationHistory} className="rounded-xl border border-white/15 p-3 text-left text-sm text-white/70">History couldn’t load. <span className="text-[#c9f46b]">Try again</span></button> : promptHistory.length === 0 ? <p className="px-2 text-sm leading-6 text-white/50">Your completed questions will appear here.</p> : (
            <div className="space-y-1">{promptHistory.map(prompt => <button key={prompt.id} onClick={() => { setSelectedPrompt(prompt); setMobileNavOpen(false); }} className={`w-full rounded-xl px-3 py-3 text-left transition ${selectedPrompt?.id === prompt.id ? 'bg-white/12' : 'hover:bg-white/7'}`}><span className="line-clamp-2 text-sm font-medium leading-5">{prompt.question}</span><span className="mt-1 block text-xs text-white/40">{relativeDate(prompt.timestamp)}</span></button>)}</div>
          )}
        </section>
        <div className="border-t border-white/10 p-4"><div className="mb-3 truncate text-xs text-white/50">{userEmail}</div><button onClick={handleLogout} className="flex items-center gap-2 text-sm text-white/65 hover:text-white"><LogOut size={16} />Sign out</button></div>
      </aside>

      <main className="lg:ml-72">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#3d6558]">Decision workspace</p><h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.035em] text-[#123c2f] sm:text-4xl">Make the next financial decision with context.</h1></div>
            <Link href="/finances" className="inline-flex items-center gap-2 text-sm font-semibold text-[#123c2f] hover:underline">Review connected data <ChevronRight size={16} /></Link>
          </div>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <FinanceQA onNewAnswer={loadConversationHistory} selectedPrompt={selectedPrompt} onNewQuestion={() => setSelectedPrompt(null)} />
            <aside className="space-y-5 xl:sticky xl:top-8" aria-label="Financial context">
              <FinancialOverview tier={subscriptionStatus?.tier} />
              <div className="rounded-2xl border border-[#17372e]/10 bg-white/60 p-5"><div className="mb-2 flex items-center gap-2 text-[#123c2f]"><Landmark size={18} /><h2 className="font-semibold">Data confidence</h2></div><p className="text-sm leading-6 text-[#48675e]">Answers use your connected financial data and available market context. Review accounts when balances are missing or stale.</p><button onClick={() => router.push('/profile')} className="mt-4 text-sm font-semibold text-[#175cce] hover:underline">Inspect connected accounts</button></div>
            </aside>
          </div>
        </div>
      </main>
      {hasMarketNewsAccess && subscriptionStatus?.tier && <MarketNewsModal isOpen={showMarketNewsModal} onClose={() => setShowMarketNewsModal(false)} tier={subscriptionStatus.tier} />}
    </div>
  );
}
