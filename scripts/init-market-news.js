const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function initMarketNewsContext() {
  try {
    console.log('Initializing market news context data...');

    // Create sample market context for each tier
    const contexts = [
      {
        id: 'auto-starter',
        contextText: 'No market context available for Starter tier. Focus on personal financial analysis.',
        dataSources: [],
        keyEvents: [],
        availableTiers: ['starter'],
        isActive: true,
        manualOverride: false
      },
      {
        id: 'auto-standard',
        contextText: `ECONOMIC INDICATORS:
The Federal Reserve has maintained interest rates at current levels, with the target federal funds rate at 5.25-5.50%. Inflation remains elevated but showing signs of moderation.

MARKET TRENDS:
Major market indices are experiencing moderate volatility. The S&P 500 has shown resilience despite economic headwinds, while bond yields remain elevated.

KEY DEVELOPMENTS:
- Federal Reserve continues to monitor inflation data closely
- Treasury yields remain elevated, affecting borrowing costs
- Market participants watching for signs of economic slowdown

MARKET OUTLOOK:
Current market conditions suggest a cautious approach to financial planning. Consider maintaining emergency funds and diversifying investments.`,
        dataSources: ['fred', 'brave_search'],
        keyEvents: ['Federal Reserve policy', 'Inflation trends', 'Treasury yields'],
        availableTiers: ['standard'],
        isActive: true,
        manualOverride: false
      },
      {
        id: 'auto-premium',
        contextText: `ECONOMIC INDICATORS:
The Federal Reserve has maintained interest rates at 5.25-5.50%, with inflation at 3.2% year-over-year. Treasury yields show: US10Y at 4.15%, US2Y at 4.85%, creating an inverted yield curve.

MARKET TRENDS:
S&P 500 (SPY) trading at $4,850, up 0.8% this week. Total market ETF (VTI) at $245, showing broad market strength. Dow Jones (DIA) at $38,200, indicating blue-chip stability.

KEY DEVELOPMENTS:
- Federal Reserve signals potential rate cuts in 2024 if inflation continues to moderate
- Treasury yield curve inversion suggests economic caution
- Market sentiment improving as inflation expectations decline
- Corporate earnings season showing mixed results

MARKET OUTLOOK:
Current conditions favor a balanced approach to financial planning. Elevated rates provide opportunities for CD investments and bond ladders. Consider maintaining liquidity while taking advantage of higher yields for retirement planning.`,
        dataSources: ['polygon', 'fred', 'brave_search'],
        keyEvents: ['Federal Reserve policy', 'Treasury yield curve', 'Market sentiment', 'Corporate earnings'],
        availableTiers: ['premium'],
        isActive: true,
        manualOverride: false
      }
    ];

    for (const context of contexts) {
      await prisma.marketNewsContext.upsert({
        where: { id: context.id },
        update: {
          contextText: context.contextText,
          dataSources: context.dataSources,
          keyEvents: context.keyEvents,
          availableTiers: context.availableTiers,
          isActive: context.isActive,
          manualOverride: context.manualOverride,
          lastUpdate: new Date()
        },
        create: {
          id: context.id,
          contextText: context.contextText,
          dataSources: context.dataSources,
          keyEvents: context.keyEvents,
          availableTiers: context.availableTiers,
          isActive: context.isActive,
          manualOverride: context.manualOverride
        }
      });
    }

    console.log('✅ Market news context data initialized successfully!');
    console.log('Created contexts for: Starter, Standard, and Premium tiers');
    
  } catch (error) {
    console.error('Error initializing market news context:', error);
  } finally {
    await prisma.$disconnect();
  }
}

initMarketNewsContext();
