# 📰 **Financial Market News Context System**

## **Concept Overview**

A dynamic AI-built market news context system that intelligently aggregates and synthesizes financial market information from multiple data sources to provide enhanced context for AI responses. This system continuously updates with the latest market news, trends, and insights to improve the relevance and value of financial advice.

## **Core Objectives**

1. **Real-Time Market Intelligence**: Continuously aggregate news from Finnhub, FRED, Alpha Vantage, and other financial sources
2. **AI-Enhanced Synthesis**: Use AI to process and synthesize complex market data into actionable insights
3. **Tier-Aware Access**: Provide different levels of market context based on user subscription tiers
4. **Admin Management**: Allow manual editing and oversight of market context content
5. **Performance Optimization**: Cache and update market context efficiently to reduce API calls
6. **Daily Email Summaries**: Optional daily market news email summaries for engaged users

## **Database Schema**

### **Market News Context Table**

```prisma
model MarketNewsContext {
  id              String   @id @default(cuid())
  
  // Content
  contextText     String   @db.Text // AI-synthesized market news summary
  rawData         Json?    // Raw data from various sources for reference
  
  // Metadata
  lastUpdate      DateTime @updatedAt
  createdAt       DateTime @default(now())
  
  // Source tracking
  dataSources     String[] // Array of sources used (Finnhub, FRED, AlphaVantage, etc.)
  keyEvents       String[] // Array of major market events identified
  
  // Tier configuration
  availableTiers  String[] // Which tiers can access this context (starter, standard, premium)
  
  // Admin controls
  isActive        Boolean  @default(true)
  manualOverride  Boolean  @default(false) // True if manually edited
  lastEditedBy    String?  // Admin who last edited (if manual override)
  
  @@map("market_news_context")
}
```

### **Market News History Table** (for audit trail)

```prisma
model MarketNewsHistory {
  id              String   @id @default(cuid())
  contextId       String
  context         MarketNewsContext @relation(fields: [contextId], references: [id])
  
  // Content snapshot
  contextText     String   @db.Text
  dataSources     String[]
  keyEvents       String[]
  
  // Change tracking
  changeType      String   // 'auto_update', 'manual_edit', 'admin_override'
  changeReason    String?  // Optional reason for change
  changedBy       String?  // User/admin who made the change
  
  createdAt       DateTime @default(now())
  
  @@map("market_news_history")
}
```

### **Market News Email Preferences Table**

```prisma
model MarketNewsEmailPreference {
  id              String   @id @default(cuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Email preferences
  isSubscribed    Boolean  @default(false)
  emailFrequency  String   @default("daily") // "daily", "weekly", "never"
  preferredTime   String   @default("09:00") // Time zone will be user's timezone
  tier            String   @default("standard") // Which tier's context to receive
  
  // Email tracking
  lastSentAt      DateTime?
  totalSent       Int      @default(0)
  isActive        Boolean  @default(true)
  
  // Metadata
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@map("market_news_email_preferences")
}
```

### **Market News Email Log Table** (for tracking email delivery)

```prisma
model MarketNewsEmailLog {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Email content
  subject         String
  contextText     String   @db.Text
  tier            String
  
  // Delivery tracking
  sentAt          DateTime @default(now())
  delivered       Boolean  @default(false)
  opened          Boolean  @default(false)
  clicked          Boolean  @default(false)
  
  // Error tracking
  errorMessage    String?
  
  @@map("market_news_email_logs")
}
```

## **Data Source Integration**

### **Primary Data Source: Finnhub.io**

**Why Finnhub is the Optimal Choice:**

1. **Comprehensive Data Coverage**
   - Real-time stock data for 60+ exchanges worldwide
   - Financial news from 60+ professional sources (Reuters, Bloomberg, etc.)
   - Economic indicators and calendar events
   - Company fundamentals and earnings data
   - Forex and crypto market data
   - Built-in sentiment analysis

2. **Perfect Alignment with System Requirements**
   - Single API provides news, market data, and economic indicators
   - Real-time data with professional quality
   - Sentiment analysis enhances AI synthesis
   - Structured data format simplifies processing
   - Cost-effective pricing for tiered access

3. **API Rate Limits & Pricing**
   - Free tier: 60 API calls/minute
   - Paid tiers start at $9.99/month for higher limits
   - Suitable for scheduled updates every 2 hours
   - Enterprise options for high-volume usage

4. **Enhanced Tier-Based Access Implementation**

   | Tier | Data Sources | Features | Value Proposition |
   |------|-------------|----------|------------------|
   | **Starter** | ❌ No market news | Basic financial analysis only | Core financial advice without market context |
   | **Standard** | ✅ FRED + Brave Search | Economic indicators and general trends | Basic market awareness with economic data |
   | **Premium** | ✅ Full Finnhub Access | Comprehensive market intelligence with sentiment analysis | Professional-grade market insights and real-time data |

### **Tier-Specific Data Sources**

#### **Starter Tier**
- **No market data**: Focus on personal financial analysis only
- **Basic AI responses**: General financial advice without market context
- **Value**: Essential financial guidance for basic needs
- **Upgrade incentive**: "Get market-aware advice with Standard tier"

#### **Standard Tier**
- **FRED**: Federal Reserve Economic Data (economic indicators)
- **Brave Search**: Web search for general financial news
- **Limited market context**: Basic economic trends and indicators
- **Value**: Basic market context for informed decisions
- **Upgrade incentive**: "Get professional-grade market intelligence with Premium tier"

#### **Premium Tier**
- **Finnhub**: Complete market intelligence platform
  - Real-time stock data from 60+ exchanges
  - Professional news from Reuters, Bloomberg, and 60+ sources
  - Economic calendar and events
  - Company fundamentals and earnings data
  - Built-in sentiment analysis
  - Forex and crypto market data
- **Enhanced AI responses**: Market-aware recommendations with sentiment analysis
- **Daily email summaries**: Rich market context with professional insights
- **Value**: Professional-grade market intelligence for serious investors

## **System Architecture**

### **1. Market News Aggregator**

```typescript
// src/market-news/aggregator.ts
export interface MarketNewsSource {
  id: string;
  name: string;
  priority: number; // Higher priority sources are processed first
  enabled: boolean;
}

export interface MarketNewsData {
  source: string;
  timestamp: Date;
  data: any;
  type: 'economic_indicator' | 'market_data' | 'news_article' | 'rate_information';
  relevance: number; // 0-1, how relevant to current market conditions
}

export class MarketNewsAggregator {
  private sources: Map<string, MarketNewsSource> = new Map();
  private dataCache: Map<string, MarketNewsData[]> = new Map();
  
  constructor() {
    this.initializeSources();
  }
  
  private initializeSources() {
    // Premium tier sources (Finnhub only)
    this.sources.set('finnhub', {
      id: 'finnhub',
      name: 'Finnhub Financial Data',
      priority: 1, // Premium tier only
      enabled: true
    });
    
    // Standard tier sources
    this.sources.set('fred', {
      id: 'fred',
      name: 'Federal Reserve Economic Data',
      priority: 2, // Standard tier
      enabled: true
    });
    
    this.sources.set('brave_search', {
      id: 'brave_search',
      name: 'Brave Search Financial News',
      priority: 3, // Standard tier
      enabled: true
    });
    
    // Fallback sources (if needed)
    this.sources.set('alpha_vantage', {
      id: 'alpha_vantage', 
      name: 'Alpha Vantage Market Data',
      priority: 4, // Fallback only
      enabled: false // Disabled by default
    });
  }
  
  async aggregateMarketData(): Promise<MarketNewsData[]> {
    const allData: MarketNewsData[] = [];
    
    // Aggregate from all enabled sources
    for (const [sourceId, source] of this.sources) {
      if (!source.enabled) continue;
      
      try {
        const sourceData = await this.fetchFromSource(sourceId);
        allData.push(...sourceData);
      } catch (error) {
        console.error(`Error fetching from ${sourceId}:`, error);
      }
    }
    
    // Sort by relevance and timestamp
    return allData.sort((a, b) => {
      if (a.relevance !== b.relevance) {
        return b.relevance - a.relevance;
      }
      return b.timestamp.getTime() - a.timestamp.getTime();
    });
  }
  
  private async fetchFromSource(sourceId: string): Promise<MarketNewsData[]> {
    switch (sourceId) {
      case 'finnhub':
        return this.fetchFinnhubData();
      case 'fred':
        return this.fetchFREDData();
      case 'brave_search':
        return this.fetchBraveSearchData();
      case 'alpha_vantage':
        return this.fetchAlphaVantageData(); // Fallback only
      default:
        return [];
    }
  }
  
  private async fetchFinnhubData(): Promise<MarketNewsData[]> {
    const [news, economicCalendar, marketData] = await Promise.all([
      this.fetchFinnhubNews(),
      this.fetchFinnhubEconomicCalendar(),
      this.fetchFinnhubMarketData()
    ]);
    
    return [...news, ...economicCalendar, ...marketData];
  }
  
  private async fetchFinnhubNews(): Promise<MarketNewsData[]> {
    try {
      const response = await fetch(
        `https://finnhub.io/api/v1/news?category=general&token=${process.env.FINNHUB_API_KEY}`
      );
      const news = await response.json();
      
      return news.map((item: any) => ({
        source: 'finnhub',
        timestamp: new Date(item.datetime * 1000),
        data: {
          headline: item.headline,
          summary: item.summary,
          url: item.url,
          sentiment: item.sentiment,
          category: item.category
        },
        type: 'news_article',
        relevance: this.calculateNewsRelevance(item.headline, item.summary, item.sentiment)
      }));
    } catch (error) {
      console.error('Error fetching Finnhub news:', error);
      return [];
    }
  }
  
  private async fetchFinnhubEconomicCalendar(): Promise<MarketNewsData[]> {
    try {
      const today = new Date();
      const response = await fetch(
        `https://finnhub.io/api/v1/calendar/economic?from=${today.toISOString().split('T')[0]}&to=${today.toISOString().split('T')[0]}&token=${process.env.FINNHUB_API_KEY}`
      );
      const calendar = await response.json();
      
      return calendar.economicCalendar?.map((item: any) => ({
        source: 'finnhub',
        timestamp: new Date(item.time),
        data: {
          event: item.event,
          country: item.country,
          currency: item.currency,
          impact: item.impact,
          actual: item.actual,
          forecast: item.forecast,
          previous: item.previous
        },
        type: 'economic_indicator',
        relevance: this.calculateEconomicRelevance(item.impact, item.country)
      })) || [];
    } catch (error) {
      console.error('Error fetching Finnhub economic calendar:', error);
      return [];
    }
  }
  
  private async fetchFinnhubMarketData(): Promise<MarketNewsData[]> {
    try {
      // Fetch major indices (S&P 500, NASDAQ, DOW)
      const indices = ['^GSPC', '^IXIC', '^DJI'];
      const marketData: MarketNewsData[] = [];
      
      for (const symbol of indices) {
        const response = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`
        );
        const quote = await response.json();
        
        if (quote.c && quote.d) {
          marketData.push({
            source: 'finnhub',
            timestamp: new Date(),
            data: {
              symbol,
              currentPrice: quote.c,
              change: quote.d,
              changePercent: quote.dp,
              high: quote.h,
              low: quote.l,
              open: quote.o,
              previousClose: quote.pc
            },
            type: 'market_data',
            relevance: this.calculateMarketRelevance(symbol, quote.dp)
          });
        }
      }
      
      return marketData;
    } catch (error) {
      console.error('Error fetching Finnhub market data:', error);
      return [];
    }
  }

private calculateNewsRelevance(headline: string, summary: string, sentiment: number): number {
  // Calculate relevance based on keywords, sentiment, and recency
  const financialKeywords = ['earnings', 'revenue', 'profit', 'loss', 'market', 'economy', 'inflation', 'interest', 'rate', 'fed', 'trading'];
  const keywordMatches = financialKeywords.filter(keyword => 
    headline.toLowerCase().includes(keyword) || summary.toLowerCase().includes(keyword)
  ).length;
  
  const sentimentScore = Math.abs(sentiment || 0);
  const keywordScore = keywordMatches / financialKeywords.length;
  
  return Math.min(1, (keywordScore * 0.6) + (sentimentScore * 0.4));
}

private calculateEconomicRelevance(impact: string, country: string): number {
  const impactScores = { 'high': 1.0, 'medium': 0.7, 'low': 0.4 };
  const countryScores = { 'US': 1.0, 'EU': 0.8, 'GB': 0.8, 'JP': 0.7, 'CN': 0.7 };
  
  const impactScore = impactScores[impact as keyof typeof impactScores] || 0.5;
  const countryScore = countryScores[country as keyof typeof countryScores] || 0.5;
  
  return impactScore * countryScore;
}

private calculateMarketRelevance(symbol: string, changePercent: number): number {
  // Higher relevance for significant market movements
  const absChange = Math.abs(changePercent || 0);
  return Math.min(1, absChange / 10); // Normalize to 0-1 scale
}
}
```

### **2. Market News Synthesizer**

```typescript
// src/market-news/synthesizer.ts
export interface MarketNewsContext {
  id: string;
  contextText: string;
  dataSources: string[];
  keyEvents: string[];
  lastUpdate: Date;
  tier: UserTier;
}

export class MarketNewsSynthesizer {
  private openai: OpenAI;
  
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  
  async synthesizeMarketContext(
    rawData: MarketNewsData[], 
    tier: UserTier
  ): Promise<MarketNewsContext> {
    
    // Filter data based on tier access
    const tierData = this.filterDataForTier(rawData, tier);
    
    // Create synthesis prompt
    const prompt = this.buildSynthesisPrompt(tierData, tier);
    
    // Generate AI synthesis
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1500
    });
    
    const contextText = response.choices[0].message.content || '';
    
    // Extract key events and sources
    const keyEvents = this.extractKeyEvents(tierData);
    const dataSources = [...new Set(tierData.map(d => d.source))];
    
    return {
      id: crypto.randomUUID(),
      contextText,
      dataSources,
      keyEvents,
      lastUpdate: new Date(),
      tier
    };
  }
  
  private buildSynthesisPrompt(data: MarketNewsData[], tier: UserTier): string {
    const tierContext = this.getTierContext(tier);
    
    return `You are a financial market analyst. Synthesize the following market data into a clear, actionable market context summary.

TIER CONTEXT: ${tierContext}

AVAILABLE DATA:
${data.map(d => `- ${d.source}: ${JSON.stringify(d.data)}`).join('\n')}

INSTRUCTIONS:
- Create a concise but comprehensive market summary (max 800 words)
- Focus on the most relevant and impactful market developments
- Include specific numbers, rates, and trends where available
- Highlight any significant changes or emerging patterns
- Use clear, professional language suitable for financial advice
- Structure the summary with clear sections (Economic Indicators, Market Trends, Key Developments)
- Avoid speculation - stick to factual information from the data

OUTPUT FORMAT:
ECONOMIC INDICATORS:
[Summary of economic data]

MARKET TRENDS:
[Current market trends and movements]

KEY DEVELOPMENTS:
[Most important recent developments]

MARKET OUTLOOK:
[Brief outlook based on current data]`;
  }
  
  private getTierContext(tier: UserTier): string {
    switch (tier) {
      case UserTier.STARTER:
        return 'No market context available - focus on personal financial analysis';
      case UserTier.STANDARD:
        return 'Basic economic indicators and general market trends from FRED and web search';
      case UserTier.PREMIUM:
        return 'Comprehensive market intelligence including real-time data, professional news, sentiment analysis, and detailed market analysis from Finnhub';
      default:
        return 'Standard market context';
    }
  }
}
```

### **3. Market News Manager**

```typescript
// src/market-news/manager.ts
export class MarketNewsManager {
  private aggregator: MarketNewsAggregator;
  private synthesizer: MarketNewsSynthesizer;
  private emailService: MarketNewsEmailService;
  private prisma: PrismaClient;
  
  constructor() {
    this.aggregator = new MarketNewsAggregator();
    this.synthesizer = new MarketNewsSynthesizer();
    this.emailService = new MarketNewsEmailService();
    this.prisma = new PrismaClient();
  }
  
  async updateMarketContext(tier: UserTier): Promise<void> {
    try {
      // Aggregate fresh market data
      const rawData = await this.aggregator.aggregateMarketData();
      
      // Synthesize into context
      const context = await this.synthesizer.synthesizeMarketContext(rawData, tier);
      
      // Save to database
      await this.saveMarketContext(context, rawData);
      
      console.log(`Market context updated for tier: ${tier}`);
    } catch (error) {
      console.error('Error updating market context:', error);
    }
  }
  
  async getMarketContext(tier: UserTier): Promise<string> {
    const context = await this.prisma.marketNewsContext.findFirst({
      where: {
        availableTiers: { has: tier },
        isActive: true
      },
      orderBy: { lastUpdate: 'desc' }
    });
    
    return context?.contextText || '';
  }
  
  async updateMarketContextManual(
    tier: UserTier, 
    newContext: string, 
    adminUser: string
  ): Promise<void> {
    // Create or update context with manual override
    await this.prisma.marketNewsContext.upsert({
      where: {
        availableTiers_tier: { availableTiers: [tier], tier }
      },
      update: {
        contextText: newContext,
        manualOverride: true,
        lastEditedBy: adminUser,
        lastUpdate: new Date()
      },
      create: {
        contextText: newContext,
        availableTiers: [tier],
        manualOverride: true,
        lastEditedBy: adminUser
      }
    });
    
    // Log to history
    await this.logContextChange(tier, newContext, 'manual_edit', adminUser);
  }
  
  async sendDailyEmailSummaries(): Promise<void> {
    try {
      const subscribers = await this.prisma.marketNewsEmailPreference.findMany({
        where: {
          isSubscribed: true,
          isActive: true,
          emailFrequency: 'daily'
        },
        include: {
          user: true
        }
      });
      
      for (const subscriber of subscribers) {
        try {
          const context = await this.getMarketContext(subscriber.tier as UserTier);
          if (context) {
            await this.emailService.sendDailyMarketNewsEmail(
              subscriber.user.email,
              context,
              subscriber.tier,
              subscriber.user.id
            );
            
            // Update subscriber stats
            await this.prisma.marketNewsEmailPreference.update({
              where: { id: subscriber.id },
              data: {
                lastSentAt: new Date(),
                totalSent: { increment: 1 }
              }
            });
          }
        } catch (error) {
          console.error(`Error sending email to ${subscriber.user.email}:`, error);
        }
      }
      
      console.log(`Sent daily market news emails to ${subscribers.length} subscribers`);
    } catch (error) {
      console.error('Error sending daily email summaries:', error);
    }
  }
  
  async updateUserEmailPreferences(
    userId: string,
    preferences: {
      isSubscribed: boolean;
      emailFrequency?: string;
      preferredTime?: string;
      tier?: string;
    }
  ): Promise<void> {
    await this.prisma.marketNewsEmailPreference.upsert({
      where: { userId },
      update: preferences,
      create: {
        userId,
        ...preferences
      }
    });
  }
  
  async getUserEmailPreferences(userId: string): Promise<any> {
    return await this.prisma.marketNewsEmailPreference.findUnique({
      where: { userId }
    });
  }
  
  private async saveMarketContext(
    context: MarketNewsContext, 
    rawData: MarketNewsData[]
  ): Promise<void> {
    await this.prisma.marketNewsContext.upsert({
      where: {
        availableTiers_tier: { 
          availableTiers: [context.tier], 
          tier: context.tier 
        }
      },
      update: {
        contextText: context.contextText,
        dataSources: context.dataSources,
        keyEvents: context.keyEvents,
        rawData: rawData,
        lastUpdate: new Date(),
        manualOverride: false
      },
      create: {
        contextText: context.contextText,
        dataSources: context.dataSources,
        keyEvents: context.keyEvents,
        rawData: rawData,
        availableTiers: [context.tier]
      }
    });
  }
  
  private async logContextChange(
    tier: UserTier,
    contextText: string,
    changeType: string,
    changedBy?: string
  ): Promise<void> {
    await this.prisma.marketNewsHistory.create({
      data: {
        contextId: 'temp', // Will be updated after context creation
        contextText,
        dataSources: [],
        keyEvents: [],
        changeType,
        changedBy
      }
    });
  }
}
```

### **4. Market News Email Service**

```typescript
// src/market-news/email-service.ts
export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class MarketNewsEmailService {
  private emailProvider: any; // Your existing email service
  
  constructor() {
    // Initialize with your existing email service (Nodemailer, SendGrid, etc.)
    this.emailProvider = this.initializeEmailProvider();
  }
  
  async sendDailyMarketNewsEmail(
    userEmail: string,
    contextText: string,
    tier: string,
    userId: string
  ): Promise<void> {
    const template = this.generateEmailTemplate(contextText, tier);
    
    try {
      await this.emailProvider.sendMail({
        to: userEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      });
      
      // Log successful email
      await this.logEmailSent(userId, template.subject, contextText, tier);
      
    } catch (error) {
      // Log failed email
      await this.logEmailError(userId, template.subject, error.message);
      throw error;
    }
  }
  
  private generateEmailTemplate(contextText: string, tier: string): EmailTemplate {
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const tierDisplay = tier.charAt(0).toUpperCase() + tier.slice(1);
    
    const subject = `📰 Your Daily Market News Summary - ${date}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Daily Market News Summary</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                   color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .tier-badge { background: #28a745; color: white; padding: 5px 15px; 
                       border-radius: 20px; font-size: 12px; display: inline-block; }
          .section { margin: 20px 0; }
          .section h3 { color: #2c3e50; border-bottom: 2px solid #3498db; 
                       padding-bottom: 10px; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; 
                   border-top: 1px solid #ddd; color: #666; font-size: 12px; }
          .cta-button { background: #3498db; color: white; padding: 12px 25px; 
                       text-decoration: none; border-radius: 5px; display: inline-block; 
                       margin: 20px 0; }
          .unsubscribe { color: #666; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📰 Daily Market News Summary</h1>
            <p>${date}</p>
            <span class="tier-badge">${tierDisplay} Tier</span>
          </div>
          
          <div class="content">
            <div class="section">
              <h3>🎯 Today's Market Intelligence</h3>
              <div style="white-space: pre-wrap; line-height: 1.8;">
                ${contextText}
              </div>
            </div>
            
            <div class="section">
              <h3>💡 How This Affects You</h3>
              <p>This market intelligence helps you make informed financial decisions. 
              Consider how these developments might impact your investments, savings, 
              and financial planning strategies.</p>
            </div>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/app" class="cta-button">
                💬 Ask Linc About This
              </a>
            </div>
          </div>
          
          <div class="footer">
            <p>This email was sent to you because you subscribed to daily market news summaries.</p>
            <p class="unsubscribe">
              <a href="${process.env.FRONTEND_URL}/app/profile?tab=email-preferences">Manage Email Preferences</a> | 
              <a href="${process.env.FRONTEND_URL}/app/unsubscribe?type=market-news">Unsubscribe</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const text = `
Daily Market News Summary - ${date}
${tierDisplay} Tier

TODAY'S MARKET INTELLIGENCE:
${contextText}

HOW THIS AFFECTS YOU:
This market intelligence helps you make informed financial decisions. Consider how these developments might impact your investments, savings, and financial planning strategies.

ASK LINC ABOUT THIS:
${process.env.FRONTEND_URL}/app

MANAGE PREFERENCES:
${process.env.FRONTEND_URL}/app/profile?tab=email-preferences

UNSUBSCRIBE:
${process.env.FRONTEND_URL}/app/unsubscribe?type=market-news
    `;
    
    return { subject, html, text };
  }
  
  private async logEmailSent(
    userId: string, 
    subject: string, 
    contextText: string, 
    tier: string
  ): Promise<void> {
    await this.prisma.marketNewsEmailLog.create({
      data: {
        userId,
        subject,
        contextText,
        tier,
        delivered: true
      }
    });
  }
  
  private async logEmailError(
    userId: string, 
    subject: string, 
    errorMessage: string
  ): Promise<void> {
    await this.prisma.marketNewsEmailLog.create({
      data: {
        userId,
        subject,
        contextText: '',
        tier: '',
        delivered: false,
        errorMessage
      }
    });
  }
  
  private initializeEmailProvider(): any {
    // Use your existing email service configuration
    // This should integrate with your current email setup
    return require('nodemailer').createTransporter({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }
}
```

## **Environment Variables**

Add the following environment variables to your `.env` file:

```bash
# Finnhub API Configuration
FINNHUB_API_KEY=your_finnhub_api_key
FINNHUB_API_KEY_REAL=your_production_finnhub_api_key

# Existing API Keys (keep for fallback)
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
ALPHA_VANTAGE_API_KEY_REAL=your_production_alpha_vantage_key
FRED_API_KEY=your_fred_key
FRED_API_KEY_REAL=your_production_fred_key
```

## **API Endpoints**

### **Backend Endpoints**

```typescript
// src/index.ts - Add to existing routes

// Get current market context for a tier
app.get('/market-news/context/:tier', async (req: Request, res: Response) => {
  try {
    const { tier } = req.params;
    const manager = new MarketNewsManager();
    const context = await manager.getMarketContext(tier as UserTier);
    
    res.json({ context });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch market context' });
  }
});

// Admin: Update market context manually
app.put('/admin/market-news/context/:tier', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tier } = req.params;
    const { contextText } = req.body;
    const adminUser = req.user?.email || 'unknown';
    
    const manager = new MarketNewsManager();
    await manager.updateMarketContextManual(tier as UserTier, contextText, adminUser);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update market context' });
  }
});

// Admin: Get market context history
app.get('/admin/market-news/history/:tier', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tier } = req.params;
    const history = await prisma.marketNewsHistory.findMany({
      where: {
        context: {
          availableTiers: { has: tier }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch market context history' });
  }
});

// Admin: Force refresh market context
app.post('/admin/market-news/refresh/:tier', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tier } = req.params;
    const manager = new MarketNewsManager();
    await manager.updateMarketContext(tier as UserTier);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh market context' });
  }
});

// User: Get email preferences
app.get('/market-news/email-preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const manager = new MarketNewsManager();
    const preferences = await manager.getUserEmailPreferences(userId);
    
    res.json({ preferences });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch email preferences' });
  }
});

// User: Update email preferences
app.put('/market-news/email-preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const preferences = req.body;
    const manager = new MarketNewsManager();
    
    await manager.updateUserEmailPreferences(userId, preferences);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update email preferences' });
  }
});

// Admin: Send daily email summaries (manual trigger)
app.post('/admin/market-news/send-daily-emails', requireAuth, async (req: Request, res: Response) => {
  try {
    const manager = new MarketNewsManager();
    await manager.sendDailyEmailSummaries();
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send daily emails' });
  }
});

// Admin: Get email statistics
app.get('/admin/market-news/email-stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const stats = await prisma.marketNewsEmailPreference.aggregate({
      _count: { id: true },
      _sum: { totalSent: true }
    });
    
    const recentEmails = await prisma.marketNewsEmailLog.findMany({
      orderBy: { sentAt: 'desc' },
      take: 10,
      include: {
        user: {
          select: { email: true }
        }
      }
    });
    
    res.json({ stats, recentEmails });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch email statistics' });
  }
});
```

## **Frontend Integration**

### **Admin Dashboard Enhancement**

```typescript
// frontend/src/app/admin/page.tsx - Add new tab

interface MarketNewsContext {
  id: string;
  contextText: string;
  dataSources: string[];
  keyEvents: string[];
  lastUpdate: string;
  tier: string;
  isActive: boolean;
  manualOverride: boolean;
  lastEditedBy?: string;
}

// Add to existing AdminPage component
const [activeTab, setActiveTab] = useState<'demo' | 'production' | 'users' | 'market-news'>('demo');
const [marketNewsContexts, setMarketNewsContexts] = useState<MarketNewsContext[]>([]);
const [editingContext, setEditingContext] = useState<string | null>(null);
const [editingText, setEditingText] = useState<string>('');

// Add market news tab rendering
const renderMarketNewsTab = () => (
  <div className="space-y-6">
    <div className="flex justify-between items-center">
      <h2 className="text-xl font-semibold text-white">Market News Context</h2>
      <div className="flex space-x-2">
        <button
          onClick={() => refreshAllContexts()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Refresh All
        </button>
        <button
          onClick={() => sendDailyEmails()}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Send Daily Emails
        </button>
      </div>
    </div>
    
    {/* Email Statistics */}
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Email Statistics</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-700 p-4 rounded">
          <div className="text-2xl font-bold text-green-400">{emailStats?.subscribers || 0}</div>
          <div className="text-sm text-gray-400">Active Subscribers</div>
        </div>
        <div className="bg-gray-700 p-4 rounded">
          <div className="text-2xl font-bold text-blue-400">{emailStats?.totalSent || 0}</div>
          <div className="text-sm text-gray-400">Total Emails Sent</div>
        </div>
        <div className="bg-gray-700 p-4 rounded">
          <div className="text-2xl font-bold text-yellow-400">{emailStats?.recentEmails?.length || 0}</div>
          <div className="text-sm text-gray-400">Recent Emails</div>
        </div>
      </div>
    </div>
    
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {['starter', 'standard', 'premium'].map(tier => (
        <div key={tier} className="bg-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white capitalize">{tier} Tier</h3>
            <div className="flex space-x-2">
              <button
                onClick={() => refreshContext(tier)}
                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
              >
                Refresh
              </button>
              <button
                onClick={() => editContext(tier)}
                className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
              >
                Edit
              </button>
            </div>
          </div>
          
          {editingContext === tier ? (
            <div>
              <textarea
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                className="w-full h-64 p-3 bg-gray-700 text-white rounded border border-gray-600"
                placeholder="Enter market context..."
              />
              <div className="mt-3 flex space-x-2">
                <button
                  onClick={() => saveContext(tier)}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Save
                </button>
                <button
                  onClick={() => cancelEdit()}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-sm text-gray-400 mb-2">
                Last updated: {formatDate(context?.lastUpdate || '')}
                {context?.manualOverride && (
                  <span className="ml-2 text-yellow-400">(Manual Override)</span>
                )}
              </div>
              <div className="text-gray-300 whitespace-pre-wrap text-sm max-h-64 overflow-y-auto">
                {context?.contextText || 'No context available'}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
);

// Add helper functions
const refreshContext = async (tier: string) => {
  try {
    const response = await fetch(`${API_URL}/admin/market-news/refresh/${tier}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (response.ok) {
      loadMarketNewsContexts();
    }
  } catch (error) {
    console.error('Error refreshing context:', error);
  }
};

const editContext = (tier: string) => {
  const context = marketNewsContexts.find(c => c.tier === tier);
  setEditingContext(tier);
  setEditingText(context?.contextText || '');
};

const saveContext = async (tier: string) => {
  try {
    const response = await fetch(`${API_URL}/admin/market-news/context/${tier}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contextText: editingText })
    });
    if (response.ok) {
      setEditingContext(null);
      setEditingText('');
      loadMarketNewsContexts();
    }
  } catch (error) {
    console.error('Error saving context:', error);
  }
};

const cancelEdit = () => {
  setEditingContext(null);
  setEditingText('');
};

const sendDailyEmails = async () => {
  try {
    const response = await fetch(`${API_URL}/admin/market-news/send-daily-emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (response.ok) {
      alert('Daily emails sent successfully!');
      loadEmailStats();
    }
  } catch (error) {
    console.error('Error sending daily emails:', error);
  }
};

const loadEmailStats = async () => {
  try {
    const response = await fetch(`${API_URL}/admin/market-news/email-stats`);
    if (response.ok) {
      const data = await response.json();
      setEmailStats({
        subscribers: data.stats._count.id,
        totalSent: data.stats._sum.totalSent,
        recentEmails: data.recentEmails
      });
    }
  } catch (error) {
    console.error('Error loading email stats:', error);
  }
};
```

### **Enhanced OpenAI Integration**

```typescript
// src/openai.ts - Enhance existing function

export async function askOpenAIWithEnhancedContext(
  question: string,
  conversationHistory: Conversation[] = [],
  userTier: UserTier = UserTier.STARTER,
  isDemo: boolean = false,
  userId?: string,
  model?: string
): Promise<string> {
  
  // ... existing code ...
  
  // Get market news context
  let marketNewsContext: string = '';
  if (!isDemo) {
    try {
      const manager = new MarketNewsManager();
      marketNewsContext = await manager.getMarketContext(userTier);
    } catch (error) {
      console.error('Error fetching market news context:', error);
    }
  }
  
  // Build enhanced system prompt with market news context
  const systemPrompt = buildEnhancedSystemPromptWithMarketNews(
    tierContext,
    accountSummary,
    transactionSummary,
    marketContextSummary,
    searchContext,
    userProfile,
    marketNewsContext
  );
  
  // ... rest of function ...
}

function buildEnhancedSystemPromptWithMarketNews(
  tierContext: TierAwareContext,
  accountSummary: string,
  transactionSummary: string,
  marketContextSummary: string,
  searchContext: string,
  userProfile: string,
  marketNewsContext: string
): string {
  
  let marketNewsSection = '';
  if (marketNewsContext && marketNewsContext.trim()) {
    marketNewsSection = `
CURRENT MARKET NEWS CONTEXT:
${marketNewsContext}

Use this market news context to provide more timely and relevant financial advice.
Consider current market conditions, trends, and developments when making recommendations.
When available, incorporate market sentiment analysis from Finnhub data.
`;
  }
  
  return `
You are Linc, an AI-powered financial analyst.

${marketNewsSection}

USER TIER: ${tierContext.tierInfo.currentTier.toUpperCase()}

AVAILABLE DATA SOURCES:
${tierContext.tierInfo.availableSources.map(source => `• ${source}`).join('\n')}

ACCOUNT SUMMARY:
${accountSummary}

TRANSACTION SUMMARY:
${transactionSummary}

MARKET CONTEXT:
${marketContextSummary}

${userProfile ? `USER PROFILE:\n${userProfile}\n` : ''}

INSTRUCTIONS:
- Provide personalized financial advice based on current market conditions
- Consider the latest market news and trends in your recommendations
- When available, reference market sentiment from Finnhub data
- When relevant, mention upgrade benefits for unavailable features
- Focus on actionable, specific recommendations tailored to current market environment
- Premium tier users get comprehensive market intelligence including sentiment analysis
`;
}
```

### **User Email Preferences Interface**

```typescript
// frontend/src/components/EmailPreferences.tsx
interface EmailPreferencesProps {
  userId: string;
  userTier: string;
}

export default function EmailPreferences({ userId, userTier }: EmailPreferencesProps) {
  const [preferences, setPreferences] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  useEffect(() => {
    loadPreferences();
  }, [userId]);
  
  const loadPreferences = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/market-news/email-preferences');
      const data = await response.json();
      setPreferences(data.preferences || {
        isSubscribed: false,
        emailFrequency: 'daily',
        preferredTime: '09:00',
        tier: userTier
      });
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const savePreferences = async (newPreferences: any) => {
    setSaving(true);
    try {
      const response = await fetch('/api/market-news/email-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPreferences)
      });
      
      if (response.ok) {
        setPreferences(newPreferences);
        alert('Email preferences updated successfully!');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      alert('Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) return <div>Loading preferences...</div>;
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Market News Email Preferences</h3>
      
      <div className="space-y-4">
        {/* Subscription Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">Daily Market News Emails</h4>
            <p className="text-sm text-gray-600">
              Receive daily summaries of market developments and financial insights
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={preferences?.isSubscribed || false}
              onChange={(e) => savePreferences({
                ...preferences,
                isSubscribed: e.target.checked
              })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
        
        {preferences?.isSubscribed && (
          <>
            {/* Email Frequency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Frequency
              </label>
              <select
                value={preferences?.emailFrequency || 'daily'}
                onChange={(e) => savePreferences({
                  ...preferences,
                  emailFrequency: e.target.value
                })}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="never">Never</option>
              </select>
            </div>
            
            {/* Preferred Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Preferred Time
              </label>
              <input
                type="time"
                value={preferences?.preferredTime || '09:00'}
                onChange={(e) => savePreferences({
                  ...preferences,
                  preferredTime: e.target.value
                })}
                className="w-full p-2 border border-gray-300 rounded-md"
              />
            </div>
            
            {/* Content Tier */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Content Tier
              </label>
              <select
                value={preferences?.tier || userTier}
                onChange={(e) => savePreferences({
                  ...preferences,
                  tier: e.target.value
                })}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="starter">Starter</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Choose which tier's market context you want to receive
              </p>
            </div>
          </>
        )}
        
        {saving && (
          <div className="text-sm text-blue-600">Saving preferences...</div>
        )}
      </div>
    </div>
  );
}
```

## **Scheduled Updates**

### **Cron Job Integration**

```typescript
// src/index.ts - Add to existing cron jobs

// Update market news context every 2 hours
cron.schedule('0 */2 * * *', async () => {
  console.log('🔄 Starting market news context refresh...');
  
  const manager = new MarketNewsManager();
  
  // Update for all tiers
  await Promise.all([
    manager.updateMarketContext(UserTier.STARTER),
    manager.updateMarketContext(UserTier.STANDARD),
    manager.updateMarketContext(UserTier.PREMIUM)
  ]);
  
  console.log('✅ Market news context refresh completed');
}, {
  timezone: 'America/New_York',
  name: 'market-news-refresh'
});

// Send daily market news emails at 9:00 AM EST
cron.schedule('0 9 * * *', async () => {
  console.log('📧 Starting daily market news email distribution...');
  
  const manager = new MarketNewsManager();
  await manager.sendDailyEmailSummaries();
  
  console.log('✅ Daily market news emails sent');
}, {
  timezone: 'America/New_York',
  name: 'market-news-daily-emails'
});
```

## **Tier-Based Access Control**

### **Market News Access by Tier**

| Tier | Market News Access | Features |
|------|-------------------|----------|
| **Starter** | ❌ None | Basic financial analysis only |
| **Standard** | ✅ Basic market context | Economic indicators and general trends |
| **Premium** | ✅ Full market intelligence | Comprehensive market news, trends, and detailed analysis |

### **Implementation**

```typescript
// src/market-news/manager.ts

private filterDataForTier(data: MarketNewsData[], tier: UserTier): MarketNewsData[] {
  switch (tier) {
    case UserTier.STARTER:
      return []; // No market news for starter tier
      
    case UserTier.STANDARD:
      return data.filter(d => 
        d.source === 'fred' || 
        d.source === 'brave_search'
      );
      
    case UserTier.PREMIUM:
      return data; // Full access to all data including complete Finnhub suite
      
    default:
      return [];
  }
}
```

## **Testing Strategy**

### **Unit Tests**

```typescript
// src/__tests__/unit/market-news.test.ts

describe('Market News System', () => {
  test('should aggregate data from multiple sources', async () => {
    const aggregator = new MarketNewsAggregator();
    const data = await aggregator.aggregateMarketData();
    
    expect(data.length).toBeGreaterThan(0);
    expect(data.some(d => d.source === 'fred')).toBe(true);
  });
  
  test('should synthesize context for different tiers', async () => {
    const synthesizer = new MarketNewsSynthesizer();
    const mockData = [/* mock market data */];
    
    const starterContext = await synthesizer.synthesizeMarketContext(mockData, UserTier.STARTER);
    const premiumContext = await synthesizer.synthesizeMarketContext(mockData, UserTier.PREMIUM);
    
    expect(starterContext.contextText).toBe('');
    expect(premiumContext.contextText.length).toBeGreaterThan(0);
  });
});
```

### **Integration Tests**

```typescript
// src/__tests__/integration/market-news-integration.test.ts

describe('Market News Integration', () => {
  test('should update market context via API', async () => {
    const response = await request(app)
      .post('/admin/market-news/refresh/standard')
      .set('Authorization', `Bearer ${adminToken}`);
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
  
  test('should get market context for tier', async () => {
    const response = await request(app)
      .get('/market-news/context/premium');
    
    expect(response.status).toBe(200);
    expect(response.body.context).toBeDefined();
  });
});
```

## **Enhanced Tier Differentiation Strategy**

### **Clear Value Proposition by Tier**

#### **Starter Tier - Core Financial Analysis**
- **No market context**: Focus purely on personal financial analysis
- **Basic AI responses**: General financial advice without market considerations
- **Value**: Essential financial guidance for basic needs
- **Upgrade incentive**: "Get market-aware advice with Standard tier"

#### **Standard Tier - Basic Market Awareness**
- **Data sources**: FRED (economic indicators) + Brave Search (general news)
- **Features**: Basic economic trends and general market awareness
- **AI responses**: Market-aware but limited to basic economic data
- **Value**: Basic market context for informed decisions
- **Upgrade incentive**: "Get professional-grade market intelligence with Premium tier"

#### **Premium Tier - Professional Market Intelligence**
- **Data sources**: Complete Finnhub platform access
- **Features**: 
  - Real-time stock data from 60+ exchanges
  - Professional news from Reuters, Bloomberg, and 60+ sources
  - Economic calendar and events
  - Company fundamentals and earnings data
  - Built-in sentiment analysis
  - Forex and crypto market data
- **AI responses**: Market-aware recommendations with sentiment analysis
- **Email summaries**: Rich market context with professional insights
- **Value**: Professional-grade market intelligence for serious investors

### **Finnhub Integration Advantages**

### **1. Enhanced Data Quality**
- **Professional Sources**: News from Reuters, Bloomberg, and 60+ professional financial sources
- **Real-time Data**: Live market data from 60+ exchanges worldwide
- **Sentiment Analysis**: Built-in sentiment scoring for news articles
- **Economic Calendar**: Upcoming economic events and their expected impact
- **Company Fundamentals**: Earnings, revenue, and financial metrics

### **2. Simplified Architecture**
- **Single API**: One integration instead of managing multiple data sources
- **Structured Data**: Consistent format across all data types
- **Better Error Handling**: More reliable API with comprehensive error responses
- **Rate Limiting**: Clear rate limits and usage tracking

### **3. Enhanced AI Synthesis**
- **Sentiment Integration**: AI can incorporate market sentiment into recommendations
- **Richer Context**: More comprehensive market intelligence for better advice
- **Tier Differentiation**: Clear distinction between starter, standard, and premium access
- **Real-time Updates**: Market context reflects current conditions

### **4. Improved Email Content**
- **Market Sentiment**: Include sentiment scores in daily summaries
- **Economic Events**: Highlight upcoming economic calendar events
- **Market Movements**: Real-time index performance and trends
- **Professional Quality**: Higher quality content from professional sources

## **Benefits**

### **For Users**

#### **Starter Tier**
- **Core Financial Analysis**: Essential financial guidance without market distractions
- **Simple Interface**: Focus on personal financial management
- **Clear Upgrade Path**: Easy transition to market-aware advice

#### **Standard Tier**
- **Basic Market Awareness**: Economic indicators and general market trends
- **Informed Decisions**: Market context for better financial choices
- **FRED Integration**: Reliable economic data from Federal Reserve
- **Web Search Context**: General financial news and trends

#### **Premium Tier**
- **Professional Market Intelligence**: Real-time data from 60+ exchanges
- **Sentiment Analysis**: Market sentiment incorporated into AI recommendations
- **Professional News**: Reuters, Bloomberg, and 60+ professional sources
- **Economic Calendar**: Upcoming events and their market impact
- **Company Fundamentals**: Earnings, revenue, and financial metrics
- **Enhanced Email Summaries**: Rich market context with professional insights
- **Real-time Updates**: Market context reflects current conditions

### **For Business**

- **Clear Tier Differentiation**: Strong value proposition for each tier upgrade
- **Premium Justification**: Professional-grade market intelligence justifies higher pricing
- **Upgrade Incentives**: Clear path from Starter → Standard → Premium
- **Competitive Advantage**: Finnhub integration provides professional-grade data
- **Revenue Optimization**: Premium tier becomes significantly more valuable
- **User Engagement**: Market-aware responses increase user interaction
- **Email Marketing**: Rich market content drives engagement and retention
- **Lead Generation**: Professional market intelligence attracts serious investors

### **Technical Benefits**

- **Scalable Architecture**: Modular design for easy expansion
- **Performance Optimized**: Caching and scheduled updates reduce API calls
- **Admin Control**: Manual override capability for quality control
- **Audit Trail**: Complete history of market context changes
- **Tier Integration**: Seamless integration with existing tier system
- **Email Infrastructure**: Reusable email service for other platform features
- **Email Tracking**: Comprehensive logging and analytics for email performance
- **User Preferences**: Flexible email preference management system

## **Success Metrics**

- **Response Quality**: Improved relevance and timeliness of AI responses
- **User Engagement**: Increased conversation frequency for premium users
- **Tier Upgrades**: Higher conversion to premium tier
- **Admin Efficiency**: Reduced manual intervention needed
- **System Performance**: Fast context retrieval and updates
- **Email Engagement**: Open rates, click rates, and subscription retention
- **User Retention**: Increased user retention through daily engagement
- **Platform Usage**: Higher daily active users due to email-driven engagement

## **Implementation Steps**

### **Phase 1: Tier-Specific Data Source Setup**
1. **Configure tier filtering** to restrict data sources by user tier
2. **Implement Starter tier**: No market data, basic financial analysis only
3. **Implement Standard tier**: FRED + Brave Search integration
4. **Test tier access control** to ensure proper data filtering
5. **Update AI prompts** to reflect tier-specific capabilities

### **Phase 2: Premium Tier Finnhub Integration**
1. **Sign up for Finnhub API** and obtain API key
2. **Implement Finnhub data fetching** for Premium tier only
3. **Add sentiment analysis** integration for Premium users
4. **Test Premium tier features** with real Finnhub data
5. **Compare data quality** between Standard and Premium tiers

### **Phase 3: Enhanced Premium Features**
1. **Add economic calendar** integration for Premium users
2. **Implement market data** fetching for major indices
3. **Create Premium-specific email templates** with rich market content
4. **Add company fundamentals** and earnings data for Premium tier
5. **Test upgrade flow** from Standard to Premium tier

### **Phase 4: Advanced Premium Features**
1. **Implement real-time alerts** for significant market events
2. **Add personalized market context** based on user profiles
3. **Create historical analysis** and trend identification
4. **Optimize performance** and caching for Premium tier
5. **Add advanced analytics** and market predictions

## **Future Enhancements**

1. **Advanced Sentiment Analysis**: Enhanced sentiment modeling with machine learning
2. **Personalized Context**: Tailor market news to user's financial profile and holdings
3. **Real-Time Alerts**: Push notifications for significant market events
4. **Historical Analysis**: Include trend analysis and historical context
5. **Multi-Language**: Support for international market news
6. **Advanced Analytics**: Market prediction and scenario modeling
7. **Email Personalization**: Customize email content based on user's financial profile
8. **Email A/B Testing**: Test different email formats and content
9. **Email Analytics**: Track open rates, click rates, and engagement metrics
10. **Smart Scheduling**: Adjust email timing based on user timezone and preferences
11. **Finnhub Webhooks**: Real-time data updates via webhooks
12. **Custom Market Indices**: Create personalized market indices for users
13. **Sector-Specific Analysis**: Focus on user's specific investment sectors
14. **Earnings Calendar Integration**: Highlight upcoming earnings for user's holdings
15. **Market Correlation Analysis**: Show how different assets correlate with market movements

---

*This specification provides a comprehensive framework for implementing a Financial Market News Context System that enhances AI responses with real-time market intelligence while maintaining the existing tier-based access control and admin management capabilities.* 