"use client";

import React, { useId, useState } from 'react';
import { ArrowUp, ClipboardList } from 'lucide-react';
import {
  composeInputRequestMessage,
  initialFieldText,
  readField,
  type DisplayInputRequest,
  type DisplayInputRequestField,
} from '@/lib/input-request';

interface InputRequestCardProps {
  request: DisplayInputRequest;
  disabled?: boolean;
  /** Receives the message the form writes; the caller sends it as the next question. */
  onSubmit: (message: string) => void;
}

const UNIT_PREFIX: Partial<Record<DisplayInputRequestField['kind'], string>> = { usd: '$', usd_per_year: '$' };
const UNIT_SUFFIX: Partial<Record<DisplayInputRequestField['kind'], string>> = { usd_per_year: 'a year', percent: '%' };

/**
 * The figures a calculator is waiting on, under the answer that asked for them.
 *
 * What is missing comes first and is marked as needed; what Linc already holds
 * is filled in and says where it came from; the assumptions with a default sit
 * behind "More assumptions", each saying what a blank means.
 */
export default function InputRequestCard({ request, disabled = false, onSubmit }: InputRequestCardProps) {
  const formId = useId();
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.fields.map((field) => [field.id, initialFieldText(field)]))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [moreOpen, setMoreOpen] = useState(false);

  const shown = request.fields.filter((field) => field.required || field.value !== undefined);
  const more = request.fields.filter((field) => !field.required && field.value === undefined);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const values: Record<string, number | string> = {};
    const problems: Record<string, string> = {};
    for (const field of request.fields) {
      const reading = readField(field, texts[field.id] ?? '');
      if (reading.status === 'ok') values[field.id] = reading.value;
      else if (reading.status === 'invalid') problems[field.id] = reading.message;
      else if (field.required) problems[field.id] = 'Needed to run this.';
    }
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      if (more.some((field) => problems[field.id])) setMoreOpen(true);
      return;
    }
    onSubmit(composeInputRequestMessage(request, values));
  };

  const renderField = (field: DisplayInputRequestField) => {
    const inputId = `${formId}-${field.id}`;
    const noteId = `${inputId}-note`;
    const error = errors[field.id];
    const note = error ?? field.valueNote ?? field.defaultNote;
    const prefix = UNIT_PREFIX[field.kind];
    const suffix = UNIT_SUFFIX[field.kind];
    const update = (value: string) => {
      setTexts((current) => ({ ...current, [field.id]: value }));
      if (errors[field.id]) setErrors(({ [field.id]: _cleared, ...rest }) => rest);
    };
    return (
      <div key={field.id} className="min-w-0">
        <label htmlFor={inputId} className="flex items-center gap-2 text-sm font-semibold text-[#102319]">
          {field.label}
          {field.required && <span className="rounded-full bg-[#fde9c8] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#7a4a12]">Needed</span>}
        </label>
        <div className={`mt-1.5 flex items-center rounded-xl border bg-white px-3 focus-within:ring-2 focus-within:ring-[#49725a]/30 ${error ? 'border-[#b84a3d]/60' : 'border-[#102319]/15'}`}>
          {prefix && <span className="mr-1 text-sm text-[#5e6b63]" aria-hidden="true">{prefix}</span>}
          {field.kind === 'choice' ? (
            <select
              id={inputId}
              value={texts[field.id] ?? ''}
              onChange={(event) => update(event.target.value)}
              disabled={disabled}
              aria-invalid={Boolean(error)}
              aria-describedby={note ? noteId : undefined}
              className="w-full bg-transparent py-2.5 text-sm text-[#102319] outline-none"
            >
              <option value="">{field.required ? 'Choose one' : 'Use the default'}</option>
              {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ) : (
            <input
              id={inputId}
              type="text"
              inputMode={field.kind === 'age' ? 'numeric' : 'decimal'}
              autoComplete="off"
              value={texts[field.id] ?? ''}
              onChange={(event) => update(event.target.value)}
              disabled={disabled}
              aria-invalid={Boolean(error)}
              aria-describedby={note ? noteId : undefined}
              className="w-full min-w-0 bg-transparent py-2.5 text-sm text-[#102319] outline-none"
            />
          )}
          {suffix && <span className="ml-2 shrink-0 text-sm text-[#5e6b63]" aria-hidden="true">{suffix}</span>}
        </div>
        {note && (
          <p id={noteId} className={`mt-1 text-xs ${error ? 'text-[#8b3027]' : 'text-[#66736b]'}`} role={error ? 'alert' : undefined}>
            {note}
          </p>
        )}
      </div>
    );
  };

  return (
    <section aria-labelledby={`${formId}-title`} className="rounded-2xl border border-[#49725a]/20 bg-[#f6f8f1] p-5">
      <h3 id={`${formId}-title`} className="flex items-center gap-2 font-semibold text-[#102319]">
        <ClipboardList size={18} className="text-[#49725a]" />
        {request.title}
      </h3>
      <p className="mt-1 text-sm text-[#5e6b63]">Fill in what is needed and I will run it. No linked accounts needed.</p>
      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">{shown.map(renderField)}</div>
        {more.length > 0 && (
          <details open={moreOpen} onToggle={(event) => setMoreOpen((event.target as HTMLDetailsElement).open)} className="rounded-xl border border-[#102319]/10 bg-white/60 px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-[#486657]">More assumptions (optional)</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">{more.map(renderField)}</div>
          </details>
        )}
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#102319] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#173c2c] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {request.submitLabel}
          <ArrowUp size={17} />
        </button>
      </form>
    </section>
  );
}
