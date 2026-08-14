"use client";

import React, { useState } from 'react';
export interface CanonicalFact {
  id: string;
  label: string;
  value: number;
  unit: 'usd' | 'percent' | 'months' | 'years' | 'age' | 'count' | 'ratio';
  displayable?: boolean;
  provenance: {
    kind: 'snapshot' | 'calculation' | 'user_input' | 'external_context';
    source: string;
    asOf?: string;
    formula?: string;
    inputFactIds?: string[];
  };
}

export interface EvidenceManifest {
  version: 1;
  generatedAt: string;
  snapshot: { computedAt?: string; asOf?: string; status?: string };
  facts: CanonicalFact[];
  contextSelection?: Record<string, boolean>;
  modelCalls: Array<{
    phase: 'initial' | 'retry';
    provider: 'claude' | 'openai';
    outcome: 'success' | 'failed';
    promptCharacters: number;
    responseCharacters: number;
    durationMs: number;
  }>;
  timings: {
    contextGatherMs: number;
    promptBuildMs: number;
    timeToFirstAnswerTokenMs?: number;
    totalMs: number;
  };
  validation: {
    deterministic: { valid: boolean; issues: string[] };
    secondary?: Array<{ phase: 'initial' | 'retry'; valid: boolean; issues: string[] }>;
  };
  evidenceRefs: {
    tickers: string[];
    retirementAnalysis: boolean;
    retirementAnalysisId?: string;
    marketContext: boolean;
    marketContextDigest?: string;
    searchContextDigest?: string;
  };
}

export interface ShowTheMathDatabaseData {
  canonical_facts?: CanonicalFact[];
  asset_price_history?: unknown[];
  retirement_analyses?: unknown[];
  security_metadata?: unknown[];
  market_news_context?: unknown;
  market_news_history?: unknown[];
}

export interface ShowTheMathData {
  evidenceManifest: EvidenceManifest;
  databaseData?: ShowTheMathDatabaseData;
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

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[#102319]/12 bg-[#102319] p-4 font-mono text-xs leading-5 text-[#e8eee8]">
      {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
    </pre>
  );
}

export function DatabaseSourceSection({
  sourceKey,
  value,
  defaultOpen = false,
}: {
  sourceKey: string;
  value: unknown;
  defaultOpen?: boolean;
}) {
  return (
    <CollapsibleSection title={sourceKey.replace(/_/g, ' ')} defaultOpen={defaultOpen}>
      <JsonBlock value={value} />
    </CollapsibleSection>
  );
}

export function ShowTheMathContent({ data }: { data: Partial<ShowTheMathData> | null }) {
  const manifest = data?.evidenceManifest;
  if (!manifest) {
    return (
      <p className="rounded-2xl bg-[#f3f2e9] p-5 text-sm leading-6 text-[#5e6b63]">
        This answer was created before traceable evidence manifests were available. Its saved calculation details can’t be displayed in the current format.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <CollapsibleSection title="Canonical facts and provenance" defaultOpen>
        <JsonBlock value={manifest.facts} />
      </CollapsibleSection>
      <CollapsibleSection title="Deterministic validation">
        <JsonBlock value={manifest.validation} />
      </CollapsibleSection>
      <CollapsibleSection title="Prompt and provider metrics">
        <JsonBlock value={{ modelCalls: manifest.modelCalls, timings: manifest.timings }} />
      </CollapsibleSection>
      <CollapsibleSection title="Snapshot and selected context">
        <JsonBlock value={{
          snapshot: manifest.snapshot,
          contextSelection: manifest.contextSelection,
          evidenceRefs: manifest.evidenceRefs,
        }} />
      </CollapsibleSection>
      {data.databaseData && Object.keys(data.databaseData).length > 0 && (
        <CollapsibleSection title="Database evidence loaded on demand">
          <div className="space-y-4">
            {Object.entries(data.databaseData).map(([key, value]) => (
              <DatabaseSourceSection key={key} sourceKey={key} value={value} />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

function formatDataAsText(data: Partial<ShowTheMathData>): string {
  return [
    '=== Show the Math — Evidence Manifest ===',
    `Exported: ${new Date().toISOString()}`,
    '',
    JSON.stringify(data, null, 2),
  ].join('\n');
}

export function downloadShowTheMathAsText(data: Partial<ShowTheMathData>) {
  const blob = new Blob([formatDataAsText(data)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `show-the-math-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
