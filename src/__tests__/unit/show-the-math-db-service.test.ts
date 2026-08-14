import { getPrismaClient } from '../../prisma-client';
import { fetchShowTheMathDBData, loadShowTheMathEvidence } from '../../openai/show-the-math-db-service';
import type { EvidenceManifest } from '../../openai/show-the-math-types';

jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn(),
}));

const mockedGetPrismaClient = getPrismaClient as jest.MockedFunction<typeof getPrismaClient>;

describe('fetchShowTheMathDBData', () => {
  beforeEach(() => jest.clearAllMocks());

  const manifest: EvidenceManifest = {
    version: 1,
    generatedAt: '2026-08-14T00:00:00.000Z',
    snapshot: {},
    facts: [{
      id: 'net_worth',
      label: 'Net worth',
      value: 100,
      unit: 'usd',
      provenance: { kind: 'snapshot', source: 'financialSummary.financialOverview.netWorth' },
    }],
    modelCalls: [],
    timings: { contextGatherMs: 1, promptBuildMs: 1, totalMs: 2 },
    validation: { deterministic: { valid: true, issues: [] } },
    evidenceRefs: { tickers: [], retirementAnalysis: false, marketContext: false },
  };

  it('returns canonical facts without a database read for simple questions', async () => {
    const result = await fetchShowTheMathDBData('user-1', manifest);

    expect(mockedGetPrismaClient).not.toHaveBeenCalled();
    expect(result.canonical_facts).toEqual(manifest.facts);
  });

  it('expands compact manifests lazily and preserves legacy evidence', async () => {
    const stored = { evidenceManifest: manifest };
    await expect(loadShowTheMathEvidence(stored, 'user-1')).resolves.toEqual({
      ...stored,
      databaseData: { canonical_facts: manifest.facts },
    });
    const legacy = { claudeFirstCall: { rawResponse: 'legacy' } };
    await expect(loadShowTheMathEvidence(legacy, 'user-1')).resolves.toBe(legacy);
  });

  it('loads the exact retirement analysis referenced by the manifest', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    mockedGetPrismaClient.mockReturnValue({ retirementAnalysis: { findMany } } as any);
    await fetchShowTheMathDBData('user-1', {
      ...manifest,
      evidenceRefs: {
        ...manifest.evidenceRefs,
        retirementAnalysis: true,
        retirementAnalysisId: 'analysis-123',
      },
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', id: 'analysis-123' },
    }));
  });
});
