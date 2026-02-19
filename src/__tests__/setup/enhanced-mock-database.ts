/**
 * Standalone enhanced mock database factory - no Jest hooks.
 * Import this when you need the mock without loading test-database-ci's hooks.
 */
export function createEnhancedMockDatabase() {
  return {
    $connect: async () => console.log('✅ Enhanced mock database connected'),
    $disconnect: async () => console.log('✅ Enhanced mock database disconnected'),
    $queryRaw: async () => [{ test: 1 }],

    account: {
      findMany: async (where?: any) => {
        if (where?.userId) {
          return [{ id: 'mock-account-1', userId: where.userId, name: 'Mock Account' }];
        }
        return [];
      },
      create: async (data: any) => ({ id: 'mock-account-1', ...data.data }),
      createMany: async (data: any) => ({ count: data.data.length }),
      update: async (data: any) => ({ id: 'mock-account-1', ...data.data }),
      deleteMany: async () => ({ count: 1 })
    },

    transaction: {
      findMany: async (where?: any) => {
        if (where?.userId) {
          return [{ id: 'mock-transaction-1', userId: where.userId, amount: 100 }];
        }
        return [];
      },
      create: async (data: any) => ({ id: 'mock-transaction-1', ...data.data }),
      update: async (data: any) => ({ id: 'mock-transaction-1', ...data.data }),
      deleteMany: async () => ({ count: 1 })
    },

    user: {
      findMany: async (where?: any) => {
        if (where?.id) {
          return [{ id: where.id, email: 'mock@example.com', createdAt: new Date() }];
        }
        return [];
      },
      create: async (data: any) => ({ id: 'mock-user-id', ...data.data }),
      update: async (data: any) => ({ id: 'mock-user-id', ...data.data }),
      deleteMany: async () => ({ count: 1 })
    },

    userProfile: {
      findMany: async (where?: any) => {
        if (where?.userId) {
          return [{ id: 'mock-profile-1', userId: where.userId, data: 'encrypted-profile-data' }];
        }
        return [];
      },
      create: async (data: any) => ({ id: 'mock-profile-1', ...data.data }),
      update: async (data: any) => ({ id: 'mock-profile-1', ...data.data }),
      deleteMany: async () => ({ count: 1 })
    },

    accessToken: {
      findMany: async (where?: any) => {
        if (where?.userId) {
          return [{ id: 'mock-token-1', userId: where.userId, token: 'mock-plaid-token' }];
        }
        return [];
      },
      create: async (data: any) => ({ id: 'mock-token-1', ...data.data }),
      createMany: async (data: any) => ({ count: data.data.length }),
      update: async (data: any) => ({ id: 'mock-token-1', ...data.data }),
      deleteMany: async () => ({ count: 1 })
    },

    conversation: {
      findMany: async (where?: any) => {
        if (where?.userId) {
          return [{ id: 'mock-conversation-1', userId: where.userId, question: 'mock question' }];
        }
        return [];
      },
      create: async (data: any) => ({ id: 'mock-conversation-1', ...data.data }),
      update: async (data: any) => ({ id: 'mock-conversation-1', ...data.data }),
      deleteMany: async () => ({ count: 1 })
    },

    syncStatus: {
      findMany: async (where?: any) => {
        if (where?.userId) {
          return [{ id: 'mock-sync-1', userId: where.userId, status: 'completed' }];
        }
        return [];
      },
      create: async (data: any) => ({ id: 'mock-sync-1', ...data.data }),
      update: async (data: any) => ({ id: 'mock-sync-1', ...data.data }),
      deleteMany: async () => ({ count: 1 })
    },

    demoSession: {
      findMany: async () => [],
      create: async (data: any) => ({ id: 'mock-demo-session-1', ...data.data }),
      update: async (data: any) => ({ id: 'mock-demo-session-1', ...data.data }),
      deleteMany: async () => ({ count: 0 })
    },

    demoConversation: {
      findMany: async () => [],
      create: async (data: any) => ({ id: 'mock-demo-conversation-1', ...data.data }),
      update: async (data: any) => ({ id: 'mock-demo-conversation-1', ...data.data }),
      deleteMany: async () => ({ count: 0 })
    },

    encrypted_profile_data: {
      findMany: async (where?: any) => {
        if (where?.userId) {
          return [{ id: 'mock-encrypted-profile-1', userId: where.userId, encryptedData: null, iv: null, tag: null }];
        }
        return [];
      },
      findUnique: async (where?: any) => {
        if (where?.id) {
          return { id: where.id, userId: 'mock-user-id', encryptedData: null, iv: null, tag: null };
        }
        if (where?.profileHash) {
          return { id: 'mock-encrypted-profile-2', userId: 'mock-user-2-id', profileHash: where.profileHash, encryptedData: null, iv: null, tag: null };
        }
        return null;
      },
      create: async (data: any) => ({ id: 'mock-encrypted-profile-1', ...data.data, encryptedData: data.data.encryptedData, iv: data.data.iv, tag: data.data.tag }),
      update: async (data: any) => ({ id: 'mock-encrypted-profile-1', ...data.data, encryptedData: data.data.encryptedData, iv: data.data.iv, tag: data.data.tag }),
      deleteMany: async () => ({ count: 1 })
    },

    encryptedEmailVerificationCode: {
      findMany: async (where?: any) => {
        if (where?.userId) {
          return [{ id: 'mock-encrypted-email-1', userId: where.userId, encryptedCode: null, iv: null, tag: null }];
        }
        return [];
      },
      findUnique: async (where?: any) => {
        if (where?.userId) {
          return { id: 'mock-encrypted-email-1', userId: where.userId, encryptedCode: null, iv: null, tag: null };
        }
        return null;
      },
      create: async (data: any) => ({ id: 'mock-encrypted-email-1', ...data.data, encryptedCode: data.data.encryptedCode, iv: data.data.iv, tag: data.data.tag }),
      update: async (data: any) => ({ id: 'mock-encrypted-email-1', ...data.data, encryptedCode: data.data.encryptedCode, iv: data.data.iv, tag: data.data.tag }),
      deleteMany: async () => ({ count: 1 })
    },

    encryptedUserData: {
      findMany: async (where?: any) => {
        if (where?.userId) {
          return [{ id: 'mock-encrypted-user-data-1', userId: where.userId, encryptedData: null, iv: null, tag: null }];
        }
        return [];
      },
      findUnique: async (where?: any) => {
        if (where?.userId) {
          return { id: 'mock-encrypted-user-data-1', userId: where.userId, encryptedData: null, iv: null, tag: null };
        }
        return null;
      },
      create: async (data: any) => ({ id: 'mock-encrypted-user-data-1', ...data.data, encryptedData: data.data.encryptedData, iv: data.data.iv, tag: data.data.tag }),
      update: async (data: any) => ({ id: 'mock-encrypted-user-data-1', ...data.data, encryptedData: data.data.encryptedData, iv: data.data.iv, tag: data.data.tag }),
      deleteMany: async () => ({ count: 1 })
    },

    passwordResetToken: {
      findMany: async () => [],
      create: async (data: any) => ({ id: 'mock-password-reset-1', ...data.data }),
      update: async (data: any) => ({ id: 'mock-password-reset-1', ...data.data }),
      deleteMany: async () => ({ count: 0 })
    },

    emailVerificationCode: {
      findMany: async () => [],
      create: async (data: any) => ({ id: 'mock-email-verification-1', ...data.data }),
      update: async (data: any) => ({ id: 'mock-email-verification-1', ...data.data }),
      deleteMany: async () => ({ count: 0 })
    },

    marketNewsContext: {
      _mockStorage: new Map(),
      findMany: async () => [],
      findUnique: async function (where?: any) {
        if (where?.id) {
          const stored = this._mockStorage.get(where.id);
          if (stored) return stored;
          return { id: where.id, tier: 'standard', contextText: 'Test market context for database test', data: 'mock-market-news-context', createdAt: new Date(), updatedAt: new Date() };
        }
        return null;
      },
      create: async function (data: any) {
        const created = { ...data.data, createdAt: new Date(), updatedAt: new Date() };
        this._mockStorage.set(created.id, created);
        return created;
      },
      update: async (data: any) => ({ id: 'mock-market-news-1', ...data.data }),
      delete: async function (where?: any) {
        if (where?.id) {
          const stored = this._mockStorage.get(where.id);
          if (stored) {
            this._mockStorage.delete(where.id);
            return stored;
          }
          return { id: where.id, tier: 'standard', contextText: 'Test market context for database test', data: 'mock-market-news-context', createdAt: new Date(), updatedAt: new Date() };
        }
        return null;
      },
      deleteMany: async () => ({ count: 0 })
    },

    marketNewsHistory: {
      findMany: async () => [],
      create: async (data: any) => ({ id: 'mock-market-news-history-1', ...data.data }),
      update: async (data: any) => ({ id: 'mock-market-news-history-1', ...data.data }),
      deleteMany: async () => ({ count: 0 })
    },

    privacySettings: {
      findMany: async () => [],
      create: async (data: any) => ({ id: 'mock-privacy-1', ...data.data }),
      update: async (data: any) => ({ id: 'mock-privacy-1', ...data.data }),
      deleteMany: async () => ({ count: 1 })
    },

    snapTradeUser: {
      findMany: async (where?: any) => {
        if (where?.userId) {
          return [{ id: 'mock-snaptrade-user-1', userId: where.userId, snapTradeUserId: 'mock-snaptrade-id' }];
        }
        return [];
      },
      findUnique: async (where?: any) => {
        if (where?.userId) {
          return { id: 'mock-snaptrade-user-1', userId: where.userId, snapTradeUserId: 'mock-snaptrade-id' };
        }
        return null;
      },
      create: async (data: any) => ({ id: 'mock-snaptrade-user-1', ...data.data }),
      update: async (data: any) => ({ id: 'mock-snaptrade-user-1', ...data.data }),
      deleteMany: async (where?: any) => ({ count: 1 })
    }
  } as any;
}
