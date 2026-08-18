import * as Sentry from '@sentry/node';
import { updateProfileFromAnsweredTurn } from '../../profile/conversation-updater';

const updateProfileFromConversation = jest.fn();

jest.mock('../../profile/manager', () => ({
  ProfileManager: jest.fn().mockImplementation(() => ({
    updateProfileFromConversation,
  })),
}));

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
}));

describe('updateProfileFromAnsweredTurn', () => {
  const originalKey = process.env.PROFILE_ENCRYPTION_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PROFILE_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.PROFILE_ENCRYPTION_KEY;
    else process.env.PROFILE_ENCRYPTION_KEY = originalKey;
  });

  it('feeds the answered turn to the profile manager', async () => {
    updateProfileFromConversation.mockResolvedValue(undefined);

    await updateProfileFromAnsweredTurn({
      userId: 'user-1',
      conversationId: 'conversation-1',
      question: 'When can I retire?',
      createdAt: new Date('2026-08-16T00:00:00.000Z'),
    });

    expect(updateProfileFromConversation).toHaveBeenCalledWith('user-1', {
      id: 'conversation-1',
      question: 'When can I retire?',
      createdAt: new Date('2026-08-16T00:00:00.000Z'),
    });
  });

  it('skips the update when no encryption key is configured', async () => {
    delete process.env.PROFILE_ENCRYPTION_KEY;

    await updateProfileFromAnsweredTurn({
      userId: 'user-1',
      conversationId: 'conversation-1',
      question: 'When can I retire?',
    });

    expect(updateProfileFromConversation).not.toHaveBeenCalled();
  });

  it('swallows extraction failures but reports them to Sentry', async () => {
    updateProfileFromConversation.mockRejectedValue(new Error('extractor unavailable'));

    await expect(
      updateProfileFromAnsweredTurn({
        userId: 'user-1',
        conversationId: 'conversation-1',
        question: 'When can I retire?',
      })
    ).resolves.toBeUndefined();

    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
