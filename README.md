# Finsight

A personal finance assistant that connects to your financial accounts via Plaid, stores your data locally, and lets you ask questions about your finances using OpenAI (ChatGPT).

## Features
- Connect your bank accounts securely with Plaid
- Store and sync account and transaction data (SQLite via Prisma)
- Ask questions about your finances (OpenAI GPT-3.5)
- Simple Next.js frontend for easy interaction

---

## Getting Started

### Prerequisites
- Node.js (18+ recommended)
- npm
- Plaid developer account ([Plaid Dashboard](https://dashboard.plaid.com/))
- OpenAI API key ([OpenAI Platform](https://platform.openai.com/account/api-keys))

### 1. Clone the repo
```sh
git clone https://github.com/ethanteng/finsight.git
cd finsight
```

### 2. Setup environment variables
Copy the example file and fill in your keys:
```sh
cp .env.example .env
```
Edit `.env` and set your Plaid and OpenAI credentials.

### 3. Install dependencies
```sh
npm install
```

### 4. Setup the database
```sh
npx prisma migrate dev --name init
```

### 5. Start the backend
```sh
npm run start
```

### 6. Start the frontend
```sh
cd frontend
npm install
npm run dev
```
Visit [http://localhost:3001](http://localhost:3001) (or the port Next.js prints) in your browser.

---

## Environment Variables
See `.env.example` for all required variables.

- `PLAID_CLIENT_ID` - Your Plaid client ID
- `PLAID_SECRET` - Your Plaid secret
- `PLAID_ENV` - `sandbox` (default), `development`, or `production`
- `OPENAI_API_KEY` - Your OpenAI API key
- `DATABASE_URL` - SQLite DB path (default is fine for local dev)

---

## Deployment
- Backend can be deployed to any Node.js host (Vercel, Render, etc.)
- Frontend (Next.js) can be deployed to Vercel or similar
- For production, use Postgres or another production DB (see Prisma docs)

---

## License
MIT