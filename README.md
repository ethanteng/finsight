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

## 🧠 **Core Systems**

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

### **5. Demo System**
- **Purpose**: Risk-free user experience with realistic data
- **Features**:
    - Comprehensive mock financial data
    - Realistic rates and financial profiles
    - Full AI analysis with demo data + RAG system
    - Market context integration
    - No tokenization needed for fake data

## 🚀 **Quick Start**

### **Prerequisites**
- Node.js 18+
- PostgreSQL
- npm or yarn

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

# OpenAI
OPENAI_API_KEY="your_openai_api_key"

# Plaid
PLAID_CLIENT_ID="your_plaid_client_id"
PLAID_SECRET="your_plaid_secret"

# Market Data APIs
FRED_API_KEY="your_fred_api_key"
ALPHA_VANTAGE_API_KEY="your_alpha_vantage_api_key"

# Search API (for RAG system)
SEARCH_API_KEY="your_search_api_key"

# JWT Secret
JWT_SECRET="your_jwt_secret"
```

4. **Database Setup**
```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma db push

# (Optional) Seed with demo data
npm run seed
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

# Dual-data system tests
npm run test:dual-data

# Enhanced market context tests
npm run test:enhanced-market-context
```

### **Test Coverage**
- **Unit Tests**: 35+ tests covering core functionality
- **Integration Tests**: 33+ tests for API endpoints and workflows
- **RAG System Tests**: Enhanced market context and search integration
- **CI/CD Tests**: Selective test suite for reliable deployment

## 🔐 **Security & Privacy**

### **Data Protection**
- **Tokenization**: Real account names never sent to AI
- **Session Management**: Secure demo and user sessions
- **API Security**: Rate limiting and error handling
- **Database Security**: Prisma with connection pooling
- **RAG Security**: Secure search API integration

### **Authentication**
- **JWT Tokens**: Secure user authentication
- **Optional Auth**: Demo mode without authentication
- **Session Persistence**: Cross-request context maintenance

## 📈 **Performance & Optimization**

### **Cost Optimization for OpenAI API**

To optimize costs, we use different OpenAI models for different environments:

- **Production (`/app`, `/demo`)**: Uses `gpt-4o` for best quality
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

{
  "question": "How can I improve my savings?",
  "sessionId": "demo-session-123",
  "isDemo": true
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
GET /test/enhanced-market-context?tier=premium&isDemo=true
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
- Demo mode for testing without real data
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
├── src/                    # Backend source code
│   ├── __tests__/         # Test suites
│   ├── auth/              # Authentication system
│   ├── config/            # Configuration files
│   ├── data/              # Data providers and orchestrator
│   └── index.ts           # Main server file
├── frontend/              # Next.js frontend
│   ├── src/
│   │   ├── app/          # Next.js app router
│   │   ├── components/   # React components
│   │   └── lib/          # Utility functions
│   └── package.json
├── prisma/               # Database schema and migrations
├── .github/              # CI/CD workflows
└── docs/                 # Project documentation
```

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 **Support**

For support, please contact the development team or create an issue in the repository.

---

**Ask Linc** - Empowering users with AI-driven financial insights while maintaining the highest standards of privacy and security.
