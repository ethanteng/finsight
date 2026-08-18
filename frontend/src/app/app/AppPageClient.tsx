"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Landmark, LogOut, Menu, MessageSquareText, Newspaper, Plus, Settings, WalletCards, X } from 'lucide-react';
import FinanceQA from '../../components/FinanceQA';
import FinancialOverview from '../../components/FinancialOverview';
import MarketNewsModal from '../../components/MarketNewsModal';
import { resetPlaidLinkInitialization } from '../../components/PlaidLinkButton';
import { identifyUser, resetUserIdentity } from '../../lib/heycatch';
import { syncStoredUserTimeZoneFromAuthUser } from '../../lib/browser-time-zone';
import { groupTurnsIntoDecisions } from '../../lib/decision-threads';
import { relativeTurnTime } from '../../lib/relative-time';
import type { StructuredPromptHistory } from '../../lib/structured-answer';

type PromptHistory = StructuredPromptHistory;
interface SubscriptionStatus { status: string; tier: string; message: string; isActive: boolean; accessLevel: 'full' | 'none'; upgradeRequired: boolean; expiresAt?: string }

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function AppPageClient() {
  const [promptHistory, setPromptHistory] = useState<PromptHistory[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptHistory | null>(null);
  // Clicking "New decision" when nothing is selected leaves selectedPrompt at
  // null, so the composer would never hear about it. This counter always changes.
  const [newDecisionNonce, setNewDecisionNonce] = useState(0);

  /**
   * The thread a follow-up would continue.
   *
   * Opening a turn adopts its thread, so the selected turn names the active one.
   * After "New decision" nothing is selected and nothing is active, which is the
   * honest state: the next question starts its own thread.
   */
  const activeThreadId = selectedPrompt?.threadId ?? selectedPrompt?.id ?? null;

  /** Turns grouped into the decisions they belong to, newest decision first. */
  const decisionThreads = useMemo(() => groupTurnsIntoDecisions(promptHistory), [promptHistory]);
  // Read inside the history reload without making it a dependency: rebuilding
  // that callback on every "New decision" would retrigger the load itself.
  const newDecisionNonceRef = useRef(newDecisionNonce);
  useEffect(() => { newDecisionNonceRef.current = newDecisionNonce; }, [newDecisionNonce]);
  const selectedPromptRef = useRef(selectedPrompt);
  useEffect(() => { selectedPromptRef.current = selectedPrompt; }, [selectedPrompt]);
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
        setSubscriptionStatus({ ...data, message: data.message || '', isActive: ['active', 'trialing'].includes(data.status), accessLevel: data.accessLevel || 'none', upgradeRequired: data.upgradeRequired || false });
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
    // A reload started before the user asked for a fresh start must not land on
    // top of it. Answering kicks off this fetch, and clicking "New decision"
    // while it is in flight would otherwise re-select the turn that was just
    // answered — resurrecting the thread and refilling the composer.
    const nonceWhenStarted = newDecisionNonceRef.current;
    const selectedWhenStarted = selectedPromptRef.current;
    const selectedIdWhenStarted = selectedWhenStarted?.id ?? null;
    const selectedThreadWhenStarted =
      selectedWhenStarted?.threadId ?? selectedWhenStarted?.id ?? null;
    try {
      const res = await fetch(`${API_URL}/conversations`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) return expireSession();
      if (!res.ok) throw new Error(`History request failed (${res.status})`);
      const data = await res.json();
      const history: PromptHistory[] = data.conversations.map((conversation: PromptHistory) => ({
        id: conversation.id,
        question: conversation.question,
        answer: conversation.answer,
        structuredResponse: conversation.structuredResponse ?? null,
        threadId: conversation.threadId ?? null,
        timestamp: conversation.timestamp,
      }));
      setPromptHistory(history);
      // Only the user starting a new decision mid-flight blocks the selection.
      // Refusing to select whenever nothing is selected would be simpler and
      // wrong: a first question in a fresh decision leaves selectedPrompt null,
      // so the sidebar would show no active thread even though the composer is
      // holding one — the feature failing in the case it exists for.
      if (newDecisionNonceRef.current !== nonceWhenStarted) return;

      const currentSelection = selectedPromptRef.current;
      const selectionChanged = (currentSelection?.id ?? null) !== selectedIdWhenStarted;
      const currentThread =
        currentSelection?.threadId ?? currentSelection?.id ?? null;
      const stayedInSameThread =
        selectedThreadWhenStarted !== null &&
        currentThread === selectedThreadWhenStarted;

      // Adopt the newest turn when the user is still in the thread that was
      // answered, including browsing older turns in it mid-reload. If they opened
      // a different decision while this fetch was in flight, leave that choice.
      if (!selectionChanged || stayedInSameThread) {
        setSelectedPrompt(history[0] || null);
      }
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
        syncStoredUserTimeZoneFromAuthUser(data.user);
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

  if (isLoading) return (
    <main className="min-h-screen bg-[#f3f2e9] grid place-items-center text-[#102319]" aria-busy="true">
      <div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#102319]/20 border-t-[#102319]" /><p className="font-medium">Preparing your workspace…</p></div>
    </main>
  );
  if (!isAuthenticated) return null;

  return (
    <div className="app-workspace min-h-screen bg-[#f3f2e9] text-[#102319]">
      <header className="sticky top-0 z-40 flex h-16 items-center border-b border-[#102319]/10 bg-[#f3f2e9]/95 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setMobileNavOpen(!mobileNavOpen)} className="rounded-full p-2 hover:bg-[#102319]/5" aria-label="Toggle navigation">{mobileNavOpen ? <X /> : <Menu />}</button>
        <span className="ml-3 flex items-center gap-2 text-lg font-extrabold tracking-[-.04em]"><span className="grid h-8 w-8 place-items-center rounded-[9px_9px_9px_2px] bg-[#102319] text-sm font-extrabold text-[#d9ff6f]">L</span>Ask Linc</span>
        <button onClick={() => { setSelectedPrompt(null); setNewDecisionNonce(nonce => nonce + 1); }} className="ml-auto rounded-full bg-[#d9ff6f] p-2 text-[#102319]" aria-label="Start a new decision"><Plus /></button>
      </header>

      <aside className={`${mobileNavOpen ? 'flex' : 'hidden'} fixed inset-y-16 left-0 z-30 w-full flex-col bg-[#102319] text-[#f8f4e9] lg:inset-y-0 lg:flex lg:w-72`}>
        <div className="hidden h-20 items-center border-b border-white/10 px-6 lg:flex"><span className="grid h-8 w-8 place-items-center rounded-[9px_9px_9px_2px] bg-[#d9ff6f] text-sm font-extrabold text-[#102319]">L</span><span className="ml-2 text-xl font-extrabold tracking-[-.04em]">Ask Linc</span><span className="ml-2 rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/65">{subscriptionStatus?.tier || 'member'}</span></div>
        <nav className="space-y-1 px-4 py-5" aria-label="Primary navigation">
          <button onClick={() => { setSelectedPrompt(null); setNewDecisionNonce(nonce => nonce + 1); setMobileNavOpen(false); }} className="flex w-full items-center gap-3 rounded-xl bg-[#d9ff6f] px-4 py-3 font-semibold text-[#102319]"><Plus size={18} />New decision</button>
          <Link href="/app" className="mt-4 flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 font-medium"><MessageSquareText size={18} />Decisions</Link>
          <Link href="/finances" className="flex items-center gap-3 rounded-xl px-4 py-3 text-white/70 hover:bg-white/10 hover:text-white"><WalletCards size={18} />Finances</Link>
          <Link href="/profile" className="flex items-center gap-3 rounded-xl px-4 py-3 text-white/70 hover:bg-white/10 hover:text-white"><Settings size={18} />Accounts & context</Link>
          {hasMarketNewsAccess && <button onClick={() => setShowMarketNewsModal(true)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-white/70 hover:bg-white/10 hover:text-white"><Newspaper size={18} />Market context</button>}
        </nav>
        <section className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 px-4 py-5" aria-labelledby="recent-decisions">
          <div className="mb-3 flex items-center justify-between px-2"><h2 id="recent-decisions" className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">Recent decisions</h2><span className="text-xs text-white/40">{decisionThreads.length}</span></div>
          {historyError ? <button onClick={loadConversationHistory} className="rounded-xl border border-white/15 p-3 text-left text-sm text-white/70">History couldn’t load. <span className="text-[#d9ff6f]">Try again</span></button> : decisionThreads.length === 0 ? <p className="px-2 text-sm leading-6 text-white/50">Your completed questions will appear here.</p> : (
            <div className="space-y-2">
              {decisionThreads.map(thread => {
                const isActive = thread.threadId === activeThreadId;
                const isMultiTurn = thread.turns.length > 1;
                // Turns list newest first, so the decision's opening question —
                // the one that names it, and the only label that stays put as
                // follow-ups accumulate — is the last of them.
                const openingQuestion = thread.turns[thread.turns.length - 1].question;
                return (
                  <div
                    key={thread.threadId}
                    role="group"
                    aria-label={`Decision: ${openingQuestion}`}
                    className={`rounded-xl transition ${isActive ? 'bg-white/[0.06] ring-1 ring-[#d9ff6f]/35' : ''}`}
                  >
                    {/* A single turn needs no header — it would be chrome around one row. */}
                    {isMultiTurn && (
                      <div className="flex items-center justify-between gap-2 px-3 pt-2">
                        <span className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${isActive ? 'text-[#d9ff6f]' : 'text-white/40'}`}>
                          {isActive ? 'Resuming' : 'Decision'}
                        </span>
                        <span className="text-[11px] text-white/35">{thread.turns.length} turns</span>
                      </div>
                    )}
                    <div className={isMultiTurn ? `ml-3 mt-1 space-y-1 border-l pl-2 ${isActive ? 'border-[#d9ff6f]/35' : 'border-white/12'}` : ''}>
                      {thread.turns.map(prompt => {
                        const isSelected = selectedPrompt?.id === prompt.id;
                        return (
                          <button
                            key={prompt.id}
                            onClick={() => { setSelectedPrompt(prompt); setMobileNavOpen(false); }}
                            aria-current={isSelected ? 'true' : undefined}
                            className={`w-full rounded-xl px-3 py-3 text-left transition ${isSelected ? 'bg-white/12' : 'hover:bg-white/7'}`}
                          >
                            <span className="line-clamp-2 text-sm font-medium leading-5">{prompt.question}</span>
                            <span className="mt-1 block text-xs text-white/40">{relativeTurnTime(prompt.timestamp)}</span>
                          </button>
                        );
                      })}
                    </div>
                    {isActive && isMultiTurn && (
                      <p className="px-3 pb-2 pt-1 text-[11px] leading-4 text-white/45">
                        A follow-up sees these turns.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <div className="border-t border-white/10 p-4"><div className="mb-3 truncate text-xs text-white/50">{userEmail}</div><button onClick={handleLogout} className="flex items-center gap-2 text-sm text-white/65 hover:text-white"><LogOut size={16} />Sign out</button></div>
      </aside>

      <main className="lg:ml-72">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#49725a]">Decision workspace</p><h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.035em] text-[#102319] sm:text-4xl">Make the next financial decision with context.</h1></div>
            <Link href="/finances" className="inline-flex items-center gap-2 text-sm font-semibold text-[#102319] hover:underline">Review connected data <ChevronRight size={16} /></Link>
          </div>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <FinanceQA onNewAnswer={loadConversationHistory} selectedPrompt={selectedPrompt} newDecisionNonce={newDecisionNonce} />
            <aside className="space-y-5 xl:sticky xl:top-8" aria-label="Financial context">
              <FinancialOverview tier={subscriptionStatus?.tier} />
              <div className="rounded-2xl border border-[#102319]/10 bg-white/60 p-5"><div className="mb-2 flex items-center gap-2 text-[#102319]"><Landmark size={18} /><h2 className="font-semibold">Data confidence</h2></div><p className="text-sm leading-6 text-[#48675e]">Answers use your connected financial data and available market context. Review accounts when balances are missing.</p><button onClick={() => router.push('/profile')} className="mt-4 text-sm font-semibold text-[#397052] hover:underline">Inspect connected accounts</button></div>
            </aside>
          </div>
        </div>
      </main>
      {hasMarketNewsAccess && subscriptionStatus?.tier && <MarketNewsModal isOpen={showMarketNewsModal} onClose={() => setShowMarketNewsModal(false)} tier={subscriptionStatus.tier} />}
    </div>
  );
}
