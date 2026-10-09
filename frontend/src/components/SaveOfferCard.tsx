"use client";

import React, { useId, useState } from 'react';
import Link from 'next/link';
import { BookmarkPlus, Check, LoaderCircle } from 'lucide-react';
import { saveOfferedFigures, type DisplaySaveOffer } from '@/lib/your-numbers';

interface SaveOfferCardProps {
  offer: DisplaySaveOffer;
  /** Called once figures are saved, with how many. */
  onSaved?: (count: number) => void;
}

/**
 * "Use these next time?" under an answer that ran on figures the user stated.
 * Each figure is ticked by default and can be left out; nothing is saved
 * until the button is pressed, because the same decision can hold what-ifs
 * and only the user knows which figures are their plan.
 */
export default function SaveOfferCard({ offer, onSaved }: SaveOfferCardProps) {
  const headingId = useId();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  const [selected, setSelected] = useState<Set<string>>(() => new Set(offer.items.map((item) => item.key)));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'dismissed'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (status === 'dismissed') return null;

  if (status === 'saved') {
    return (
      <section aria-labelledby={headingId} className="rounded-2xl border border-[#49725a]/20 bg-[#eef4ea] p-5" role="status">
        <h3 id={headingId} className="flex items-center gap-2 font-semibold text-[#28543a]"><Check size={18} />Saved to Your numbers</h3>
        <p className="mt-1 text-sm text-[#365e4c]">
          Linc will plan with these next time you ask. <Link href="/your-numbers" className="font-semibold underline">Change them any time</Link>.
        </p>
      </section>
    );
  }

  const toggle = (key: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const save = async () => {
    const items = offer.items.filter((item) => selected.has(item.key));
    if (items.length === 0) return;
    setStatus('saving');
    setError(null);
    try {
      await saveOfferedFigures(API_URL, items);
      setStatus('saved');
      onSaved?.(items.length);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Your numbers could not be saved.');
      setStatus('idle');
    }
  };

  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-[#466f9d]/15 bg-[#f1f5fb] p-5">
      <h3 id={headingId} className="flex items-center gap-2 font-semibold text-[#102319]"><BookmarkPlus size={18} className="text-[#466f9d]" />Use these next time?</h3>
      <p className="mt-1 text-sm text-[#5e6b63]">Save them to Your numbers and Linc will plan with them in your next decision, without asking again.</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {offer.items.map((item) => (
          <li key={item.key}>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#102319]/10 bg-white px-4 py-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[#102319]"
                checked={selected.has(item.key)}
                onChange={() => toggle(item.key)}
                disabled={status === 'saving'}
              />
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wider text-[#5e6b63]">{item.label}</span>
                <span className="block text-base font-semibold text-[#102319]">{item.display}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-3 text-sm text-[#8b3027]">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={status === 'saving' || selected.size === 0}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#102319] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#173c2c] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'saving' ? <><LoaderCircle className="animate-spin" size={16} />Saving</> : 'Save to Your numbers'}
        </button>
        <button
          type="button"
          onClick={() => setStatus('dismissed')}
          disabled={status === 'saving'}
          className="rounded-full px-4 py-3 text-sm font-semibold text-[#486657] hover:text-[#102319]"
        >
          Not now
        </button>
      </div>
    </section>
  );
}
