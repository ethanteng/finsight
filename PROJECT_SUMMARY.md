# 🚀 Ask Linc - AI-Powered Financial Analysis Platform

## **Project Overview**

Ask Linc is a comprehensive financial analysis platform that combines AI-powered insights with real-time market data to help users understand and optimize their financial health. The platform features privacy-protected data processing, tier-based access control, seamless integration with financial institutions, and a sophisticated **Retrieval-Augmented Generation (RAG)** system for real-time financial intelligence.

## 🏗️ **Architecture & Tech Stack**

### **Backend (Node.js/TypeScript)**

- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT-based with optional auth middleware
- **AI Integration**: OpenAI GPT-4 for financial analysis
- **External APIs**: 
  - Plaid (banking data)
  - FRED (economic indicators)
  - Alpha Vantage (market data)
  - **Brave Search API** (real-time financial information)

### **Frontend (Next.js/React)**

- **Framework**: Next.js 14 with TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Custom component library
- **Deployment**: Vercel

### **Infrastructure**

- **Backend Deployment**: Render
- **Frontend Deployment**: Vercel
- **Database**: PostgreSQL (Render)
- **CI/CD**: GitHub Actions with automated testing

## 🧠 **RAG System Implementation**

### **Retrieval-Augmented Generation (RAG)**

The platform now features a sophisticated RAG system that enhances AI responses with real-time financial information from multiple sources.

#### **Key RAG Features**

- **Real-Time Search**: Brave Search API integration for current financial data
- **Holistic Coverage**: Support for all major financial institutions and products
- **Enhanced Queries**: Intelligent search query generation based on question type
- **Source Attribution**: Transparent citation of information sources
- **Tier-Aware Access**: RAG features available for Standard and Premium tiers

#### **Supported Financial Institutions**

- **Banks**: Wells Fargo, Chase, Bank of America, Citibank, US Bank, PNC, Capital One
- **Fintech**: Ally Bank, Marcus, Fidelity, Vanguard, Schwab, TD Ameritrade, Robinhood
- **Products**: Mortgages, credit cards, savings accounts, CDs, investments, loans

#### **RAG Query Enhancement**

```typescript
// Intelligent query enhancement based on question type
const financialInstitutions = [
  'wells fargo', 'chase', 'bank of america', 'citibank', 'us bank', 'pnc', 'capital one',
  'ally bank', 'marcus', 'fidelity', 'vanguard', 'schwab', 'td ameritrade', 'robinhood'
];

const rateRelatedTerms = [
  'mortgage rate', 'refinance', 'interest rate', 'apr', 'cd rate', 'savings rate',
  'credit card rate', 'loan rate', 'investment return', 'yield'
];

// Enhanced search queries for better results
if (mentionedInstitution && isRateQuestion) {
  enhancedQuery = `${mentionedInstitution} current rates today 2025 ${question.split(' ').slice(-3).join(' ')}`;
}
```

#### **RAG System Benefits**

- **Real-Time Information**: Current rates, market data, and financial news
- **Personalized Advice**: User's financial situation + real-time market context
- **Comprehensive Coverage**: Any financial institution or product type
- **Source Transparency**: Clear attribution of information sources
- **Performance Optimized**: 30-minute cache with intelligent refresh

## 🎭 **Demo System Implementation**

### **Demo Mode Architecture**

The demo system is a sophisticated implementation that allows users to experience the full platform functionality without connecting real financial accounts or providing sensitive data.

### **Key Demo Features**

- **Fake Data Generation**: Comprehensive mock financial data with realistic rates
- **Session Management**: Persistent demo sessions across requests
- **AI Integration**: Full AI analysis with demo data + RAG system
- **Market Context**: Real market data integration
- **Privacy Protection**: No tokenization needed for fake data

### **Enhanced Demo Data Structure**

```typescript
// Demo accounts with realistic financial profiles and rates
const demoAccounts = [
  { name: 'Chase Checking', balance: 12450.67, type: 'checking' },
  { name: 'Ally High-Yield Savings', balance: 28450.00, type: 'savings', interestRate: 4.25 },
  { name: 'Fidelity 401(k)', balance: 156780.45, type: 'investment' },
  { name: 'Vanguard Roth IRA', balance: 89420.30, type: 'investment' },
  { name: 'Chase Sapphire Reserve', balance: -3240.50, type: 'credit', interestRate: 18.99 },
  { name: 'Wells Fargo Mortgage', balance: 485000.00, type: 'loan', interestRate: 6.72 },
  { name: 'Marcus 12-Month CD', balance: 25000.00, type: 'savings', interestRate: 4.85 }
];
```

### **Demo vs Production Flow**

| **Aspect** | **Demo Mode** | **Production Mode** |
| --- | --- | --- |
| **Data Source** | Pre-defined fake data | Real Plaid data |
| **Authentication** | Session-based demo auth | JWT user authentication |
| **Privacy** | No tokenization needed | Full dual-data tokenization |
| **AI Processing** | Direct fake data to AI + RAG | Tokenized data to AI + RAG |
| **Response** | AI response as-is | Converted to user-friendly format |
| **Persistence** | Demo sessions in database | User conversations |
| **Market Data** | Real market context + RAG | Real market context + RAG |

## **Core Systems**

### **1. Dual-Data Privacy System**

- **Purpose**: Protects user privacy while maintaining AI functionality
- **Implementation**: Tokenizes real account/merchant names for AI processing
- **Features**:
    - Real data tokenization for AI
    - User-friendly display with real names
    - Session-consistent tokenization maps
    - Demo mode optimization

### **2. Enhanced Market Context System**

- **Purpose**: Provides real-time market data for informed financial advice
- **Data Sources**: FRED (economic indicators), Alpha Vantage (live market data)
- **Features**:
    - Proactive caching with scheduled updates
    - Tier-based data access
    - Real-time economic indicators
    - Live CD rates, treasury yields, mortgage rates

### **3. RAG System**

- **Purpose**: Enhances AI responses with real-time financial information
- **Data Sources**: Brave Search API for current financial data
- **Features**:
    - Real-time search for current rates and information
    - Holistic coverage of all financial institutions
    - Intelligent query enhancement
    - Source attribution and transparency
    - Tier-aware access control

### **4. Tier-Based Access Control**

- **Tiers**: Starter, Standard, Premium
- **Features**:
    - Differentiated data access per tier
    - RAG system access for Standard and Premium
    - Upgrade recommendations
    - Source attribution for data transparency
    - Cache management and performance optimization

### **5. Plaid Integration**

- **Purpose**: Secure banking data access
- **Features**:
    - Account connection and management
    - Transaction history retrieval
    - Real-time balance updates
    - Secure token management

## **Testing Strategy**

### **Comprehensive Test Coverage**

- **Unit Tests**: 35+ tests covering core functionality
- **Integration Tests**: 33+ tests for API endpoints and workflows
- **RAG System Tests**: Enhanced market context and search integration
- **CI/CD Tests**: Selective test suite for reliable deployment

### **Test Categories**

- **Dual-Data System**: Privacy protection and tokenization
- **Enhanced Market Context**: API integration and caching
- **RAG System**: Search integration and query enhancement
- **User Workflows**: End-to-end user journeys
- **API Integration**: External service connectivity

## 🔐 **Security & Privacy**

### **Data Protection**

- **Tokenization**: Real account names never sent to AI
- **Session Management**: Secure demo and user sessions
- **API Security**: Rate limiting and error handling
- **Database Security**: Prisma with connection pooling
- **RAG Security**: Secure search API integration
- **User Data Isolation**: Strict filtering by user ID to prevent cross-user data access

### **Authentication**

- **JWT Tokens**: Secure user authentication
- **Optional Auth**: Demo mode without authentication
- **Session Persistence**: Cross-request context maintenance
- **Active Session Tracking**: `lastLoginAt` updates to track user activity

### **Security Testing & Validation**

- **Comprehensive Security Test Suite**: 25+ security-focused tests covering:
  - **User Data Isolation**: Tests ensure new users can't see other users' account data
  - **Token Access Control**: Verifies access tokens are filtered by user ID
  - **Authentication Boundaries**: Tests reject invalid/expired JWT tokens
  - **Demo Mode Security**: Ensures demo mode doesn't leak real user data
  - **Error Handling Security**: Validates error responses don't contain sensitive information
  - **API Security**: Tests proper authentication requirements for sensitive operations
  - **Token Lifecycle Security**: Tests token expiration and revocation
  - **Data Leakage Prevention**: Ensures user IDs and tokens aren't exposed in logs/errors

### **Critical Security Fixes Implemented**

- **Fixed Plaid Token Leaking Issue**: Updated `src/openai.ts` to filter access tokens by user ID:
  ```typescript
  // Before: Fetched ALL tokens (security vulnerability)
  const accessTokens = await prisma.accessToken.findMany();
  
  // After: Only fetch current user's tokens (secure)
  const accessTokens = await prisma.accessToken.findMany({
    where: { userId }
  });
  ```

- **Fixed PlaidLinkButton State Management**: Resolved issue where Plaid Link would reopen unnecessarily after successful connections

- **Enhanced User Session Tracking**: Added `lastLoginAt` updates in `/auth/verify` endpoint to track active user sessions

### **Security Test Coverage**

- **Unit Tests**: 25 security tests covering token isolation, user boundaries, and data protection
- **Integration Tests**: 15+ tests simulating real-world security scenarios
- **API Security Tests**: Authentication boundary and error handling validation
- **Demo Mode Security**: Comprehensive isolation testing between demo and real user data

## **Key Features**

### **AI-Powered Financial Analysis**

- Personalized financial insights based on user data
- Market context integration for informed advice
- **RAG-enhanced responses** with real-time information
- Conversation history for contextual responses
- Tier-aware recommendations and upgrade suggestions

### **Real-Time Market Data**

- Current economic indicators (Fed rate, CPI, mortgage rates)
- Live CD rates and treasury yields
- Market trend analysis and recommendations
- Source attribution for transparency
- **Real-time search results** for current financial information

### **User Experience**

- Seamless account connection via Plaid
- Demo mode for testing without real data
- Responsive web interface
- Mobile-friendly design
- **Holistic financial advice** for any institution or product

## 🚀 **Deployment & CI/CD**

### **Production Environment**

- **Frontend**: Vercel (automatic deployments)
- **Backend**: Render (with health checks)
- **Database**: PostgreSQL on Render
- **Environment**: Production-ready with monitoring

### **Development Workflow**

- **Local Development**: Concurrent frontend/backend
- **Testing**: Comprehensive test suites
- **Code Quality**: ESLint, TypeScript strict mode
- **Version Control**: Git with semantic commits

## 📈 **Performance & Scalability**

### **Optimization Features**

- **Caching**: Multi-level caching for market data
- **Database**: Efficient queries with Prisma
- **API**: Rate limiting and error handling
- **Frontend**: Optimized bundle size and loading
- **RAG System**: 30-minute search result caching

### **Monitoring**

- **Health Checks**: Automated service monitoring
- **Error Tracking**: Comprehensive error handling
- **Performance**: Response time monitoring
- **Uptime**: Service availability tracking

## 🎯 **Business Value**

### **User Benefits**

- **Privacy-First**: Financial data never exposed to AI
- **Real-Time Insights**: Current market data + RAG integration
- **Personalized Advice**: AI-powered financial recommendations
- **Easy Integration**: Simple Plaid-based account connection
- **Comprehensive Coverage**: Any financial institution or product

### **Technical Benefits**

- **Scalable Architecture**: Microservices-ready design
- **Reliable Testing**: Comprehensive test coverage
- **Secure Deployment**: Production-ready CI/CD pipeline
- **Maintainable Code**: TypeScript with clear documentation
- **Advanced AI**: RAG system for enhanced responses

## 🔄 **Recent Achievements**

### **Technical Improvements (Latest)**

- **Critical Security Fixes**: Resolved major Plaid token leaking vulnerability and implemented comprehensive security test suite
- **Circular Dependency Resolution**: Fixed import issues between `index.ts` and `openai.ts` by creating dedicated `prisma-client.ts`
- **Integration Test Stability**: Achieved 100% pass rate across all 6 integration test suites
- **Error Handling Enhancement**: Improved error handling and graceful degradation for production stability
- **Code Architecture**: Optimized module structure for better maintainability and testing

### **Latest Implementation**

- **Integration Test Stability**: Fixed circular dependency issues and achieved 100% integration test pass rate
- **RAG System**: Complete real-time financial information integration with comprehensive testing
- **Holistic Coverage**: Support for all financial institutions and products
- **Enhanced Demo Data**: Realistic rates and comprehensive financial profiles
- **Intelligent Query Enhancement**: Smart search query generation
- **Source Attribution**: Transparent citation of information sources
- **Backend Test Stability**: All integration tests passing with proper mock setup and error handling

### **Security Achievements**

- **Critical Vulnerability Fix**: Resolved major security issue where new users could see other users' account data
- **Comprehensive Security Testing**: Implemented 40+ security-focused tests covering all critical attack vectors
- **User Data Isolation**: Fixed database queries to properly filter by user ID, preventing cross-user data access
- **Authentication Hardening**: Enhanced JWT validation and session tracking with `lastLoginAt` updates
- **Frontend Security**: Fixed PlaidLinkButton state management to prevent UI security issues
- **Security Test Coverage**: 100% pass rate on all security tests with comprehensive validation

### **Quality Assurance**

- **Test Coverage**: 185 tests passing across 17 test suites with comprehensive security validation
- **Integration Test Stability**: All integration tests passing with comprehensive coverage
- **RAG System Testing**: Complete test coverage for enhanced market context and search integration
- **Dual-Data System**: Full privacy protection testing with 16 comprehensive tests
- **API Integration**: Robust testing of FRED, Alpha Vantage, and external APIs
- **CI/CD Pipeline**: Reliable deployment automation with comprehensive testing
- **Code Quality**: Comprehensive linting and type checking
- **Documentation**: Complete system documentation

## 📚 **Project Documentation**

### **Core Documentation Files**

- **[RAG_VS_INDIVIDUAL_SOURCES.md](./RAG_VS_INDIVIDUAL_SOURCES.md)** - Comprehensive comparison between RAG approach and individual data sources, including cost analysis, feature comparison, and migration strategy
- **[ENHANCED_MARKET_CONTEXT.md](./ENHANCED_MARKET_CONTEXT.md)** - Detailed documentation of the enhanced market context system with proactive caching and scheduled updates
- **[DUAL_DATA_TESTING.md](./DUAL_DATA_TESTING.md)** - Complete testing guide for the dual-data privacy system with unit and integration test coverage
- **[TIER_SYSTEM.md](./TIER_SYSTEM.md)** - Documentation of the tier-based access control system with feature differentiation
- **[TIER_TESTING.md](./TIER_TESTING.md)** - Testing documentation for the tier system implementation
- **[TESTING_BEST_PRACTICES.md](./TESTING_BEST_PRACTICES.md)** - Best practices and guidelines for testing the platform
- **[TEST_SUMMARY.md](./TEST_SUMMARY.md)** - Summary of all test suites and coverage

### **Technical Documentation**

- **[README.md](./README.md)** - Main project documentation with setup and usage instructions
- **[TEST_SUMMARY.md](./TEST_SUMMARY.md)** - Comprehensive test results and coverage analysis

## 🎉 **Success Metrics**

### **RAG System Performance**

- **Real-Time Integration**: Current financial data from any institution
- **Holistic Coverage**: Support for all major banks, fintech, and products
- **Enhanced Responses**: AI answers with real-time market context
- **Source Transparency**: Clear attribution of information sources
- **Performance Optimized**: 30-minute cache with intelligent refresh
- **Comprehensive Testing**: 62 integration tests covering all functionality with 100% pass rate

### **Platform Capabilities**

- **Privacy Protection**: Dual-data system with full tokenization
- **Demo System**: Risk-free user experience with realistic data
- **Market Integration**: Real-time economic and market data
- **Tier Management**: Comprehensive access control system
- **AI Enhancement**: RAG system for superior financial advice

## 🔧 **System Customization & Maintenance**

### **Enhanced Context Configuration**

The platform's enhanced context system can be easily customized to support additional financial institutions and products.

#### **Adding More Banks & Financial Institutions**

**Primary File:** `src/openai.ts` (Lines 235-237)

**Current Supported Institutions:**
```typescript
const financialInstitutions = [
  'wells fargo', 'chase', 'bank of america', 'citibank', 'us bank', 'pnc', 'capital one',
  'ally bank', 'marcus', 'fidelity', 'vanguard', 'schwab', 'td ameritrade', 'robinhood'
];
```

**To Add More Banks:**
1. **Edit the array** in `src/openai.ts` around line 235
2. **Add institution names** in lowercase format
3. **Test the changes** with integration tests

**Example Expansion:**
```typescript
const financialInstitutions = [
  // Major Banks
  'wells fargo', 'chase', 'bank of america', 'citibank', 'us bank', 'pnc', 'capital one',
  'goldman sachs', 'morgan stanley', 'jpmorgan',
  
  // Regional Banks
  'bb&t', 'suntrust', 'regions bank', 'keybank', 'fifth third', 'huntington',
  'comerica', 'citizens bank', 'm&t bank', 'bmo harris',
  
  // Credit Unions
  'navy federal', 'penfed', 'alliant', 'state employees',
  
  // Fintech & Digital Banks
  'ally bank', 'marcus', 'sofi', 'chime', 'current', 'varo', 'upstart',
  'fidelity', 'vanguard', 'schwab', 'td ameritrade', 'robinhood',
  'betterment', 'wealthfront', 'acorns', 'stash'
];
```

#### **Adding More Financial Products**

**Secondary File:** `src/data/providers/search.ts` (Lines 249-260)

**Current Financial Keywords:**
```typescript
const financialKeywords = [
  'mortgage rates', 'CD rates', 'savings rates', 'investment advice',
  'retirement planning', 'tax strategies', 'budgeting tips',
  'credit card rates', 'loan rates', 'financial planning'
];
```

**To Add More Products:**
1. **Edit the array** in `src/data/providers/search.ts` around line 249
2. **Add product keywords** that should trigger enhanced search
3. **Test with integration tests**

**Example Expansion:**
```typescript
const financialKeywords = [
  'mortgage rates', 'CD rates', 'savings rates', 'investment advice',
  'retirement planning', 'tax strategies', 'budgeting tips',
  'credit card rates', 'loan rates', 'financial planning',
  'auto loan rate', 'personal loan rate', 'student loan rate',
  'home equity rate', 'heloc rate', 'money market rate',
  'investment account rate', 'ira rate', '401k rate', 'annuity rate'
];
```

#### **How Enhanced Context Works**

When users ask questions mentioning supported institutions or products:

1. **Institution Detection**: System identifies mentioned financial institutions
2. **Query Enhancement**: Automatically adds "current rates today 2025" for rate questions
3. **Search Optimization**: Enhances search queries for better results
4. **Real-Time Data**: Provides current information from multiple sources
5. **Source Attribution**: Transparently cites information sources

#### **Testing Changes**

After making changes:
```bash
# Run integration tests to ensure stability
npm run test:integration

# Test specific enhanced context functionality
npm run test:integration -- src/__tests__/integration/enhanced-market-context-api.test.ts
```

---

**This summary provides a comprehensive overview of the Ask Linc platform, including the sophisticated RAG system implementation that sets it apart from traditional financial apps. The platform now offers real-time financial intelligence with privacy protection, comprehensive demo capabilities, and holistic coverage of all financial institutions and products.** 