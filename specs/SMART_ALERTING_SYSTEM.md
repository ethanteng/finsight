# 🚨 Smart Alerting System Specification

## **Overview**

The Smart Alerting System provides intelligent, proactive financial monitoring by automatically proposing relevant alerts based on user conversations and financial context. Similar to Cursor's memories system, users can confirm or reject proposed alerts, which are then automatically monitored and triggered via email notifications when conditions are met.

## **Core Concept**

### **Intelligent Alert Proposals**
After AI responses, the system intelligently suggests relevant alerts based on:
- User's financial situation and goals
- Current market conditions
- Account balances and spending patterns
- Risk factors and financial health indicators

### **User Confirmation Flow**
- **Proposal**: "Would you like an alert when X changes by Y?"
- **Confirmation**: User accepts/rejects with one click
- **Management**: Users can view and manage all alerts in their profile

### **Automatic Monitoring**
- **Background Processing**: Scheduled jobs check alert conditions
- **Real-Time Data**: Integration with market data and account balances
- **Email Notifications**: Timely alerts when thresholds are met

## **Alert Types & Examples**

### **1. Account Balance Alerts**
- **Example**: "Alert when Chase Checking drops below $1,000"
- **Use Case**: Emergency fund monitoring, overdraft prevention
- **Data Source**: Plaid account balances
- **Frequency**: Daily monitoring

### **2. Market Rate Alerts**
- **Example**: "Alert when CD rates go above 5%"
- **Use Case**: Investment opportunities, refinancing decisions
- **Data Source**: Alpha Vantage, FRED APIs
- **Frequency**: Hourly monitoring

### **3. Spending Threshold Alerts**
- **Example**: "Alert when monthly dining spending exceeds $500"
- **Use Case**: Budget monitoring, expense control
- **Data Source**: Plaid transaction categories
- **Frequency**: Daily monitoring

### **4. Income Detection Alerts**
- **Example**: "Alert when paycheck is deposited"
- **Use Case**: Income tracking, financial planning
- **Data Source**: Plaid transaction patterns
- **Frequency**: Real-time monitoring

### **5. Custom Condition Alerts**
- **Example**: "Alert when portfolio value drops 10%"
- **Use Case**: Investment risk management
- **Data Source**: Calculated from account data
- **Frequency**: Daily monitoring

## **Technical Architecture**

### **Database Schema**

#### **Alert Model**
```prisma
model Alert {
  id          String   @id @default(cuid())
  userId      String
  name        String   // Human-readable alert name
  description String?  // Optional description
  type        AlertType
  condition   String   // JSON condition configuration
  threshold   Float
  operator    String   // "above", "below", "equals", "changes_by"
  isActive    Boolean  @default(true)
  lastChecked DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  triggers    AlertTrigger[]
  
  @@index([userId, isActive])
  @@index([type, isActive])
}

model AlertTrigger {
  id          String   @id @default(cuid())
  alertId     String
  triggeredAt DateTime @default(now())
  value       Float    // Value that triggered the alert
  message     String   // Human-readable trigger message
  metadata    String?  // JSON additional context
  
  alert       Alert    @relation(fields: [alertId], references: [id], onDelete: Cascade)
  
  @@index([alertId, triggeredAt])
}

enum AlertType {
  ACCOUNT_BALANCE
  MARKET_RATE
  SPENDING_THRESHOLD
  INCOME_DETECTION
  CUSTOM_CONDITION
}
```

#### **User Model Extension**
```prisma
model User {
  // ... existing fields ...
  alerts      Alert[]
  alertSettings AlertSettings?
}

model AlertSettings {
  id                    String   @id @default(cuid())
  userId                String   @unique
  emailNotifications    Boolean  @default(true)
  notificationFrequency String   @default("immediate") // "immediate", "daily", "weekly"
  quietHours           Boolean  @default(false)
  quietHoursStart      String?  // "22:00"
  quietHoursEnd        String?  // "08:00"
  timezone             String   @default("America/New_York")
  
  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### **Alert Condition Schema**

#### **Account Balance Alert**
```json
{
  "type": "ACCOUNT_BALANCE",
  "accountId": "chase_checking_123",
  "accountName": "Chase Checking",
  "operator": "below",
  "threshold": 1000.00,
  "currency": "USD",
  "description": "Emergency fund alert"
}
```

#### **Market Rate Alert**
```json
{
  "type": "MARKET_RATE",
  "metric": "CD_RATES_12_MONTH",
  "source": "alpha_vantage",
  "operator": "above",
  "threshold": 5.0,
  "description": "High CD rate opportunity"
}
```

#### **Spending Threshold Alert**
```json
{
  "type": "SPENDING_THRESHOLD",
  "category": "Food and Drink",
  "subcategory": "Restaurants",
  "period": "monthly",
  "operator": "above",
  "threshold": 500.00,
  "description": "Dining out budget alert"
}
```

## **Implementation Phases**

### **Phase 1: Core Infrastructure (Week 1-2)**

#### **Backend Components**
1. **Database Migration**
   - Add Alert and AlertTrigger models
   - Add AlertSettings model
   - Create necessary indexes

2. **Alert Service** (`src/services/alert-service.ts`)
   ```typescript
   class AlertService {
     async createAlert(userId: string, alertData: CreateAlertRequest): Promise<Alert>
     async updateAlert(alertId: string, updates: Partial<Alert>): Promise<Alert>
     async deleteAlert(alertId: string): Promise<void>
     async getUserAlerts(userId: string): Promise<Alert[]>
     async checkAlertCondition(alert: Alert): Promise<boolean>
   }
   ```

3. **Alert API Endpoints**
   - `POST /alerts` - Create new alert
   - `GET /alerts` - Get user's alerts
   - `PUT /alerts/:id` - Update alert
   - `DELETE /alerts/:id` - Delete alert
   - `POST /alerts/:id/test` - Test alert condition

4. **Basic Monitoring Engine**
   - Scheduled job to check alert conditions
   - Simple threshold comparison logic
   - Email notification system

#### **Frontend Components**
1. **Alert Management UI** (`frontend/src/components/AlertManager.tsx`)
   - Display user's alerts
   - Create/edit/delete alerts
   - Alert status and history

2. **Profile Page Integration**
   - Add alerts section to `/profile`
   - Alert settings and preferences

### **Phase 2: Intelligent Proposals (Week 3-4)**

#### **AI Integration**
1. **Proposal Engine** (`src/services/proposal-engine.ts`)
   ```typescript
   class ProposalEngine {
     async generateAlertProposals(
       question: string, 
       answer: string, 
       userContext: UserContext
     ): Promise<AlertProposal[]>
     
     async createAlertFromProposal(
       userId: string, 
       proposal: AlertProposal
     ): Promise<Alert>
   }
   ```

2. **Enhanced OpenAI Integration**
   - Modify AI responses to include alert suggestions
   - Context-aware proposal generation
   - User confirmation flow

3. **Proposal UI Components**
   - Alert proposal cards in AI responses
   - One-click accept/reject buttons
   - Proposal explanation and benefits

#### **Proposal Examples**
```typescript
interface AlertProposal {
  id: string;
  type: AlertType;
  name: string;
  description: string;
  condition: AlertCondition;
  reasoning: string;
  benefit: string;
}
```

### **Phase 3: Advanced Monitoring (Week 5-6)**

#### **Real-Time Data Integration**
1. **Market Data Monitoring**
   - Alpha Vantage API integration for rates
   - FRED API integration for economic indicators
   - Real-time data caching and updates

2. **Account Balance Monitoring**
   - Plaid account balance monitoring
   - Transaction pattern analysis
   - Spending category tracking

3. **Advanced Threshold Logic**
   - Percentage change detection
   - Moving average calculations
   - Custom condition evaluation

#### **Enhanced Notification System**
1. **Email Templates**
   - Beautiful HTML alert emails
   - Contextual information and recommendations
   - Action buttons for quick responses

2. **Notification Preferences**
   - Email frequency settings
   - Quiet hours configuration
   - Timezone support

### **Phase 4: User Experience (Week 7-8)**

#### **Profile Page Integration**
1. **Alert Management Section**
   - List of all user alerts
   - Alert status and last triggered
   - Quick enable/disable toggles

2. **Alert Creation Flow**
   - Simple form for manual alert creation
   - Pre-built templates for common alerts
   - Smart suggestions based on user data

3. **Alert History**
   - Timeline of triggered alerts
   - Historical data and trends
   - Alert effectiveness analytics

#### **Mobile Optimization**
1. **Responsive Design**
   - Mobile-friendly alert management
   - Touch-optimized interfaces
   - Progressive web app features

2. **Push Notifications**
   - Browser push notifications
   - Mobile app notifications (future)
   - Real-time alert delivery

## **User Flow Examples**

### **Example 1: Emergency Fund Alert**

#### **Conversation Flow**
1. **User Question**: "How much should I keep in my emergency fund?"
2. **AI Response**: 
   ```
   Based on your monthly expenses of $4,200, you should maintain an emergency fund of $12,600 (3 months of expenses). 
   Your current emergency fund is $8,450, which is below the recommended amount.
   
   💡 **Smart Alert Suggestion**: Would you like to be notified when your emergency fund drops below $8,000? 
   This will help you stay on track with your savings goals.
   ```
3. **User Action**: Clicks "Yes, create alert"
4. **System Action**: Creates alert monitoring Chase account balance
5. **Trigger**: When balance drops below $8,000 → Email sent

### **Example 2: Mortgage Rate Alert**

#### **Conversation Flow**
1. **User Question**: "When should I refinance my mortgage?"
2. **AI Response**:
   ```
   With your current mortgage rate of 6.8% and a balance of $485,000, you should consider refinancing when rates drop below 6.0%. 
   This could save you approximately $450/month in payments.
   
   💡 **Smart Alert Suggestion**: Would you like to be notified when 30-year mortgage rates drop below 6.0%? 
   This will help you catch the best refinancing opportunities.
   ```
3. **User Action**: Clicks "Yes, create alert"
4. **System Action**: Creates alert monitoring mortgage rates via Alpha Vantage
5. **Trigger**: When rates drop below 6.0% → Email sent

### **Example 3: Spending Alert**

#### **Conversation Flow**
1. **User Question**: "Am I spending too much on dining out?"
2. **AI Response**:
   ```
   Your dining out spending is $650/month, which is 15% of your monthly income. 
   This is above the recommended 10% for discretionary spending.
   
   💡 **Smart Alert Suggestion**: Would you like to be notified when your monthly dining spending exceeds $500? 
   This will help you stay within your budget goals.
   ```
3. **User Action**: Clicks "Yes, create alert"
4. **System Action**: Creates alert monitoring dining transaction category
5. **Trigger**: When monthly dining spending exceeds $500 → Email sent

## **Technical Implementation**

### **Alert Service Architecture**

#### **Core Alert Service**
```typescript
// src/services/alert-service.ts
export class AlertService {
  private prisma: PrismaClient;
  private emailService: EmailService;
  private marketDataService: MarketDataService;
  
  async createAlert(userId: string, alertData: CreateAlertRequest): Promise<Alert> {
    // Validate alert data
    // Create alert in database
    // Return created alert
  }
  
  async checkAlertCondition(alert: Alert): Promise<boolean> {
    switch (alert.type) {
      case AlertType.ACCOUNT_BALANCE:
        return await this.checkAccountBalance(alert);
      case AlertType.MARKET_RATE:
        return await this.checkMarketRate(alert);
      case AlertType.SPENDING_THRESHOLD:
        return await this.checkSpendingThreshold(alert);
      default:
        return false;
    }
  }
  
  async triggerAlert(alert: Alert, value: number): Promise<void> {
    // Create trigger record
    // Send email notification
    // Update alert last checked
  }
}
```

#### **Monitoring Engine**
```typescript
// src/services/monitoring-engine.ts
export class MonitoringEngine {
  private alertService: AlertService;
  private cron: CronJob;
  
  constructor() {
    this.setupScheduledJobs();
  }
  
  private setupScheduledJobs(): void {
    // Check account balance alerts daily
    this.cron.schedule('0 9 * * *', () => this.checkAccountAlerts());
    
    // Check market rate alerts hourly
    this.cron.schedule('0 * * * *', () => this.checkMarketAlerts());
    
    // Check spending alerts daily
    this.cron.schedule('0 18 * * *', () => this.checkSpendingAlerts());
  }
  
  private async checkAccountAlerts(): Promise<void> {
    const alerts = await this.alertService.getActiveAlerts(AlertType.ACCOUNT_BALANCE);
    for (const alert of alerts) {
      const shouldTrigger = await this.alertService.checkAlertCondition(alert);
      if (shouldTrigger) {
        await this.alertService.triggerAlert(alert, currentValue);
      }
    }
  }
}
```

### **Proposal Engine**

#### **AI Integration**
```typescript
// src/services/proposal-engine.ts
export class ProposalEngine {
  private openai: OpenAI;
  private alertService: AlertService;
  
  async generateProposals(
    question: string, 
    answer: string, 
    userContext: UserContext
  ): Promise<AlertProposal[]> {
    const prompt = this.buildProposalPrompt(question, answer, userContext);
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    });
    
    return this.parseProposals(response.choices[0].message.content);
  }
  
  private buildProposalPrompt(
    question: string, 
    answer: string, 
    userContext: UserContext
  ): string {
    return `
    Based on this user question and answer, suggest relevant financial alerts:
    
    Question: ${question}
    Answer: ${answer}
    User Context: ${JSON.stringify(userContext)}
    
    Generate 1-3 relevant alert proposals in JSON format:
    {
      "proposals": [
        {
          "type": "ACCOUNT_BALANCE|MARKET_RATE|SPENDING_THRESHOLD",
          "name": "Human readable name",
          "description": "What this alert monitors",
          "condition": { /* alert condition JSON */ },
          "reasoning": "Why this alert is relevant",
          "benefit": "What value this provides to the user"
        }
      ]
    }
    `;
  }
}
```

### **Email Notification System**

#### **Alert Email Templates**
```typescript
// src/services/email-service.ts
export class EmailService {
  async sendAlertNotification(alert: Alert, trigger: AlertTrigger): Promise<void> {
    const template = this.getAlertEmailTemplate(alert, trigger);
    await this.sendEmail(alert.user.email, template);
  }
  
  private getAlertEmailTemplate(alert: Alert, trigger: AlertTrigger): EmailTemplate {
    return {
      subject: `🚨 Alert: ${alert.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Financial Alert</h2>
          <p><strong>${alert.name}</strong></p>
          <p>${alert.description}</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Alert Details</h3>
            <p><strong>Condition:</strong> ${this.formatCondition(alert.condition)}</p>
            <p><strong>Current Value:</strong> ${trigger.value}</p>
            <p><strong>Triggered:</strong> ${trigger.triggeredAt.toLocaleString()}</p>
          </div>
          
          <div style="margin: 20px 0;">
            <a href="${process.env.FRONTEND_URL}/profile" 
               style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Manage Alerts
            </a>
          </div>
        </div>
      `
    };
  }
}
```

## **API Endpoints**

### **Alert Management**
```typescript
// POST /alerts
interface CreateAlertRequest {
  name: string;
  description?: string;
  type: AlertType;
  condition: AlertCondition;
  threshold: number;
  operator: string;
}

// GET /alerts
interface GetAlertsResponse {
  alerts: Alert[];
  total: number;
}

// PUT /alerts/:id
interface UpdateAlertRequest {
  name?: string;
  description?: string;
  isActive?: boolean;
  threshold?: number;
  operator?: string;
}

// DELETE /alerts/:id
// No request body needed

// POST /alerts/:id/test
interface TestAlertResponse {
  success: boolean;
  currentValue?: number;
  wouldTrigger: boolean;
  message: string;
}
```

### **Alert Settings**
```typescript
// GET /alerts/settings
interface AlertSettingsResponse {
  emailNotifications: boolean;
  notificationFrequency: string;
  quietHours: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone: string;
}

// PUT /alerts/settings
interface UpdateAlertSettingsRequest {
  emailNotifications?: boolean;
  notificationFrequency?: string;
  quietHours?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone?: string;
}
```

## **Frontend Components**

### **Alert Manager Component**
```typescript
// frontend/src/components/AlertManager.tsx
interface AlertManagerProps {
  userId?: string;
  isDemo?: boolean;
}

export default function AlertManager({ userId, isDemo }: AlertManagerProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  // Component implementation
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">Smart Alerts</h3>
        <button 
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm"
        >
          Create Alert
        </button>
      </div>
      
      {/* Alert list */}
      <div className="space-y-3">
        {alerts.map(alert => (
          <AlertCard 
            key={alert.id} 
            alert={alert} 
            onToggle={handleToggleAlert}
            onDelete={handleDeleteAlert}
          />
        ))}
      </div>
      
      {/* Create alert modal */}
      {showCreateForm && (
        <CreateAlertModal 
          onClose={() => setShowCreateForm(false)}
          onSave={handleCreateAlert}
        />
      )}
    </div>
  );
}
```

### **Alert Proposal Component**
```typescript
// frontend/src/components/AlertProposal.tsx
interface AlertProposalProps {
  proposal: AlertProposal;
  onAccept: (proposal: AlertProposal) => void;
  onReject: (proposal: AlertProposal) => void;
}

export default function AlertProposal({ proposal, onAccept, onReject }: AlertProposalProps) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-medium text-blue-900">{proposal.name}</h4>
          <p className="text-blue-700 text-sm mt-1">{proposal.description}</p>
          <p className="text-blue-600 text-sm mt-2">{proposal.reasoning}</p>
        </div>
        <div className="flex space-x-2 ml-4">
          <button
            onClick={() => onAccept(proposal)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
          >
            Create Alert
          </button>
          <button
            onClick={() => onReject(proposal)}
            className="text-gray-500 hover:text-gray-700 px-3 py-1 rounded text-sm"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
```

## **Testing Strategy**

### **Unit Tests**
```typescript
// src/__tests__/unit/alert-service.test.ts
describe('AlertService', () => {
  test('should create alert with valid data', async () => {
    // Test alert creation
  });
  
  test('should check account balance condition correctly', async () => {
    // Test condition checking
  });
  
  test('should trigger alert when condition is met', async () => {
    // Test alert triggering
  });
});
```

### **Integration Tests**
```typescript
// src/__tests__/integration/alert-workflow.test.ts
describe('Alert Workflow', () => {
  test('should create alert from AI proposal', async () => {
    // Test end-to-end proposal flow
  });
  
  test('should send email notification when alert triggers', async () => {
    // Test notification system
  });
  
  test('should monitor market rates and trigger alerts', async () => {
    // Test market data monitoring
  });
});
```

## **Security Considerations**

### **Data Protection**
- **User Isolation**: All alerts filtered by user ID
- **Condition Validation**: Sanitize alert conditions to prevent injection
- **Email Security**: Secure email delivery with proper authentication
- **Access Control**: Proper authentication for all alert endpoints

### **Privacy**
- **No Sensitive Data**: Alert conditions don't contain sensitive information
- **Anonymized Monitoring**: Account balances monitored without storing details
- **User Control**: Users can delete all alerts and data
- **Audit Trail**: Log alert creation and triggering for security

## **Performance Optimization**

### **Monitoring Efficiency**
- **Batch Processing**: Check multiple alerts in single database queries
- **Caching**: Cache market data to reduce API calls
- **Indexing**: Proper database indexes for alert queries
- **Rate Limiting**: Respect external API rate limits

### **Scalability**
- **Horizontal Scaling**: Stateless alert service for multiple instances
- **Queue System**: Background job processing for alert checks
- **Database Optimization**: Efficient queries for large alert volumes
- **CDN Integration**: Static alert templates served from CDN

## **Success Metrics**

### **User Engagement**
- **Alert Creation Rate**: Percentage of users who create alerts
- **Alert Retention**: Users who keep alerts active
- **Trigger Response**: User actions after receiving alerts
- **Feature Adoption**: Overall alert system usage

### **Technical Performance**
- **Alert Accuracy**: Percentage of accurate triggers
- **System Reliability**: Uptime and error rates
- **Response Time**: Time from condition to notification
- **Email Delivery**: Successful email delivery rates

## **Future Enhancements**

### **Advanced Features**
1. **Smart Thresholds**: AI-suggested optimal threshold values
2. **Predictive Alerts**: Alerts based on predicted future conditions
3. **Alert Analytics**: Insights into alert effectiveness and patterns
4. **Mobile Push Notifications**: Real-time mobile alerts
5. **Alert Sharing**: Share alerts with family members or advisors

### **Integration Opportunities**
1. **Calendar Integration**: Schedule-based alerts
2. **External APIs**: Integration with more financial data sources
3. **Third-Party Services**: Slack, Discord, or SMS notifications
4. **Machine Learning**: Improved proposal accuracy over time

---

**This specification provides a comprehensive roadmap for implementing the Smart Alerting System, ensuring it integrates seamlessly with the existing platform while providing significant value to users through proactive financial monitoring.** 