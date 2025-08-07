# 📧 **Daily Market News Email System**

## **Concept Overview**

A comprehensive email notification system that delivers personalized daily market news summaries to users based on their subscription tier and preferences. This system enhances user engagement by providing timely market intelligence directly to users' inboxes, driving platform usage and retention.

## **Core Objectives**

1. **Personalized Email Delivery**: Send tier-specific market news summaries to subscribed users
2. **Flexible User Preferences**: Allow users to customize email frequency, timing, and content tier
3. **Professional Email Templates**: Beautiful, responsive email designs with clear call-to-action
4. **Comprehensive Tracking**: Monitor email delivery, open rates, and user engagement
5. **Admin Management**: Provide admin tools for email management and analytics
6. **Integration with Market Context**: Leverage existing market news context system

## **Database Schema**

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

## **System Architecture**

### **1. Market News Email Service**

```typescript
// src/market-news/email-service.ts
export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class MarketNewsEmailService {
  private emailProvider: any; // Your existing email service
  private prisma: PrismaClient;
  
  constructor() {
    // Initialize with your existing email service (Nodemailer, SendGrid, etc.)
    this.emailProvider = this.initializeEmailProvider();
    this.prisma = new PrismaClient();
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

### **2. Enhanced Market News Manager**

```typescript
// src/market-news/manager.ts - Add email functionality

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
  
  // ... existing methods ...
  
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
}
```

## **API Endpoints**

### **Backend Endpoints**

```typescript
// src/index.ts - Add email-related endpoints

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
// frontend/src/app/admin/page.tsx - Add email management to market news tab

// Add to existing AdminPage component
const [emailStats, setEmailStats] = useState<any>(null);

// Add email statistics section to market news tab
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
    
    {/* Existing context management UI */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* ... existing tier context management ... */}
    </div>
  </div>
);

// Add helper functions
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
// src/index.ts - Add email scheduling

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

## **Tier-Based Email Content**

### **Email Content by Tier**

| Tier | Email Content | Features |
|------|---------------|----------|
| **Starter** | ❌ No emails | Basic financial analysis only |
| **Standard** | ✅ Basic market context | Economic indicators and general trends |
| **Premium** | ✅ Full market intelligence | Comprehensive market news, trends, and detailed analysis |

### **Premium Tier Email Enhancements**

- **Market Sentiment**: Include sentiment scores in daily summaries
- **Economic Events**: Highlight upcoming economic calendar events
- **Market Movements**: Real-time index performance and trends
- **Professional Quality**: Higher quality content from professional sources

## **Benefits**

### **For Users**

#### **Starter Tier**
- **No Email Distractions**: Focus purely on personal financial analysis
- **Clear Upgrade Path**: Easy transition to market-aware email content

#### **Standard Tier**
- **Basic Market Awareness**: Economic indicators and general market trends via email
- **Informed Decisions**: Market context delivered to inbox for better financial choices
- **FRED Integration**: Reliable economic data from Federal Reserve in email format

#### **Premium Tier**
- **Professional Market Intelligence**: Real-time data from 60+ exchanges via email
- **Sentiment Analysis**: Market sentiment incorporated into email content
- **Professional News**: Reuters, Bloomberg, and 60+ professional sources in email
- **Economic Calendar**: Upcoming events and their market impact in email
- **Company Fundamentals**: Earnings, revenue, and financial metrics in email
- **Enhanced Email Content**: Rich market context with professional insights

### **For Business**

- **User Engagement**: Daily email content drives platform usage and retention
- **Email Marketing**: Rich market content drives engagement and retention
- **Lead Generation**: Professional market intelligence attracts serious investors
- **Revenue Optimization**: Premium tier becomes significantly more valuable with email content
- **User Retention**: Increased user retention through daily engagement
- **Platform Usage**: Higher daily active users due to email-driven engagement

### **Technical Benefits**

- **Email Infrastructure**: Reusable email service for other platform features
- **Email Tracking**: Comprehensive logging and analytics for email performance
- **User Preferences**: Flexible email preference management system
- **Admin Control**: Manual email triggering and analytics dashboard
- **Scalable Architecture**: Modular design for easy expansion

## **Success Metrics**

- **Email Engagement**: Open rates, click rates, and subscription retention
- **User Retention**: Increased user retention through daily engagement
- **Platform Usage**: Higher daily active users due to email-driven engagement
- **Tier Upgrades**: Higher conversion to premium tier due to email content
- **Admin Efficiency**: Reduced manual intervention needed for email management

## **Implementation Steps**

### **Phase 1: Email Infrastructure Setup**
1. **Create email database tables** for preferences and logging
2. **Implement email service** with existing email provider integration
3. **Add email preference management** for users
4. **Test email delivery** with sample content
5. **Add email tracking** and analytics

### **Phase 2: Tier-Specific Email Content**
1. **Implement tier filtering** for email content based on user tier
2. **Create tier-specific email templates** with appropriate content
3. **Add Premium tier enhancements** with sentiment analysis and professional content
4. **Test email content** for different tiers
5. **Optimize email templates** for engagement

### **Phase 3: Advanced Email Features**
1. **Add email scheduling** based on user preferences
2. **Implement email analytics** and tracking
3. **Create admin email management** dashboard
4. **Add email A/B testing** capabilities
5. **Optimize email performance** and delivery rates

### **Phase 4: Email Personalization**
1. **Personalize email content** based on user's financial profile
2. **Add dynamic content** based on user's holdings and interests
3. **Implement smart scheduling** based on user timezone and preferences
4. **Add email automation** triggers based on market events
5. **Create email engagement** optimization features

## **Future Enhancements**

1. **Email Personalization**: Customize email content based on user's financial profile
2. **Email A/B Testing**: Test different email formats and content
3. **Email Analytics**: Track open rates, click rates, and engagement metrics
4. **Smart Scheduling**: Adjust email timing based on user timezone and preferences
5. **Email Automation**: Trigger emails based on significant market events
6. **Email Segmentation**: Different email content for different user segments
7. **Email Templates**: Multiple email template options for different content types
8. **Email Performance**: Optimize email delivery and engagement rates
9. **Email Compliance**: Ensure email compliance with anti-spam regulations
10. **Email Integration**: Integrate with marketing automation platforms

---

*This specification provides a comprehensive framework for implementing a Daily Market News Email System that enhances user engagement through personalized email content while maintaining the existing tier-based access control and market context integration.*
