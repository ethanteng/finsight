"use client";

import React, { useState } from 'react';
import { Download } from 'lucide-react';

export interface ShowTheMathClaudeCall {
  systemPrompt: string;
  userMessage: string;
  rawResponse: string;
}

export interface ShowTheMathGeminiValidation {
  prompt: string;
  rawResponse: string;
  parsedResult: { valid: boolean; issues?: string[] };
}

export interface ShowTheMathDatabaseData {
  asset_price_history?: unknown[];
  financial_summaries?: unknown;
  financial_summary_snapshots?: unknown;
  retirement_analyses?: unknown[];
  security_metadata?: unknown[];
  market_news_context?: unknown;
  market_news_history?: unknown[];
}

export interface ShowTheMathData {
  claudeFirstCall: ShowTheMathClaudeCall;
  geminiValidation?: ShowTheMathGeminiValidation;
  claudeRetry?: ShowTheMathClaudeCall;
  databaseData: ShowTheMathDatabaseData;
}

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-2xl border border-[#102319]/15 bg-[#fffdf5]">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between bg-[#f3f2e9] px-4 py-3.5 text-left text-sm font-semibold text-[#102319] transition hover:bg-[#ebece3]"
      >
        {title}
        <span className="ml-4 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#102319]/15 text-[#486657]">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && <div className="border-t border-[#102319]/12 bg-[#fffdf5] p-4 sm:p-5">{children}</div>}
    </div>
  );
}

function TruncatablePre({ text, maxLength = 2000 }: { text: string; maxLength?: number }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = text.length > maxLength && !expanded;
  const display = truncated ? text.slice(0, maxLength) + '\n...' : text;
  return (
    <div className="space-y-2">
      <pre className="max-h-96 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-[#102319]/12 bg-[#102319] p-4 font-mono text-xs leading-5 text-[#e8eee8]">
        {display}
      </pre>
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-sm font-semibold text-[#397052] hover:text-[#102319]"
        >
          Show more
        </button>
      )}
    </div>
  );
}

export function ShowTheMathContent({ data }: { data: Partial<ShowTheMathData> | null }) {
  if (!data) return null;
  return (
    <div className="space-y-4">
      {data.claudeFirstCall && (
        <>
          <CollapsibleSection title="Context to Claude (system + user message)" defaultOpen>
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[.08em] text-[#66736b]">System prompt</p>
                <TruncatablePre text={data.claudeFirstCall.systemPrompt} />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[.08em] text-[#66736b]">User message</p>
                <TruncatablePre text={data.claudeFirstCall.userMessage} />
              </div>
            </div>
          </CollapsibleSection>
          <CollapsibleSection title="Claude raw response (first call)">
            <TruncatablePre text={data.claudeFirstCall.rawResponse} />
          </CollapsibleSection>
        </>
      )}
      {data.geminiValidation && (
        <CollapsibleSection title="Gemini validation">
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[.08em] text-[#66736b]">Prompt sent to Gemini</p>
              <TruncatablePre text={data.geminiValidation.prompt} />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[.08em] text-[#66736b]">Gemini raw response</p>
              <TruncatablePre text={data.geminiValidation.rawResponse} />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[.08em] text-[#66736b]">Parsed result</p>
              <pre className="whitespace-pre-wrap rounded-xl border border-[#102319]/12 bg-[#102319] p-4 font-mono text-xs leading-5 text-[#e8eee8]">
                {JSON.stringify(data.geminiValidation.parsedResult, null, 2)}
              </pre>
            </div>
          </div>
        </CollapsibleSection>
      )}
      {data.claudeRetry && (
        <CollapsibleSection title="Claude retry (after validation feedback)">
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[.08em] text-[#66736b]">Retry system prompt</p>
              <TruncatablePre text={data.claudeRetry.systemPrompt} maxLength={500} />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[.08em] text-[#66736b]">Retry user message</p>
              <TruncatablePre text={data.claudeRetry.userMessage} maxLength={500} />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[.08em] text-[#66736b]">Retry raw response</p>
              <TruncatablePre text={data.claudeRetry.rawResponse} />
            </div>
          </div>
        </CollapsibleSection>
      )}
      {data.databaseData && Object.keys(data.databaseData).length > 0 && (
        <CollapsibleSection title="Database data">
          <div className="space-y-4">
            {Object.entries(data.databaseData).map(([key, value]) => (
              <CollapsibleSection key={key} title={key.replace(/_/g, ' ')}>
                <TruncatablePre
                  text={typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                  maxLength={3000}
                />
              </CollapsibleSection>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

function formatDataAsText(data: Partial<ShowTheMathData>): string {
  const sections: string[] = [];
  sections.push('=== Show the Math — Pipeline Transparency ===\n');
  sections.push(`Exported: ${new Date().toISOString()}\n`);

  if (data.claudeFirstCall) {
    sections.push('\n--- Context to Claude (system + user message) ---\n');
    sections.push('\n[System prompt]\n');
    sections.push(data.claudeFirstCall.systemPrompt);
    sections.push('\n\n[User message]\n');
    sections.push(data.claudeFirstCall.userMessage);
    sections.push('\n\n--- Claude raw response (first call) ---\n');
    sections.push(data.claudeFirstCall.rawResponse);
  }

  if (data.geminiValidation) {
    sections.push('\n\n--- Gemini validation ---\n');
    sections.push('\n[Prompt sent to Gemini]\n');
    sections.push(data.geminiValidation.prompt);
    sections.push('\n\n[Gemini raw response]\n');
    sections.push(data.geminiValidation.rawResponse);
    sections.push('\n\n[Parsed result]\n');
    sections.push(JSON.stringify(data.geminiValidation.parsedResult, null, 2));
  }

  if (data.claudeRetry) {
    sections.push('\n\n--- Claude retry (after validation feedback) ---\n');
    sections.push('\n[Retry system prompt]\n');
    sections.push(data.claudeRetry.systemPrompt);
    sections.push('\n\n[Retry user message]\n');
    sections.push(data.claudeRetry.userMessage);
    sections.push('\n\n[Retry raw response]\n');
    sections.push(data.claudeRetry.rawResponse);
  }

  if (data.databaseData && Object.keys(data.databaseData).length > 0) {
    sections.push('\n\n--- Database data ---\n');
    for (const [key, value] of Object.entries(data.databaseData)) {
      sections.push(`\n[${key.replace(/_/g, ' ')}]\n`);
      sections.push(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
    }
  }

  return sections.join('');
}

function downloadAsText(data: Partial<ShowTheMathData>) {
  const text = formatDataAsText(data);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `show-the-math-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface ShowTheMathModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: Partial<ShowTheMathData> | null;
  loading?: boolean;
  error?: string | null;
}

export default function ShowTheMathModal({ isOpen, onClose, data, loading, error }: ShowTheMathModalProps) {
  if (!isOpen) return null;

  const canDownload = !loading && !error && data && Object.keys(data).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#102319]/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[24px] border border-[#ccd1c4] bg-[#fffdf5] text-[#102319] shadow-[0_28px_80px_rgba(16,35,25,.28)]">
        <div className="flex items-center justify-between border-b border-[#102319]/12 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#49725a]">Decision transparency</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-.035em] text-[#102319]">Show the math</h2>
          </div>
          <div className="flex items-center gap-2">
            {canDownload && (
              <button
                type="button"
                onClick={() => downloadAsText(data!)}
                className="inline-flex items-center gap-2 rounded-full border border-[#102319]/15 px-3.5 py-2 text-sm font-semibold text-[#486657] transition hover:bg-[#f3f2e9] hover:text-[#102319]"
                aria-label="Download as text file"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full text-2xl leading-none text-[#66736b] transition hover:bg-[#f3f2e9] hover:text-[#102319]"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          {loading && (
            <p className="py-8 text-center text-sm text-[#66736b]">Loading pipeline data...</p>
          )}
          {error && (
            <p className="rounded-2xl bg-[#f4ead0] px-4 py-8 text-center text-sm text-[#76510f]">{error}</p>
          )}
          {!loading && !error && !data && (
            <p className="rounded-2xl bg-[#f3f2e9] px-4 py-8 text-center text-sm text-[#66736b]">No pipeline data available for this conversation.</p>
          )}
          {!loading && !error && data && <ShowTheMathContent data={data} />}
        </div>
      </div>
    </div>
  );
}
