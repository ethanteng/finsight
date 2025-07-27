# Linc

A personal finance assistant that connects to your financial accounts via Plaid and uses ChatGPT to answer questions about your finances with real-time market context.

## Features

- **Secure Account Connection** - Connect financial accounts securely via Plaid
- **Natural Language Queries** - Ask questions about your finances in plain English
- **AI-Powered Analysis** - Get insights based on your actual financial data
- **Tier-Based Market Context** - Different levels of market data based on subscription tier
- **Privacy-First Design** - Complete data anonymization and user control
- **Beautiful Landing Page** - Professional marketing site with complete product information
- **Responsive Design** - Works seamlessly on desktop and mobile

## Tech Stack

- **Backend**: Node.js, TypeScript, Express.js
- **Frontend**: Next.js 15, React, TypeScript
- **Database**: PostgreSQL (production), SQLite (development)
- **ORM**: Prisma
- **Styling**: Tailwind CSS
- **APIs**: Plaid (financial data), OpenAI (ChatGPT)
- **Deployment**: Vercel (frontend), Render (backend)

## Prerequisites

- Node.js 18+
- PostgreSQL (for production) or SQLite (for development)
- Plaid account and API credentials
- OpenAI API key

## Quick Start

1. **Clone the repository:**
```bash
git clone https://github.com/ethanteng/finsight.git
cd finsight
```

2. **Install dependencies:**
```bash
npm install
cd frontend && npm install
```

3. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env with your API keys
```

4. **Set up the database:**
```bash
npx prisma migrate dev
```

5. **Start development servers:**
```bash
npm run dev
```

Visit [http://localhost:3001](http://localhost:3001) to see the landing page and [http://localhost:3001/app](http://localhost:3001/app) for the application.

## Environment Variables

Create a `.env` file in the root directory:

```env
# Plaid
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Data Feed APIs (for market context)
FRED_API_KEY=your_fred_api_key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key

# Database
DATABASE_URL="postgresql://username:password@localhost:5432/linc"
```

## Project Structure

```
finsight/
├── src/                    # Backend source code
│   ├── index.ts           # Express server
│   ├── plaid.ts           # Plaid integration
│   ├── openai.ts          # OpenAI integration
│   ├── privacy.ts         # Data anonymization
│   ├── sync.ts            # Data synchronization
│   └── data/              # Market data feeds
│       ├── types.ts       # Data type definitions
│       ├── cache.ts       # Caching layer
│       ├── orchestrator.ts # Data orchestration
│       └── providers/     # Data source providers
│           ├── fred.ts    # FRED API integration
│           └── alpha-vantage.ts # Alpha Vantage integration
├── frontend/              # Next.js frontend
│   ├── src/app/           # App Router pages
│   ├── src/components/    # React components
│   └── src/lib/           # Utilities
├── prisma/                # Database schema
└── README.md
```

## Data Feed Architecture

The application uses a scalable, plugin-based architecture for market data feeds:

### **Tier-Based Access**
- **Starter Tier**: No external market data
- **Standard Tier**: Basic economic indicators (CPI, Fed rates, mortgage rates)
- **Premium Tier**: Live market data (CD rates, Treasury yields, real-time rates)

### **Data Sources**
- **FRED API**: Economic indicators from Federal Reserve Economic Data
- **Alpha Vantage**: Real-time market data (requires paid plan)
- **Caching Layer**: In-memory cache with configurable TTL
- **Fallback Data**: Mock data when APIs are unavailable

### **Architecture Benefits**
- **Scalable**: Easy to add new data providers
- **Resilient**: Graceful degradation when APIs fail
- **Privacy-Safe**: Market data never sent to frontend
- **Tier-Aware**: Different data access based on subscription level

## Development

- **Backend**: Runs on `http://localhost:3000`
- **Frontend**: Runs on `http://localhost:3001`

### **Testing Data Feeds**
```bash
# Test Standard tier market data
curl http://localhost:3000/test/market-data/standard

# Test Premium tier market data  
curl http://localhost:3000/test/market-data/premium
```
- **Database**: Local PostgreSQL via Docker (see setup below)

### Local Database Setup

For local development with PostgreSQL:

```bash
# Start PostgreSQL with Docker
docker run --name postgres-linc -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=linc -p 5432:5432 -d postgres

# Update .env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/linc"

# Run migrations
npx prisma migrate dev
```

## Deployment

### Frontend (Vercel)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_API_URL`: Your backend URL
3. Deploy automatically on push to main

### Backend (Render)

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set environment variables:
   - `PLAID_CLIENT_ID`
   - `PLAID_SECRET`
   - `PLAID_ENV`
   - `OPENAI_API_KEY`
   - `DATABASE_URL`
4. Set build command: `npm install`
5. Set start command: `npm start`

## API Endpoints

- `GET /health` - Health check
- `POST /plaid/create_link_token` - Create Plaid Link token
- `POST /plaid/exchange_public_token` - Exchange public token for access token
- `POST /plaid/sync_accounts` - Sync accounts from Plaid
- `POST /plaid/sync_transactions` - Sync transactions from Plaid
- `POST /ask` - Ask financial questions (requires OpenAI API key)
- `GET /privacy/data` - Get user data summary (anonymized)
- `DELETE /privacy/delete-all` - Delete all user data
- `POST /privacy/disconnect-accounts` - Disconnect all Plaid accounts

## Pages

- `/` - Marketing landing page
- `/app` - Main application interface
- `/privacy` - Privacy dashboard and data controls
- `/privacy-policy` - Privacy policy
- `/profile` - Account management and sync status

## Features in Detail

### Landing Page
- Professional marketing site with complete product information
- Hero section with value proposition
- Feature explanations and pricing
- Trust & security information
- FAQ section

### Application Interface
- Account connection via Plaid Link
- Data synchronization (accounts and transactions)
- Natural language Q&A interface
- Real-time financial analysis

### Privacy & Security
- **Data Anonymization** - All sensitive data is tokenized before AI analysis
- **Complete User Control** - View, export, or delete all data anytime
- **Read-Only Access** - No ability to make transactions or move money
- **GDPR Compliance** - Full data deletion and export capabilities
- **Transparency** - See exactly what data we store about you

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT