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
    <div className="border border-gray-600 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-750 text-left text-sm font-medium text-gray-200"
      >
        {title}
        <span className="text-gray-400">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && <div className="p-4 bg-gray-900 border-t border-gray-700">{children}</div>}
    </div>
  );
}

function TruncatablePre({ text, maxLength = 2000 }: { text: string; maxLength?: number }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = text.length > maxLength && !expanded;
  const display = truncated ? text.slice(0, maxLength) + '\n...' : text;
  return (
    <div className="space-y-2">
      <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono overflow-x-auto max-h-96 overflow-y-auto p-3 bg-gray-950 rounded">
        {display}
      </pre>
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-sm text-blue-400 hover:text-blue-300"
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
                <p className="text-gray-400 text-xs mb-1">System prompt</p>
                <TruncatablePre text={data.claudeFirstCall.systemPrompt} />
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">User message</p>
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
              <p className="text-gray-400 text-xs mb-1">Prompt sent to Gemini</p>
              <TruncatablePre text={data.geminiValidation.prompt} />
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1">Gemini raw response</p>
              <TruncatablePre text={data.geminiValidation.rawResponse} />
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1">Parsed result</p>
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono p-3 bg-gray-950 rounded">
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
              <p className="text-gray-400 text-xs mb-1">Retry system prompt</p>
              <TruncatablePre text={data.claudeRetry.systemPrompt} maxLength={500} />
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1">Retry user message</p>
              <TruncatablePre text={data.claudeRetry.userMessage} maxLength={500} />
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1">Retry raw response</p>
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
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className="relative bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Show the math</h2>
          <div className="flex items-center gap-2">
            {canDownload && (
              <button
                type="button"
                onClick={() => downloadAsText(data!)}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-600 rounded-lg transition-colors"
                aria-label="Download as text file"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && (
            <p className="text-gray-400 text-center py-8">Loading pipeline data...</p>
          )}
          {error && (
            <p className="text-amber-400 text-center py-8">{error}</p>
          )}
          {!loading && !error && !data && (
            <p className="text-gray-400 text-center py-8">No pipeline data available for this conversation.</p>
          )}
          {!loading && !error && data && <ShowTheMathContent data={data} />}
        </div>
      </div>
    </div>
  );
}
