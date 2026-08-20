# 🚀 Ask Linc - AI-Powered Financial Analysis Platform

## **Project Overview**

Ask Linc is a comprehensive financial analysis platform that combines AI-powered insights with connected financial data and relevant market context to help users understand and optimize their financial health. The platform features privacy-protected data processing, tier-based access control, seamless integration with financial institutions, and a sophisticated **Retrieval-Augmented Generation (RAG)** system for current public financial information.

## 🏗️ **Architecture & Tech Stack**

### **Backend (Node.js/TypeScript)**
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT-based with optional auth middleware
- **AI Integration**: OpenAI GPT-4 for financial analysis
- **External APIs**:
  - Plaid (banking data)
  - SnapTrade (investment data)
  - FRED (latest published economic indicators and rate benchmarks)
  - Massive (formerly Polygon.io; delayed SPY daily bars, Treasury curve, and inflation expectations)
  - Financial Modeling Prep Starter (fund fees, metadata, country allocations, and sector weightings)
  - Tiingo Power (adjusted price history, IEX quotes, and market news)
  - RentCast (home valuations)
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

## 🧠 **Core Systems**

### **1. Canonical Financial Context System**
- **Purpose**: Gives AI responses a single, traceable source of financial truth
- **Implementation**: Builds question-specific context from persisted canonical snapshots
- **Features**:
    - Deterministic financial calculations
    - Explicit value, unit, and provenance metadata
    - Locally validated authoritative numbers

### **2. Enhanced Market Context System**
- **Purpose**: Provides current economic and market context for informed financial advice
- **Data Sources**: FRED (economic indicators), Brave Search (current public information), Massive (Premium macro context), Tiingo (quotes/news/performance), and FMP (fund look-through metadata)
- **Features**:
    - Proactive caching with scheduled updates
    - Tier-based data access
    - Latest published observations with their observation dates
    - Scheduled economic-indicator refreshes
    - Treasury yield-curve, inflation, and broad-market context

### **3. RAG System**
- **Purpose**: Enhances AI responses with real-time financial information
- **Data Sources**: Brave Search API for current financial data
- **Features**:
    - Real-time search for current rates and information
    - Holistic coverage of all financial institutions
    - Intelligent query enhancement
    - Source attribution and transparency
    - Tier-aware access control

### Historical Retirement Market Data

Retirement stress tests run entirely from the checked-in, monthly dataset in
`data/historical_market_returns.csv`. Its source snapshots and generated
metadata are versioned so production analysis never depends on a live market
data request:

- Kenneth French broad US market total returns and one-month Treasury-bill returns
- Kenneth French EAFE-plus-Canada market returns for international equity
- Robert Shiller 10-year US government-bond returns and CPI inflation

Run `npm run refresh:market-datasets` to download validated official snapshots,
update their hashes and vintages, and rebuild the unified dataset. Monthly
rolling stress-test windows overlap and must be described as historical shares,
not independent probability estimates.

### **4. Tier-Based Access Control**
- **Tiers**: Starter, Standard, Premium
- **Features**:
    - Differentiated data access per tier
    - RAG system access for Standard and Premium
    - Upgrade recommendations
    - Source attribution for data transparency
    - Cache management and performance optimization

### **5. Seamless Plaid Integration**
- **Purpose**: Maximum institution coverage with intelligent data detection
- **Features**:
    - Minimal products array (`["transactions"]`) for maximum FI coverage
    - Comprehensive additional consent for future access without relinking
    - Intelligent account type detection and automatic data fetching
    - Smart endpoint usage (`/transactions/sync`, conditional real-time balance)
    - No upfront user choice required - truly seamless experience

### **6. AI Conversation Context Enhancement**
- **Purpose**: Enables AI to build context across multiple conversation turns
- **Features**:
    - Grouped conversation turns and active-decision context
    - Question-specific canonical data packs
    - Bounded “What Linc remembers about you” details (age, location, household, and employment)
    - Field-level updates that replace or clear stale details instead of appending summaries
    - Seamless multi-turn financial conversations
    - Financial facts, goals, and scenario assumptions remain in their authoritative sources

### **7. MailerLite User Sync System**
- **Purpose**: Automatically synchronizes user data to MailerLite for email marketing
- **Features**:
    - Daily automated sync at 3 AM EST
    - Non-destructive upsert operations

### **8. Home Value Tracking System**
- **Purpose**: Track and include home values in Net Worth calculations
- **Data Source**: RentCast API for real-time property valuations
- **Features**:
    - Home records kept separate from remembered personal context
    - Manual home address entry in profile settings
    - Automatic valuation with price ranges (low, mid, high)
    - Monthly automatic value refresh
    - Manual refresh capability
    - Integrated into Financial Overview Net Worth calculation
    - Encrypted storage alongside remembered personal context
    - Available to authenticated users

## 🚀 **Quick Start**

### **Prerequisites**
- Node.js 18+
- PostgreSQL
- npm or yarn

### **Project Structure**
```
finsight/
├── 📁 docs/                    # 📚 Documentation
│   ├── README.md               # Documentation index
│   ├── TESTING.md              # Comprehensive testing documentation
│   ├── FINANCIAL_TRUTH_CONTRACT.md
│   ├── DETERMINISTIC_LLM_CALCULATIONS.md
│   └── features/               # Feature-specific references
├── 📁 scripts/                 # 🔧 Utility scripts
│   ├── test-*.js/ts           # Testing scripts
│   ├── test-mailerlite-sync.js # MailerLite sync testing
│   ├── check-db.js            # Database utilities
│   ├── clear-*.js             # Cleanup scripts
│   ├── build.sh               # Build scripts
│   └── deploy-*.sh            # Deployment scripts
├── 📁 frontend/               # 🎨 Next.js frontend
├── 📁 src/                    # ⚙️ Backend source code
├── 📁 prisma/                 # 🗄️ Database schema
├── 📁 .github/                # 🔄 CI/CD workflows
└── 📄 Configuration files     # ⚙️ Project config
```

### **Environment Setup**

1. **Clone the repository**
```bash
git clone <repository-url>
cd finsight
```

2. **Install dependencies**
```bash
# Backend dependencies
npm install

# Frontend dependencies
cd frontend
npm install
cd ..
```

3. **Environment Variables**
Create `.env` file in the root directory:
```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/finsight"

# Authentication & Security
JWT_SECRET="your_jwt_secret"
PROFILE_ENCRYPTION_KEY="your_32_byte_encryption_key"  # Required for encrypted user profiles

# OpenAI (main AI chat, fallback when Ask Linc disabled)
OPENAI_API_KEY="your_openai_api_key"

# Plaid (banking data)
PLAID_CLIENT_ID="your_plaid_client_id"
PLAID_SECRET="your_plaid_secret"
PLAID_MODE="sandbox"                    # sandbox or production (default: sandbox)
PLAID_CLIENT_ID_PROD="..."              # Optional: production credentials
PLAID_SECRET_PROD="..."
PLAID_ENV_PROD="production"
PLAID_ACCESS_LEVEL="sandbox"            # Optional: access level when not sandbox (default: sandbox)
PLAID_WEBHOOK_URL="https://..."         # Optional: for webhook events

# SnapTrade (investment data)
SNAPTRADE_CLIENT_ID="your_snaptrade_client_id"
SNAPTRADE_CONSUMER_KEY="your_snaptrade_consumer_key"
SNAPTRADE_MODE="sandbox"                # sandbox or production (default: sandbox)
SNAPTRADE_CLIENT_ID_PROD="..."          # Optional: production credentials
SNAPTRADE_CONSUMER_KEY_PROD="..."
SNAPTRADE_ENV_PROD="production"

# Market Data APIs
FRED_API_KEY="your_fred_api_key"
MASSIVE_API_KEY="your_massive_api_key"  # Preferred for Premium market context
POLYGON_API_KEY="your_polygon_api_key"  # Backward-compatible alias for existing deployments

# Home Valuation API
RENTCAST_API_KEY="your_rentcast_api_key"

# Search API (for RAG system)
SEARCH_API_KEY="your_search_api_key"
SEARCH_PROVIDER="brave"                 # brave or google (default: brave)
GOOGLE_SEARCH_ENGINE_ID="..."           # Required when SEARCH_PROVIDER=google

# Transaction & Investment History
TRANSACTION_HISTORY_DAYS="90"           # Days of banking transactions (default: 90)
INVESTMENT_HISTORY_YEARS="2"            # Years of investment history (default: 2)

# MailerLite (for user sync)
MAILER_LITE_API_KEY="your_mailerlite_api_key"
MAILER_LITE_GROUP_ID="your_mailerlite_group_id"

# Stripe (subscriptions)
STRIPE_SECRET_KEY="sk_..."
STRIPE_PUBLISHABLE_KEY="pk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_PREMIUM="price_..."        # Stripe price ID for premium tier
STRIPE_CHECKOUT_SUCCESS_URL="..."      # Optional (default: /api/stripe/payment-success)
STRIPE_CHECKOUT_CANCEL_URL="..."       # Optional (default: /pricing)
STRIPE_PORTAL_RETURN_URL="..."          # Optional (default: /profile)
STRIPE_PORTAL_CANCEL_RETURN_URL="..."  # Optional
STRIPE_PORTAL_UPDATE_RETURN_URL="..."  # Optional
STRIPE_ACCOUNT_REFRESH_URL="..."       # Optional
STRIPE_ACCOUNT_RETURN_URL="..."        # Optional

# Email (Resend)
RESEND_API_KEY="re_..."
ADMIN_EMAILS="admin@example.com,other@example.com"  # Comma-separated for admin access

# URLs
FRONTEND_URL="http://localhost:3001"    # Base URL for frontend (default: http://localhost:3001)
EMAIL_ASSET_BASE_URL="https://asklinc.com"  # Optional: public base URL for email images/marketing links.
                                        # Must be an absolute https URL on a publicly reachable host; localhost,
                                        # private/link-local addresses and scheme-less values are skipped.
                                        # Falls back to FRONTEND_URL, then https://asklinc.com
PORT="3000"                             # Backend port (default: 3000)

# Transaction & Context Persistence (optional, for debugging)
PERSIST_TRANSACTIONS="false"            # Toggle transaction persistence to database
PERSIST_GPT_CONTEXT="false"             # Toggle GPT context logging to /opt/render/project/src/logs

# Ask Linc canonical-facts pipeline (Claude primary, OpenAI provider fallback)
ANTHROPIC_API_KEY="your_anthropic_api_key"  # Required for Ask Linc analysis
ENABLE_RESPONSE_VALIDATION="false"      # Optional: validate Claude responses with Gemini
ASK_LINC_MAX_OUTPUT_TOKENS="16000"      # Optional: default max output tokens for primary/fallback (the admin panel overrides it per slot)
OPENAI_FALLBACK_MODEL="gpt-4o"          # Optional: fallback model; reuses the prepared context pack

# Gemini (market news synthesis + optional validation)
GOOGLE_AI_API_KEY="your_google_ai_key"  # Required for market news; optional for validation (or GEMINI_API_KEY)
GEMINI_API_KEY="..."                    # Alternative to GOOGLE_AI_API_KEY
GEMINI_VALIDATION_MODEL="gemini-3-flash-preview"    # Model for Claude validation (default)
GEMINI_MARKET_SYNTHESIS_MODEL="gemini-2.5-flash"    # Model for market news synthesis (default)

# Feature Flags
ENABLE_USER_AUTH="true"                 # Enable JWT auth (default: false)
ENABLE_TIER_ENFORCEMENT="true"          # Enforce tier-based access (default: false)
ENABLE_PLAID_ENRICH="false"             # Use Plaid enrich for categorization (default: false)

# AI Rate Limiting
AI_RATE_LIMIT_AUTHENTICATED="30"        # Requests per minute for authenticated users (default: 30)
AI_RATE_LIMIT_UNAUTHENTICATED="20"      # Requests per minute before authentication (default: 20)

# Caching & Performance (optional)
MAX_PROMPT_TRANSACTIONS="75"            # Max transactions in AI prompt (default: 75)
CATEGORIZATION_CACHE_TTL_HOURS="24"     # Transaction categorization cache (default: 24)
FINANCIAL_DATA_CACHE_TTL_MS="300000"    # Financial data cache in ms (default: 300000)
PERSISTED_DATA_MAX_AGE_MINUTES="120"    # Max age for persisted snapshot (default: 120)

# Retirement Analytics (optional)
TIINGO_API_KEY="..."                    # Power: adjusted history, IEX quotes, and market news
FMP_API_KEY="..."                       # Starter: fund fees, country allocations, and sector weights

# Monitoring
SENTRY_DSN="https://..."                # Optional: backend error tracking
SENTRY_ENVIRONMENT="development"        # Use "production" in production
SENTRY_TRACES_SAMPLE_RATE="0"           # Production default is 0.05; keep local tracing off
```

Create `.env.local` file in the `frontend` directory:
```bash
# Backend API URL
NEXT_PUBLIC_API_URL="http://localhost:3000"

# GPT Context Logging (should match backend PERSIST_GPT_CONTEXT)
NEXT_PUBLIC_PERSIST_GPT_CONTEXT="false"

# Stripe Customer Portal (optional - for subscription management)
NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL="https://..."

# Google Analytics (optional)
NEXT_PUBLIC_GA_ID="G-..."

# Sentry (optional - error tracking)
NEXT_PUBLIC_SENTRY_DSN="https://..."
NEXT_PUBLIC_SENTRY_ENVIRONMENT="development"
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE="0"

# Build-only Sentry settings (set in CI/deployment, not exposed to the browser)
SENTRY_ORG="your-sentry-organization"
SENTRY_PROJECT="your-sentry-project"
SENTRY_AUTH_TOKEN="..."

# Ghost CMS (optional - for blog content)
GHOST_URL="https://..."
GHOST_CONTENT_KEY="..."
```

4. **Database Setup**
```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma db push

```

5. **Start Development Servers**
```bash
# Start backend (port 3000)
npm run dev

# Start frontend (port 3001)
cd frontend
npm run dev
```

## 🧪 **Testing**

### **Run All Tests**
```bash
npm test
```

### **Run Specific Test Suites**
```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Enhanced market context tests
npm run test:enhanced-market-context

# Deterministic Ask Linc quality evaluation
npm run eval:llm

# GPT Model Smoke Test (Real API validation)
npm run test:gpt-smoke
```

### **Test Coverage**
- **Unit Tests**: 35+ tests covering core functionality
- **Integration Tests**: 33+ tests for API endpoints and workflows
- **RAG System Tests**: Enhanced market context and search integration
- **CI/CD Tests**: Selective test suite for reliable deployment
- **GPT Smoke Tests**: Real OpenAI API validation to catch model issues

## 🔐 **Security & Privacy**

### **Data Protection**
- **Tokenization**: Real account names never sent to AI
- **Session Management**: Secure authenticated user sessions
- **API Security**: Rate limiting and error handling
- **Database Security**: Prisma with connection pooling
- **RAG Security**: Secure search API integration

### **Authentication**
- **JWT Tokens**: Secure user authentication
- **Required Auth**: Financial data and analysis endpoints require a valid user token
- **Session Persistence**: Cross-request context maintenance

## 📈 **Performance & Optimization**

### **Cost Optimization for OpenAI API**

To optimize costs, we use different OpenAI models for different environments:

- **Production (`/app`)**: Uses the configured primary and fallback models
- **Tests**: Uses `gpt-3.5-turbo` for cost efficiency

### **Environment Variables for Model Selection**

```bash
# For production (default: gpt-4o)
OPENAI_MODEL=gpt-4o

# For tests (default: gpt-3.5-turbo)
OPENAI_MODEL=gpt-3.5-turbo
```

### **Cost Comparison**

| Model | Input Cost | Output Cost | Use Case |
|-------|------------|-------------|----------|
| gpt-4o | $5.00/1M tokens | $15.00/1M tokens | Production endpoints |
| gpt-3.5-turbo | $0.50/1M tokens | $1.50/1M tokens | Tests |

**Savings**: Using gpt-3.5-turbo for tests reduces costs by ~90% while maintaining test coverage.

### **GPT Model Smoke Testing**

To prevent issues like the GPT-5 prompt failures, we've implemented a comprehensive smoke testing strategy:

#### **Automated Tests (Unit Test Suite)**
- **Configuration Validation**: Ensures API keys and environment variables are properly set
- **Model Configuration**: Validates that the expected model (`gpt-4o`) is correctly configured
- **Environment Setup**: Checks that all required environment variables are present

#### **Manual Smoke Tests (Real API Validation)**
```bash
# Test real OpenAI API calls with current model
npm run test:gpt-smoke
```

This script:
- Makes actual API calls to validate model availability
- Tests prompt formatting and response generation
- Catches model-specific issues (like GPT-5 failures)
- Provides cost estimates for testing
- Runs outside the Jest environment to avoid mocking

**When to Run**:
- Before deploying model changes
- When switching between GPT models
- To validate API key functionality
- After OpenAI API updates or changes

### **Performance Features**
- **Caching**: Multi-level caching for market data
- **Database**: Efficient queries with Prisma
- **API**: Rate limiting and error handling
- **Frontend**: Optimized bundle size and loading
- **RAG System**: 30-minute search result caching

## 🚀 **Deployment**

### **Production Environment**
- **Frontend**: Vercel (automatic deployments)
- **Backend**: Render (with health checks)
- **Database**: PostgreSQL on Render
- **Environment**: Production-ready with monitoring

### **CI/CD Pipeline**
The project uses GitHub Actions for automated testing and deployment:

1. **Code Quality**: Linting and TypeScript compilation
2. **Security Audit**: npm audit for vulnerabilities
3. **Backend Tests**: Unit and integration tests
4. **Frontend Build**: Next.js build verification
5. **Integration Tests**: End-to-end workflow testing
6. **Deployment**: Automatic deployment to Vercel and Render

## 📚 **API Documentation**

### **Core Endpoints**

#### **Ask Questions**
```http
POST /ask/display-real
Content-Type: application/json
Authorization: Bearer <token>

{
  "question": "How can I improve my savings?"
}
```

#### **Plaid Integration**
```http
POST /plaid/create-link-token
GET /plaid/accounts
GET /plaid/transactions
```

#### **Market Data**
```http
GET /test/enhanced-market-context?tier=premium
POST /test/refresh-market-context
```

#### **User Management**
```http
POST /auth/register
POST /auth/login
GET /auth/profile
```

## 🎯 **Key Features**

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
- Responsive web interface
- Mobile-friendly design
- **Holistic financial advice** for any institution or product

## 📊 **Monitoring & Analytics**

### **Health Checks**
- Automated service monitoring
- Database connection verification
- API endpoint availability
- Performance metrics tracking

### **Error Tracking**
- Comprehensive error handling
- Detailed error logging
- Performance monitoring
- Uptime tracking

## 🔮 **Future Enhancements**

### **Phase 2: Vector Database**
- Store processed market insights in vector DB
- Semantic search for market context
- Historical trend analysis

### **Phase 3: Advanced Analytics**
- Market sentiment analysis
- Predictive modeling
- Personalized recommendations

### **Phase 4: Real-Time Updates**
- WebSocket connections for live updates
- Push notifications for market changes
- Real-time alert system

## 📝 **Project Structure**

```
finsight/
├── 📁 docs/                    # 📚 Documentation
│   ├── README.md               # Documentation index
│   ├── TESTING.md              # Comprehensive testing documentation
│   ├── FINANCIAL_TRUTH_CONTRACT.md
│   ├── DETERMINISTIC_LLM_CALCULATIONS.md
│   └── features/               # Feature-specific references
├── 📁 scripts/                 # 🔧 Utility scripts
│   ├── test-*.js/ts           # Testing scripts
│   ├── check-db.js            # Database utilities
│   ├── clear-*.js             # Cleanup scripts
│   ├── build.sh               # Build scripts
│   └── deploy-*.sh            # Deployment scripts
├── 📁 src/                    # ⚙️ Backend source code
│   ├── __tests__/             # Test suites
│   ├── auth/                  # Authentication system
│   ├── config/                # Configuration files
│   ├── data/                  # Data providers and orchestrator
│   └── index.ts               # Main server file
├── 📁 frontend/               # 🎨 Next.js frontend
│   ├── src/
│   │   ├── app/              # Next.js app router
│   │   ├── components/       # React components
│   │   └── lib/              # Utility functions
│   └── package.json
├── 📁 prisma/                 # 🗄️ Database schema and migrations
├── 📁 .github/                # 🔄 CI/CD workflows
└── 📄 Configuration files     # ⚙️ Project config
```

### **📚 Documentation**
- **`docs/`** - Comprehensive project documentation
- **`docs/README.md`** - Documentation index
- **`docs/TESTING.md`** - Comprehensive testing documentation and best practices
- **`docs/FINANCIAL_TRUTH_CONTRACT.md`** - Canonical financial data and calculation rules
- **Feature-specific docs** - Current implementation references under `docs/features/`

### **🔧 Scripts**
- **`scripts/`** - Utility scripts for development and deployment
- **Testing scripts** - Authentication, Plaid, API testing
- **Database scripts** - Health checks, cleanup, data management
- **Deployment scripts** - Build, deploy, verify processes
- **Cleanup scripts** - Environment maintenance

### Reset local environment
npm run reset

### Full clean build (matches CI)
npm run rebuild

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 **License**

This project is proprietary software. All rights reserved. This software and its documentation are owned by the project maintainer and may not be reproduced, distributed, or used without explicit permission.

## 🆘 **Support**

For support, please contact the development team or create an issue in the repository.

---

**Ask Linc** - Empowering users with AI-driven financial insights while maintaining the highest standards of privacy and security.
