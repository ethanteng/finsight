import { PrismaClient } from '@prisma/client';

let testPrisma: PrismaClient;

// Helper function to create enhanced mock database for security testing
function createEnhancedMockDatabase() {
  return {
    $connect: async () => console.log('✅ Enhanced mock database connected'),
    $disconnect: async () => console.log('✅ Enhanced mock database disconnected'),
    $queryRaw: async () => [{ test: 1 }],

    // Core models with full CRUD operations for security testing
    account: {
      findMany: async (where?: any) => {
        // Mock filtering by user ID for security testing
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
        // Mock filtering by user ID for security testing
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
        // Mock filtering by user ID for security testing
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
        // Mock filtering by user ID for security testing
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
        // Mock filtering by user ID for security testing
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
        // Mock filtering by user ID for security testing
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
        // Mock filtering by user ID for security testing
        if (where?.userId) {
          return [{ id: 'mock-sync-1', userId: where.userId, status: 'completed' }];
        }
        return [];
      },
      create: async (data: any) => ({ id: 'mock-sync-1', ...data.data }),
      update: async (data: any) => ({ id: 'mock-sync-1', ...data.data }),
      deleteMany: async () => ({ count: 1 })
    },

    // Enhanced encryption models for security testing
    // These models work with the real encryption service for proper security testing
    encrypted_profile_data: {
      findMany: async (where?: any) => {
        // Mock filtering by user ID for security testing
        if (where?.userId) {
          return [{
            id: 'mock-encrypted-profile-1',
            userId: where.userId,
            // Return empty data for new queries - let the real encryption service handle encryption
            encryptedData: null,
            iv: null,
            tag: null
          }];
        }
        return [];
      },
      findUnique: async (where?: any) => {
        // Mock findUnique for security testing
        if (where?.id) {
          return {
            id: where.id,
            userId: 'mock-user-id',
            // Return empty data for new queries - let the real encryption service handle encryption
            encryptedData: null,
            iv: null,
            tag: null
          };
        }
        if (where?.profileHash) {
          return {
            id: 'mock-encrypted-profile-2',
            userId: 'mock-user-2-id',
            profileHash: where.profileHash,
            // Return empty data for new queries - let the real encryption service handle encryption
            encryptedData: null,
            iv: null,
            tag: null
          };
        }
        return null;
      },
      create: async (data: any) => ({
        id: 'mock-encrypted-profile-1',
        ...data.data,
        // Preserve the actual encrypted data from the real encryption service
        encryptedData: data.data.encryptedData,
        iv: data.data.iv,
        tag: data.data.tag
      }),
      update: async (data: any) => ({
        id: 'mock-encrypted-profile-1',
        ...data.data,
        // Preserve the actual encrypted data from the real encryption service
        encryptedData: data.data.encryptedData,
        iv: data.data.iv,
        tag: data.data.tag
      }),
      deleteMany: async () => ({ count: 1 })
    },

    encryptedEmailVerificationCode: {
      findMany: async (where?: any) => {
        // Mock filtering by user ID for security testing
        if (where?.userId) {
          return [{
            id: 'mock-encrypted-email-1',
            userId: where.userId,
            // Return empty data for new queries - let the real encryption service handle encryption
            encryptedCode: null,
            iv: null,
            tag: null
          }];
        }
        return [];
      },
      findUnique: async (where?: any) => {
        // Mock findUnique for security testing
        if (where?.userId) {
          return {
            id: 'mock-encrypted-email-1',
            userId: where.userId,
            // Return empty data for new queries - let the real encryption service handle encryption
            encryptedCode: null,
            iv: null,
            tag: null
          };
        }
        return null;
      },
      create: async (data: any) => ({
        id: 'mock-encrypted-email-1',
        ...data.data,
        // Preserve the actual encrypted data from the real encryption service
        encryptedCode: data.data.encryptedCode,
        iv: data.data.iv,
        tag: data.data.tag
      }),
      update: async (data: any) => ({
        id: 'mock-encrypted-email-1',
        ...data.data,
        // Preserve the actual encrypted data from the real encryption service
        encryptedCode: data.data.encryptedCode,
        iv: data.data.iv,
        tag: data.data.tag
      }),
      deleteMany: async () => ({ count: 1 })
    },

    encryptedUserData: {
      findMany: async (where?: any) => {
        // Mock filtering by user ID for security testing
        if (where?.userId) {
          return [{
            id: 'mock-encrypted-user-data-1',
            userId: where.userId,
            // Return empty data for new queries - let the real encryption service handle encryption
            encryptedData: null,
            iv: null,
            tag: null
          }];
        }
        return [];
      },
      findUnique: async (where?: any) => {
        // Mock findUnique for security testing
        if (where?.userId) {
          return {
            id: 'mock-encrypted-user-data-1',
            userId: where.userId,
            // Return empty data for new queries - let the real encryption service handle encryption
            encryptedData: null,
            iv: null,
            tag: null
          };
        }
        return null;
      },
      create: async (data: any) => ({
        id: 'mock-encrypted-user-data-1',
        ...data.data,
        // Preserve the actual encrypted data from the real encryption service
        encryptedData: data.data.encryptedData,
        iv: data.data.iv,
        tag: data.data.tag
      }),
      update: async (data: any) => ({
        id: 'mock-encrypted-user-data-1',
        ...data.data,
        // Preserve the actual encrypted data from the real encryption service
        encryptedData: data.data.encryptedData,
        iv: data.data.iv,
        tag: data.data.tag
      }),
      deleteMany: async () => ({ count: 1 })
    },

    // Add missing models that tests expect
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
      // Store created contexts in memory for testing
      _mockStorage: new Map(),

      findMany: async () => [],
      findUnique: async function(where?: any) {
        // Mock findUnique for market news context
        if (where?.id) {
          // Check if we have stored data for this ID
          const stored = this._mockStorage.get(where.id);
          if (stored) {
            return stored;
          }
          // Fallback for existing tests
          return {
            id: where.id,
            tier: 'standard',
            contextText: 'Test market context for database test',
            data: 'mock-market-news-context',
            createdAt: new Date(),
            updatedAt: new Date()
          };
        }
        return null;
      },
      create: async function(data: any) {
        // Create the context with actual data
        const created = {
          ...data.data,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        // Store it for retrieval
        this._mockStorage.set(created.id, created);
        return created;
      },
      update: async (data: any) => ({ id: 'mock-market-news-1', ...data.data }),
      delete: async function(where?: any) {
        // Mock delete for market news context
        if (where?.id) {
          const stored = this._mockStorage.get(where.id);
          if (stored) {
            this._mockStorage.delete(where.id);
            return stored;
          }
          return {
            id: where.id,
            tier: 'standard',
            contextText: 'Test market context for database test',
            data: 'mock-market-news-context',
            createdAt: new Date(),
            updatedAt: new Date()
          };
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

    // Additional models needed for workflow tests
    privacySettings: {
      findMany: async () => [],
      create: async (data: any) => ({ id: 'mock-privacy-1', ...data.data }),
      update: async (data: any) => ({ id: 'mock-privacy-1', ...data.data }),
      deleteMany: async () => ({ count: 1 })
    },

    // SnapTrade models for integration testing
    snapTradeUser: {
      findMany: async (where?: any) => {
        // Mock filtering by user ID for security testing
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

beforeAll(async () => {
  // Check if we're in a CI/CD environment
  const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

  console.log('🔧 Test Database Setup - Environment Variables:');
  console.log('  TEST_DATABASE_URL:', process.env.TEST_DATABASE_URL ? '✅ Set' : '❌ Not set');
  console.log('  DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Not set');
  console.log('  NODE_ENV:', process.env.NODE_ENV);
  console.log('  CI:', process.env.CI);
  console.log('  GITHUB_ACTIONS:', process.env.GITHUB_ACTIONS);
  console.log('  Is CI/CD Environment:', isCI);

  // CI used to short-circuit to the mock database here, which meant the workflow
  // booted a PostgreSQL service container, ran `prisma migrate deploy` against it,
  // and then never used it. That is not a neutral substitution: the mock's
  // findMany checks `where?.userId`, but Prisma calls `findMany({ where: { userId } })`,
  // so correctly scoped queries return [] and isolation tests pass vacuously. CI now
  // uses the database it builds.
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    if (isCI) {
      throw new Error(
        'No TEST_DATABASE_URL/DATABASE_URL in CI. These suites must run against the ' +
        'real database; falling back to a mock would report false confidence.'
      );
    }
    console.log('⚠️ No database URL found - using mock database');
    // Local convenience only: lets contributors run the suite without a database.
    testPrisma = createEnhancedMockDatabase();

    console.log('✅ Enhanced mock database setup complete for local development');
    return;
  }

  console.log('🔧 Attempting to connect to real database:', databaseUrl);

  testPrisma = new PrismaClient({
    datasources: {
      db: { url: databaseUrl }
    }
  });

  // Verify connection with retry logic
  let connected = false;
  let attempts = 0;
  const maxAttempts = 5;

  while (!connected && attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`🔧 Database connection attempt ${attempts}/${maxAttempts}`);

      await testPrisma.$connect();
      console.log('✅ Connected to real database:', databaseUrl);

      // Test a simple query to verify the connection works
      const result = await testPrisma.$queryRaw`SELECT 1 as test`;
      console.log('✅ Database query test successful:', result);

      connected = true;
    } catch (error: any) {
      console.error(`❌ Database connection attempt ${attempts} failed:`, error.message);

      if (attempts < maxAttempts) {
        console.log(`⏳ Waiting 2 seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else if (isCI) {
        // Never silently degrade to a mock in CI — an unreachable database must
        // fail the run, not turn it green against fabricated data.
        throw new Error(
          `Could not reach the test database after ${maxAttempts} attempts: ${error.message}`
        );
      } else {
        console.error('❌ Failed to connect to database after all attempts - falling back to enhanced mock');
        // Local convenience only; see the note above.
        testPrisma = createEnhancedMockDatabase();

        console.log('✅ Fallback to enhanced mock database complete');
        connected = true;
      }
    }
  }
});

afterAll(async () => {
  if (testPrisma) {
    try {
      await testPrisma.$disconnect();
      console.log('✅ Disconnected from test database');
    } catch (error) {
      console.log('ℹ️ Mock database disconnect (no action needed)');
    }
  }
});

beforeEach(async () => {
  // Clean test data before each test
  // Order matters: delete child tables before parent tables
  try {
    // Clean up tables in proper order to avoid foreign key constraints
    // Use try-catch for each table in case some don't exist yet
    const tables = [
      'encrypted_profile_data',
      'transaction',
      'account',
      'accessToken',
      'conversation',
      'syncStatus',
      'userProfile',
      'user',
      'encryptedEmailVerificationCode',
      'encryptedUserData',
      'passwordResetToken',
      'emailVerificationCode',
      'marketNewsHistory',
      'marketNewsContext',
      'snapTradeUser'
    ];

    for (const table of tables) {
      try {
        await (testPrisma as any)[table].deleteMany();
      } catch (error: any) {
        // Table might not exist yet, which is fine
        if (error.message.includes('relation') && error.message.includes('does not exist')) {
          console.log(`ℹ️ Table ${table} not ready for cleanup yet`);
        } else {
          console.warn(`⚠️ Warning cleaning up table ${table}:`, error.message);
        }
      }
    }

    console.log('🧹 Test data cleaned up');
  } catch (error: any) {
    // Log errors but don't fail the test setup
    console.warn('⚠️ Warning during test cleanup:', error.message);
  }
});

// Export for use in tests
export { testPrisma };

// Export a function that always returns the enhanced mock database for CI testing
export function getMockPrisma() {
  return createEnhancedMockDatabase();
}

// Export the mock database creator function for use in other test setups
export { createEnhancedMockDatabase };
