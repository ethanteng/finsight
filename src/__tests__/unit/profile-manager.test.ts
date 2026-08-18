import { jest } from '@jest/globals';
import { PersonalContextExtractor } from '../../profile/personal-context-extractor';
import { parseStoredPersonalContextDocument, personalContextValues, replacePersonalContextManually, serializePersonalContextDocument } from '../../profile/personal-context';
import { ProfileManager } from '../../profile/manager';

jest.mock('../../profile/personal-context-extractor');
const MockPersonalContextExtractor = PersonalContextExtractor as jest.MockedClass<typeof PersonalContextExtractor>;

const mockPrisma: any = {
  userProfile: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  encrypted_profile_data: { create: jest.fn(), update: jest.fn() },
  user: { findUnique: jest.fn() },
  $disconnect: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}));

describe('ProfileManager personal context', () => {
  let manager: ProfileManager;
  let extractAndMerge: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PROFILE_ENCRYPTION_KEY = 'test-encryption-key-32-bytes-long-here';
    extractAndMerge = jest.fn();
    (MockPersonalContextExtractor as any).mockImplementation(() => ({ extractAndMerge }));
    manager = new ProfileManager();
  });

  afterEach(() => delete process.env.PROFILE_ENCRYPTION_KEY);

  it('requires a valid encryption key', () => {
    delete process.env.PROFILE_ENCRYPTION_KEY;
    expect(() => new ProfileManager()).toThrow('PROFILE_ENCRYPTION_KEY environment variable is required');
  });

  it('stores manual memory as a structured document while preserving home data', async () => {
    const legacy = `I am 40 years old.\nHOME_ADDRESS: 123 Main St, Austin, TX\nHOME_VALUE: 500000\nHOME_VALUE_LOW: 450000\nHOME_VALUE_HIGH: 550000\nHOME_VALUE_LAST_UPDATED: 2026-08-18T00:00:00.000Z`;
    jest.spyOn(manager, 'getOriginalProfile').mockResolvedValue(legacy);
    const update = jest.spyOn(manager, 'updateProfile').mockResolvedValue();

    await manager.replacePersonalContext('user-1', { age: 41, occupation: 'Teacher' });

    const stored = parseStoredPersonalContextDocument(update.mock.calls[0][1]);
    expect(personalContextValues(stored?.facts || {})).toEqual({ age: 41, occupation: 'Teacher' });
    expect(stored?.home?.address).toBe('123 Main St, Austin, TX');
    expect(stored?.home?.rentCastValue).toBe(500000);
  });

  it('migrates legacy prose and removes financial summaries on the next conversation update', async () => {
    const legacy = 'The user is 45 years old and married. Total Portfolio Value: $2,000,000.';
    jest.spyOn(manager, 'getOriginalProfile').mockResolvedValue(legacy);
    const update = jest.spyOn(manager, 'updateProfile').mockResolvedValue();
    extractAndMerge.mockImplementation(async (_conversation: unknown, facts: unknown) => facts);

    await manager.updateProfileFromConversation('user-1', {
      id: 'conversation-1', question: 'What is my net worth?', createdAt: new Date(),
    });

    const storedText = update.mock.calls[0][1];
    expect(storedText).not.toContain('2,000,000');
    expect(personalContextValues(parseStoredPersonalContextDocument(storedText)?.facts || {})).toEqual({
      age: 45,
      householdStatus: 'married',
    });
  });

  it('keeps a home refresh that lands while extraction is running', async () => {
    const before = serializePersonalContextDocument({}, {
      address: '123 Main St', propertyId: 'property-123', rentCastValue: 500000, manualValue: null,
      valueLow: 450000, valueHigh: 550000, lastUpdated: '2026-08-01T00:00:00.000Z',
    });
    const afterRefresh = serializePersonalContextDocument({}, {
      address: '123 Main St', propertyId: 'property-123', rentCastValue: 525000, manualValue: null,
      valueLow: 470000, valueHigh: 580000, lastUpdated: '2026-08-18T00:00:00.000Z',
    });
    const read = jest.spyOn(manager, 'getOriginalProfile')
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(afterRefresh);
    const update = jest.spyOn(manager, 'updateProfile').mockResolvedValue();
    extractAndMerge.mockImplementation(async () => replacePersonalContextManually({ age: 45 }));

    await manager.updateProfileFromConversation('user-1', {
      id: 'conversation-1', question: 'I am 45.', createdAt: new Date(),
    });

    expect(read).toHaveBeenCalledTimes(2);
    const stored = parseStoredPersonalContextDocument(update.mock.calls[0][1]);
    expect(stored?.home?.rentCastValue).toBe(525000);
    expect(personalContextValues(stored?.facts || {})).toEqual({ age: 45 });
  });

  it('skips a write when a structured document receives no new facts', async () => {
    const facts = replacePersonalContextManually({ age: 45 }, '2026-08-18T00:00:00.000Z');
    const stored = serializePersonalContextDocument(facts, null);
    jest.spyOn(manager, 'getOriginalProfile').mockResolvedValue(stored);
    const update = jest.spyOn(manager, 'updateProfile').mockResolvedValue();
    extractAndMerge.mockImplementation(async () => facts);

    await manager.updateProfileFromConversation('user-1', {
      id: 'conversation-1', question: 'What is my net worth?', createdAt: new Date(),
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('parses home data from the structured document', () => {
    const stored = serializePersonalContextDocument({}, {
      address: '123 Main St', propertyId: null, rentCastValue: 500000, manualValue: 525000,
      valueLow: 450000, valueHigh: 550000, lastUpdated: '2026-08-18T00:00:00.000Z',
    });
    expect(manager.extractHomeData(stored)).toEqual(expect.objectContaining({
      address: '123 Main St', value: 525000, rentCastValue: 500000,
      manualValue: 525000, isManualOverride: true,
    }));
  });

  it('continues to encrypt writes', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    mockPrisma.userProfile.findUnique.mockResolvedValue({ id: 'profile-1', profileHash: 'hash-1', encrypted_profile_data: null });
    mockPrisma.userProfile.update.mockResolvedValue({});
    mockPrisma.encrypted_profile_data.create.mockResolvedValue({});
    await manager.updateProfile('user-1', serializePersonalContextDocument({}, null));
    expect(mockPrisma.encrypted_profile_data.create).toHaveBeenCalled();
  });
});
