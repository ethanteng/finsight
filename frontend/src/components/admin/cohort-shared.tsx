'use client';

import { useEffect, useId, useState, type CSSProperties } from 'react';

/** Pieces the account and visitor cohort panels share, so their grids read alike. */

export type Grain = 'day' | 'week' | 'month';

export interface CohortCell {
  rate: number | null;
  count: number;
  eligible: number;
}

export const GRAIN_LABEL: Record<Grain, { one: string; plural: string; title: string }> = {
  day: { one: 'day', plural: 'days', title: 'Day' },
  week: { one: 'week', plural: 'weeks', title: 'Week' },
  month: { one: 'month', plural: 'months', title: 'Month' },
};

const DATE = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

export function formatDate(iso: string | null): string {
  return iso ? DATE.format(new Date(iso)) : '—';
}

export function percent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

function clampWhole(value: string, max: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= max ? parsed : null;
}

/**
 * One green, light to dark, with the text color that reads on each step: every
 * pair clears 4.5:1, and the lightest step still stands out from the page, so
 * a 0% cell is visibly a cell. 0% has its own step; the rest are 20-point bands.
 */
const HEAT_STEPS: Array<{ background: string; text: string }> = [
  { background: '#94bf9d', text: '#102319' },
  { background: '#76aa85', text: '#102319' },
  { background: '#5c946d', text: '#102319' },
  { background: '#3f7a55', text: '#ffffff' },
  { background: '#2c6043', text: '#ffffff' },
  { background: '#1b4530', text: '#ffffff' },
];

/**
 * Inline, like the heatmap: the signed-in theme re-inks `.text-white` dark
 * (globals.css) and only restores it on its near-black background, so a
 * `text-white` class on green renders dark on dark. White on this green is 5.8:1.
 */
export const ENGAGED_CELL_STYLE: CSSProperties = { backgroundColor: '#397052', color: '#ffffff' };

export function cellStyle(cell: CohortCell): CSSProperties {
  if (cell.rate === null) return { backgroundColor: 'transparent' };
  const step = cell.rate === 0 ? HEAT_STEPS[0] : HEAT_STEPS[Math.min(5, 1 + Math.floor(cell.rate * 5))];
  return { backgroundColor: step.background, color: step.text };
}

export function NumberControl({ label, value, max, onCommit }: {
  label: string;
  value: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const id = useId();
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-[#5e6b63]">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={1}
        max={max}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = clampWhole(event.target.value, max);
          if (parsed !== null) onCommit(parsed);
        }}
        onBlur={() => setDraft(String(value))}
        className="h-10 w-24 rounded border border-[#102319]/15 bg-white px-3 text-sm text-[#102319]"
      />
    </div>
  );
}

export function GrainSelect({ label, value, onChange, plural = false }: {
  label: string;
  value: Grain;
  onChange: (value: Grain) => void;
  plural?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-[#5e6b63]">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as Grain)}
        className="h-10 rounded border border-[#102319]/15 bg-white px-3 text-sm text-[#102319]"
      >
        {(['day', 'week', 'month'] as Grain[]).map((grain) => (
          <option key={grain} value={grain}>
            {plural ? GRAIN_LABEL[grain].title + 's' : GRAIN_LABEL[grain].title}
          </option>
        ))}
      </select>
    </div>
  );
}
