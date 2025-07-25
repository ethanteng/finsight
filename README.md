# Linc

A personal finance assistant that connects to your financial accounts via Plaid and uses ChatGPT to answer questions about your finances with real-time market context.

## Features

- **Secure Account Connection** - Connect financial accounts securely via Plaid
- **Natural Language Queries** - Ask questions about your finances in plain English
- **AI-Powered Analysis** - Get insights based on your actual financial data
- **Real-Time Market Context** - Answers include current market conditions and rates
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

# Database
DATABASE_URL="postgresql://username:password@localhost:5432/linc"
```

## Project Structure

```
finsight/
├── src/                    # Backend source code
│   ├── index.ts           # Express server
│   ├── plaid.ts           # Plaid integration
│   └── openai.ts          # OpenAI integration
├── frontend/              # Next.js frontend
│   ├── src/app/           # App Router pages
│   ├── src/components/    # React components
│   └── src/lib/           # Utilities
├── prisma/                # Database schema
└── README.md
```

## Development

- **Backend**: Runs on `http://localhost:3000`
- **Frontend**: Runs on `http://localhost:3001`
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

## Pages

- `/` - Marketing landing page
- `/app` - Main application interface

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

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT